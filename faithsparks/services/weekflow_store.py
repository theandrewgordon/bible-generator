"""Validated, adult-owned persistence for the WeekFlow beta."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.weekflow_scheduler import (
    STUDENTS,
    default_scenario,
    generate_demo_schedule,
    normalize_scenario,
)

STATE_SCHEMA_VERSION = 1
MAX_STATE_BYTES = 120_000


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

    raw_students = family.get("students")
    if not isinstance(raw_students, dict) or set(raw_students) != set(STUDENTS):
        raise ValueError("family.students must include each WeekFlow student")
    students = {}
    for student_id, raw_student in raw_students.items():
        if not isinstance(raw_student, dict):
            raise TypeError("each family student must be a JSON object")
        color = raw_student.get("color", STUDENTS[student_id]["color"])
        if not isinstance(color, str) or not color.startswith("#") or len(color) != 7:
            raise ValueError("student colors must use six-digit hex values")
        try:
            int(color[1:], 16)
        except ValueError as exc:
            raise ValueError("student colors must use six-digit hex values") from exc
        students[student_id] = {
            "name": _clean_text(
                raw_student.get("name"),
                f"family.students.{student_id}.name",
                maximum=60,
            ),
            "color": color.lower(),
        }

    scenario = normalize_scenario(payload.get("scenario"))
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "revision": revision,
        "family": {
            "name": _clean_text(family.get("name"), "family.name", maximum=80),
            "parent_label": _clean_text(
                family.get("parent_label"), "family.parent_label", maximum=40
            ),
            "timezone": timezone_name,
            "students": students,
        },
        "scenario": scenario,
        "approved": approved,
        "updated_at": payload.get("updated_at"),
    }


def _state_ref(email: str):
    return (
        db.collection("users")
        .document(email.strip().casefold())
        .collection("weekflow")
        .document("state")
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
                "schemaVersion": STATE_SCHEMA_VERSION,
                "revision": new_revision,
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
        _state_ref(email).delete()
    except Exception as exc:
        raise WeekFlowStorageUnavailable("Cloud saving is temporarily unavailable") from exc


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
    except Exception as exc:
        raise WeekFlowStorageUnavailable(
            "Feedback service is temporarily unavailable"
        ) from exc
