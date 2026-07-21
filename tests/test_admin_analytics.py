from types import SimpleNamespace

from app import app
from faithsparks.views.admin import analytics


class FakeDocument:
    def __init__(self, data=None):
        self.data = data

    def get(self):
        return SimpleNamespace(exists=self.data is not None, to_dict=lambda: self.data)


class FakeAnalyticsCollection:
    def __init__(self, documents):
        self.documents = documents

    def document(self, name):
        return FakeDocument(self.documents.get(name))


class FakeFirestore:
    def __init__(self, documents):
        self.documents = documents

    def __bool__(self):
        return True

    def collection(self, name):
        assert name in {"analytics", "analytics_daily"}
        return FakeAnalyticsCollection(self.documents if name == "analytics" else {})


def test_admin_analytics_exposes_family_game_night_funnel(monkeypatch):
    fake_db = FakeFirestore(
        {
            "family_game_night_funnel": {
                "events": {
                    "sales_page_view": 20,
                    "play_free_click": 12,
                    "unlock_click": 5,
                    "setup_view": 11,
                    "room_created": 10,
                    "first_player_joined": 8,
                    "game_started": 7,
                    "game_finished": 6,
                }
            },
            "family_game_night_checkout_started": {"total": 4},
            "family_game_night_checkout_canceled": {"total": 1},
            "family_game_night_checkout_fulfilled": {"total": 3},
            "family_game_night_feedback": {
                "total": 2,
                "ratingSum": 9,
                "playAgain": {"yes": 2},
                "favoriteMode": {"draw": 1, "mixed": 1},
            },
        }
    )
    captured = {}
    monkeypatch.setattr(analytics, "db", fake_db)
    monkeypatch.setattr(analytics, "get_collections", lambda show_all: [])
    monkeypatch.setattr(analytics.analytics_svc, "daily_overview", lambda: {"series": []})
    monkeypatch.setattr(analytics.analytics_svc, "recent_visits", lambda: [])
    monkeypatch.setattr(
        analytics,
        "render_template",
        lambda template, **context: captured.update(template=template, **context) or "rendered",
    )

    assert analytics.admin_analytics() == "rendered"
    assert captured["template"] == "admin_analytics.html"
    assert captured["family_game_night"] == {
        "sales_page_view": 20,
        "play_free_click": 12,
        "unlock_click": 5,
        "setup_view": 11,
        "room_created": 10,
        "first_player_joined": 8,
        "game_started": 7,
        "game_finished": 6,
        "checkout_started": 4,
        "checkout_canceled": 1,
        "checkout_fulfilled": 3,
    }
    assert captured["family_game_night_conversions"] == {
        "play_free": 60,
        "room_create": 83,
        "game_start": 70,
        "game_finish": 86,
        "unlock": 25,
        "checkout": 80,
        "purchase": 75,
    }
    assert captured["family_feedback"]["total"] == 2
    assert captured["family_feedback"]["average_enjoyment"] == 4.5


def test_admin_analytics_keeps_zeroes_when_funnel_is_unavailable(monkeypatch):
    monkeypatch.setattr(analytics, "db", FakeFirestore({}))
    monkeypatch.setattr(analytics, "get_collections", lambda show_all: [])
    monkeypatch.setattr(analytics.analytics_svc, "daily_overview", lambda: {"series": []})
    monkeypatch.setattr(analytics.analytics_svc, "recent_visits", lambda: [])
    monkeypatch.setattr(analytics, "render_template", lambda _template, **context: context)

    result = analytics.admin_analytics()

    assert all(value == 0 for value in result["family_game_night"].values())
    assert all(value is None for value in result["family_game_night_conversions"].values())


def test_admin_feedback_comments_are_explicitly_escaped():
    template = open("templates/admin_analytics.html", encoding="utf-8").read()

    assert "feedback.comment|e" in template


def test_admin_analytics_requires_admin_access():
    response = app.test_client().get("/admin/analytics")

    assert response.status_code == 302
    assert "/login/google" in response.headers["Location"]


def test_admin_analytics_includes_precomputed_content_health(monkeypatch):
    expected = {"available": True, "family_game_night": {"counts": {}}, "bible_bee": {"counts": {}}}
    monkeypatch.setattr(analytics, "load_precomputed_health", lambda: expected)
    monkeypatch.setattr(analytics, "db", None)
    monkeypatch.setattr(analytics, "get_collections", lambda show_all: [])
    monkeypatch.setattr(analytics.analytics_svc, "daily_overview", lambda: {"series": []})
    monkeypatch.setattr(analytics.analytics_svc, "recent_visits", lambda: [])
    monkeypatch.setattr(analytics, "render_template", lambda _template, **context: context)

    assert analytics.admin_analytics()["content_health"] == expected


def test_content_health_template_contains_no_passage_or_player_details():
    template = open("templates/admin_analytics.html", encoding="utf-8").read()
    assert "Game content health" in template
    assert "No passage text" in template
    assert "room codes" in template
