from __future__ import annotations

from cryptography.fernet import Fernet
from flask import Flask, session

import faithsparks.services.weekflow_calendar as calendar_service
from faithsparks.services.weekflow_calendar import (
    EncryptedFirestoreCalendarTokenStorage,
    list_google_calendars,
    normalize_calendar_preferences,
    preview_google_week,
)


class _Response:
    def __init__(self, payload, *, ok=True):
        self.payload = payload
        self.ok = ok

    def json(self):
        return self.payload


class _OAuth:
    def __init__(self, *, gets=None, posts=None):
        self.gets = list(gets or [])
        self.posts = list(posts or [])
        self.calls = []

    def get(self, path, **kwargs):
        self.calls.append(("GET", path, kwargs))
        return self.gets.pop(0)

    def post(self, path, **kwargs):
        self.calls.append(("POST", path, kwargs))
        return self.posts.pop(0)


class _Snapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class _Document:
    def __init__(self, database, path):
        self.database = database
        self.path = path

    def collection(self, name):
        return _Collection(self.database, (*self.path, name))

    def get(self):
        return _Snapshot(self.database.rows.get(self.path))

    def set(self, payload):
        self.database.rows[self.path] = payload

    def delete(self):
        self.database.rows.pop(self.path, None)


class _Collection:
    def __init__(self, database, path):
        self.database = database
        self.path = path

    def document(self, name):
        return _Document(self.database, (*self.path, name))


class _Database:
    def __init__(self):
        self.rows = {}

    def __bool__(self):
        return True

    def collection(self, name):
        return _Collection(self, (name,))


def test_calendar_list_is_bounded_normalized_and_primary_first():
    oauth = _OAuth(
        gets=[
            _Response(
                {
                    "items": [
                        {
                            "id": "dance@example.com",
                            "summary": "Dance",
                            "accessRole": "reader",
                            "backgroundColor": "#cc5577",
                        },
                        {
                            "id": "family@example.com",
                            "summary": "Family",
                            "primary": True,
                            "accessRole": "owner",
                        },
                    ]
                }
            )
        ]
    )

    calendars = list_google_calendars(oauth)

    assert [item["name"] for item in calendars] == ["Family", "Dance"]
    assert calendars[0]["primary"] is True
    assert oauth.calls[0][1] == "/calendar/v3/users/me/calendarList"


def test_details_preview_preserves_provider_identity_and_never_claims_ownership():
    oauth = _OAuth(
        gets=[
            _Response(
                {
                    "items": [
                        {
                            "id": "instance-1",
                            "recurringEventId": "football-series",
                            "originalStartTime": {
                                "dateTime": "2026-09-01T17:00:00-04:00"
                            },
                            "updated": "2026-08-30T12:00:00Z",
                            "summary": "Football practice",
                            "location": "Community field",
                            "start": {"dateTime": "2026-09-01T17:00:00-04:00"},
                            "end": {"dateTime": "2026-09-01T18:30:00-04:00"},
                        }
                    ]
                }
            )
        ]
    )

    preview = preview_google_week(
        oauth,
        available_calendars=[
            {"id": "family@example.com", "name": "Family", "primary": True}
        ],
        payload={
            "calendar_ids": ["family@example.com"],
            "detail_mode": "details",
            "week_start": "2026-08-31",
            "timezone": "America/New_York",
        },
    )

    event = preview["events"][0]
    assert event["provider_event_id"] == "instance-1"
    assert event["recurring_event_id"] == "football-series"
    assert event["source_calendar_id"] == "family@example.com"
    assert event["title"] == "Football practice"
    assert event["location"] == "Community field"
    assert event["read_only"] is True
    assert preview["source_owned"] is True
    assert preview["persisted_event_content"] is False
    assert "family%40example.com" in oauth.calls[0][1]
    assert oauth.calls[0][2]["params"]["timeMin"] == "2026-08-31T04:00:00Z"


def test_availability_preview_uses_freebusy_and_returns_no_private_details():
    oauth = _OAuth(
        posts=[
            _Response(
                {
                    "calendars": {
                        "private": {
                            "busy": [
                                {
                                    "start": "2026-09-02T20:00:00Z",
                                    "end": "2026-09-02T21:00:00Z",
                                }
                            ]
                        }
                    }
                }
            )
        ]
    )

    preview = preview_google_week(
        oauth,
        available_calendars=[{"id": "private", "name": "Private"}],
        payload={
            "calendar_ids": ["private"],
            "detail_mode": "availability",
            "week_start": "2026-08-31",
            "timezone": "America/New_York",
        },
    )

    assert preview["events"][0]["title"] == "Busy"
    assert preview["events"][0]["location"] is None
    assert oauth.calls[0][0:2] == ("POST", "/calendar/v3/freeBusy")


def test_calendar_preferences_require_explicit_valid_selection():
    assert normalize_calendar_preferences(
        {"calendar_ids": ["family", "family"], "detail_mode": "availability"}
    ) == {"calendar_ids": ["family"], "detail_mode": "availability"}

    for payload in ({}, {"calendar_ids": []}, {"calendar_ids": ["family"], "detail_mode": "everything"}):
        try:
            normalize_calendar_preferences(payload)
        except (TypeError, ValueError):
            pass
        else:
            raise AssertionError("invalid calendar preferences were accepted")


def test_calendar_oauth_token_is_encrypted_at_rest_and_not_put_in_session(
    monkeypatch,
):
    database = _Database()
    monkeypatch.setattr(calendar_service, "db", database)
    monkeypatch.setenv(calendar_service.TOKEN_KEY_ENV, Fernet.generate_key().decode())
    app = Flask(__name__)
    app.secret_key = "calendar-test"
    storage = EncryptedFirestoreCalendarTokenStorage()
    token = {
        "access_token": "very-secret-access-token",
        "refresh_token": "very-secret-refresh-token",
        "scope": calendar_service.CALENDAR_READONLY_SCOPE,
        "token_type": "Bearer",
        "expires_at": 12345.0,
    }

    with app.test_request_context("/"):
        session["user_email"] = "Parent@Example.com"
        storage.set(None, token)
        stored = next(iter(database.rows.values()))

        assert "very-secret" not in stored["encryptedToken"]
        assert storage.get(None) == token
        assert all("calendar" not in key for key in session if key != "user_email")
