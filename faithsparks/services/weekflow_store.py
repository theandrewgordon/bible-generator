"""Validated, adult-owned persistence for the WeekFlow beta."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from datetime import date as date_type
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.weekflow_scheduler import (
    ADULTS,
    MAX_ADULTS,
    MAX_STUDENTS,
    PARENT,
    STUDENTS,
    default_scenario,
    generate_demo_schedule,
    normalize_scenario,
)

STATE_SCHEMA_VERSION = 2
MAX_STATE_BYTES = 120_000
MAX_TEMPLATE_NAME = 80
MAX_WEEK_HISTORY = 12
MAX_TEMPLATES = 8
WEEKFLOW_ANALYTICS_EVENTS = {
    "calendar_exported",
    "calendar_imported",
    "onboarding_complete",
    "page_view",
    "plan_approved",
    "plan_generated",
    "rollover_created",
    "template_saved",
}


class WeekFlowStorageUnavailable(RuntimeError):
    """Raised when saved plans cannot be reached."""


class WeekFlowRevisionConflict(RuntimeError):
    """Raised when another browser saved a newer plan first."""


def default_beta_state() -> dict[str, object]:
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "revision": 0,
        "family": {
            "name": "Our homeschool",
            "parent_label": "Parent",
            "timezone": "America/New_York",
            "adults": {
                adult_id: {"name": adult["name"], "color": adult["color"]}
                for adult_id, adult in ADULTS.items()
            },
            "students": {
                student_id: {"name": student["name"], "color": student["color"]}
                for student_id, student in STUDENTS.items()
            },
        },
        "scenario": default_scenario(),
        "approved": False,
        "updated_at": None,
    }


def _clean_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > maximum:
        raise ValueError(f"{field} must be between 1 and {maximum} characters")
    return cleaned


def _normalize_family_people(
    raw_people: object,
    *,
    field: str,
    maximum: int,
) -> dict[str, dict[str, str]]:
    if not isinstance(raw_people, dict) or not 1 <= len(raw_people) <= maximum:
        raise ValueError(f"{field} must include between 1 and {maximum} people")
    people: dict[str, dict[str, str]] = {}
    for person_id, raw_person in raw_people.items():
        if (
            not isinstance(person_id, str)
            or not person_id
            or len(person_id) > 60
            or not all(character.isalnum() or character in "-_" for character in person_id)
        ):
            raise ValueError(f"{field} ids must use letters, numbers, dashes, or underscores")
        if not isinstance(raw_person, dict):
            raise TypeError(f"each {field} entry must be a JSON object")
        color = raw_person.get("color", "#315f53")
        if not isinstance(color, str) or not color.startswith("#") or len(color) != 7:
            raise ValueError(f"{field} colors must use six-digit hex values")
        try:
            int(color[1:], 16)
        except ValueError as exc:
            raise ValueError(f"{field} colors must use six-digit hex values") from exc
        people[person_id] = {
            "name": _clean_text(
                raw_person.get("name"),
                f"{field}.{person_id}.name",
                maximum=60,
            ),
            "color": color.lower(),
        }
    return people


def normalize_beta_state(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("WeekFlow state must be a JSON object")
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    if len(encoded) > MAX_STATE_BYTES:
        raise ValueError("WeekFlow state is too large")

    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError("revision must be a non-negative integer")
    approved = payload.get("approved", False)
    if not isinstance(approved, bool):
        raise TypeError("approved must be a boolean")

    family = payload.get("family")
    if not isinstance(family, dict):
        raise TypeError("family must be a JSON object")
    timezone_name = _clean_text(family.get("timezone"), "family.timezone", maximum=80)
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("family.timezone must be a valid IANA timezone") from exc

    students = _normalize_family_people(
        family.get("students"),
        field="family.students",
        maximum=MAX_STUDENTS,
    )
    legacy_parent_label = _clean_text(
        family.get("parent_label", "Parent"),
        "family.parent_label",
        maximum=40,
    )
    raw_adults = family.get("adults")
    if raw_adults is None:
        raw_adults = {
            PARENT: {
                "name": legacy_parent_label,
                "color": ADULTS[PARENT]["color"],
            }
        }
    adults = _normalize_family_people(
        raw_adults,
        field="family.adults",
        maximum=MAX_ADULTS,
    )
    if set(adults) & set(students):
        raise ValueError("family adult and student ids must not overlap")

    scenario_payload = deepcopy(payload.get("scenario"))
    if not isinstance(scenario_payload, dict):
        raise TypeError("scenario must be a JSON object")
    scenario_payload["household"] = {
        "adults": [
            {"id": person_id, **person} for person_id, person in adults.items()
        ],
        "students": [
            {"id": person_id, **person} for person_id, person in students.items()
        ],
    }
    scenario = normalize_scenario(scenario_payload)
    first_adult = next(iter(adults.values()))
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "revision": revision,
        "family": {
            "name": _clean_text(family.get("name"), "family.name", maximum=80),
            "parent_label": first_adult["name"],
            "timezone": timezone_name,
            "adults": adults,
            "students": students,
        },
        "scenario": scenario,
        "approved": approved,
        "updated_at": payload.get("updated_at"),
    }


def _state_ref(email: str):
    return _weekflow_collection(email).document("state")


def _weekflow_collection(email: str):
    return (
        db.collection("users")
        .document(email.strip().casefold())
        .collection("weekflow")
    )


def load_beta_state(email: str) -> dict[str, object]:
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        snapshot = _state_ref(email).get()
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc
    if not snapshot.exists:
        return default_beta_state()
    stored = snapshot.to_dict() or {}
    try:
        return normalize_beta_state(stored.get("state") or {})
    except (TypeError, ValueError) as exc:
        raise WeekFlowStorageUnavailable("The saved WeekFlow plan could not be read") from exc


def save_beta_state(email: str, payload: object) -> dict[str, object]:
    state = normalize_beta_state(payload)
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    ref = _state_ref(email)
    transaction = db.transaction()

    @firestore.transactional
    def save(txn):
        snapshot = ref.get(transaction=txn)
        stored = snapshot.to_dict() or {} if snapshot.exists else {}
        current_revision = int(stored.get("revision") or 0)
        if state["revision"] != current_revision:
            raise WeekFlowRevisionConflict(
                "A newer WeekFlow plan was saved in another browser"
            )
        new_revision = current_revision + 1
        saved_at = datetime.now(UTC).isoformat()
        saved_state = {
            **state,
            "revision": new_revision,
            "updated_at": saved_at,
        }
        txn.set(
            ref,
            {
                "kind": "state",
                "schemaVersion": STATE_SCHEMA_VERSION,
                "revision": new_revision,
                "state": saved_state,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
        week_start = saved_state["scenario"].get("week_start")
        if week_start:
            txn.set(
                _weekflow_collection(email).document(f"week-{week_start}"),
                {
                    "kind": "week",
                    "weekStart": week_start,
                    "state": saved_state,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
            )
        return saved_state

    try:
        saved_state = save(transaction)
    except WeekFlowRevisionConflict:
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc
    return {**saved_state, "plan": generate_demo_schedule(scenario=saved_state["scenario"])}


def delete_beta_state(email: str) -> None:
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        for snapshot in _weekflow_collection(email).stream():
            snapshot.reference.delete()
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def list_saved_weeks(email: str, *, limit: int = MAX_WEEK_HISTORY) -> list[dict[str, object]]:
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        rows = []
        for snapshot in _weekflow_collection(email).stream():
            stored = snapshot.to_dict() or {}
            if stored.get("kind") != "week":
                continue
            state = normalize_beta_state(stored.get("state") or {})
            plan = generate_demo_schedule(scenario=state["scenario"])
            rows.append(
                {
                    "week_start": state["scenario"]["week_start"],
                    "approved": state["approved"],
                    "updated_at": state["updated_at"],
                    "scheduled_count": plan["scheduled_count"],
                    "completed_count": plan["completed_count"],
                    "rollover_count": len(plan["rollover"]),
                }
            )
        rows.sort(key=lambda item: str(item["week_start"]), reverse=True)
        return rows[: max(1, min(int(limit), MAX_WEEK_HISTORY))]
    except (TypeError, ValueError):
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def load_saved_week(email: str, week_start: str) -> dict[str, object]:
    try:
        parsed = date_type.fromisoformat(week_start)
    except (TypeError, ValueError) as exc:
        raise ValueError("week_start must be an ISO date") from exc
    if parsed.weekday() != 0:
        raise ValueError("week_start must be a Monday")
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        snapshot = _weekflow_collection(email).document(f"week-{week_start}").get()
        if not snapshot.exists:
            raise KeyError("Saved week not found")
        state = normalize_beta_state((snapshot.to_dict() or {}).get("state") or {})
        current = load_beta_state(email)
        state["revision"] = current["revision"]
        return {**state, "plan": generate_demo_schedule(scenario=state["scenario"])}
    except (KeyError, TypeError, ValueError):
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def prune_week_history(email: str, *, keep: int) -> None:
    if not db:
        return
    try:
        rows = []
        for snapshot in _weekflow_collection(email).stream():
            data = snapshot.to_dict() or {}
            if data.get("kind") == "week":
                rows.append((str(data.get("weekStart") or ""), snapshot.reference))
        rows.sort(reverse=True, key=lambda item: item[0])
        for _, reference in rows[max(1, min(keep, MAX_WEEK_HISTORY)) :]:
            reference.delete()
    except Exception as exc:
        raise WeekFlowStorageUnavailable(
            "Saved-week retention could not be updated"
        ) from exc


def create_rollover_state(email: str, payload: object) -> dict[str, object]:
    state = normalize_beta_state(payload)
    week_start = state["scenario"].get("week_start")
    if not week_start:
        raise ValueError("Choose a dated week before creating rollover")
    plan = generate_demo_schedule(scenario=state["scenario"])
    rollover_ids = {item["task_id"] for item in plan["rollover"]}
    if not rollover_ids:
        raise ValueError("This plan has no rollover work")
    next_scenario = deepcopy(state["scenario"])
    next_scenario["week_start"] = (
        date_type.fromisoformat(week_start) + timedelta(days=7)
    ).isoformat()
    next_scenario["tasks"] = [
        task for task in next_scenario["tasks"] if task["id"] in rollover_ids
    ]
    next_scenario["completed_task_ids"] = []
    next_scenario["events"] = [
        event for event in next_scenario["events"] if event["recurring"]
    ]
    return save_beta_state(
        email,
        {
            **state,
            "scenario": next_scenario,
            "approved": False,
        },
    )


def _normalize_template(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("template must be a JSON object")
    name = _clean_text(payload.get("name"), "template.name", maximum=MAX_TEMPLATE_NAME)
    scenario = normalize_scenario(payload.get("scenario"))
    scenario["week_start"] = None
    scenario["completed_task_ids"] = []
    return {"name": name, "scenario": scenario}


def list_week_templates(email: str) -> list[dict[str, object]]:
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        rows = []
        for snapshot in _weekflow_collection(email).stream():
            data = snapshot.to_dict() or {}
            if data.get("kind") == "template":
                template = _normalize_template(data)
                rows.append({"id": snapshot.id.removeprefix("template-"), **template})
        rows.sort(key=lambda item: str(item["name"]).casefold())
        return rows[:MAX_TEMPLATES]
    except (TypeError, ValueError):
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def save_week_template(email: str, payload: object) -> dict[str, object]:
    template = _normalize_template(payload)
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        existing = list_week_templates(email)
        if len(existing) >= MAX_TEMPLATES:
            raise ValueError(f"WeekFlow supports up to {MAX_TEMPLATES} saved templates")
        template_id = uuid4().hex
        _weekflow_collection(email).document(f"template-{template_id}").set(
            {
                "kind": "template",
                **template,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return {"id": template_id, **template}
    except (TypeError, ValueError):
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def delete_week_template(email: str, template_id: str) -> None:
    if (
        not isinstance(template_id, str)
        or not template_id
        or len(template_id) > 64
        or not template_id.isalnum()
    ):
        raise ValueError("template id is invalid")
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        _weekflow_collection(email).document(f"template-{template_id}").delete()
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


def export_weekflow_backup(email: str) -> dict[str, object]:
    state = load_beta_state(email)
    if not db:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable")
    try:
        weeks = []
        for snapshot in _weekflow_collection(email).stream():
            data = snapshot.to_dict() or {}
            if data.get("kind") == "week":
                weeks.append(normalize_beta_state(data.get("state") or {}))
        weeks.sort(
            key=lambda item: str(item["scenario"].get("week_start") or ""),
            reverse=True,
        )
    except (TypeError, ValueError):
        raise
    except Exception as exc:
        raise WeekFlowStorageUnavailable("WeekFlow backup could not be created") from exc
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "state": state,
        "weeks": weeks,
        "templates": list_week_templates(email),
    }


def record_beta_feedback(email: str | None, payload: object) -> None:
    if not isinstance(payload, dict):
        raise TypeError("feedback must be a JSON object")
    realistic = payload.get("realistic")
    if realistic not in {"yes", "mostly", "no"}:
        raise ValueError("feedback realistic must be yes, mostly, or no")
    comment = payload.get("comment", "")
    if not isinstance(comment, str) or len(comment.strip()) > 1_000:
        raise ValueError("feedback comments must be at most 1000 characters")
    contact = payload.get("contact", False)
    if not isinstance(contact, bool):
        raise TypeError("feedback contact must be a boolean")
    if not db:
        raise WeekFlowStorageUnavailable("Feedback service is temporarily unavailable")
    normalized_email = str(email or "").strip().casefold()
    try:
        db.collection("weekflow_feedback").add(
            {
                "realistic": realistic,
                "comment": comment.strip(),
                "contactRequested": contact,
                "contactEmail": normalized_email if contact else None,
                "anonymousUser": (
                    hashlib.sha256(normalized_email.encode()).hexdigest()
                    if normalized_email
                    else None
                ),
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
        db.collection("analytics").document("weekflow_feedback").set(
            {
                "total": firestore.Increment(1),
                "realistic": {realistic: firestore.Increment(1)},
                "contactRequested": firestore.Increment(1 if contact else 0),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        raise WeekFlowStorageUnavailable(
            "Feedback service is temporarily unavailable"
        ) from exc


def record_weekflow_event(email: str | None, payload: object) -> None:
    if not isinstance(payload, dict):
        raise TypeError("analytics event must be a JSON object")
    event = payload.get("event")
    if event not in WEEKFLOW_ANALYTICS_EVENTS:
        raise ValueError("analytics event is not supported")
    if not db:
        return
    normalized_email = str(email or "").strip().casefold()
    anonymous_user = (
        hashlib.sha256(normalized_email.encode()).hexdigest()
        if normalized_email
        else None
    )
    try:
        db.collection("analytics").document("weekflow_funnel").set(
            {
                "events": {event: firestore.Increment(1)},
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        db.collection("weekflow_events").add(
            {
                "event": event,
                "anonymousUser": anonymous_user,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception:  # noqa: BLE001 - analytics must remain best effort
        # Analytics must never interrupt planning.
        return
