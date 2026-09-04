"""Private, capability-scoped helper and carpool request workflow."""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Callable, Protocol
from uuid import uuid4

from firebase_admin import firestore
from itsdangerous import BadData, URLSafeTimedSerializer

from faithsparks.services.firestore import db
from faithsparks.services.weekflow_integrations import (
    NotificationProvider,
    NotificationResult,
    notification_provider,
)

RESPONSE_TOKEN_SALT = "weekflow-support-response-v1"
RESPONSE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


class WeekFlowSupportUnavailable(RuntimeError):
    """Raised when durable support requests cannot be reached."""


class WeekFlowSupportTokenError(ValueError):
    """Raised for invalid, expired, or already-used response links."""


class SupportRequestRepository(Protocol):
    def create(self, request_id: str, payload: dict[str, object]) -> None: ...

    def get(self, request_id: str) -> dict[str, object] | None: ...

    def update(self, request_id: str, payload: dict[str, object]) -> None: ...


class FirestoreSupportRequestRepository:
    collection_name = "weekflow_support_requests"

    def __init__(self, client=None):
        self.client = client if client is not None else db

    def _document(self, request_id: str):
        if not self.client:
            raise WeekFlowSupportUnavailable(
                "Support requests are temporarily unavailable."
            )
        return self.client.collection(self.collection_name).document(request_id)

    def create(self, request_id: str, payload: dict[str, object]) -> None:
        self._document(request_id).create(payload)

    def get(self, request_id: str) -> dict[str, object] | None:
        snapshot = self._document(request_id).get()
        if not snapshot.exists:
            return None
        return snapshot.to_dict() or {}

    def update(self, request_id: str, payload: dict[str, object]) -> None:
        self._document(request_id).update(payload)


class MemorySupportRequestRepository:
    """Deterministic repository used by tests and local integration exercises."""

    def __init__(self):
        self.requests: dict[str, dict[str, object]] = {}

    def create(self, request_id: str, payload: dict[str, object]) -> None:
        if request_id in self.requests:
            raise ValueError("support request already exists")
        self.requests[request_id] = dict(payload)

    def get(self, request_id: str) -> dict[str, object] | None:
        payload = self.requests.get(request_id)
        return dict(payload) if payload else None

    def update(self, request_id: str, payload: dict[str, object]) -> None:
        if request_id not in self.requests:
            raise ValueError("support request does not exist")
        self.requests[request_id].update(payload)


def _clean_text(value: object, field: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > maximum:
        raise ValueError(f"{field} must be between 1 and {maximum} characters")
    return cleaned


def _destination(channel: str, value: object) -> str:
    destination = _clean_text(value, "destination", 254)
    if channel == "email":
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", destination):
            raise ValueError("destination must be a valid email address")
        return destination.casefold()
    if channel == "sms":
        if not re.fullmatch(r"\+[1-9]\d{7,14}", destination):
            raise ValueError("destination must use E.164 phone format")
        return destination
    raise ValueError("channel must be email or sms")


def _serializer(secret_key: str) -> URLSafeTimedSerializer:
    if not secret_key or len(secret_key) < 24:
        raise WeekFlowSupportUnavailable(
            "Support response signing is not configured."
        )
    return URLSafeTimedSerializer(secret_key, salt=RESPONSE_TOKEN_SALT)


def _token_payload(
    token: str, secret_key: str, *, max_age: int = RESPONSE_MAX_AGE_SECONDS
) -> tuple[str, str]:
    try:
        payload = _serializer(secret_key).loads(token, max_age=max_age)
    except BadData as exc:
        raise WeekFlowSupportTokenError(
            "This response link is invalid or has expired."
        ) from exc
    if not isinstance(payload, dict):
        raise WeekFlowSupportTokenError("This response link is invalid.")
    request_id = payload.get("request_id")
    nonce = payload.get("nonce")
    if not isinstance(request_id, str) or not isinstance(nonce, str):
        raise WeekFlowSupportTokenError("This response link is invalid.")
    return request_id, nonce


def create_and_send_support_request(
    owner_email: str,
    payload: object,
    *,
    secret_key: str,
    response_url_builder: Callable[[str], str],
    repository: SupportRequestRepository | None = None,
    provider: NotificationProvider | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise TypeError("support request must be a JSON object")
    normalized_owner = _clean_text(owner_email, "owner_email", 254).casefold()
    channel = payload.get("channel")
    if channel not in {"email", "sms"}:
        raise ValueError("channel must be email or sms")
    destination = _destination(channel, payload.get("destination"))
    request_kind = payload.get("kind", "helper")
    if request_kind not in {"helper", "carpool"}:
        raise ValueError("kind must be helper or carpool")
    event_id = _clean_text(payload.get("event_id"), "event_id", 80)
    event_title = _clean_text(payload.get("event_title"), "event_title", 120)
    adult_name = _clean_text(payload.get("adult_name"), "adult_name", 120)
    responsibility_kind = payload.get("responsibility_kind", "throughout")
    if responsibility_kind not in {"dropoff", "pickup", "throughout"}:
        raise ValueError("responsibility_kind is invalid")
    request_id = uuid4().hex
    nonce = secrets.token_urlsafe(24)
    token = _serializer(secret_key).dumps(
        {"request_id": request_id, "nonce": nonce}
    )
    response_url = response_url_builder(token)
    created_at = (now or datetime.now(UTC)).astimezone(UTC)
    message = (
        f"WeekFlow request: Can you help with {event_title} "
        f"({responsibility_kind})? Respond here: {response_url}"
    )
    record = {
        "ownerEmail": normalized_owner,
        "ownerHash": hashlib.sha256(normalized_owner.encode()).hexdigest(),
        "eventId": event_id,
        "eventTitle": event_title,
        "adultName": adult_name,
        "responsibilityKind": responsibility_kind,
        "kind": request_kind,
        "status": "pending",
        "notificationStatus": "queued",
        "notificationChannel": channel,
        "provider": None,
        "providerMessageId": None,
        "destinationHash": hashlib.sha256(destination.encode()).hexdigest(),
        "destinationHint": destination[-4:],
        "nonceHash": hashlib.sha256(nonce.encode()).hexdigest(),
        "createdAt": created_at,
        "expiresAt": created_at + timedelta(seconds=RESPONSE_MAX_AGE_SECONDS),
        "respondedAt": None,
    }
    store = repository or FirestoreSupportRequestRepository()
    try:
        store.create(request_id, record)
    except Exception as exc:
        raise WeekFlowSupportUnavailable(
            "The support request could not be saved."
        ) from exc
    sender = provider or notification_provider(channel)
    try:
        result = sender.send(
            destination=destination,
            subject=f"WeekFlow {request_kind} request",
            body=message,
        )
    except Exception:
        store.update(request_id, {"notificationStatus": "failed"})
        raise
    store.update(
        request_id,
        {
            "notificationStatus": result.status,
            "provider": result.provider,
            "providerMessageId": result.message_id,
        },
    )
    return {
        "id": request_id,
        "status": "pending",
        "notification_status": result.status,
        "channel": channel,
        "destination_hint": destination[-4:],
        "expires_at": record["expiresAt"].isoformat(),
    }


def load_support_response(
    token: str,
    *,
    secret_key: str,
    repository: SupportRequestRepository | None = None,
    max_age: int = RESPONSE_MAX_AGE_SECONDS,
) -> dict[str, object]:
    request_id, nonce = _token_payload(token, secret_key, max_age=max_age)
    store = repository or FirestoreSupportRequestRepository()
    record = store.get(request_id)
    if not record or not secrets.compare_digest(
        str(record.get("nonceHash", "")), hashlib.sha256(nonce.encode()).hexdigest()
    ):
        raise WeekFlowSupportTokenError("This response link is invalid.")
    expires_at = record.get("expiresAt")
    if isinstance(expires_at, datetime) and datetime.now(UTC) >= expires_at.astimezone(UTC):
        raise WeekFlowSupportTokenError("This response link has expired.")
    return {
        "request_id": request_id,
        "event_title": record.get("eventTitle"),
        "adult_name": record.get("adultName"),
        "responsibility_kind": record.get("responsibilityKind"),
        "kind": record.get("kind"),
        "status": record.get("status"),
    }


def respond_to_support_request(
    token: str,
    response: str,
    *,
    secret_key: str,
    repository: SupportRequestRepository | None = None,
) -> dict[str, object]:
    if response not in {"accept", "decline"}:
        raise ValueError("response must be accept or decline")
    store = repository or FirestoreSupportRequestRepository()
    public = load_support_response(
        token, secret_key=secret_key, repository=store
    )
    if public["status"] != "pending":
        raise WeekFlowSupportTokenError("This request has already been answered.")
    status = "accepted" if response == "accept" else "declined"
    store.update(
        public["request_id"],
        {"status": status, "respondedAt": firestore.SERVER_TIMESTAMP},
    )
    return {**public, "status": status}


def load_owner_support_status(
    owner_email: str,
    request_id: str,
    *,
    repository: SupportRequestRepository | None = None,
) -> dict[str, object]:
    normalized_owner = _clean_text(owner_email, "owner_email", 254).casefold()
    store = repository or FirestoreSupportRequestRepository()
    record = store.get(_clean_text(request_id, "request_id", 80))
    if not record or not secrets.compare_digest(
        str(record.get("ownerEmail", "")), normalized_owner
    ):
        raise WeekFlowSupportTokenError("Support request not found.")
    return {
        "id": request_id,
        "event_id": record.get("eventId"),
        "status": record.get("status"),
        "notification_status": record.get("notificationStatus"),
        "responded": bool(record.get("respondedAt")),
    }
