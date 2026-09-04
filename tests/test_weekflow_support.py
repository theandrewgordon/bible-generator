from datetime import UTC, datetime

import pytest

from faithsparks.services.weekflow_integrations import (
    NotificationResult,
    WeekFlowProviderError,
)
from faithsparks.services.weekflow_support import (
    MemorySupportRequestRepository,
    WeekFlowSupportTokenError,
    create_and_send_support_request,
    load_owner_support_status,
    load_support_response,
    respond_to_support_request,
)

SECRET = "weekflow-test-signing-key-123456789"


class _Provider:
    def __init__(self, *, fail=False):
        self.fail = fail
        self.messages = []

    def send(self, **payload):
        self.messages.append(payload)
        if self.fail:
            raise WeekFlowProviderError("provider failed")
        return NotificationResult("fake", "message-123", "sent")


def _create(repository, provider, *, destination="helper@example.com"):
    urls = []
    result = create_and_send_support_request(
        "Parent@Example.com",
        {
            "channel": "email",
            "destination": destination,
            "kind": "carpool",
            "event_id": "school",
            "event_title": "School pickup",
            "adult_name": "Jordan",
            "responsibility_kind": "pickup",
        },
        secret_key=SECRET,
        response_url_builder=lambda token: urls.append(token)
        or f"https://example.test/respond/{token}",
        repository=repository,
        provider=provider,
        now=datetime(2026, 9, 4, 12, tzinfo=UTC),
    )
    return result, urls[0]


def test_signed_request_reveals_only_the_one_requested_handoff():
    repository = MemorySupportRequestRepository()
    provider = _Provider()
    result, token = _create(repository, provider)

    public = load_support_response(
        token, secret_key=SECRET, repository=repository
    )

    assert result["status"] == "pending"
    assert public == {
        "request_id": result["id"],
        "event_title": "School pickup",
        "adult_name": "Jordan",
        "responsibility_kind": "pickup",
        "kind": "carpool",
        "status": "pending",
    }
    assert "ownerEmail" not in public and "destination" not in public
    assert "helper@example.com" not in str(repository.requests[result["id"]])
    assert token in provider.messages[0]["body"]


def test_response_link_is_tamper_evident_and_one_use():
    repository = MemorySupportRequestRepository()
    result, token = _create(repository, _Provider())

    accepted = respond_to_support_request(
        token, "accept", secret_key=SECRET, repository=repository
    )

    assert accepted["status"] == "accepted"
    with pytest.raises(WeekFlowSupportTokenError, match="already been answered"):
        respond_to_support_request(
            token, "decline", secret_key=SECRET, repository=repository
        )
    with pytest.raises(WeekFlowSupportTokenError, match="invalid or has expired"):
        load_support_response(
            token + "tampered", secret_key=SECRET, repository=repository
        )
    assert repository.requests[result["id"]]["status"] == "accepted"


def test_owner_status_cannot_cross_households():
    repository = MemorySupportRequestRepository()
    result, _ = _create(repository, _Provider())

    status = load_owner_support_status(
        "parent@example.com", result["id"], repository=repository
    )
    assert status["status"] == "pending"
    with pytest.raises(WeekFlowSupportTokenError, match="not found"):
        load_owner_support_status(
            "other-family@example.com", result["id"], repository=repository
        )


def test_provider_failure_leaves_a_durable_failed_request():
    repository = MemorySupportRequestRepository()

    with pytest.raises(WeekFlowProviderError, match="provider failed"):
        _create(repository, _Provider(fail=True))

    assert len(repository.requests) == 1
    assert next(iter(repository.requests.values()))["notificationStatus"] == "failed"


@pytest.mark.parametrize(
    "destination",
    ["not-an-email", "", "person @example.com"],
)
def test_support_request_rejects_invalid_email_destinations(destination):
    with pytest.raises((TypeError, ValueError)):
        _create(MemorySupportRequestRepository(), _Provider(), destination=destination)
