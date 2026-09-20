"""AI-assisted WeekFlow intake with deterministic validation.

The model may extract a proposal from text, audio, or an image. It never writes
family state. Callers must show the normalized proposal to an adult for review
and explicitly apply the selected rows through the ordinary WeekFlow save path.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from functools import lru_cache
from io import BytesIO


class WeekFlowIntakeError(ValueError):
    """A friendly intake error safe to show in the WeekFlow interface."""


DAY_IDS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4}
HELP_LEVELS = {"independent", "checkin", "together"}
PRIORITIES = {"flexible": 1, "normal": 3, "important": 5}
TIME_RE = re.compile(r"^(?:0\d|1\d|2[0-3]):[0-5]\d$")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 12 * 1024 * 1024


INTAKE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "assignments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "subject": {"type": "string"},
                    "student_names": {"type": "array", "items": {"type": "string"}},
                    "times_per_week": {"type": "integer", "minimum": 1, "maximum": 5},
                    "minutes": {"type": "integer", "minimum": 15, "maximum": 240},
                    "parent_help": {"type": "string", "enum": sorted(HELP_LEVELS)},
                    "priority": {"type": "string", "enum": sorted(PRIORITIES)},
                    "due_day": {"type": "string", "enum": sorted(DAY_IDS)},
                },
                "required": ["title", "subject", "student_names", "times_per_week", "minutes", "parent_help", "priority", "due_day"],
            },
        },
        "commitments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "day_id": {"type": ["string", "null"], "enum": [*sorted(DAY_IDS), None]},
                    "start": {"type": ["string", "null"]},
                    "end": {"type": ["string", "null"]},
                    "participant_names": {"type": "array", "items": {"type": "string"}},
                    "recurring": {"type": "boolean"},
                    "travel_before_minutes": {"type": "integer", "minimum": 0, "maximum": 120},
                    "travel_after_minutes": {"type": "integer", "minimum": 0, "maximum": 120},
                },
                "required": ["title", "day_id", "start", "end", "participant_names", "recurring", "travel_before_minutes", "travel_after_minutes"],
            },
        },
        "availability": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "person_name": {"type": "string"},
                    "day_ids": {"type": "array", "items": {"type": "string", "enum": sorted(DAY_IDS)}},
                    "end_time": {"type": "string"},
                },
                "required": ["person_name", "day_ids", "end_time"],
            },
        },
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "assignments", "commitments", "availability", "questions"],
}


def _timeout_seconds() -> float:
    try:
        value = float(os.getenv("WEEKFLOW_AI_TIMEOUT_SECONDS", "25"))
    except ValueError:
        value = 25
    return max(8, min(value, 60))


@lru_cache(maxsize=1)
def _client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise WeekFlowIntakeError("AI intake is not configured on this server yet.")
    from openai import OpenAI

    return OpenAI(api_key=api_key, timeout=_timeout_seconds(), max_retries=1)


def _minute(value: str) -> int | None:
    if not isinstance(value, str) or not TIME_RE.fullmatch(value):
        return None
    hour, minute = (int(part) for part in value.split(":"))
    return hour * 60 + minute


def _people(household: dict[str, object]) -> tuple[dict[str, dict[str, str]], set[str]]:
    rows = [*household.get("adults", []), *household.get("students", [])]
    by_name = {
        str(person.get("name", "")).strip().casefold(): {
            "id": str(person.get("id", "")),
            "name": str(person.get("name", "")).strip(),
        }
        for person in rows
        if isinstance(person, dict) and person.get("id") and person.get("name")
    }
    student_ids = {
        str(person.get("id"))
        for person in household.get("students", [])
        if isinstance(person, dict) and person.get("id")
    }
    return by_name, student_ids


def _resolve_names(
    names: object,
    by_name: dict[str, dict[str, str]],
    *,
    allowed_ids: set[str] | None = None,
) -> tuple[list[str], list[str], list[str]]:
    resolved_ids: list[str] = []
    resolved_names: list[str] = []
    unknown: list[str] = []
    for raw_name in names if isinstance(names, list) else []:
        name = " ".join(str(raw_name).split())[:60]
        person = by_name.get(name.casefold())
        if not person or (allowed_ids is not None and person["id"] not in allowed_ids):
            if name:
                unknown.append(name)
            continue
        if person["id"] not in resolved_ids:
            resolved_ids.append(person["id"])
            resolved_names.append(person["name"])
    return resolved_ids, resolved_names, unknown


def validate_intake(raw: object, household: dict[str, object]) -> dict[str, object]:
    """Normalize model output and retain invalid rows for explicit adult review."""

    if not isinstance(raw, dict):
        raise WeekFlowIntakeError("The intake assistant returned an unreadable plan.")
    by_name, student_ids = _people(household)
    warnings: list[str] = []
    assignments: list[dict[str, object]] = []
    commitments: list[dict[str, object]] = []
    availability: list[dict[str, object]] = []

    for raw_item in raw.get("assignments", [])[:30] if isinstance(raw.get("assignments"), list) else []:
        if not isinstance(raw_item, dict):
            continue
        ids, names, unknown = _resolve_names(raw_item.get("student_names"), by_name, allowed_ids=student_ids)
        title = " ".join(str(raw_item.get("title", "")).split())[:120]
        subject = " ".join(str(raw_item.get("subject", "")).split())[:60]
        times = raw_item.get("times_per_week")
        minutes = raw_item.get("minutes")
        help_level = raw_item.get("parent_help")
        priority = raw_item.get("priority")
        due_day = raw_item.get("due_day")
        reasons = []
        if not title or not subject:
            reasons.append("A title and subject are required.")
        if not ids:
            reasons.append("Choose a known child.")
        if unknown:
            reasons.append(f"Unknown child: {', '.join(unknown)}.")
        if not isinstance(times, int) or isinstance(times, bool) or not 1 <= times <= 5:
            reasons.append("Frequency must be between one and five times.")
        if not isinstance(minutes, int) or isinstance(minutes, bool) or not 15 <= minutes <= 240:
            reasons.append("Time must be between 15 and 240 minutes.")
        if help_level not in HELP_LEVELS:
            reasons.append("Parent-help level is unclear.")
        if priority not in PRIORITIES:
            reasons.append("Priority is unclear.")
        if due_day not in DAY_IDS:
            reasons.append("Choose a weekday deadline.")
        assignments.append({
            "kind": "assignment", "valid": not reasons, "reasons": reasons,
            "title": title, "subject": subject, "student_ids": ids, "student_names": names,
            "times_per_week": times if isinstance(times, int) else 1,
            "minutes": minutes if isinstance(minutes, int) else 30,
            "parent_help": help_level if help_level in HELP_LEVELS else "independent",
            "priority": PRIORITIES.get(str(priority), 3),
            "due_day": DAY_IDS.get(str(due_day), 4),
        })

    for raw_item in raw.get("commitments", [])[:20] if isinstance(raw.get("commitments"), list) else []:
        if not isinstance(raw_item, dict):
            continue
        ids, names, unknown = _resolve_names(raw_item.get("participant_names"), by_name)
        title = " ".join(str(raw_item.get("title", "")).split())[:120]
        day_id = raw_item.get("day_id")
        start = _minute(raw_item.get("start"))
        end = _minute(raw_item.get("end"))
        before = raw_item.get("travel_before_minutes", 0)
        after = raw_item.get("travel_after_minutes", 0)
        reasons = []
        if not title:
            reasons.append("A commitment name is required.")
        if day_id not in DAY_IDS:
            reasons.append("Choose a weekday.")
        if start is None or end is None or start >= end:
            reasons.append("Start and end times need review.")
        if not ids:
            reasons.append("Choose everyone occupied, including the driver.")
        if unknown:
            reasons.append(f"Unknown family member: {', '.join(unknown)}.")
        if not isinstance(before, int) or isinstance(before, bool) or not 0 <= before <= 120:
            reasons.append("Travel-before time is invalid.")
            before = 0
        if not isinstance(after, int) or isinstance(after, bool) or not 0 <= after <= 120:
            reasons.append("Travel-after time is invalid.")
            after = 0
        commitments.append({
            "kind": "commitment", "valid": not reasons, "reasons": reasons,
            "title": title, "day_id": day_id if day_id in DAY_IDS else "mon",
            "start_minute": max(0, (start or 9 * 60) - before),
            "end_minute": min(24 * 60, (end or 10 * 60) + after),
            "display_start": raw_item.get("start", ""), "display_end": raw_item.get("end", ""),
            "participant_ids": ids, "participant_names": names,
            "recurring": bool(raw_item.get("recurring")),
            "travel_before_minutes": before, "travel_after_minutes": after,
        })

    for raw_item in raw.get("availability", [])[:20] if isinstance(raw.get("availability"), list) else []:
        if not isinstance(raw_item, dict):
            continue
        ids, names, unknown = _resolve_names([raw_item.get("person_name")], by_name)
        raw_days = raw_item.get("day_ids")
        day_ids = list(dict.fromkeys(day for day in raw_days if day in DAY_IDS)) if isinstance(raw_days, list) else []
        end = _minute(raw_item.get("end_time"))
        reasons = []
        if not ids or unknown:
            reasons.append("Choose a known family member.")
        if not day_ids:
            reasons.append("Choose at least one weekday.")
        if end is None or not 9 * 60 <= end <= 16 * 60:
            reasons.append("Availability must end between 9:00 AM and 4:00 PM.")
        availability.append({
            "kind": "availability", "valid": not reasons, "reasons": reasons,
            "person_id": ids[0] if ids else "", "person_name": names[0] if names else str(raw_item.get("person_name", ""))[:60],
            "day_ids": day_ids, "end_minute": end or 12 * 60 + 30,
        })

    for row in [*assignments, *commitments, *availability]:
        if not row["valid"]:
            warnings.extend(row["reasons"])
    questions = [" ".join(str(item).split())[:220] for item in raw.get("questions", [])[:8] if str(item).strip()] if isinstance(raw.get("questions"), list) else []
    return {
        "summary": " ".join(str(raw.get("summary", "Review the proposed week.")).split())[:300],
        "assignments": assignments,
        "commitments": commitments,
        "availability": availability,
        "questions": questions,
        "warnings": list(dict.fromkeys(warnings)),
        "requires_review": True,
    }


def _instructions(household: dict[str, object]) -> str:
    names = [
        str(person.get("name"))
        for group in ("adults", "students")
        for person in household.get(group, [])
        if isinstance(person, dict) and person.get("name")
    ]
    return (
        "You extract a homeschool family's weekly plan. Return only the supplied JSON schema. "
        "Never invent a family member, date, weekday, or time. If a detail is missing, add a short question and make the safest conservative proposal. "
        "For a commitment with a missing weekday, start time, or end time, return null for that field so the validator blocks it until the adult clarifies it. "
        "For schoolwork with no duration, use 30 minutes and ask the adult to check that estimate. Use Friday as the internal deadline when no deadline is stated. "
        "A commitment's participant_names must include every child attending and any adult occupied driving or supervising. "
        "Use 24-hour HH:MM times. Use assignments for repeated lessons, commitments for appointments/classes/co-op, and availability only for explicit school-day end limits. "
        f"Known family names: {', '.join(names)}."
    )


def interpret_weekflow_intake(
    *,
    household: dict[str, object],
    text: str = "",
    image_data_url: str | None = None,
    safety_identifier: str = "",
) -> dict[str, object]:
    text = " ".join((text or "").split())[:6000]
    if not text and not image_data_url:
        raise WeekFlowIntakeError("Type, record, or photograph something to add.")
    content: list[dict[str, object]] = [{"type": "input_text", "text": text or "Extract the scheduling details from this image."}]
    if image_data_url:
        content.append({"type": "input_image", "image_url": image_data_url, "detail": "high"})
    try:
        response = _client().responses.create(
            model=os.getenv("WEEKFLOW_AI_MODEL", "gpt-4o-mini"),
            store=False,
            user=hashlib.sha256(safety_identifier.encode()).hexdigest()[:32] if safety_identifier else None,
            instructions=_instructions(household),
            input=[{"role": "user", "content": content}],
            text={"format": {"type": "json_schema", "name": "weekflow_intake", "strict": True, "schema": INTAKE_SCHEMA}},
            max_output_tokens=2500,
        )
        raw = json.loads(response.output_text)
    except WeekFlowIntakeError:
        raise
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise WeekFlowIntakeError("The intake assistant returned an unreadable plan. Please try again.") from exc
    except Exception as exc:
        raise WeekFlowIntakeError("WeekFlow could not interpret that right now. Please try again.") from exc
    return validate_intake(raw, household)


def transcribe_weekflow_audio(data: bytes, filename: str, content_type: str) -> str:
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise WeekFlowIntakeError("Voice notes must be shorter than 12 MB.")
    content_type = content_type.split(";", 1)[0].strip().casefold()
    supported = {
        "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/mpga",
        "audio/m4a", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg",
        "audio/flac",
    }
    if content_type not in supported:
        raise WeekFlowIntakeError("Use a WebM, M4A, MP3, WAV, MP4, or OGG voice note.")
    audio = BytesIO(data)
    audio.name = filename or "weekflow-voice.webm"
    try:
        result = _client().audio.transcriptions.create(
            model=os.getenv("WEEKFLOW_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe"),
            file=audio,
            language="en",
            response_format="json",
        )
    except Exception as exc:
        raise WeekFlowIntakeError("WeekFlow could not transcribe that voice note. Please try again.") from exc
    transcript = " ".join(str(getattr(result, "text", "")).split())[:6000]
    if not transcript:
        raise WeekFlowIntakeError("No speech was detected in that voice note.")
    return transcript
