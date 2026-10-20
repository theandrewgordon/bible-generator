from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest import mock

import pytest
import app
from fake_firestore import FakeFirestore
from faithsparks.services import users, weekflow_store as store, weekflow_support as support, weekflow_calendar as calendar
from faithsparks.services.weekflow_integrations import WeekFlowProviderError, WeekFlowDeliveryUncertain
from faithsparks.views.admin import gifts


def test_unlimited_gift_clears_old_expiry(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(gifts, "db", db)
    ref = db.collection("users").document("a@example.com")
    ref.set({"giftExpiresAt": datetime.now(timezone.utc) - timedelta(days=1)})
    with app.app.test_request_context("/", method="POST", data={"email":"a@example.com", "plan":"family", "expires":""}):
        gifts.admin_gift()
    assert ref.get().to_dict()["giftExpiresAt"] is None
    assert users.has_active_plus(ref.get().to_dict())


@pytest.mark.parametrize("uncertain", [True, False])
def test_failed_notifications_retry_once_but_uncertain_delivery_does_not(uncertain):
    repo = support.MemorySupportRequestRepository()
    sender = SimpleNamespace(send=mock.Mock(side_effect=(WeekFlowDeliveryUncertain if uncertain else WeekFlowProviderError)("rejected")))
    payload = {"channel":"email", "destination":"helper@example.com", "event_id":"school", "event_title":"School", "adult_name":"Parent"}
    kwargs = dict(secret_key="x"*32, response_url_builder=lambda token:"https://example.com/"+token, repository=repo, provider=sender)
    with pytest.raises(WeekFlowProviderError):
        support.create_and_send_support_request("a@example.com", payload, **kwargs)
    sender.send.side_effect = None
    sender.send.return_value = SimpleNamespace(status="sent", provider="fake", message_id="id")
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: support.create_and_send_support_request("a@example.com", payload, **kwargs), range(2)))
    assert sender.send.call_count == (1 if uncertain else 2)


def test_reset_blocks_stale_main_and_today_saves(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(store, "db", db)
    email = "a@example.com"
    original = store.save_beta_state(email, store.default_beta_state())
    today = store.save_today_state(email, store.default_today_state(), family=original["family"])
    store.delete_beta_state(email)
    reset = store.load_beta_state(email)
    assert reset["reset"] is True
    assert reset["revision"] > original["revision"]
    assert store.load_logistics_state(email)["scenario"] is None
    saved = store.save_beta_state(email, reset)
    assert "reset" not in saved
    with pytest.raises(store.WeekFlowRevisionConflict):
        store.save_beta_state(email, original)
    with pytest.raises(store.WeekFlowRevisionConflict):
        store.save_today_state(email, today, family=reset["family"])


def test_declined_invitation_is_omitted_but_other_attendees_do_not_hide_it():
    event = {"id":"event", "start":{"date":"2026-10-20"}, "end":{"date":"2026-10-21"}, "attendees":[{"self":True,"responseStatus":"declined"}]}
    args = dict(calendar_id="primary", calendar_name="Primary", detail_mode="details")
    assert calendar._normalize_google_event(event, **args) is None
    event["attendees"][0]["self"] = False
    assert calendar._normalize_google_event(event, **args) is not None


def test_calendar_does_not_return_a_silently_truncated_preview():
    def get(path, **kwargs):
        count = kwargs["params"]["maxResults"]
        return SimpleNamespace(ok=True, json=lambda:{"items":[{"id":str(i),"start":{"date":"2026-10-20"},"end":{"date":"2026-10-21"}} for i in range(count)],"nextPageToken":"more"})
    with pytest.raises(calendar.WeekFlowCalendarProviderError, match="preview completely"):
        calendar.preview_google_week(SimpleNamespace(get=get), available_calendars=[{"id":"primary","name":"Primary"}], payload={"calendar_ids":["primary"],"detail_mode":"details","week_start":"2026-10-19"})


def test_logistics_delete_keeps_revision_for_the_next_save(monkeypatch):
    from faithsparks.services.weekflow_logistics import default_logistics_scenario
    db = FakeFirestore()
    monkeypatch.setattr(store, "db", db)
    email = "a@example.com"
    original = store.save_logistics_state(email, {"revision":0,"scenario":default_logistics_scenario()})
    revision = store.delete_logistics_state(email)
    assert revision > original["revision"]
    with pytest.raises(store.WeekFlowRevisionConflict):
        store.save_logistics_state(email, original)
    store.save_logistics_state(email, {"revision":revision,"scenario":default_logistics_scenario()})
