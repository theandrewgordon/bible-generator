"""Small weekly meal plans and their explicit family handoffs."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from faithsparks.services.weekflow_today import family_people

MEALS_STATE_SCHEMA_VERSION = 1
MAX_MEALS = 140
MAX_MEAL_HANDOFFS = 280
MAX_MEALS_STATE_BYTES = 180_000
MEAL_SLOTS = {"breakfast", "lunch", "dinner"}
HANDOFF_KINDS = {"shopping", "prep", "other"}
TIME_OF_DAY = {"morning", "afternoon", "evening", "anytime"}
HANDOFF_STATUSES = {"open", "completed"}


def default_meals_state() -> dict[str, object]:
    return {
        "schema_version": MEALS_STATE_SCHEMA_VERSION,
        "revision": 0,
        "meals": [],
        "handoffs": [],
        "updated_at": None,
    }


def _clean_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > maximum:
        raise ValueError(f"{field} must be between 1 and {maximum} characters")
    return cleaned


def _optional_text(value: object, field: str, *, maximum: int) -> str | None:
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


def _iso_date(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be an ISO date")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO date") from exc


def _timestamp(value: object, field: str, *, required: bool = True) -> str | None:
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


def normalize_meals_state(payload: object, *, family: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("meals state must be a JSON object")
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    if len(encoded) > MAX_MEALS_STATE_BYTES:
        raise ValueError("meals state is too large")
    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")
    people = {person["id"] for person in family_people(family)}

    raw_meals = payload.get("meals", [])
    if not isinstance(raw_meals, list) or len(raw_meals) > MAX_MEALS:
        raise ValueError(f"meals must be a list with at most {MAX_MEALS} entries")
    meal_ids: set[str] = set()
    meals: list[dict[str, object]] = []
    for index, raw in enumerate(raw_meals):
        if not isinstance(raw, dict):
            raise TypeError(f"meals.{index} must be a JSON object")
        meal_id = _safe_id(raw.get("id"), f"meals.{index}.id")
        if meal_id in meal_ids:
            raise ValueError("meal ids must be unique")
        meal_ids.add(meal_id)
        slot = raw.get("slot", "dinner")
        if slot not in MEAL_SLOTS:
            raise ValueError(f"meals.{index}.slot is invalid")
        lead_id = raw.get("lead_person_id")
        if lead_id not in (None, ""):
            lead_id = _safe_id(lead_id, f"meals.{index}.lead_person_id")
            if lead_id not in people:
                raise ValueError(f"meals.{index}.lead_person_id is unknown")
        else:
            lead_id = None
        meals.append(
            {
                "id": meal_id,
                "date": _iso_date(raw.get("date"), f"meals.{index}.date"),
                "slot": slot,
                "title": _clean_text(
                    raw.get("title"), f"meals.{index}.title", maximum=120
                ),
                "lead_person_id": lead_id,
                "note": _optional_text(
                    raw.get("note"), f"meals.{index}.note", maximum=240
                ),
                "created_at": _timestamp(
                    raw.get("created_at"), f"meals.{index}.created_at"
                ),
                "updated_at": _timestamp(
                    raw.get("updated_at"), f"meals.{index}.updated_at"
                ),
            }
        )
    if len({(meal["date"], meal["slot"]) for meal in meals}) != len(meals):
        raise ValueError("each date may contain only one meal in each slot")

    raw_handoffs = payload.get("handoffs", [])
    if not isinstance(raw_handoffs, list) or len(raw_handoffs) > MAX_MEAL_HANDOFFS:
        raise ValueError(
            f"handoffs must be a list with at most {MAX_MEAL_HANDOFFS} entries"
        )
    handoff_ids: set[str] = set()
    handoffs: list[dict[str, object]] = []
    for index, raw in enumerate(raw_handoffs):
        if not isinstance(raw, dict):
            raise TypeError(f"handoffs.{index} must be a JSON object")
        handoff_id = _safe_id(raw.get("id"), f"handoffs.{index}.id")
        if handoff_id in handoff_ids:
            raise ValueError("handoff ids must be unique")
        handoff_ids.add(handoff_id)
        assigned_id = _safe_id(
            raw.get("assigned_person_id"), f"handoffs.{index}.assigned_person_id"
        )
        if assigned_id not in people:
            raise ValueError(f"handoffs.{index}.assigned_person_id is unknown")
        kind = raw.get("kind", "prep")
        if kind not in HANDOFF_KINDS:
            raise ValueError(f"handoffs.{index}.kind is invalid")
        time_of_day = raw.get("time_of_day", "anytime")
        if time_of_day not in TIME_OF_DAY:
            raise ValueError(f"handoffs.{index}.time_of_day is invalid")
        meal_id = raw.get("meal_id")
        if meal_id not in (None, ""):
            meal_id = _safe_id(meal_id, f"handoffs.{index}.meal_id")
            if meal_id not in meal_ids:
                raise ValueError(f"handoffs.{index}.meal_id is unknown")
        else:
            meal_id = None
        status = raw.get("status", "open")
        if status not in HANDOFF_STATUSES:
            raise ValueError(f"handoffs.{index}.status is invalid")
        completed_at = _timestamp(
            raw.get("completed_at"),
            f"handoffs.{index}.completed_at",
            required=False,
        )
        if status == "completed" and completed_at is None:
            raise ValueError("completed meal handoffs must include completed_at")
        if status != "completed":
            completed_at = None
        handoffs.append(
            {
                "id": handoff_id,
                "title": _clean_text(
                    raw.get("title"), f"handoffs.{index}.title", maximum=140
                ),
                "kind": kind,
                "due_date": _iso_date(
                    raw.get("due_date"), f"handoffs.{index}.due_date"
                ),
                "time_of_day": time_of_day,
                "assigned_person_id": assigned_id,
                "meal_id": meal_id,
                "status": status,
                "created_at": _timestamp(
                    raw.get("created_at"), f"handoffs.{index}.created_at"
                ),
                "updated_at": _timestamp(
                    raw.get("updated_at"), f"handoffs.{index}.updated_at"
                ),
                "completed_at": completed_at,
            }
        )

    meals.sort(key=lambda item: (str(item["date"]), str(item["slot"])))
    handoffs.sort(key=lambda item: (str(item["due_date"]), str(item["title"])))
    return {
        "schema_version": MEALS_STATE_SCHEMA_VERSION,
        "revision": revision,
        "meals": meals,
        "handoffs": handoffs,
        "updated_at": payload.get("updated_at"),
    }


def prune_meals_state(
    state: dict[str, object], *, today: date | None = None
) -> dict[str, object]:
    """Drop old display history while never discarding unfinished handoffs."""

    today_value = today or date.today()
    oldest = today_value - timedelta(days=35)
    meals = [
        meal for meal in state.get("meals", []) if date.fromisoformat(meal["date"]) >= oldest
    ]
    meal_ids = {meal["id"] for meal in meals}
    handoffs = [
        {**handoff, "meal_id": handoff["meal_id"] if handoff["meal_id"] in meal_ids else None}
        for handoff in state.get("handoffs", [])
        if handoff["status"] != "completed"
        or date.fromisoformat(handoff["due_date"]) >= oldest
    ]
    return {**state, "meals": meals, "handoffs": handoffs}
