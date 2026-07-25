import re
import pytest
from types import SimpleNamespace
from unittest import mock

from flask import session

from app import app
from faithsparks.services.rate_limit import reset_memory_limits


CSRF = "test-csrf-token"
PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
JPEG_STUB = "data:image/jpeg;base64,/9j/AA=="


class StripeObjectStub:
    """Matches Stripe SDK v15 resources that expose to_dict, not get."""

    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data


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


def _create_team_room(host, theme="Bible Stories", round_count=None):
    data = {"csrf_token": CSRF, "team_mode": "on", "theme": theme}
    if round_count:
        data["round_count"] = str(round_count)
    created = _post(
        host,
        "/group-games/act-it-out/create",
        data=data,
    )
    assert created.status_code == 302
    match = re.search(r"/host/([A-Z0-9]{4})$", created.headers["Location"])
    assert match
    return match.group(1)


def _create_draw_room(host, team_mode=False, theme="Mix It Up", round_count=None):
    data = {"csrf_token": CSRF, "theme": theme}
    if team_mode:
        data["team_mode"] = "on"
    if round_count:
        data["round_count"] = str(round_count)
    created = _post(host, "/group-games/draw-it/create", data=data)
    assert created.status_code == 302
    match = re.search(r"/host/([A-Z0-9]{4})$", created.headers["Location"])
    assert match
    return match.group(1)


def _create_family_room(host, **overrides):
    data = {
        "csrf_token": CSRF,
        "play_style": "teams",
        "round_count": "10",
        "game_mode": "mixed",
        "difficulty": "whole_family",
        "categories": [
            "bible_stories",
            "jesus_miracles",
            "parables",
            "people",
            "worship_church",
            "everyday_faith",
        ],
    }
    data.update(overrides)
    created = _post(host, "/family-game-night/create", data=data)
    if created.status_code != 302:
        return created, None
    return created, created.headers["Location"].rsplit("/", 1)[-1]


def test_group_games_hub_keeps_old_url_alias():
    client = app.test_client()
    new_page = client.get("/group-games")
    old_page = client.get("/church-games")

    assert new_page.status_code == 200
    assert old_page.status_code == 200
    assert b"Group Games" in new_page.data
    assert b"Group Games" in old_page.data
    assert b"How it works" in new_page.data
    assert b"cast the display" in new_page.data


def test_family_game_night_sales_page_explains_product_and_join_flow():
    client = app.test_client()
    page = client.get("/family-game-night")

    assert page.status_code == 200
    assert b"Faith Sparks Family Game Night" in page.data
    assert b"Laugh together. Learn Scripture. Make memories." in page.data
    assert b"Act It!" in page.data
    assert b"Draw It!" in page.data
    assert b"Don\xe2\x80\x99t Say It!" in page.data
    assert b"Guess It!" in page.data
    assert b"Play a free game" in page.data
    assert b"Players join free" in page.data
    assert b"a $19 one-time purchase with no recurring fee" in page.data
    assert b"planned as a one-time purchase" not in page.data
    assert b"How many devices do we need?" in page.data
    assert b"Can younger readers play?" in page.data
    assert b"Is it denominational?" in page.data
    assert b'id="fgn-code-form"' in page.data
    assert b"noindex" not in page.data


def test_family_game_night_records_page_views_once_per_session(monkeypatch):
    from faithsparks.views import act_it_out

    events = []
    monkeypatch.setattr(act_it_out, "_record_family_funnel_event", lambda event, room, code: events.append(event))
    client = app.test_client()

    assert client.get("/family-game-night").status_code == 200
    assert client.get("/family-game-night").status_code == 200
    assert client.get("/family-game-night/play").status_code == 200
    assert client.get("/family-game-night/play").status_code == 200

    assert events == ["sales_page_view", "setup_view"]


def test_family_game_night_ignores_bot_page_views(monkeypatch):
    from faithsparks.views import act_it_out

    recorder = mock.Mock()
    monkeypatch.setattr(act_it_out, "_record_family_funnel_event", recorder)
    page = app.test_client().get("/family-game-night", headers={"User-Agent": "ExampleBot/1.0"})

    assert page.status_code == 200
    recorder.assert_not_called()


def test_family_game_night_cta_events_are_validated_deduplicated_and_nonblocking(monkeypatch):
    from faithsparks.views import act_it_out

    recorder = mock.Mock()
    monkeypatch.setattr(act_it_out, "_record_family_funnel_event", recorder)
    client = app.test_client()
    _prime(client)

    first = _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "play_free_click"})
    duplicate = _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "play_free_click"})
    unlock = _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "unlock_click"})
    invalid = _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "answer_seen"})

    assert first.status_code == duplicate.status_code == unlock.status_code == 200
    assert invalid.status_code == 400
    assert [call.args[0] for call in recorder.call_args_list] == ["play_free_click", "unlock_click"]
    assert b'data-fgn-event="play_free_click"' in client.get("/family-game-night").data


def test_family_game_night_analytics_rate_limit_does_not_block_navigation(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=False))
    client = app.test_client()
    _prime(client)

    event = _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "unlock_click"})

    assert event.status_code == 202
    assert client.get("/family-game-night/play").status_code == 200


def test_family_game_night_analytics_failure_does_not_break_pages_or_cta(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "_record_family_funnel_event", mock.Mock(side_effect=RuntimeError("offline")))
    client = app.test_client()
    _prime(client)

    assert client.get("/family-game-night").status_code == 200
    assert client.get("/family-game-night/play").status_code == 200
    assert _post(client, "/api/family-game-night/analytics", data={"csrf_token": CSRF, "event": "unlock_click"}).status_code == 200


def test_family_game_night_free_setup_has_safe_defaults_and_mobile_controls():
    client = app.test_client()
    _prime(client, "free-family@example.com")

    page = client.get("/family-game-night/play")

    assert page.status_code == 200
    assert b"Create Game Room" in page.data
    assert b'name="play_style" value="teams" checked' in page.data
    assert b'name="round_count" value="10" checked' in page.data
    assert b'name="round_count" value="15" disabled' in page.data
    assert b'name="game_mode" value="mixed" checked' in page.data
    assert b'name="difficulty" value="whole_family" checked' in page.data
    assert page.data.count(b'name="categories"') == 6
    assert b"up to six players" in page.data


def test_family_game_night_free_room_is_mixed_and_server_limited():
    from faithsparks.views import act_it_out

    host = app.test_client()
    _prime(host, "free-room@example.com")
    created, code = _create_family_room(host)

    assert created.status_code == 302
    room = act_it_out._get_room(code)
    assert room["game_type"] == "family_game_night"
    assert room["team_mode"] is True
    assert room["round_count"] == 10
    assert room["player_limit"] == 6
    assert room["free_sampler"] is True
    assert {round_data["mode"] for round_data in room["rounds"]} == {"act", "draw", "clue", "guess"}
    assert {round_data["prompt_id"] for round_data in room["rounds"]} <= act_it_out.FREE_FAMILY_PROMPT_IDS


def test_individual_family_game_never_creates_team_controller_pairings(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    _prime(host, "individual-controller@example.com")

    created, code = _create_family_room(
        host,
        play_style="individual",
        control_mode="team_auto",
        round_count="15",
        game_mode="mixed",
    )

    assert created.status_code == 302
    room = act_it_out._get_room(code)
    assert room["team_mode"] is False
    assert room["teams"] == []
    assert room["control_mode"] == "hosted"
    assert set(room["controller_pairings"]) == {"host"}
    with host.session_transaction() as sess:
        assert set(sess["family_game_pairing_tokens"][code]) == {"host"}


def test_individual_play_selection_explains_and_enforces_hosted_devices():
    template = open("templates/family_game_night_setup.html", encoding="utf-8").read()

    assert "Individual points use Hosted Play" in template
    assert "input[unavailableName] = individual && teamOnly" in template
    assert "choose('control_mode', 'hosted')" in template


def test_family_game_night_records_create_join_start_and_finish_funnel(monkeypatch):
    from faithsparks.views import act_it_out

    events = []
    monkeypatch.setattr(act_it_out, "_record_family_funnel_event", lambda event, room, code: events.append((event, code)))
    host = app.test_client()
    player = app.test_client()
    _prime(host, "funnel-family@example.com")
    _prime(player)

    created, code = _create_family_room(host, play_style="individual")
    assert created.status_code == 302
    joined = _post(player, f"/group-games/act-it-out/join/{code}", data={"csrf_token": CSRF, "player_name": "Ada"})
    assert joined.status_code == 302
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start").status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/end").status_code == 200

    assert [event for event, event_code in events if event_code == code] == [
        "room_created",
        "first_player_joined",
        "game_started",
        "game_finished",
    ]


def test_family_funnel_uses_nested_firestore_event_fields(monkeypatch):
    from faithsparks.views import act_it_out

    writes = []

    class Document:
        def set(self, data, merge=False):
            writes.append((data, merge))

        def collection(self, _name):
            return self

        def document(self, _name):
            return self

    class Database:
        def collection(self, _name):
            return Document()

    monkeypatch.setattr(act_it_out, "db", lambda: Database())
    with app.test_request_context("/family-game-night"):
        act_it_out._record_family_funnel_event(
            "play_free_click", {"game_type": "family_game_night"}, ""
        )

    assert writes[0][0].keys() == {"total", "events", "updatedAt"}
    assert writes[0][0]["events"].keys() == {"play_free_click"}
    assert writes[0][1] is True


def _finished_family_room(host, player):
    created, code = _create_family_room(host, play_style="individual")
    assert created.status_code == 302
    assert _post(player, f"/group-games/act-it-out/join/{code}", data={"csrf_token": CSRF, "player_name": "Ada"}).status_code == 302
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start").status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/end").status_code == 200
    return code


class FeedbackDatabase:
    def __init__(self, fail=False):
        self.fail = fail
        self.feedback = []
        self.analytics = []

    def __call__(self):
        return self

    def collection(self, name):
        database = self

        class Collection:
            def add(self, data):
                if database.fail:
                    raise RuntimeError("Firestore unavailable")
                database.feedback.append(data)

            def document(self, _name):
                class Document:
                    def set(self, data, merge=False):
                        if database.fail:
                            raise RuntimeError("Firestore unavailable")
                        database.analytics.append((data, merge))

                return Document()

        return Collection()


def _valid_feedback(**overrides):
    payload = {
        "enjoyment": 5,
        "favorite_mode": "draw",
        "comment": "We loved drawing together.",
        "play_again": "yes",
        "quote_approved": False,
    }
    payload.update(overrides)
    return payload


def test_signed_out_player_can_submit_valid_anonymous_feedback_once(monkeypatch):
    from faithsparks.views import act_it_out

    database = FeedbackDatabase()
    host = app.test_client()
    player = app.test_client()
    _prime(host, "feedback-host@example.com")
    _prime(player)
    code = _finished_family_room(host, player)
    finished_room = act_it_out._get_room(code)
    monkeypatch.setattr(act_it_out, "db", database)
    monkeypatch.setattr(act_it_out, "_get_room", lambda _code: finished_room)

    submitted = _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback())
    duplicate = _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback(comment="again"))

    assert submitted.status_code == duplicate.status_code == 200
    assert duplicate.get_json()["duplicate"] is True
    assert len(database.feedback) == 1
    stored = database.feedback[0]
    assert stored["enjoyment"] == 5
    assert stored["favoriteMode"] == "draw"
    assert stored["playAgain"] == "yes"
    assert stored["teamMode"] is False
    assert "roomCode" not in stored and "email" not in stored and "players" not in stored
    aggregate = database.analytics[0][0]
    assert aggregate.keys() == {"total", "ratingSum", "playAgain", "favoriteMode", "updatedAt"}
    assert aggregate["playAgain"].keys() == {"yes"}
    assert aggregate["favoriteMode"].keys() == {"draw"}


def test_family_feedback_rejects_invalid_values_and_long_comments(monkeypatch):
    from faithsparks.views import act_it_out

    host = app.test_client()
    player = app.test_client()
    _prime(host, "feedback-validation@example.com")
    _prime(player)
    code = _finished_family_room(host, player)
    finished_room = act_it_out._get_room(code)
    monkeypatch.setattr(act_it_out, "db", FeedbackDatabase())
    monkeypatch.setattr(act_it_out, "_get_room", lambda _code: finished_room)

    assert _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback(enjoyment=6)).status_code == 400
    assert _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback(favorite_mode="trivia")).status_code == 400
    assert _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback(play_again="always")).status_code == 400
    assert _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback(comment="x" * 501)).status_code == 400


def test_family_feedback_requires_room_membership_and_csrf(monkeypatch):
    from faithsparks.views import act_it_out

    host = app.test_client()
    player = app.test_client()
    stranger = app.test_client()
    _prime(host, "feedback-auth@example.com")
    _prime(player)
    _prime(stranger)
    code = _finished_family_room(host, player)
    finished_room = act_it_out._get_room(code)
    monkeypatch.setattr(act_it_out, "db", FeedbackDatabase())
    monkeypatch.setattr(act_it_out, "_get_room", lambda _code: finished_room)

    assert _post(stranger, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback()).status_code == 403
    assert player.post(f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback()).status_code == 403


def test_feedback_storage_failure_does_not_break_finished_scoreboard(monkeypatch):
    from faithsparks.views import act_it_out

    host = app.test_client()
    player = app.test_client()
    _prime(host, "feedback-failure@example.com")
    _prime(player)
    code = _finished_family_room(host, player)
    finished_room = act_it_out._get_room(code)
    monkeypatch.setattr(act_it_out, "db", FeedbackDatabase(fail=True))
    monkeypatch.setattr(act_it_out, "_get_room", lambda _code: finished_room)

    failed = _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback())

    assert failed.status_code == 503
    assert player.get(f"/group-games/act-it-out/play/{code}").status_code == 200
    assert player.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["phase"] == "finished"


def test_family_feedback_is_rate_limited(monkeypatch):
    from faithsparks.views import act_it_out

    host = app.test_client()
    player = app.test_client()
    _prime(host, "feedback-rate@example.com")
    _prime(player)
    code = _finished_family_room(host, player)
    monkeypatch.setattr(act_it_out, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=False))

    response = _post(player, f"/api/group-games/act-it-out/rooms/{code}/feedback", json=_valid_feedback())

    assert response.status_code == 429


def test_family_game_night_room_exposes_first_host_walkthrough_and_help():
    js = open("static/act_it_out.js", encoding="utf-8").read()

    assert "Three screens, one easy job." in js
    assert "Keep this host screen with you." in js
    assert "No account needed." in js
    assert "Need help?" in js
    assert "A phone disconnected?" in js
    assert "Read aloud?" in js


def test_family_game_night_host_keeps_control_when_oauth_state_disappears():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "host-reconnect@example.com")
    _prime(player)
    created, code = _create_family_room(host, play_style="individual")
    assert created.status_code == 302
    joined = _post(
        player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada"},
    )
    assert joined.status_code == 302

    # Flask-Dance can temporarily report the token as unauthorized and the
    # global request hook then clears these identity fields. The signed room
    # credential must continue to authorize the browser that created it.
    with host.session_transaction() as sess:
        sess.pop("user_email", None)
        sess.pop("user_info", None)
        sess.pop("google_oauth_token", None)

    assert host.get(f"/group-games/act-it-out/host/{code}").status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start").status_code == 200


def test_family_host_survives_complete_flask_session_cookie_loss():
    host = app.test_client()
    _prime(host, "durable-host@example.com")
    created, code = _create_family_room(host, play_style="individual")
    assert created.status_code == 302
    assert f"faithsparks_family_game_night_host_{code}=" in created.headers["Set-Cookie"]

    with host.session_transaction() as sess:
        sess.clear()

    assert host.get(f"/group-games/act-it-out/host/{code}").status_code == 200
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert state["viewer"]["is_host"] is True
    with host.session_transaction() as sess:
        refreshed_csrf = sess["_csrf_token"]
    renamed = host.post(
        f"/api/family-game-night/rooms/{code}/teams/names",
        json={"gold": "Sun Team", "blue": "Sky Team"},
        headers={"X-CSRF-Token": refreshed_csrf},
    )
    assert renamed.status_code == 200


def test_room_code_alone_does_not_grant_host_control():
    host = app.test_client()
    visitor = app.test_client()
    _prime(host, "host-capability@example.com")
    _prime(visitor)
    _created, code = _create_family_room(host, play_style="individual")

    with visitor.session_transaction() as sess:
        sess["act_it_out_host_rooms"] = [code]

    assert visitor.get(f"/group-games/act-it-out/host/{code}").status_code == 403
    assert _post(visitor, f"/api/group-games/act-it-out/rooms/{code}/start").status_code == 403


def test_family_game_night_rejects_invalid_and_locked_configuration():
    host = app.test_client()
    _prime(host, "invalid-family@example.com")

    invalid, _code = _create_family_room(host, game_mode="not-a-mode")
    locked, _code = _create_family_room(host, round_count="20")

    assert invalid.status_code == 400
    assert b"Choose Mixed Game Night" in invalid.data
    assert locked.status_code == 403
    assert b"free game includes 10 mixed rounds" in locked.data


def test_family_setup_offers_two_three_and_four_device_modes():
    host = app.test_client()
    _prime(host, "devices@example.com")
    page = host.get("/family-game-night/play")

    assert page.status_code == 200
    assert b"Use a TV or computer plus one phone." in page.data
    assert b"For Team Play, use one phone per team." in page.data
    assert b"Couch Play \xc2\xb7 2 devices" in page.data
    assert b"Team Play \xc2\xb7 3 devices \xc2\xb7 Recommended" in page.data
    assert b"Hosted Play \xc2\xb7 4+ devices" in page.data


def test_couch_controller_can_run_a_two_device_team_round_without_secret_leak():
    from faithsparks.views import act_it_out

    host = app.test_client()
    controller = app.test_client()
    display = app.test_client()
    _prime(host, "couch@example.com")
    _prime(controller)
    _prime(display)
    created, code = _create_family_room(host, control_mode="couch")
    assert created.status_code == 302
    assert _post(controller, f"/group-games/act-it-out/join/{code}", data={"csrf_token": CSRF, "player_name": "Tessa"}).status_code == 403
    blocked_start = _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={})
    assert blocked_start.status_code == 409
    assert b"do not add a second team" in blocked_start.data
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]
    qr_path = f"/group-games/act-it-out/room/{code}/controller-qr/couch"
    qr = host.get(qr_path)
    assert qr.status_code == 200 and qr.mimetype == "image/png"
    assert qr.headers["Cache-Control"] == "private, no-store"
    assert app.test_client().get(qr_path).status_code == 403
    assert _post(controller, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 302
    assert host.get(qr_path).status_code == 410
    replay = app.test_client(); _prime(replay)
    assert _post(replay, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 400

    room = act_it_out._get_room(code)
    assert room["control_mode"] == "couch"
    assert len(room["players"]) == 2
    assert "Tessa" not in {player["name"] for player in room["players"].values()}
    assert {player["team_id"] for player in room["players"].values()} == {"gold", "blue"}
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    private = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    shared_host = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    public = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert private["viewer"]["can_control"] is True
    assert shared_host["viewer"]["is_host"] is True
    assert shared_host["viewer"]["can_control"] is False
    assert "secret_prompt" not in shared_host["viewer"]
    if private["round"]["mode"] == "guess":
        assert "secret_prompt" not in private["viewer"]
    else:
        assert private["viewer"]["secret_prompt"]["answer"]
    assert public["round"]["answer"] is None
    assert "secret_prompt" not in public["viewer"]
    assert "pairing_tokens" not in public["viewer"]
    if private["phase"] == "prepare":
        assert private["round_deadline"] is None
        assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/ready", json={}).status_code == 200
        hidden = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
        assert hidden["phase"] == "round" and hidden["round_deadline"]
        assert "secret_prompt" not in hidden["viewer"]
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    reveal = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reveal["last_result"]["points"] == 100


def test_family_controller_survives_flask_session_cookie_loss_after_pairing():
    host = app.test_client()
    controller = app.test_client()
    _prime(host, "controller-cookie@example.com")
    _prime(controller)
    _created, code = _create_family_room(host, control_mode="couch")
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]

    paired = controller.post(
        f"/family-game-night/controller/{code}",
        data={"pairing_token": token},
    )
    assert paired.status_code == 302
    assert "faithsparks_game_controller=" in paired.headers["Set-Cookie"]

    with controller.session_transaction() as sess:
        sess.clear()

    play = controller.get(f"/group-games/act-it-out/play/{code}")
    state = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert play.status_code == 200
    assert state["viewer"]["can_control"] is True
    assert state["viewer"]["player_id"]


def test_replacing_family_controller_revokes_the_old_browser():
    host = app.test_client(); old = app.test_client(); new = app.test_client()
    _prime(host, "replace-controller@example.com"); _prime(old); _prime(new)
    _created, code = _create_family_room(host, control_mode="couch")
    with host.session_transaction() as sess:
        first = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(old, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": first}).status_code == 302
    assert old.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["can_control"] is True
    assert _post(host, f"/api/family-game-night/rooms/{code}/controllers/couch/replace", json={}).status_code == 200
    assert old.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["can_control"] is False
    with host.session_transaction() as sess:
        second = sess["family_game_pairing_tokens"][code]["couch"]
    assert second != first
    assert _post(new, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": second}).status_code == 302


def test_family_display_contract_covers_prepare_and_adaptive_copy():
    script = open("static/act_it_out.js", encoding="utf-8").read()
    assert 'state.phase === "prepare"' in script
    assert "is getting ready" in script
    assert "Waiting for the private prompt" in script
    assert "Pair the private family controller from the creator’s screen." in script
    assert "Pair the Gold and Blue team phones from the creator’s screen." in script
    assert "This clue is worth ${pointsAvailable} points." in script
    assert "Guess out loud. A correct team guess earns 100 points." in script


def test_family_client_stops_polling_expired_rooms_and_hides_owner_tools_from_controllers():
    script = open("static/act_it_out.js", encoding="utf-8").read()

    assert "if (requestInFlight || roomExpired" in script
    assert "if (error.status === 404)" in script
    assert "This game has wrapped up." in script
    assert "state.viewer.is_host && state.team_mode" in script
    assert "state.viewer.is_host && [\"lobby\", \"round\"]" in script
    assert 'state.viewer.is_host ? `<button id="close-room"' in script
    assert "refreshState" not in script


def test_family_controller_can_be_replaced_during_a_round_without_resetting_it():
    host = app.test_client(); old = app.test_client(); new = app.test_client()
    _prime(host, "midgame-family-recovery@example.com"); _prime(old); _prime(new)
    _created, code = _create_family_room(host, control_mode="couch")
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(old, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 302
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    before = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert _post(host, f"/api/family-game-night/rooms/{code}/controllers/couch/replace", json={}).status_code == 200
    with host.session_transaction() as sess:
        replacement = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(new, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": replacement}).status_code == 302
    after = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert (after["phase"], after["round_index"]) == (before["phase"], before["round_index"])
    assert old.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["can_control"] is False
    assert new.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["can_control"] is True


@pytest.mark.parametrize("game_mode", ["act", "draw", "clue", "guess"])
def test_recovered_family_controller_owns_prompt_timer_and_score(game_mode, monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client(); old = app.test_client(); new = app.test_client()
    _prime(host, f"recover-{game_mode}@example.com"); _prime(old); _prime(new)
    _created, code = _create_family_room(host, control_mode="couch", game_mode=game_mode)
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(old, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 302
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    before = old.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    old_player_id = before["viewer"]["player_id"]
    assert before["active_player_id"] == old_player_id
    assert before["round"]["mode"] == game_mode

    assert _post(host, f"/api/family-game-night/rooms/{code}/controllers/couch/replace", json={}).status_code == 200
    revoked = old.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert revoked["viewer"]["can_control"] is False
    assert "secret_prompt" not in revoked["viewer"]
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 409
    with host.session_transaction() as sess:
        replacement_token = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(new, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": replacement_token}).status_code == 302
    recovered = new.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    replacement_player_id = recovered["viewer"]["player_id"]
    assert replacement_player_id != old_player_id
    assert recovered["active_player_id"] == replacement_player_id
    if game_mode == "guess":
        assert "secret_prompt" not in recovered["viewer"]
        assert recovered["phase"] == "round"
        assert recovered["round_deadline"] is not None
    else:
        assert recovered["viewer"]["secret_prompt"]["mode"] == game_mode
        assert _post(new, f"/api/group-games/act-it-out/rooms/{code}/ready", json={}).status_code == 200
        timed = new.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
        assert timed["round_deadline"] is not None
    assert _post(new, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    reveal = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reveal["last_result"]["player_id"] == replacement_player_id
    assert reveal["last_result"]["points"] == 100
    gold = next(team for team in reveal["teams"] if team["id"] == "gold")
    assert gold["score"] == 100
    assert _post(old, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 403
    assert _post(new, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 409
    unchanged = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert next(team for team in unchanged["teams"] if team["id"] == "gold")["score"] == 100


def test_team_auto_assigns_private_prompt_to_actor_or_waiting_guess_judge():
    host = app.test_client()
    gold = app.test_client()
    blue = app.test_client()
    _prime(host, "team-auto@example.com")
    _prime(gold)
    _prime(blue)
    created, code = _create_family_room(host, control_mode="team_auto")
    assert created.status_code == 302
    with host.session_transaction() as sess:
        tokens = sess["family_game_pairing_tokens"][code]
    for client, role in ((gold, "gold"), (blue, "blue")):
        assert _post(client, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role]}).status_code == 302
    assert _post(gold, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    states = [(client, client.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()) for client in (gold, blue)]
    controller_client, controller = next(item for item in states if item[1]["viewer"]["can_control"])
    non_controller_client, non_controller = next(item for item in states if not item[1]["viewer"]["can_control"])
    assert "secret_prompt" not in non_controller["viewer"]
    assert controller["viewer"]["secret_prompt"]["answer"]
    if controller["round"]["mode"] == "guess":
        assert controller["viewer"]["controller_role"] != controller["active_team_id"]
    else:
        assert controller["viewer"]["controller_role"] == controller["active_team_id"]
        assert _post(controller_client, f"/api/group-games/act-it-out/rooms/{code}/ready", json={}).status_code == 200
        controller_client, non_controller_client = non_controller_client, controller_client
    assert _post(non_controller_client, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 403
    assert controller_client.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["can_judge"] is True
    assert _post(controller_client, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200


def test_couch_guess_answer_requires_deliberate_judge_reveal(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    controller = app.test_client()
    public = app.test_client()
    _prime(host, "couch-judge@example.com")
    _prime(controller)
    _prime(public)
    created, code = _create_family_room(host, control_mode="couch", game_mode="guess")
    assert created.status_code == 302
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(controller, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 302
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    before = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert before["round"]["mode"] == "guess"
    assert before["viewer"]["can_control"] is True
    assert "secret_prompt" not in before["viewer"]
    assert "secret_prompt" not in public.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/show-answer", json={}).status_code == 200
    revealed = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert revealed["viewer"]["secret_prompt"]["answer"]
    assert "secret_prompt" not in public.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]


def test_family_game_host_can_adjust_team_score_and_undo():
    host = app.test_client()
    stranger = app.test_client()
    _prime(host, "score-host@example.com")
    _prime(stranger)
    created, code = _create_family_room(host)
    assert created.status_code == 302
    path = f"/api/family-game-night/rooms/{code}/score-adjust"
    payload = {"target_type": "team", "target_id": "gold", "delta": 25}
    assert _post(stranger, path, json=payload).status_code == 403
    assert _post(host, path, json=payload).status_code == 200
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert next(team for team in state["teams"] if team["id"] == "gold")["score"] == 25
    assert state["score_adjustments"][-1]["delta"] == 25
    assert _post(host, f"{path}/undo", json={}).status_code == 200
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert next(team for team in state["teams"] if team["id"] == "gold")["score"] == 0
    assert state["score_adjustments"] == []


def test_controller_pair_page_consumes_fragment_without_sending_it_to_server():
    template = open("templates/family_game_controller_pair.html", encoding="utf-8").read()
    script = open("static/act_it_out.js", encoding="utf-8").read()
    assert "location.hash.slice(1)" in template
    assert "history.replaceState" in template
    assert "Share controller invite" in script
    assert "controller-qr" in script


def test_family_controller_pairing_accepts_valid_one_time_token_without_session_csrf():
    from faithsparks.views import act_it_out

    host = app.test_client()
    controller = app.test_client()
    attacker = app.test_client()
    _prime(host, "mobile-pairing@example.com")
    created, code = _create_family_room(host, control_mode="team_auto")
    assert created.status_code == 302
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["gold"]

    invalid = attacker.post(
        f"/family-game-night/controller/{code}",
        data={"pairing_token": "not-a-real-private-token"},
    )
    paired = controller.post(
        f"/family-game-night/controller/{code}",
        data={"pairing_token": token},
    )

    assert invalid.status_code == 400
    assert paired.status_code == 302
    assert paired.headers["Location"].endswith(f"/group-games/act-it-out/play/{code}")
    assert act_it_out._get_room(code)["controller_pairings"]["gold"]["claimed"] is True


def test_family_join_and_pair_abort_if_room_disappears_during_submit(monkeypatch):
    from faithsparks.views import act_it_out

    host = app.test_client()
    joining = app.test_client()
    pairing = app.test_client()
    _prime(host, "vanishing-family-room@example.com")
    _prime(joining)
    created, code = _create_family_room(host, play_style="individual")
    assert created.status_code == 302
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["host"]

    monkeypatch.setattr(act_it_out, "_mutate_room", lambda _code, _callback: None)

    joined = _post(
        joining,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada"},
    )
    paired = pairing.post(
        f"/family-game-night/controller/{code}",
        data={"pairing_token": token},
    )

    assert joined.status_code == 404
    assert paired.status_code == 404
    with joining.session_transaction() as sess:
        assert act_it_out._player_session_key(code) not in sess


def test_draw_prepare_ui_shows_prompt_before_canvas_and_timer():
    script = open("static/act_it_out.js", encoding="utf-8").read()
    stylesheet = open("static/act_it_out.css", encoding="utf-8").read()
    assert 'isPreparing && activePrompt ? secretPromptCard(activePrompt)' in script
    assert 'isPreparing ? "" : drawingBoard' in script
    assert 'isPreparing ? "" : `<div class="act-timer">' in script
    assert "Ready · hide prompt and start" in script
    assert ".prepare-layout .score-rail" in stylesheet
    assert "[403, 409].includes(error.status)" in script
    assert "stopDrawingAutosave()" in script
    assert "isCurrentDrawingCanvas(canvas, session)" in script
    assert 'usesPhoneDrawGuesses && !isPreparing' in script
    assert "Draw on this phone while everyone else guesses aloud." in script


def test_couch_draw_lifecycle_rejects_early_and_stale_uploads_but_accepts_active_drawing(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    controller = app.test_client()
    display = app.test_client()
    _prime(host, "draw-lifecycle@example.com")
    _prime(controller)
    _prime(display)
    created, code = _create_family_room(host, control_mode="couch", game_mode="draw")
    assert created.status_code == 302
    with host.session_transaction() as sess:
        token = sess["family_game_pairing_tokens"][code]["couch"]
    assert _post(controller, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": token}).status_code == 302
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    prepared = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert prepared["phase"] == "prepare"
    assert prepared["viewer"]["secret_prompt"]["mode"] == "draw"
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/drawing", json={"drawing": PNG_1X1}).status_code == 409

    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/ready", json={}).status_code == 200
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/drawing", json={"drawing": PNG_1X1}).status_code == 200
    for _ in range(3):
        state = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
        assert state["phase"] == "round"
        assert state["round"]["drawing"] == PNG_1X1
    public = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert "secret_prompt" not in public["viewer"]

    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/drawing", json={"drawing": PNG_1X1}).status_code == 409


def test_complete_family_game_night_supports_every_mode_and_filters(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    _prime(host, "complete-family@example.com")

    for mode in ["mixed", "act", "draw", "clue", "guess"]:
        created, code = _create_family_room(
            host,
            play_style="individual",
            round_count="15",
            game_mode=mode,
            difficulty="whole_family",
            categories=["bible_stories", "parables"],
        )
        assert created.status_code == 302, mode
        room = act_it_out._get_room(code)
        expected_modes = {"act", "draw", "clue", "guess"} if mode == "mixed" else {mode}
        assert {round_data["mode"] for round_data in room["rounds"]} == expected_modes
        assert {round_data["theme"] for round_data in room["rounds"]} <= {"Bible Stories", "Parables"}
        assert all(
            next(prompt for prompt in act_it_out.PROMPTS if prompt["id"] == round_data["prompt_id"])["difficulty"] in {"easy", "medium"}
            for round_data in room["rounds"]
        )
        assert room["free_sampler"] is False
        assert room["player_limit"] == act_it_out.INDIVIDUAL_PLAYER_LIMIT


def test_complete_family_game_night_defaults_to_fifteen_rounds(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    client = app.test_client()
    _prime(client, "complete-default@example.com")

    page = client.get("/family-game-night/play")

    assert page.status_code == 200
    assert b'name="round_count" value="15" checked' in page.data
    assert b'name="game_mode" value="act"' in page.data
    assert b'name="round_count" value="20"' in page.data
    assert b"disabled" not in page.data


def test_active_plus_includes_complete_family_game_night_without_checkout(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(
        act_it_out,
        "get_user_doc",
        lambda _email: {"isPro": True, "plan": "family", "purchases": {}},
    )
    monkeypatch.setattr(act_it_out, "STRIPE_PRICE_FAMILY_GAME_NIGHT", "price_game_night")
    client = app.test_client()
    _prime(client, "plus-family@example.com")

    sales_page = client.get("/family-game-night")
    setup_page = client.get("/family-game-night/play")

    assert sales_page.status_code == 200
    assert b"Included with Faith Sparks Plus Family and Classroom" in sales_page.data
    assert "Included with Plus — start a game" in sales_page.get_data(as_text=True)
    assert b'action="/family-game-night/checkout"' not in sales_page.data
    assert setup_page.status_code == 200
    assert b'name="round_count" value="15" checked' in setup_page.data
    assert b'name="round_count" value="20"' in setup_page.data
    assert b"disabled" not in setup_page.data


def test_canceled_plus_does_not_unlock_game_without_standalone_purchase():
    from faithsparks.services.users import has_family_game_night_access

    assert has_family_game_night_access({"isPro": False, "plan": "family", "purchases": {}}) is False
    assert has_family_game_night_access(
        {"isPro": False, "plan": "free", "purchases": {"family_game_night": True}}
    ) is True


def test_family_game_night_checkout_uses_one_time_entitlement(monkeypatch):
    from faithsparks.views import billing

    checkout_create = mock.Mock(return_value=SimpleNamespace(url="https://checkout.example/game-night"))
    fake_stripe = SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=checkout_create)))

    class Snapshot:
        exists = False

        def to_dict(self):
            return {}

    class Document:
        def get(self):
            return Snapshot()

    class Collection:
        def document(self, _document_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "STRIPE_PRICE_FAMILY_GAME_NIGHT", "price_game_night")
    monkeypatch.setattr(billing, "db", Database())
    metric = mock.Mock()
    monkeypatch.setattr(billing, "_increment_metric", metric)

    with app.test_request_context("/family-game-night/checkout", method="POST"):
        session["user_email"] = "owner@example.com"
        response = billing.buy_family_game_night()

    assert response.status_code == 303
    kwargs = checkout_create.call_args.kwargs
    assert kwargs["mode"] == "payment"
    assert kwargs["line_items"] == [{"price": "price_game_night", "quantity": 1}]
    assert kwargs["allow_promotion_codes"] is True
    assert kwargs["metadata"]["entitlement_id"] == "family_game_night"
    assert kwargs["metadata"]["email"] == "owner@example.com"
    assert kwargs["cancel_url"].endswith("/family-game-night/checkout/canceled")
    metric.assert_called_once_with("family_game_night_checkout_started", "one_time")


def test_billing_normalizes_current_stripe_sdk_objects():
    from stripe import StripeObject
    from faithsparks.views import billing

    nested = StripeObject()
    nested.update({"email": "owner@example.com"})
    event = StripeObject()
    event.update({"type": "checkout.session.completed", "customer_details": nested})

    normalized = billing._stripe_dict(event)

    assert normalized == {
        "type": "checkout.session.completed",
        "customer_details": {"email": "owner@example.com"},
    }


def test_family_game_night_success_returns_paid_buyer_to_setup(monkeypatch):
    from faithsparks.views import billing

    checkout = {
        "payment_status": "paid",
        "customer_details": {"email": "owner@example.com"},
        "metadata": {
            "email": "owner@example.com",
            "entitlement_id": "family_game_night",
        },
    }
    fake_stripe = SimpleNamespace(
        checkout=SimpleNamespace(
            Session=SimpleNamespace(retrieve=mock.Mock(return_value=StripeObjectStub(checkout)))
        )
    )
    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")

    with app.test_request_context("/family-game-night/success?session_id=cs_paid"):
        session["user_email"] = "owner@example.com"
        response = billing.family_game_night_success()

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/family-game-night/play")


def test_family_game_night_success_accepts_fully_discounted_checkout(monkeypatch):
    from faithsparks.views import billing

    checkout = {
        "payment_status": "no_payment_required",
        "customer_details": {"email": "family@example.com"},
        "metadata": {
            "email": "family@example.com",
            "entitlement_id": "family_game_night",
        },
    }
    fake_stripe = SimpleNamespace(
        checkout=SimpleNamespace(Session=SimpleNamespace(retrieve=mock.Mock(return_value=checkout)))
    )
    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")

    with app.test_request_context("/family-game-night/success?session_id=cs_free"):
        session["user_email"] = "family@example.com"
        response = billing.family_game_night_success()

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/family-game-night/play")


def test_family_game_night_repeat_buyer_returns_to_setup(monkeypatch):
    from faithsparks.views import billing

    class Snapshot:
        exists = True

        def to_dict(self):
            return {"purchases": {"family_game_night": True}}

    class Document:
        def get(self):
            return Snapshot()

    class Collection:
        def document(self, _document_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    monkeypatch.setattr(billing, "stripe", SimpleNamespace())
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", Database())

    with app.test_request_context("/family-game-night/checkout", method="POST"):
        session["user_email"] = "owner@example.com"
        response = billing.buy_family_game_night()

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/family-game-night/play")


def test_active_plus_member_cannot_accidentally_buy_game_again(monkeypatch):
    from faithsparks.views import billing

    class Snapshot:
        exists = True

        def to_dict(self):
            return {"isPro": True, "plan": "classroom", "purchases": {}}

    class Document:
        def get(self):
            return Snapshot()

    class Collection:
        def document(self, _document_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    checkout_create = mock.Mock()
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=checkout_create))),
    )
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", Database())

    with app.test_request_context("/family-game-night/checkout", method="POST"):
        session["user_email"] = "plus-classroom@example.com"
        response = billing.buy_family_game_night()

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/family-game-night/play")
    checkout_create.assert_not_called()


def test_family_game_night_canceled_checkout_returns_to_offer_and_records_event(monkeypatch):
    from faithsparks.views import billing

    metric = mock.Mock()
    monkeypatch.setattr(billing, "_increment_metric", metric)

    with app.test_request_context("/family-game-night/checkout/canceled"):
        session["user_email"] = "owner@example.com"
        response = billing.family_game_night_checkout_canceled()

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/family-game-night#complete-game")
    metric.assert_called_once_with("family_game_night_checkout_canceled", "one_time")


def test_family_game_night_webhook_fulfills_stable_entitlement(monkeypatch):
    from faithsparks.views import billing

    writes = []

    class Document:
        def set(self, data, merge=False):
            writes.append((data, merge))

    class Collection:
        def document(self, _document_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_game_night",
                "customer": "cus_family",
                "payment_status": "paid",
                "customer_details": {"email": "owner@example.com"},
                "metadata": {
                    "email": "owner@example.com",
                    "entitlement_id": "family_game_night",
                    "price_id": "price_game_night",
                },
            }
        },
    }
    fake_stripe = SimpleNamespace(
        Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=StripeObjectStub(event))),
        Subscription=SimpleNamespace(retrieve=mock.Mock()),
    )
    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "whsec_fake")
    monkeypatch.setattr(billing, "db", Database())
    metric = mock.Mock()
    monkeypatch.setattr(billing, "_increment_metric", metric)

    with app.test_request_context(
        "/stripe/webhook",
        method="POST",
        data=b"{}",
        headers={"Stripe-Signature": "test-signature"},
    ):
        response = billing.stripe_webhook()

    assert response == ("", 200)
    assert len(writes) == 1
    data, merge = writes[0]
    assert merge is True
    assert data["purchases"]["family_game_night"] is True
    assert data["purchaseDetails"]["family_game_night"]["checkoutSessionId"] == "cs_game_night"
    assert data["purchaseDetails"]["family_game_night"]["paymentStatus"] == "paid"
    metric.assert_called_once_with("family_game_night_checkout_fulfilled", "family_game_night")


def test_family_game_night_webhook_fulfills_fully_discounted_checkout(monkeypatch):
    from faithsparks.views import billing

    writes = []

    class Document:
        def set(self, data, merge=False):
            writes.append((data, merge))

    class Collection:
        def document(self, _document_id):
            return Document()

    class Database:
        def collection(self, _collection_name):
            return Collection()

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_free_game_night",
                "customer": "cus_family",
                "payment_status": "no_payment_required",
                "customer_details": {"email": "family@example.com"},
                "metadata": {
                    "email": "family@example.com",
                    "entitlement_id": "family_game_night",
                    "price_id": "price_game_night",
                },
            }
        },
    }
    fake_stripe = SimpleNamespace(
        Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=event)),
        Subscription=SimpleNamespace(retrieve=mock.Mock()),
    )
    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "whsec_fake")
    monkeypatch.setattr(billing, "db", Database())
    monkeypatch.setattr(billing, "_increment_metric", mock.Mock())

    with app.test_request_context(
        "/stripe/webhook",
        method="POST",
        data=b"{}",
        headers={"Stripe-Signature": "test-signature"},
    ):
        response = billing.stripe_webhook()

    assert response == ("", 200)
    assert len(writes) == 1
    data, merge = writes[0]
    assert merge is True
    assert data["purchases"]["family_game_night"] is True
    assert data["purchaseDetails"]["family_game_night"]["paymentStatus"] == "no_payment_required"


def test_act_it_out_home_explains_round_flow_and_draw_mode():
    client = app.test_client()
    _prime(client, "act-how@example.com")

    home = client.get("/group-games/act-it-out")

    assert home.status_code == 200
    assert b"How to play" in home.data
    assert b"Got it right" in home.data
    assert b"No point / pass" in home.data
    assert b"up to 40 players" in home.data


def test_group_games_hub_exposes_draw_it_entry():
    client = app.test_client()

    hub = client.get("/group-games")

    assert hub.status_code == 200
    assert b"Draw It" in hub.data
    assert b"/group-games/draw-it" in hub.data


def test_draw_it_entry_preselects_draw_theme():
    client = app.test_client()
    _prime(client, "draw-entry@example.com")

    home = client.get("/group-games/draw-it")

    assert home.status_code == 200
    assert b"Draw a Bible prompt" in home.data
    assert b"Game length" in home.data
    assert b"up to 40 players" in home.data
    assert b'value=\"20\"' in home.data
    assert b'value="Mix It Up" checked' in home.data
    assert b"Bible Stories" in home.data
    assert b"Jesus&#39; Miracles" in home.data
    assert b"Easy Objects" in home.data


def test_draw_it_theme_creates_collection_specific_rounds():
    from faithsparks.views import act_it_out

    host = app.test_client()
    _prime(host, "draw-theme@example.com")

    code = _create_draw_room(host, theme="Easy Objects")
    room = act_it_out._get_room(code)

    assert room["theme"] == "Easy Objects"
    assert {round_data["mode"] for round_data in room["rounds"]} == {"draw"}
    assert {round_data["theme"] for round_data in room["rounds"]} == {"Easy Objects"}


def test_act_it_out_create_defaults_to_individual_mode():
    host = app.test_client()
    _prime(host, "act-individual@example.com")

    created = _post(host, "/group-games/act-it-out/create", data={"csrf_token": CSRF, "theme": "Bible Stories"})

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert state["team_mode"] is False
    assert state["teams"] == []


def test_act_it_out_can_create_twenty_round_game():
    host = app.test_client()
    _prime(host, "act-twenty-rounds@example.com")

    created = _post(
        host,
        "/group-games/act-it-out/create",
        data={"csrf_token": CSRF, "theme": "Bible Stories", "round_count": "20"},
    )

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert room["round_total"] == 20


def test_act_it_out_mix_it_up_excludes_draw_rounds():
    from faithsparks.views import act_it_out

    host = app.test_client()
    _prime(host, "act-no-draw@example.com")

    created = _post(host, "/group-games/act-it-out/create", data={"csrf_token": CSRF, "theme": "Mix It Up"})

    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]
    room = act_it_out._get_room(code)
    assert {round_data["mode"] for round_data in room["rounds"]} <= {"act", "clue", "guess"}
    assert all(round_data["theme"] != "Draw It" for round_data in room["rounds"])


def test_act_it_out_collections_have_playable_prompts():
    from faithsparks.views import act_it_out

    act_prompts = [prompt for prompt in act_it_out.PROMPTS if "draw" not in prompt["modes"]]

    for theme in act_it_out.ACT_THEMES:
        themed = [prompt for prompt in act_prompts if prompt["theme"] == theme]
        assert themed, theme
        if theme == "Guess the Story":
            assert all(prompt["modes"] == ["guess"] and len(prompt.get("clues", [])) >= 4 for prompt in themed)
        else:
            assert all("act" in prompt["modes"] for prompt in themed)
            assert all(prompt.get("instruction", "").startswith("Act ") for prompt in themed)


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


def test_act_it_out_room_creator_can_delete_from_home():
    host = app.test_client()
    _prime(host, "act-delete-host@example.com")
    code = _create_team_room(host)

    home = host.get("/group-games/act-it-out")
    assert code.encode() in home.data

    deleted = _post(host, f"/group-games/act-it-out/rooms/{code}/delete", data={"csrf_token": CSRF})

    assert deleted.status_code == 302
    assert deleted.headers["Location"].endswith("/group-games/act-it-out")
    assert host.get(f"/api/group-games/act-it-out/rooms/{code}").status_code == 404


def test_act_it_out_room_delete_rejects_non_creator_and_allows_admin(monkeypatch):
    owner = app.test_client()
    attacker = app.test_client()
    admin = app.test_client()
    _prime(owner, "act-owner@example.com")
    _prime(attacker, "act-attacker@example.com")
    _prime(admin, "admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    code = _create_team_room(owner)

    assert _post(attacker, f"/group-games/act-it-out/rooms/{code}/delete", data={"csrf_token": CSRF}).status_code == 403
    assert _post(admin, f"/group-games/act-it-out/rooms/{code}/delete", data={"csrf_token": CSRF}).status_code == 302
    assert owner.get(f"/api/group-games/act-it-out/rooms/{code}").status_code == 404


def test_act_it_out_stale_rooms_are_removed_from_recent_list():
    from faithsparks.views import act_it_out

    host = app.test_client()
    _prime(host, "act-stale@example.com")
    code = _create_team_room(host)
    with act_it_out._local_lock:
        act_it_out._local_rooms[code]["expires_at"] = 1
        act_it_out._local_rooms[code]["updated_at"] = 1

    home = host.get("/group-games/act-it-out")

    assert home.status_code == 200
    assert code.encode() not in home.data
    assert host.get(f"/api/group-games/act-it-out/rooms/{code}").status_code == 404


def test_act_it_out_join_supports_preset_and_uploaded_avatars():
    host = app.test_client()
    preset_player = app.test_client()
    upload_player = app.test_client()
    _prime(host, "act-avatar-host@example.com")
    _prime(preset_player)
    _prime(upload_player)
    created = _post(host, "/group-games/act-it-out/create", data={"csrf_token": CSRF, "theme": "Bible Stories"})
    assert created.status_code == 302
    code = created.headers["Location"].rsplit("/", 1)[-1]

    assert _post(
        preset_player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada", "avatar_preset": "empty-tomb"},
    ).status_code == 302
    assert _post(
        upload_player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ben", "avatar_data": JPEG_STUB},
    ).status_code == 302

    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    players = {player["name"]: player for player in state["players"]}
    assert players["Ada"]["avatar_preset"] == "empty-tomb"
    assert players["Ben"]["avatar"].startswith(f"/group-games/act-it-out/room/{code}/avatar/")
    avatar_response = host.get(players["Ben"]["avatar"])
    assert avatar_response.status_code == 200
    assert avatar_response.mimetype == "image/jpeg"
    assert avatar_response.data.startswith(b"\xff\xd8\xff")


def test_team_room_uses_preset_avatars_instead_of_uploaded_selfies():
    host = app.test_client()
    player = app.test_client()
    _prime(host, "act-team-avatar-host@example.com")
    _prime(player)
    code = _create_team_room(host)
    join_page = player.get(f"/group-games/act-it-out/join/{code}")
    assert b"Team rooms use preset pictures" in join_page.data
    assert b"Add a selfie" not in join_page.data

    response = _post(
        player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada", "avatar_data": JPEG_STUB},
    )

    assert response.status_code == 400
    assert b"Team rooms use preset avatars" in response.data
    assert _post(
        player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada", "avatar_preset": "esther"},
    ).status_code == 302
    updated = _post(
        player,
        f"/api/group-games/act-it-out/rooms/{code}/profile",
        json={"player_name": "Ada", "avatar_data": JPEG_STUB},
    )
    assert updated.status_code == 409
    assert "Team rooms use preset avatars" in updated.get_json()["error"]


def test_player_can_edit_act_it_out_profile_before_start():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "act-profile-host@example.com")
    _prime(first)
    _prime(second)
    code = _create_team_room(host)
    assert _post(
        first,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada", "avatar_preset": "fox"},
    ).status_code == 302
    assert _post(
        second,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ben"},
    ).status_code == 302

    updated = _post(
        first,
        f"/api/group-games/act-it-out/rooms/{code}/profile",
        json={"player_name": "Ava", "avatar_data": "", "avatar_preset": "esther"},
    )

    assert updated.status_code == 200
    players = {player["name"]: player for player in host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["players"]}
    assert players["Ava"]["avatar_preset"] == "esther"
    assert _post(
        first,
        f"/api/group-games/act-it-out/rooms/{code}/profile",
        json={"player_name": "Ben", "avatar_preset": "cross"},
    ).status_code == 409
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    assert _post(
        first,
        f"/api/group-games/act-it-out/rooms/{code}/profile",
        json={"player_name": "Late Edit", "avatar_preset": "cross"},
    ).status_code == 409


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
            f"/group-games/draw-it/join/{code}",
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
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    host_state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    first_state = first.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    display_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()

    assert host_state["round"]["mode"] == "guess"
    assert host_state["round"]["points_available"] == 100
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
    assert clue_state["round"]["points_available"] == 75

    for _ in range(10):
        assert _post(host, f"/api/church-games/act-it-out/rooms/{code}/clue", json={}).status_code == 200
    maxed_state = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert len(maxed_state["round"]["clues"]) == maxed_state["round"]["clue_count"]
    assert maxed_state["round"]["points_available"] == 25

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/correct", json={}).status_code == 200
    reveal = display.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reveal["round"]["answer"] == host_state["viewer"]["secret_prompt"]["answer"]
    assert reveal["last_result"]["points"] == 25
    assert {team["id"]: team["score"] for team in reveal["teams"]} == {"gold": 25, "blue": 0}


def test_draw_mode_accepts_only_active_player_drawing_without_revealing_answer():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    display = app.test_client()
    _prime(host, "draw-host@example.com")
    _prime(first)
    _prime(second)
    _prime(display)
    code = _create_draw_room(host)
    for client, name in ((first, "Ada"), (second, "Ben")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    host_state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    first_state = first.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    display_state = display.get(f"/api/group-games/draw-it/rooms/{code}").get_json()

    assert host_state["round"]["mode"] == "draw"
    assert host_state["game_type"] == "draw_it"
    assert host_state["round"]["answer"] is None
    assert len(host_state["round"]["choices"]) == 4
    assert host_state["viewer"]["secret_prompt"]["answer"]
    assert first_state["viewer"]["secret_prompt"]["mode"] == "draw"
    assert display_state["round"]["answer"] is None
    assert display_state["round"]["drawing"] is None
    assert _post(second, f"/api/group-games/draw-it/rooms/{code}/drawing", json={"drawing": PNG_1X1}).status_code == 403

    assert _post(first, f"/api/group-games/draw-it/rooms/{code}/drawing", json={"drawing": PNG_1X1}).status_code == 200
    drawn = display.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert drawn["round"]["drawing"] == PNG_1X1
    assert drawn["round"]["answer"] is None


def test_draw_mode_requires_a_connected_drawer_and_guesser_to_start():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    stale_guesser = app.test_client()
    _prime(host, "draw-needs-two-host@example.com")
    _prime(drawer)
    _prime(stale_guesser)
    code = _create_draw_room(host)
    assert _post(
        drawer,
        f"/group-games/draw-it/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada"},
    ).status_code == 302

    response = _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={})

    assert response.status_code == 409
    assert b"one to draw and one to guess" in response.data
    assert _post(
        stale_guesser,
        f"/group-games/draw-it/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ben"},
    ).status_code == 302
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    ben_id = next(player["id"] for player in state["players"] if player["name"] == "Ben")

    def mark_stale(current):
        current["players"][ben_id]["last_seen"] = act_it_out.time.time() - 120

    act_it_out._mutate_room(code, mark_stale)
    response = _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={})
    assert response.status_code == 409
    assert b"two connected players" in response.data


def test_draw_mode_phone_guess_scores_and_reveals_when_all_guess():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    guesser = app.test_client()
    _prime(host, "draw-score-host@example.com")
    _prime(drawer)
    _prime(guesser)
    code = _create_draw_room(host)
    for client, name in ((drawer, "Ada"), (guesser, "Ben")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    correct = state["viewer"]["secret_prompt"]["answer"]

    def age_round(current):
        current["round_started_at"] = act_it_out.time.time() - act_it_out.DRAW_MIN_SECONDS - 1

    act_it_out._mutate_room(code, age_round)

    assert _post(guesser, f"/api/group-games/draw-it/rooms/{code}/guess", json={"choice": correct}).status_code == 200

    reveal = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert reveal["last_result"]["correct_guesses"] == 1
    players = {player["name"]: player for player in reveal["players"]}
    assert players["Ben"]["score"] == 100


def test_draw_guess_buttons_bind_before_player_round_render_returns():
    script = open("static/act_it_out.js", encoding="utf-8").read()
    player_round = script[script.index("function renderRound(state)"):script.index("const activePrompt = state.viewer.secret_prompt;")]

    assert "bindDrawGuessChoices();" in player_round
    assert player_round.index("bindDrawGuessChoices();") < player_round.rindex("return;")
    assert 'await submitDrawGuess(button.dataset.drawChoice)' in script


def test_draw_mode_host_can_award_a_verbal_guess_once():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    guesser = app.test_client()
    _prime(host, "draw-verbal-host@example.com")
    _prime(drawer)
    _prime(guesser)
    code = _create_draw_room(host)
    for client, name in ((drawer, "Ada"), (guesser, "Ben")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start").status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    drawer_id = state["active_player_id"]
    guesser_id = next(player["id"] for player in state["players"] if player["id"] != drawer_id)

    awarded = _post(
        host,
        f"/api/group-games/draw-it/rooms/{code}/draw-correct",
        json={"player_id": guesser_id},
    )
    duplicate = _post(
        host,
        f"/api/group-games/draw-it/rooms/{code}/draw-correct",
        json={"player_id": guesser_id},
    )
    drawer_award = _post(
        host,
        f"/api/group-games/draw-it/rooms/{code}/draw-correct",
        json={"player_id": drawer_id},
    )

    assert awarded.status_code == 200
    assert duplicate.status_code == 409
    assert drawer_award.status_code == 409
    updated = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    players = {player["id"]: player for player in updated["players"]}
    assert players[guesser_id]["score"] == 100
    assert players[drawer_id]["score"] == 0
    assert guesser_id in updated["round"]["answered_player_ids"]


def test_draw_mode_waits_before_auto_revealing_fast_guesses():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    guesser = app.test_client()
    _prime(host, "draw-min-time-host@example.com")
    _prime(drawer)
    _prime(guesser)
    code = _create_draw_room(host)
    for client, name in ((drawer, "Ada"), (guesser, "Ben")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    correct = state["viewer"]["secret_prompt"]["answer"]

    assert _post(guesser, f"/api/group-games/draw-it/rooms/{code}/guess", json={"choice": correct}).status_code == 200
    waiting = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert waiting["phase"] == "round"
    assert waiting["round"]["answered_count"] == 1

    def age_round(current):
        current["round_started_at"] = act_it_out.time.time() - act_it_out.DRAW_MIN_SECONDS - 1

    act_it_out._mutate_room(code, age_round)
    reveal = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert reveal["last_result"]["correct_guesses"] == 1


def test_draw_mode_awards_drawer_bonus_when_half_guess_correct():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    correct_guesser = app.test_client()
    wrong_guesser = app.test_client()
    _prime(host, "draw-bonus-host@example.com")
    for client in (drawer, correct_guesser, wrong_guesser):
        _prime(client)
    code = _create_draw_room(host, team_mode=True)
    for client, name in ((drawer, "Ada"), (correct_guesser, "Ben"), (wrong_guesser, "Cal")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    correct = state["viewer"]["secret_prompt"]["answer"]
    wrong = next(choice for choice in state["round"]["choices"] if choice != correct)

    def age_round(current):
        current["round_started_at"] = act_it_out.time.time() - act_it_out.DRAW_MIN_SECONDS - 1

    act_it_out._mutate_room(code, age_round)

    assert _post(correct_guesser, f"/api/group-games/draw-it/rooms/{code}/guess", json={"choice": correct}).status_code == 200
    assert _post(wrong_guesser, f"/api/group-games/draw-it/rooms/{code}/guess", json={"choice": wrong}).status_code == 200

    reveal = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert reveal["last_result"]["drawer_bonus"] == 50
    assert reveal["last_result"]["correct_guesses"] == 1
    players = {player["name"]: player for player in reveal["players"]}
    assert players["Ada"]["score"] == 50
    assert players["Ben"]["score"] == 100
    assert {team["id"]: team["score"] for team in reveal["teams"]} == {"gold": 50, "blue": 100}


def test_draw_mode_ignores_stale_guessers_when_revealing():
    from faithsparks.views import act_it_out

    host = app.test_client()
    drawer = app.test_client()
    connected_guesser = app.test_client()
    stale_guesser = app.test_client()
    _prime(host, "draw-stale-host@example.com")
    for client in (drawer, connected_guesser, stale_guesser):
        _prime(client)
    code = _create_draw_room(host)
    for client, name in ((drawer, "Ada"), (connected_guesser, "Ben"), (stale_guesser, "Cal")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    cal_id = next(player["id"] for player in state["players"] if player["name"] == "Cal")

    def mark_stale(current):
        current["players"][cal_id]["last_seen"] = act_it_out.time.time() - 120
        current["round_started_at"] = act_it_out.time.time() - act_it_out.DRAW_MIN_SECONDS - 1

    act_it_out._mutate_room(code, mark_stale)
    correct = state["viewer"]["secret_prompt"]["answer"]

    assert _post(
        connected_guesser,
        f"/api/group-games/draw-it/rooms/{code}/guess",
        json={"choice": correct},
    ).status_code == 200

    reveal = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    assert reveal["phase"] == "reveal"
    assert reveal["last_result"]["guesser_count"] == 1
    assert reveal["last_result"]["drawer_bonus"] == 50
    players = {player["name"]: player for player in reveal["players"]}
    assert players["Ada"]["score"] == 50
    assert players["Ben"]["score"] == 100
    assert players["Cal"]["connected"] is False


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


def test_twenty_player_team_room_skips_stale_active_player(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "check_rate_limit", lambda *args, **kwargs: SimpleNamespace(allowed=True))
    host = app.test_client()
    _prime(host, "act-twenty-stale-host@example.com")
    code = _create_team_room(host, round_count=20)
    players = [app.test_client() for _ in range(20)]
    for index, client in enumerate(players):
        _prime(client)
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": f"P{index:02d}"},
        ).status_code == 302

    lobby = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    stale_id = next(player["id"] for player in lobby["players"] if player["name"] == "P00")

    def mark_stale(current):
        current["players"][stale_id]["last_seen"] = act_it_out.time.time() - 120

    act_it_out._mutate_room(code, mark_stale)

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    started = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert started["round_total"] == 20
    assert started["active_team_id"] == "gold"
    assert started["active_player_id"] != stale_id
    assert started["active_player_name"] == "P02"
    assert next(player for player in started["players"] if player["id"] == stale_id)["connected"] is False


def test_host_can_mark_active_player_away_and_reselect_card():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    third = app.test_client()
    _prime(host, "act-away-host@example.com")
    for client in (first, second, third):
        _prime(client)
    code = _create_team_room(host)
    for client, name in ((first, "Ada"), (second, "Ben"), (third, "Cal")):
        assert _post(
            client,
            f"/group-games/act-it-out/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200
    started = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    active_id = started["active_player_id"]

    assert _post(
        host,
        f"/api/group-games/act-it-out/rooms/{code}/players/{active_id}/away",
        json={},
    ).status_code == 200

    reselected = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert reselected["phase"] == "round"
    assert reselected["round_index"] == started["round_index"]
    assert reselected["active_player_id"] != active_id
    assert next(player for player in reselected["players"] if player["id"] == active_id)["away"] is True


def test_host_can_skip_bad_act_it_out_card_without_reveal_or_points():
    host = app.test_client()
    first = app.test_client()
    second = app.test_client()
    _prime(host, "skip-act-host@example.com")
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

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/skip", json={}).status_code == 200

    skipped = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert skipped["phase"] == "round"
    assert skipped["round_index"] == started["round_index"] + 1
    assert {team["id"]: team["score"] for team in skipped["teams"]} == {"gold": 0, "blue": 0}


def test_host_skip_draw_card_rolls_back_locked_guess_points():
    host = app.test_client()
    drawer = app.test_client()
    guesser = app.test_client()
    spare = app.test_client()
    _prime(host, "skip-draw-host@example.com")
    for client in (drawer, guesser, spare):
        _prime(client)
    code = _create_draw_room(host)
    for client, name in ((drawer, "Ada"), (guesser, "Ben"), (spare, "Cal")):
        assert _post(
            client,
            f"/group-games/draw-it/join/{code}",
            data={"csrf_token": CSRF, "player_name": name},
        ).status_code == 302

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/start", json={}).status_code == 200
    state = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    correct = state["viewer"]["secret_prompt"]["answer"]
    assert _post(guesser, f"/api/group-games/draw-it/rooms/{code}/guess", json={"choice": correct}).status_code == 200
    partial = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    players = {player["name"]: player for player in partial["players"]}
    assert players["Ben"]["score"] == 100

    assert _post(host, f"/api/group-games/draw-it/rooms/{code}/skip", json={}).status_code == 200

    skipped = host.get(f"/api/group-games/draw-it/rooms/{code}").get_json()
    players = {player["name"]: player for player in skipped["players"]}
    assert skipped["phase"] == "round"
    assert skipped["round_index"] == state["round_index"] + 1
    assert players["Ben"]["score"] == 0


def test_finished_act_it_out_can_play_again_with_same_players():
    from faithsparks.views import act_it_out

    host = app.test_client()
    player = app.test_client()
    _prime(host, "act-play-again@example.com")
    _prime(player)
    code = _create_team_room(host)
    assert _post(
        player,
        f"/group-games/act-it-out/join/{code}",
        data={"csrf_token": CSRF, "player_name": "Ada", "avatar_preset": "esther"},
    ).status_code == 302

    def force_finished(room):
        player = next(iter(room["players"].values()))
        player["score"] = 300
        player["away"] = True
        room["phase"] = "finished"
        room["last_result"] = {"outcome": "correct"}

    act_it_out._mutate_room(code, force_finished)

    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/play-again", json={}).status_code == 200
    room = act_it_out._get_room(code)
    assert room["phase"] == "lobby"
    assert room["round_index"] == 0
    assert len(room["rounds"]) == room["round_count"]
    assert room["round_results"] == []
    assert "last_result" not in room
    player = next(iter(room["players"].values()))
    assert player["name"] == "Ada"
    assert player["avatar_preset"] == "esther"
    assert player["score"] == 0
    assert player["away"] is False


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


@pytest.mark.parametrize("control_mode", ["couch", "team_auto"])
@pytest.mark.parametrize("game_mode", ["act", "draw", "clue", "guess"])
def test_complete_adaptive_family_game_journey_is_smooth(control_mode, game_mode, monkeypatch):
    """Exercise a complete controller-driven game, including replay, for every mode."""
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    controllers = {role: app.test_client() for role in (("couch",) if control_mode == "couch" else ("gold", "blue"))}
    public = app.test_client()
    _prime(host, f"journey-{control_mode}-{game_mode}@example.com")
    _prime(public)
    for client in controllers.values():
        _prime(client)
    created, code = _create_family_room(
        host,
        control_mode=control_mode,
        game_mode=game_mode,
        round_count="10",
    )
    assert created.status_code == 302
    with host.session_transaction() as sess:
        tokens = dict(sess["family_game_pairing_tokens"][code])
    for role_name, client in controllers.items():
        assert _post(client, f"/family-game-night/controller/{code}", data={"csrf_token": CSRF, "pairing_token": tokens[role_name]}).status_code == 302
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/start", json={}).status_code == 200

    expected_points = 0
    for round_index in range(10):
        states = {role_name: client.get(f"/api/group-games/act-it-out/rooms/{code}").get_json() for role_name, client in controllers.items()}
        controller_role, state = next((role_name, item) for role_name, item in states.items() if item["viewer"]["can_control"])
        controller = controllers[controller_role]
        shared_host = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
        assert shared_host["viewer"]["can_control"] is False
        assert "secret_prompt" not in shared_host["viewer"]
        assert state["round_index"] == round_index
        assert state["round"]["mode"] == game_mode
        assert public.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["round"]["answer"] is None

        if state["phase"] == "prepare":
            assert state["viewer"]["secret_prompt"]["answer"]
            assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/ready", json={}).status_code == 200
        elif game_mode == "guess" and control_mode == "couch":
            assert "secret_prompt" not in state["viewer"]
            assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/show-answer", json={}).status_code == 200
            assert controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()["viewer"]["secret_prompt"]["answer"]
        elif game_mode == "guess":
            assert state["viewer"]["secret_prompt"]["answer"]

        if game_mode == "draw":
            drawing_state = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
            assert drawing_state["viewer"]["can_draw"] is True
            assert _post(
                controller,
                f"/api/group-games/act-it-out/rooms/{code}/drawing",
                json={"drawing": PNG_1X1},
            ).status_code == 200

        if control_mode == "team_auto":
            post_ready_states = {
                role_name: client.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
                for role_name, client in controllers.items()
            }
            judge_role, judge_state = next(
                (role_name, item)
                for role_name, item in post_ready_states.items()
                if item["viewer"]["can_judge"]
            )
            controller = controllers[judge_role]
            assert judge_state["viewer"]["controller_role"] != judge_state["active_team_id"]

        action = "pass" if round_index % 3 == 1 else "correct"
        if action == "correct":
            expected_points += 100
        assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/{action}", json={}).status_code == 200
        revealed = controller.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
        assert revealed["phase"] == "reveal"
        assert revealed["round"]["answer"]
        assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/{action}", json={}).status_code == 409
        assert _post(controller, f"/api/group-games/act-it-out/rooms/{code}/next", json={}).status_code == 200

    finished = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert finished["phase"] == "finished"
    assert sum(team["score"] for team in finished["teams"]) == expected_points
    assert len(finished["players"]) == 2
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/play-again", json={}).status_code == 200
    replay = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert replay["phase"] == "lobby"
    assert replay["round_index"] == 0
    assert all(team["score"] == 0 for team in replay["teams"])


@pytest.mark.parametrize(
    ("pace", "seconds", "clue_interval"),
    [("relaxed", 75, None), ("standard", 45, 8), ("fast", 30, 6)],
)
def test_family_pacing_is_saved_with_accessible_timer_rules(pace, seconds, clue_interval, monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    _prime(host, f"pace-{pace}@example.com")

    created, code = _create_family_room(host, pace=pace)

    assert created.status_code == 302
    room = act_it_out._get_room(code)
    assert room["pace"] == pace
    assert room["timer_seconds"] == seconds
    assert room["clue_interval_seconds"] == clue_interval


def test_younger_family_rounds_never_exceed_age_seven():
    from faithsparks.services.game_content import build_family_rounds, family_prompts

    rounds, _diagnostics = build_family_rounds(
        "younger-twenty-round-game",
        count=20,
        categories={"bible_stories", "jesus_miracles", "parables", "people", "worship_church", "everyday_faith"},
        difficulty_values={"easy"},
        game_mode="guess",
        free_sampler=False,
        max_age_floor=7,
    )
    ages = {item["id"]: item["age_floor"] for item in family_prompts()}

    assert len(rounds) == 20
    assert len({item["answer"].casefold() for item in rounds}) == 20
    assert all(ages[item["prompt_id"]] <= 7 for item in rounds)


def test_family_mobile_markup_prioritizes_the_task_and_limits_live_announcements():
    css = open("static/act_it_out.css", encoding="utf-8").read()
    script = open("static/act_it_out.js", encoding="utf-8").read()
    room_template = open("templates/act_it_out_room.html", encoding="utf-8").read()
    setup_template = open("templates/family_game_night_setup.html", encoding="utf-8").read()

    assert '.act-room-body[data-role="player"] .game-layout .score-rail' in css
    assert "order: initial;" in css
    assert ".drawing-controller-layout .score-rail" in css
    assert 'Private prompt for ${escapeHTML(state.active_team_name || "this turn")}' in script
    assert 'id="app" class="game-shell" aria-live=' not in room_template
    assert 'name="pace" value="relaxed"' in setup_template


def test_family_game_cooperative_goal_and_scripture_summary(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    _prime(host, "cooperative-family@example.com")
    created, code = _create_family_room(host, scoring_style="cooperative")

    assert created.status_code == 302
    room = act_it_out._get_room(code)
    assert room["scoring_style"] == "cooperative"
    assert room["family_goal"] == 750
    sample = next(item for item in room["rounds"] if item.get("reference"))

    def finish(current):
        current["phase"] = "finished"
        current["round_results"] = [{
            "answer": sample["answer"], "reference": sample["reference"], "book": sample["book"],
            "mode": sample["mode"], "outcome": "correct", "points": 100,
        }]

    act_it_out._mutate_room(code, finish)
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert state["scoring_style"] == "cooperative"
    assert state["family_goal"] == 750
    assert state["learning_summary"] == [{
        "answer": sample["answer"], "reference": sample["reference"], "book": sample["book"],
    }]


def test_family_setup_offers_quick_presets_and_shared_goal():
    template = open("templates/family_game_night_setup.html", encoding="utf-8").read()
    script = open("static/act_it_out.js", encoding="utf-8").read()

    assert 'data-family-preset="young"' in template
    assert 'name="scoring_style" value="cooperative"' in template
    assert "Ready to begin?" in script
    assert "Tonight in Scripture" in script


def test_host_can_favorite_or_hide_revealed_family_prompt(monkeypatch):
    from faithsparks.views import act_it_out

    monkeypatch.setattr(act_it_out, "get_user_doc", lambda _email: {"purchases": {"family_game_night": True}})
    host = app.test_client()
    outsider = app.test_client()
    _prime(host, "prompt-preference@example.com")
    _prime(outsider)
    created, code = _create_family_room(host)
    assert created.status_code == 302
    prompt_id = act_it_out._get_room(code)["rounds"][0]["prompt_id"]

    def reveal(current):
        current["phase"] = "reveal"

    act_it_out._mutate_room(code, reveal)
    state = host.get(f"/api/group-games/act-it-out/rooms/{code}").get_json()
    assert state["round"]["prompt_id"] == prompt_id
    assert _post(outsider, f"/api/group-games/act-it-out/rooms/{code}/prompt-preference", json={"preference": "hide"}).status_code == 403
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/prompt-preference", json={"preference": "favorite"}).status_code == 200
    assert _post(host, f"/api/group-games/act-it-out/rooms/{code}/prompt-preference", json={"preference": "hide"}).status_code == 200
    with host.session_transaction() as sess:
        assert prompt_id in sess["family_game_night_hidden_prompt_ids"]
        assert prompt_id not in sess["family_game_night_favorite_prompt_ids"]

    second, second_code = _create_family_room(host)
    assert second.status_code == 302
    assert prompt_id not in {item["prompt_id"] for item in act_it_out._get_room(second_code)["rounds"]}
