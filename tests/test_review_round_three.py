"""Regression coverage for the third app review."""
from datetime import datetime, timedelta, timezone
from unittest import mock

import pytest

import app
from faithsparks.services import lesson_pack, storage, usage, users
from faithsparks.views import worksheets
from faithsparks.views.admin import users as admin_users
from fake_firestore import FakeFirestore


@pytest.mark.parametrize("suffix", ["", "_cursive", "_beginner", "_cursive_confident"])
def test_custom_delete_removes_private_json(tmp_path, monkeypatch, suffix):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "output").mkdir()
    pdf = tmp_path / f"output/custom-owner-123_DIY{suffix}.pdf"
    private = tmp_path / "output/custom-owner-123_DIY.json"
    pdf.write_bytes(b"%PDF")
    private.write_text('{"fullVerse": "Private family text"}')
    with mock.patch.object(storage, "delete_storage_path", return_value=True) as delete:
        worksheets._delete_owned_worksheet_file(pdf.name, {"custom": True})
    assert not pdf.exists()
    assert not private.exists()
    delete.assert_any_call("worksheets/custom-owner-123_DIY.json", strict=True)


def test_lesson_pack_ownership_ids_do_not_collapse_emails(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(lesson_pack, "db", db)
    for email in ["a.b@x.com", "a-b@x.com"]:
        lesson_pack._record_user_lesson_pack(email, {"slug": "same-pack"})
    records = list(db.collection("lesson_packs").stream())
    assert len(records) == 2
    assert {record.to_dict()["email"] for record in records} == {"a.b@x.com", "a-b@x.com"}


def test_owned_legacy_lesson_record_is_updated_without_duplicate(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(lesson_pack, "db", db)
    db.collection("lesson_packs").document("a-b-x-com-same-pack").set({
        "email": "a.b@x.com", "slug": "same-pack",
    })
    lesson_pack._record_user_lesson_pack("a.b@x.com", {"slug": "same-pack", "title": "Updated"})
    lesson_pack._record_user_lesson_pack("a-b@x.com", {"slug": "same-pack"})
    assert len(list(db.collection("lesson_packs").stream())) == 2
    assert db.collection("lesson_packs").document("a-b-x-com-same-pack").get().to_dict()["title"] == "Updated"


def test_failed_lesson_pack_save_can_retry(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(lesson_pack, "db", db)
    db.fail_collections.add("lesson_packs")
    with pytest.raises(RuntimeError, match="could not be saved reliably"):
        lesson_pack._record_user_lesson_pack("a@x.com", {"slug": "same-pack"})
    db.fail_collections.clear()
    lesson_pack._record_user_lesson_pack("a@x.com", {"slug": "same-pack"})
    assert len(list(db.collection("lesson_packs").stream())) == 1


@pytest.mark.parametrize("query", ["user250@x.com", "user250"])
def test_admin_search_finds_accounts_beyond_first_page(monkeypatch, query):
    db = FakeFirestore()
    monkeypatch.setattr(admin_users, "db", db)
    for i in range(300):
        db.collection("users").document(f"user{i:03}@x.com").set({"plan": "free"})
    with app.app.test_request_context("/admin/users", query_string={"q": query}), mock.patch.object(
        admin_users, "render_template", side_effect=lambda template, **data: data
    ):
        result = admin_users.admin_users()
    assert [user["id"] for user in result["users"]] == ["user250@x.com"]


def _journal(db, reservation="attempt"):
    return db.collection("users").document("a@x.com").collection("usage_reservations").document(reservation)


def test_pending_refund_recovers_after_outage_and_is_idempotent(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setattr(users, "db", db)
    count, month = usage._reserve_usage("a@x.com", 2, "family", reservation_id="attempt")
    assert count == 2
    # Successful generation of one page survives even if the final refund fails.
    usage._save_worksheet("a@x.com", "attempt", {
        "email": "a@x.com", "usageReservationId": "attempt", "usageCharge": True,
    })
    # Deleting the output later must not erase the durable consumption count.
    for doc in list(db.collection("worksheets").stream()):
        doc.reference.delete()
    original_transaction = db.transaction
    monkeypatch.setattr(db, "transaction", mock.Mock(side_effect=RuntimeError("Storage down")))
    with pytest.raises(RuntimeError):
        usage._refund_usage("a@x.com", 1, month, reservation_id="attempt")
    monkeypatch.setattr(db, "transaction", original_transaction)
    _journal(db).set({"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)}, merge=True)
    assert usage._get_usage("a@x.com") == (1, 1)
    usage._recover_usage("a@x.com")
    usage._refund_usage("a@x.com", 1, month, reservation_id="attempt")
    assert db.user("a@x.com")["usage"]["lifetime"] == 1
    assert _journal(db).get().to_dict()["status"] == "settled"


def test_crashed_generation_recovers_on_next_attempt(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setenv("FAMILY_MONTHLY_QUOTA", "1")
    usage._reserve_usage("a@x.com", 1, "family", reservation_id="crashed")
    _journal(db, "crashed").set({"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)}, merge=True)
    count, _ = usage._reserve_usage("a@x.com", 1, "family", reservation_id="new")
    assert count == 1
    assert db.user("a@x.com")["usage"]["lifetime"] == 1


def test_active_requests_are_not_recovered_early(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    usage._reserve_usage("a@x.com", 1, "family", reservation_id="active")
    usage._recover_usage("a@x.com")
    assert db.user("a@x.com")["usage"]["lifetime"] == 1
    assert _journal(db, "active").get().to_dict()["status"] == "pending"


def test_recovery_refunds_the_original_month_without_negative_counts(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setattr(usage, "_month_key", lambda: "2026-09")
    usage._reserve_usage("a@x.com", 1, "family", reservation_id="old")
    _journal(db, "old").set({"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)}, merge=True)
    monkeypatch.setattr(usage, "_month_key", lambda: "2026-10")
    usage._recover_usage("a@x.com")
    assert db.user("a@x.com")["usage"]["months"] == {"2026-09": 0}
