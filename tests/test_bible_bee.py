import re

import pytest

from app import app
from faithsparks.services import bible_bee_content
from faithsparks.services.rate_limit import reset_memory_limits


CSRF = "test-csrf-token"


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

    correct = bible_bee._get_room(code)["questions"][0]["correct"]
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


@pytest.mark.parametrize(
    "deck_id",
    [
        "family-favorites",
        "courage-trust",
        "gospel-foundations",
        "wisdom-obedience",
        "fruit-spirit",
        "psalms-comfort",
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
