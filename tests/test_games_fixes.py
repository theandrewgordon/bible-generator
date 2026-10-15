"""Group/church games audit 2026-10-14: no children's photos, name filter, Labs access, code guessing."""

import pytest

from app import app
from faithsparks.services.name_filter import is_unsafe_name
from faithsparks.services.rate_limit import reset_memory_limits
from faithsparks.views import lab_games

CSRF = "test-csrf-token"


@pytest.fixture(autouse=True)
def _limits(monkeypatch):
    from faithsparks.services import bible_bee_content

    monkeypatch.setenv("ESV_API_KEY", "test-esv-key")
    monkeypatch.setattr(bible_bee_content, "fetch_verse_text",
                        lambda reference, version: f"Faithful words from {reference} teach our family to trust God.")
    reset_memory_limits()
    yield
    reset_memory_limits()


def _client(email=None):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["_csrf_token"] = CSRF
        if email:
            sess.update({"user_email": email, "user_info": {"email": email}, "user_owned_packs": ["-"],
                         "google_oauth_token": {"access_token": "x", "token_type": "Bearer"}})
    return client


def _room(path):
    host = _client("games-host@example.com")
    created = host.post(path, data={"csrf_token": CSRF}, headers={"X-CSRF-Token": CSRF})
    return host, created.headers["Location"].rsplit("/", 1)[-1]


@pytest.mark.parametrize("game", ["group-games/act-it-out", "family-bible-bee"])
def test_join_pages_offer_no_camera(game):
    _, code = _room(f"/{game}/create")
    page = _client().get(f"/{game}/join/{code}").get_data(as_text=True)
    assert 'capture="user"' not in page and "Add a selfie" not in page


def test_rude_names_are_blocked_and_real_names_are_not():
    for name in ("Ada", "Cassie", "Dickens", "Hannah", "Bass", "Mr. Peanut", "O'Neil", "Assisi"):
        assert not is_unsafe_name(name), name
    for name in ("fuuuck", "sh1t", "Big Butt", "KKK", "poop head", "b1tch"):
        assert is_unsafe_name(name), name
    _, code = _room("/family-bible-bee/create")
    kid = _client()
    response = kid.post(f"/family-bible-bee/join/{code}", data={"csrf_token": CSRF, "player_name": "Big Butt"},
                        headers={"X-CSRF-Token": CSRF})
    assert response.status_code == 400


def test_labs_empty_beta_list_is_admins_only_in_production(monkeypatch):
    monkeypatch.setenv("LAB_GAMES_BETA_EMAILS", "")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@x.com")
    monkeypatch.setenv("APP_ENV", "production")
    assert not lab_games._has_beta_access("stranger@x.com")
    assert lab_games._has_beta_access("admin@x.com")
    monkeypatch.setenv("APP_ENV", "dev")
    assert lab_games._has_beta_access("anyone@x.com")


def test_scanning_for_room_codes_is_throttled_but_real_codes_still_work():
    host, code = _room("/group-games/act-it-out/create")
    scanner = _client()
    statuses = [scanner.get(f"/api/group-games/act-it-out/rooms/ZZ{i:02d}").status_code for i in range(125)]
    assert statuses[0] == 404 and statuses[-1] == 429
    assert scanner.get(f"/api/group-games/act-it-out/rooms/{code}").status_code == 200
