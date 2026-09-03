"""Secure, read-only Google Calendar support for the WeekFlow beta.

The OAuth grant is deliberately separate from ordinary Google sign-in. Tokens
are encrypted before Firestore storage, source events remain provider-owned,
and callers must explicitly choose which calendars and how much detail to read.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.fernet import Fernet, InvalidToken
from firebase_admin import firestore
from flask import has_request_context, session
from flask_dance.consumer.storage import BaseStorage

from faithsparks.services.firestore import db

CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
MAX_SELECTED_CALENDARS = 12
MAX_CALENDARS_RETURNED = 100
MAX_EVENTS_PER_CALENDAR = 250
TOKEN_KEY_ENV = "WEEKFLOW_CALENDAR_TOKEN_KEY"


class WeekFlowCalendarUnavailable(RuntimeError):
    """Raised when the optional Google Calendar connection is unavailable."""


class WeekFlowCalendarProviderError(RuntimeError):
    """Raised when Google Calendar cannot fulfill a read request."""


def calendar_oauth_configured() -> bool:
    """Return whether the app has everything needed for secure Calendar OAuth."""

    if not (
        os.getenv("GOOGLE_OAUTH_CLIENT_ID")
        and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
        and os.getenv(TOKEN_KEY_ENV)
    ):
        return False
    try:
        Fernet(os.environ[TOKEN_KEY_ENV].encode())
    except (TypeError, ValueError):
        return False
    return bool(db)


def _adult_email() -> str | None:
    if not has_request_context():
        return None
    raw = session.get("user_email")
    return str(raw).strip().casefold() if raw else None


def _token_ref(email: str):
    return (
        db.collection("users")
        .document(email.strip().casefold())
        .collection("weekflow_integrations")
        .document("google_calendar_token")
    )


def _settings_ref(email: str):
    return (
        db.collection("users")
        .document(email.strip().casefold())
        .collection("weekflow_integrations")
        .document("google_calendar_settings")
    )


def _fernet() -> Fernet:
    key = os.getenv(TOKEN_KEY_ENV)
    if not key:
        raise WeekFlowCalendarUnavailable(
            "Secure Google Calendar token storage is not configured"
        )
    try:
        return Fernet(key.encode())
    except (TypeError, ValueError) as exc:
        raise WeekFlowCalendarUnavailable(
            "Secure Google Calendar token storage is misconfigured"
        ) from exc


def _normalize_token(token: object) -> dict[str, object]:
    if not isinstance(token, dict):
        raise TypeError("Google Calendar returned an invalid OAuth token")
    access_token = token.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ValueError("Google Calendar token is missing its access token")
    cleaned: dict[str, object] = {"access_token": access_token}
    for key in ("refresh_token", "token_type", "scope"):
        value = token.get(key)
        if isinstance(value, str) and value:
            cleaned[key] = value
    expires_at = token.get("expires_at")
    if isinstance(expires_at, (int, float)) and not isinstance(expires_at, bool):
        cleaned["expires_at"] = expires_at
    expires_in = token.get("expires_in")
    if isinstance(expires_in, (int, float)) and not isinstance(expires_in, bool):
        cleaned["expires_in"] = expires_in
    return cleaned


class EncryptedFirestoreCalendarTokenStorage(BaseStorage):
    """Flask-Dance storage that never puts Calendar grants in browser cookies."""

    def get(self, blueprint):
        email = _adult_email()
        if not email:
            return None
        if not db:
            raise WeekFlowCalendarUnavailable("Calendar token storage is unavailable")
        try:
            snapshot = _token_ref(email).get()
            if not snapshot.exists:
                return None
            encrypted = (snapshot.to_dict() or {}).get("encryptedToken")
            if not isinstance(encrypted, str) or not encrypted:
                return None
            decoded = _fernet().decrypt(encrypted.encode())
            return _normalize_token(json.loads(decoded))
        except WeekFlowCalendarUnavailable:
            raise
        except (InvalidToken, json.JSONDecodeError, TypeError, ValueError) as exc:
            raise WeekFlowCalendarUnavailable(
                "The saved Google Calendar connection could not be read"
            ) from exc
        except Exception as exc:
            raise WeekFlowCalendarUnavailable(
                "Google Calendar token storage is unavailable"
            ) from exc

    def set(self, blueprint, token):
        email = _adult_email()
        if not email:
            raise WeekFlowCalendarUnavailable(
                "Sign in before connecting Google Calendar"
            )
        if not db:
            raise WeekFlowCalendarUnavailable("Calendar token storage is unavailable")
        normalized = _normalize_token(token)
        encrypted = _fernet().encrypt(
            json.dumps(normalized, separators=(",", ":"), sort_keys=True).encode()
        )
        try:
            _token_ref(email).set(
                {
                    "encryptedToken": encrypted.decode(),
                    "scope": normalized.get("scope"),
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                }
            )
        except Exception as exc:
            raise WeekFlowCalendarUnavailable(
                "Google Calendar token storage is unavailable"
            ) from exc

    def delete(self, blueprint):
        email = _adult_email()
        if email:
            disconnect_google_calendar(email)


def disconnect_google_calendar(email: str) -> None:
    if not db:
        raise WeekFlowCalendarUnavailable("Calendar token storage is unavailable")
    try:
        _token_ref(email).delete()
        _settings_ref(email).delete()
    except Exception as exc:
        raise WeekFlowCalendarUnavailable(
            "Google Calendar could not be disconnected"
        ) from exc


def normalize_calendar_preferences(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("calendar preferences must be a JSON object")
    calendar_ids = payload.get("calendar_ids")
    if (
        not isinstance(calendar_ids, list)
        or not 1 <= len(calendar_ids) <= MAX_SELECTED_CALENDARS
        or not all(isinstance(item, str) and 0 < len(item) <= 512 for item in calendar_ids)
    ):
        raise ValueError(
            f"Choose between 1 and {MAX_SELECTED_CALENDARS} calendars"
        )
    detail_mode = payload.get("detail_mode", "details")
    if detail_mode not in {"details", "availability"}:
        raise ValueError("detail_mode must be details or availability")
    return {
        "calendar_ids": list(dict.fromkeys(calendar_ids)),
        "detail_mode": detail_mode,
    }


def save_calendar_preferences(email: str, payload: object) -> dict[str, object]:
    preferences = normalize_calendar_preferences(payload)
    if not db:
        raise WeekFlowCalendarUnavailable("Calendar settings are unavailable")
    try:
        _settings_ref(email).set(
            {
                **preferences,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as exc:
        raise WeekFlowCalendarUnavailable(
            "Calendar settings could not be saved"
        ) from exc
    return preferences


def load_calendar_preferences(email: str) -> dict[str, object]:
    if not db:
        raise WeekFlowCalendarUnavailable("Calendar settings are unavailable")
    try:
        snapshot = _settings_ref(email).get()
        if not snapshot.exists:
            return {"calendar_ids": [], "detail_mode": "details"}
        return normalize_calendar_preferences(snapshot.to_dict() or {})
    except WeekFlowCalendarUnavailable:
        raise
    except (TypeError, ValueError):
        return {"calendar_ids": [], "detail_mode": "details"}
    except Exception as exc:
        raise WeekFlowCalendarUnavailable(
            "Calendar settings could not be loaded"
        ) from exc


def _provider_json(response, message: str) -> dict[str, object]:
    if not getattr(response, "ok", False):
        raise WeekFlowCalendarProviderError(message)
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise WeekFlowCalendarProviderError(message) from exc
    if not isinstance(payload, dict):
        raise WeekFlowCalendarProviderError(message)
    return payload


def _provider_request(oauth_session, method: str, path: str, message: str, **kwargs):
    try:
        return getattr(oauth_session, method)(path, **kwargs)
    except WeekFlowCalendarUnavailable:
        raise
    except Exception as exc:
        raise WeekFlowCalendarProviderError(message) from exc


def list_google_calendars(oauth_session) -> list[dict[str, object]]:
    """Return calendars the connected adult may explicitly choose to read."""

    rows: list[dict[str, object]] = []
    page_token = None
    while len(rows) < MAX_CALENDARS_RETURNED:
        params: dict[str, object] = {
            "maxResults": min(100, MAX_CALENDARS_RETURNED - len(rows)),
            "showDeleted": "false",
            "showHidden": "false",
        }
        if page_token:
            params["pageToken"] = page_token
        message = "Google Calendar could not list this account's calendars"
        payload = _provider_json(
            _provider_request(
                oauth_session,
                "get",
                "/calendar/v3/users/me/calendarList",
                message,
                params=params,
            ),
            message,
        )
        for item in payload.get("items", []):
            if not isinstance(item, dict):
                continue
            calendar_id = item.get("id")
            summary = item.get("summary")
            if not isinstance(calendar_id, str) or not isinstance(summary, str):
                continue
            raw_color = item.get("backgroundColor")
            color = raw_color if isinstance(raw_color, str) else "#315f53"
            if (
                len(color) != 7
                or not color.startswith("#")
                or any(character not in "0123456789abcdefABCDEF" for character in color[1:])
            ):
                color = "#315f53"
            rows.append(
                {
                    "id": calendar_id[:512],
                    "name": summary.strip()[:120] or "Untitled calendar",
                    "primary": bool(item.get("primary")),
                    "access_role": str(item.get("accessRole") or "reader")[:32],
                    "color": color.lower(),
                }
            )
            if len(rows) >= MAX_CALENDARS_RETURNED:
                break
        next_token = payload.get("nextPageToken")
        page_token = next_token if isinstance(next_token, str) and next_token else None
        if not page_token:
            break
    rows.sort(key=lambda item: (not item["primary"], str(item["name"]).casefold()))
    return rows


def _week_bounds(week_start: object, timezone_name: object) -> tuple[str, str, str]:
    if not isinstance(week_start, str):
        raise TypeError("week_start must be an ISO date")
    try:
        parsed = date.fromisoformat(week_start)
    except ValueError as exc:
        raise ValueError("week_start must be an ISO date") from exc
    if parsed.weekday() != 0:
        raise ValueError("week_start must be a Monday")
    if not isinstance(timezone_name, str) or len(timezone_name) > 80:
        raise ValueError("timezone must be a valid IANA timezone")
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("timezone must be a valid IANA timezone") from exc
    start = datetime.combine(parsed, time.min, timezone).astimezone(UTC)
    end = datetime.combine(parsed + timedelta(days=7), time.min, timezone).astimezone(
        UTC
    )
    return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace(
        "+00:00", "Z"
    ), timezone_name


def _event_time(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    candidate = value.get("dateTime") or value.get("date")
    return candidate[:64] if isinstance(candidate, str) else None


def _normalize_google_event(
    item: object,
    *,
    calendar_id: str,
    calendar_name: str,
    detail_mode: str,
) -> dict[str, object] | None:
    if not isinstance(item, dict) or item.get("status") == "cancelled":
        return None
    provider_event_id = item.get("id")
    start = _event_time(item.get("start"))
    end = _event_time(item.get("end"))
    if not isinstance(provider_event_id, str) or not start or not end:
        return None
    recurring_event_id = item.get("recurringEventId")
    original_start = _event_time(item.get("originalStartTime"))
    title = "Busy"
    location = None
    if detail_mode == "details":
        summary = item.get("summary")
        title = summary.strip()[:120] if isinstance(summary, str) and summary.strip() else "Calendar event"
        raw_location = item.get("location")
        if isinstance(raw_location, str) and raw_location.strip():
            location = raw_location.strip()[:240]
    return {
        "provider": "google",
        "provider_event_id": provider_event_id[:512],
        "recurring_event_id": (
            recurring_event_id[:512] if isinstance(recurring_event_id, str) else None
        ),
        "original_start": original_start,
        "source_calendar_id": calendar_id,
        "source_calendar_name": calendar_name,
        "updated": str(item.get("updated") or "")[:64] or None,
        "title": title,
        "location": location,
        "start": start,
        "end": end,
        "all_day": "date" in (item.get("start") or {}),
        "read_only": True,
    }


def _fetch_detail_events(
    oauth_session,
    *,
    calendar: dict[str, object],
    time_min: str,
    time_max: str,
    detail_mode: str,
) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    page_token = None
    while len(events) < MAX_EVENTS_PER_CALENDAR:
        params: dict[str, object] = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "showDeleted": "false",
            "orderBy": "startTime",
            "maxResults": min(100, MAX_EVENTS_PER_CALENDAR - len(events)),
        }
        if page_token:
            params["pageToken"] = page_token
        message = f"Google Calendar could not read {calendar['name']}"
        response = _provider_request(
            oauth_session,
            "get",
            f"/calendar/v3/calendars/{quote(str(calendar['id']), safe='')}/events",
            message,
            params=params,
        )
        payload = _provider_json(response, message)
        for item in payload.get("items", []):
            normalized = _normalize_google_event(
                item,
                calendar_id=str(calendar["id"]),
                calendar_name=str(calendar["name"]),
                detail_mode=detail_mode,
            )
            if normalized:
                events.append(normalized)
                if len(events) >= MAX_EVENTS_PER_CALENDAR:
                    break
        next_token = payload.get("nextPageToken")
        page_token = next_token if isinstance(next_token, str) and next_token else None
        if not page_token:
            break
    return events


def _fetch_free_busy(
    oauth_session,
    *,
    calendars: list[dict[str, object]],
    time_min: str,
    time_max: str,
    timezone_name: str,
) -> list[dict[str, object]]:
    message = "Google Calendar could not read availability"
    payload = _provider_json(
        _provider_request(
            oauth_session,
            "post",
            "/calendar/v3/freeBusy",
            message,
            json={
                "timeMin": time_min,
                "timeMax": time_max,
                "timeZone": timezone_name,
                "items": [{"id": calendar["id"]} for calendar in calendars],
            },
        ),
        message,
    )
    returned = payload.get("calendars")
    if not isinstance(returned, dict):
        raise WeekFlowCalendarProviderError(
            "Google Calendar returned invalid availability"
        )
    events: list[dict[str, object]] = []
    for calendar in calendars:
        calendar_payload = returned.get(calendar["id"], {})
        if not isinstance(calendar_payload, dict):
            continue
        if calendar_payload.get("errors"):
            raise WeekFlowCalendarProviderError(
                f"Google Calendar could not read {calendar['name']}"
            )
        for index, busy in enumerate(calendar_payload.get("busy", [])):
            if not isinstance(busy, dict):
                continue
            start = busy.get("start")
            end = busy.get("end")
            if not isinstance(start, str) or not isinstance(end, str):
                continue
            events.append(
                {
                    "provider": "google",
                    "provider_event_id": f"freebusy-{index}-{start}"[:512],
                    "recurring_event_id": None,
                    "original_start": None,
                    "source_calendar_id": calendar["id"],
                    "source_calendar_name": calendar["name"],
                    "updated": None,
                    "title": "Busy",
                    "location": None,
                    "start": start[:64],
                    "end": end[:64],
                    "all_day": False,
                    "read_only": True,
                }
            )
    return events


def preview_google_week(
    oauth_session,
    *,
    available_calendars: list[dict[str, object]],
    payload: object,
) -> dict[str, object]:
    """Fetch one selected week without persisting source event content."""

    if not isinstance(payload, dict):
        raise TypeError("calendar preview must be a JSON object")
    preferences = normalize_calendar_preferences(payload)
    time_min, time_max, timezone_name = _week_bounds(
        payload.get("week_start"), payload.get("timezone", "America/New_York")
    )
    calendars_by_id = {str(item.get("id")): item for item in available_calendars}
    unknown = [
        item for item in preferences["calendar_ids"] if item not in calendars_by_id
    ]
    if unknown:
        raise ValueError("One or more selected calendars are unavailable")
    selected = [calendars_by_id[item] for item in preferences["calendar_ids"]]
    if preferences["detail_mode"] == "availability":
        events = _fetch_free_busy(
            oauth_session,
            calendars=selected,
            time_min=time_min,
            time_max=time_max,
            timezone_name=timezone_name,
        )
    else:
        events = []
        for calendar in selected:
            events.extend(
                _fetch_detail_events(
                    oauth_session,
                    calendar=calendar,
                    time_min=time_min,
                    time_max=time_max,
                    detail_mode="details",
                )
            )
    events.sort(key=lambda item: (str(item["start"]), str(item["title"])))
    return {
        "week_start": payload["week_start"],
        "timezone": timezone_name,
        "detail_mode": preferences["detail_mode"],
        "selected_calendars": selected,
        "events": events,
        "event_count": len(events),
        "source_owned": True,
        "persisted_event_content": False,
    }
