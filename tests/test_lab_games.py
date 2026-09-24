from flask import Flask

from faithsparks.views.lab_games import bp, _same_brain_group_invite, _same_brain_group_result, _same_brain_validate_answers, SAME_BRAIN_GROUP_MAX_PLAYERS
from faithsparks.views.public import bp as public_bp


def _client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.secret_key = "lab-games-test"
    app.register_blueprint(bp)
    return app.test_client()


def _sign_in(client, email="player@example.com"):
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = email


def _public_client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.secret_key = "same-brain-public-test"
    app.register_blueprint(public_bp)
    return app.test_client()


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


def test_whits_end_audit_fixes_drink_toppings_resume_and_auto_advance():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/whits-end").get_data(as_text=True)

    # Later shake orders can require toppings. Filling the cup must not
    # prematurely serve/reject the drink before those toppings are added.
    assert "Cup filled! Take it to the customer." in html
    assert "Add the topping, then take it to the customer!" in html
    assert "Ready! Take it to the customer." in html
    assert "TAP BLENDER TO FILL THE CUP" in html
    assert "Every finished order is handed to the correct person." in html
    assert "if(order){" in html

    # In-progress orders and post-serve transitions survive background/reload.
    assert "roundMistakes,waitingForNext,guestPhase,guestSlide" in html
    assert "waitingForNext=!!ss.waitingForNext" in html
    assert "guestPhase=ss.guestPhase||'active'" in html
    assert "ss.timeLeft??ruleForLevel().time" in html
    assert "Date.now()-lastAutoSaveAt>4000" in html
    assert "Date.now()-lastAutoSaveAt>1200" not in html

    # Profile persistence and result scoring are internally consistent.
    assert "p.served=max(0,served||0)" in html
    assert "perfect:roundMistakes===0" in html
    assert "roundMistakes++;needsReset=true" in html
    assert "score=max(0,score-25);roundMistakes++" in html
    assert "level:max(1,completedLevel)" in html
    assert "ordersServed:max(0,served-roundStartServed)" in html
    assert "guestPhase=='levelComplete'" in html

    # Levels auto-advance after a short celebration instead of requiring a
    # results/menu click between every level.
    assert "guestPhase='levelComplete'" in html
    assert "whitsAutoAdvanceTimer=setTimeout" in html
    assert "const advanceWhitsLevel=()=>{" in html
    assert "if(menuOpen){" in html
    assert "beginRound(level)" in html

    # Customer portraits are decoded lazily instead of all at startup on iPad.
    assert "function ensureCustomerPhoto(name)" in html
    assert "im.decoding='async'" in html
    assert "customerPhotos[name]||ensureCustomerPhoto(name)" in html

    # Audit: party timers scale with group size instead of giving four people
    # the same deadline as one person.
    assert "partyDeadline=time+partyTime+max(0,size-1)*18" in html

    # Audit: one autosave performs one progress persistence pass, and paused
    # menu time survives background/reload.
    assert "function saveSession()" in html
    assert "p.session=serializeSession();" in html
    assert "saveActiveProfile();\n p.session=serializeSession();" not in html
    assert "max(0,pausedPartyTime||0)" in html

    # Audit: clearly wrong ingredients/toppings/containers/recipients count
    # against a perfect round, while guidance taps remain forgiving.
    assert "if(!order.need.includes(item.name)){\n  roundMistakes++;" in html
    assert "if(!(order.toppings||[]).includes(t.name)){\n  roundMistakes++;" in html
    assert "if(order.container!=kind){\n  roundMistakes++;" in html
    assert "if(i!=partyIndex){\n     if(finishedOrderReady())roundMistakes++;" in html

    # iPad lower-row container targets are enlarged slightly.
    assert "selectedContainerPos.BOWL,vec2(1.35,1.2)" in html
    assert "selectedContainerPos.CUP,vec2(1.35,1.2)" in html
    assert "selectedContainerPos.CONE,vec2(1.35,1.2)" in html

    # Audit: level transition feedback and mid-blend resume state are real,
    # not dead UI/state paths.
    assert "levelBannerTimer.set(1.6)" in html
    assert "blendTimeLeft:blenderRunning?max(0,-blenderTimer.get()):0" in html
    assert "if(blenderRunning)blenderTimer.set(max(.05,ss.blendTimeLeft||.35))" in html
    assert "message='Ready! Pick up a cup.'" in html

    # Odyssey receives a per-round rating instead of the lifetime star count.
    assert "stars:roundMistakes===0?3:roundMistakes<=2?2:1" in html

    # Audit: a level can never finish halfway through a newly-arrived party.
    assert "const remaining=max(1,r.goal-levelServed)" in html
    assert "return min(rolled,remaining)" in html

    # Audit: machine taps always explain what is missing and wrong-machine
    # taps use the normal error sound.
    assert "message='Pick up a cup first.'" in html
    assert "message='Mixed! Pick up a cup.'" in html
    assert "This order does not use the blender.';messageTimer.set(1.4);playSfx(sndBad)" in html
    assert "This order does not use MIX.';messageTimer.set(1.4);playSfx(sndBad)" in html

    # Audit: setting down a loaded scoop no longer silently throws it away.
    assert "Use the scoop you already have, or tap RESET." in html
    assert "if(!holdingScoop){scoopLoaded=false;scoopFlavor='';}" not in html

    # The shared player summary no longer labels lifetime orders as rating stars.
    assert "orders served" in html
    assert "completions · ★" not in html


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

    # Audit regression coverage: progress starts at 0% of the originally dirty
    # cells, resume preserves score/time, and wrong-cleaner use is explicit.
    assert "let levelInitialDirt = 1" in html
    assert "let levelWrongSprays = 0" in html
    assert "levelInitialDirt = max(1, dirtLeft)" in html
    assert "w.lastCleanerId = cleanerId" in html
    assert "hitWrongMess = true" in html
    assert "levelWrongSprays++" in html
    assert "const dirtyCells = max(1, levelInitialDirt)" in html
    assert "perfect:levelSprays>0 && levelWrongSprays===0" in html
    assert "elapsedMs: max(0, performance.now() - levelStartTime)" in html
    assert "levelStartTime = performance.now() - max(0, resume.elapsedMs || 0)" in html
    assert "dirtLeft / max(1,levelInitialDirt)" in html

    # Layer/render audit: most-recent cleaner wins visual ties and texture
    # suppression is scoped to the actual glass rather than every small tile.
    assert "w.lastCleanerId && (w.layers[w.lastCleanerId] || 0) > .05" in html
    assert "const inGlassBounds" in html
    assert "inGlassBounds &&" in html

    # Wrong-cleaner help works for all unlocked cleaners and uses actual state.
    assert "window._bernardLastNeededCleaner = d.mess.cleaner" in html
    assert "degreaser:'DISINFECTER'" in html
    assert "vinegar:'VINEGAR'" in html
    assert "BERNARD'S SIGNATURE CLEANER" in html
    assert "typeof dirtLeft !== 'undefined'" in html

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


def test_timothy_has_fair_catchup_and_touch_farm_progression():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)

    # Catch-up remains bounded and only activates when the player is behind.
    assert "Gentle \"second wind\" catch-up" in html
    assert "const catchupBonus" in html
    assert "clamp((gapBehind-2.5)*.0019, 0, .028)" in html
    assert "const rivalEase" in html
    assert "tcPlayer.slowTimer.set(.65)" in html
    assert "tcPlayerSpeed * .72" in html
    assert "SECOND WIND — KEEP GALLOPING!" in html

    # The existing barn progression is now a discoverable Timothy Center Farm.
    assert 'id="tc-farm-button"' in html
    assert 'id="tc-farm-controls"' in html
    assert 'id="tc-farm-feed"' in html
    assert 'id="tc-farm-water"' in html
    assert 'id="tc-farm-scoop"' in html
    assert 'id="tc-farm-nurture"' in html
    assert "Timothy Center Farm Unlocked!" in html
    assert "tcAutoEnterFarm = true" in html
    assert "The first completed farm-care visit introduces the foal progression." in html
    assert "TIMOTHY CENTER FARM" in html
    assert "farmButton?.addEventListener('click'" in html
    assert "farmFeed?.addEventListener('click'" in html
    assert "farmWater?.addEventListener('click'" in html
    assert "farmScoop?.addEventListener('click'" in html


def test_timothy_audit_fixes_unlocks_finish_order_and_ipad_controls():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/timothy-center-horse-racing").get_data(as_text=True)

    # All planned milestone horses are reachable inside the 12-level campaign.
    assert "rewardLevel:3" in html
    assert "rewardLevel:5" in html
    assert "rewardLevel:7" in html
    assert "rewardLevel:9" in html
    assert "rewardLevel:12" in html
    assert "rewardLevel:15" not in html
    assert "completedLevel % 5" not in html
    assert "earnedByProgress" in html

    # Finishing first cannot be reversed by rivals moving during the finish delay.
    assert "let tcFirstFinisher = ''" in html
    assert "if (!tcFirstFinisher)" in html
    assert "tcFirstFinisher == 'player'" in html
    assert "firstFinisher:tcFirstFinisher" in html

    # iPad can steer and select horses/opponents, not merely gallop/jump.
    assert 'id="tc-steer-controls"' in html
    assert 'id="tc-steer-up"' in html
    assert 'id="tc-steer-down"' in html
    assert "tcTouchSteer = direction" in html
    assert "const steerY = clamp(move.y + tcTouchSteer" in html
    assert 'id="tc-choice-controls"' in html
    assert "tcMoveCurrentChoice" in html
    assert "tcConfirmCurrentChoice" in html

    # Farm progression survives reload cleanly and cannot be spam-grown in one visit.
    assert "let tcBarnNurtured = false" in html
    assert "tcFoal.grown || tcBarnNurtured" in html
    assert "barnNurtured:tcBarnNurtured" in html
    assert "tcIntroMode = !tcInBarn" in html


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



def test_same_brain_generated_questions_use_audited_topic_prompt_answer_triples():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "QUESTION_EXPANSION_SPECS" in html
    assert html.count('{tag:"') >= 15
    assert "for(var i=0;i<spec.topics.length;i++)" in html
    assert "var topic=spec.topics[i],stem=spec.stems[i],set=spec.sets[i]" in html
    assert 'id:spec.prefix+"_"+String(i+1).padStart(2,"0")' in html
    assert "QUESTIONS.push(" in html


def test_same_brain_ten_question_plus_mode_and_free_receiver_support():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="group-ten"' in html
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
        'serviceBase()+"/tts"',
        'serviceBase()+"/points"',
        'serviceBase()+"/unlock"',
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
    assert "Group Brain" in html
    assert "3–8 people" in html
    assert "10 questions ✨" in html
    assert "Brain Shop" not in html



def test_same_brain_daily_identity_streak_and_creator_reward_loop():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "function dailyNumber()",
        '+" Brain #"+dailyNumber()',
        'id="streak-line"',
        '"daily_complete"',
        '"daily-"+dailyKey()',
        "dailyStreak",
        "dailyBest",
    ):
        assert marker in html


def test_same_brain_beat_my_match_chain_is_link_portable():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="result-next"',
        "async function challengeNext()",
        'h:{s:state.score,a:prior.n,b:state.name}',
        'track("beat_chain_shared")',
        "Can you beat that?",
        "Previous: ",
        "Who knows you better? Challenge them →",
    ):
        assert marker in html


def test_same_brain_plus_custom_challenges_travel_inside_shared_link():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="custom-toggle"',
        'id="custom-builder"',
        'id="custom-fields"',
        'id="custom-start"',
        "function hydrateCustomQuestions(ch)",
        "function customDefsFor(ids)",
        "payload.x=custom",
        "hydrateCustomQuestions(challenge)",
        'track("custom_created")',
    ):
        assert marker in html


def test_same_brain_tracks_return_and_chain_funnel_events():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'track("home_view")',
        'track("return_visit")',
        'track("beat_chain_shared")',
        'track("custom_created")',
        "same_brain_seen",
    ):
        assert marker in html

    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    for event in (
        '"home_view"',
        '"return_visit"',
        '"beat_chain_shared"',
        '"custom_created"',
    ):
        assert event in source



def test_public_same_brain_is_no_login_and_core_first():
    client = _public_client()
    response = client.get("/same-brain")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "window.__SAME_BRAIN_PUBLIC__=true" in html
    assert "Play today’s 5" in html
    assert "Answer today’s 5 weird questions. Send them to one friend." in html
    assert 'function shareBase(){return location.origin+"/same-brain"}' in html
    assert 'if(adv)adv.remove()' in html
    assert 'if(shop)shop.remove()' in html


def test_public_same_brain_challenges_are_private_from_search_but_home_is_indexable():
    client = _public_client()

    home = client.get("/same-brain")
    assert home.status_code == 200
    assert "X-Robots-Tag" not in home.headers

    challenge = client.get("/same-brain?c=abc123")
    assert challenge.status_code == 200
    assert challenge.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive"
    assert challenge.headers["Referrer-Policy"] == "no-referrer"


def test_public_same_brain_rejects_oversized_links():
    client = _public_client()
    response = client.get("/same-brain?c=" + ("a" * 8100))
    assert response.status_code == 414


def test_public_same_brain_analytics_is_session_csrf_bound():
    client = _public_client()
    client.get("/same-brain")
    with client.session_transaction() as flask_session:
        token = flask_session.get("_csrf_token")
    assert token

    missing = client.post(
        "/same-brain/analytics",
        json={"event": "home_view", "pack": "daily"},
    )
    assert missing.status_code == 400

    accepted = client.post(
        "/same-brain/analytics",
        json={"event": "home_view", "pack": "daily"},
        headers={"X-CSRF-Token": token},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["ok"] is True


def test_labs_same_brain_one_to_one_shares_escape_to_public_route():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'function shareBase(){return location.origin+"/same-brain"}' in html
    assert "async function makeShortChallengeUrl(payload)" in html
    assert 'return shareBase()+"?s="+encodeURIComponent(data.code)' in html
    assert 'return shareBase()+"?c="+encode(payload)' in html
    assert "state.challengeUrl=await makeShortChallengeUrl(payload)" in html
    assert "var url=await makeShortChallengeUrl(payload)" in html
    assert "challengeUrl=await makeShortChallengeUrl(c)" in html


def test_public_same_brain_is_resilient_without_removed_account_ui():
    client = _public_client()
    html = client.get("/same-brain").get_data(as_text=True)

    assert "if(bits)bits.textContent" in html
    assert "if(plus)plus.textContent" in html
    assert "if(plusNote)plusNote.innerHTML" in html
    assert "if(!box)return" in html
    assert "if(!card)return" in html
    assert "if(!s||s.length>7000)return null" in html
    assert "That challenge link is invalid or incomplete." in html



def test_same_brain_name_field_is_neutral_and_disables_nickname_autofill():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'placeholder="Your name or nickname"' in html
    assert 'autocomplete="off"' in html
    assert 'placeholder="Andrew"' not in html


def test_same_brain_short_link_contract_and_long_link_fallback():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "async function makeShortChallengeUrl(payload)",
        'apiJson("/same-brain/challenge"',
        'return shareBase()+"?s="+encodeURIComponent(data.code)',
        'return shareBase()+"?c="+encode(payload)',
        'shortCode=(params.get("s")||"").toUpperCase()',
        'apiJson("/same-brain/challenge/"+encodeURIComponent(shortCode)',
    ):
        assert marker in html


def test_public_short_challenge_links_are_noindex():
    client = _public_client()
    response = client.get("/same-brain?s=ABC2345")
    assert response.status_code == 200
    assert response.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive"


def test_public_short_challenge_backend_validates_payload_shape():
    from faithsparks.views.public import _same_brain_public_challenge_payload

    good = {
        "v": 1,
        "n": "Andrew",
        "q": ["a", "b", "c", "d", "e"],
        "a": [0, 1, 2, 3, 0],
        "p": "daily",
    }
    cleaned = _same_brain_public_challenge_payload(good)
    assert cleaned is not None
    assert cleaned["n"] == "Andrew"
    assert cleaned["q"] == ["a", "b", "c", "d", "e"]

    duplicate = {**good, "q": ["a", "a", "c", "d", "e"]}
    assert _same_brain_public_challenge_payload(duplicate) is None

    invalid_answer = {**good, "a": [0, 1, 2, 4, 0]}
    assert _same_brain_public_challenge_payload(invalid_answer) is None



def test_same_brain_switches_to_fresh_five_after_daily_completion():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'start.textContent=done?"Play a fresh 5":"Play today’s 5"',
        'startCreator(dailyCompleted()?"random":"daily")',
        'document.getElementById("new-round").addEventListener("click",function(){state.count=5;startCreator("random")})',
        'id="replay-daily"',
        'Replay "+c.d',
    ):
        assert marker in html


def test_same_brain_fresh_random_avoids_recent_questions():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'same_brain_recent_questions',
        "function recentQuestionIds()",
        "function rememberQuestions(ids)",
        'if(pack==="random")',
        'recent.indexOf(q.id)<0',
        'merged.slice(0,15)',
    ):
        assert marker in html


def test_same_brain_old_daily_replay_does_not_count_as_today_streak():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'state.replayDailyLabel===dailyTitle()' in html
    assert 'c.d===dailyTitle()' in html



def test_same_brain_choices_have_letters_and_narration_reads_all_options():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'var letters=["A","B","C","D"]',
        'class="choice-letter"',
        "function questionSpeech(q)",
        'return q.q+" "+q.a.map',
        "new SpeechSynthesisUtterance(questionSpeech(q))",
        'text:questionSpeech(q)',
    ):
        assert marker in html


def test_same_brain_avatar_shop_has_no_neon_rainbow_and_more_premium_choices():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "Neon Frame" not in html
    assert "🌈" not in html
    for marker in (
        "Wise Owl",
        "Clever Fox",
        "Robot Brain",
        "Alien Brain",
        "Octo Brain",
        "Space Brain",
        'data-buy="avatar_owl"',
        'data-buy="avatar_alien"',
        'data-buy="avatar_octopus"',
        'data-buy="avatar_astronaut"',
    ):
        assert marker in html



def test_same_brain_home_uses_clean_deck_browser_not_huge_native_select():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="deck-select"' not in html
    assert 'id="browse-decks"' in html
    assert 'id="deck-browser"' in html
    assert 'id="deck-search"' in html
    assert 'id="deck-grid"' in html
    assert "function renderDeckBrowser(filter)" in html
    assert "EXTRA_DECKS.filter" in html


def test_same_brain_more_ways_delays_group_configuration_until_selected():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="group-open"',
        'id="group-config" class="inline-panel hidden"',
        'id="group-five"',
        'id="group-ten"',
        'id="group-pack"',
        'id="demo-btn"',
        'id="custom-toggle"',
        "4–8 people, answer whenever you want",
        "Pass the screen to a friend",
    ):
        assert marker in html


def test_same_brain_customize_is_tabbed_and_cosmetics_have_owned_equipped_states():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'data-custom-tab="avatar"',
        'data-custom-tab="voice"',
        'data-custom-tab="style"',
        'id="custom-pane-avatar"',
        'id="custom-pane-voice"',
        'id="custom-pane-style"',
        "Default Brain",
        "Default Frame",
        "Classic Card",
        "Owned · Equip",
        "Equipped ✓",
        "function renderCosmetics()",
        "function applyFrame()",
        "function renderBitsProgress()",
    ):
        assert marker in html


def test_same_brain_daily_completion_hides_daily_pack_and_exposes_small_replay():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="daily-pack-btn"' in html
    assert 'id="home-replay-daily"' in html
    assert 'dailyBtn.classList.toggle("hidden",done)' in html
    assert 'homeReplay.classList.toggle("hidden",!done)' in html
    assert 'startCreator("daily")' in html


def test_same_brain_normal_modes_reset_to_five_questions():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'function startLocalDemo(){state.count=5;startCreator("random")' in html
    assert 'document.querySelectorAll("[data-pack]").forEach(function(btn){btn.addEventListener("click",function(){state.count=5;startCreator(btn.dataset.pack)})})' in html
    assert 'document.getElementById("group-open").addEventListener("click",function(){state.count=5;' in html



def test_same_brain_short_challenge_returns_private_creator_key_contract():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.public", fromlist=["dummy"]
    ))

    for marker in (
        '"creatorKeyHash"',
        '"responses": []',
        '"creatorKey": creator_key',
        "hashlib.sha256",
        "def same_brain_public_challenge_response",
        "def same_brain_public_challenge_results",
    ):
        assert marker in source


def test_same_brain_friend_response_payload_scores_against_creator_answers():
    from faithsparks.views.public import _same_brain_response_payload

    challenge = {
        "v": 1,
        "n": "Andrew",
        "q": ["q1", "q2", "q3", "q4", "q5"],
        "a": [0, 1, 2, 3, 0],
        "p": "daily",
    }
    response = _same_brain_response_payload(
        {
            "responseId": "friend_response_123",
            "name": "Andy",
            "answers": [0, 1, 1, 3, 2],
        },
        challenge,
    )
    assert response is not None
    assert response["name"] == "Andy"
    assert response["score"] == 60
    assert response["answers"] == [0, 1, 1, 3, 2]

    assert _same_brain_response_payload(
        {"responseId": "short", "name": "Andy", "answers": [0, 1, 1, 3, 2]},
        challenge,
    ) is None


def test_same_brain_creator_device_tracks_private_results_and_friend_submits():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="creator-responses"',
        'id="creator-responses-list"',
        'id="refresh-responses"',
        'id="creator-results-home"',
        "function creatorChallenges()",
        "function saveCreatorChallenge(code,key,payload)",
        "same_brain_creator_challenges",
        "async function submitFriendResponse()",
        '"/response"',
        "async function loadCreatorResults(code,key,renderIntoShare)",
        '"/results?key="',
        "function renderCreatorResponseDetail(data,response)",
        "View full comparison →",
    ):
        assert marker in html


def test_same_brain_creator_results_are_not_marked_seen_until_opened():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "if(renderIntoShare)updateCreatorSeen" in html
    assert "scanCreatorResults()" in html
    assert "new challenge result" in html


def test_same_brain_short_loaded_friend_keeps_code_for_response_submission():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "challenge._shortCode=shortCode" in html
    assert 'shortCode:challenge._shortCode||""' in html
    assert "responseIdFor(state.shortCode)" in html



def test_same_brain_friend_result_delivery_retries_until_confirmed():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "same_brain_pending_responses",
        "function pendingResponses()",
        "function savePendingResponse(item)",
        "function removePendingResponse(code,responseId)",
        "async function flushPendingResponses()",
        'window.addEventListener("online",flushPendingResponses)',
        'track("response_submitted")',
    ):
        assert marker in html


def test_same_brain_shared_result_contains_real_comparison_highlights():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "function resultHighlights()",
        "✅ Both: ",
        "⚡ ",
        "function resultShareText()",
        "Think you’d match better?",
        "var highlights=state.groupData?[]:resultHighlights()",
    ):
        assert marker in html


def test_same_brain_creator_results_are_ranked_and_auto_refresh():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "Who knows ",
        "Best match so far",
        'class="response-rank"',
        "ranked=data.responses.slice().sort",
        "setInterval(function(){var shareScreen=",
        "refreshCurrentCreatorResponses()",
    ):
        assert marker in html


def test_same_brain_daily_crowd_comparison_is_anonymous_and_post_result():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="daily-crowd"',
        "async function submitDailyStats",
        "async function renderDailyCrowd",
        "same_brain_daily_response_id:",
        "You matched today’s crowd",
        'track("daily_crowd_viewed")',
        "payload.dk=",
    ):
        assert marker in html


def test_public_same_brain_daily_stats_backend_uses_aggregate_counts_only():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.public", fromlist=["dummy"]
    ))

    for marker in (
        'SAME_BRAIN_DAILY_COLLECTION = "same_brain_daily_stats"',
        "def same_brain_public_daily_submit",
        "def same_brain_public_daily_get",
        '"questions": questions',
        '"players": int(data.get("players") or 0) + 1',
    ):
        assert marker in source

    # Daily aggregate documents should not store player names or answer histories.
    daily_section = source[source.index("def same_brain_public_daily_submit"):source.index("@bp.get('/same-brain')")]
    assert '"name"' not in daily_section


def test_same_brain_short_link_has_personalized_social_preview_metadata_contract():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.public", fromlist=["dummy"]
    ))

    for marker in (
        'property="og:title"',
        'property="og:description"',
        'name="twitter:title"',
        ' challenged you — Same Brain?',
        "Answer 5 quick questions and see how often your brains match.",
    ):
        assert marker in source


def test_same_brain_expired_link_has_friendly_recovery_copy():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "That challenge expired after 30 days." in html
    assert "Play today’s Brain and send a fresh one." in html


def test_same_brain_private_mvp_metrics_endpoint_contract():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))

    for marker in (
        "def same_brain_metrics()",
        '"creatorCompletion"',
        '"creatorShare"',
        '"inviteCompletion"',
        '"chainRate"',
        '"resultShare"',
        'same_brain_public_funnel',
        'same_brain_public_runs',
    ):
        assert marker in source


def test_same_brain_result_cta_stays_personal_and_viral():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "Who knows you better? Challenge them →" in html
    assert 'track("creator_result_opened")' in html



def test_same_brain_mvp_uses_native_share_with_simple_facebook_desktop_fallback():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'id="share-btn"',
        'id="facebook-share"',
        'id="result-share"',
        'id="result-facebook"',
        "function shareFacebook(url)",
        "https://www.facebook.com/sharer/sharer.php?u=",
        "if(navigator.share)",
        'fb1.classList.add("hidden")',
        'fb2.classList.add("hidden")',
    ):
        assert marker in html


def test_same_brain_custom_questions_are_dormant_not_in_mvp_path():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="custom-toggle" class="action-card hidden"' in html
    assert 'aria-hidden="true"' in html
    assert 'tabindex="-1"' in html
    # Keep the implementation available for a later Plus experiment.
    assert "function hydrateCustomQuestions(ch)" in html
    assert 'track("custom_created")' in html



def test_same_brain_metrics_dashboard_is_human_readable_and_actionable():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))

    for marker in (
        "Same Brain MVP Health",
        "Fix this next:",
        "Creator quiz completion",
        "Creator share rate",
        "Friend completion rate",
        "Viral chain rate",
        "Result-card share rate",
        "Not enough data",
        "Data-quality notes",
        "The old 200% completion rate was not real.",
        "View raw dashboard JSON",
    ):
        assert marker in source


def test_same_brain_metrics_uses_matched_run_cohorts_not_legacy_counter_division():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))

    for marker in (
        'db.collection("same_brain_public_runs")',
        "def _cohort_rate",
        'row["events"].get(den_event)',
        'row["events"].get(num_event)',
        '"challenge_created", "challenge_shared"',
        '"challenge_opened", "response_submitted"',
        '"result_completed", "beat_chain_shared"',
    ):
        assert marker in source


def test_same_brain_metrics_keeps_raw_json_debug_option():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    assert 'request.args.get("format") == "json"' in source
    assert '"raw": {' in source
    assert '"publicEvents"' in source
    assert '"labsEvents"' in source


def test_same_brain_analytics_tracks_anonymous_run_id():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "function newRunId()",
        "runId:state.runId||",
        "runId:newRunId()",
    ):
        assert marker in html

    labs_source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    public_source = __import__("inspect").getsource(__import__(
        "faithsparks.views.public", fromlist=["dummy"]
    ))
    assert 'same_brain_lab_runs' in labs_source
    assert 'same_brain_public_runs' in public_source



def test_same_brain_remembers_nickname_across_creator_and_invite_flows():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "function rememberedName()",
        "function rememberName(name)",
        "same_brain_last_name",
        'document.getElementById("player-name").value=rememberedName()',
        "rememberName(name);renderQuestion()",
    ):
        assert marker in html


def test_same_brain_question_flow_has_simple_back_answer_correction():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="question-back"' in html
    assert 'back.classList.toggle("hidden",idx===0)' in html
    assert 'state.answers.pop();renderQuestion()' in html


def test_same_brain_daily_streak_uses_client_daily_key_not_server_utc_day():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    html = _client().get("/labs/games/same-brain").get_data(as_text=True)

    assert 'daily_key = str(payload.get("dateKey")' in source
    assert 'datetime.strptime(daily_key, "%Y-%m-%d")' in source
    assert 'yesterday_key = (play_date - timedelta(days=1)).isoformat()' in source
    assert 'dateKey:dateKey||""' in html


def test_same_brain_daily_crowd_waits_for_ten_players():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "if(data.players<10)" in html
    assert "Crowd results unlock after 10 players." in html
    assert "of 10 players so far." in html


def test_same_brain_creator_challenges_recover_across_signed_in_devices():
    public_source = __import__("inspect").getsource(__import__(
        "faithsparks.views.public", fromlist=["dummy"]
    ))
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        '"ownerId": _same_brain_owner_id()',
        "def same_brain_public_my_challenges",
        "owner_ok = bool",
    ):
        assert marker in public_source
    for marker in (
        'id="creator-inbox"',
        "async function accountCreatorChallenges()",
        "function renderCreatorInbox(rows)",
        "function openCreatorChallenge(row)",
        '"/same-brain/my-challenges"',
    ):
        assert marker in html


def test_same_brain_creator_short_link_failure_never_silently_breaks_async_results():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "for(var attempt=0;attempt<(rememberCreator?3:1);attempt++)" in html
    assert 'if(rememberCreator){var err=new Error("challenge_create_failed")' in html
    assert "We couldn’t create your shareable challenge yet." in html
    assert "We couldn’t create the next challenge yet." in html
    assert 'return shareBase()+"?c="+encode(payload)' in html


def test_same_brain_result_screen_hides_duplicate_share_card_until_sharing():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert 'id="share-card" class="share-card hidden"' in html
    assert 'card.classList.remove("hidden")' in html
    assert 'id="result-next-note"' in html
    assert "Send your answers to someone new." in html


def test_same_brain_public_social_preview_has_branded_png_and_clean_indexing():
    client = _public_client()

    image = client.get("/same-brain/og.png")
    assert image.status_code == 200
    assert image.mimetype == "image/png"
    assert image.data.startswith(b"\x89PNG")

    home = client.get("/same-brain")
    home_html = home.get_data(as_text=True)
    assert '<meta name="robots" content="index,follow">' in home_html
    assert 'property="og:image"' in home_html
    assert "/same-brain/og.png" in home_html
    assert 'name="twitter:card" content="summary_large_image"' in home_html

    challenge = client.get("/same-brain?c=abc")
    challenge_html = challenge.get_data(as_text=True)
    assert '<meta name="robots" content="noindex,nofollow">' in challenge_html
    assert challenge.headers["X-Robots-Tag"] == "noindex, nofollow, noarchive"


def test_same_brain_creator_inbox_handles_multiple_challenges():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "Your challenges",
        "var localRows=creatorChallenges().slice(0,20)",
        "accountRows=await accountCreatorChallenges()",
        "byCode={}",
        'btn.textContent=newCount?("🧠 "+newCount+" new challenge result"',
    ):
        assert marker in html



def test_same_brain_final_answer_has_time_for_back_correction():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "setTimeout(function(){if(state.answers.length>=state.questionIds.length)finishQuestions();else renderQuestion()},420)" in html



def test_same_brain_group_brain_is_three_to_eight_people():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "3–8 people, answer whenever you want" in html
    assert 'g.n<3?"Still forming":"Results live"' in html
    assert SAME_BRAIN_GROUP_MAX_PLAYERS == 8



def test_same_brain_challenge_and_invite_copy_are_short_and_clear():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "Your challenge is ready",
        "Send it to a friend.",
        "They’ll answer your same 5 questions.",
        "How well do you match ",
        " already answered these ",
        "Pick yours, then see exactly where you match.",
        "Answer the same ",
    ):
        assert marker in html


def test_same_brain_saved_challenges_can_be_reshared_and_show_best_match():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "function reshareCreatorChallenge(row)",
        "I already answered ",
        "See how well you match me.",
        ">Reshare</button>",
        "Best: ",
        "bestName",
        "bestScore",
    ):
        assert marker in html


def test_same_brain_question_bank_audit_blocks_known_mismatch_regressions():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "function auditQuestionBank()" in html
    assert "prompt/answer mismatch" in html
    assert "article grammar" in html
    assert "perk mismatch" in html

    # The specific production mismatch that triggered the audit must not return.
    assert 'Which smart home annoyance is worst? | Simple' not in html
    assert '[["🐢","Buffering"],["🤦","Bad recommendations"],["📺","Too many ads"],["🔐","Apps logging out"]]' in html


def test_same_brain_quality_over_quantity_bank_has_75_generated_questions():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "for(var i=0;i<spec.topics.length;i++)" in html
    assert 'topics:["new phone","smart home","laptop","streaming setup","car tech"]' in html
    assert 'topics:["$100 bonus","$500 surprise","tax refund","gift card","unexpected windfall"]' in html
    assert 'topics:["busy day","free day","new group","big decision","surprise problem"]' in html



def test_same_brain_narration_never_overlaps_and_second_tap_stops():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        "var activeNarrationAudio=null",
        "activeNarrationController=null",
        "function stopNarration()",
        'if(narrationPlaying||activeNarrationController){stopNarration();return}',
        "new AbortController()",
        "activeNarrationAudio.pause()",
        'b.textContent=playing?"⏹️":"🔊"',
        'function renderQuestion(){if(typeof stopNarration==="function")stopNarration();',
    ):
        assert marker in html



def test_same_brain_tts_uses_persistent_cache_for_standard_questions():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.views.lab_games", fromlist=["dummy"]
    ))
    for marker in (
        "download_storage_bytes(cache_path)",
        "upload_storage_bytes(audio, cache_path, content_type=\"audio/mpeg\")",
        'response.headers["X-TTS-Cache"] = "HIT"',
        'response.headers["X-TTS-Cache"] = "MISS" if cacheable else "BYPASS"',
        'cache_path = f"same_brain/tts/{voice}/{digest}.mp3"',
        'not question_id.startswith("custom_")',
    ):
        assert marker in source


def test_same_brain_tts_client_marks_standard_questions_cacheable():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "questionId:q.id||\"\"" in html
    assert 'cacheable:!!(q.id&&String(q.id).indexOf("custom_")!==0)' in html


def test_storage_service_supports_private_byte_cache_objects():
    source = __import__("inspect").getsource(__import__(
        "faithsparks.services.storage", fromlist=["dummy"]
    ))
    assert "def download_storage_bytes(" in source
    assert "download_as_bytes()" in source
    assert "def upload_storage_bytes(" in source
    assert "upload_from_string(data, content_type=content_type)" in source



def test_same_brain_visible_sets_keep_true_three_x_question_depth():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    assert "var SET_POOL_MINIMUMS={friends:141,family:138,chaos:81,food:48,travel:51,couples:114,work:93,nostalgia:57,wouldyou:60}" in html
    assert "function auditSetPoolDepth()" in html
    assert "var SET_POOL_AUDIT=auditSetPoolDepth();" in html
    assert "var SET_EXPANSION_SPECS={" in html
    assert "var SET_EXPANSION_ROUND2={" in html


def test_same_brain_set_expansion_uses_semantically_aligned_specs():
    client = _client()
    _sign_in(client)
    html = client.get("/labs/games/same-brain").get_data(as_text=True)

    for marker in (
        'tags:[pack,"expanded"]',
        'q:spec.stem.replace("{{t}}",topic)',
        'a:spec.a.map(function(x){return x.slice()})',
        'id:"setx_"+pack+',
        'id:"sety_"+pack+',
    ):
        assert marker in html

    # Known mismatch regression from the old combinatorial generator.
    assert 'Which smart home annoyance is worst? | Simple' not in html
