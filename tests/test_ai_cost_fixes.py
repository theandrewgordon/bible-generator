"""AI cost/abuse audit 2026-10-14: daily budget, cheaper capped models, gates."""

import os
import sys
from types import SimpleNamespace

import pytest
from flask import Flask

import faithsparks.services.ai_budget as ai_budget
import faithsparks.services.bible_bee_ai as bee_ai
import faithsparks.views.weekflow as weekflow_view
import verse_helpers

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

CSRF = "test-csrf-token"


@pytest.fixture
def store(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(ai_budget, "db", db)
    monkeypatch.setattr(ai_budget, "_memory", {})
    monkeypatch.setattr(ai_budget, "_alerted", set())
    monkeypatch.delenv("AI_DISABLED", raising=False)
    return db


def test_daily_budget_stops_calls_and_records_by_feature(store, monkeypatch):
    monkeypatch.setenv("AI_DAILY_BUDGET", "5")
    assert all(ai_budget.ai_budget_ok("worksheet_text", 1) for _ in range(5))
    assert not ai_budget.ai_budget_ok("worksheet_text", 1)
    day = next(iter(store.store["ai_budget"].values()))
    assert day["units"] == 5 and day["features"]["worksheet_text"] == 5


def test_kill_switch_turns_all_ai_off(store, monkeypatch):
    monkeypatch.setenv("AI_DISABLED", "1")
    assert not ai_budget.ai_budget_ok("anything", 1)


def test_worksheet_call_is_capped_and_skipped_when_budget_is_spent(store, monkeypatch):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))])

    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(verse_helpers, "client", fake)
    monkeypatch.setenv("AI_DAILY_BUDGET", "1")
    assert verse_helpers.call_openai([{"role": "user", "content": "x"}]) == "{}"
    assert calls[0]["max_tokens"] == verse_helpers.WORKSHEET_MAX_TOKENS
    assert verse_helpers.call_openai([{"role": "user", "content": "x"}]) is None
    assert len(calls) == 1


class _FakeOpenAI:
    calls: list = []

    def __init__(self, **kwargs):
        self.responses = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        _FakeOpenAI.calls.append(kwargs)
        refs = ["John 3:16", "Psalm 23:1", "Romans 8:28", "Joshua 1:9", "Isaiah 41:10"]
        return SimpleNamespace(output_text='{"title": "Courage", "description": "", "references": %s}'
                               % str(refs).replace("'", '"'))


def test_bible_bee_uses_mini_model_with_output_cap_and_caches_plans(store, monkeypatch):
    import openai

    _FakeOpenAI.calls = []
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)
    monkeypatch.setattr(bee_ai, "db", store)
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("BIBLE_BEE_PROVIDER_ORDER", "openai")
    monkeypatch.delenv("BIBLE_BEE_OPENAI_MODEL", raising=False)

    first = bee_ai.create_one_off_plan("Courage", "Family", 5)
    second = bee_ai.create_one_off_plan("  courage ", "Family", 5)
    assert len(_FakeOpenAI.calls) == 1
    call = _FakeOpenAI.calls[0]
    assert call["model"] == "gpt-4o-mini"
    assert call["max_output_tokens"] == bee_ai.MAX_OUTPUT_TOKENS
    assert "reasoning" not in call
    assert second["references"] == first["references"]


def test_bible_bee_custom_games_need_plus(monkeypatch):
    from app import app
    from faithsparks.views import bible_bee

    called = []
    monkeypatch.setattr(bible_bee, "has_active_plus", lambda user: False)
    monkeypatch.setattr(bible_bee, "create_one_off_plan", lambda *a, **k: called.append(1))
    client = app.test_client()
    with client.session_transaction() as sess:
        sess.update({"_csrf_token": CSRF, "user_email": "free@x.com", "user_info": {"email": "free@x.com"},
                     "user_owned_packs": ["-"], "google_oauth_token": {"access_token": "t", "token_type": "Bearer"}})
    response = client.post("/family-bible-bee/create", headers={"X-CSRF-Token": CSRF},
                           data={"game_source": "custom", "one_off_theme": "Courage"})
    assert response.status_code == 403
    assert b"Plus" in response.data
    assert called == []


def test_worship_import_sends_at_most_one_song_to_the_ai(monkeypatch):
    import app as app_module

    calls = []
    monkeypatch.setattr(app_module, "_parse_worship_lyrics_claude", lambda *a: calls.append(1))
    monkeypatch.setattr(app_module, "_parse_worship_lyrics_openai", lambda *a: calls.append(1))
    monkeypatch.setattr(app_module, "google", SimpleNamespace(authorized=True))
    client = app_module.app.test_client()
    with client.session_transaction() as sess:
        sess.update({"user_email": "ed@x.com", "user_info": {"email": "ed@x.com"}, "user_owned_packs": ["-"],
                     app_module.CSRF_SESSION_KEY: "t", "worship_church_id": "default"})
    lyrics = "\n".join(f"Line {i} of a very long paste that is not one song" for i in range(400))
    assert len(lyrics) > app_module.WORSHIP_PARSE_MAX_CHARS
    response = client.post("/worship/add/parse", data={"csrf_token": "t", "raw_lyrics": lyrics, "rights_confirmed": "1"})
    assert response.status_code == 302
    with client.session_transaction() as sess:
        assert any("longer than one song" in msg for _, msg in sess.get("_flashes", []))
    assert calls == []


def _weekflow_client():
    flask_app = Flask(__name__, template_folder="../templates", static_folder="../static")
    flask_app.secret_key = "t"
    flask_app.register_blueprint(weekflow_view.bp)
    return flask_app.test_client()


def test_weekflow_ai_intake_is_closed_in_production_without_a_beta_list(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@x.com")
    assert not weekflow_view._has_ai_intake_access("someone@x.com")
    assert weekflow_view._has_ai_intake_access("admin@x.com")
    client = _weekflow_client()
    with client.session_transaction() as sess:
        sess["user_email"] = "someone@x.com"
    response = client.post("/labs/weekflow/intake/interpret", json={"text": "Math"})
    assert response.status_code == 403
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "someone@x.com")
    assert weekflow_view._has_ai_intake_access("someone@x.com")
