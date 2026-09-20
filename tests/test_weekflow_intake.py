from types import SimpleNamespace

import pytest

import faithsparks.services.weekflow_intake as intake
from faithsparks.services.weekflow_intake import (
    WeekFlowIntakeError,
    interpret_weekflow_intake,
    transcribe_weekflow_audio,
    validate_intake,
)


HOUSEHOLD = {
    "adults": [{"id": "mom", "name": "Mom", "color": "#123456"}],
    "students": [
        {"id": "grace", "name": "Grace", "color": "#654321"},
        {"id": "ellie", "name": "Ellie", "color": "#abcdef"},
    ],
}


def test_validator_resolves_known_people_and_expands_travel():
    result = validate_intake(
        {
            "summary": "A normal week",
            "assignments": [
                {
                    "title": "Math",
                    "subject": "Math",
                    "student_names": ["Grace"],
                    "times_per_week": 4,
                    "minutes": 35,
                    "parent_help": "checkin",
                    "priority": "important",
                    "due_day": "fri",
                }
            ],
            "commitments": [
                {
                    "title": "Piano",
                    "day_id": "wed",
                    "start": "13:00",
                    "end": "14:00",
                    "participant_names": ["Mom", "Grace", "Ellie"],
                    "recurring": True,
                    "travel_before_minutes": 20,
                    "travel_after_minutes": 15,
                }
            ],
            "availability": [
                {"person_name": "Grace", "day_ids": ["mon", "tue"], "end_time": "15:00"}
            ],
            "questions": [],
        },
        HOUSEHOLD,
    )

    assert result["requires_review"] is True
    assert result["warnings"] == []
    assert result["assignments"][0]["student_ids"] == ["grace"]
    assert result["assignments"][0]["priority"] == 5
    assert result["commitments"][0]["participant_ids"] == ["mom", "grace", "ellie"]
    assert result["commitments"][0]["start_minute"] == 12 * 60 + 40
    assert result["commitments"][0]["end_minute"] == 14 * 60 + 15
    assert result["availability"][0]["end_minute"] == 15 * 60


def test_validator_keeps_unsafe_rows_visible_but_unselectable():
    result = validate_intake(
        {
            "summary": "Needs review",
            "assignments": [
                {
                    "title": "Math",
                    "subject": "Math",
                    "student_names": ["Unknown child"],
                    "times_per_week": 9,
                    "minutes": 5,
                    "parent_help": "maybe",
                    "priority": "urgent",
                    "due_day": "sun",
                }
            ],
            "commitments": [],
            "availability": [],
            "questions": ["Which child is this for?"],
        },
        HOUSEHOLD,
    )

    assert result["assignments"][0]["valid"] is False
    assert result["warnings"]
    assert result["questions"] == ["Which child is this for?"]


def test_validator_blocks_an_appointment_with_an_invented_or_missing_time():
    result = validate_intake(
        {
            "summary": "One appointment needs clarification",
            "assignments": [],
            "commitments": [{
                "title": "Piano", "day_id": "wed", "start": "13:00", "end": None,
                "participant_names": ["Mom", "Grace"], "recurring": True,
                "travel_before_minutes": 0, "travel_after_minutes": 0,
            }],
            "availability": [],
            "questions": ["What time does piano end?"],
        },
        HOUSEHOLD,
    )

    assert result["commitments"][0]["valid"] is False
    assert "Start and end times need review." in result["commitments"][0]["reasons"]


def test_voice_note_rejects_unsupported_or_oversized_files():
    with pytest.raises(WeekFlowIntakeError, match="Use a WebM"):
        transcribe_weekflow_audio(b"voice", "note.txt", "text/plain")
    with pytest.raises(WeekFlowIntakeError, match="shorter than 12 MB"):
        transcribe_weekflow_audio(b"x" * (12 * 1024 * 1024 + 1), "note.webm", "audio/webm")


def test_ai_extraction_is_private_structured_and_still_deterministically_validated(monkeypatch):
    captured = {}
    raw = {
        "summary": "Three math lessons",
        "assignments": [{
            "title": "Math", "subject": "Math", "student_names": ["Grace"],
            "times_per_week": 3, "minutes": 30, "parent_help": "independent",
            "priority": "normal", "due_day": "fri",
        }],
        "commitments": [], "availability": [], "questions": [],
    }

    class Responses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text=__import__("json").dumps(raw))

    monkeypatch.setattr(
        intake,
        "_client",
        lambda: SimpleNamespace(responses=Responses()),
    )

    result = interpret_weekflow_intake(
        household=HOUSEHOLD,
        text="Grace has math three times.",
        safety_identifier="Parent@Example.com",
    )

    assert captured["store"] is False
    assert captured["user"] != "Parent@Example.com"
    assert len(captured["user"]) == 32
    assert captured["text"]["format"]["strict"] is True
    assert captured["max_output_tokens"] == 2500
    assert result["assignments"][0]["student_ids"] == ["grace"]
    assert result["requires_review"] is True


def test_voice_note_accepts_codec_qualified_iphone_audio(monkeypatch):
    captured = {}

    class Transcriptions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text="Piano Wednesday at one")

    monkeypatch.setattr(
        intake,
        "_client",
        lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=Transcriptions())),
    )

    transcript = transcribe_weekflow_audio(
        b"voice", "note.m4a", "audio/mp4; codecs=mp4a.40.2"
    )

    assert transcript == "Piano Wednesday at one"
    assert captured["file"].name == "note.m4a"
