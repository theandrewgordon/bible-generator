"""WeekFlow audit 2026-10-14: fail-closed beta, SMS limits, demo names, cleanup, restore limits."""

import json
import os
import sys
from unittest import mock

import pytest
from flask import Flask

import faithsparks.services.account_deletion as deletion
import faithsparks.services.weekflow_calendar as calendar
import faithsparks.views.weekflow as wv
from faithsparks.services import weekflow_support
from faithsparks.services.rate_limit import reset_memory_limits
from faithsparks.services.weekflow_scheduler import demo_payload, default_scenario

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_limits():
    reset_memory_limits()
    yield
    reset_memory_limits()


def _client(email):
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.secret_key = "t"
    app.jinja_env.globals["csrf_token"] = lambda: "t"
    app.register_blueprint(wv.bp)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["user_email"] = email
    return client


def test_empty_beta_list_is_admins_only_in_production(monkeypatch):
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@x.com")
    monkeypatch.setenv("APP_ENV", "production")
    assert not wv._has_beta_access("stranger@x.com")
    assert wv._has_beta_access("admin@x.com")
    assert _client("stranger@x.com").get("/labs/weekflow/state").status_code == 403
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "Mom@x.com")
    assert wv._has_beta_access("mom@x.com")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "")
    assert wv._has_beta_access("anyone@x.com")  # local development stays open


def test_texts_only_go_to_us_and_canada_numbers(monkeypatch):
    monkeypatch.delenv("WEEKFLOW_SMS_COUNTRIES", raising=False)
    assert weekflow_support._destination("sms", "+15405550123") == "+15405550123"
    for bad in ("+447700900123", "+2348012345678", "+1555"):
        with pytest.raises(ValueError):
            weekflow_support._destination("sms", bad)
    assert weekflow_support._destination("email", "Grandma@x.com") == "grandma@x.com"


def test_daily_text_cap_applies_across_all_accounts(monkeypatch):
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("WEEKFLOW_SMS_DAILY_CAP", "1")
    sent = []
    monkeypatch.setattr(wv, "create_and_send_support_request", lambda *a, **k: sent.append(1) or {"channel": "sms"})
    monkeypatch.setattr(wv, "record_weekflow_event", lambda *a, **k: None)
    body = {"channel": "sms", "destination": "+15405550123"}
    assert _client("a@x.com").post("/labs/weekflow/logistics/support/send", json=body).status_code == 201
    assert _client("b@x.com").post("/labs/weekflow/logistics/support/send", json=body).status_code == 429
    assert len(sent) == 1


def test_demo_uses_no_real_names():
    text = json.dumps([demo_payload(), default_scenario()]).lower()
    for name in ("tessa", "diana", "elsie", "cc / co-op"):
        assert name not in text


def test_account_deletion_removes_helper_requests_and_revokes_calendar(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(deletion, "db", db)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    db.collection("weekflow_support_requests").document("r1").set({"ownerEmail": "mom@x.com"})
    db.collection("weekflow_support_requests").document("r2").set({"ownerEmail": "other@x.com"})
    with mock.patch.object(calendar, "_revoke_at_google", return_value=True) as revoke:
        summary = deletion.delete_user_data("mom@x.com")
    revoke.assert_called_once_with("mom@x.com")
    assert summary["helper_requests"] == 1
    assert list(db.store["weekflow_support_requests"]) == ["r2"]


def test_disconnect_revokes_the_grant_at_google(monkeypatch):
    from cryptography.fernet import Fernet

    db = FakeFirestore()
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(calendar, "db", db)
    monkeypatch.setenv(calendar.TOKEN_KEY_ENV, key)
    token = Fernet(key.encode()).encrypt(json.dumps({"access_token": "a", "refresh_token": "r"}).encode()).decode()
    calendar._token_ref("mom@x.com").set({"encryptedToken": token})
    with mock.patch("httpx.post", return_value=mock.Mock(status_code=200)) as post:
        calendar.disconnect_google_calendar("mom@x.com")
    post.assert_called_once()
    assert post.call_args.kwargs["data"] == {"token": "r"}
    assert not calendar._token_ref("mom@x.com").get().exists


def test_restore_respects_plan_limits(monkeypatch):
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setattr(wv, "get_user_doc", lambda email: {})
    restored = []
    monkeypatch.setattr(wv, "restore_weekflow_backup", lambda *a: restored.append(1) or {})
    students = [{"id": f"s{i}", "name": f"Kid {i}"} for i in range(6)]
    backup = {"state": {"family": {"students": students, "adults": []}}, "templates": [], "weeks": []}
    response = _client("free@x.com").post("/labs/weekflow/backup/restore", json={"confirm": True, "backup": backup})
    assert response.status_code == 403 and restored == []
