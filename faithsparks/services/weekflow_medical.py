"""Privacy-minimized family care coordination for WeekFlow."""

from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime, timedelta

from faithsparks.services.weekflow_today import family_people

MEDICAL_STATE_SCHEMA_VERSION = 1
MAX_CARE_ITEMS = 300
MAX_MEDICAL_STATE_BYTES = 180_000
CARE_KINDS = {"appointment", "refill", "form", "records", "billing", "vaccine", "other"}
CARE_STATUSES = {"open", "completed"}
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def default_medical_state() -> dict[str, object]:
    return {
        "schema_version": MEDICAL_STATE_SCHEMA_VERSION,
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


def _optional_text(value: object, field: str, *, maximum: int) -> str | None:
    if value in (None, ""):
        return None
    return _clean_text(value, field, maximum=maximum)


def _safe_id(value: object, field: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 64 or not all(
        character.isalnum() or character in "-_" for character in value
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


def _time(value: object, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not TIME_RE.fullmatch(value):
        raise ValueError(f"{field} must use 24-hour HH:MM time")
    return value


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


def normalize_medical_state(payload: object, *, family: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("medical state must be a JSON object")
    if len(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()) > MAX_MEDICAL_STATE_BYTES:
        raise ValueError("medical state is too large")
    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")
    people = {person["id"] for person in family_people(family)}
    raw_items = payload.get("items", [])
    if not isinstance(raw_items, list) or len(raw_items) > MAX_CARE_ITEMS:
        raise ValueError(f"items must be a list with at most {MAX_CARE_ITEMS} entries")
    seen: set[str] = set()
    items: list[dict[str, object]] = []
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise TypeError(f"items.{index} must be a JSON object")
        item_id = _safe_id(raw.get("id"), f"items.{index}.id")
        if item_id in seen:
            raise ValueError("care item ids must be unique")
        seen.add(item_id)
        kind = raw.get("kind", "other")
        if kind not in CARE_KINDS:
            raise ValueError(f"items.{index}.kind is invalid")
        for_person_id = _safe_id(raw.get("for_person_id"), f"items.{index}.for_person_id")
        assigned_person_id = _safe_id(raw.get("assigned_person_id"), f"items.{index}.assigned_person_id")
        if for_person_id not in people:
            raise ValueError(f"items.{index}.for_person_id is unknown")
        if assigned_person_id not in people:
            raise ValueError(f"items.{index}.assigned_person_id is unknown")
        status = raw.get("status", "open")
        if status not in CARE_STATUSES:
            raise ValueError(f"items.{index}.status is invalid")
        completed_at = _timestamp(raw.get("completed_at"), f"items.{index}.completed_at", required=False)
        if status == "completed" and completed_at is None:
            raise ValueError("completed care items must include completed_at")
        if status != "completed":
            completed_at = None
        items.append({
            "id": item_id,
            "title": _clean_text(raw.get("title"), f"items.{index}.title", maximum=160),
            "kind": kind,
            "for_person_id": for_person_id,
            "assigned_person_id": assigned_person_id,
            "date": _iso_date(raw.get("date"), f"items.{index}.date"),
            "time": _time(raw.get("time"), f"items.{index}.time"),
            "provider": _optional_text(raw.get("provider"), f"items.{index}.provider", maximum=140),
            "location": _optional_text(raw.get("location"), f"items.{index}.location", maximum=180),
            "note": _optional_text(raw.get("note"), f"items.{index}.note", maximum=300),
            "status": status,
            "created_at": _timestamp(raw.get("created_at"), f"items.{index}.created_at"),
            "updated_at": _timestamp(raw.get("updated_at"), f"items.{index}.updated_at"),
            "completed_at": completed_at,
        })
    items.sort(key=lambda item: (str(item["date"]), str(item["time"] or "99:99"), str(item["title"])))
    return {
        "schema_version": MEDICAL_STATE_SCHEMA_VERSION,
        "revision": revision,
        "items": items,
        "updated_at": payload.get("updated_at"),
    }


def prune_medical_state(state: dict[str, object], *, today: date | None = None) -> dict[str, object]:
    """Bound completed coordination history while never dropping unfinished work."""

    oldest = (today or date.today()) - timedelta(days=90)
    items = [
        item
        for item in state.get("items", [])
        if item["status"] != "completed" or date.fromisoformat(item["date"]) >= oldest
    ]
    return {**state, "items": items}
