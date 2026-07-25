import re
from types import SimpleNamespace

import pytest

from app import app
from faithsparks.services import bible_bee_content
from faithsparks.services.rate_limit import reset_memory_limits


CSRF = "test-csrf-token"
JPEG_STUB = "data:image/jpeg;base64,/9j/AA=="


@pytest.fixture(autouse=True)
def _authoritative_scripture_stub(monkeypatch):
    monkeypatch.setenv("ESV_API_KEY", "test-esv-key")
    monkeypatch.setenv("API_BIBLE_KEY", "test-api-bible-key")
    monkeypatch.setenv("API_BIBLE_IDS", "nlt:test-nlt-id")

    def fake_text(reference, version):
        return (
            f"Faithful words from {reference} in {version.upper()} teach our family "
            "to trust God, walk in love, and remember truth."
        )

    monkeypatch.setattr(bible_bee_content, "fetch_verse_text", fake_text)
    reset_memory_limits()


def _prime(client, email=None):
    with client.session_transaction() as sess:
        sess["_csrf_token"] = CSRF
        if email:
            sess["user_email"] = email
            sess["user_info"] = {"email": email}
            sess["user_owned_packs"] = ["test-pack"]
            sess["google_oauth_token"] = {"access_token": "test-token", "token_type": "Bearer"}


def _post(client, path, json=None, data=None):
    return client.post(path, json=json, data=data, headers={"X-CSRF-Token": CSRF})


def test_bible_bee_management_actions_use_the_live_refresh_function():
    script = open("static/bible_bee.js", encoding="utf-8").read()

    assert "refreshState" not in script
    assert "await refresh();" in script
    assert "state.viewer.is_owner && state.team_mode" in script
    assert 'state.viewer.is_owner ? `<button id="close-room"' in script


def test_bible_bee_quick_presets_cooperative_goal_and_learning_context():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "cooperative-bee@example.com")
    _prime(player)
    page = host.get("/family-bible-bee")
    assert b'data-bee-preset="little"' in page.data
    assert b'name="scoring_style" value="cooperative"' in page.data

    created = _post(host, "/family-bible-bee/create", data={
        "csrf_token": CSRF, "control_mode": "hosted", "version": "esv",
        "round_count": "5", "difficulty": "little_sparks", "deck_id": "family-favorites",
        "game_style": "younger_kids", "choice_count": "2", "scoring_style": "cooperative",
    })
    code = re.search(r"/host/([A-Z0-9]{4})$", created.headers["Location"]).group(1)
    room = bible_bee._get_room(code)
    assert room["scoring_style"] == "cooperative"
    assert room["family_goal"] == 375
    assert all(question["context_note"].startswith("This passage is from ") for question in room["questions"])

    assert _post(player, f"/family-bible-bee/join/{code}", data={"csrf_token": CSRF, "player_name": "Ada"}).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    hidden = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert hidden["question"]["context_note"] is None
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/reveal", json={}).status_code == 200
    revealed = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert revealed["question"]["context_note"].startswith("This passage is from ")
    assert revealed["scoring_style"] == "cooperative"
    assert revealed["family_goal"] == 375


def test_family_bible_bee_room_flow():
    app.config.update(TESTING=True)
    host = app.test_client()
    player = app.test_client()
    _prime(host, "parent@example.com")
    _prime(player)

    created = _post(host, "/family-bible-bee/create")
    assert created.status_code == 302
    match = re.search(r"/host/([A-Z0-9]{4})$", created.headers["Location"])
    assert match
    code = match.group(1)

    joined = _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    )
    assert joined.status_code == 302
    assert player.get(f"/family-bible-bee/display/{code}").status_code == 200
    qr = player.get(f"/family-bible-bee/room/{code}/qr")
    assert qr.status_code == 200
    assert qr.mimetype == "image/png"
    assert qr.data.startswith(b"\x89PNG")
    assert _post(player, f"/api/family-bible-bee/rooms/{code}/heartbeat", json={}).status_code == 200

    started = _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={})
    assert started.status_code == 200

    player_state = player.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert player_state["phase"] == "question"
    assert player_state["question"]["correct"] is None
    assert player_state["question"]["reference"] is None
    assert player_state["players"][0]["connected"] is True

    # Use the server-side answer only inside the test to exercise scoring.
    from faithsparks.views import bible_bee

    first_question = bible_bee._get_room(code)["questions"][0]
    correct = first_question["correct"]
    answered = _post(
        player,
        f"/api/family-bible-bee/rooms/{code}/answer",
        json={"choice": correct},
    )
    assert answered.status_code == 200

    revealed_state = player.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert revealed_state["phase"] == "reveal"
    assert revealed_state["reveal_deadline"]
    assert revealed_state["viewer"]["correct"] is True
    assert revealed_state["players"][0]["score"] == 150
    assert revealed_state["family_score"] == 150
    assert revealed_state["viewer"]["round_points"] == 150
    assert revealed_state["question"]["reference"]

    advanced = _post(host, f"/api/family-bible-bee/rooms/{code}/next", json={})
    assert advanced.status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["question_index"] == 1

    # Finish the remaining rounds incorrectly to verify the parent review summary.
    for question_index in range(1, 5):
        question = bible_bee._get_room(code)["questions"][question_index]
        wrong = (question["correct"] + 1) % len(question["choices"])
        assert _post(
            player,
            f"/api/family-bible-bee/rooms/{code}/answer",
            json={"choice": wrong},
        ).status_code == 200
        assert _post(host, f"/api/family-bible-bee/rooms/{code}/next", json={}).status_code == 200

    bonus_room = bible_bee._get_room(code)
    assert bonus_room["phase"] == "question"
    assert bonus_room["questions"][-1]["bonus"] is True
    bonus_question = bonus_room["questions"][-1]
    bonus_wrong = (bonus_question["correct"] + 1) % len(bonus_question["choices"])
    assert _post(
        player,
        f"/api/family-bible-bee/rooms/{code}/answer",
        json={"choice": bonus_wrong},
    ).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/next", json={}).status_code == 200

    finished = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert finished["review"]
    assert finished["review_summary"]["review_tomorrow"]


def test_family_bible_bee_rejects_unsafe_or_late_join():
    app.config.update(TESTING=True)
    host = app.test_client()
    player = app.test_client()
    late_player = app.test_client()
    _prime(host, "parent@example.com")
    _prime(player)
    _prime(late_player)

    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]

    unsafe = _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "<script>", "csrf_token": CSRF},
    )
    assert unsafe.status_code == 400

    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Micah", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200

    late = _post(
        late_player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Mom", "csrf_token": CSRF},
    )
    assert late.status_code == 409


def test_host_can_recover_room_and_choose_deck():
    app.config.update(TESTING=True)
    original_host = app.test_client()
    recovered_host = app.test_client()
    _prime(original_host, "family@example.com")
    _prime(recovered_host, "family@example.com")

    created = _post(
        original_host,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "deck_id": "courage-trust",
            "round_count": "3",
        },
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]

    recovered = recovered_host.get(f"/family-bible-bee/host/{code}")
    assert recovered.status_code == 200
    state = recovered_host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["deck_name"] == "Courage & Trust"
    assert state["question_total"] == 3

    home = recovered_host.get("/family-bible-bee")
    assert home.status_code == 200
    assert f"Room {code}".encode() in home.data


def test_only_signed_in_parent_can_create_or_manage_room():
    app.config.update(TESTING=True)
    guest = app.test_client()
    _prime(guest)
    response = _post(guest, "/family-bible-bee/create")
    assert response.status_code == 302
    assert "/login/google" in response.headers["Location"]


def test_home_keeps_simple_version_picker_with_esv_default():
    app.config.update(TESTING=True)
    client = app.test_client()
    _prime(client, "version-picker@example.com")

    home = client.get("/family-bible-bee")

    assert home.status_code == 200
    assert b"Bible version" in home.data
    assert b"Game length" in home.data
    assert b"Difficulty" in home.data
    assert b'value=\"20\"' in home.data
    assert b'value=\"upramp\"' in home.data
    assert b'value=\"hard\"' in home.data
    assert b'value="esv" data-code="ESV" checked' in home.data
    assert b'name="deck_id" value="family-favorites" checked' in home.data
    assert b"Team mode" in home.data
    assert b"up to 40 players" in home.data
    assert b"Random Questions" in home.data
    assert b"Easter Hope" in home.data
    assert b"How to play" in home.data
    assert b"answer on phones" in home.data
    assert b"Create custom room" not in home.data
    assert b'<span class="deck-version">ESV</span>' in home.data


def test_room_defaults_to_esv_when_no_version_is_submitted():
    client = app.test_client()
    _prime(client, "default-esv@example.com")

    created = _post(
        client,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "deck_id": "family-favorites"},
    )

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    state = client.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["translation"] == "ESV"


def test_bible_bee_can_create_twenty_round_game():
    client = app.test_client()
    _prime(client, "twenty-rounds@example.com")

    created = _post(
        client,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "deck_id": "family-favorites", "round_count": "20"},
    )

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    state = client.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["question_total"] == 20


def test_random_questions_deck_builds_unique_mixed_rounds():
    from faithsparks.views import bible_bee

    client = app.test_client()
    _prime(client, "random-questions@example.com")

    created = _post(
        client,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "deck_id": "random-questions", "round_count": "20"},
    )

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    references = [question["reference"] for question in room["questions"]]
    assert room["deck_name"] == "Random Questions"
    assert len(references) == 20
    assert len(set(references)) == 20
    assert len({question["label"] for question in room["questions"]}) >= 3


def test_rooms_are_listed_only_for_their_host_and_can_be_deleted_from_home():
    owner = app.test_client()
    other_parent = app.test_client()
    _prime(owner, "private-owner@example.com")
    _prime(other_parent, "another-parent@example.com")

    created = _post(owner, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]

    owner_home = owner.get("/family-bible-bee")
    other_home = other_parent.get("/family-bible-bee")
    assert f"Room {code}".encode() in owner_home.data
    assert f"Room {code}".encode() not in other_home.data
    assert b"Only you can see these rooms" in owner_home.data

    deleted = _post(owner, f"/family-bible-bee/rooms/{code}/delete")
    assert deleted.status_code == 302
    assert deleted.headers["Location"].endswith("/family-bible-bee")
    assert owner.get(f"/api/family-bible-bee/rooms/{code}").status_code == 404


def test_stale_session_room_code_does_not_grant_host_access():
    owner = app.test_client()
    attacker = app.test_client()
    _prime(owner, "actual-owner@example.com")
    _prime(attacker, "different-parent@example.com")
    created = _post(owner, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]

    with attacker.session_transaction() as sess:
        sess["bible_bee_host_rooms"] = [code]

    assert attacker.get(f"/family-bible-bee/host/{code}").status_code == 403
    assert _post(attacker, f"/family-bible-bee/rooms/{code}/delete").status_code == 403
    assert owner.get(f"/api/family-bible-bee/rooms/{code}").status_code == 200


def test_bible_bee_room_delete_allows_admin(monkeypatch):
    owner = app.test_client()
    admin = app.test_client()
    _prime(owner, "bee-owner@example.com")
    _prime(admin, "admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")

    created = _post(owner, "/family-bible-bee/create")
    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]

    deleted = _post(admin, f"/family-bible-bee/rooms/{code}/delete")

    assert deleted.status_code == 302
    assert owner.get(f"/api/family-bible-bee/rooms/{code}").status_code == 404


def test_host_can_remove_player_and_close_room():
    app.config.update(TESTING=True)
    host = app.test_client()
    player = app.test_client()
    _prime(host, "manager@example.com")
    _prime(player)

    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Micah", "csrf_token": CSRF},
    ).status_code == 302
    player_id = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["players"][0]["id"]

    removed = _post(
        host,
        f"/api/family-bible-bee/rooms/{code}/players/{player_id}/remove",
        json={},
    )
    assert removed.status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["players"] == []

    closed = _post(host, f"/api/family-bible-bee/rooms/{code}/close", json={})
    assert closed.status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").status_code == 404


def test_team_mode_assigns_players_and_scores_by_team():
    from faithsparks.views import bible_bee

    host = app.test_client()
    gold_player = app.test_client()
    blue_player = app.test_client()
    _prime(host, "teams@example.com")
    _prime(gold_player)
    _prime(blue_player)

    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    for client, name in ((gold_player, "Ada"), (blue_player, "Ben")):
        assert _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": name, "csrf_token": CSRF},
        ).status_code == 302

    lobby = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert lobby["team_mode"] is True
    assert [(team["id"], team["players"], team["score"]) for team in lobby["teams"]] == [
        ("gold", 1, 0),
        ("blue", 1, 0),
    ]
    assert {player["name"]: player["team_id"] for player in lobby["players"]} == {
        "Ada": "gold",
        "Ben": "blue",
    }

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    first_question = bible_bee._get_room(code)["questions"][0]
    correct = first_question["correct"]
    assert _post(
        gold_player,
        f"/api/family-bible-bee/rooms/{code}/answer",
        json={"choice": correct},
    ).status_code == 200
    assert _post(
        blue_player,
        f"/api/family-bible-bee/rooms/{code}/answer",
        json={"choice": (correct + 1) % len(first_question["choices"])},
    ).status_code == 200

    reveal = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert {team["id"]: team["score"] for team in reveal["teams"]} == {
        "gold": 150,
        "blue": 0,
    }


def test_host_can_adjust_lobby_teams_before_start():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    third = app.test_client()
    _prime(host, "team-adjust@example.com")
    for client in (first, second, third):
        _prime(client)

    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    for client, name in ((first, "Ada"), (second, "Ben"), (third, "Cal")):
        assert _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": name, "csrf_token": CSRF},
        ).status_code == 302

    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    ada_id = next(player["id"] for player in state["players"] if player["name"] == "Ada")
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/players/{ada_id}/team", json={}).status_code == 200
    switched = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert next(player for player in switched["players"] if player["name"] == "Ada")["team_id"] == "blue"

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/teams/rebalance", json={}).status_code == 200
    rebalanced = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert [team["players"] for team in rebalanced["teams"]] == [2, 1]

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/teams/rebalance", json={}).status_code == 409


def test_team_mode_allows_large_event_rooms_to_forty_players(monkeypatch):
    from faithsparks.views import bible_bee

    monkeypatch.setattr(bible_bee, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=True))
    host = app.test_client()
    _prime(host, "large-team@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]

    players = [app.test_client() for _ in range(41)]
    for index, client in enumerate(players):
        _prime(client)
        response = _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": f"P{index:02d}", "csrf_token": CSRF},
        )
        if index < 40:
            assert response.status_code == 302
        else:
            assert response.status_code == 409
            assert b"This team room is full at 40 players." in response.data

    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert len(state["players"]) == 40
    assert [team["players"] for team in state["teams"]] == [20, 20]


def test_twenty_player_room_reveals_when_one_phone_goes_stale(monkeypatch):
    from faithsparks.views import bible_bee

    monkeypatch.setattr(bible_bee, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=True))
    host = app.test_client()
    _prime(host, "twenty-player-host@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on", "round_count": "5"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    players = [app.test_client() for _ in range(20)]
    for index, client in enumerate(players):
        _prime(client)
        assert _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": f"P{index:02d}", "csrf_token": CSRF},
        ).status_code == 302

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    stale_id = next(player["id"] for player in state["players"] if player["name"] == "P19")

    def mark_stale(current):
        current["players"][stale_id]["last_seen"] = bible_bee.time.time() - 120

    bible_bee._mutate_room(code, mark_stale)
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    for client in players[:-1]:
        response = _post(client, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct})
        assert response.status_code == 200

    reveal = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert reveal["active_player_count"] == 19
    result = bible_bee._get_room(code)["round_results"][-1]
    assert result["correct"] == 19
    assert result["missed"] == 0
    assert next(player for player in reveal["players"] if player["id"] == stale_id)["connected"] is False


def test_bible_bee_team_room_uses_preset_avatars_instead_of_uploaded_selfies():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "bee-team-avatar-host@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    join_page = player.get(f"/family-bible-bee/join/{code}")
    assert b"Team rooms use preset pictures" in join_page.data
    assert b"Add a selfie" not in join_page.data

    response = _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "avatar_data": JPEG_STUB, "csrf_token": CSRF},
    )

    assert response.status_code == 400
    assert b"Team rooms use preset avatars" in response.data
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "avatar_preset": "esther", "csrf_token": CSRF},
    ).status_code == 302
    updated = _post(
        player,
        f"/api/family-bible-bee/rooms/{code}/profile",
        json={"player_name": "Ada", "avatar_data": JPEG_STUB},
    )
    assert updated.status_code == 409
    assert "Team rooms use preset avatars" in updated.get_json()["error"]


def test_individual_room_still_rejects_ninth_player():
    host = app.test_client()
    _prime(host, "individual-cap@example.com")
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF})
    code = created.headers["Location"].rsplit("/", 1)[-1]

    players = [app.test_client() for _ in range(9)]
    for index, client in enumerate(players):
        _prime(client)
        response = _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": f"P{index}", "csrf_token": CSRF},
        )
        if index < 8:
            assert response.status_code == 302
        else:
            assert response.status_code == 409
            assert b"This room already has 8 players." in response.data


def test_finished_team_room_exposes_winning_team_scores():
    from faithsparks.views import bible_bee

    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "team-winner@example.com")
    _prime(first)
    _prime(second)

    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "team_mode": "on"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": name, "csrf_token": CSRF},
        ).status_code == 302

    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    ben_id = next(player["id"] for player in state["players"] if player["name"] == "Ben")
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/players/{ben_id}/team", json={}).status_code == 200

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(first, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert _post(second, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/end", json={}).status_code == 200

    finished = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert {team["id"]: team["score"] for team in finished["teams"]} == {
        "gold": 290,
        "blue": 0,
    }


@pytest.mark.parametrize(
    "deck_id",
    [
        "family-favorites",
        "courage-trust",
        "gospel-foundations",
        "wisdom-obedience",
        "fruit-spirit",
        "psalms-comfort",
        "words-of-jesus",
        "prayer-praise",
        "god-is-near",
        "identity-in-christ",
        "serving-others",
        "forgiveness-grace",
        "thankful-hearts",
        "mission-witness",
    ],
)
def test_each_builtin_deck_creates_a_three_round_game(deck_id):
    client = app.test_client()
    _prime(client, f"{deck_id}@example.com")
    created = _post(
        client,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "deck_id": deck_id,
            "version": "kjv",
            "game_style": "classic_mix",
            "difficulty": "family",
            "round_count": "3",
        },
    )
    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    state = client.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["question_total"] == 3
    assert state["translation"] == "KJV"


@pytest.mark.parametrize("version, expected", [("kjv", "KJV"), ("esv", "ESV"), ("nlt", "NLT")])
def test_version_picker_builds_questions_from_selected_translation(version, expected):
    client = app.test_client()
    _prime(client, f"{version}@example.com")
    created = _post(
        client,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "deck_id": "family-favorites",
            "version": version,
            "game_style": "reference_race",
            "difficulty": "family",
            "round_count": "3",
        },
    )
    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    state = client.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["translation"] == expected
    assert state["game_style"] == "Reference Race"


@pytest.mark.parametrize(
    "style, expected_modes",
    [
        ("classic_mix", {"finish", "reference", "fill_blank"}),
        ("memory_practice", {"finish", "fill_blank"}),
        ("reference_race", {"reference"}),
        ("oral_recitation", {"oral"}),
    ],
)
def test_game_styles_generate_expected_ten_round_mix(style, expected_modes):
    from faithsparks.views import bible_bee

    client = app.test_client()
    _prime(client, f"{style}@example.com")
    created = _post(
        client,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "deck_id": "family-favorites",
            "version": "kjv",
            "game_style": style,
            "difficulty": "family",
            "round_count": "10",
        },
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    assert len(room["questions"]) == 10
    assert {question["mode"] for question in room["questions"]} == expected_modes
    assert all(question["label"] != "First Letter Challenge" for question in room["questions"])


def test_correct_players_receive_ranked_speed_bonuses():
    from faithsparks.views import bible_bee

    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "speed@example.com")
    _prime(first)
    _prime(second)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    for client, name in ((first, "First"), (second, "Second")):
        assert _post(
            client,
            f"/family-bible-bee/join/{code}",
            data={"player_name": name, "csrf_token": CSRF},
        ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(first, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["phase"] == "question"
    assert _post(second, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["phase"] == "reveal"

    def rank_answers(room):
        player_ids = {
            player["name"]: player_id
            for player_id, player in room["players"].items()
        }
        room["answers"][player_ids["First"]]["answered_at"] = 100.0
        room["answers"][player_ids["Second"]]["answered_at"] = 101.0

    bible_bee._mutate_room(code, rank_answers)
    # Recompute the reveal with deterministic timestamps for the ranking check.
    def reset_reveal(room):
        room["phase"] = "question"
        room["round_results"] = []
        for player in room["players"].values():
            player["score"] = 0

    bible_bee._mutate_room(code, reset_reveal)
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/reveal", json={}).status_code == 200
    scores = {
        player["name"]: player["score"]
        for player in host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["players"]
    }
    assert scores == {"First": 150, "Second": 140}


def test_reveal_auto_advances_after_deadline_and_finished_room_expires():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "automatic@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200

    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(player, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200

    def deadline_passed(room):
        room["reveal_deadline"] = 1

    bible_bee._mutate_room(code, deadline_passed)
    advanced = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert advanced["phase"] == "question"
    assert advanced["question_index"] == 1

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/end", json={}).status_code == 200
    finished = bible_bee._get_room(code)
    assert finished["expires_at"] > finished["finished_at"]

    def expire(room):
        room["expires_at"] = 1

    bible_bee._mutate_room(code, expire)
    assert host.get(f"/api/family-bible-bee/rooms/{code}").status_code == 404


def test_pausing_a_reveal_freezes_auto_advance_countdown():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "pause-reveal@example.com")
    _prime(player)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(player, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200
    paused = bible_bee._get_room(code)
    assert paused["phase"] == "paused"
    assert paused["resume_phase"] == "reveal"
    assert "reveal_deadline" not in paused
    assert paused["paused_reveal_seconds"] > 0

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200
    resumed = bible_bee._get_room(code)
    assert resumed["phase"] == "reveal"
    assert resumed["reveal_deadline"] > resumed["updated_at"]


def test_fill_blank_prefers_meaningful_words_and_related_choices():
    keywords = bible_bee_content._keywords(
        "For God so loved the world, that he gave his only begotten Son, "
        "that whosoever believeth in him should not perish, but have everlasting life."
    )
    assert keywords[0].lower() in {"god", "love", "world", "son", "life"}
    distractors = bible_bee_content._blank_distractors("faith", [])
    assert {"hope", "love", "grace"}.issubset({word.lower() for word in distractors})


def test_countdown_setting_avatar_and_away_player_flow():
    from faithsparks.views import bible_bee

    host = app.test_client()
    active = app.test_client()
    away = app.test_client()
    _prime(host, "family-flow@example.com")
    _prime(active)
    _prime(away)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "reveal_seconds": "5"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    avatar = "data:image/jpeg;base64,/9j/AA=="
    assert _post(
        active,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Active", "avatar_data": avatar, "csrf_token": CSRF},
    ).status_code == 302
    assert _post(
        away,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Away", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["reveal_seconds"] == 5
    avatar_url = next(player for player in state["players"] if player["name"] == "Active")["avatar"]
    assert avatar_url.startswith(f"/family-bible-bee/room/{code}/avatar/")
    avatar_response = host.get(avatar_url)
    assert avatar_response.status_code == 200
    assert avatar_response.mimetype == "image/jpeg"
    assert avatar_response.data.startswith(b"\xff\xd8\xff")

    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(active, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["phase"] == "question"
    away_id = next(
        player["id"]
        for player in state["players"]
        if player["name"] == "Away"
    )
    assert _post(
        host,
        f"/api/family-bible-bee/rooms/{code}/players/{away_id}/away",
        json={},
    ).status_code == 200
    revealed = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert revealed["phase"] == "reveal"
    assert next(player for player in revealed["players"] if player["name"] == "Away")["away"] is True
    result = bible_bee._get_room(code)["round_results"][-1]
    assert result["missed"] == 0
    assert 0 < revealed["reveal_deadline"] - bible_bee.time.time() <= 5
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/next", json={}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/skip", json={}).status_code == 200
    assert bible_bee._get_room(code)["round_results"][-1]["missed"] == 1


def test_invalid_avatar_is_rejected():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "avatar@example.com")
    _prime(player)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    response = _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={
            "player_name": "Ada",
            "avatar_data": "data:image/svg+xml,<svg onload=alert(1)>",
            "csrf_token": CSRF,
        },
    )
    assert response.status_code == 400


def test_duplicate_names_are_rejected_case_insensitively():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "names@example.com")
    _prime(first)
    _prime(second)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        first,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    duplicate = _post(
        second,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "ada", "csrf_token": CSRF},
    )
    assert duplicate.status_code == 409
    assert b"already in this room" in duplicate.data


def test_bible_bee_uses_copyworksheet_translation_fallback(monkeypatch):
    import verse_helpers

    monkeypatch.setattr(bible_bee_content, "fetch_verse_text", lambda _reference, _version: None)
    monkeypatch.setattr(
        verse_helpers,
        "request_verse_data",
        lambda reference, version: (
            '{"fullVerse":"Shared copyworksheet text for '
            + reference
            + ' in '
            + version.upper()
            + '."}'
        ),
    )
    assert bible_bee_content._copyworksheet_verse_text("John 3:16", "nlt") == (
        "Shared copyworksheet text for John 3:16 in NLT."
    )


def test_short_verses_and_younger_kids_generate_complete_questions():
    prompt, answer = bible_bee_content._split_finish("Jesus wept.")
    assert prompt
    assert answer

    passages = []
    for index, word_count in enumerate((4, 6, 8, 10, 30, 40)):
        text = " ".join(["faith"] * word_count)
        passages.append(
            {
                "id": f"passage-{index}",
                "reference": f"Test {index + 1}:1",
                "text": text,
                "keywords": ["faith"],
                "blanks": ["faith"],
            }
        )
    questions = bible_bee_content.build_questions(
        passages,
        "younger_kids",
        3,
        seed="younger",
    )
    assert len(questions) == 3
    assert all(question["passage_id"] in {"passage-0", "passage-1", "passage-2", "passage-3"} for question in questions)


def test_bonus_review_aggregates_misses_by_passage():
    from faithsparks.views import bible_bee

    room = {
        "questions": [
            {"id": "one", "passage_id": "p1", "label": "Finish", "choices": ["a"], "correct": 0},
            {"id": "two", "passage_id": "p2", "label": "Finish", "choices": ["b"], "correct": 0},
        ],
        "round_results": [
            {"passage_id": "p1", "missed": 1},
            {"passage_id": "p2", "missed": 1},
            {"passage_id": "p1", "missed": 1},
        ],
    }
    assert bible_bee._append_bonus_review_question(room) is True
    assert room["questions"][-1]["passage_id"] == "p1"
    assert room["questions"][-1]["bonus"] is True


def test_oral_recitation_is_host_judged_with_partial_credit():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "oral@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "game_style": "oral_recitation", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    state = player.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["question"]["mode"] == "oral"
    assert state["question"]["choices"] == []
    assert _post(player, f"/api/family-bible-bee/rooms/{code}/ready", json={}).status_code == 200
    ready_state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    player_id = ready_state["players"][0]["id"]
    assert player_id in ready_state["answered_player_ids"]
    assert _post(
        host,
        f"/api/family-bible-bee/rooms/{code}/judge",
        json={"player_id": player_id, "judgment": "almost"},
    ).status_code == 200
    revealed = player.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert revealed["phase"] == "reveal"
    assert revealed["viewer"]["oral_judgment"] == "almost"
    assert revealed["viewer"]["round_points"] == 50


def test_challenge_timer_auto_reveals_and_pause_preserves_it():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "timer@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "game_style": "challenge"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    started = bible_bee._get_room(code)
    assert 0 < started["question_deadline"] - started["question_started_at"] <= 30
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200
    paused = bible_bee._get_room(code)
    assert "question_deadline" not in paused
    assert paused["paused_question_seconds"] > 0
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200

    def expire_question(room):
        room["question_deadline"] = 1

    bible_bee._mutate_room(code, expire_question)
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["phase"] == "reveal"


def test_finished_game_can_rematch_missed_verses():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "rematch@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/reveal", json={}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/end", json={}).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/rematch", json={}).status_code == 200
    room = bible_bee._get_room(code)
    assert room["phase"] == "question"
    assert len(room["questions"]) == 1
    assert room["questions"][0]["label"].startswith("Review ·")
    assert next(iter(room["players"].values()))["score"] == 0


def test_finished_bible_bee_can_play_again_with_same_players():
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, "play-again@example.com")
    _prime(player)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "round_count": "3", "team_mode": "on"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "avatar_preset": "esther", "csrf_token": CSRF},
    ).status_code == 302

    def force_finished(room):
        player = next(iter(room["players"].values()))
        player["score"] = 250
        player["away"] = True
        room["phase"] = "finished"
        room["review_summary"] = {}

    bible_bee._mutate_room(code, force_finished)

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/play-again", json={}).status_code == 200
    room = bible_bee._get_room(code)
    assert room["phase"] == "lobby"
    assert room["question_index"] == 0
    assert len(room["questions"]) == 3
    assert room["answers"] == {}
    assert room["round_results"] == []
    player = next(iter(room["players"].values()))
    assert player["name"] == "Ada"
    assert player["avatar_preset"] == "esther"
    assert player["score"] == 0
    assert player["away"] is False


def test_host_pause_skip_score_override_and_end_early():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "controls@example.com")
    _prime(player)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    player_id = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["players"][0]["id"]

    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["phase"] == "paused"
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/pause", json={}).status_code == 200
    assert _post(
        host,
        f"/api/family-bible-bee/rooms/{code}/players/{player_id}/score",
        json={"delta": 50},
    ).status_code == 200
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/skip", json={}).status_code == 200
    assert host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["question_index"] == 1
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/end", json={}).status_code == 200
    finished = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert finished["review_summary"]["players"][0]["badge"]


def test_two_choice_games_generate_two_logical_options():
    from faithsparks.views import bible_bee

    host = app.test_client()
    _prime(host, "two-choices@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "choice_count": "2", "round_count": "10"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    assert room["choice_count"] == 2
    assert all(len(question["choices"]) == 2 for question in room["questions"])


@pytest.mark.parametrize(
    "difficulty, expected_seconds, expected_points",
    [("hard", 25, 175), ("expert", 20, 225)],
)
def test_hard_and_expert_are_optional_timed_difficulties(
    difficulty, expected_seconds, expected_points
):
    from faithsparks.views import bible_bee

    host = app.test_client()
    player = app.test_client()
    _prime(host, f"{difficulty}@example.com")
    _prime(player)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "difficulty": difficulty, "choice_count": "2"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    room = bible_bee._get_room(code)
    assert room["question_seconds"] == expected_seconds
    assert len(room["questions"][0]["choices"]) == 4
    correct = room["questions"][0]["correct"]
    assert _post(player, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    state = player.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["viewer"]["round_points"] == expected_points + 50


def test_upramp_starts_easy_and_increases_difficulty():
    from faithsparks.views import bible_bee

    host = app.test_client()
    _prime(host, "upramp@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "difficulty": "upramp", "round_count": "10"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    assert [len(question["choices"]) for question in room["questions"][:3]] == [2, 2, 2]
    assert all(len(question["choices"]) == 4 for question in room["questions"][3:])
    room["question_index"] = 0
    assert bible_bee._upramp_stage(room) == ("Easy", None, 100)
    room["question_index"] = 4
    assert bible_bee._upramp_stage(room) == ("Growing", 30, 140)
    room["question_index"] = 8
    assert bible_bee._upramp_stage(room) == ("Hard", 20, 180)


def test_preset_bible_avatar_appears_in_public_player_state():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "preset@example.com")
    _prime(player)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        player,
        f"/family-bible-bee/join/{code}",
        data={
            "player_name": "Ada",
            "avatar_preset": "empty-tomb",
            "csrf_token": CSRF,
        },
    ).status_code == 302
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["players"][0]["avatar_preset"] == "empty-tomb"
    # Presets are rendered from their tile ID. Never expose the whole sprite as a
    # normal photo URL, because stale clients could display all nine tiles.
    assert state["players"][0]["avatar"] is None


def test_player_can_edit_bible_bee_profile_before_start():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "profile-host@example.com")
    _prime(first)
    _prime(second)
    created = _post(host, "/family-bible-bee/create")
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert _post(
        first,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ada", "avatar_preset": "fox", "csrf_token": CSRF},
    ).status_code == 302
    assert _post(
        second,
        f"/family-bible-bee/join/{code}",
        data={"player_name": "Ben", "csrf_token": CSRF},
    ).status_code == 302

    updated = _post(
        first,
        f"/api/family-bible-bee/rooms/{code}/profile",
        json={"player_name": "Ava", "avatar_data": "", "avatar_preset": "esther"},
    )

    assert updated.status_code == 200
    players = {player["name"]: player for player in host.get(f"/api/family-bible-bee/rooms/{code}").get_json()["players"]}
    assert players["Ava"]["avatar_preset"] == "esther"
    assert _post(
        first,
        f"/api/family-bible-bee/rooms/{code}/profile",
        json={"player_name": "Ben", "avatar_preset": "cross"},
    ).status_code == 409
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    assert _post(
        first,
        f"/api/family-bible-bee/rooms/{code}/profile",
        json={"player_name": "Late Edit", "avatar_preset": "cross"},
    ).status_code == 409


def test_couch_mode_uses_one_private_controller_and_alternates_teams():
    host = app.test_client()
    controller = app.test_client()
    _prime(host, "bible-couch@example.com")
    _prime(controller)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "control_mode": "couch", "round_count": "3"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    assert controller.get(f"/family-bible-bee/join/{code}").status_code == 403
    with host.session_transaction() as sess:
        token = sess["bible_bee_pairing_tokens"][code]["couch"]
    paired = _post(controller, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token})
    assert paired.status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    state = controller.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert state["active_team_id"] == "gold"
    assert state["viewer"]["can_answer"] is True
    correct = state["question"]["correct"]
    assert correct is None
    question = __import__("faithsparks.views.bible_bee", fromlist=["_get_room"])._get_room(code)["questions"][0]
    assert _post(controller, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": question["correct"]}).status_code == 200
    revealed = controller.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert revealed["phase"] == "reveal"


def test_bible_bee_controller_pairing_accepts_valid_one_time_token_without_session_csrf():
    from faithsparks.views import bible_bee

    host = app.test_client()
    controller = app.test_client()
    attacker = app.test_client()
    _prime(host, "mobile-bee-pairing@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        token = sess["bible_bee_pairing_tokens"][code]["blue"]

    invalid = attacker.post(
        f"/family-bible-bee/controller/{code}",
        data={"pairing_token": "not-a-real-private-token"},
    )
    paired = controller.post(
        f"/family-bible-bee/controller/{code}",
        data={"pairing_token": token},
    )

    assert invalid.status_code == 400
    assert paired.status_code == 302
    assert paired.headers["Location"].endswith(f"/family-bible-bee/play/{code}")
    assert bible_bee._get_room(code)["controller_pairings"]["blue"]["claimed"] is True


def test_bible_bee_short_codes_pair_and_controller_players_cannot_be_moved():
    from faithsparks.views import bible_bee

    host = app.test_client()
    blue = app.test_client()
    _prime(host, "protected-bee-controller@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        token = sess["bible_bee_pairing_tokens"][code]["blue"]

    paired = blue.post(
        f"/family-bible-bee/controller/{code}",
        data={"pairing_token": bible_bee._pair_code(token).lower()},
    )
    assert paired.status_code == 302
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    controller = next(player for player in state["players"] if player["is_controller"])
    blue_team = next(team for team in state["teams"] if team["id"] == "blue")
    assert blue_team["players"] == 0
    assert blue_team["controller_ready"] is True
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/players/{controller['id']}/team", json={}).status_code == 409
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/players/{controller['id']}/remove", json={}).status_code == 409
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/teams/rebalance", json={}).status_code == 200
    room = bible_bee._get_room(code)
    assert room["players"][controller["id"]]["team_id"] == "blue"


def test_initial_bible_bee_team_invites_survive_session_token_loss():
    host = app.test_client()
    _prime(host, "durable-bee-team-invites@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]

    with host.session_transaction() as sess:
        sess.pop("bible_bee_pairing_tokens", None)

    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert set(state["viewer"]["pairing_tokens"]) == {"gold", "blue"}
    assert state["controller_status"] == {"gold": False, "blue": False}
    for role in ("gold", "blue"):
        qr = host.get(f"/family-bible-bee/room/{code}/controller-qr/{role}")
        assert qr.status_code == 200
        assert qr.mimetype == "image/png"


def test_bible_bee_controller_survives_flask_session_cookie_loss_after_pairing():
    host = app.test_client()
    controller = app.test_client()
    _prime(host, "bee-controller-cookie@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "control_mode": "couch", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        token = sess["bible_bee_pairing_tokens"][code]["couch"]

    paired = controller.post(
        f"/family-bible-bee/controller/{code}",
        data={"pairing_token": token},
    )
    assert paired.status_code == 302
    assert "faithsparks_game_controller=" in paired.headers["Set-Cookie"]

    with controller.session_transaction() as sess:
        sess.clear()

    play = controller.get(f"/family-bible-bee/play/{code}")
    state = controller.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert play.status_code == 200
    assert state["viewer"]["can_answer"] is True


def test_bible_bee_join_and_pair_abort_if_room_disappears_during_submit(monkeypatch):
    from faithsparks.views import bible_bee

    host = app.test_client()
    joining = app.test_client()
    pairing = app.test_client()
    _prime(host, "vanishing-bee-room@example.com")
    _prime(joining)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={"csrf_token": CSRF, "control_mode": "hosted", "round_count": "3"},
    )
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        token = sess["bible_bee_pairing_tokens"][code]["host"]

    monkeypatch.setattr(bible_bee, "_mutate_room", lambda _code, _callback: None)

    joined = _post(
        joining,
        f"/family-bible-bee/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada"},
    )
    paired = pairing.post(
        f"/family-bible-bee/controller/{code}",
        data={"pairing_token": token},
    )

    assert joined.status_code == 404
    assert paired.status_code == 404
    with joining.session_transaction() as sess:
        assert bible_bee._player_session_key(code) not in sess


def test_team_controller_replacement_revokes_old_bible_bee_session():
    host = app.test_client(); gold = app.test_client(); replacement = app.test_client()
    _prime(host, "bible-team@example.com"); _prime(gold); _prime(replacement)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        first_token = sess["bible_bee_pairing_tokens"][code]["gold"]
    assert _post(gold, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": first_token}).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/controllers/gold/replace", json={}).status_code == 200
    assert gold.get(f"/family-bible-bee/play/{code}").status_code == 302
    with host.session_transaction() as sess:
        second_token = sess["bible_bee_pairing_tokens"][code]["gold"]
    assert second_token != first_token
    assert _post(replacement, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": second_token}).status_code == 302


def test_team_mode_only_accepts_active_bible_bee_controller_and_hides_invites():
    from faithsparks.views import bible_bee

    host = app.test_client(); gold = app.test_client(); blue = app.test_client(); public = app.test_client()
    _prime(host, "bible-controller-auth@example.com"); _prime(gold); _prime(blue); _prime(public)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        tokens = dict(sess["bible_bee_pairing_tokens"][code])
    for client, role in ((gold, "gold"), (blue, "blue")):
        assert _post(client, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role]}).status_code == 302
    public_state = public.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert "pairing_tokens" not in public_state["viewer"]
    assert tokens["gold"] not in public.get(f"/api/family-bible-bee/rooms/{code}").text
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(blue, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 403
    assert _post(gold, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200


def test_adaptive_bible_bee_has_no_device_speed_bonus_and_host_adjustments_undo():
    from faithsparks.views import bible_bee

    host = app.test_client(); gold = app.test_client(); blue = app.test_client(); stranger = app.test_client()
    _prime(host, "adaptive-score@example.com"); _prime(gold); _prime(blue); _prime(stranger)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        tokens = dict(sess["bible_bee_pairing_tokens"][code])
    for client, role in ((gold, "gold"), (blue, "blue")):
        assert _post(client, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role]}).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    room = bible_bee._get_room(code)
    correct = room["questions"][0]["correct"]
    base = bible_bee._score_config(room)["correct"]
    assert _post(gold, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200
    state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert next(team for team in state["teams"] if team["id"] == "gold")["score"] == base
    assert "Speed" not in next(iter(state["last_result"]["score_reasons_by_player"].values()))

    path = f"/api/family-bible-bee/rooms/{code}/score-adjust"
    payload = {"target_type": "team", "target_id": "gold", "delta": 25}
    assert _post(stranger, path, json=payload).status_code == 403
    assert _post(host, path, json=payload).status_code == 200
    adjusted = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert next(team for team in adjusted["teams"] if team["id"] == "gold")["score"] == base + 25
    assert adjusted["score_adjustments"][-1]["delta"] == 25
    assert _post(host, f"{path}/undo", json={}).status_code == 200
    restored = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert next(team for team in restored["teams"] if team["id"] == "gold")["score"] == base


def test_bible_bee_adaptive_display_uses_private_pairing_and_active_team_copy():
    script = open("static/bible_bee.js", encoding="utf-8").read()
    assert "Pair the private family controller from the creator’s screen." in script
    assert "Pair the Gold and Blue team phones from the creator’s screen." in script
    assert "answers this question" in script
    assert 'state.control_mode === "hosted" ? `<div class="join-invite">' in script
    assert "state.eligible_answer_count" in script
    assert "Pass the private phone to the active team. Practice together, then tap Ready." in script
    assert "The active team practices together, recites, and records its result honestly." in script


def test_bible_bee_controller_recovery_works_mid_question_and_preserves_state():
    from faithsparks.views import bible_bee

    host = app.test_client(); gold = app.test_client(); blue = app.test_client(); replacement = app.test_client()
    _prime(host, "bible-midgame-recovery@example.com"); _prime(gold); _prime(blue); _prime(replacement)
    created = _post(host, "/family-bible-bee/create", data={"csrf_token": CSRF, "control_mode": "team_auto", "round_count": "3"})
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        tokens = dict(sess["bible_bee_pairing_tokens"][code])
    for client, role in ((gold, "gold"), (blue, "blue")):
        assert _post(client, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role]}).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200
    before = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert before["active_player_count"] == 1
    assert before["eligible_answer_count"] == 1
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/controllers/gold/replace", json={}).status_code == 200
    with host.session_transaction() as sess:
        new_token = sess["bible_bee_pairing_tokens"][code]["gold"]
    assert _post(replacement, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": new_token}).status_code == 302
    after = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert (after["phase"], after["question_index"]) == (before["phase"], before["question_index"])
    assert gold.get(f"/api/family-bible-bee/rooms/{code}").get_json()["viewer"]["can_answer"] is False
    correct = bible_bee._get_room(code)["questions"][0]["correct"]
    assert _post(replacement, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": correct}).status_code == 200


def test_finish_the_verse_distractors_are_grammatical_near_misses():
    answer = "is born to help in time of need."
    distractors = bible_bee_content._finish_distractors(answer, [])

    assert distractors[:3] == [
        "is called to help in time of need.",
        "is ready to help in time of need.",
        "is sent to help in time of need.",
    ]
    assert all(choice.startswith("is ") for choice in distractors[:4])


def test_finish_the_verse_rejects_single_word_options_for_phrase_answers():
    answer = "world, that he gave his only Son."

    assert bible_bee_content._finish_choice_fits(answer, "world, that he gave his only Son.")
    assert not bible_bee_content._finish_choice_fits(answer, "gave")


def test_fill_blank_rejects_verb_like_choices_after_articles():
    prompt = "For God so loved the ______, that he gave his only Son."

    assert bible_bee_content._blank_choice_fits(prompt, "world", "earth")
    assert not bible_bee_content._blank_choice_fits(prompt, "world", "gave")


def test_finish_the_verse_question_prefers_plausible_alternatives(monkeypatch):
    passages = [
        {
            "id": "proverbs-17-17",
            "reference": "Proverbs 17:17",
            "text": "A friend is always loyal, and a brother is born to help in time of need.",
            "blanks": [],
        }
    ] + [
        {
            "id": f"passage-{index}",
            "reference": f"Psalm {index}:1",
            "text": f"Unrelated beginning number {index} with a completely different verse ending.",
            "blanks": [],
        }
        for index in range(1, 5)
    ]
    monkeypatch.setitem(
        bible_bee_content.GAME_STYLES,
        "finish_only",
        {"name": "Finish only", "description": "", "modes": ["finish"]},
    )
    questions = bible_bee_content.build_questions(
        passages,
        style="finish_only",
        round_count=5,
        seed="logical-options",
        choice_count=4,
    )
    question = next(
        item for item in questions if item["reference"] == "Proverbs 17:17"
    )

    assert question["label"] == "Finish the Verse"
    assert all(choice.startswith("is ") for choice in question["choices"])


def test_finish_the_verse_falls_back_to_complete_choice_set(monkeypatch):
    passages = [
        {
            "id": "short-finish",
            "reference": "Genesis 1:1",
            "text": "In the beginning God created the heavens.",
            "blanks": [],
        }
    ]
    monkeypatch.setitem(
        bible_bee_content.GAME_STYLES,
        "finish_only",
        {"name": "Finish only", "description": "", "modes": ["finish"]},
    )

    questions = bible_bee_content.build_questions(
        passages,
        style="finish_only",
        round_count=1,
        seed="finish-fallback",
        choice_count=4,
    )

    assert len(questions[0]["choices"]) == 4
    assert questions[0]["choices"][questions[0]["correct"]] == "God created the heavens."
    assert all(bible_bee_content._finish_choice_fits("God created the heavens.", choice) for choice in questions[0]["choices"])


def test_fill_blank_falls_back_to_complete_logical_choice_set(monkeypatch):
    passages = [
        {
            "id": "john-3-16",
            "reference": "John 3:16",
            "text": "For God so loved the world, that he gave his only Son.",
            "blanks": ["world"],
        }
    ]
    monkeypatch.setitem(
        bible_bee_content.GAME_STYLES,
        "blank_only",
        {"name": "Blank only", "description": "", "modes": ["fill_blank"]},
    )

    questions = bible_bee_content.build_questions(
        passages,
        style="blank_only",
        round_count=1,
        seed="blank-fallback",
        choice_count=4,
    )

    question = questions[0]
    assert len(question["choices"]) == 4
    assert question["choices"][question["correct"]] == "world"
    assert "gave" not in {choice.lower() for choice in question["choices"]}
    assert all(bible_bee_content._blank_choice_fits(question["prompt"], "world", choice) for choice in question["choices"])


def test_ai_one_off_game_uses_authoritative_text_and_records_review(monkeypatch):
    from faithsparks.views import bible_bee

    monkeypatch.setattr(
        bible_bee,
        "create_one_off_plan",
        lambda theme, age_group, round_count: {
            "title": "Courage for Today",
            "description": "A temporary family deck.",
            "references": [
                "Joshua 1:9",
                "Psalm 56:3",
                "Isaiah 41:10",
                "Philippians 4:13",
                "2 Timothy 1:7",
            ],
            "_provider": "claude",
        },
    )

    def fake_validate(questions, preferred_provider=None):
        return questions, {"provider": preferred_provider, "reviewed": len(questions), "improved": 2}

    monkeypatch.setattr(bible_bee, "validate_questions", fake_validate)
    host = app.test_client()
    _prime(host, "one-off@example.com")
    created = _post(
        host,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "version": "nlt",
            "round_count": "5",
            "game_source": "custom",
            "one_off_theme": "Courage when life feels hard",
        },
    )

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    assert room["deck_id"] == "one-off"
    assert room["deck_name"] == "Courage for Today"
    assert room["translation"] == "NLT"
    assert room["ai_review"]["improved"] == 2
    public_state = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert "ai_review" not in public_state
    assert room["passages"][0]["text"].endswith(
        "teach our family to trust God, walk in love, and remember truth."
    )


def test_custom_game_requires_a_theme():
    host = app.test_client()
    _prime(host, "one-off-error@example.com")
    response = _post(
        host,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "game_source": "custom",
            "one_off_theme": "",
        },
    )

    assert response.status_code == 503
    assert b"Describe a theme" in response.data


def test_custom_game_still_opens_if_optional_review_is_unavailable(monkeypatch):
    from faithsparks.views import bible_bee

    monkeypatch.setattr(
        bible_bee,
        "create_one_off_plan",
        lambda theme, age_group, round_count: {
            "title": "Hope",
            "description": "",
            "references": [
                "Psalm 42:11",
                "Romans 5:5",
                "Romans 15:13",
                "Hebrews 6:19",
                "1 Peter 1:3",
            ],
            "_provider": "openai",
        },
    )
    monkeypatch.setattr(
        bible_bee,
        "validate_questions",
        lambda questions, preferred_provider=None: (_ for _ in ()).throw(
            bible_bee.BibleBeeAIError("temporarily unavailable")
        ),
    )
    host = app.test_client()
    _prime(host, "review-fallback@example.com")
    response = _post(
        host,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "game_source": "custom",
            "one_off_theme": "Hope",
            "round_count": "5",
        },
    )

    assert response.status_code == 302
    code = response.headers["Location"].rsplit("/", 1)[-1]
    room = bible_bee._get_room(code)
    assert len(room["questions"]) == 5
    assert room["ai_review"]["status"] == "unavailable"


@pytest.mark.parametrize("control_mode", ["couch", "team_auto"])
@pytest.mark.parametrize("game_style", ["classic_mix", "oral_recitation"])
def test_complete_adaptive_bible_bee_journey_is_smooth(control_mode, game_style):
    """Run every adaptive Bible Bee question through answer, reveal, finish, and replay."""
    from faithsparks.views import bible_bee

    host = app.test_client()
    public = app.test_client()
    roles = ("couch",) if control_mode == "couch" else ("gold", "blue")
    controllers = {role: app.test_client() for role in roles}
    _prime(host, f"bible-journey-{control_mode}-{game_style}@example.com")
    _prime(public)
    for client in controllers.values():
        _prime(client)
    created = _post(
        host,
        "/family-bible-bee/create",
        data={
            "csrf_token": CSRF,
            "control_mode": control_mode,
            "game_style": game_style,
            "difficulty": "family",
            "round_count": "3",
        },
    )
    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    with host.session_transaction() as sess:
        tokens = dict(sess["bible_bee_pairing_tokens"][code])
    for role_name, client in controllers.items():
        assert _post(client, f"/family-bible-bee/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role_name]}).status_code == 302
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/start", json={}).status_code == 200

    for question_index in range(3):
        states = {role_name: client.get(f"/api/family-bible-bee/rooms/{code}").get_json() for role_name, client in controllers.items()}
        active_role, state = next((role_name, item) for role_name, item in states.items() if item["viewer"]["can_answer"])
        controller = controllers[active_role]
        assert state["phase"] == "question"
        assert state["question_index"] == question_index
        assert state["active_team_id"] == ("gold" if question_index % 2 == 0 else "blue")
        public_state = public.get(f"/api/family-bible-bee/rooms/{code}").get_json()
        assert public_state["question"]["correct"] is None

        if control_mode == "team_auto":
            inactive = controllers["blue" if active_role == "gold" else "gold"]
            forbidden_path = "ready" if game_style == "oral_recitation" else "answer"
            forbidden_payload = {} if game_style == "oral_recitation" else {"choice": 0}
            assert _post(inactive, f"/api/family-bible-bee/rooms/{code}/{forbidden_path}", json=forbidden_payload).status_code == 403

        if game_style == "oral_recitation":
            assert state["question"]["mode"] == "oral"
            assert _post(controller, f"/api/family-bible-bee/rooms/{code}/ready", json={}).status_code == 200
            assert _post(controller, f"/api/family-bible-bee/rooms/{code}/judge", json={"judgment": "correct"}).status_code == 200
        else:
            question = bible_bee._get_room(code)["questions"][question_index]
            assert _post(controller, f"/api/family-bible-bee/rooms/{code}/answer", json={"choice": question["correct"]}).status_code == 200

        revealed = controller.get(f"/api/family-bible-bee/rooms/{code}").get_json()
        assert revealed["phase"] == "reveal"
        assert revealed["question"]["reference"]
        if game_style != "oral_recitation":
            assert revealed["question"]["correct"] is not None
        assert revealed["viewer"]["round_points"] == 100
        assert _post(host, f"/api/family-bible-bee/rooms/{code}/next", json={}).status_code == 200

    finished = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert sum(team["score"] for team in finished["teams"]) == 300
    assert _post(host, f"/api/family-bible-bee/rooms/{code}/play-again", json={}).status_code == 200
    replay = host.get(f"/api/family-bible-bee/rooms/{code}").get_json()
    assert replay["phase"] == "lobby"
    assert replay["question_index"] == 0
    assert all(team["score"] == 0 for team in replay["teams"])
