"""Validation and presentation helpers for the WeekFlow Today workspace."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

TODAY_STATE_SCHEMA_VERSION = 1
MAX_TODAY_ITEMS = 500
MAX_TODAY_STATE_BYTES = 160_000

AREA_LABELS = {
    "inbox": "Inbox",
    "homeschool": "Homeschool",
    "kids": "Kids",
    "schedule": "Schedule",
    "home": "Household",
    "meals": "Meals",
    "medical": "Medical",
    "travel": "Travel & guests",
    "me": "Me",
}
PRIORITIES = {"high", "normal", "low"}
STATUSES = {"open", "waiting", "completed"}


def default_today_state() -> dict[str, object]:
    return {
        "schema_version": TODAY_STATE_SCHEMA_VERSION,
        "revision": 0,
        "items": [],
        "updated_at": None,
    }


def _clean_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > maximum:
        raise ValueError(f"{field} must be between 1 and {maximum} characters")
    return cleaned


def _clean_optional_text(value: object, field: str, *, maximum: int) -> str | None:
    if value in (None, ""):
        return None
    return _clean_text(value, field, maximum=maximum)


def _safe_id(value: object, field: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 64
        or not all(character.isalnum() or character in "-_" for character in value)
    ):
        raise ValueError(f"{field} must use letters, numbers, dashes, or underscores")
    return value


def _iso_date(value: object, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise TypeError(f"{field} must be an ISO date")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO date") from exc


def _iso_datetime(value: object, field: str, *, required: bool) -> str | None:
    if value in (None, "") and not required:
        return None
    if not isinstance(value, str):
        raise TypeError(f"{field} must be an ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.astimezone(UTC).isoformat()


def family_people(family: object) -> list[dict[str, str]]:
    """Return adults and students from the established WeekFlow family record."""

    if not isinstance(family, dict):
        raise TypeError("family must be a JSON object")
    people: list[dict[str, str]] = []
    for role, key in (("adult", "adults"), ("student", "students")):
        raw_people = family.get(key)
        if not isinstance(raw_people, dict):
            raise TypeError(f"family.{key} must be a JSON object")
        for person_id, raw_person in raw_people.items():
            if not isinstance(raw_person, dict):
                raise TypeError(f"family.{key}.{person_id} must be a JSON object")
            people.append(
                {
                    "id": _safe_id(person_id, f"family.{key} id"),
                    "name": _clean_text(
                        raw_person.get("name"),
                        f"family.{key}.{person_id}.name",
                        maximum=60,
                    ),
                    "color": str(raw_person.get("color") or "#315f53"),
                    "role": role,
                }
            )
    return people


def normalize_today_state(payload: object, *, family: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("WeekFlow Today state must be a JSON object")
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    if len(encoded) > MAX_TODAY_STATE_BYTES:
        raise ValueError("WeekFlow Today state is too large")

    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")

    raw_items = payload.get("items", [])
    if not isinstance(raw_items, list) or len(raw_items) > MAX_TODAY_ITEMS:
        raise ValueError(
            f"items must be a list with at most {MAX_TODAY_ITEMS} entries"
        )

    person_ids = {person["id"] for person in family_people(family)}
    identifiers: set[str] = set()
    items: list[dict[str, object]] = []
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raise TypeError(f"items.{index} must be a JSON object")
        item_id = _safe_id(raw_item.get("id"), f"items.{index}.id")
        if item_id in identifiers:
            raise ValueError("item ids must be unique")
        identifiers.add(item_id)

        area = raw_item.get("area", "inbox")
        if area not in AREA_LABELS:
            raise ValueError(f"items.{index}.area is invalid")
        priority = raw_item.get("priority", "normal")
        if priority not in PRIORITIES:
            raise ValueError(f"items.{index}.priority is invalid")
        status = raw_item.get("status", "open")
        if status not in STATUSES:
            raise ValueError(f"items.{index}.status is invalid")
        assigned_person_id = _clean_optional_text(
            raw_item.get("assigned_person_id"),
            f"items.{index}.assigned_person_id",
            maximum=64,
        )
        if assigned_person_id and assigned_person_id not in person_ids:
            raise ValueError(f"items.{index}.assigned_person_id is unknown")

        completed_at = _iso_datetime(
            raw_item.get("completed_at"),
            f"items.{index}.completed_at",
            required=False,
        )
        if status == "completed" and completed_at is None:
            raise ValueError("completed items must include completed_at")
        if status != "completed":
            completed_at = None

        items.append(
            {
                "id": item_id,
                "title": _clean_text(
                    raw_item.get("title"), f"items.{index}.title", maximum=160
                ),
                "area": area,
                "assigned_person_id": assigned_person_id,
                "due_date": _iso_date(
                    raw_item.get("due_date"), f"items.{index}.due_date"
                ),
                "priority": priority,
                "status": status,
                "created_at": _iso_datetime(
                    raw_item.get("created_at"),
                    f"items.{index}.created_at",
                    required=True,
                ),
                "updated_at": _iso_datetime(
                    raw_item.get("updated_at"),
                    f"items.{index}.updated_at",
                    required=True,
                ),
                "completed_at": completed_at,
            }
        )

    return {
        "schema_version": TODAY_STATE_SCHEMA_VERSION,
        "revision": revision,
        "items": items,
        "updated_at": payload.get("updated_at"),
    }


def today_attention_counts(
    state: dict[str, object], *, today: date | None = None
) -> dict[str, int]:
    """Build small, non-overlapping overview counts without running a planner."""

    today_value = today or date.today()
    counts = {
        "open": 0,
        "overdue": 0,
        "due_today": 0,
        "high_priority": 0,
        "waiting": 0,
        "completed": 0,
    }
    for item in state.get("items", []):
        status = item["status"]
        if status == "completed":
            counts["completed"] += 1
            continue
        if status == "waiting":
            counts["waiting"] += 1
            continue
        counts["open"] += 1
        due_date = date.fromisoformat(item["due_date"]) if item["due_date"] else None
        if due_date and due_date < today_value:
            counts["overdue"] += 1
        elif due_date == today_value:
            counts["due_today"] += 1
        elif item["priority"] == "high":
            counts["high_priority"] += 1
    return counts
