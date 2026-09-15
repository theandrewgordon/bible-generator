from datetime import date

import pytest

from faithsparks.services.weekflow_meals import (
    default_meals_state,
    normalize_meals_state,
    prune_meals_state,
)
from faithsparks.services.weekflow_store import default_beta_state


def _payload():
    timestamp = "2026-09-14T12:00:00+00:00"
    return {
        "revision": 2,
        "meals": [
            {
                "id": "taco-night",
                "date": "2026-09-15",
                "slot": "dinner",
                "title": "  Tacos   and fruit ",
                "lead_person_id": "parent",
                "note": "Use the slow cooker",
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        ],
        "handoffs": [
            {
                "id": "thaw-chicken",
                "title": "Thaw the chicken",
                "kind": "prep",
                "due_date": "2026-09-14",
                "time_of_day": "morning",
                "assigned_person_id": "diana",
                "meal_id": "taco-night",
                "status": "open",
                "created_at": timestamp,
                "updated_at": timestamp,
                "completed_at": None,
            }
        ],
    }


def test_default_meals_state_is_empty_and_normalized():
    state = normalize_meals_state(
        default_meals_state(), family=default_beta_state()["family"]
    )

    assert state["revision"] == 0
    assert state["meals"] == []
    assert state["handoffs"] == []


def test_meals_and_handoffs_are_normalized_against_the_shared_family():
    state = normalize_meals_state(_payload(), family=default_beta_state()["family"])

    assert state["meals"][0]["title"] == "Tacos and fruit"
    assert state["meals"][0]["lead_person_id"] == "parent"
    assert state["handoffs"][0]["assigned_person_id"] == "diana"
    assert state["handoffs"][0]["meal_id"] == "taco-night"


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda state: state["meals"][0].update(slot="snack"), "slot"),
        (lambda state: state["meals"][0].update(lead_person_id="stranger"), "unknown"),
        (lambda state: state["handoffs"][0].update(assigned_person_id="stranger"), "unknown"),
        (lambda state: state["handoffs"][0].update(meal_id="missing"), "unknown"),
        (lambda state: state["handoffs"][0].update(status="completed"), "completed_at"),
    ],
)
def test_meals_reject_invalid_slots_people_links_and_completion(mutation, message):
    payload = _payload()
    mutation(payload)

    with pytest.raises((TypeError, ValueError), match=message):
        normalize_meals_state(payload, family=default_beta_state()["family"])


def test_meals_reject_two_plans_for_the_same_date_and_slot():
    payload = _payload()
    payload["meals"].append({**payload["meals"][0], "id": "other-dinner"})

    with pytest.raises(ValueError, match="one meal"):
        normalize_meals_state(payload, family=default_beta_state()["family"])


def test_pruning_keeps_open_handoffs_and_clears_links_to_old_meals():
    payload = _payload()
    payload["meals"][0]["date"] = "2026-07-01"
    payload["handoffs"][0]["due_date"] = "2026-07-01"
    state = normalize_meals_state(payload, family=default_beta_state()["family"])

    pruned = prune_meals_state(state, today=date(2026, 9, 14))

    assert pruned["meals"] == []
    assert pruned["handoffs"][0]["meal_id"] is None

    completed = _payload()
    completed["meals"][0]["date"] = "2026-07-01"
    completed["handoffs"][0].update(
        due_date="2026-07-01",
        status="completed",
        completed_at="2026-07-01T12:00:00+00:00",
    )
    normalized = normalize_meals_state(
        completed, family=default_beta_state()["family"]
    )
    assert prune_meals_state(normalized, today=date(2026, 9, 14))["handoffs"] == []
