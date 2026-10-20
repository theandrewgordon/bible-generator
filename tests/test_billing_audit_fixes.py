"""Billing audit 2026-10-14: every simulated failure scenario, now fixed."""

import hashlib
import hmac
import json
import time
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock

import app
import faithsparks.services.usage as usage
import faithsparks.services.users as users
import faithsparks.views.billing as billing
import os, sys  # noqa: E401
sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

SECRET = "whsec_test"
PRICES = {
    "STRIPE_PRICE_FAMILY_MONTHLY": "price_fam_m",
    "STRIPE_PRICE_FAMILY_ANNUAL": "price_fam_y",
    "STRIPE_PRICE_CLASSROOM_MONTHLY": "price_cls_m",
    "STRIPE_PRICE_CLASSROOM_ANNUAL": "price_cls_y",
    "STRIPE_PRICE_FAMILY": None,
    "STRIPE_PRICE_CLASSROOM": None,
}


def _sub(sub_id, customer, price, status="active"):
    return {"id": sub_id, "customer": customer, "status": status, "metadata": {},
            "items": {"data": [{"id": "si_" + sub_id, "price": {"id": price}, "current_period_end": int(time.time()) + 86400}]}}


class BillingTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore()
        self.subs = {}
        self.created = []
        self.customers = []
        self.open_checkouts = []
        def page(data):
            return SimpleNamespace(auto_paging_iter=lambda: iter(data))
        def list_subs(customer, **kwargs):
            return page([sub for sub in self.subs.values() if sub.get("customer") == customer])
        fake_stripe = SimpleNamespace(
            Webhook=SimpleNamespace(construct_event=self._construct),
            Customer=SimpleNamespace(list=lambda **k: page(self.customers), create=mock.Mock(side_effect=lambda **k: {"id": "cus_" + k["email"].split("@")[0]})),
            billing_portal=SimpleNamespace(Session=SimpleNamespace(create=mock.Mock(return_value=SimpleNamespace(url="https://billing.stripe.test/s")))),
            Subscription=SimpleNamespace(list=list_subs, retrieve=lambda sid, **k: self.subs[sid], modify=mock.Mock()),
            checkout=SimpleNamespace(Session=SimpleNamespace(create=self._create, retrieve=mock.Mock(),
                list=lambda **k: page([c for c in self.open_checkouts if c["customer"] == k["customer"]]), expire=mock.Mock())),
            Price=SimpleNamespace(retrieve=mock.Mock(return_value={"unit_amount": 500, "currency": "usd"})),
        )
        self.patches = [
            mock.patch.object(billing, "db", self.db),
            mock.patch.object(usage, "db", self.db),
            mock.patch.object(users, "db", self.db),
            mock.patch.object(billing, "stripe", fake_stripe),
            mock.patch.object(billing, "STRIPE_WEBHOOK_SECRET", SECRET),
            mock.patch.object(billing, "STRIPE_SECRET_KEY", "sk_test_x"),
        ] + [mock.patch.object(billing, name, value) for name, value in PRICES.items()]
        for patch in self.patches:
            patch.start()
        billing.PRICE_KIND_MAP = billing._price_kind_map()
        billing._PRICE_META_CACHE.clear()
        transaction_patch = mock.patch.object(billing.firestore, "transactional", lambda fn: fn)
        transaction_patch.start()
        self.addCleanup(transaction_patch.stop)
        self.db.transaction = lambda: SimpleNamespace(set=lambda ref, data, merge=True: ref.set(data, merge=merge))
        self.client = app.app.test_client()

    def tearDown(self):
        for patch in reversed(self.patches):
            patch.stop()
        billing.PRICE_KIND_MAP = billing._price_kind_map()

    # Stripe stand-ins
    def _construct(self, payload, sig, secret):
        if sig != hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest():
            raise ValueError("bad signature")
        return json.loads(payload)

    def _create(self, **kwargs):
        self.created.append(kwargs)
        self.open_checkouts.append({"id": "cs_new", "customer": kwargs["customer"],
            "mode": "subscription", "metadata": kwargs["metadata"], "url": "https://checkout.stripe.test/s"})
        return SimpleNamespace(url="https://checkout.stripe.test/s")

    def send(self, event):
        body = json.dumps(event).encode()
        sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post("/stripe/webhook", data=body, headers={"Stripe-Signature": sig})

    def completed(self, email, sub_id, customer, price, status="active", event_id=None):
        self.subs[sub_id] = _sub(sub_id, customer, price, status)
        return self.send({"id": event_id or f"evt_c_{sub_id}_{time.time_ns()}", "type": "checkout.session.completed",
                          "data": {"object": {"id": f"cs_{sub_id}", "customer_details": {"email": email},
                                              "subscription": sub_id, "customer": customer, "metadata": {}}}})

    def sub_event(self, kind, sub):
        self.subs[sub["id"]] = sub
        return self.send({"id": f"evt_{kind}_{sub['id']}_{time.time_ns()}", "type": f"customer.subscription.{kind}",
                          "data": {"object": sub}})


class WebhookTests(BillingTestCase):
    def test_classroom_gets_classroom_plan_and_quota(self):
        self.completed("teacher@x.com", "sub_1", "cus_1", "price_cls_m")
        user = self.db.user("teacher@x.com")
        self.assertEqual(user["plan"], "classroom")
        self.assertEqual(usage._quota_for_plan(user["plan"])[0], usage._quota_for_plan("classroom")[0])

    def test_failed_fulfillment_asks_stripe_to_retry(self):
        self.db.fail_collections.add("users")
        response = self.completed("paid@x.com", "sub_3", "cus_3", "price_fam_y")
        self.assertEqual(response.status_code, 500)
        self.db.fail_collections.clear()
        self.assertEqual(self.completed("paid@x.com", "sub_3", "cus_3", "price_fam_y").status_code, 200)
        self.assertTrue(self.db.user("paid@x.com")["isPro"])

    def test_unpaid_and_paused_remove_plus_but_past_due_is_grace(self):
        self.completed("fam@x.com", "sub_1", "cus_1", "price_fam_m")
        self.sub_event("updated", _sub("sub_1", "cus_1", "price_fam_m", "past_due"))
        self.assertTrue(self.db.user("fam@x.com")["isPro"])
        for status in ("unpaid", "paused"):
            self.sub_event("updated", _sub("sub_1", "cus_1", "price_fam_m", status))
            self.assertFalse(self.db.user("fam@x.com")["isPro"], status)
        self.sub_event("updated", _sub("sub_1", "cus_1", "price_fam_m", "active"))
        self.assertTrue(self.db.user("fam@x.com")["isPro"])

    def test_replayed_checkout_after_cancel_does_not_regrant(self):
        self.completed("fam@x.com", "sub_2", "cus_2", "price_fam_m")
        self.sub_event("deleted", _sub("sub_2", "cus_2", "price_fam_m", "canceled"))
        self.assertFalse(self.db.user("fam@x.com")["isPro"])
        self.subs["sub_2"]["status"] = "canceled"  # Stripe's truth when the old event is retried
        self.send({"id": "evt_replay", "type": "checkout.session.completed",
                   "data": {"object": {"id": "cs_sub_2", "customer_details": {"email": "fam@x.com"},
                                       "subscription": "sub_2", "customer": "cus_2", "metadata": {}}}})
        self.assertFalse(self.db.user("fam@x.com")["isPro"])

    def test_duplicate_event_is_processed_once(self):
        self.completed("fam@x.com", "sub_d", "cus_d", "price_fam_m", event_id="evt_same")
        self.db.store["users"]["fam@x.com"]["isPro"] = False  # e.g. admin changed it since
        self.completed("fam@x.com", "sub_d", "cus_d", "price_fam_m", event_id="evt_same")
        self.assertFalse(self.db.user("fam@x.com")["isPro"])

    def test_cancelling_an_old_subscription_keeps_the_current_one(self):
        self.completed("dup@x.com", "sub_m", "cus_d", "price_fam_m")
        self.completed("dup@x.com", "sub_y", "cus_d", "price_fam_y")
        self.sub_event("deleted", _sub("sub_m", "cus_d", "price_fam_m", "canceled"))
        user = self.db.user("dup@x.com")
        self.assertTrue(user["isPro"])
        self.assertEqual(user["subscriptionId"], "sub_y")

    def test_delayed_active_event_cannot_restore_canceled_subscription(self):
        self.completed("fam@x.com", "sub_delay", "cus_delay", "price_fam_m")
        self.sub_event("deleted", _sub("sub_delay", "cus_delay", "price_fam_m", "canceled"))
        self.send({"id": "evt_delayed", "type": "customer.subscription.updated",
                   "data": {"object": _sub("sub_delay", "cus_delay", "price_fam_m", "active")}})
        self.assertFalse(self.db.user("fam@x.com")["isPro"])

    def test_missing_secret_is_an_error_not_a_silent_200(self):
        with mock.patch.object(billing, "STRIPE_WEBHOOK_SECRET", ""):
            self.assertEqual(self.completed("x@x.com", "sub_4", "cus_4", "price_fam_m").status_code, 500)

    def test_new_api_invoice_shape_reaches_conversion(self):
        self.completed("fam@x.com", "sub_5", "cus_5", "price_fam_m")
        invoice = {"billing_reason": "subscription_cycle", "amount_paid": 500,
                   "parent": {"subscription_details": {"subscription": "sub_5"}}}
        self.send({"id": "evt_inv", "type": "invoice.payment_succeeded", "data": {"object": invoice}})
        self.assertIn("firstConversionAt", self.db.user("fam@x.com"))
        self.assertIn("renewAt", self.db.user("fam@x.com"))  # read from subscription items

    def test_cancelled_gifted_member_keeps_gift(self):
        self.completed("g@x.com", "sub_g", "cus_g", "price_fam_m")
        self.db.store["users"]["g@x.com"].update({"gifted": True, "giftExpiresAt": None})
        self.sub_event("deleted", _sub("sub_g", "cus_g", "price_fam_m", "canceled"))
        self.assertTrue(self.db.user("g@x.com")["isPro"])


class CheckoutTests(BillingTestCase):
    def setUp(self):
        super().setUp()
        signed_in = mock.patch.object(app, "google", SimpleNamespace(authorized=True))
        signed_in.start()
        self.addCleanup(signed_in.stop)

    def checkout(self, email, price, **extra):
        with self.client.session_transaction() as sess:
            sess["user_email"] = email
            sess["user_info"] = {"email": email}
            sess["user_owned_packs"] = ["-"]
            sess[app.CSRF_SESSION_KEY] = "t"
        return self.client.post("/create_checkout_session", data={"price_id": price, "csrf_token": "t", **extra})

    def test_unknown_price_is_refused(self):
        response = self.checkout("a@x.com", "price_SOME_OLD_1_DOLLAR")
        self.assertIn("/plus", response.location)
        self.assertEqual(self.created, [])
        self.assertIn("checkout.stripe.test", self.checkout("a@x.com", "price_fam_m").location)

    def test_member_with_subscription_is_sent_to_billing_not_checkout(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m")
        response = self.checkout("m@x.com", "price_fam_y")
        self.assertIn("billing.stripe.test", response.location)
        self.assertEqual(self.created, [])

    def test_same_plan_does_not_create_checkout_or_update(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m")
        self.checkout("m@x.com", "price_fam_m")
        params = billing.stripe.billing_portal.Session.create.call_args.kwargs
        self.assertNotIn("flow_data", params)
        self.assertEqual(self.created, [])

    def test_upgrade_confirms_replacement_of_existing_item(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m")
        self.checkout("m@x.com", "price_cls_m")
        flow = billing.stripe.billing_portal.Session.create.call_args.kwargs["flow_data"]
        self.assertEqual(flow["type"], "subscription_update_confirm")
        self.assertEqual(flow["subscription_update_confirm"], {
            "subscription": "sub_1",
            "items": [{"id": "si_sub_1", "price": "price_cls_m", "quantity": 1}],
        })
        self.assertEqual(self.created, [])

    def test_stripe_lookup_catches_missing_local_subscription(self):
        self.customers.append({"id": "cus_old"})
        self.subs["sub_old"] = _sub("sub_old", "cus_old", "price_fam_m")
        self.checkout("missing@x.com", "price_cls_m")
        self.assertEqual(self.created, [])
        self.assertEqual(self.db.user("missing@x.com")["subscriptionId"], "sub_old")

    def test_repeat_checkout_reuses_customer_and_session(self):
        self.checkout("new@x.com", "price_fam_m")
        self.checkout("new@x.com", "price_fam_m")
        self.assertEqual(len(self.created), 1)
        self.assertEqual(self.created[0]["customer"], "cus_new")
        self.assertNotIn("customer_email", self.created[0])

    def test_other_plan_expires_old_checkout(self):
        self.checkout("new@x.com", "price_fam_m")
        self.checkout("new@x.com", "price_cls_m")
        billing.stripe.checkout.Session.expire.assert_called_once_with("cs_new")
        self.assertEqual(len(self.created), 2)

    def test_expiration_race_does_not_create_second_checkout(self):
        self.checkout("new@x.com", "price_fam_m")
        billing.stripe.checkout.Session.expire.side_effect = RuntimeError("Already completed")
        self.checkout("new@x.com", "price_cls_m")
        self.assertEqual(len(self.created), 1)

    def test_lookup_failure_does_not_charge(self):
        billing.stripe.Customer.list = mock.Mock(side_effect=RuntimeError("Stripe unavailable"))
        self.checkout("new@x.com", "price_fam_m")
        self.assertEqual(self.created, [])

    def test_existing_duplicates_block_further_checkout(self):
        self.customers.extend([{"id": "cus_a"}, {"id": "cus_b"}])
        self.subs["sub_a"] = _sub("sub_a", "cus_a", "price_fam_m")
        self.subs["sub_b"] = _sub("sub_b", "cus_b", "price_cls_m")
        self.checkout("dup@x.com", "price_cls_m")
        self.assertEqual(self.created, [])
        billing.stripe.billing_portal.Session.create.assert_not_called()

    def test_concurrent_request_is_blocked(self):
        self.db.collection("billing_locks").document("busy@x.com").set({"expires": time.time() + 60})
        self.checkout("busy@x.com", "price_fam_m")
        self.assertEqual(self.created, [])

    def test_storage_failure_does_not_charge(self):
        self.db.fail_collections.add("users")
        self.checkout("new@x.com", "price_fam_m")
        self.assertEqual(self.created, [])

    def test_completion_between_subscription_and_session_lookup_is_blocked(self):
        calls = []
        def list_subs(**kwargs):
            calls.append(kwargs)
            subs = [] if len(calls) == 1 else [_sub("sub_race", "cus_old", "price_fam_m")]
            return SimpleNamespace(auto_paging_iter=lambda: iter(subs))
        self.customers.append({"id": "cus_old"})
        billing.stripe.Subscription.list = list_subs
        self.checkout("new@x.com", "price_cls_m")
        self.assertEqual(self.created, [])

    def test_unpaid_subscription_requires_resolution_not_new_checkout(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m", status="unpaid")
        self.checkout("m@x.com", "price_cls_m")
        params = billing.stripe.billing_portal.Session.create.call_args.kwargs
        self.assertNotIn("flow_data", params)
        self.assertEqual(self.created, [])

    def test_canceled_subscription_can_start_again(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m", status="canceled")
        self.checkout("m@x.com", "price_cls_m")
        self.assertEqual(self.created[0]["customer"], "cus_1")

    def test_portal_failure_never_falls_back_to_new_subscription(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m")
        billing.stripe.billing_portal.Session.create.side_effect = RuntimeError("Portal unavailable")
        self.checkout("m@x.com", "price_cls_m")
        self.assertEqual(self.created, [])

    def test_existing_subscription_expires_old_checkout_tabs(self):
        self.completed("m@x.com", "sub_1", "cus_1", "price_fam_m")
        self.open_checkouts.append({"id": "cs_old", "customer": "cus_1", "mode": "subscription"})
        self.checkout("m@x.com", "price_cls_m")
        billing.stripe.checkout.Session.expire.assert_called_once_with("cs_old")
        self.assertEqual(self.created, [])

    def test_abandoned_checkout_does_not_disqualify_first_trial(self):
        with mock.patch.object(billing, "PLUS_MONTH_TRIAL_CODES", {"try30"}):
            self.checkout("new@x.com", "price_fam_m")
            self.open_checkouts.clear()  # Original checkout expired without payment.
            self.checkout("new@x.com", "price_fam_m", trial_token="try30")
            self.assertEqual(self.created[-1]["subscription_data"]["trial_period_days"], 30)

    def test_historical_paid_subscription_disqualifies_trial(self):
        self.customers.append({"id": "cus_old"})
        self.subs["sub_old"] = _sub("sub_old", "cus_old", "price_fam_m", "canceled")
        with mock.patch.object(billing, "PLUS_MONTH_TRIAL_CODES", {"try30"}):
            self.checkout("old@x.com", "price_fam_m", trial_token="try30")
            self.assertNotIn("trial_period_days", self.created[-1]["subscription_data"])

    def test_trial_only_for_first_time_members(self):
        with mock.patch.object(billing, "PLUS_MONTH_TRIAL_CODES", {"try30"}):
            self.checkout("new@x.com", "price_fam_m", trial_token="try30")
            self.assertEqual(self.created[-1]["subscription_data"].get("trial_period_days"), 30)
            self.db.collection("users").document("old@x.com").set({"trialStartedAt": datetime.now(timezone.utc)})
            self.checkout("old@x.com", "price_fam_m", trial_token="try30")
            self.assertNotIn("trial_period_days", self.created[-1]["subscription_data"])

    def test_price_lookups_are_cached(self):
        self.client.get("/plus")
        self.client.get("/plus")
        self.assertLessEqual(billing.stripe.Price.retrieve.call_count, 4)


class UsageAndGiftTests(BillingTestCase):
    def test_gift_end_keeps_paying_member_on_their_plan(self):
        self.completed("payer@x.com", "sub_9", "cus_9", "price_cls_y")
        self.db.store["users"]["payer@x.com"].update(
            {"gifted": True, "plan": "family", "giftExpiresAt": datetime(2020, 1, 1, tzinfo=timezone.utc)})
        with app.app.test_request_context("/"):
            self.assertEqual(usage._get_user_plan("payer@x.com"), "classroom")
        self.assertTrue(self.db.user("payer@x.com")["isPro"])

    def test_existing_classroom_subscribers_get_classroom_quota(self):
        self.db.collection("users").document("old-cls@x.com").set({"isPro": True, "plan": "plus", "priceId": "price_cls_y"})
        with mock.patch("faithsparks.services.stripe_svc.STRIPE_PRICE_CLASSROOM_ANNUAL", "price_cls_y"), \
                app.app.test_request_context("/"):
            self.assertEqual(usage._get_user_plan("old-cls@x.com"), "classroom")

    def test_gift_end_without_subscription_returns_to_free(self):
        self.assertEqual(users.gift_end_update({"gifted": True})["isPro"], False)

    def test_usage_uses_atomic_increments(self):
        with app.app.test_request_context("/"):
            usage._update_usage("u@x.com", 2)
            usage._update_usage("u@x.com", 3)
        self.assertEqual(self.db.user("u@x.com")["usage"]["lifetime"], 5)

    def test_one_free_verse_no_longer_makes_a_batch_free(self):
        source = open(app.__file__.replace("app.py", "faithsparks/views/worksheets.py"), encoding="utf-8").read()
        self.assertIn("_reserve_usage(user_email", source)
        self.assertIn("_refund_usage(user_email", source)
        self.assertNotIn("if not free_skip_count and not is_daily_proverb:", source)


class ReferralTests(BillingTestCase):
    def test_free_month_is_added_alongside_existing_discount(self):
        self.db.collection("users").document("ref@x.com").set({"subscriptionId": "sub_r", "stripeCustomerId": "cus_r"})
        self.subs["sub_r"] = {"id": "sub_r", "discounts": ["di_lifetime25"]}
        with mock.patch.dict("os.environ", {"STRIPE_REFERRAL_COUPON_ID": "co_free"}), app.app.test_request_context("/"):
            self.assertTrue(billing._grant_referral_reward("ref@x.com"))
        kwargs = billing.stripe.Subscription.modify.call_args.kwargs
        self.assertEqual(kwargs["discounts"], [{"discount": "di_lifetime25"}, {"coupon": "co_free"}])
        self.assertNotIn("coupon", kwargs)


if __name__ == "__main__":
    unittest.main()
