from faithsparks.services import bible_bee_ai


def test_ai_validation_can_improve_distractors_without_changing_answer(monkeypatch):
    questions = [
        {
            "id": "q1",
            "label": "Finish the Verse",
            "prompt": "A friend is always loyal, and a brother…",
            "choices": [
                "Seek His will in all you do.",
                "is born to help in time of need.",
                "The godly run to Him.",
                "They will not leave it.",
            ],
            "correct": 1,
        }
    ]
    monkeypatch.setattr(
        bible_bee_ai,
        "_ask",
        lambda provider, system, prompt: {
            "questions": [
                {
                    "id": "q1",
                    "choices": [
                        "is called to help in time of need.",
                        "is ready to help in time of need.",
                        "is born to help in time of need.",
                        "is born to serve in time of need.",
                    ],
                }
            ]
        },
    )

    validated, summary = bible_bee_ai.validate_questions("openai", questions)

    assert validated[0]["choices"][validated[0]["correct"]] == "is born to help in time of need."
    assert summary == {"provider": "openai", "reviewed": 1, "improved": 1}


def test_ai_validation_rejects_a_suggestion_that_changes_the_correct_answer(monkeypatch):
    questions = [
        {
            "id": "q1",
            "label": "Reference Race",
            "prompt": "For God so loved the world…",
            "choices": ["John 3:16", "Romans 8:28"],
            "correct": 0,
        }
    ]
    monkeypatch.setattr(
        bible_bee_ai,
        "_ask",
        lambda provider, system, prompt: {
            "questions": [{"id": "q1", "choices": ["John 1:1", "Romans 8:28"]}]
        },
    )

    validated, summary = bible_bee_ai.validate_questions("claude", questions)

    assert validated == questions
    assert summary["improved"] == 0
