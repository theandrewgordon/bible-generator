from datetime import date

import pytest

from faithsparks.services.weekflow_store import default_beta_state
from faithsparks.services.weekflow_travel import (
    default_travel_state,
    normalize_travel_state,
    prune_travel_state,
)


def _payload():
    timestamp = "2026-09-15T12:00:00+00:00"
    return {
        "revision": 1,
        "plans": [
            {
                "id": "grandma",
                "kind": "trip",
                "title": "Visit Grandma",
                "start_date": "2026-09-18",
                "end_date": "2026-09-20",
                "location": "Grandma's house",
                "lead_person_id": "parent",
                "note": "Bring school books",
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        ],
        "handoffs": [
            {
                "id": "pack-books",
                "title": "Pack the library books",
                "kind": "packing",
                "due_date": "2026-09-17",
                "time_of_day": "evening",
                "assigned_person_id": "diana",
                "plan_id": "grandma",
                "status": "open",
                "created_at": timestamp,
                "updated_at": timestamp,
                "completed_at": None,
            }
        ],
    }


def test_default_travel_state_is_empty_and_normalized():
    state = normalize_travel_state(
        default_travel_state(), family=default_beta_state()["family"]
    )
    assert state["revision"] == 0
    assert state["plans"] == []
    assert state["handoffs"] == []


def test_travel_plan_and_handoff_use_shared_family_people():
    state = normalize_travel_state(_payload(), family=default_beta_state()["family"])
    assert state["plans"][0]["lead_person_id"] == "parent"
    assert state["handoffs"][0]["assigned_person_id"] == "diana"
    assert state["handoffs"][0]["plan_id"] == "grandma"


@pytest.mark.parametrize(
    "mutation,message",
    [
        (lambda state: state["plans"][0].update(kind="cruise"), "kind"),
        (lambda state: state["plans"][0].update(end_date="2026-09-17"), "before"),
        (lambda state: state["plans"][0].update(lead_person_id="stranger"), "unknown"),
        (
            lambda state: state["handoffs"][0].update(assigned_person_id="stranger"),
            "unknown",
        ),
        (lambda state: state["handoffs"][0].update(plan_id="missing"), "unknown"),
        (lambda state: state["handoffs"][0].update(status="completed"), "completed_at"),
    ],
)
def test_travel_rejects_invalid_dates_kinds_people_links_and_completion(
    mutation, message
):
    payload = _payload()
    mutation(payload)
    with pytest.raises((TypeError, ValueError), match=message):
        normalize_travel_state(payload, family=default_beta_state()["family"])


def test_pruning_keeps_open_handoffs_and_drops_old_completed_history():
    payload = _payload()
    payload["plans"][0].update(start_date="2026-01-01", end_date="2026-01-03")
    payload["handoffs"][0]["due_date"] = "2026-01-01"
    state = normalize_travel_state(payload, family=default_beta_state()["family"])
    pruned = prune_travel_state(state, today=date(2026, 9, 15))
    assert pruned["plans"] == []
    assert pruned["handoffs"][0]["plan_id"] is None

    payload = _payload()
    payload["plans"][0].update(start_date="2026-01-01", end_date="2026-01-03")
    payload["handoffs"][0].update(
        due_date="2026-01-01",
        status="completed",
        completed_at="2026-01-01T12:00:00+00:00",
    )
    state = normalize_travel_state(payload, family=default_beta_state()["family"])
    assert prune_travel_state(state, today=date(2026, 9, 15))["handoffs"] == []
