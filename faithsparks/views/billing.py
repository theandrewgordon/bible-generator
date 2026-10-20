import os
import hashlib
import time
import uuid
import traceback
from datetime import datetime, timezone
from typing import Optional, Tuple

from firebase_admin import firestore
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app, g

from faithsparks.services.firestore import db
from faithsparks.services.stripe_svc import (
    stripe,
    STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_PRICE_FAMILY,
    STRIPE_PRICE_CLASSROOM,
    STRIPE_PRICE_FAMILY_MONTHLY,
    STRIPE_PRICE_FAMILY_ANNUAL,
    STRIPE_PRICE_CLASSROOM_MONTHLY,
    STRIPE_PRICE_CLASSROOM_ANNUAL,
    STRIPE_PRICE_FAMILY_GAME_NIGHT,
    STRIPE_WEBHOOK_SECRET,
    resolve_price_id,
)
from faithsparks.services.users import (
    SUBSCRIPTION_ACCESS_STATUSES,
    has_active_plus,
    has_family_game_night_access,
)

def _find_promotion_code_id(code_str: Optional[str]) -> Optional[str]:
    if not code_str or not stripe:
        return None
    try:
        res = stripe.PromotionCode.list(code=code_str.strip(), active=True, limit=1)
        return res.data[0].id if res.data else None
    except Exception:
        traceback.print_exc()
        return None

def _parse_codes(env_var: str) -> set[str]:
    raw = os.getenv(env_var) or ""
    return {c.strip().lower() for c in raw.split(",") if c.strip()}


PLUS_MONTH_TRIAL_CODES = _parse_codes("PLUS_MONTH_TRIAL_CODES")
PLUS_YEAR_TRIAL_CODES = _parse_codes("PLUS_YEAR_TRIAL_CODES") or set()
PLUS_YEAR_TRIAL_CODES.update(_parse_codes("PLUS_TRIAL_CODES"))


def _trial_kind(token: str) -> Optional[str]:
    if not token:
        return None
    t = token.strip().lower()
    if t in PLUS_MONTH_TRIAL_CODES:
        return "month"
    if t in PLUS_YEAR_TRIAL_CODES:
        return "year"
    return None


def _price_kind_map() -> dict[str, Tuple[str, str]]:
    mapping: dict[str, Tuple[str, str]] = {}

    def _add(pid: Optional[str], plan: str, interval: str) -> None:
        if pid:
            mapping[pid.strip().lower()] = (plan, interval)

    _add(STRIPE_PRICE_FAMILY_MONTHLY, "family", "month")
    _add(STRIPE_PRICE_FAMILY_ANNUAL, "family", "year")
    _add(STRIPE_PRICE_CLASSROOM_MONTHLY, "classroom", "month")
    _add(STRIPE_PRICE_CLASSROOM_ANNUAL, "classroom", "year")
    # Legacy single prices (still offered when monthly/annual aren't configured).
    _add(STRIPE_PRICE_FAMILY, "family", "single")
    _add(STRIPE_PRICE_CLASSROOM, "classroom", "single")

    return mapping


PRICE_KIND_MAP = _price_kind_map()


def _classify_price(price_id: str) -> Optional[Tuple[str, str]]:
    if not price_id:
        return None
    return PRICE_KIND_MAP.get(price_id.strip().lower())


def _plan_display_label(plan: Optional[str], interval: Optional[str]) -> str:
    base_map = {
        "family": "Faith Sparks Plus Family",
        "classroom": "Faith Sparks Plus Classroom",
    }
    interval_map = {"month": "Monthly", "year": "Annual"}
    base = base_map.get(plan or "", "Faith Sparks Plus")
    if interval:
        pretty_interval = interval_map.get(interval, interval.title())
        return f"{base} ({pretty_interval})"
    return base


def _trial_days_for(token: str, price_id: str) -> Optional[Tuple[int, str]]:
    kind = _trial_kind(token)
    if not kind:
        return None
    price_info = _classify_price(price_id)
    if not price_info:
        return None
    plan, interval = price_info
    if kind == "month":
        return 30, kind
    if kind == "year" and interval == "year" and plan == "family":
        return 365, kind
    return None

bp = Blueprint("billing", __name__)

FAMILY_GAME_NIGHT_ENTITLEMENT = "family_game_night"
ALLOWED_ONE_TIME_ENTITLEMENTS = {FAMILY_GAME_NIGHT_ENTITLEMENT}

REFERRAL_INVITE_CODE = "freesparkmonth"
REFERRAL_TARGET_COUNT = 3


def _stripe_dict(value):
    """Normalize Stripe SDK resources before using mapping operations."""
    if isinstance(value, dict):
        return value
    for method_name in ("to_dict", "to_dict_recursive"):
        converter = getattr(value, method_name, None)
        if callable(converter):
            converted = converter()
            if isinstance(converted, dict):
                return converted
    return value


def _increment_metric(metric: str, key: Optional[str] = None) -> None:
    if not db or not metric:
        return
    key_val = (key or "unknown").strip().lower() or "unknown"
    try:
        bucket = db.collection("analytics").document(metric)
        bucket.set({"total": firestore.Increment(1), "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        bucket.collection("by_key").document(key_val).set(
            {
                "key": key_val,
                "count": firestore.Increment(1),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        traceback.print_exc()


def _record_referral_completion(referrer_email: Optional[str], redeemer_email: Optional[str]) -> None:
    """Track successful redemptions and grant rewards when thresholds are hit."""
    if not db or not referrer_email or not redeemer_email:
        return
    referrer_email = referrer_email.strip().lower()
    redeemer_email = redeemer_email.strip().lower()
    if not referrer_email or not redeemer_email or referrer_email == redeemer_email:
        return

    referral_doc = db.collection("referrals").document(referrer_email)
    transaction = db.transaction()

    @firestore.transactional
    def _txn(txn):
        snapshot = referral_doc.get(transaction=txn)
        data = snapshot.to_dict() or {}
        redeemers: list[str] = list(data.get("redeemers") or [])
        if redeemer_email in redeemers:
            return len(redeemers), bool(data.get("rewardGranted"))
        redeemers.append(redeemer_email)
        update_payload = {
            "referrer": referrer_email,
            "redeemers": redeemers,
            "count": len(redeemers),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        txn.set(referral_doc, update_payload, merge=True)
        return len(redeemers), bool(data.get("rewardGranted"))

    try:
        count, reward_granted = _txn(transaction)
    except Exception:
        traceback.print_exc()
        return

    if count >= REFERRAL_TARGET_COUNT and not reward_granted:
        if _grant_referral_reward(referrer_email):
            try:
                referral_doc.set(
                    {
                        "rewardGranted": True,
                        "rewardGrantedAt": firestore.SERVER_TIMESTAMP,
                        "count": count,
                    },
                    merge=True,
                )
            except Exception:
                traceback.print_exc()


def _grant_referral_reward(referrer_email: str) -> bool:
    """Apply a one-time 100% coupon to the referrer's next invoice."""
    if not stripe or not STRIPE_SECRET_KEY or not db:
        return False
    try:
        user_doc = db.collection("users").document(referrer_email).get()
    except Exception:
        traceback.print_exc()
        return False
    if not user_doc or not user_doc.exists:
        return False
    info = user_doc.to_dict() or {}
    subscription_id = (info.get("subscriptionId") or "").strip()
    customer_id = (info.get("stripeCustomerId") or "").strip()
    if not subscription_id and not customer_id:
        return False

    coupon_id = (os.getenv("STRIPE_REFERRAL_COUPON_ID") or "").strip()
    coupon_created = False
    try:
        if not coupon_id:
            coupon = stripe.Coupon.create(
                duration="once",
                percent_off=100,
                name="Referral Bonus FreeSparkMonth",
            )
            coupon = _stripe_dict(coupon)
            coupon_id = coupon.get("id") or ""
            coupon_created = True
    except Exception:
        traceback.print_exc()
        return False

    if not coupon_id:
        return False

    try:
        if not subscription_id:
            # Only subscriptions can carry the free month; nothing to discount otherwise.
            raise ValueError("referrer has no subscription")
        # Add the free month *alongside* existing discounts (e.g. 25% for life):
        # setting ``coupon=`` would replace them.
        live = _stripe_dict(stripe.Subscription.retrieve(subscription_id))
        existing = []
        for item in live.get("discounts") or []:
            discount_id = item.get("id") if isinstance(item, dict) else item
            if discount_id:
                existing.append({"discount": discount_id})
        if not existing and (live.get("discount") or {}).get("id"):
            existing.append({"discount": live["discount"]["id"]})
        stripe.Subscription.modify(subscription_id, discounts=existing + [{"coupon": coupon_id}])
    except Exception:
        traceback.print_exc()
        if coupon_created:
            try:
                stripe.Coupon.delete(coupon_id)
            except Exception:
                pass
        return False
    return True


def _sellable_price(price_id: str) -> bool:
    """Only the Plus prices configured for this site can be bought as Plus."""
    return bool(price_id) and _classify_price(price_id) is not None


def _has_paid_subscription(data: dict) -> bool:
    return bool(data.get("subscriptionId")) and str(data.get("subscriptionStatus") or "active").lower() in ACCESS_STATUSES


_PRICE_META_CACHE: dict[str, tuple[float, Optional[dict]]] = {}
_PRICE_META_TTL = 3600.0


def _cached_price_meta(pid: Optional[str]) -> Optional[dict]:
    """Price amounts for /plus, cached an hour (was 4 Stripe calls per page view)."""
    import time
    if not pid or not stripe:
        return None
    hit = _PRICE_META_CACHE.get(pid)
    if hit and time.monotonic() - hit[0] < _PRICE_META_TTL:
        return hit[1]
    try:
        p = _stripe_dict(stripe.Price.retrieve(pid))
        meta = {
            "amount": (p.get("unit_amount") or 0) / 100.0,
            "currency": (p.get("currency") or "usd").upper(),
            "recurring": (p.get("recurring") or {}).get("interval"),
        }
    except Exception:
        return None  # don't cache failures
    _PRICE_META_CACHE[pid] = (time.monotonic(), meta)
    return meta


def plus_pricing():
    # Capture share link parameters and persist for checkout + analytics.
    incoming_params = {}
    param_map = {
        "invite": "invite",
        "promo": "promo",
        "plan": "plan",
        "interval": "interval",
        "utm": "utm",
        "ref": "referrer",
    }
    for key, session_key in param_map.items():
        raw_val = request.args.get(key)
        cleaned = (raw_val or "").strip()
        if cleaned:
            if session_key == "referrer":
                session[session_key] = cleaned.lower()
            else:
                session[session_key] = cleaned
            incoming_params[key] = cleaned

    if incoming_params.get("utm"):
        utm_val = incoming_params["utm"].strip().lower()
        if utm_val:
            _increment_metric("plus_clicks", utm_val)

    prices = {
        "family": {
            "monthly": STRIPE_PRICE_FAMILY_MONTHLY,
            "annual": STRIPE_PRICE_FAMILY_ANNUAL,
            "single": STRIPE_PRICE_FAMILY,
        },
        "classroom": {
            "monthly": STRIPE_PRICE_CLASSROOM_MONTHLY,
            "annual": STRIPE_PRICE_CLASSROOM_ANNUAL,
            "single": STRIPE_PRICE_CLASSROOM,
        },
    }
    meta = {"family": {}, "classroom": {}}

    _price_meta = _cached_price_meta

    try:
        fam_m = _price_meta(prices["family"].get("monthly"))
        fam_y = _price_meta(prices["family"].get("annual"))
        if fam_m:
            meta["family"]["monthly"] = fam_m
        if fam_y:
            meta["family"]["annual"] = fam_y
        if fam_m and fam_y and fam_m.get("amount"):
            m12 = fam_m["amount"] * 12.0
            save = max(0.0, 1.0 - (fam_y["amount"] / m12))
            meta["family"]["save_pct"] = round(save * 100)
        cls_m = _price_meta(prices["classroom"].get("monthly"))
        cls_y = _price_meta(prices["classroom"].get("annual"))
        if cls_m:
            meta["classroom"]["monthly"] = cls_m
        if cls_y:
            meta["classroom"]["annual"] = cls_y
        if cls_m and cls_y and cls_m.get("amount"):
            m12 = cls_m["amount"] * 12.0
            save = max(0.0, 1.0 - (cls_y["amount"] / m12))
            meta["classroom"]["save_pct"] = round(save * 100)
    except Exception:
        pass
    trial_code = (request.args.get("trial") or incoming_params.get("invite") or session.get("invite") or "").strip()
    trial_kind = _trial_kind(trial_code)
    trial_unlocked = bool(trial_kind)
    trial_error = bool(trial_code) and not trial_unlocked
    member = {}
    if db and session.get("user_email"):
        try:
            snap = db.collection("users").document(session["user_email"]).get()
            member = (snap.to_dict() or {}) if snap.exists else {}
        except Exception:
            member = {}
    return render_template(
        "plus.html",
        has_subscription=_has_paid_subscription(member),
        prices=prices,
        meta=meta,
        promo_hint="SAVE25FOREVER",
        trial_unlocked=trial_unlocked,
        trial_code=trial_code,
        trial_error=trial_error,
        trial_kind=trial_kind,
        invite_code=session.get("invite"),
        promo_code=session.get("promo"),
        selected_plan=session.get("plan"),
        selected_interval=session.get("interval"),
        utm_tag=session.get("utm"),
        referrer=session.get("referrer"),
    )


def create_checkout_session():
    """Serialize billing attempts across workers and fail closed on lookup errors."""
    email = (session.get("user_email") or "").strip().lower()
    if not email or not db:
        flash("Please sign in and try again.", "error")
        return redirect(url_for("plus_pricing"))
    lock = db.collection("billing_locks").document(email)
    token = uuid.uuid4().hex

    @firestore.transactional
    def acquire(txn):
        data = lock.get(transaction=txn).to_dict() or {}
        if data.get("expires", 0) > time.time():
            return False
        txn.set(lock, {"token": token, "expires": time.time() + 300})
        return True

    @firestore.transactional
    def release(txn):
        if (lock.get(transaction=txn).to_dict() or {}).get("token") == token:
            txn.set(lock, {"expires": 0})

    acquired = False
    try:
        acquired = acquire(db.transaction())
        if not acquired:
            flash("Your checkout is already being prepared. Please try again shortly.", "info")
            return redirect(url_for("plus_pricing"))
        return _create_checkout_session(email)
    except Exception:
        current_app.logger.exception("Could not safely prepare subscription checkout")
        flash("We couldn't verify your billing yet. Please try again shortly.", "error")
        return redirect(url_for("plus_pricing"))
    finally:
        if acquired:
            try:
                release(db.transaction())
            except Exception:
                current_app.logger.exception("Could not release billing lock")


def _subscription_checkout_target(email, member, price_id):
    """Check Stripe, including legacy customers created by email-only checkout."""
    customers = {c["id"] for c in stripe.Customer.list(email=email, limit=100).auto_paging_iter()}
    if member.get("stripeCustomerId"):
        customers.add(member["stripeCustomerId"])
    subscriptions = {}
    for customer in sorted(customers):
        for sub in stripe.Subscription.list(customer=customer, status="all", limit=100).auto_paging_iter():
            member["_hasSubscriptionHistory"] = True
            if sub.get("status") not in {"canceled", "incomplete_expired"}:
                subscriptions[sub["id"]] = sub
    if member.get("subscriptionId") and member["subscriptionId"] not in subscriptions:
        sub = stripe.Subscription.retrieve(member["subscriptionId"])
        member["_hasSubscriptionHistory"] = True
        if sub.get("status") not in {"canceled", "incomplete_expired"}:
            subscriptions[sub["id"]] = sub
            customers.add(sub["customer"])
    if len(subscriptions) > 1:
        flash("We found multiple subscriptions. Please contact support so we can correct your billing.", "warning")
        return None, redirect(url_for("plus_pricing"))
    if subscriptions:
        # Old checkout tabs must stop working as soon as an existing plan is found.
        for cid in sorted(customers):
            for checkout in stripe.checkout.Session.list(customer=cid, status="open", limit=100).auto_paging_iter():
                if checkout.get("mode") == "subscription":
                    stripe.checkout.Session.expire(checkout["id"])
        sub = next(iter(subscriptions.values()))
        _sync_subscription(sub, email=email)
        items = (sub.get("items") or {}).get("data") or []
        params = {"customer": sub["customer"], "return_url": url_for("plus_pricing", _external=True)}
        if _sub_price_id(sub) == price_id:
            flash("You already have this plan. You can manage your subscription here.", "info")
        elif sub.get("status") in {"active", "trialing"} and len(items) == 1:
            params["flow_data"] = {
                "type": "subscription_update_confirm",
                "subscription_update_confirm": {
                    "subscription": sub["id"],
                    "items": [{"id": items[0]["id"], "price": price_id,
                               "quantity": items[0].get("quantity") or 1}],
                },
                "after_completion": {"type": "redirect", "redirect": {
                    "return_url": url_for("plus_pricing", _external=True)}},
            }
        else:
            flash("Please resolve your existing subscription before changing plans.", "info")
        portal = stripe.billing_portal.Session.create(**params)
        return None, redirect(portal.url, code=303)
    customer = member.get("stripeCustomerId") or next(iter(sorted(customers)), None)
    if not customer:
        customer = stripe.Customer.create(
            email=email, idempotency_key="plus-customer-" + hashlib.sha256(email.encode()).hexdigest()
        )["id"]
    db.collection("users").document(email).set({"stripeCustomerId": customer}, merge=True)
    reusable = None
    for cid in sorted(customers | {customer}):
        for checkout in stripe.checkout.Session.list(customer=cid, status="open", limit=100).auto_paging_iter():
            if checkout.get("mode") != "subscription":
                continue
            if reusable is None and (checkout.get("metadata") or {}).get("plan_price_id") == price_id:
                reusable = checkout
            else:
                # Completion racing expiration raises; never create another checkout then.
                stripe.checkout.Session.expire(checkout["id"])
    if reusable is not None:
        return None, redirect(reusable["url"], code=303)
    # A previous checkout may have completed between the subscription lookup
    # and the open-session lookup. All remaining old sessions are now expired.
    for cid in sorted(customers | {customer}):
        for sub in stripe.Subscription.list(customer=cid, status="all", limit=100).auto_paging_iter():
            if sub.get("status") not in {"canceled", "incomplete_expired"}:
                flash("Your subscription just changed. Please choose your plan again.", "info")
                return None, redirect(url_for("plus_pricing"))
    return customer, None


def _create_checkout_session(user_email):
    if not STRIPE_SECRET_KEY or not stripe:
        return "Stripe not configured", 500
    id_or_price = (request.form.get("price_id") or "").strip()
    trial_token = (request.form.get("trial_token") or "").strip()
    if not id_or_price:
        return "Missing price", 400
    price_id = resolve_price_id(id_or_price)
    if not _sellable_price(price_id):
        current_app.logger.warning("checkout refused for unknown price %s", price_id)
        flash("That plan isn't available. Please choose one of the plans below.", "warning")
        return redirect(url_for("plus_pricing"))
    snap = db.collection("users").document(user_email).get()
    member = (snap.to_dict() or {}) if snap.exists else {}
    customer, response = _subscription_checkout_target(user_email, member, price_id)
    if response is not None:
        return response
    trial_info = _trial_days_for(trial_token, price_id)
    if trial_info and (member.get("trialStartedAt") or member.get("subscriptionId") or member.get("_hasSubscriptionHistory")):
        flash("Free trials are for first-time members, so this plan starts today.", "info")
        trial_info = None
    trial_days = trial_kind = None
    if trial_info:
        trial_days, trial_kind = trial_info
        required_kind = trial_kind
        price_kind = _classify_price(price_id)
        if required_kind != "month":
            if not price_kind or price_kind[1] != required_kind:
                flash(f"Your invite applies to the {required_kind} plan. Please select the matching plan.", "warning")
                return redirect(url_for("plus_pricing"))

    subscription_data = {"metadata": {"plan_price_id": price_id}}
    share_attrs = {
        "invite_code": session.get("invite"),
        "promo_code": session.get("promo"),
        "preferred_plan": session.get("plan"),
        "preferred_interval": session.get("interval"),
        "utm": session.get("utm"),
        "referrer": session.get("referrer"),
    }
    for meta_key, meta_val in share_attrs.items():
        if meta_val:
            subscription_data["metadata"][meta_key] = str(meta_val)
    if trial_days is not None:
        subscription_data["trial_period_days"] = trial_days
        subscription_data["metadata"]["trial_days"] = str(trial_days)
        if trial_kind:
            subscription_data["metadata"]["trial_kind"] = trial_kind
        if trial_token:
            subscription_data["metadata"]["trial_code"] = trial_token
            subscription_data["metadata"]["source"] = f"invite:{trial_token.lower()}"

    session_metadata = {"email": user_email, "plan_price_id": price_id}
    for meta_key, meta_val in share_attrs.items():
        if meta_val:
            session_metadata[meta_key] = str(meta_val)
    if trial_days is not None:
        session_metadata["trial_days"] = str(trial_days)
        if trial_kind:
            session_metadata["trial_kind"] = trial_kind
        if trial_token:
            session_metadata["trial_code"] = trial_token
            session_metadata["source"] = f"invite:{trial_token.lower()}"

    promo_str = (session.get("promo") or request.form.get("promo") or "").strip()
    promo_id = _find_promotion_code_id(promo_str) if promo_str else None

    create_kwargs = {
        "mode": "subscription",
        "customer": customer,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": url_for("plus_success", _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
        "cancel_url": url_for("plus_pricing", _external=True),
        "metadata": session_metadata,
        "subscription_data": subscription_data,
        # Auto-renewal disclosure shown next to the Subscribe button.
        "custom_text": {"submit": {"message": (
            ("Your card is charged when the free trial ends unless you cancel first. " if trial_days else "")
            + "Your plan renews automatically at this price until you cancel, which you can do anytime "
            "on the Plus page under Manage billing. "
            "By subscribing you agree to the Terms: "
            + url_for("public.terms", _external=True)
        )}},
    }
    if promo_id:
        create_kwargs["discounts"] = [{"promotion_code": promo_id}]
    else:
        create_kwargs["allow_promotion_codes"] = True

    try:
        chk = stripe.checkout.Session.create(**create_kwargs)
        return redirect(chk.url, code=303)
    except Exception as e:
        current_app.logger.exception("[%s] Stripe checkout session failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't start checkout yet. Please try again.", "error")
        return redirect(url_for("plus_pricing"))


def plus_success():
    plan_context = {
        "title": "Faith Sparks Plus",
        "amount": None,
        "currency": "USD",
        "interval": None,
        "trial": False,
        "trial_days": None,
        "plan_key": None,
    }
    session_id = (request.args.get("session_id") or "").strip()
    if session_id and stripe and STRIPE_SECRET_KEY:
        try:
            checkout = stripe.checkout.Session.retrieve(
                session_id,
                expand=["line_items.data.price.product"],
            )
            checkout = _stripe_dict(checkout)
            metadata = checkout.get("metadata") or {}
            line_items = (checkout.get("line_items") or {}).get("data") or []
            line = line_items[0] if line_items else None
            price_obj = (line.get("price") or {}) if line else {}
            price_id = price_obj.get("id") or metadata.get("plan_price_id")
            amount_total = line.get("amount_total") if line and line.get("amount_total") is not None else checkout.get("amount_total")
            currency = (
                (line.get("currency") if line else checkout.get("currency")) or "USD"
            ).upper()
            unit_amount = price_obj.get("unit_amount")
            quantity = line.get("quantity") if line and line.get("quantity") else 1
            plan_key = interval_key = None
            if price_id:
                classified = _classify_price(price_id)
                if classified:
                    plan_key, interval_key = classified
            product = price_obj.get("product")
            nickname = price_obj.get("nickname")
            plan_title = None
            if isinstance(product, dict):
                plan_title = product.get("name")
            if not plan_title and nickname:
                plan_title = nickname
            plan_title = plan_title or _plan_display_label(plan_key, interval_key)

            value_amount = round(((amount_total or 0) / 100.0), 2)
            # Grant access now (verified with Stripe) instead of waiting for the webhook.
            checkout_email = ((checkout.get("customer_details") or {}).get("email")
                              or checkout.get("customer_email") or "").strip().lower()
            signed_in = (session.get("user_email") or "").strip().lower()
            if db and checkout.get("subscription") and checkout_email and checkout_email == signed_in:
                try:
                    live_sub = stripe.Subscription.retrieve(checkout["subscription"], expand=["items.data.price"])
                    _sync_subscription(live_sub, email=signed_in)
                except Exception:
                    current_app.logger.exception("plus_success sync failed; the webhook will retry")
            trial_days_raw = metadata.get("trial_days")
            try:
                trial_days = int(trial_days_raw)
            except (TypeError, ValueError):
                trial_days = None

            plan_context.update(
                {
                    "title": plan_title,
                    "amount": value_amount,
                    "currency": currency,
                    "interval": interval_key,
                    "trial": value_amount == 0.0,
                    "trial_days": trial_days,
                    "plan_key": plan_key,
                }
            )

            params = {
                "value": value_amount,
                "currency": currency,
                "content_name": plan_title,
                "num_items": quantity,
            }
            if plan_key:
                params["subscription_plan"] = plan_key
            if interval_key:
                params["subscription_interval"] = interval_key
            if trial_days is not None:
                params["trial_days"] = trial_days
            contents = []
            if price_id:
                params["content_ids"] = [price_id]
                params["content_type"] = "product"
                item = {"id": price_id, "quantity": quantity}
                if unit_amount is not None:
                    item["item_price"] = round(unit_amount / 100.0, 2)
                contents.append(item)
            if contents:
                params["contents"] = contents
            events = ["Purchase", "Subscribe"]
            if plan_context["trial"]:
                events.append("StartTrial")
            session["fb_purchase"] = {
                "params": params,
                "events": events,
                "eventID": session_id,
            }
        except Exception:
            traceback.print_exc()
    return render_template("plus_success.html", plan=plan_context)


def billing_portal():
    if not STRIPE_SECRET_KEY or not stripe:
        return "Stripe not configured", 500
    email = session.get("user_email")
    if not db or not email:
        return redirect(url_for("public.index"))
    try:
        u = db.collection("users").document(email).get()
        if not u.exists:
            flash("No subscription found for your account.", "warning")
            return redirect(url_for("plus_pricing"))
        cid = (u.to_dict() or {}).get("stripeCustomerId")
        if not cid:
            flash("No subscription found for your account.", "warning")
            return redirect(url_for("plus_pricing"))
        ps = stripe.billing_portal.Session.create(customer=cid, return_url=url_for("public.index", _external=True))
        return redirect(ps.url)
    except Exception as e:
        current_app.logger.exception("[%s] billing portal error: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't open the billing portal yet. Please try again in a moment.", "error")
        return redirect(url_for("plus_pricing"))


# Subscription statuses that keep Plus on. ``past_due`` is Stripe's retry
# window (card expired, bank hiccup); access ends at unpaid/canceled/paused.
ACCESS_STATUSES = SUBSCRIPTION_ACCESS_STATUSES


def _gift_active(data: dict) -> bool:
    if not data.get("gifted"):
        return False
    expires = data.get("giftExpiresAt")
    if not expires:
        return True
    try:
        return datetime.now(timezone.utc) <= expires
    except Exception:
        return False


def _period_end(sub: dict) -> Optional[datetime]:
    """current_period_end lives on the subscription (old API) or its items (2025-03+)."""
    raw = sub.get("current_period_end")
    if not raw:
        items = ((sub.get("items") or {}).get("data") or [])
        raw = items[0].get("current_period_end") if items else None
    try:
        return datetime.fromtimestamp(int(raw), tz=timezone.utc) if raw else None
    except Exception:
        return None


def _invoice_subscription_id(invoice: dict) -> Optional[str]:
    """invoice.subscription moved to invoice.parent.subscription_details in 2025-03+."""
    sub = invoice.get("subscription")
    if isinstance(sub, dict):
        sub = sub.get("id")
    if not sub:
        details = ((invoice.get("parent") or {}).get("subscription_details") or {})
        sub = details.get("subscription")
        if isinstance(sub, dict):
            sub = sub.get("id")
    return sub or None


def _sub_price_id(sub: dict) -> Optional[str]:
    items = ((sub.get("items") or {}).get("data") or [])
    price = (items[0].get("price") or {}) if items else {}
    return price.get("id") if isinstance(price, dict) else price or None


def _plan_for_price(price_id: Optional[str]) -> str:
    kind = _classify_price(price_id or "")
    return kind[0] if kind else "plus"


def _find_user_for_subscription(sub: dict, email: Optional[str] = None):
    """users/{email} reference for this subscription: explicit email, then ids."""
    if email:
        return db.collection("users").document(email.strip().lower())
    for field, value in (("subscriptionId", sub.get("id")), ("stripeCustomerId", sub.get("customer"))):
        if not value:
            continue
        doc = next(
            db.collection("users").where(filter=firestore.FieldFilter(field, "==", value)).limit(1).stream(),
            None,
        )
        if doc:
            return doc.reference
    return None


def _sync_subscription(sub: dict, *, email: Optional[str] = None, extra: Optional[dict] = None) -> bool:
    """Write Plus state from the subscription's *current* Stripe status.

    Used for checkout completion, updates and deletions alike, so replayed or
    out-of-order events can't contradict Stripe. Raises on storage errors so the
    webhook answers 500 and Stripe retries.
    """
    sub = _stripe_dict(sub) or {}
    ref = _find_user_for_subscription(sub, email)
    if ref is None:
        current_app.logger.warning("stripe: no user for subscription %s", sub.get("id"))
        return False
    snap = ref.get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    sub_id = sub.get("id")
    status = str(sub.get("status") or "").lower()
    current_sub = data.get("subscriptionId")
    if current_sub and current_sub != sub_id and status not in ACCESS_STATUSES:
        # An older/other subscription ended: never touch the one they still pay for.
        return True
    price_id = _sub_price_id(sub)
    plan = _plan_for_price(price_id)
    update: dict = {
        "subscriptionStatus": status,
        "stripeCustomerId": sub.get("customer") or data.get("stripeCustomerId"),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    renew_at = _period_end(sub)
    if renew_at:
        update["renewAt"] = renew_at
    if status in ACCESS_STATUSES:
        update.update({"isPro": True, "plan": plan, "paidPlan": plan, "subscriptionId": sub_id})
        if price_id:
            update["priceId"] = price_id
        if status == "trialing" and not data.get("trialStartedAt"):
            update["trialStartedAt"] = firestore.SERVER_TIMESTAMP
    else:
        update["paidPlan"] = firestore.DELETE_FIELD
        if status == "canceled":
            update["subscriptionId"] = None
        if not _gift_active(data):
            update.update({"isPro": False, "plan": "free"})
    for key, value in (extra or {}).items():
        if value:
            update[key] = value
    ref.set(update, merge=True)
    return True


def _event_seen(event_id: Optional[str]) -> bool:
    if not event_id or not db:
        return False
    try:
        return db.collection("stripe_events").document(event_id).get().exists
    except Exception:
        return False


def _mark_event(event_id: Optional[str], event_type: Optional[str]) -> None:
    if not event_id or not db:
        return
    try:
        db.collection("stripe_events").document(event_id).set(
            {"type": event_type, "at": firestore.SERVER_TIMESTAMP}
        )
    except Exception:
        current_app.logger.warning("stripe: could not record event %s", event_id)


def _share_details(subscription_meta: dict, checkout_meta: dict) -> dict:
    def _pick(*vals):
        for val in vals:
            if isinstance(val, str) and val.strip():
                return val.strip()
        return None

    keys = {
        "utm": "utm", "invite_code": "inviteCode", "promo_code": "promoCode",
        "preferred_plan": "preferredPlan", "preferred_interval": "preferredInterval",
        "source": "source", "referrer": "referredBy",
    }
    return {target: _pick(subscription_meta.get(key), checkout_meta.get(key)) for key, target in keys.items()}


def _fulfill_one_time(obj: dict, email: str, checkout_meta: dict) -> None:
    entitlement_id = checkout_meta.get("entitlement_id")
    pack_slug = checkout_meta.get("pack_slug")
    payment_status = obj.get("payment_status")
    if payment_status not in {"paid", "no_payment_required"}:
        return
    if entitlement_id in ALLOWED_ONE_TIME_ENTITLEMENTS:
        grant = entitlement_id
        price_id = checkout_meta.get("price_id")
    elif pack_slug:
        pack_doc = db.collection("collections").document(pack_slug).get()
        if not pack_doc.exists:
            return
        expected = str((pack_doc.to_dict() or {}).get("priceId") or os.getenv("STRIPE_DEFAULT_PACK_PRICE", "")).strip()
        price_id = str(checkout_meta.get("price_id") or "").strip()
        if expected and price_id and expected != price_id:
            return
        grant = pack_slug
        price_id = price_id or expected
    else:
        return
    db.collection("users").document(email).set(
        {
            "purchases": {grant: True},
            "purchaseDetails": {
                grant: {
                    "checkoutSessionId": obj.get("id"),
                    "stripeCustomerId": obj.get("customer"),
                    "priceId": price_id,
                    "paymentStatus": payment_status,
                    "purchasedAt": firestore.SERVER_TIMESTAMP,
                }
            },
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    if grant == FAMILY_GAME_NIGHT_ENTITLEMENT:
        _increment_metric("family_game_night_checkout_fulfilled", grant)


def _record_trial_start(session_id: Optional[str], utm_source: Optional[str]) -> None:
    try:
        if session_id:
            ref = db.collection("analytics").document("trial_starts").collection("sessions").document(session_id)
            if ref.get().exists:
                return
            ref.set({"sessionId": session_id, "utm": (utm_source or "unknown").strip().lower() or "unknown",
                     "createdAt": firestore.SERVER_TIMESTAMP})
        _increment_metric("trial_starts", utm_source)
    except Exception:
        traceback.print_exc()


def _handle_invoice_paid(invoice: dict) -> None:
    subscription_id = _invoice_subscription_id(invoice)
    if (not subscription_id or invoice.get("billing_reason") != "subscription_cycle"
            or (invoice.get("amount_paid") or 0) <= 0):
        return
    user_doc = next(
        db.collection("users").where(filter=firestore.FieldFilter("subscriptionId", "==", subscription_id)).limit(1).stream(),
        None,
    )
    if not user_doc:
        return
    data = user_doc.to_dict() or {}
    if not data.get("firstConversionAt"):
        user_doc.reference.set(
            {"firstConversionAt": firestore.SERVER_TIMESTAMP, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True
        )
        _increment_metric("trial_conversions", (data.get("utm") or data.get("source") or "").strip())
    try:
        referrer_email = (data.get("referredBy") or "").strip().lower()
        invite_code = (data.get("inviteCode") or "").strip().lower()
        redeemer_email = (user_doc.id or "").strip().lower()
        if referrer_email and invite_code == REFERRAL_INVITE_CODE and redeemer_email:
            _record_referral_completion(referrer_email, redeemer_email)
    except Exception:
        traceback.print_exc()


def stripe_webhook():
    if not STRIPE_WEBHOOK_SECRET or not stripe:
        # Answer 500 so the Stripe dashboard shows failures instead of silently dropping purchases.
        current_app.logger.error("stripe webhook received but STRIPE_WEBHOOK_SECRET/Stripe SDK is not configured")
        return ("Webhook not configured", 500)
    if not db:
        current_app.logger.error("stripe webhook received but Firestore is not configured")
        return ("Storage unavailable", 500)
    try:
        event = stripe.Webhook.construct_event(request.data, request.headers.get("Stripe-Signature"), STRIPE_WEBHOOK_SECRET)
        event = _stripe_dict(event)
    except Exception as e:
        return (f"Webhook error: {e}", 400)

    event_id = event.get("id")
    et = event.get("type")
    obj = _stripe_dict(event.get("data", {}).get("object", {})) or {}
    if _event_seen(event_id):
        return ("", 200)
    try:
        if et == "checkout.session.completed":
            checkout_meta = obj.get("metadata") or {}
            email = ((obj.get("customer_details") or {}).get("email") or obj.get("customer_email")
                     or checkout_meta.get("email") or "").strip().lower()
            subscription_id = obj.get("subscription")
            if subscription_id and email:
                # Always read the live subscription: a replayed old event must not re-grant Plus.
                sub = _stripe_dict(stripe.Subscription.retrieve(
                    subscription_id, expand=["items.data.price", "discount.promotion_code"]
                ))
                extra = _share_details(sub.get("metadata") or {}, checkout_meta)
                disc = sub.get("discount") or {}
                if (disc.get("coupon") or {}).get("id"):
                    extra["couponId"] = disc["coupon"]["id"]
                if (disc.get("promotion_code") or {}).get("id"):
                    extra["promotionCodeId"] = disc["promotion_code"]["id"]
                    extra["hasLifetimeDiscount"] = True
                _sync_subscription(sub, email=email, extra=extra)
                _record_trial_start(obj.get("id"), extra.get("utm") or extra.get("source"))
            elif email:
                _fulfill_one_time(obj, email, checkout_meta)
        elif et in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
            live_sub = stripe.Subscription.retrieve(obj["id"], expand=["items.data.price"])
            _sync_subscription(live_sub)
        elif et == "invoice.payment_succeeded":
            _handle_invoice_paid(obj)
    except Exception:
        current_app.logger.exception("stripe webhook %s (%s) failed; asking Stripe to retry", et, event_id)
        return ("Fulfillment failed", 500)
    _mark_event(event_id, et)
    return ("", 200)


def buy_family_game_night():
    if not stripe or not STRIPE_SECRET_KEY:
        return "Stripe not configured", 500
    if not db:
        return "Firestore not configured", 500
    email = (session.get("user_email") or "").strip().lower()
    if not email:
        return redirect(url_for("google.login", next=url_for("act_it_out.family_game_night")))
    try:
        user_doc = db.collection("users").document(email).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        if has_family_game_night_access(user_data):
            message = (
                "Complete Family Game Night is included with your Faith Sparks Plus account!"
                if has_active_plus(user_data)
                else "You already own Family Game Night. Start a game whenever you're ready!"
            )
            flash(message, "success")
            return redirect(url_for("act_it_out.family_game_night_setup"))
    except Exception:
        current_app.logger.exception("[%s] Family Game Night ownership check failed", getattr(g, "req_id", ""))
        flash("We couldn't confirm your access yet. Please try again.", "error")
        return redirect(url_for("act_it_out.family_game_night"))
    price_id = (STRIPE_PRICE_FAMILY_GAME_NIGHT or "").strip()
    if not price_id:
        flash("Family Game Night checkout is not available yet.", "warning")
        return redirect(url_for("act_it_out.family_game_night"))
    try:
        checkout = stripe.checkout.Session.create(
            mode="payment",
            customer_email=email,
            line_items=[{"price": price_id, "quantity": 1}],
            allow_promotion_codes=True,
            success_url=url_for("family_game_night_success", _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=url_for("family_game_night_checkout_canceled", _external=True),
            metadata={
                "email": email,
                "entitlement_id": FAMILY_GAME_NIGHT_ENTITLEMENT,
                "price_id": price_id,
            },
        )
        _increment_metric("family_game_night_checkout_started", "one_time")
        return redirect(checkout.url, code=303)
    except Exception as exc:
        current_app.logger.exception("[%s] Family Game Night checkout failed: %s", getattr(g, "req_id", ""), exc)
        flash("We couldn't start checkout yet. Please try again.", "error")
        return redirect(url_for("act_it_out.family_game_night"))


def family_game_night_checkout_canceled():
    if session.get("user_email"):
        _increment_metric("family_game_night_checkout_canceled", "one_time")
    flash("Checkout canceled. Nothing was charged, and the free game is still ready to play.", "info")
    return redirect(url_for("act_it_out.family_game_night") + "#complete-game")


def family_game_night_success():
    session_id = (request.args.get("session_id") or "").strip()
    if session_id and stripe and STRIPE_SECRET_KEY:
        try:
            checkout = stripe.checkout.Session.retrieve(session_id)
            checkout = _stripe_dict(checkout)
            metadata = checkout.get("metadata") or {}
            checkout_email = (
                (checkout.get("customer_details") or {}).get("email")
                or checkout.get("customer_email")
                or metadata.get("email")
                or ""
            ).strip().lower()
            if (
                checkout.get("payment_status") in {"paid", "no_payment_required"}
                and metadata.get("entitlement_id") == FAMILY_GAME_NIGHT_ENTITLEMENT
                and checkout_email == (session.get("user_email") or "").strip().lower()
            ):
                flash("Purchase received! Your access will appear as soon as Stripe confirms it.", "success")
                return redirect(url_for("act_it_out.family_game_night_setup"))
        except Exception:
            current_app.logger.exception("[%s] Family Game Night success verification failed", getattr(g, "req_id", ""))
    flash("We're still confirming your purchase. Refresh in a moment or contact support if access does not appear.", "warning")
    return redirect(url_for("act_it_out.family_game_night"))


def _pack_checkout_parameters(email: str, slug: str, price_id: str) -> dict:
    """Keep one Stripe idempotency key and immutable request per payable window."""
    ref = db.collection("users").document(email).collection("pack_checkouts").document(slug)

    @firestore.transactional
    def claim(txn):
        previous = ref.get(transaction=txn).to_dict() or {}
        if previous.get("expires_at", 0) > time.time():
            return previous
        parameters = {
            "idempotency_key": "pack-" + uuid.uuid4().hex,
            "expires_at": int(time.time()) + 23 * 60 * 60,
            "mode": "payment",
            "customer_email": email,
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": url_for("buy_success", slug=slug, _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
            "cancel_url": url_for("browse_detail", slug=slug, _external=True),
            "metadata": {"email": email, "pack_slug": slug, "price_id": price_id},
        }
        txn.set(ref, parameters)
        return parameters

    return claim(db.transaction())


def buy_pack(slug):
    if not stripe or not STRIPE_SECRET_KEY:
        return "Stripe not configured", 500
    if not db:
        return "Firestore not configured", 500
    d = db.collection("collections").document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict() or {}
    email = session.get("user_email")
    try:
        user_doc = db.collection("users").document(email).get() if email and db else None
        user_data = user_doc.to_dict() if user_doc and user_doc.exists else {}
        if meta.get("isFree") or has_active_plus(user_data) or (user_data.get("purchases") or {}).get(slug):
            flash("You already have access to this pack. Download away! 🎉", "success")
            return redirect(url_for("browse_detail", slug=slug))
    except Exception:
        current_app.logger.exception("Pack ownership verification failed; refusing checkout")
        flash("We couldn't verify your purchases. Please try again shortly.", "error")
        return redirect(url_for("browse_detail", slug=slug))
    price_id = (meta.get("priceId") or os.getenv("STRIPE_DEFAULT_PACK_PRICE", "")).strip()
    if not price_id:
        flash("This pack is not available for one-time purchase.", "warning")
        return redirect(url_for("browse_detail", slug=slug))
    try:
        if not email:
            return redirect(url_for("google.login", next=request.url))
        chk = stripe.checkout.Session.create(**_pack_checkout_parameters(email, slug, price_id))
        return redirect(chk.url, code=303)
    except Exception as e:
        current_app.logger.exception("[%s] Stripe pack checkout failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't start checkout yet. Please try again.", "error")
        return redirect(url_for("browse_detail", slug=slug))


def buy_success(slug):
    session_id = (request.args.get("session_id") or "").strip()
    confirmed = False
    if session_id and stripe and STRIPE_SECRET_KEY:
        try:
            checkout = stripe.checkout.Session.retrieve(
                session_id,
                expand=["line_items.data.price.product"],
            )
            checkout = _stripe_dict(checkout)
            checkout_meta = checkout.get("metadata") or {}
            checkout_email = (
                (checkout.get("customer_details") or {}).get("email")
                or checkout.get("customer_email")
                or checkout_meta.get("email")
                or ""
            ).strip().lower()
            signed_in_email = (session.get("user_email") or "").strip().lower()
            line_items = (checkout.get("line_items") or {}).get("data") or []
            line = line_items[0] if line_items else None
            price_obj = (line.get("price") or {}) if line else {}
            price_id = price_obj.get("id")
            unit_amount = price_obj.get("unit_amount")
            quantity = line.get("quantity") if line and line.get("quantity") else 1
            amount_total = (
                line.get("amount_total")
                if line and line.get("amount_total") is not None
                else checkout.get("amount_total")
            )
            currency = (
                (line.get("currency") if line else checkout.get("currency")) or "USD"
            ).upper()
            product_name = None
            product = price_obj.get("product")
            if isinstance(product, dict):
                product_name = product.get("name")
            value_amount = round(((amount_total or 0) / 100.0), 2)
            pack_title = None
            pack_exists = False
            expected_price_id = None
            if db:
                try:
                    doc = db.collection("collections").document(slug).get()
                    if doc.exists:
                        pack_exists = True
                        pack_data = doc.to_dict() or {}
                        pack_title = pack_data.get("title")
                        expected_price_id = (
                            pack_data.get("priceId") or os.getenv("STRIPE_DEFAULT_PACK_PRICE", "")
                        ).strip()
                except Exception:
                    pack_title = None
            metadata_price_id = str(checkout_meta.get("price_id") or "").strip()
            verified = bool(
                db
                and pack_exists
                and checkout.get("payment_status") in {"paid", "no_payment_required"}
                and checkout_meta.get("pack_slug") == slug
                and checkout_email
                and checkout_email == signed_in_email
                and (not expected_price_id or (price_id or metadata_price_id) == expected_price_id)
            )
            if verified:
                db.collection("users").document(signed_in_email).set(
                    {
                        "purchases": {slug: True},
                        "purchaseDetails": {
                            slug: {
                                "checkoutSessionId": session_id,
                                "stripeCustomerId": checkout.get("customer"),
                                "priceId": price_id or metadata_price_id,
                                "paymentStatus": checkout.get("payment_status"),
                                "purchasedAt": firestore.SERVER_TIMESTAMP,
                            }
                        },
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    },
                    merge=True,
                )
                confirmed = True
                params = {
                    "value": value_amount,
                    "currency": currency,
                    "num_items": quantity,
                    "content_category": "Pack",
                    "content_name": product_name or pack_title or slug.replace("-", " ").title(),
                }
                if price_id:
                    params["content_ids"] = [price_id]
                    params["content_type"] = "product"
                    item = {"id": price_id, "quantity": quantity}
                    if unit_amount is not None:
                        item["item_price"] = round(unit_amount / 100.0, 2)
                    params["contents"] = [item]
                session["fb_purchase"] = {
                    "params": params,
                    "events": ["Purchase"],
                    "eventID": session_id,
                }
        except Exception:
            traceback.print_exc()
    if confirmed:
        flash("Purchase confirmed. Your bundle is ready.", "success")
    else:
        flash(
            "We're still confirming this purchase. Refresh in a moment or contact support if access does not appear.",
            "warning",
        )
    return redirect(url_for("browse_detail", slug=slug))
