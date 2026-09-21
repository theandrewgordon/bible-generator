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
        assert "/labs/games/assets/odyssey-ui.css" in html
        assert "openPlayerSelect" in html
        assert "mountGameMenu" in html
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
        "openPlayerSelect",
        "mountGameMenu",
        "bindAutosave",
        "normalizeProgress",
        "checkpoint",
        "createRoundId",
        "createGameShell",
        "awardXp",
    ):
        assert marker in js



def test_shared_odyssey_core_exposes_common_game_shell():
    client = _client()
    _sign_in(client)
    response = client.get("/labs/games/assets/odyssey-core.js")
    js = response.get_data(as_text=True)
    assert response.status_code == 200
    for symbol in (
        "openPlayerSelect",
        "mountGameMenu",
        "bindAutosave",
        "normalizeProgress",
        "checkpoint",
        "createRoundId",
        "createGameShell",
        "confirmDialog",
        "getPlayerSummary",
        "getDashboard",
        "getAchievements",
        "awardXp",
        "installNativeInputGuards",
    ):
        assert symbol in js
    for event_name in (
        "keydown",
        "keyup",
        "beforeinput",
        "input",
        "compositionstart",
        "compositionend",
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "click",
    ):
        assert event_name in js


def test_all_playable_games_use_shared_player_and_menu_shell():
    client = _client()
    _sign_in(client)

    expected = {
        "/labs/games/whits-end": "whits-end",
        "/labs/games/bernard-window-washing": "bernard-window-washing",
        "/labs/games/wooten-mail-route": "wooten-mail-sorting",
        "/labs/games/timothy-center-horse-racing": "timothy-center-horse-racing",
    }

    for route, game_id in expected.items():
        response = client.get(route)
        html = response.get_data(as_text=True)
        assert response.status_code == 200
        assert game_id in html
        assert "openPlayerSelect" in html
        assert "mountGameMenu" in html
        assert "visibilitychange" in html
        assert "pagehide" in html


def test_odyssey_dashboard_includes_xp_and_achievements():
    client = _client()
    _sign_in(client)
    response = client.get("/labs/games")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "Odyssey Level" in html
    assert "Total XP" in html
    assert "XP to Odyssey Level" in html
    assert "Odyssey XP earned here" in html
    assert "Achievements" in html or "odyssey-badges" in html


def test_odyssey_core_dedupes_sessions_and_tracks_per_game_xp():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    assert "tessas_odyssey_session_v1:" in js
    assert "g.xp = (g.xp || 0) + earned" in js
    assert "xpToNextLevel" in js
    assert "xpIntoLevel" in js


def test_completion_result_ids_are_present_for_all_four_games():
    client = _client()
    _sign_in(client)

    for route in (
        "/labs/games/whits-end",
        "/labs/games/bernard-window-washing",
        "/labs/games/wooten-mail-route",
        "/labs/games/timothy-center-horse-racing",
    ):
        html = client.get(route).get_data(as_text=True)
        assert "resultId" in html



def test_games_lab_exposes_shared_odyssey_settings():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games").get_data(as_text=True)
    assert 'id="odyssey-library-sound"' in html
    assert 'id="odyssey-library-music"' in html
    assert "O.setSettings" in html
    assert "O.protectNativeControl(soundToggle)" in html
    assert "O.protectNativeControl(musicToggle)" in html


def test_shared_game_menu_uses_consistent_order():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    labels = (
        "Resume / Continue",
        "Restart Current Round",
        "Change Player",
        "Return to Game Library",
        "Sound Effects: ",
    )
    positions = [js.index(label) for label in labels]
    assert positions == sorted(positions)


def test_shared_player_selector_contract_is_consistent():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    assert "Choose a Player" in js
    assert "Continue" in js
    assert "+ New Player" in js
    assert "Delete" in js
    assert "Delete '+player.name+'?" in js
    assert "MAX_PLAYERS = 8" in js
    assert "MAX_NAME = 20" in js
    assert "toLocaleLowerCase" in js



def test_active_odyssey_player_propagates_into_first_game_launch():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    assert "playerSelectAutoConsumed" in js
    assert "firstSelectOnPage" in js
    assert "autoContinueActive" in js
    assert "selectPlayer(active.id,gameId)" in js
    assert "opts.onContinue" in js
    assert "autoContinued:true" in js


def test_change_player_still_uses_shared_selector_after_auto_continue():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    # Auto-continue is only allowed on the first selector request per game page.
    assert "const firstSelectOnPage=!playerSelectAutoConsumed.has(autoKey)" in js
    assert "playerSelectAutoConsumed.add(autoKey)" in js
    assert "if(firstSelectOnPage && active && opts.autoContinueActive!==false)" in js



def test_timothy_restores_persisted_colors_as_littlejs_colors():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)

    assert "function tcRestoreLittleJsColor" in html
    assert "new Color(+value.r, +value.g, +value.b" in html
    assert "tcRestoreLittleJsColor(saved.bodyColor" in html
    assert "tcRestoreLittleJsColor(saved.maneColor" in html
    assert "tcRestoreLittleJsColor(data.foal.color" in html


def test_bernard_drag_stops_if_completion_clears_active_tool():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/bernard-window-washing").get_data(as_text=True)

    assert "if (!activeTool)\n            break;" in html
    assert "Completing a clean can end the drag" in html
    assert "lastDragWorldPos = null;" in html



def test_odyssey_core_exposes_home_progression_features():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    for marker in (
        "AVATARS",
        "setPlayerAvatar",
        "getPlayerAvatar",
        "openAvatarPicker",
        "getRecentGame",
        "getChallenges",
        "showCelebration",
        "celebrateUnlock",
        "showRoundResults",
        "odyssey-celebration",
    ):
        assert marker in js


def test_games_lab_home_has_recent_challenges_family_and_thumbnails():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games").get_data(as_text=True)

    assert 'id="odyssey-family-progress"' in html
    assert 'id="odyssey-family-progress-body"' in html
    assert "Challenges" in html
    assert "Game Progress" in html
    assert "odyssey-avatar-button" in html
    assert "odyssey-game-thumbnail" in html
    assert "Continue " in html
    for icon in ("🍨", "✨", "✉️", "🐴"):
        assert icon in html


def test_odyssey_core_has_expanded_achievements_and_challenges():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    for badge in (
        "Around Odyssey",
        "Odyssey Champion",
        "Whit's End Regular",
        "Sparkling Clean",
        "Mail Route Pro",
        "Stable Master",
        "Odyssey Hero",
    ):
        assert badge in js

    for challenge in (
        "Play an Odyssey game today",
        "Complete a round today",
        "Complete 5 rounds this week",
        "Play 3 different games this week",
        "Earn 100 Odyssey XP this week",
    ):
        assert challenge in js


def test_all_four_games_integrate_shared_round_results():
    client = _client()
    _sign_in(client)

    for route in (
        "/labs/games/whits-end",
        "/labs/games/bernard-window-washing",
        "/labs/games/wooten-mail-route",
        "/labs/games/timothy-center-horse-racing",
    ):
        html = client.get(route).get_data(as_text=True)
        assert "showRoundResults" in html


def test_game_specific_unlock_celebrations_are_wired():
    client = _client()
    _sign_in(client)

    timothy = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)
    wooten = client.get("/labs/games/wooten-mail-route").get_data(as_text=True)

    assert "New Horse Unlocked!" in timothy
    assert "Stable Unlock!" in timothy
    assert "Delivery Routes Unlocked!" in wooten


def test_shared_odyssey_ui_includes_mobile_and_reward_polish():
    client = _client()
    _sign_in(client)
    css = client.get("/labs/games/assets/odyssey-ui.css").get_data(as_text=True)

    for marker in (
        ".odyssey-celebration",
        ".odyssey-avatar-grid",
        ".odyssey-challenge-grid",
        ".odyssey-family-grid",
        ".odyssey-game-thumbnail",
        "@media(pointer:coarse)",
        "safe-area-inset-top",
    ):
        assert marker in css
