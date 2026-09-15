from datetime import date

import pytest

from faithsparks.services.weekflow_medical import (
    default_medical_state,
    normalize_medical_state,
    prune_medical_state,
)
from faithsparks.services.weekflow_store import default_beta_state


def _payload():
    timestamp = "2026-09-15T12:00:00+00:00"
    return {
        "revision": 1,
        "items": [{"id": "dentist", "title": "Dentist appointment", "kind": "appointment", "for_person_id": "diana", "assigned_person_id": "parent", "date": "2026-09-18", "time": "10:30", "provider": "Family dentist", "location": "Main Street office", "note": "Bring completed form", "status": "open", "created_at": timestamp, "updated_at": timestamp, "completed_at": None}],
    }


def test_default_medical_state_is_empty_and_normalized():
    state = normalize_medical_state(default_medical_state(), family=default_beta_state()["family"])
    assert state["revision"] == 0
    assert state["items"] == []


def test_care_item_is_normalized_against_shared_family_people():
    state = normalize_medical_state(_payload(), family=default_beta_state()["family"])
    assert state["items"][0]["for_person_id"] == "diana"
    assert state["items"][0]["assigned_person_id"] == "parent"
    assert state["items"][0]["time"] == "10:30"


@pytest.mark.parametrize(
    "mutation,message",
    [
        (lambda state: state["items"][0].update(kind="diagnosis"), "kind"),
        (lambda state: state["items"][0].update(for_person_id="stranger"), "unknown"),
        (lambda state: state["items"][0].update(assigned_person_id="stranger"), "unknown"),
        (lambda state: state["items"][0].update(time="25:00"), "24-hour"),
        (lambda state: state["items"][0].update(status="completed"), "completed_at"),
    ],
)
def test_care_items_reject_invalid_kinds_people_times_and_completion(mutation, message):
    payload = _payload()
    mutation(payload)
    with pytest.raises((TypeError, ValueError), match=message):
        normalize_medical_state(payload, family=default_beta_state()["family"])


def test_pruning_keeps_open_items_and_drops_old_completed_history():
    payload = _payload()
    payload["items"][0]["date"] = "2026-01-01"
    state = normalize_medical_state(payload, family=default_beta_state()["family"])
    assert len(prune_medical_state(state, today=date(2026, 9, 15))["items"]) == 1

    payload["items"][0].update(status="completed", completed_at="2026-01-01T12:00:00+00:00")
    state = normalize_medical_state(payload, family=default_beta_state()["family"])
    assert prune_medical_state(state, today=date(2026, 9, 15))["items"] == []
