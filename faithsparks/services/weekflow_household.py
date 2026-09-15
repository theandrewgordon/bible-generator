"""Recurring household responsibilities for WeekFlow's adult-owned family plan."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from faithsparks.services.weekflow_today import family_people

HOUSEHOLD_STATE_SCHEMA_VERSION = 1
MAX_HOUSEHOLD_ROUTINES = 120
MAX_HOUSEHOLD_COMPLETIONS = 1_000
MAX_HOUSEHOLD_STATE_BYTES = 180_000
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TIME_OF_DAY = {"morning", "afternoon", "evening", "anytime"}
CATEGORIES = {"home", "kitchen", "laundry", "pets", "care", "outside", "other"}


def default_household_state() -> dict[str, object]:
    return {
        "schema_version": HOUSEHOLD_STATE_SCHEMA_VERSION,
        "revision": 0,
        "routines": [],
        "completions": {},
        "updated_at": None,
    }


def _clean_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > maximum:
        raise ValueError(f"{field} must be between 1 and {maximum} characters")
    return cleaned


def _safe_id(value: object, field: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 64
        or not all(character.isalnum() or character in "-_" for character in value)
    ):
        raise ValueError(f"{field} must use letters, numbers, dashes, or underscores")
    return value


def _timestamp(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be an ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.astimezone(UTC).isoformat()


def _completion_key(value: object, routine_ids: set[str]) -> tuple[str, str]:
    if not isinstance(value, str) or ":" not in value or len(value) > 80:
        raise ValueError("completion keys must identify a routine and date")
    routine_id, date_value = value.rsplit(":", 1)
    _safe_id(routine_id, "completion routine id")
    if routine_id not in routine_ids:
        raise ValueError("completion references an unknown routine")
    try:
        normalized_date = date.fromisoformat(date_value).isoformat()
    except ValueError as exc:
        raise ValueError("completion keys must include an ISO date") from exc
    return routine_id, normalized_date


def normalize_household_state(payload: object, *, family: object) -> dict[str, object]:
    """Validate the independently revisioned household routine document."""

    if not isinstance(payload, dict):
        raise TypeError("household state must be a JSON object")
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    if len(encoded) > MAX_HOUSEHOLD_STATE_BYTES:
        raise ValueError("household state is too large")
    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")
    raw_routines = payload.get("routines", [])
    if not isinstance(raw_routines, list) or len(raw_routines) > MAX_HOUSEHOLD_ROUTINES:
        raise ValueError(
            f"routines must be a list with at most {MAX_HOUSEHOLD_ROUTINES} entries"
        )

    people = {person["id"] for person in family_people(family)}
    identifiers: set[str] = set()
    routines: list[dict[str, object]] = []
    for index, raw in enumerate(raw_routines):
        if not isinstance(raw, dict):
            raise TypeError(f"routines.{index} must be a JSON object")
        routine_id = _safe_id(raw.get("id"), f"routines.{index}.id")
        if routine_id in identifiers:
            raise ValueError("routine ids must be unique")
        identifiers.add(routine_id)
        person_id = _safe_id(
            raw.get("assigned_person_id"),
            f"routines.{index}.assigned_person_id",
        )
        if person_id not in people:
            raise ValueError(f"routines.{index}.assigned_person_id is unknown")
        raw_days = raw.get("days")
        if not isinstance(raw_days, list) or not raw_days:
            raise ValueError(f"routines.{index}.days must include at least one day")
        days = [str(day) for day in raw_days]
        if len(set(days)) != len(days) or any(day not in DAYS for day in days):
            raise ValueError(f"routines.{index}.days contains an invalid day")
        time_of_day = raw.get("time_of_day", "anytime")
        if time_of_day not in TIME_OF_DAY:
            raise ValueError(f"routines.{index}.time_of_day is invalid")
        category = raw.get("category", "home")
        if category not in CATEGORIES:
            raise ValueError(f"routines.{index}.category is invalid")
        minutes = raw.get("estimated_minutes", 10)
        if (
            not isinstance(minutes, int)
            or isinstance(minutes, bool)
            or not 1 <= minutes <= 240
        ):
            raise ValueError(f"routines.{index}.estimated_minutes is invalid")
        active = raw.get("active", True)
        if not isinstance(active, bool):
            raise TypeError(f"routines.{index}.active must be a boolean")
        routines.append(
            {
                "id": routine_id,
                "title": _clean_text(
                    raw.get("title"), f"routines.{index}.title", maximum=120
                ),
                "assigned_person_id": person_id,
                "days": [day for day in DAYS if day in days],
                "time_of_day": time_of_day,
                "category": category,
                "estimated_minutes": minutes,
                "active": active,
                "created_at": _timestamp(
                    raw.get("created_at"), f"routines.{index}.created_at"
                ),
                "updated_at": _timestamp(
                    raw.get("updated_at"), f"routines.{index}.updated_at"
                ),
            }
        )

    raw_completions = payload.get("completions", {})
    if (
        not isinstance(raw_completions, dict)
        or len(raw_completions) > MAX_HOUSEHOLD_COMPLETIONS
    ):
        raise ValueError(
            f"completions must contain at most {MAX_HOUSEHOLD_COMPLETIONS} entries"
        )
    completions: dict[str, str] = {}
    for raw_key, raw_timestamp in raw_completions.items():
        routine_id, completed_date = _completion_key(raw_key, identifiers)
        completions[f"{routine_id}:{completed_date}"] = _timestamp(
            raw_timestamp, f"completions.{raw_key}"
        )

    return {
        "schema_version": HOUSEHOLD_STATE_SCHEMA_VERSION,
        "revision": revision,
        "routines": routines,
        "completions": completions,
        "updated_at": payload.get("updated_at"),
    }


def prune_household_completions(
    state: dict[str, object], *, today: date | None = None, keep_days: int = 70
) -> dict[str, object]:
    """Bound completion history while retaining enough context for weekly habits."""

    today_value = today or date.today()
    earliest = today_value - timedelta(days=max(14, min(keep_days, 180)))
    latest = today_value + timedelta(days=14)
    completions = {
        key: value
        for key, value in state.get("completions", {}).items()
        if earliest <= date.fromisoformat(key.rsplit(":", 1)[1]) <= latest
    }
    return {**state, "completions": completions}


def household_occurrences(
    state: dict[str, object],
    *,
    family: object,
    start_date: date,
    day_count: int = 7,
) -> list[dict[str, object]]:
    """Project routines into dated occurrences without copying them into Today."""

    normalized = normalize_household_state(state, family=family)
    people = {person["id"]: person for person in family_people(family)}
    count = max(1, min(int(day_count), 31))
    occurrences: list[dict[str, object]] = []
    for offset in range(count):
        occurrence_date = start_date + timedelta(days=offset)
        day_id = DAYS[occurrence_date.weekday()]
        for routine in normalized["routines"]:
            if not routine["active"] or day_id not in routine["days"]:
                continue
            key = f"{routine['id']}:{occurrence_date.isoformat()}"
            completed_at = normalized["completions"].get(key)
            person = people[routine["assigned_person_id"]]
            occurrences.append(
                {
                    "id": key,
                    "routine_id": routine["id"],
                    "date": occurrence_date.isoformat(),
                    "day": day_id,
                    "title": routine["title"],
                    "assigned_person_id": routine["assigned_person_id"],
                    "assigned_person_name": person["name"],
                    "assigned_person_color": person["color"],
                    "time_of_day": routine["time_of_day"],
                    "category": routine["category"],
                    "estimated_minutes": routine["estimated_minutes"],
                    "completed": completed_at is not None,
                    "completed_at": completed_at,
                }
            )
    order = {"morning": 0, "afternoon": 1, "evening": 2, "anytime": 3}
    occurrences.sort(
        key=lambda item: (
            item["date"],
            order[item["time_of_day"]],
            str(item["assigned_person_name"]),
            str(item["title"]),
        )
    )
    return occurrences
