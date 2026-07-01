"""Family Bible Bee: a small, room-code Scripture memory party game."""

from __future__ import annotations

import io
import random
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
from faithsparks.util.request_utils import get_client_ip


bp = Blueprint("bible_bee", __name__)

ROOM_TTL_SECONDS = 6 * 60 * 60
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'-]{0,17}$")
BLOCKED_NAMES = {"admin", "host", "moderator", "faithsparks"}

# A compact public-domain starter deck. Licensed translations can be added as
# additional decks without changing the room or scoring model.
FAMILY_FAVORITES_DECK = {
    "id": "family-favorites-kjv",
    "name": "Family Favorites",
    "translation": "KJV",
    "questions": [
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "For God so loved the world, that he gave his only begotten Son…",
            "choices": [
                "that whosoever believeth in him should not perish, but have everlasting life.",
                "that every nation might walk in peace and truth.",
                "that his children should never know sorrow.",
                "that the whole earth might sing of his goodness.",
            ],
            "correct": 0,
            "reference": "John 3:16",
        },
        {
            "mode": "reference",
            "label": "Reference Race",
            "prompt": "Thy word have I hid in mine heart, that I might not sin against thee.",
            "choices": ["Psalm 119:11", "Proverbs 3:5", "Joshua 1:9", "Romans 12:2"],
            "correct": 0,
            "reference": "Psalm 119:11",
        },
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "Trust in the LORD with all thine heart…",
            "choices": [
                "and lean not unto thine own understanding.",
                "for his mercy endureth for ever.",
                "and he shall give thee rest.",
                "and walk always in the ancient paths.",
            ],
            "correct": 0,
            "reference": "Proverbs 3:5",
        },
        {
            "mode": "reference",
            "label": "Reference Race",
            "prompt": "I can do all things through Christ which strengtheneth me.",
            "choices": ["Philippians 4:13", "Romans 8:28", "Ephesians 6:10", "James 1:5"],
            "correct": 0,
            "reference": "Philippians 4:13",
        },
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "Be strong and of a good courage; be not afraid…",
            "choices": [
                "for the LORD thy God is with thee whithersoever thou goest.",
                "for wisdom is better than rubies.",
                "and let thy heart keep my commandments.",
                "because the battle belongeth unto the strong.",
            ],
            "correct": 0,
            "reference": "Joshua 1:9",
        },
    ],
}

COURAGE_DECK = {
    "id": "courage-trust-kjv",
    "name": "Courage & Trust",
    "translation": "KJV",
    "questions": [
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "What time I am afraid…",
            "choices": [
                "I will trust in thee.",
                "I will remember thy works.",
                "I will call upon the elders.",
                "I will wait until the morning.",
            ],
            "correct": 0,
            "reference": "Psalm 56:3",
        },
        {
            "mode": "reference",
            "label": "Reference Race",
            "prompt": "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.",
            "choices": ["2 Timothy 1:7", "Joshua 1:9", "Psalm 27:1", "Romans 8:28"],
            "correct": 0,
            "reference": "2 Timothy 1:7",
        },
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "The LORD is my light and my salvation; whom shall I fear?…",
            "choices": [
                "the LORD is the strength of my life; of whom shall I be afraid?",
                "his truth shall be thy shield and buckler.",
                "he will guide me in the way everlasting.",
                "therefore will I sing praise unto his name.",
            ],
            "correct": 0,
            "reference": "Psalm 27:1",
        },
        {
            "mode": "reference",
            "label": "Reference Race",
            "prompt": "Fear thou not; for I am with thee: be not dismayed; for I am thy God.",
            "choices": ["Isaiah 41:10", "Psalm 46:1", "Deuteronomy 31:6", "John 14:27"],
            "correct": 0,
            "reference": "Isaiah 41:10",
        },
        {
            "mode": "finish",
            "label": "Finish the Verse",
            "prompt": "Wait on the LORD: be of good courage…",
            "choices": [
                "and he shall strengthen thine heart: wait, I say, on the LORD.",
                "for he knoweth the way that I take.",
                "and thy path shall shine as the morning.",
                "for the battle is the LORD'S.",
            ],
            "correct": 0,
            "reference": "Psalm 27:14",
        },
    ],
}

DECKS = {
    deck["id"]: deck
    for deck in (FAMILY_FAVORITES_DECK, COURAGE_DECK)
}


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
    if room and time.time() - float(room.get("updated_at", 0)) > ROOM_TTL_SECONDS:
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
            if room.get("host_email") == email and float(room.get("updated_at", 0)) >= cutoff
        ],
        key=lambda item: item["code"],
    )


def _public_room(room: dict, code: str) -> dict:
    question = _current_question(room)
    phase = room.get("phase", "lobby")
    public_question = None
    if question and phase in {"question", "reveal"}:
        public_question = {
            "label": question["label"],
            "mode": question["mode"],
            "prompt": question["prompt"],
            "choices": question["choices"],
            "reference": question["reference"] if phase == "reveal" else None,
            "correct": question["correct"] if phase == "reveal" else None,
        }

    now = time.time()
    players = sorted(
        [
            {
                "id": player_id,
                "name": player["name"],
                "score": int(player.get("score", 0)),
                "connected": now - float(player.get("last_seen", player.get("joined_at", 0))) < 40,
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
        "question_index": int(room.get("question_index", 0)),
        "question_total": len(room.get("questions", [])),
        "question": public_question,
        "players": players,
        "answered_player_ids": list(answers),
        "review": room.get("review", []),
    }


def _require_room(code: str) -> dict:
    room = _get_room(code)
    if not room:
        abort(404)
    return room


@bp.get("/family-bible-bee")
def home():
    email = _host_email()
    return render_template(
        "bible_bee_home.html",
        decks=list(DECKS.values()),
        active_rooms=_active_rooms_for_host(email),
        is_host_signed_in=bool(email),
        noindex=True,
    )


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
    deck = DECKS.get(request.form.get("deck_id")) or FAMILY_FAVORITES_DECK
    try:
        round_count = int(request.form.get("round_count", 5))
    except (TypeError, ValueError):
        round_count = 5
    round_count = round_count if round_count in {3, 5} else 5
    code = _new_code()
    questions = deepcopy(deck["questions"][:round_count])
    # Keep the two modes alternating while moving the correct option around.
    for question in questions:
        paired = list(enumerate(question["choices"]))
        random.SystemRandom().shuffle(paired)
        question["choices"] = [choice for _, choice in paired]
        question["correct"] = next(index for index, pair in enumerate(paired) if pair[0] == question["correct"])

    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "deck_id": deck["id"],
        "deck_name": deck["name"],
        "translation": deck["translation"],
        "questions": questions,
        "question_index": 0,
        "players": {},
        "answers": {},
        "review": [],
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

        def add_player(current):
            if len(current.get("players", {})) >= 8 and player_id not in current.get("players", {}):
                raise ValueError("This room already has eight players.")
            current.setdefault("players", {})[player_id] = {
                "name": name,
                "score": int(current.get("players", {}).get(player_id, {}).get("score", 0)),
                "joined_at": time.time(),
                "last_seen": time.time(),
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
    state = _public_room(room, code)
    player_id = _player_id(code)
    state["viewer"] = {
        "is_host": _is_host(code, room),
        "player_id": player_id,
        "has_answered": bool(player_id and player_id in room.get("answers", {})),
    }
    if room.get("phase") == "reveal" and player_id:
        answer = room.get("answers", {}).get(player_id)
        question = _current_question(room)
        state["viewer"]["answer"] = answer
        state["viewer"]["correct"] = bool(question and answer == question["correct"])
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
        if choice < 0 or choice >= len(question["choices"]):
            raise ValueError("That answer is not available.")
        room.setdefault("answers", {}).setdefault(player_id, choice)

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
        question = _current_question(room)
        if room.get("phase") != "question" or not question:
            raise ValueError("This round cannot be revealed.")
        missed = 0
        for player_id, player in room.get("players", {}).items():
            if room.get("answers", {}).get(player_id) == question["correct"]:
                player["score"] = int(player.get("score", 0)) + 100
            else:
                missed += 1
        if missed:
            room.setdefault("review", []).append(
                {"reference": question["reference"], "missed": missed, "mode": question["label"]}
            )
        room["phase"] = "reveal"

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
        next_index = int(room.get("question_index", 0)) + 1
        if next_index >= len(room.get("questions", [])):
            room["phase"] = "finished"
        else:
            room["question_index"] = next_index
            room["answers"] = {}
            room["phase"] = "question"

    try:
        result = _mutate_room(code, advance)
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
