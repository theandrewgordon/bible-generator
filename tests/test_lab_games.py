from flask import Flask

from faithsparks.views.lab_games import bp, _same_brain_group_invite, _same_brain_group_result, _same_brain_validate_answers, SAME_BRAIN_GROUP_MAX_PLAYERS


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


def test_shared_round_results_remain_available_for_terminal_or_retry_flows():
    client = _client()
    _sign_in(client)

    core = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)
    timothy = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)

    assert "function showRoundResults" in core
    # Timothy still uses the shared result surface for losses and the final
    # championship; normal wins auto-advance without opening it.
    assert "O.showRoundResults({" in timothy


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



def test_games_lab_bootstraps_signed_in_account_roster_sync():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games").get_data(as_text=True)

    assert "__ODYSSEY_ACCOUNT_ROSTER__" in html
    assert "__ODYSSEY_SYNC_CONFIG__" in html
    assert "/labs/games/roster" in html


def test_direct_games_receive_account_roster_bootstrap():
    client = _client()
    _sign_in(client)

    for route in (
        "/labs/games/whits-end",
        "/labs/games/bernard-window-washing",
        "/labs/games/wooten-mail-route",
        "/labs/games/timothy-center-horse-racing",
    ):
        html = client.get(route).get_data(as_text=True)
        assert "__ODYSSEY_ACCOUNT_ROSTER__" in html
        assert "__ODYSSEY_SYNC_CONFIG__" in html
        assert "/labs/games/roster" in html


def test_odyssey_core_syncs_roster_without_syncing_game_save_blob():
    client = _client()
    _sign_in(client)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    assert "function mergeAccountRosterBootstrap" in js
    assert "function accountRosterPayload" in js
    assert "function queueAccountRosterSync" in js
    assert "X-CSRF-Token" in js
    assert "players:state.players.slice(0,MAX_PLAYERS)" in js
    assert "activePlayerId:state.activePlayerId" in js
    assert "settings:" in js


def test_odyssey_home_has_avatars_challenges_recent_continue_and_family_progress():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games").get_data(as_text=True)
    js = client.get("/labs/games/assets/odyssey-core.js").get_data(as_text=True)

    assert "odyssey-family-progress" in html
    assert "Challenges" in html
    assert "odyssey-avatar-button" in html
    assert "Continue " in html
    assert "function getChallenges" in js
    assert "function getRecentGame" in js
    assert "function openAvatarPicker" in js
    assert "function showCelebration" in js
    assert "function showRoundResults" in js


def test_bernard_coalesces_pointer_work_for_later_level_responsiveness():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/bernard-window-washing").get_data(as_text=True)

    assert "function scheduleDragWork" in html
    assert "requestAnimationFrame(flushPendingDragWork)" in html
    assert "const count = 1; // one cleaning sample per animation frame" in html
    assert "pendingDragWorldPos" in html
    assert "canvasPixelRatio = Math.min(devicePixelRatio || 1, .75)" in html

    # Cleaner visuals stay detailed through cheap rectangles while expensive
    # grime textures are heavily sampled.
    assert "render localized cleaner residue per cell again" in html
    assert "Water is a restrained blue sheen" in html
    assert "Soap gets staggered foam flecks" in html
    assert "keepRealTexture = (hash & 31) === 0" in html
    assert "Rectangles are cheap according to the profiler" in html
    assert "bernard-render-fast-path" in html
    assert "_bernardRenderFastStats" in html

    # The profiler remains available for diagnosis but is invisible/off unless
    # explicitly requested with ?bernardPerf=1.
    assert "bernard-perf-profiler" in html
    assert "new URLSearchParams(location.search).get('bernardPerf') === '1'" in html
    assert "bernardPerfBadge" in html

    # Cleaner feedback and sound design.
    assert "bernardCleanerHint" in html
    assert "SOAP FOAM — spray grime, then squeegee" in html
    assert "WATER — light wet sheen, then squeegee" in html
    assert "playWindowWashWrongCleanerSound" in html
    assert "That cleaner is not lifting this grime" in html
    assert "Distict cleaner bottles" not in html
    assert "Distinct cleaner bottles: water = crisp mist, soap = softer pump + froth." in html
    assert "Squeegee: continuous low rubber-on-glass hiss." in html
    assert "Finished window: short glassy sparkle." in html

    assert "Results are recorded above; gameplay auto-advances" in html


def test_timothy_has_dedicated_touch_jump_control():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)

    assert 'id="tc-jump-button"' in html
    assert "tcPlayer.tryJump()" in html
    assert "jumpButton?.addEventListener('pointerdown'" in html
    assert "tap the course to gallop, then use the green JUMP button" in html
    assert "TOUCH BUTTON" in html


def test_level_games_auto_advance_without_round_result_menu():
    client = _client()
    _sign_in(client)

    timothy = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)
    assert "tcAutoAdvanceAt = performance.now() + 1200" in timothy
    assert "tcAdvanceOrRestart(true)" in timothy
    assert "launch the next race immediately instead of returning to selectors" in timothy

    wooten = client.get("/labs/games/wooten-mail-route").get_data(as_text=True)
    assert "directly into the next sorting/delivery level instead of opening a menu" in wooten
    assert "Odyssey.showRoundResults({" not in wooten



def test_all_odyssey_games_gate_and_cache_sound_effects():
    client = _client()
    _sign_in(client)

    whits = client.get("/labs/games/whits-end").get_data(as_text=True)
    assert "function playSfx(sound)" in whits
    assert "try{sound.play();}catch(e){}" in whits
    assert "playSfx(sndGood);playSfx(sndServe);" not in whits

    wooten = client.get("/labs/games/wooten-mail-route").get_data(as_text=True)
    assert "const wootenSfxCorrect = new SoundGenerator" in wooten
    assert "function playWootenSfx(sound)" in wooten
    assert "playWootenSfx(wootenSfxDeliver)" in wooten
    assert "playWootenSfx(wootenSfxComplete)" in wooten
    assert "if(soundOn())new SoundGenerator" not in wooten

    bernard = client.get("/labs/games/bernard-window-washing").get_data(as_text=True)
    assert "function playWindowWashSuccessSound()" in bernard
    assert "if (!soundEffectsEnabled)" in bernard
    assert "cleanSound && cleanSound.play()" not in bernard

    timothy = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)
    assert "const tcJumpSound = new SoundGenerator" in timothy
    assert "const tcHitSound = new SoundGenerator" in timothy
    assert "const tcWinSound = new SoundGenerator" in timothy
    assert "const tcLoseSound = new SoundGenerator" in timothy
    assert "tcPlaySound(tcStartSound" in timothy



def test_same_brain_demo_is_listed_and_playable():
    client = _client()
    _sign_in(client)

    library = client.get("/labs/games")
    html = library.get_data(as_text=True)
    assert library.status_code == 200
    assert "Same Brain?" in html
    assert "/labs/games/same-brain" in html
    assert "Standalone Labs experiment" in html

    game = client.get("/labs/games/same-brain")
    body = game.get_data(as_text=True)
    assert game.status_code == 200
    assert game.headers["Cache-Control"] == "private, no-store"
    assert game.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive, nosnippet"
    assert "Play today’s 5" in body
    assert "Pick a different set" in body
    assert "More ways to play" in body
    assert "Customize" in body


def test_same_brain_demo_has_portable_challenge_loop():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "var QUESTIONS=[" in html
    assert html.count('{id:"') >= 20
    assert 'slice(0,5)' in html
    assert '?c=' in html
    assert 'TextEncoder' in html
    assert 'TextDecoder' in html
    assert 'navigator.share' in html
    assert 'navigator.clipboard' in html
    assert 'renderResult()' in html
    assert '% SAME BRAIN' in html
    assert 'brainType(score)' in html



def test_same_brain_has_replay_packs_daily_mode_and_result_image_sharing():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'data-pack="friends"',
        'data-pack="family"',
        'data-pack="chaos"',
        'data-pack="daily"',
        "function seededFive(seed)",
        "function questionSet(pack)",
        "function makeResultImage()",
        "canvas.width=1080",
        "navigator.canShare",
        "new File([blob]",
    ):
        assert marker in html


def test_same_brain_funnel_analytics_requires_csrf_and_accepts_known_events():
    client = _client()
    _sign_in(client)

    client.get("/labs/games/same-brain")
    with client.session_transaction() as flask_session:
        csrf_token = flask_session.get("_csrf_token")
    assert csrf_token

    missing = client.post(
        "/labs/games/same-brain/analytics",
        json={"event": "start", "pack": "daily"},
    )
    assert missing.status_code == 400

    accepted = client.post(
        "/labs/games/same-brain/analytics",
        json={"event": "start", "pack": "daily"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["ok"] is True

    unknown = client.post(
        "/labs/games/same-brain/analytics",
        json={"event": "not-real", "pack": "daily"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert unknown.status_code == 400


def test_same_brain_validates_shared_answer_indexes_and_escapes_results():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "function validChallenge(ch)" in html
    assert "Number.isInteger(ans)" in html
    assert "ans>=0&&ans<q.a.length" in html
    assert "function esc(v)" in html
    assert "esc(c.n)" in html
    assert "esc(state.name)" in html


def test_same_brain_tracks_core_viral_funnel_events():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for event in (
        'track("start")',
        'track("challenge_created")',
        'track("challenge_shared")',
        'track("challenge_opened")',
        'track("result_completed")',
        'track("result_shared")',
    ):
        assert event in html



def test_same_brain_challenge_query_survives_sign_in_redirect():
    client = _client()
    response = client.get("/labs/games/same-brain?c=abc123")
    assert response.status_code == 302
    assert "next=/labs/games/same-brain?c=abc123" in response.headers["Location"]



def test_same_brain_question_selection_is_duplicate_safe_and_pack_library_is_expanded():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert html.count('{id:"') >= 60
    assert "function uniqueQuestions(items)" in html
    assert "Array.from(new Set(PACKS[pack]||[]))" in html
    assert "new Set(ch.q).size===ch.q.length" in html
    for pack in (
        "friends", "family", "chaos", "food", "travel",
        "couples", "work", "nostalgia", "wouldyou", "daily",
    ):
        assert f'data-pack="{pack}"' in html or f'<option value="{pack}">' in html


def test_same_brain_group_payload_requires_five_unique_questions_and_four_choice_answers():
    assert _same_brain_validate_answers(
        ["a", "b", "c", "d", "e"], [0, 1, 2, 3, 0]
    ) == (["a", "b", "c", "d", "e"], [0, 1, 2, 3, 0])

    assert _same_brain_validate_answers(
        ["a", "a", "c", "d", "e"], [0, 1, 2, 3, 0]
    ) is None
    assert _same_brain_validate_answers(
        ["a", "b", "c", "d", "e"], [0, 1, 2, 4, 0]
    ) is None


def test_same_brain_group_invite_hides_answers_but_result_contains_them():
    data = {
        "code": "ABC2345",
        "pack": "friends",
        "questionIds": ["a", "b", "c", "d", "e"],
        "players": [
            {"name": "Host", "answers": [0, 1, 2, 3, 0]},
            {"name": "Friend", "answers": [0, 1, 1, 3, 2]},
        ],
    }
    invite = _same_brain_group_invite(data)
    assert invite["hostName"] == "Host"
    assert invite["playerCount"] == 2
    assert "players" not in invite

    result = _same_brain_group_result(data)
    assert len(result["players"]) == 2
    assert result["players"][0]["answers"] == [0, 1, 2, 3, 0]


def test_same_brain_group_mode_is_async_and_capped_at_eight():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)
    assert SAME_BRAIN_GROUP_MAX_PLAYERS == 8
    assert "You can play now even if everyone else joins later." in html
    assert "Up to 7 more people can answer whenever they want" in html
    assert "function groupMath(data)" in html
    assert "Majority: " in html
    assert "Split vote: " in html
    assert "Lone-wolf picks:" in html
    assert "Most aligned" in html



def test_same_brain_adds_three_hundred_generated_questions():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "QUESTION_EXPANSION_SPECS" in html
    assert html.count('{tag:"') >= 15
    assert "for(var i=0;i<20;i++)" in html
    assert 'id:spec.prefix+"_"+String(i+1).padStart(2,"0")' in html
    assert "QUESTIONS.push(" in html


def test_same_brain_ten_question_plus_mode_and_free_receiver_support():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="ten-mode"' in html
    assert "state.count=10" in html
    assert "challenge.q.length" in html
    assert "(ch.q.length===5||ch.q.length===10)" in html
    assert "state.questionIds.length" in html
    assert "Math.round(matches/c.q.length*100)" in html


def test_same_brain_profile_rewards_selfie_and_premium_narration_ui():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "Brain Bits",
        'data-buy="avatar_fox"',
        'data-buy="theme_arcade"',
        'data-plus-avatar="plus_crown"',
        'data-plus-theme="plus_galaxy"',
        'id="selfie-input"',
        'capture="user"',
        "same_brain_selfie_avatar",
        'id="voice-select"',
        "Premium narrator audio is AI-generated.",
        "/labs/games/same-brain/tts",
        "/labs/games/same-brain/points",
        "/labs/games/same-brain/unlock",
    ):
        assert marker in html


def test_same_brain_group_validation_supports_ten_unique_questions():
    qids = [f"q{i}" for i in range(10)]
    answers = [i % 4 for i in range(10)]
    assert _same_brain_validate_answers(qids, answers) == (qids, answers)

    duplicate = list(qids)
    duplicate[-1] = duplicate[0]
    assert _same_brain_validate_answers(duplicate, answers) is None


def test_same_brain_backend_exposes_plus_rewards_and_tts_contract():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    for marker in (
        "def same_brain_profile()",
        "def same_brain_points()",
        "def same_brain_unlock()",
        "def same_brain_tts()",
        'model="gpt-4o-mini-tts"',
        '"marin"',
        "has_active_plus",
        "SAME_BRAIN_POINT_EVENTS",
        "SAME_BRAIN_COSMETICS",
        "len(question_ids) not in {5, 10}",
        "len(set(qids)) != len(qids)",
    ):
        assert marker in source



def test_same_brain_home_defaults_to_simple_daily_one_to_one_flow():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "Play today’s 5" in html
    assert 'startCreator("daily")' in html
    assert "Answer today’s 5 weird questions. Send them to one friend." in html

    # Advanced surfaces exist, but are intentionally collapsed behind details.
    assert "<summary" in html
    assert "Pick a different set" in html
    assert "More ways to play" in html
    assert "Customize" in html
    assert "Create Group Brain (4–8)" in html
    assert "10 questions ✨" in html
    assert "Brain Shop" not in html
