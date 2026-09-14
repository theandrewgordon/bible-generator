from datetime import date

import pytest

from faithsparks.services.weekflow_store import default_beta_state
from faithsparks.services.weekflow_today import (
    default_today_state,
    normalize_today_state,
    today_attention_counts,
)


def _item(**changes):
    item = {
        "id": "item-1",
        "title": "Call the pediatrician",
        "area": "medical",
        "assigned_person_id": "parent",
        "due_date": "2026-09-14",
        "priority": "high",
        "status": "open",
        "created_at": "2026-09-13T12:00:00Z",
        "updated_at": "2026-09-13T12:00:00Z",
        "completed_at": None,
    }
    item.update(changes)
    return item


def test_today_state_defaults_to_an_empty_lightweight_workspace():
    state = normalize_today_state(
        default_today_state(), family=default_beta_state()["family"]
    )

    assert state == {
        "schema_version": 1,
        "revision": 0,
        "items": [],
        "updated_at": None,
    }


def test_today_state_normalizes_items_and_attention_counts_without_a_schedule():
    family = default_beta_state()["family"]
    state = normalize_today_state(
        {
            "revision": 3,
            "items": [
                _item(),
                _item(
                    id="overdue",
                    title="Pack co-op bag",
                    area="homeschool",
                    due_date="2026-09-13",
                    priority="normal",
                ),
                _item(
                    id="waiting",
                    title="Hear back from coach",
                    area="kids",
                    due_date=None,
                    status="waiting",
                ),
                _item(
                    id="completed",
                    title="Order refill",
                    status="completed",
                    completed_at="2026-09-14T13:00:00-04:00",
                ),
            ],
        },
        family=family,
    )

    assert state["items"][0]["created_at"] == "2026-09-13T12:00:00+00:00"
    assert today_attention_counts(state, today=date(2026, 9, 14)) == {
        "open": 2,
        "overdue": 1,
        "due_today": 1,
        "high_priority": 0,
        "waiting": 1,
        "completed": 1,
    }


@pytest.mark.parametrize(
    "change, error",
    [
        ({"area": "banking"}, "area"),
        ({"assigned_person_id": "unknown"}, "assigned_person_id"),
        ({"due_date": "tomorrow"}, "ISO date"),
        ({"priority": "urgent"}, "priority"),
        ({"status": "done"}, "status"),
        ({"status": "completed", "completed_at": None}, "completed_at"),
        ({"created_at": "2026-09-14T12:00:00"}, "timezone"),
    ],
)
def test_today_state_rejects_invalid_items(change, error):
    with pytest.raises((TypeError, ValueError), match=error):
        normalize_today_state(
            {"revision": 0, "items": [_item(**change)]},
            family=default_beta_state()["family"],
        )


def test_today_state_rejects_duplicate_ids():
    with pytest.raises(ValueError, match="unique"):
        normalize_today_state(
            {"revision": 0, "items": [_item(), _item()]},
            family=default_beta_state()["family"],
        )
