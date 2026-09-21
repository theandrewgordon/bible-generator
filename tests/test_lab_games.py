from flask import Flask

from faithsparks.views.lab_games import bp


def _client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.secret_key = "lab-games-test"
    app.register_blueprint(bp)
    return app.test_client()


def _sign_in(client, email="player@example.com"):
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = email


def test_games_lab_requires_sign_in():
    client = _client()
    for path in ("/labs/games", "/labs/games/bernard-window-washing"):
        response = client.get(path)
        assert response.status_code == 302
        assert "/login/google/start?next=" in response.headers["Location"]


def test_games_lab_lists_playable_projects():
    client = _client()
    _sign_in(client)
    response = client.get("/labs/games")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "Whit's End Ice Cream Shop" in html
    assert "Bernard's Window Washing" in html
    assert "Wooten's Mail Route" in html
    assert "Timothy Center Horse Racing" in html
    assert 'content="noindex,nofollow"' in html


def test_games_lab_allowlist_blocks_unlisted_accounts(monkeypatch):
    monkeypatch.setenv("LAB_GAMES_BETA_EMAILS", "allowed@example.com")
    client = _client()
    _sign_in(client, "other@example.com")
    response = client.get("/labs/games")
    assert response.status_code == 403


def test_playable_routes_are_private_and_noindexed():
    client = _client()
    _sign_in(client)
    for path in (
        "/labs/games/whits-end",
        "/labs/games/bernard-window-washing",
        "/labs/games/wooten-mail-route",
        "/labs/games/timothy-center-horse-racing",
        "/labs/games/mail-sorting",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "private, no-store"
        assert response.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive, nosnippet"



def test_games_lab_includes_shared_odyssey_dashboard():
    client = _client()
    _sign_in(client)
    response = client.get("/labs/games")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert 'id="odyssey-dashboard"' in html
    assert 'id="odyssey-player-select"' in html
    assert "+ New Player" in html
    assert "Odyssey Level" in html
    assert "Total XP" in html
    for game_id in (
        "whits-end",
        "bernard-window-washing",
        "wooten-mail-sorting",
        "timothy-center-horse-racing",
    ):
        assert f'data-game-id="{game_id}"' in html


def test_shared_odyssey_assets_are_private():
    client = _client()
    for path in (
        "/labs/games/assets/odyssey-core.js",
        "/labs/games/assets/odyssey-ui.css",
    ):
        response = client.get(path)
        assert response.status_code == 302
        assert "/login/google/start?next=" in response.headers["Location"]

    _sign_in(client)
    for path in (
        "/labs/games/assets/odyssey-core.js",
        "/labs/games/assets/odyssey-ui.css",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "private, no-store"
        assert response.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive, nosnippet"


def test_playable_games_reference_shared_odyssey_shell():
    client = _client()
    _sign_in(client)

    expected = {
        "/labs/games/whits-end": "whits-end",
        "/labs/games/bernard-window-washing": "bernard-window-washing",
        "/labs/games/wooten-mail-route": "wooten-mail-sorting",
        "/labs/games/timothy-center-horse-racing": "timothy-center-horse-racing",
    }

    for path, game_id in expected.items():
        response = client.get(path)
        html = response.get_data(as_text=True)
        assert response.status_code == 200
        assert "/labs/games/assets/odyssey-core.js" in html
        assert game_id in html



def test_game_shell_contract_markers():
    """Static smoke test for the cross-game Odyssey shell contract."""
    client = _client()
    _sign_in(client)

    paths = (
        "/labs/games/whits-end",
        "/labs/games/bernard-window-washing",
        "/labs/games/wooten-mail-route",
        "/labs/games/timothy-center-horse-racing",
    )

    for path in paths:
        response = client.get(path)
        html = response.get_data(as_text=True)
        normalized = html.casefold()

        assert response.status_code == 200
        assert "/labs/games/assets/odyssey-core.js" in html
        assert "visibilitychange" in html
        assert "pagehide" in html
        assert "change player" in normalized
        assert "restart current round" in normalized
        assert "game library" in normalized

        # Native player-name entry must be a real text input, not only a
        # canvas alphabet keyboard. Games construct it either in HTML or JS.
        assert (
            'type="text"' in normalized
            or "input.type='text'" in normalized
            or "input.type = 'text'" in normalized
        )
        assert "20" in html
        assert "enterkeyhint" in normalized
        assert "inputmode" in normalized


def test_odyssey_core_exposes_shared_platform_contract():
    client = _client()
    _sign_in(client)
    response = client.get("/labs/games/assets/odyssey-core.js")
    js = response.get_data(as_text=True)

    for marker in (
        "getPlayers",
        "ensurePlayer",
        "selectPlayer",
        "startSession",
        "syncProgress",
        "recordResult",
        "getPlayerSummary",
        "getDashboard",
        "getAchievements",
        "protectNativeControl",
        "installNativeInputGuards",
        "returnToLibrary",
    ):
        assert marker in js
