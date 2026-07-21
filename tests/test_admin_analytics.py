from types import SimpleNamespace

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
                    "room_created": 10,
                    "first_player_joined": 8,
                    "game_started": 7,
                    "game_finished": 6,
                }
            },
            "family_game_night_checkout_started": {"total": 4},
            "family_game_night_checkout_canceled": {"total": 1},
            "family_game_night_checkout_fulfilled": {"total": 3},
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
        "room_created": 10,
        "first_player_joined": 8,
        "game_started": 7,
        "game_finished": 6,
        "checkout_started": 4,
        "checkout_canceled": 1,
        "checkout_fulfilled": 3,
    }


def test_admin_analytics_keeps_zeroes_when_funnel_is_unavailable(monkeypatch):
    monkeypatch.setattr(analytics, "db", FakeFirestore({}))
    monkeypatch.setattr(analytics, "get_collections", lambda show_all: [])
    monkeypatch.setattr(analytics.analytics_svc, "daily_overview", lambda: {"series": []})
    monkeypatch.setattr(analytics.analytics_svc, "recent_visits", lambda: [])
    monkeypatch.setattr(analytics, "render_template", lambda _template, **context: context)

    result = analytics.admin_analytics()

    assert all(value == 0 for value in result["family_game_night"].values())
