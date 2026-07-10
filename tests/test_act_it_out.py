import re
from types import SimpleNamespace

from app import app
from faithsparks.services.rate_limit import reset_memory_limits


CSRF = "test-csrf-token"


def _prime(client, email=None):
    reset_memory_limits()
    with client.session_transaction() as sess:
        sess["_csrf_token"] = CSRF
        if email:
            sess["user_email"] = email
            sess["user_info"] = {"email": email}
            sess["google_oauth_token"] = {"access_token": "test-token", "token_type": "Bearer"}


def _post(client, path, json=None, data=None):
    return client.post(path, json=json, data=data, headers={"X-CSRF-Token": CSRF})


def _create_team_room(host, theme="Bible Stories"):
    created = _post(
        host,
        "/group-games/act-it-out/create",
        data={"csrf_token": CSRF, "team_mode": "on", "theme": theme},
    )
    assert created.status_code == 302
    match = re.search(r"/host/([A-Z0-9]{4})$", created.headers["Location"])
    assert match
    return match.group(1)


def test_group_games_hub_keeps_old_url_alias():
    client = app.test_client()
    new_page = client.get("/group-games")
    old_page = client.get("/church-games")

    assert new_page.status_code == 200
    assert old_page.status_code == 200
    assert b"Group Games" in new_page.data
    assert b"Group Games" in old_page.data


def test_act_it_out_create_join_and_display_lobby():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "act-host@example.com")
    _prime(player)

    code = _create_team_room(host)
    joined = _post(
        player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada"},
    )

    assert joined.status_code == 302
    assert player.get(f"/group-games/act-it-out/display/{code}").status_code == 200
    qr = player.get(f"/group-games/act-it-out/room/{code}/qr")
    assert qr.status_code == 200
    assert qr.mimetype == "image/png"

    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert state["phase"] == "lobby"
    assert state["team_mode"] is True
    assert state["players"][0]["team_id"] == "gold"


def test_secret_prompt_visible_only_to_host_and_active_player():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    display = app.test_client()
    _prime(host, "secret-host@example.com")
    _prime(first)
    _prime(second)
    _prime(display)
    code = _create_team_room(host)
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    host_state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    first_state = first.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    second_state = second.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    display_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()

    assert host_state["round"]["answer"] is None
    assert host_state["viewer"]["secret_prompt"]["answer"]
    assert first_state["viewer"]["player_id"] == host_state["active_player_id"]
    assert first_state["viewer"]["secret_prompt"]["answer"] == host_state["viewer"]["secret_prompt"]["answer"]
    assert "secret_prompt" not in second_state["viewer"]
    assert "secret_prompt" not in display_state["viewer"]


def test_guess_mode_reveals_clues_without_leaking_answer_to_players():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    display = app.test_client()
    _prime(host, "guess-host@example.com")
    _prime(first)
    _prime(second)
    _prime(display)
    code = _create_team_room(host, theme="Guess the Story")
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    host_state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    first_state = first.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    display_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()

    assert host_state["round"]["mode"] == "guess"
    assert host_state["round"]["answer"] is None
    assert len(host_state["round"]["clues"]) == 1
    assert host_state["viewer"]["secret_prompt"]["answer"]
    assert len(host_state["viewer"]["secret_prompt"]["clues"]) >= 4
    assert "secret_prompt" not in first_state["viewer"]
    assert "secret_prompt" not in display_state["viewer"]
    assert display_state["round"]["answer"] is None

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/clue", json={}).status_code == 200
    clue_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert len(clue_state["round"]["clues"]) == 2

    for _ in range(10):
        assert _post(host, f"/api/church-games/act-it-out/rooms/{code}/clue", json={}).status_code == 200
    maxed_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert len(maxed_state["round"]["clues"]) == maxed_state["round"]["clue_count"]

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    reveal = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reveal["round"]["answer"] == host_state["viewer"]["secret_prompt"]["answer"]
    assert {team["id"]: team["score"] for team in reveal["teams"]} == {"gold": 100, "blue": 0}


def test_correct_scores_team_and_next_round_alternates_team():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "score-host@example.com")
    _prime(first)
    _prime(second)
    code = _create_team_room(host)
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    started = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert started["active_team_id"] == "gold"

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    reveal = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert {team["id"]: team["score"] for team in reveal["teams"]} == {"gold": 100, "blue": 0}
    assert reveal["round"]["answer"]

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/next", json={}).status_code == 200
    next_state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert next_state["phase"] == "round"
    assert next_state["active_team_id"] == "blue"


def test_team_management_locked_after_start():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "lock-host@example.com")
    _prime(first)
    _prime(second)
    code = _create_team_room(host)
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    player_id = state["players"][0]["id"]
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/players/{player_id}/team", json={}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/teams/rebalance", json={}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/teams/rebalance", json={}).status_code == 409
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/players/{player_id}/team", json={}).status_code == 409


def test_team_room_allows_forty_players(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=True))
    host = app.test_client()
    _prime(host, "forty-host@example.com")
    code = _create_team_room(host)

    for index in range(41):
        client = app.test_client()
        _prime(client)
        response = _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": f"P{index:02d}"},
        )
        if index < 40:
            assert response.status_code == 302
        else:
            assert response.status_code == 409
            assert b"This team room is full at 40 players." in response.data

    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert len(state["players"]) == 40
    assert [team["players"] for team in state["teams"]] == [20, 20]


def test_finished_team_winner_state():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "finish-host@example.com")
    _prime(first)
    _prime(second)
    code = _create_team_room(host)
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/end", json={}).status_code == 200

    finished = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert {team["id"]: team["score"] for team in finished["teams"]} == {"gold": 100, "blue": 0}
