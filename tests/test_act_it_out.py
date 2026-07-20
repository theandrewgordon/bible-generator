import re
from types import SimpleNamespace
from unittest import mock

from flask import session

from app import app
from faithsparks.services.rate_limit import reset_memory_limits


CSRF = "test-csrf-token"
PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
JPEG_STUB = "data:image/jpeg;base64,/9j/AA=="


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
    assert b'id="fgn-code-form"' in page.data
    assert b"noindex" not in page.data


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
            difficulty="younger",
            categories=["bible_stories", "parables"],
        )
        assert created.status_code == 302, mode
        room = act_it_out._get_room(code)
        expected_modes = {"act", "draw", "clue", "guess"} if mode == "mixed" else {mode}
        assert {round_data["mode"] for round_data in room["rounds"]} == expected_modes
        assert {round_data["theme"] for round_data in room["rounds"]} <= {"Bible Stories", "Parables"}
        assert all(
            next(prompt for prompt in act_it_out.PROMPTS if prompt["id"] == round_data["prompt_id"])["difficulty"] == "easy"
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
    assert kwargs["metadata"]["entitlement_id"] == "family_game_night"
    assert kwargs["metadata"]["email"] == "owner@example.com"
    metric.assert_called_once_with("family_game_night_checkout_started", "one_time")


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
        Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=event)),
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
    metric.assert_called_once_with("family_game_night_checkout_fulfilled", "family_game_night")


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
