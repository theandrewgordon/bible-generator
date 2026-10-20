"""Regression coverage for the October 20 app review."""
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest import mock

import pytest
from flask import render_template
from firebase_admin import firestore

import app
from faithsparks.services import ai_budget, usage, account_deletion
from faithsparks.views import worksheets

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore


def test_ai_budget_concurrent_last_unit(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(ai_budget, "db", db)
    monkeypatch.setenv("AI_DAILY_BUDGET", "1")
    monkeypatch.delenv("AI_DISABLED", raising=False)
    with ThreadPoolExecutor(max_workers=8) as pool:
        accepted = list(pool.map(lambda _: ai_budget.ai_budget_ok("test", 1), range(8)))
    assert sum(accepted) == 1


def test_ai_budget_storage_failure_refuses_call(monkeypatch):
    db = FakeFirestore()
    db.fail_collections.add("ai_budget")
    monkeypatch.setattr(ai_budget, "db", db)
    assert not ai_budget.ai_budget_ok("test", 1)


def test_usage_concurrent_last_credit_and_refund(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setenv("FAMILY_MONTHLY_QUOTA", "1")
    with ThreadPoolExecutor(max_workers=8) as pool:
        reservations = list(pool.map(lambda _: usage._reserve_usage("a@x.com", 1, "family"), range(8)))
    assert sum(count for count, _ in reservations) == 1
    month = reservations[0][1]
    usage._refund_usage("a@x.com", 1, month)
    assert db.user("a@x.com")["usage"]["months"][month] == 0
    assert usage._reserve_usage("a@x.com", 1, "family")[0] == 1


def test_usage_refund_keeps_original_month(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setattr(usage, "_month_key", lambda: "2026-09")
    count, month = usage._reserve_usage("a@x.com", 1, "family")
    monkeypatch.setattr(usage, "_month_key", lambda: "2026-10")
    usage._refund_usage("a@x.com", count, month)
    assert db.user("a@x.com")["usage"]["months"] == {"2026-09": 0}


def test_delete_cancels_every_legacy_customer(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test")
    with mock.patch("stripe.Customer.list", return_value=SimpleNamespace(
        auto_paging_iter=lambda: iter([{"id": "cus_a"}, {"id": "cus_b"}])
    )), mock.patch("stripe.Customer.delete") as delete:
        assert account_deletion._cancel_stripe({"stripeCustomerId": "cus_a"}, "a@x.com")
    assert delete.call_args_list == [mock.call("cus_a"), mock.call("cus_b")]


def test_delete_blocks_when_paid_billing_is_unconfigured(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    with pytest.raises(account_deletion.AccountDeletionError):
        account_deletion._cancel_stripe({"subscriptionId": "sub_a"}, "a@x.com")


@pytest.mark.parametrize("is_pro,audience,visible", [
    (True, None, False), (False, None, True),
    (True, "everyone", True), (True, "non_members", False),
])
def test_announcement_audience(is_pro, audience, visible):
    with app.app.test_request_context("/"):
        html = render_template("base.html", is_pro=is_pro, site_content={
            "announcement_enabled": True, "announcement_text": "PROMO_REGRESSION",
            "announcement_audience": audience,
        })
    assert ("PROMO_REGRESSION" in html) is visible


@pytest.mark.parametrize("paying,expected", [(False, False), (True, True)])
def test_expired_gift_does_not_override_paid_membership(paying, expected):
    from datetime import datetime, timedelta, timezone
    from faithsparks.services import users
    user = {"isPro": True, "plan": "family", "gifted": True,
            "giftExpiresAt": datetime.now(timezone.utc) - timedelta(days=1)}
    if paying:
        user.update(subscriptionId="sub_paid", subscriptionStatus="active", paidPlan="classroom")
    assert users.has_active_plus(user) is expected


def test_expired_gift_user_document_is_effective_on_api_requests(monkeypatch):
    from datetime import datetime, timedelta, timezone
    from faithsparks.services import users
    db = FakeFirestore()
    monkeypatch.setattr(users, "db", db)
    db.collection("users").document("gift@x.com").set({
        "isPro": True, "gifted": True, "plan": "family",
        "giftExpiresAt": datetime.now(timezone.utc) - timedelta(days=1),
    })
    with app.app.test_request_context("/api"):
        user = users.get_user_doc("gift@x.com")
        assert user["isPro"] is False
        assert user["plan"] == "free"


def test_failed_deletion_step_retains_account_for_retry(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(account_deletion, "db", db)
    monkeypatch.setattr(account_deletion, "_cancel_stripe", lambda *a: False)
    step = mock.Mock(side_effect=RuntimeError("storage down"))
    monkeypatch.setattr(account_deletion, "_STEPS", [("workspace", step)])
    db.collection("users").document("a@x.com").set({"plan": "free"})
    with pytest.raises(account_deletion.AccountDeletionError, match="retry"):
        account_deletion.delete_user_data("a@x.com")
    assert db.collection("users").document("a@x.com").get().exists
    step.side_effect = None
    step.return_value = 1
    result = account_deletion.delete_user_data("a@x.com")
    assert result["account"] == 1
    assert not db.collection("users").document("a@x.com").get().exists


def test_failed_file_cleanup_retains_owner_record(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(account_deletion, "db", db)
    monkeypatch.setattr(account_deletion, "_cancel_stripe", lambda *a: False)
    monkeypatch.setattr(account_deletion, "_STEPS", [])
    monkeypatch.setattr(worksheets, "_delete_owned_worksheet_file", mock.Mock(side_effect=RuntimeError("storage down")))
    db.collection("users").document("a@x.com").set({"plan": "free"})
    db.collection("worksheets").document("owned").set({"email": "a@x.com", "filename": "private.pdf"})
    with pytest.raises(account_deletion.AccountDeletionError, match="retry"):
        account_deletion.delete_user_data("a@x.com")
    assert db.collection("users").document("a@x.com").get().exists
    assert db.collection("worksheets").document("owned").get().exists
    monkeypatch.setattr(worksheets, "_delete_owned_worksheet_file", mock.Mock())
    assert account_deletion.delete_user_data("a@x.com")["account"] == 1
    assert not db.collection("worksheets").document("owned").get().exists


def test_coloring_deletion_removes_original_and_both_thumbnail_names():
    from faithsparks.services import storage
    with mock.patch.object(storage, "delete_storage_path") as delete:
        worksheets._delete_owned_worksheet_file("color.pdf", {"type": "coloring", "imageFilename": "color.png"})
    delete.assert_any_call("worksheets/color.pdf", strict=True)
    delete.assert_any_call("worksheets/color.png", strict=True)
    delete.assert_any_call("thumbs/color_coloring.png", strict=True)
    delete.assert_any_call("thumbs/color.png", strict=True)


def test_strict_storage_delete_distinguishes_failure_and_absence(monkeypatch):
    from faithsparks.services import storage
    bucket = mock.Mock()
    blob = bucket.blob.return_value
    monkeypatch.setattr(storage, "_get_bucket", lambda: bucket)
    blob.exists.return_value = False
    assert storage.delete_storage_path("worksheets/absent.pdf", strict=True) is False
    blob.exists.side_effect = RuntimeError("Storage down")
    with pytest.raises(RuntimeError, match="Storage down"):
        storage.delete_storage_path("worksheets/owned.pdf", strict=True)
