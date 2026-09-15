from datetime import date

import pytest

from faithsparks.services.weekflow_household import (
    default_household_state,
    household_occurrences,
    normalize_household_state,
    prune_household_completions,
)
from faithsparks.services.weekflow_store import default_beta_state


def _family():
    return default_beta_state()["family"]


def _state():
    timestamp = "2026-09-14T12:00:00+00:00"
    return {
        "revision": 2,
        "routines": [
            {
                "id": "feed-dog",
                "title": "Feed the dog",
                "assigned_person_id": "diana",
                "days": ["mon", "wed", "fri"],
                "time_of_day": "morning",
                "category": "pets",
                "estimated_minutes": 10,
                "active": True,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
            {
                "id": "bins",
                "title": "Take bins out",
                "assigned_person_id": "tessa",
                "days": ["mon"],
                "time_of_day": "evening",
                "category": "outside",
                "estimated_minutes": 5,
                "active": False,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        ],
        "completions": {"feed-dog:2026-09-14": timestamp},
    }


def test_empty_household_state_is_valid():
    state = normalize_household_state(default_household_state(), family=_family())

    assert state["revision"] == 0
    assert state["routines"] == []
    assert state["completions"] == {}


def test_household_state_normalizes_days_and_projects_dated_occurrences():
    state = normalize_household_state(_state(), family=_family())
    occurrences = household_occurrences(
        state,
        family=_family(),
        start_date=date(2026, 9, 14),
        day_count=7,
    )

    assert state["routines"][0]["days"] == ["mon", "wed", "fri"]
    assert [item["date"] for item in occurrences] == [
        "2026-09-14",
        "2026-09-16",
        "2026-09-18",
    ]
    assert occurrences[0]["assigned_person_name"] == "Maya"
    assert occurrences[0]["completed"] is True
    assert occurrences[1]["completed"] is False
    assert all(item["routine_id"] != "bins" for item in occurrences)


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda state: state["routines"][0].update(assigned_person_id="unknown"), "unknown"),
        (lambda state: state["routines"][0].update(days=[]), "at least one"),
        (lambda state: state["routines"][0].update(days=["monday"]), "invalid day"),
        (lambda state: state["routines"][0].update(time_of_day="midnight"), "time_of_day"),
        (lambda state: state["routines"][0].update(estimated_minutes=0), "estimated_minutes"),
        (lambda state: state["completions"].update({"missing:2026-09-14": "2026-09-14T12:00:00+00:00"}), "unknown routine"),
    ],
)
def test_household_state_rejects_invalid_rules(mutation, message):
    state = _state()
    mutation(state)

    with pytest.raises((TypeError, ValueError), match=message):
        normalize_household_state(state, family=_family())


def test_household_completion_history_is_bounded_by_date():
    state = normalize_household_state(_state(), family=_family())
    state["completions"] = {
        "feed-dog:2026-06-01": "2026-06-01T12:00:00+00:00",
        "feed-dog:2026-09-14": "2026-09-14T12:00:00+00:00",
    }

    pruned = prune_household_completions(
        state, today=date(2026, 9, 14), keep_days=70
    )

    assert list(pruned["completions"]) == ["feed-dog:2026-09-14"]
