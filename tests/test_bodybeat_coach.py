from types import SimpleNamespace
from unittest.mock import MagicMock

from app import app
from faithsparks.services import bodybeat_coach as coach


def test_bodybeat_coach_requires_csrf(plus_visitor):
    with app.test_client() as client:
        response = client.post("/labs/bodybeat/coach", json={"action": "routine", "description": "Easy"})
    assert response.status_code == 403


def test_bodybeat_uses_schema_and_normalizes_seated_moves(plus_visitor, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setattr(coach, "ai_budget_ok", lambda *_: True)
    monkeypatch.setattr(coach, "check_rate_limit", lambda *_, **__: SimpleNamespace(allowed=True))
    ai = MagicMock()
    create = ai.return_value.__enter__.return_value.responses.create
    create.return_value.output_text = (
        '{"name":"  Easy Beats  ","duration":30,"difficulty":"easy","gameMode":"seated",'
        '"numPlayers":2,"moves":["reach_left","duck","reach_right","freeze"]}'
    )
    monkeypatch.setattr(coach, "OpenAI", ai)
    with app.test_client() as client:
        headers = {"X-CSRF-Token": "page-test-token"}
        response = client.post("/labs/bodybeat/coach",
                               json={"action": "routine", "description": "Easy, two players"},
                               headers=headers)
        assert response.status_code == 200
        assert response.json["routine"]["moves"] == ["reach_left", "reach_up", "reach_right", "freeze"]
        assert create.call_args.kwargs["store"] is False
        assert create.call_args.kwargs["text"]["format"]["strict"] is True

        response = client.post("/labs/bodybeat/coach",
                               json={"action": "summary", "counts": {"name": "unexpected"}},
                               headers=headers)
        assert response.status_code == 400
        assert create.call_count == 1
