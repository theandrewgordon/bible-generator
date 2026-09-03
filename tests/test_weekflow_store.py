import pytest

from faithsparks.services.weekflow_store import (
    MAX_STATE_BYTES,
    default_beta_state,
    normalize_beta_state,
    record_beta_feedback,
)


def test_default_beta_state_is_valid_and_normalized():
    state = normalize_beta_state(default_beta_state())

    assert state["revision"] == 0
    assert state["approved"] is False
    assert state["family"]["timezone"] == "America/New_York"
    assert state["scenario"]["events"][0]["day_id"] == "thu"


@pytest.mark.parametrize(
    "change, error",
    [
        (("revision", -1), "revision"),
        (("approved", "yes"), "approved"),
        (("family.timezone", "Mars/Olympus"), "timezone"),
        (("family.name", ""), "family.name"),
        (("family.parent_label", ""), "parent_label"),
        (("family.students.tessa.color", "red"), "colors"),
    ],
)
def test_beta_state_rejects_invalid_account_data(change, error):
    state = default_beta_state()
    path, value = change
    target = state
    parts = path.split(".")
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = value

    with pytest.raises((TypeError, ValueError), match=error):
        normalize_beta_state(state)


def test_beta_state_rejects_oversized_payload():
    state = default_beta_state()
    state["padding"] = "x" * (MAX_STATE_BYTES + 1)

    with pytest.raises(ValueError, match="too large"):
        normalize_beta_state(state)


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"realistic": "maybe", "comment": "", "contact": False},
        {"realistic": "yes", "comment": "x" * 1001, "contact": False},
        {"realistic": "no", "comment": "", "contact": "yes"},
    ],
)
def test_feedback_rejects_invalid_or_excessive_data(payload):
    with pytest.raises((TypeError, ValueError)):
        record_beta_feedback(None, payload)
