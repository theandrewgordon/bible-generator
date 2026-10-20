from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest import mock

import pytest

import app
from faithsparks.views import billing
from faithsparks.services import weekflow_calendar as calendar, weekflow_support as support
from fake_firestore import FakeFirestore


def test_pack_ownership_outage_never_opens_checkout(monkeypatch):
    db = FakeFirestore()
    db.collection("collections").document("pack").set({"priceId": "price_pack"})
    db.collection("users").document("a@x.com").set({"purchases": {"pack": True}})
    db.fail_collections.add("users")
    create = mock.Mock()
    monkeypatch.setattr(billing, "db", db)
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing, "stripe", SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=create))))
    with app.app.test_request_context("/buy/pack/pack"):
        app.session["user_email"] = "a@x.com"
        response = billing.buy_pack("pack")
    assert response.status_code == 302
    create.assert_not_called()


def _send(repository, provider, **extra):
    return support.create_and_send_support_request(
        "parent@example.com", {
            "channel": "email", "destination": "helper@example.com",
            "event_id": "pickup", "event_title": "School pickup", "adult_name": "Parent",
            **extra,
        }, secret_key="test-secret-with-at-least-24-characters",
        response_url_builder=lambda token: "https://example.invalid/respond/" + token,
        repository=repository, provider=provider,
    )


def _provider():
    return SimpleNamespace(send=mock.Mock(return_value=SimpleNamespace(
        status="sent", provider="fake", message_id="sent-123",
    )))


def test_status_write_failure_then_retry_does_not_send_twice():
    repository = support.MemorySupportRequestRepository()
    provider = _provider()
    with mock.patch.object(repository, "update", side_effect=RuntimeError("Storage down")):
        first = _send(repository, provider)
    second = _send(repository, provider)
    assert first["notification_status"] == "sent"
    assert second["notification_status"] == "unknown"
    assert first["id"] == second["id"]
    assert len(repository.requests) == 1
    assert provider.send.call_count == 1


def test_concurrent_notification_retries_share_a_delivery_claim():
    repository = support.MemorySupportRequestRepository()
    provider = _provider()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: _send(repository, provider), range(8)))
    assert len({result["id"] for result in results}) == 1
    assert provider.send.call_count == 1


def test_explicit_new_notification_key_allows_intentional_reminder():
    repository = support.MemorySupportRequestRepository()
    provider = _provider()
    first = _send(repository, provider, idempotency_key="original")
    second = _send(repository, provider, idempotency_key="reminder")
    assert first["id"] != second["id"]
    assert provider.send.call_count == 2


def test_firestore_delivery_claim_survives_new_repository(monkeypatch):
    db = FakeFirestore()
    provider = _provider()
    # FakeFirestore has no update() method; simulate an outage after the real
    # transaction claimed delivery, then retry with a separate repository.
    first = _send(support.FirestoreSupportRequestRepository(db), provider)
    second = _send(support.FirestoreSupportRequestRepository(db), provider)
    assert first["id"] == second["id"]
    assert provider.send.call_count == 1


@pytest.mark.parametrize("payload", [
    {"calendars": {}},
    {"calendars": {"primary": {}}},
    {"calendars": {"primary": {"busy": "invalid"}}},
    {"calendars": {"primary": {"busy": [None]}}},
    {"calendars": {"primary": {"busy": [{"start": "bad", "end": "bad"}]}}},
    {"calendars": {"primary": {"busy": [{"start": "2026-10-20T12:00:00Z", "end": "2026-10-20T11:00:00Z"}]}}},
])
def test_incomplete_or_invalid_calendar_availability_is_rejected(payload):
    oauth = SimpleNamespace(post=lambda *a, **k: SimpleNamespace(ok=True, json=lambda: payload))
    with pytest.raises(calendar.WeekFlowCalendarProviderError):
        calendar._fetch_free_busy(
            oauth, calendars=[{"id": "primary", "name": "Family"}],
            time_min="2026-10-19T00:00:00Z", time_max="2026-10-26T00:00:00Z",
            timezone_name="America/New_York",
        )
