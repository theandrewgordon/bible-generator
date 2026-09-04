from datetime import UTC, datetime

import pytest

from faithsparks.services.weekflow_integrations import (
    GoogleRoutesProvider,
    NotificationResult,
    RouteEstimate,
    SendGridEmailProvider,
    TwilioSmsProvider,
    WeekFlowIntegrationUnavailable,
    WeekFlowProviderError,
    integration_status,
    refresh_live_routes,
)
from faithsparks.services.weekflow_logistics import family_four_school_sports_scenario


class _Response:
    def __init__(self, payload=None, *, headers=None):
        self.payload = payload or {}
        self.headers = headers or {}

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_google_routes_provider_requests_only_needed_fields(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "faithsparks.services.weekflow_integrations.httpx.post",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or _Response(
            {
                "routes": [
                    {
                        "duration": "1250s",
                        "staticDuration": "900s",
                        "distanceMeters": 12000,
                    }
                ]
            }
        ),
    )

    result = GoogleRoutesProvider("route-key").route(
        {"address": "100 Main St, Raleigh, NC"},
        {"address": "200 School Rd, Raleigh, NC"},
        datetime(2026, 9, 4, 12, tzinfo=UTC),
    )

    assert result == RouteEstimate(21, 15, 12000)
    _, kwargs = calls[0]
    assert kwargs["headers"]["X-Goog-Api-Key"] == "route-key"
    assert kwargs["headers"]["X-Goog-FieldMask"] == (
        "routes.duration,routes.staticDuration,routes.distanceMeters"
    )
    assert kwargs["json"]["routingPreference"] == "TRAFFIC_AWARE"


def test_live_route_refresh_preserves_fallbacks_for_unroutable_locations():
    scenario = family_four_school_sports_scenario()
    locations = {item["id"]: item for item in scenario["locations"]}
    locations["home"]["address"] = "100 Main St, Raleigh, NC"
    locations["school-campus"]["address"] = "200 School Rd, Raleigh, NC"

    class Provider:
        def route(self, origin, destination, departure_time):
            return RouteEstimate(24, 18, 14000, "fake_routes")

    refreshed, summary = refresh_live_routes(
        scenario,
        provider=Provider(),
        departure_time=datetime(2026, 9, 4, 12, tzinfo=UTC),
    )
    school_routes = [
        route
        for route in refreshed["routes"]
        if {route["from_location_id"], route["to_location_id"]}
        == {"home", "school-campus"}
    ]

    assert summary["refreshed"] == 2
    assert summary["skipped"] == 6
    assert all(route["base_minutes"] == 18 for route in school_routes)
    assert all(route["traffic_minutes"] == 6 for route in school_routes)
    assert all(route["distance_meters"] == 14000 for route in school_routes)
    assert all(route["provider"] == "fake_routes" for route in school_routes)


def test_route_provider_rejects_missing_credentials_and_bad_payload():
    with pytest.raises(WeekFlowIntegrationUnavailable):
        GoogleRoutesProvider("")

    provider = GoogleRoutesProvider("key")
    with pytest.raises(WeekFlowProviderError, match="address or coordinates"):
        provider.route(
            {"name": "Home"},
            {"address": "School"},
            datetime.now(UTC),
        )


def test_twilio_provider_uses_basic_auth_and_status_callback(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "faithsparks.services.weekflow_integrations.httpx.post",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or _Response({"sid": "SM123", "status": "queued"}),
    )

    result = TwilioSmsProvider("AC123", "secret", "+15550001111").send(
        destination="+15550002222",
        subject="Request",
        body="Can you help?",
        status_callback_url="https://example.test/callback",
    )

    assert result == NotificationResult("twilio", "SM123", "queued")
    args, kwargs = calls[0]
    assert args[0].endswith("/Accounts/AC123/Messages.json")
    assert kwargs["auth"] == ("AC123", "secret")
    assert kwargs["data"]["StatusCallback"] == "https://example.test/callback"


def test_sendgrid_provider_uses_bearer_auth_and_plain_text(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "faithsparks.services.weekflow_integrations.httpx.post",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or _Response(headers={"X-Message-Id": "email-123"}),
    )

    result = SendGridEmailProvider("mail-key", "weekflow@example.com").send(
        destination="helper@example.com",
        subject="WeekFlow request",
        body="Can you help?",
    )

    assert result == NotificationResult("sendgrid", "email-123", "sent")
    _, kwargs = calls[0]
    assert kwargs["headers"]["Authorization"] == "Bearer mail-key"
    assert kwargs["json"]["personalizations"][0]["to"][0]["email"] == (
        "helper@example.com"
    )


def test_integration_status_exposes_booleans_not_secrets(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_ROUTES_API_KEY", "routes-secret")
    monkeypatch.setenv("SENDGRID_API_KEY", "email-secret")
    monkeypatch.setenv("WEEKFLOW_FROM_EMAIL", "weekflow@example.com")
    monkeypatch.delenv("TWILIO_ACCOUNT_SID", raising=False)

    assert integration_status() == {"live_routes": True, "sms": False, "email": True}
