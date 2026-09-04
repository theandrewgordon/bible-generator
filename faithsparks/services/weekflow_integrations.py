"""Opt-in production providers for WeekFlow routes and support notifications."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

import httpx


class WeekFlowIntegrationUnavailable(RuntimeError):
    """Raised when an optional provider is not configured."""


class WeekFlowProviderError(RuntimeError):
    """Raised when a configured provider rejects or cannot complete a request."""


@dataclass(frozen=True)
class RouteEstimate:
    duration_minutes: int
    static_minutes: int
    distance_meters: int
    provider: str = "google_routes"


class RouteProvider(Protocol):
    def route(
        self,
        origin: dict[str, object],
        destination: dict[str, object],
        departure_time: datetime,
    ) -> RouteEstimate: ...


@dataclass(frozen=True)
class NotificationResult:
    provider: str
    message_id: str
    status: str


class NotificationProvider(Protocol):
    def send(
        self,
        *,
        destination: str,
        subject: str,
        body: str,
        status_callback_url: str | None = None,
    ) -> NotificationResult: ...


def _duration_minutes(value: object) -> int:
    if not isinstance(value, str) or not value.endswith("s"):
        raise WeekFlowProviderError("The route provider returned an invalid duration.")
    try:
        seconds = float(value[:-1])
    except ValueError as exc:
        raise WeekFlowProviderError(
            "The route provider returned an invalid duration."
        ) from exc
    return max(1, math.ceil(seconds / 60))


def _waypoint(location: dict[str, object]) -> dict[str, object]:
    address = location.get("address")
    if isinstance(address, str) and address:
        return {"address": address}
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if isinstance(latitude, (int, float)) and isinstance(longitude, (int, float)):
        return {
            "location": {
                "latLng": {"latitude": latitude, "longitude": longitude}
            }
        }
    raise WeekFlowProviderError("A saved location needs an address or coordinates.")


class GoogleRoutesProvider:
    endpoint = "https://routes.googleapis.com/directions/v2:computeRoutes"

    def __init__(self, api_key: str, *, timeout_seconds: float = 8.0):
        if not api_key:
            raise WeekFlowIntegrationUnavailable("Google Routes is not configured.")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def route(
        self,
        origin: dict[str, object],
        destination: dict[str, object],
        departure_time: datetime,
    ) -> RouteEstimate:
        departure = departure_time.astimezone(UTC).isoformat().replace("+00:00", "Z")
        try:
            response = httpx.post(
                self.endpoint,
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": (
                        "routes.duration,routes.staticDuration,routes.distanceMeters"
                    ),
                },
                json={
                    "origin": _waypoint(origin),
                    "destination": _waypoint(destination),
                    "travelMode": "DRIVE",
                    "routingPreference": "TRAFFIC_AWARE",
                    "departureTime": departure,
                    "computeAlternativeRoutes": False,
                },
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WeekFlowProviderError(
                "Live route timing is temporarily unavailable."
            ) from exc
        routes = payload.get("routes") if isinstance(payload, dict) else None
        if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
            raise WeekFlowProviderError("No driving route was returned.")
        route = routes[0]
        duration = _duration_minutes(route.get("duration"))
        static = _duration_minutes(route.get("staticDuration", route.get("duration")))
        distance = route.get("distanceMeters", 0)
        if not isinstance(distance, int) or distance < 0:
            raise WeekFlowProviderError("The route provider returned invalid distance.")
        return RouteEstimate(duration, static, distance)


def google_routes_provider() -> GoogleRoutesProvider:
    return GoogleRoutesProvider(os.getenv("GOOGLE_MAPS_ROUTES_API_KEY", "").strip())


def refresh_live_routes(
    scenario: dict[str, object],
    *,
    provider: RouteProvider | None = None,
    departure_time: datetime | None = None,
) -> tuple[dict[str, object], dict[str, object]]:
    """Refresh configured directional routes without changing event ownership."""

    from faithsparks.services.weekflow_logistics import normalize_logistics_scenario

    normalized = normalize_logistics_scenario(scenario)
    route_provider = provider or google_routes_provider()
    now = (departure_time or datetime.now(UTC)).astimezone(UTC)
    locations = {item["id"]: item for item in normalized["locations"]}
    refreshed = 0
    skipped = 0
    for route in normalized["routes"]:
        origin = locations[route["from_location_id"]]
        destination = locations[route["to_location_id"]]
        if not (
            origin.get("address")
            or (origin.get("latitude") is not None and origin.get("longitude") is not None)
        ) or not (
            destination.get("address")
            or (
                destination.get("latitude") is not None
                and destination.get("longitude") is not None
            )
        ):
            skipped += 1
            continue
        estimate = route_provider.route(origin, destination, now)
        route["base_minutes"] = estimate.static_minutes
        route["traffic_minutes"] = max(
            0, estimate.duration_minutes - estimate.static_minutes
        )
        route["distance_meters"] = estimate.distance_meters
        route["provider"] = estimate.provider
        route["refreshed_at"] = now.isoformat()
        route["expires_at"] = (now + timedelta(minutes=15)).isoformat()
        refreshed += 1
    return normalized, {
        "refreshed": refreshed,
        "skipped": skipped,
        "provider": "google_routes",
        "refreshed_at": now.isoformat(),
    }


class TwilioSmsProvider:
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        if not account_sid or not auth_token or not from_number:
            raise WeekFlowIntegrationUnavailable("Twilio SMS is not configured.")
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number

    def send(
        self,
        *,
        destination: str,
        subject: str,
        body: str,
        status_callback_url: str | None = None,
    ) -> NotificationResult:
        data = {"To": destination, "From": self.from_number, "Body": body}
        if status_callback_url:
            data["StatusCallback"] = status_callback_url
        try:
            response = httpx.post(
                (
                    "https://api.twilio.com/2010-04-01/Accounts/"
                    f"{self.account_sid}/Messages.json"
                ),
                data=data,
                auth=(self.account_sid, self.auth_token),
                timeout=8.0,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WeekFlowProviderError("The SMS request could not be sent.") from exc
        message_id = payload.get("sid") if isinstance(payload, dict) else None
        status = payload.get("status", "queued") if isinstance(payload, dict) else None
        if not isinstance(message_id, str) or not message_id:
            raise WeekFlowProviderError("The SMS provider returned no message ID.")
        return NotificationResult("twilio", message_id, str(status or "queued"))


class SendGridEmailProvider:
    def __init__(self, api_key: str, from_email: str):
        if not api_key or not from_email:
            raise WeekFlowIntegrationUnavailable("SendGrid email is not configured.")
        self.api_key = api_key
        self.from_email = from_email

    def send(
        self,
        *,
        destination: str,
        subject: str,
        body: str,
        status_callback_url: str | None = None,
    ) -> NotificationResult:
        try:
            response = httpx.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "personalizations": [{"to": [{"email": destination}]}],
                    "from": {"email": self.from_email},
                    "subject": subject,
                    "content": [{"type": "text/plain", "value": body}],
                },
                timeout=8.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise WeekFlowProviderError("The email request could not be sent.") from exc
        message_id = response.headers.get("X-Message-Id", "")
        if not message_id:
            raise WeekFlowProviderError("The email provider returned no message ID.")
        return NotificationResult("sendgrid", message_id, "sent")


def notification_provider(channel: str) -> NotificationProvider:
    if channel == "sms":
        return TwilioSmsProvider(
            os.getenv("TWILIO_ACCOUNT_SID", "").strip(),
            os.getenv("TWILIO_AUTH_TOKEN", "").strip(),
            os.getenv("TWILIO_FROM_NUMBER", "").strip(),
        )
    if channel == "email":
        return SendGridEmailProvider(
            os.getenv("SENDGRID_API_KEY", "").strip(),
            os.getenv("WEEKFLOW_FROM_EMAIL", "").strip(),
        )
    raise ValueError("Notification channel must be sms or email.")


def integration_status() -> dict[str, bool]:
    return {
        "live_routes": bool(os.getenv("GOOGLE_MAPS_ROUTES_API_KEY", "").strip()),
        "sms": all(
            os.getenv(key, "").strip()
            for key in (
                "TWILIO_ACCOUNT_SID",
                "TWILIO_AUTH_TOKEN",
                "TWILIO_FROM_NUMBER",
            )
        ),
        "email": bool(os.getenv("SENDGRID_API_KEY", "").strip())
        and bool(os.getenv("WEEKFLOW_FROM_EMAIL", "").strip()),
    }
