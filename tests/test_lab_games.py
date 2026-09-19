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
