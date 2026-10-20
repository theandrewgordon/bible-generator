from concurrent.futures import ThreadPoolExecutor
from unittest import mock

import pytest
import app
from faithsparks.services import usage, weekflow_store as store
from faithsparks.views.admin import users as admin
from fake_firestore import FakeFirestore
from test_copywork_audit_fixes import CopyworkTestCase


class ReuseTests(CopyworkTestCase):
    def test_owned_pdf_remains_available_at_quota(self):
        email = "reuse@example.com"
        self.db.collection("users").document(email).set({"plan": "family", "isPro": True})
        with mock.patch.dict("os.environ", {"FAMILY_MONTHLY_QUOTA": "1"}):
            assert self.generate(email, verse="John 3:16", version="kjv").status_code == 200
            calls = len(self.ai_calls)
            assert self.generate(email, verse="John 3:16", version="kjv").status_code == 200
            assert len(self.ai_calls) == calls
            assert usage._get_usage(email)[1] == 1


@pytest.mark.parametrize("plan", ["free", "family"])
def test_reset_does_not_refund_new_jobs(monkeypatch, plan):
    db = FakeFirestore()
    monkeypatch.setattr(usage, "db", db)
    monkeypatch.setattr(admin, "db", db)
    monkeypatch.setattr(admin, "_log_admin_action", lambda *args: None)
    email = "reset@example.com"
    ref = db.collection("users").document(email)
    ref.set({"plan": plan})
    usage._reserve_usage(email, 1, plan, reservation_id="old")
    with app.app.test_request_context("/"):
        admin.admin_users_reset_usage(email)
    usage._reserve_usage(email, 1, plan, reservation_id="new")
    usage._save_worksheet(email, "new", {"usageCharge": True})
    usage._settle_usage(email, "old")
    counters = ref.get().to_dict()["usage"]
    assert counters["months"][usage._month_key()] == 1
    assert counters["lifetime"] == 1


def test_template_limit_is_atomic(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(store, "db", db)
    payload = {"name": "Week", "scenario": store.default_beta_state()["scenario"]}
    store.save_week_template("a@example.com", payload, limit=2)
    def save(_):
        try:
            store.save_week_template("a@example.com", payload, limit=2)
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(save, range(2))) == [False, True]
    assert len(store.list_week_templates("a@example.com")) == 2


def test_song_storage_failure_retains_metadata(monkeypatch):
    db = FakeFirestore()
    collection = db.collection("songs")
    item = {"id": "song", "title": "Song"}
    collection.document("song").set(item)
    monkeypatch.setattr(app, "db", db)
    monkeypatch.setattr(app, "get_worship_song", lambda _: item)
    monkeypatch.setattr(app, "_worship_songs_ref", lambda: collection)
    monkeypatch.setattr(app, "_current_worship_scope", lambda: "church")
    monkeypatch.setattr(app, "_delete_worship_resource_assets", mock.Mock(side_effect=RuntimeError("storage down")))
    with pytest.raises(RuntimeError, match="storage down"):
        app.delete_worship_song("song")
    assert collection.document("song").get().exists

@pytest.mark.parametrize("free,member", [(True, False), (False, True)])
def test_entitled_pack_does_not_start_checkout(monkeypatch, free, member):
    from faithsparks.views import billing
    from types import SimpleNamespace
    db = FakeFirestore()
    db.collection("collections").document("pack").set({"isFree": free, "priceId": "price_pack"})
    db.collection("users").document("a@example.com").set({"isPro": member})
    create = mock.Mock()
    monkeypatch.setattr(billing, "db", db)
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "test")
    monkeypatch.setattr(billing, "stripe", SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=create))))
    with app.app.test_request_context("/"):
        from flask import session
        session["user_email"] = "a@example.com"
        assert billing.buy_pack("pack").status_code == 302
    create.assert_not_called()
