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
        "words-of-jesus",
        "prayer-praise",
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


def test_finish_the_verse_distractors_are_grammatical_near_misses():
    answer = "is born to help in time of need."
    distractors = bible_bee_content._finish_distractors(answer, [])

    assert distractors[:3] == [
        "is called to help in time of need.",
        "is ready to help in time of need.",
        "is sent to help in time of need.",
    ]
    assert all(choice.startswith("is ") for choice in distractors[:4])


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
