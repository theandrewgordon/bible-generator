"""Family Bible Bee: a small, room-code Scripture memory party game."""

from __future__ import annotations

import io
import re
import secrets
import threading
import time
from copy import deepcopy

import qrcode
from flask import Blueprint, abort, jsonify, redirect, render_template, request, send_file, session, url_for
from google.cloud import firestore as google_firestore

from faithsparks.services.firestore import db
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.bible_bee_content import (
    DECKS,
    DIFFICULTIES,
    GAME_STYLES,
    TRANSLATIONS,
    build_questions,
    deck_options,
    load_passages,
    translation_options,
)
from faithsparks.util.request_utils import get_client_ip


bp = Blueprint("bible_bee", __name__)

ROOM_TTL_SECONDS = 6 * 60 * 60
FINISHED_ROOM_TTL_SECONDS = 30 * 60
REVEAL_SECONDS = 10
REVEAL_SECOND_OPTIONS = {5, 10, 15}
MAX_AVATAR_DATA_LENGTH = 60_000
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'-]{0,17}$")
BLOCKED_NAMES = {"admin", "host", "moderator", "faithsparks"}
AVATAR_DATA_RE = re.compile(r"^data:image/jpeg;base64,[A-Za-z0-9+/=]+$")

_local_rooms: dict[str, dict] = {}
_local_lock = threading.RLock()


def _room_ref(code: str):
    client = db()
    return client.collection("family_bible_bee_rooms").document(code) if client else None


def _get_room(code: str) -> dict | None:
    code = code.upper()
    ref = _room_ref(code)
    if ref:
        snap = ref.get()
        room = snap.to_dict() if snap.exists else None
    else:
        with _local_lock:
            room = deepcopy(_local_rooms.get(code))
    now = time.time()
    expired = room and (
        now >= float(room.get("expires_at", float("inf")))
        or now - float(room.get("updated_at", 0)) > ROOM_TTL_SECONDS
    )
    if expired:
        _delete_room(code)
        return None
    return room


def _set_room(code: str, room: dict) -> None:
    room["updated_at"] = time.time()
    ref = _room_ref(code)
    if ref:
        ref.set(room)
    else:
        with _local_lock:
            _local_rooms[code] = deepcopy(room)


def _mutate_room(code: str, callback):
    """Update a room atomically in Firestore and under a lock in local dev."""
    ref = _room_ref(code)
    if ref:
        transaction = db().transaction()

        @google_firestore.transactional
        def update_in_transaction(txn):
            snap = ref.get(transaction=txn)
            if not snap.exists:
                return None
            room = snap.to_dict()
            result = callback(room)
            room["updated_at"] = time.time()
            txn.set(ref, room)
            return result, room

        return update_in_transaction(transaction)

    with _local_lock:
        room = _local_rooms.get(code)
        if room is None:
            return None
        result = callback(room)
        room["updated_at"] = time.time()
        return result, deepcopy(room)


def _delete_room(code: str) -> None:
    ref = _room_ref(code)
    if ref:
        ref.delete()
    else:
        with _local_lock:
            _local_rooms.pop(code, None)


def _new_code() -> str:
    for _ in range(30):
        code = "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(4))
        if not _get_room(code):
            return code
    raise RuntimeError("Could not allocate a Bible Bee room code")


def _player_session_key(code: str) -> str:
    return f"bible_bee_player_{code}"


def _host_email() -> str:
    return str(session.get("user_email") or "").strip().lower()


def _is_host(code: str, room: dict | None = None) -> bool:
    if code in session.get("bible_bee_host_rooms", []):
        return True
    room = room or _get_room(code)
    return bool(room and _host_email() and room.get("host_email") == _host_email())


def _player_id(code: str) -> str | None:
    return session.get(_player_session_key(code))


def _current_question(room: dict) -> dict | None:
    index = int(room.get("question_index", 0))
    questions = room.get("questions", [])
    return questions[index] if 0 <= index < len(questions) else None


def _answer_choice(answer) -> int | None:
    if isinstance(answer, dict):
        answer = answer.get("choice")
    try:
        return int(answer)
    except (TypeError, ValueError):
        return None


def _eligible_player_ids(room: dict) -> set[str]:
    return {
        player_id
        for player_id, player in room.get("players", {}).items()
        if not player.get("away", False)
    }


def _all_eligible_players_answered(room: dict) -> bool:
    eligible = _eligible_player_ids(room)
    return bool(eligible and eligible.issubset(room.get("answers", {}).keys()))


def _reveal_seconds(room: dict) -> int:
    seconds = int(room.get("reveal_seconds", REVEAL_SECONDS))
    return seconds if seconds in REVEAL_SECOND_OPTIONS else REVEAL_SECONDS


def _append_bonus_review_question(room: dict) -> bool:
    if room.get("bonus_added"):
        return False
    room["bonus_added"] = True
    missed_results = [
        result
        for result in room.get("round_results", [])
        if int(result.get("missed", 0)) > 0 and not result.get("bonus")
    ]
    if not missed_results:
        return False
    target = max(missed_results, key=lambda result: int(result.get("missed", 0)))
    original = next(
        (
            question
            for question in room.get("questions", [])
            if question.get("passage_id") == target.get("passage_id")
        ),
        None,
    )
    if not original:
        return False
    bonus = deepcopy(original)
    bonus["id"] = f"{original['id']}-bonus-review"
    bonus["label"] = f"Bonus Review · {original['label']}"
    bonus["bonus"] = True
    room["questions"].append(bonus)
    return True


def _finish_room(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    room["phase"] = "finished"
    room["finished_at"] = now
    room["expires_at"] = now + FINISHED_ROOM_TTL_SECONDS
    room.pop("resume_phase", None)
    room.pop("reveal_deadline", None)
    room.pop("paused_reveal_seconds", None)
    room["review_summary"] = _build_review_summary(room)


def _advance_current_question(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    next_index = int(room.get("question_index", 0)) + 1
    room.pop("reveal_deadline", None)
    if next_index >= len(room.get("questions", [])):
        if not _append_bonus_review_question(room):
            _finish_room(room, now)
            return
    room["question_index"] = next_index
    room["answers"] = {}
    room["phase"] = "question"
    room["question_started_at"] = now


def _reveal_current_question(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    question = _current_question(room)
    if room.get("phase") != "question" or not question:
        raise ValueError("This round cannot be revealed.")

    missed = 0
    correct_players = []
    points_by_player = {}
    score_config = DIFFICULTIES.get(room.get("difficulty"), DIFFICULTIES["family"])
    eligible_player_ids = _eligible_player_ids(room)
    correct_answerers = sorted(
        (
            (player_id, answer)
            for player_id, answer in room.get("answers", {}).items()
            if player_id in eligible_player_ids and _answer_choice(answer) == question["correct"]
        ),
        key=lambda item: float(item[1].get("answered_at", 0)),
    )
    speed_bonus = {
        player_id: max(5, 50 - (rank * 10))
        for rank, (player_id, _answer) in enumerate(correct_answerers)
    }
    for player_id, player in room.get("players", {}).items():
        if player_id not in eligible_player_ids:
            continue
        answer = room.get("answers", {}).get(player_id)
        if _answer_choice(answer) == question["correct"]:
            points = int(score_config["correct"]) + speed_bonus.get(player_id, 0)
            player["score"] = int(player.get("score", 0)) + points
            correct_players.append(player_id)
            points_by_player[player_id] = points
        else:
            missed += 1
            if player_id in room.get("answers", {}):
                points = int(score_config["participation"])
                player["score"] = int(player.get("score", 0)) + points
                points_by_player[player_id] = points
    if missed:
        room.setdefault("review", []).append(
            {"reference": question["reference"], "missed": missed, "mode": question["label"]}
        )
    room.setdefault("round_results", []).append(
        {
            "reference": question["reference"],
            "passage_id": question.get("passage_id"),
            "mode": question["label"],
            "missed": missed,
            "correct": len(correct_players),
            "correct_players": correct_players,
            "points_by_player": points_by_player,
            "bonus": bool(question.get("bonus")),
        }
    )
    if int(room.get("question_index", 0)) + 1 >= len(room.get("questions", [])):
        _append_bonus_review_question(room)
    room["phase"] = "reveal"
    room["reveal_deadline"] = now + _reveal_seconds(room)


def _build_review_summary(room: dict) -> dict:
    results = room.get("round_results", [])
    by_reference: dict[str, dict] = {}
    for result in results:
        entry = by_reference.setdefault(
            result["reference"],
            {"reference": result["reference"], "missed": 0, "correct": 0, "modes": set()},
        )
        entry["missed"] += int(result.get("missed", 0))
        entry["correct"] += int(result.get("correct", 0))
        entry["modes"].add(result.get("mode", "Practice"))

    rows = [
        {**entry, "modes": sorted(entry["modes"])}
        for entry in by_reference.values()
    ]
    review_tomorrow = sorted(
        [item for item in rows if item["missed"] > 0],
        key=lambda item: (-item["missed"], item["reference"]),
    )[:3]
    strengths = sorted(
        [item for item in rows if item["correct"] and not item["missed"]],
        key=lambda item: (-item["correct"], item["reference"]),
    )[:3]
    player_feedback = []
    for player_id, player in room.get("players", {}).items():
        correct = sum(player_id in result.get("correct_players", []) for result in results)
        badge = "Reference Racer" if any(
            player_id in result.get("correct_players", []) and result.get("mode") == "Reference Race"
            for result in results
        ) else "Verse Builder"
        if correct == 0:
            badge = "Faithful Reviewer"
        player_feedback.append(
            {
                "id": player_id,
                "name": player["name"],
                "correct": correct,
                "total": len(results),
                "badge": badge,
                "message": "Keep practicing—faithful review builds strong memory."
                if correct < max(1, len(results) // 2)
                else "Wonderful remembering and careful listening.",
            }
        )
    return {
        "review_tomorrow": review_tomorrow,
        "strengths": strengths,
        "players": player_feedback,
        "suggested_deck": "Courage & Trust" if room.get("deck_id") != "courage-trust" else "Family Favorites",
    }


def _active_rooms_for_host(email: str) -> list[dict]:
    if not email:
        return []
    client = db()
    if client:
        docs = (
            client.collection("family_bible_bee_rooms")
            .where("host_email", "==", email)
            .stream()
        )
        rooms = [(doc.id, doc.to_dict()) for doc in docs]
    else:
        with _local_lock:
            rooms = [(code, deepcopy(room)) for code, room in _local_rooms.items()]
    cutoff = time.time() - ROOM_TTL_SECONDS
    return sorted(
        [
            {
                "code": code,
                "phase": room.get("phase", "lobby"),
                "players": len(room.get("players", {})),
                "deck_name": room.get("deck_name", "Bible Bee"),
            }
            for code, room in rooms
            if (
                room.get("host_email") == email
                and float(room.get("updated_at", 0)) >= cutoff
                and time.time() < float(room.get("expires_at", float("inf")))
            )
        ],
        key=lambda item: item["code"],
    )


def _public_room(room: dict, code: str) -> dict:
    question = _current_question(room)
    phase = room.get("phase", "lobby")
    public_question = None
    visible_phase = room.get("resume_phase") if phase == "paused" else phase
    if question and visible_phase in {"question", "reveal"}:
        public_question = {
            "label": question["label"],
            "mode": question["mode"],
            "prompt": question["prompt"],
            "choices": question["choices"],
            "reference": question["reference"] if visible_phase == "reveal" else None,
            "correct": question["correct"] if visible_phase == "reveal" else None,
            "answer_text": question.get("answer_text") if visible_phase == "reveal" else None,
        }

    now = time.time()
    players = sorted(
        [
            {
                "id": player_id,
                "name": player["name"],
                "score": int(player.get("score", 0)),
                "connected": now - float(player.get("last_seen", player.get("joined_at", 0))) < 40,
                "away": bool(player.get("away", False)),
                "avatar": player.get("avatar"),
            }
            for player_id, player in room.get("players", {}).items()
        ],
        key=lambda player: (-player["score"], player["name"].lower()),
    )
    answers = room.get("answers", {})
    return {
        "code": code,
        "phase": phase,
        "deck_name": room.get("deck_name"),
        "translation": room.get("translation"),
        "game_style": room.get("game_style_name", "Classic Mix"),
        "difficulty": room.get("difficulty_name", "Family"),
        "question_index": int(room.get("question_index", 0)),
        "question_total": len(room.get("questions", [])),
        "question": public_question,
        "players": players,
        "answered_player_ids": list(answers),
        "review": room.get("review", []),
        "review_summary": room.get("review_summary", {}),
        "reveal_deadline": room.get("reveal_deadline"),
        "reveal_seconds": _reveal_seconds(room),
        "expires_at": room.get("expires_at"),
    }


def _require_room(code: str) -> dict:
    room = _get_room(code)
    if not room:
        abort(404)
    return room


@bp.get("/family-bible-bee")
def home():
    return _render_home()


def _render_home(setup_error: str | None = None, status: int = 200):
    email = _host_email()
    response = render_template(
        "bible_bee_home.html",
        decks=deck_options(),
        translations=translation_options(),
        game_styles=GAME_STYLES,
        difficulties=DIFFICULTIES,
        active_rooms=_active_rooms_for_host(email),
        is_host_signed_in=bool(email),
        setup_error=setup_error,
        noindex=True,
    )
    return (response, status) if status != 200 else response


@bp.post("/family-bible-bee/create")
def create_room():
    email = _host_email()
    if not email:
        return redirect(url_for("google.login", next=url_for("bible_bee.home")))
    rate = check_rate_limit(
        "bible-bee-create",
        email or get_client_ip(),
        limit=8,
        window_seconds=60 * 60,
    )
    if not rate.allowed:
        return "Too many rooms created. Please try again later.", 429
    deck_id = request.form.get("deck_id") or "family-favorites"
    deck = DECKS.get(deck_id) or DECKS["family-favorites"]
    version = (request.form.get("version") or "kjv").lower()
    style = request.form.get("game_style") or "classic_mix"
    difficulty = request.form.get("difficulty") or "family"
    try:
        reveal_seconds = int(request.form.get("reveal_seconds", REVEAL_SECONDS))
    except (TypeError, ValueError):
        reveal_seconds = REVEAL_SECONDS
    if reveal_seconds not in REVEAL_SECOND_OPTIONS:
        reveal_seconds = REVEAL_SECONDS
    if style not in GAME_STYLES:
        style = "classic_mix"
    if difficulty not in DIFFICULTIES:
        difficulty = "family"
    try:
        round_count = int(request.form.get("round_count", 5))
    except (TypeError, ValueError):
        round_count = 5
    round_count = round_count if round_count in {3, 5, 10} else 5
    code = _new_code()
    try:
        passages = load_passages(deck_id, version, round_count)
        questions = build_questions(passages, style, round_count, seed=code)
    except ValueError as exc:
        return _render_home(str(exc), status=503)

    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "deck_id": deck["id"],
        "deck_name": deck["title"],
        "translation": TRANSLATIONS[version]["code"],
        "translation_id": version,
        "game_style": style,
        "game_style_name": GAME_STYLES[style]["name"],
        "difficulty": difficulty,
        "difficulty_name": DIFFICULTIES[difficulty]["name"],
        "reveal_seconds": reveal_seconds,
        "passages": passages,
        "questions": questions,
        "question_index": 0,
        "players": {},
        "answers": {},
        "review": [],
        "round_results": [],
        "review_summary": {},
    }
    _set_room(code, room)
    host_rooms = list(session.get("bible_bee_host_rooms", []))
    if code not in host_rooms:
        host_rooms.append(code)
    session["bible_bee_host_rooms"] = host_rooms[-8:]
    return redirect(url_for("bible_bee.host_room", code=code))


@bp.get("/family-bible-bee/host/<code>")
def host_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if not _is_host(code, room):
        abort(403)
    return render_template("bible_bee_room.html", code=code, role="host", noindex=True)


@bp.get("/family-bible-bee/display/<code>")
def display_room(code: str):
    code = code.upper()
    _require_room(code)
    return render_template("bible_bee_room.html", code=code, role="display", noindex=True)


@bp.get("/family-bible-bee/room/<code>/qr")
def room_qr(code: str):
    code = code.upper()
    _require_room(code)
    join_url = request.url_root.rstrip("/") + url_for("bible_bee.join_room", code=code)
    image = qrcode.make(join_url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    response = send_file(output, mimetype="image/png", download_name=f"bible-bee-{code}.png")
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.route("/family-bible-bee/join/<code>", methods=["GET", "POST"])
def join_room(code: str):
    code = code.upper()
    room = _require_room(code)
    existing_id = _player_id(code)
    if request.method == "POST":
        rate = check_rate_limit(
            "bible-bee-join",
            get_client_ip(),
            limit=20,
            window_seconds=10 * 60,
        )
        if not rate.allowed:
            return render_template(
                "bible_bee_join.html",
                code=code,
                error="Too many join attempts. Please wait a few minutes.",
                noindex=True,
            ), 429
        name = " ".join((request.form.get("player_name") or "").strip().split())
        if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
            return render_template(
                "bible_bee_join.html",
                code=code,
                error="Choose a simple family-friendly name using letters or numbers.",
                noindex=True,
            ), 400
        if room.get("phase") != "lobby":
            return render_template(
                "bible_bee_join.html", code=code, error="This game has already started.", noindex=True
            ), 409
        player_id = existing_id or secrets.token_urlsafe(8)
        avatar = (request.form.get("avatar_data") or "").strip()
        if avatar and (
            len(avatar) > MAX_AVATAR_DATA_LENGTH
            or not AVATAR_DATA_RE.fullmatch(avatar)
        ):
            return render_template(
                "bible_bee_join.html",
                code=code,
                error="That picture could not be prepared. Try another selfie or join without one.",
                noindex=True,
            ), 400

        def add_player(current):
            if len(current.get("players", {})) >= 8 and player_id not in current.get("players", {}):
                raise ValueError("This room already has eight players.")
            existing = current.get("players", {}).get(player_id, {})
            current.setdefault("players", {})[player_id] = {
                "name": name,
                "score": int(existing.get("score", 0)),
                "joined_at": time.time(),
                "last_seen": time.time(),
                "away": False,
                "avatar": avatar or existing.get("avatar"),
            }

        try:
            _mutate_room(code, add_player)
        except ValueError as exc:
            return render_template("bible_bee_join.html", code=code, error=str(exc), noindex=True), 409
        session[_player_session_key(code)] = player_id
        return redirect(url_for("bible_bee.player_room", code=code))
    if existing_id and existing_id in room.get("players", {}):
        return redirect(url_for("bible_bee.player_room", code=code))
    return render_template("bible_bee_join.html", code=code, noindex=True)


@bp.get("/family-bible-bee/play/<code>")
def player_room(code: str):
    code = code.upper()
    room = _require_room(code)
    player_id = _player_id(code)
    if not player_id or player_id not in room.get("players", {}):
        return redirect(url_for("bible_bee.join_room", code=code))
    return render_template("bible_bee_room.html", code=code, role="player", noindex=True)


@bp.get("/api/family-bible-bee/rooms/<code>")
def room_state(code: str):
    code = code.upper()
    room = _require_room(code)
    deadline = room.get("reveal_deadline")
    if room.get("phase") == "reveal" and deadline and time.time() >= float(deadline):
        now = time.time()

        def auto_advance(current):
            current_deadline = current.get("reveal_deadline")
            if current.get("phase") == "reveal" and current_deadline and now >= float(current_deadline):
                _advance_current_question(current, now)

        result = _mutate_room(code, auto_advance)
        if result is None:
            abort(404)
        room = result[1]
    state = _public_room(room, code)
    player_id = _player_id(code)
    state["viewer"] = {
        "is_host": _is_host(code, room),
        "player_id": player_id,
        "has_answered": bool(player_id and player_id in room.get("answers", {})),
    }
    visible_phase = room.get("resume_phase") if room.get("phase") == "paused" else room.get("phase")
    if visible_phase == "reveal" and player_id:
        answer = room.get("answers", {}).get(player_id)
        question = _current_question(room)
        choice = _answer_choice(answer)
        state["viewer"]["answer"] = choice
        state["viewer"]["correct"] = bool(question and choice == question["correct"])
        latest_result = (room.get("round_results") or [{}])[-1]
        state["viewer"]["round_points"] = int(
            latest_result.get("points_by_player", {}).get(player_id, 0)
        )
    return jsonify(state)


@bp.post("/api/family-bible-bee/rooms/<code>/start")
def start_game(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def start(room):
        if not room.get("players"):
            raise ValueError("Invite at least one player before starting.")
        room["phase"] = "question"
        room["question_index"] = 0
        room["answers"] = {}
        room["question_started_at"] = time.time()

    try:
        result = _mutate_room(code, start)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/answer")
def answer_question(code: str):
    code = code.upper()
    player_id = _player_id(code)
    if not player_id:
        abort(403)
    payload = request.get_json(silent=True) or {}
    try:
        choice = int(payload.get("choice"))
    except (TypeError, ValueError):
        return jsonify({"error": "Choose an answer first."}), 400

    def answer(room):
        question = _current_question(room)
        if room.get("phase") != "question" or not question:
            raise ValueError("Answers are closed for this round.")
        if player_id not in room.get("players", {}):
            raise PermissionError
        if room["players"][player_id].get("away"):
            raise ValueError("The host marked you away. Ask them to bring you back first.")
        if choice < 0 or choice >= len(question["choices"]):
            raise ValueError("That answer is not available.")
        room.setdefault("answers", {}).setdefault(
            player_id,
            {"choice": choice, "answered_at": time.time()},
        )
        if _all_eligible_players_answered(room):
            _reveal_current_question(room)

    try:
        result = _mutate_room(code, answer)
    except PermissionError:
        abort(403)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/heartbeat")
def player_heartbeat(code: str):
    code = code.upper()
    player_id = _player_id(code)
    if not player_id:
        abort(403)

    def heartbeat(room):
        player = room.get("players", {}).get(player_id)
        if not player:
            raise PermissionError
        player["last_seen"] = time.time()

    try:
        result = _mutate_room(code, heartbeat)
    except PermissionError:
        abort(403)
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/reveal")
def reveal_answer(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def reveal(room):
        _reveal_current_question(room)

    try:
        result = _mutate_room(code, reveal)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/next")
def next_question(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def advance(room):
        if room.get("phase") != "reveal":
            raise ValueError("Reveal this answer before continuing.")
        _advance_current_question(room)

    try:
        result = _mutate_room(code, advance)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/pause")
def toggle_pause(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def pause(current):
        if current.get("phase") == "paused":
            current["phase"] = current.pop("resume_phase", "question")
            if current["phase"] == "reveal":
                remaining = float(current.pop("paused_reveal_seconds", _reveal_seconds(current)))
                current["reveal_deadline"] = time.time() + max(1, remaining)
            elif _all_eligible_players_answered(current):
                _reveal_current_question(current)
        elif current.get("phase") in {"question", "reveal"}:
            current["resume_phase"] = current["phase"]
            if current["phase"] == "reveal":
                deadline = float(current.pop("reveal_deadline", time.time() + _reveal_seconds(current)))
                current["paused_reveal_seconds"] = max(1, deadline - time.time())
            current["phase"] = "paused"
        else:
            raise ValueError("This game cannot be paused right now.")

    try:
        result = _mutate_room(code, pause)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/skip")
def skip_question(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def skip(current):
        if current.get("phase") not in {"question", "reveal"}:
            raise ValueError("This question cannot be skipped right now.")
        question = _current_question(current)
        if current.get("phase") == "question" and question:
            current.setdefault("round_results", []).append(
                {
                    "reference": question["reference"],
                    "passage_id": question.get("passage_id"),
                    "mode": question["label"],
                    "missed": len(current.get("players", {})),
                    "correct": 0,
                    "correct_players": [],
                    "skipped": True,
                }
            )
        _advance_current_question(current)

    try:
        result = _mutate_room(code, skip)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/end")
def end_game(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def finish(current):
        if current.get("phase") == "lobby":
            raise ValueError("Start the game before ending it early.")
        _finish_room(current)

    try:
        result = _mutate_room(code, finish)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/players/<player_id>/score")
def adjust_score(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)
    payload = request.get_json(silent=True) or {}
    try:
        delta = int(payload.get("delta"))
    except (TypeError, ValueError):
        return jsonify({"error": "Choose a valid score adjustment."}), 400
    if delta not in {-50, 50}:
        return jsonify({"error": "Score adjustments use 50-point steps."}), 400

    def adjust(current):
        player = current.get("players", {}).get(player_id)
        if not player:
            raise ValueError("That player is no longer in the room.")
        player["score"] = max(0, int(player.get("score", 0)) + delta)

    try:
        result = _mutate_room(code, adjust)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/players/<player_id>/away")
def toggle_player_away(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def toggle(current):
        visible_phase = (
            current.get("resume_phase")
            if current.get("phase") == "paused"
            else current.get("phase")
        )
        if visible_phase not in {"lobby", "question"}:
            raise ValueError("Away status can be changed while waiting for answers.")
        player = current.get("players", {}).get(player_id)
        if not player:
            raise ValueError("That player is no longer in the room.")
        player["away"] = not bool(player.get("away", False))
        if current.get("phase") == "question" and _all_eligible_players_answered(current):
            _reveal_current_question(current)

    try:
        result = _mutate_room(code, toggle)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/players/<player_id>/remove")
def remove_player(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def remove(current):
        if current.get("phase") != "lobby":
            raise ValueError("Players can only be removed before the game starts.")
        current.get("players", {}).pop(player_id, None)
        current.get("answers", {}).pop(player_id, None)

    try:
        result = _mutate_room(code, remove)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/close")
def close_room(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)
    _delete_room(code)
    host_rooms = [item for item in session.get("bible_bee_host_rooms", []) if item != code]
    session["bible_bee_host_rooms"] = host_rooms
    return jsonify({"ok": True, "redirect": url_for("bible_bee.home")})
