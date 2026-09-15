"""Light travel and guest plans with explicit family handoffs."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from faithsparks.services.weekflow_today import family_people

TRAVEL_STATE_SCHEMA_VERSION = 1
MAX_TRAVEL_PLANS = 100
MAX_TRAVEL_HANDOFFS = 280
MAX_TRAVEL_STATE_BYTES = 180_000
PLAN_KINDS = {"trip", "guests"}
HANDOFF_KINDS = {"packing", "booking", "hosting", "errand", "other"}
TIME_OF_DAY = {"morning", "afternoon", "evening", "anytime"}
HANDOFF_STATUSES = {"open", "completed"}


def default_travel_state() -> dict[str, object]:
    return {
        "schema_version": TRAVEL_STATE_SCHEMA_VERSION,
        "revision": 0,
        "plans": [],
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


def normalize_travel_state(payload: object, *, family: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("travel state must be a JSON object")
    if (
        len(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
        > MAX_TRAVEL_STATE_BYTES
    ):
        raise ValueError("travel state is too large")
    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")
    people = {person["id"] for person in family_people(family)}

    raw_plans = payload.get("plans", [])
    if not isinstance(raw_plans, list) or len(raw_plans) > MAX_TRAVEL_PLANS:
        raise ValueError(
            f"plans must be a list with at most {MAX_TRAVEL_PLANS} entries"
        )
    plan_ids: set[str] = set()
    plans: list[dict[str, object]] = []
    for index, raw in enumerate(raw_plans):
        if not isinstance(raw, dict):
            raise TypeError(f"plans.{index} must be a JSON object")
        plan_id = _safe_id(raw.get("id"), f"plans.{index}.id")
        if plan_id in plan_ids:
            raise ValueError("plan ids must be unique")
        plan_ids.add(plan_id)
        kind = raw.get("kind", "trip")
        if kind not in PLAN_KINDS:
            raise ValueError(f"plans.{index}.kind is invalid")
        start_date = _iso_date(raw.get("start_date"), f"plans.{index}.start_date")
        end_date = _iso_date(raw.get("end_date"), f"plans.{index}.end_date")
        if end_date < start_date:
            raise ValueError(f"plans.{index}.end_date cannot be before start_date")
        lead_id = raw.get("lead_person_id")
        if lead_id not in (None, ""):
            lead_id = _safe_id(lead_id, f"plans.{index}.lead_person_id")
            if lead_id not in people:
                raise ValueError(f"plans.{index}.lead_person_id is unknown")
        else:
            lead_id = None
        plans.append(
            {
                "id": plan_id,
                "kind": kind,
                "title": _clean_text(
                    raw.get("title"), f"plans.{index}.title", maximum=140
                ),
                "start_date": start_date,
                "end_date": end_date,
                "location": _optional_text(
                    raw.get("location"), f"plans.{index}.location", maximum=160
                ),
                "lead_person_id": lead_id,
                "note": _optional_text(
                    raw.get("note"), f"plans.{index}.note", maximum=300
                ),
                "created_at": _timestamp(
                    raw.get("created_at"), f"plans.{index}.created_at"
                ),
                "updated_at": _timestamp(
                    raw.get("updated_at"), f"plans.{index}.updated_at"
                ),
            }
        )

    raw_handoffs = payload.get("handoffs", [])
    if not isinstance(raw_handoffs, list) or len(raw_handoffs) > MAX_TRAVEL_HANDOFFS:
        raise ValueError(
            f"handoffs must be a list with at most {MAX_TRAVEL_HANDOFFS} entries"
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
        kind = raw.get("kind", "other")
        if kind not in HANDOFF_KINDS:
            raise ValueError(f"handoffs.{index}.kind is invalid")
        time_of_day = raw.get("time_of_day", "anytime")
        if time_of_day not in TIME_OF_DAY:
            raise ValueError(f"handoffs.{index}.time_of_day is invalid")
        plan_id = raw.get("plan_id")
        if plan_id not in (None, ""):
            plan_id = _safe_id(plan_id, f"handoffs.{index}.plan_id")
            if plan_id not in plan_ids:
                raise ValueError(f"handoffs.{index}.plan_id is unknown")
        else:
            plan_id = None
        status = raw.get("status", "open")
        if status not in HANDOFF_STATUSES:
            raise ValueError(f"handoffs.{index}.status is invalid")
        completed_at = _timestamp(
            raw.get("completed_at"), f"handoffs.{index}.completed_at", required=False
        )
        if status == "completed" and completed_at is None:
            raise ValueError("completed travel handoffs must include completed_at")
        if status != "completed":
            completed_at = None
        handoffs.append(
            {
                "id": handoff_id,
                "title": _clean_text(
                    raw.get("title"), f"handoffs.{index}.title", maximum=160
                ),
                "kind": kind,
                "due_date": _iso_date(
                    raw.get("due_date"), f"handoffs.{index}.due_date"
                ),
                "time_of_day": time_of_day,
                "assigned_person_id": assigned_id,
                "plan_id": plan_id,
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
    plans.sort(key=lambda item: (str(item["start_date"]), str(item["title"])))
    handoffs.sort(key=lambda item: (str(item["due_date"]), str(item["title"])))
    return {
        "schema_version": TRAVEL_STATE_SCHEMA_VERSION,
        "revision": revision,
        "plans": plans,
        "handoffs": handoffs,
        "updated_at": payload.get("updated_at"),
    }


def prune_travel_state(
    state: dict[str, object], *, today: date | None = None
) -> dict[str, object]:
    """Bound old history while retaining every unfinished handoff."""

    oldest = (today or date.today()) - timedelta(days=90)
    plans = [
        plan
        for plan in state.get("plans", [])
        if date.fromisoformat(plan["end_date"]) >= oldest
    ]
    plan_ids = {plan["id"] for plan in plans}
    handoffs = [
        {**item, "plan_id": item["plan_id"] if item["plan_id"] in plan_ids else None}
        for item in state.get("handoffs", [])
        if item["status"] != "completed"
        or date.fromisoformat(item["due_date"]) >= oldest
    ]
    return {**state, "plans": plans, "handoffs": handoffs}
