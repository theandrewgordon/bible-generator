"""Act It Out: a simple Bible charades and clue party game."""

from __future__ import annotations

import io
import re
import secrets
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone

import qrcode
from flask import Blueprint, abort, jsonify, redirect, render_template, request, send_file, session, url_for
from google.cloud import firestore as google_firestore

from faithsparks.services.firestore import db
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.util.request_utils import get_client_ip


bp = Blueprint("act_it_out", __name__)

ROOM_TTL_SECONDS = 6 * 60 * 60
FINISHED_ROOM_TTL_SECONDS = 30 * 60
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'-]{0,17}$")
BLOCKED_NAMES = {"admin", "host", "moderator", "faithsparks"}
TEAM_PLAYER_LIMIT = 40
INDIVIDUAL_PLAYER_LIMIT = 12
DEFAULT_ROUNDS = 10
ROUND_SECONDS = 45
POINTS_CORRECT = 100
TEAMS = [
    {"id": "gold", "name": "Gold Team", "color": "gold"},
    {"id": "blue", "name": "Blue Team", "color": "blue"},
]

PROMPTS = [
    {"id": "david-goliath", "answer": "David and Goliath", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act brave, small, and facing something huge.", "forbidden_words": ["David", "Goliath", "giant", "stone", "sling"]},
    {"id": "noah-ark", "answer": "Noah building the ark", "modes": ["act"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act out building, gathering animals, and rain."},
    {"id": "jonah-fish", "answer": "Jonah and the big fish", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act stormy seas, being swallowed, and praying.", "forbidden_words": ["Jonah", "fish", "whale", "boat"]},
    {"id": "daniel-lions", "answer": "Daniel in the lions' den", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act praying calmly near lions.", "forbidden_words": ["Daniel", "lion", "den", "pray"]},
    {"id": "moses-sea", "answer": "Moses parting the sea", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act lifting a staff and walking between walls of water.", "forbidden_words": ["Moses", "sea", "water", "Egypt"]},
    {"id": "jericho", "answer": "The walls of Jericho falling", "modes": ["act"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act marching, trumpets, and walls falling down."},
    {"id": "good-samaritan", "answer": "The Good Samaritan", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act seeing someone hurt and helping them.", "forbidden_words": ["Samaritan", "neighbor", "road", "help"]},
    {"id": "lost-sheep", "answer": "The lost sheep", "modes": ["act", "clue"], "theme": "Bible Stories", "difficulty": "easy", "instruction": "Act searching carefully and celebrating when found.", "forbidden_words": ["sheep", "lost", "shepherd"]},
    {"id": "peter-water", "answer": "Peter walking on water", "modes": ["act", "clue"], "theme": "Jesus' Miracles", "difficulty": "easy", "instruction": "Act stepping onto waves, getting scared, and reaching out.", "forbidden_words": ["Peter", "water", "walk", "Jesus"]},
    {"id": "calming-storm", "answer": "Jesus calming the storm", "modes": ["act", "clue"], "theme": "Jesus' Miracles", "difficulty": "easy", "instruction": "Act a wild storm becoming peaceful.", "forbidden_words": ["Jesus", "storm", "boat", "peace"]},
    {"id": "feeding-5000", "answer": "Feeding the five thousand", "modes": ["act", "clue"], "theme": "Jesus' Miracles", "difficulty": "easy", "instruction": "Act sharing a tiny lunch with a huge crowd.", "forbidden_words": ["five", "thousand", "bread", "fish"]},
    {"id": "healing-blind", "answer": "Jesus healing the blind man", "modes": ["act", "clue"], "theme": "Jesus' Miracles", "difficulty": "medium", "instruction": "Act not seeing, being healed, and rejoicing.", "forbidden_words": ["blind", "see", "healed", "Jesus"]},
    {"id": "lazarus", "answer": "Jesus raising Lazarus", "modes": ["act", "clue"], "theme": "Jesus' Miracles", "difficulty": "medium", "instruction": "Act someone coming out after being called.", "forbidden_words": ["Lazarus", "tomb", "dead", "alive"]},
    {"id": "moses", "answer": "Moses", "modes": ["act", "clue"], "theme": "People of the Bible", "difficulty": "easy", "instruction": "Act a staff, tablets, and leading people.", "forbidden_words": ["Moses", "Pharaoh", "Egypt", "Red Sea"]},
    {"id": "esther", "answer": "Esther", "modes": ["act", "clue"], "theme": "People of the Bible", "difficulty": "medium", "instruction": "Act a brave queen preparing to speak.", "forbidden_words": ["Esther", "queen", "king", "Haman"]},
    {"id": "paul", "answer": "Paul", "modes": ["act", "clue"], "theme": "People of the Bible", "difficulty": "medium", "instruction": "Act writing letters and traveling to churches.", "forbidden_words": ["Paul", "letter", "church", "missionary"]},
    {"id": "mary", "answer": "Mary", "modes": ["act", "clue"], "theme": "People of the Bible", "difficulty": "easy", "instruction": "Act hearing surprising news and caring for baby Jesus.", "forbidden_words": ["Mary", "mother", "Jesus", "angel"]},
    {"id": "peter", "answer": "Peter", "modes": ["act", "clue"], "theme": "People of the Bible", "difficulty": "easy", "instruction": "Act fishing, following, and speaking boldly.", "forbidden_words": ["Peter", "disciple", "fish", "rock"]},
    {"id": "praying", "answer": "Praying", "modes": ["act"], "theme": "Church & Worship", "difficulty": "easy", "instruction": "Act talking with God quietly or thankfully."},
    {"id": "singing-worship", "answer": "Singing worship", "modes": ["act"], "theme": "Church & Worship", "difficulty": "easy", "instruction": "Act singing praise with joy."},
    {"id": "serving", "answer": "Serving others", "modes": ["act", "clue"], "theme": "Church & Worship", "difficulty": "easy", "instruction": "Act helping someone before yourself.", "forbidden_words": ["serve", "help", "others"]},
    {"id": "baptism", "answer": "Baptism", "modes": ["act", "clue"], "theme": "Church & Worship", "difficulty": "medium", "instruction": "Act a joyful church moment with water.", "forbidden_words": ["baptism", "water", "church"]},
    {"id": "giving", "answer": "Giving generously", "modes": ["act", "clue"], "theme": "Church & Worship", "difficulty": "easy", "instruction": "Act sharing what you have with joy.", "forbidden_words": ["give", "money", "offering"]},
    {"id": "forgiveness", "answer": "Forgiveness", "modes": ["act", "clue"], "theme": "Faith Words", "difficulty": "medium", "instruction": "Act hurt feelings becoming peace.", "forbidden_words": ["forgive", "sorry", "wrong"]},
    {"id": "patience", "answer": "Patience", "modes": ["act", "clue"], "theme": "Faith Words", "difficulty": "easy", "instruction": "Act waiting calmly.", "forbidden_words": ["patience", "wait", "calm"]},
    {"id": "courage", "answer": "Courage", "modes": ["act", "clue"], "theme": "Faith Words", "difficulty": "easy", "instruction": "Act being brave even when afraid.", "forbidden_words": ["courage", "brave", "afraid"]},
    {"id": "joy", "answer": "Joy", "modes": ["act", "clue"], "theme": "Faith Words", "difficulty": "easy", "instruction": "Act deep gladness.", "forbidden_words": ["joy", "happy", "glad"]},
    {"id": "peace", "answer": "Peace", "modes": ["act", "clue"], "theme": "Faith Words", "difficulty": "easy", "instruction": "Act calm after worry.", "forbidden_words": ["peace", "calm", "quiet"]},
]

THEMES = ["Bible Stories", "Jesus' Miracles", "People of the Bible", "Church & Worship", "Faith Words"]

_local_rooms: dict[str, dict] = {}
_local_lock = threading.RLock()


def _stamp_room(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    room["updated_at"] = now
    if room.get("phase") != "finished":
        room["expires_at"] = now + ROOM_TTL_SECONDS
    else:
        room.setdefault("expires_at", now + FINISHED_ROOM_TTL_SECONDS)
    room["expireAt"] = datetime.fromtimestamp(float(room["expires_at"]), tz=timezone.utc)


def _room_ref(code: str):
    client = db()
    return client.collection("act_it_out_rooms").document(code) if client else None


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
    _stamp_room(room)
    ref = _room_ref(code)
    if ref:
        ref.set(room)
    else:
        with _local_lock:
            _local_rooms[code] = deepcopy(room)


def _mutate_room(code: str, callback):
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
            _stamp_room(room)
            txn.set(ref, room)
            return result, room

        return update_in_transaction(transaction)
    with _local_lock:
        room = _local_rooms.get(code)
        if room is None:
            return None
        result = callback(room)
        _stamp_room(room)
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
    raise RuntimeError("Could not allocate an Act It Out room code")


def _host_email() -> str:
    return str(session.get("user_email") or "").strip().lower()


def _is_host(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    email = _host_email()
    return bool(room and email and room.get("host_email") == email)


def _player_session_key(code: str) -> str:
    return f"act_it_out_player_{code}"


def _player_id(code: str) -> str | None:
    return session.get(_player_session_key(code))


def _team_meta(team_id: str | None) -> dict | None:
    return next((team for team in TEAMS if team["id"] == team_id), None)


def _player_limit(room: dict) -> int:
    return TEAM_PLAYER_LIMIT if room.get("team_mode") else INDIVIDUAL_PLAYER_LIMIT


def _balanced_team_id(room: dict) -> str:
    counts = {team["id"]: 0 for team in TEAMS}
    for player in room.get("players", {}).values():
        team_id = player.get("team_id")
        if team_id in counts:
            counts[team_id] += 1
    _index, team = min(enumerate(TEAMS), key=lambda item: (counts[item[1]["id"]], item[0]))
    return team["id"]


def _assign_balanced_teams(room: dict) -> None:
    if not room.get("team_mode"):
        return
    players = sorted(room.get("players", {}).items(), key=lambda item: (float(item[1].get("joined_at", 0)), item[1].get("name", "").lower()))
    for index, (_player_id, player) in enumerate(players):
        player["team_id"] = TEAMS[index % len(TEAMS)]["id"]


def _team_state(room: dict) -> list[dict]:
    if not room.get("team_mode"):
        return []
    players = room.get("players", {})
    return [
        {
            **team,
            "score": sum(int(player.get("score", 0)) for player in players.values() if player.get("team_id") == team["id"]),
            "players": sum(1 for player in players.values() if player.get("team_id") == team["id"]),
        }
        for team in TEAMS
    ]


def _room_full_message(room: dict) -> str:
    if room.get("team_mode"):
        return f"This team room is full at {TEAM_PLAYER_LIMIT} players."
    return f"This room already has {INDIVIDUAL_PLAYER_LIMIT} players."


def _prompt_pool(theme: str) -> list[dict]:
    if theme == "Mix It Up":
        return PROMPTS
    selected = [prompt for prompt in PROMPTS if prompt["theme"] == theme]
    return selected or PROMPTS


def _build_rounds(code: str, theme: str, count: int = DEFAULT_ROUNDS) -> list[dict]:
    pool = deepcopy(_prompt_pool(theme))
    seed = sum(ord(char) for char in code)
    rounds = []
    for index in range(count):
        prompt = pool[(seed + index * 7) % len(pool)]
        mode = prompt["modes"][index % len(prompt["modes"])]
        rounds.append({
            "id": f"{prompt['id']}-{index}",
            "prompt_id": prompt["id"],
            "answer": prompt["answer"],
            "mode": mode,
            "theme": prompt["theme"],
            "instruction": prompt.get("instruction", ""),
            "forbidden_words": prompt.get("forbidden_words", []) if mode == "clue" else [],
        })
    return rounds


def _available_players(room: dict, team_id: str | None = None) -> list[tuple[str, dict]]:
    players = [
        (player_id, player)
        for player_id, player in room.get("players", {}).items()
        if not player.get("away", False) and (not team_id or player.get("team_id") == team_id)
    ]
    return sorted(players, key=lambda item: (float(item[1].get("joined_at", 0)), item[1].get("name", "").lower()))


def _active_round(room: dict) -> dict | None:
    index = int(room.get("round_index", 0))
    rounds = room.get("rounds", [])
    return rounds[index] if 0 <= index < len(rounds) else None


def _select_turn(room: dict) -> None:
    round_index = int(room.get("round_index", 0))
    if room.get("team_mode"):
        team = TEAMS[round_index % len(TEAMS)]
        players = _available_players(room, team["id"])
        if not players:
            players = _available_players(room)
        room["active_team_id"] = team["id"] if players else None
    else:
        players = _available_players(room)
        room["active_team_id"] = None
    if not players:
        room["active_player_id"] = None
        return
    player_id, player = players[(round_index // (len(TEAMS) if room.get("team_mode") else 1)) % len(players)]
    room["active_player_id"] = player_id
    if room.get("team_mode"):
        room["active_team_id"] = player.get("team_id")


def _start_round(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    _select_turn(room)
    room["phase"] = "round"
    room["round_started_at"] = now
    room["round_deadline"] = now + int(room.get("timer_seconds", ROUND_SECONDS))


def _finish_room(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    room["phase"] = "finished"
    room["finished_at"] = now
    room["expires_at"] = now + FINISHED_ROOM_TTL_SECONDS
    room.pop("round_deadline", None)


def _complete_round(room: dict, outcome: str, now: float | None = None) -> None:
    now = now or time.time()
    active = _active_round(room)
    if not active or room.get("phase") != "round":
        raise ValueError("This round is not active.")
    player_id = room.get("active_player_id")
    player = room.get("players", {}).get(player_id or "")
    points = POINTS_CORRECT if outcome == "correct" else 0
    if player and points:
        player["score"] = int(player.get("score", 0)) + points
    room.setdefault("round_results", []).append({
        "round_index": int(room.get("round_index", 0)),
        "answer": active["answer"],
        "mode": active["mode"],
        "outcome": outcome,
        "points": points,
        "player_id": player_id,
        "team_id": player.get("team_id") if player else None,
    })
    room["last_result"] = room["round_results"][-1]
    room["phase"] = "reveal"
    room.pop("round_deadline", None)


def _advance_round(room: dict, now: float | None = None) -> None:
    next_index = int(room.get("round_index", 0)) + 1
    if next_index >= len(room.get("rounds", [])):
        _finish_room(room, now)
        return
    room["round_index"] = next_index
    room.pop("last_result", None)
    _start_round(room, now)


def _public_players(room: dict) -> list[dict]:
    now = time.time()
    players = []
    for player_id, player in room.get("players", {}).items():
        team = _team_meta(player.get("team_id"))
        players.append({
            "id": player_id,
            "name": player["name"],
            "score": int(player.get("score", 0)),
            "connected": now - float(player.get("last_seen", player.get("joined_at", 0))) < 40,
            "away": bool(player.get("away", False)),
            "team_id": team["id"] if team else None,
            "team_name": team["name"] if team else None,
            "team_color": team["color"] if team else None,
        })
    return sorted(players, key=lambda player: (player.get("team_id") or "", -player["score"], player["name"].lower()))


def _public_room(room: dict, code: str) -> dict:
    active = _active_round(room)
    active_player = room.get("players", {}).get(room.get("active_player_id") or "")
    active_team = _team_meta(active_player.get("team_id") if active_player else room.get("active_team_id"))
    visible_round = None
    if active:
        visible_round = {
            "mode": active["mode"],
            "theme": active["theme"],
            "answer": active["answer"] if room.get("phase") in {"reveal", "finished"} else None,
            "instruction": active.get("instruction", "") if room.get("phase") in {"reveal", "finished"} else "",
        }
    players = _public_players(room)
    return {
        "code": code,
        "phase": room.get("phase", "lobby"),
        "game_name": "Act It Out",
        "theme": room.get("theme", "Bible Stories"),
        "team_mode": bool(room.get("team_mode", True)),
        "teams": _team_state(room),
        "players": players,
        "round_index": int(room.get("round_index", 0)),
        "round_total": len(room.get("rounds", [])),
        "round": visible_round,
        "active_player_id": room.get("active_player_id"),
        "active_player_name": active_player.get("name") if active_player else None,
        "active_team_id": active_team["id"] if active_team else None,
        "active_team_name": active_team["name"] if active_team else None,
        "active_team_color": active_team["color"] if active_team else None,
        "timer_seconds": int(room.get("timer_seconds", ROUND_SECONDS)),
        "round_deadline": room.get("round_deadline"),
        "last_result": room.get("last_result"),
        "family_score": sum(player["score"] for player in players),
        "expires_at": room.get("expires_at"),
    }


def _require_room(code: str) -> dict:
    room = _get_room(code)
    if not room:
        abort(404)
    return room


def _active_rooms_for_host(email: str) -> list[dict]:
    if not email:
        return []
    client = db()
    if client:
        docs = client.collection("act_it_out_rooms").where("host_email", "==", email).stream()
        rooms = [(doc.id, doc.to_dict()) for doc in docs]
    else:
        with _local_lock:
            rooms = [(code, deepcopy(room)) for code, room in _local_rooms.items()]
    now = time.time()
    return sorted(
        [
            {"code": code, "phase": room.get("phase", "lobby"), "players": len(room.get("players", {})), "theme": room.get("theme", "Bible Stories")}
            for code, room in rooms
            if room.get("host_email") == email and now < float(room.get("expires_at", float("inf")))
        ],
        key=lambda item: item["code"],
    )


@bp.get("/church-games")
def hub():
    return render_template("church_games.html", noindex=True)


@bp.get("/church-games/act-it-out")
def home():
    email = _host_email()
    return render_template(
        "act_it_out_home.html",
        themes=["Mix It Up", *THEMES],
        is_host_signed_in=bool(email),
        active_rooms=_active_rooms_for_host(email),
        noindex=True,
    )


@bp.post("/church-games/act-it-out/create")
def create_room():
    email = _host_email()
    if not email:
        return redirect(url_for("google.login", next=url_for("act_it_out.home")))
    rate = check_rate_limit("act-it-out-create", email or get_client_ip(), limit=8, window_seconds=60 * 60)
    if not rate.allowed:
        return "Too many rooms created. Please try again later.", 429
    theme = request.form.get("theme") or "Mix It Up"
    if theme not in {"Mix It Up", *THEMES}:
        theme = "Mix It Up"
    team_mode = request.form.get("team_mode", "on") == "on"
    code = _new_code()
    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "theme": theme,
        "team_mode": team_mode,
        "teams": TEAMS if team_mode else [],
        "rounds": _build_rounds(code, theme, DEFAULT_ROUNDS),
        "round_index": 0,
        "timer_seconds": ROUND_SECONDS,
        "players": {},
        "round_results": [],
    }
    _set_room(code, room)
    host_rooms = list(session.get("act_it_out_host_rooms", []))
    if code not in host_rooms:
        host_rooms.append(code)
    session["act_it_out_host_rooms"] = host_rooms[-8:]
    return redirect(url_for("act_it_out.host_room", code=code))


@bp.get("/church-games/act-it-out/host/<code>")
def host_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if not _is_host(code, room):
        abort(403)
    return render_template("act_it_out_room.html", code=code, role="host", noindex=True)


@bp.get("/church-games/act-it-out/display/<code>")
def display_room(code: str):
    code = code.upper()
    _require_room(code)
    return render_template("act_it_out_room.html", code=code, role="display", noindex=True)


@bp.get("/church-games/act-it-out/room/<code>/qr")
def room_qr(code: str):
    code = code.upper()
    _require_room(code)
    join_url = request.url_root.rstrip("/") + url_for("act_it_out.join_room", code=code)
    image = qrcode.make(join_url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    response = send_file(output, mimetype="image/png", download_name=f"act-it-out-{code}.png")
    response.headers["Cache-Control"] = "private, no-store"
    return response


def _render_join_page(code: str, error: str | None = None):
    return render_template("act_it_out_join.html", code=code, error=error, noindex=True)


@bp.route("/church-games/act-it-out/join/<code>", methods=["GET", "POST"])
def join_room(code: str):
    code = code.upper()
    room = _require_room(code)
    existing_id = _player_id(code)
    if request.method == "POST":
        rate = check_rate_limit("act-it-out-join", get_client_ip(), limit=60, window_seconds=10 * 60)
        if not rate.allowed:
            return _render_join_page(code, "Too many join attempts. Please wait a few minutes."), 429
        name = " ".join((request.form.get("player_name") or "").strip().split())
        if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
            return _render_join_page(code, "Choose a simple family-friendly name using letters or numbers."), 400
        if room.get("phase") != "lobby":
            return _render_join_page(code, "This game has already started."), 409
        player_id = existing_id or secrets.token_urlsafe(8)

        def add_player(current):
            if len(current.get("players", {})) >= _player_limit(current) and player_id not in current.get("players", {}):
                raise ValueError(_room_full_message(current))
            if any(other_id != player_id and player.get("name", "").casefold() == name.casefold() for other_id, player in current.get("players", {}).items()):
                raise ValueError("That player name is already in this room. Add a family initial or nickname.")
            existing = current.get("players", {}).get(player_id, {})
            team_id = existing.get("team_id")
            if current.get("team_mode") and team_id not in {team["id"] for team in TEAMS}:
                team_id = _balanced_team_id(current)
            current.setdefault("players", {})[player_id] = {
                "name": name,
                "score": int(existing.get("score", 0)),
                "joined_at": time.time(),
                "last_seen": time.time(),
                "away": False,
                "team_id": team_id if current.get("team_mode") else None,
            }

        try:
            _mutate_room(code, add_player)
        except ValueError as exc:
            return _render_join_page(code, str(exc)), 409
        session[_player_session_key(code)] = player_id
        return redirect(url_for("act_it_out.player_room", code=code))
    if existing_id and existing_id in room.get("players", {}):
        return redirect(url_for("act_it_out.player_room", code=code))
    return _render_join_page(code)


@bp.get("/church-games/act-it-out/play/<code>")
def player_room(code: str):
    code = code.upper()
    room = _require_room(code)
    player_id = _player_id(code)
    if not player_id or player_id not in room.get("players", {}):
        return redirect(url_for("act_it_out.join_room", code=code))
    return render_template("act_it_out_room.html", code=code, role="player", noindex=True)


@bp.get("/api/church-games/act-it-out/rooms/<code>")
def room_state(code: str):
    code = code.upper()
    room = _require_room(code)
    if room.get("phase") == "round" and room.get("round_deadline") and time.time() >= float(room["round_deadline"]):
        def expire(current):
            if current.get("phase") == "round":
                _complete_round(current, "pass")
        result = _mutate_room(code, expire)
        if result is None:
            abort(404)
        room = result[1]
    state = _public_room(room, code)
    player_id = _player_id(code)
    viewer = {"is_host": _is_host(code, room), "player_id": player_id}
    active = _active_round(room)
    if active and (viewer["is_host"] or (player_id and player_id == room.get("active_player_id"))):
        viewer["secret_prompt"] = {
            "answer": active["answer"],
            "mode": active["mode"],
            "instruction": active.get("instruction", ""),
            "forbidden_words": active.get("forbidden_words", []),
        }
    state["viewer"] = viewer
    return jsonify(state)


@bp.post("/api/church-games/act-it-out/rooms/<code>/start")
def start_game(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def start(current):
        if not current.get("players"):
            raise ValueError("Invite at least one player before starting.")
        if current.get("team_mode"):
            teams_with_players = {player.get("team_id") for player in current.get("players", {}).values()}
            if not all(team["id"] in teams_with_players for team in TEAMS):
                raise ValueError("Team mode needs at least one player on each team.")
        current["round_index"] = 0
        current["round_results"] = []
        current.pop("last_result", None)
        for player in current.get("players", {}).values():
            player["score"] = 0
        _start_round(current)

    try:
        result = _mutate_room(code, start)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


def _host_action(code: str, action: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def mutate(current):
        if action in {"correct", "pass"}:
            _complete_round(current, action)
        elif action == "next":
            if current.get("phase") != "reveal":
                raise ValueError("Score or pass this round before continuing.")
            _advance_round(current)
        elif action == "end":
            if current.get("phase") == "lobby":
                raise ValueError("Start the game before ending it.")
            _finish_room(current)
        else:
            raise ValueError("Unknown action.")

    try:
        result = _mutate_room(code, mutate)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/correct")
def correct_round(code: str):
    return _host_action(code, "correct")


@bp.post("/api/church-games/act-it-out/rooms/<code>/pass")
def pass_round(code: str):
    return _host_action(code, "pass")


@bp.post("/api/church-games/act-it-out/rooms/<code>/next")
def next_round(code: str):
    return _host_action(code, "next")


@bp.post("/api/church-games/act-it-out/rooms/<code>/end")
def end_game(code: str):
    return _host_action(code, "end")


@bp.post("/api/church-games/act-it-out/rooms/<code>/heartbeat")
def heartbeat(code: str):
    code = code.upper()
    player_id = _player_id(code)
    if not player_id:
        abort(403)

    def beat(current):
        player = current.get("players", {}).get(player_id)
        if not player:
            raise PermissionError
        player["last_seen"] = time.time()

    try:
        result = _mutate_room(code, beat)
    except PermissionError:
        abort(403)
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/teams/rebalance")
def rebalance_teams(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def rebalance(current):
        if not current.get("team_mode"):
            raise ValueError("Team mode is not on for this room.")
        if current.get("phase") != "lobby":
            raise ValueError("Teams can only be balanced before the game starts.")
        _assign_balanced_teams(current)

    try:
        result = _mutate_room(code, rebalance)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/players/<player_id>/team")
def switch_player_team(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def switch(current):
        if not current.get("team_mode"):
            raise ValueError("Team mode is not on for this room.")
        if current.get("phase") != "lobby":
            raise ValueError("Teams can only be changed before the game starts.")
        player = current.get("players", {}).get(player_id)
        if not player:
            raise ValueError("That player is no longer in the room.")
        team_ids = [team["id"] for team in TEAMS]
        current_id = player.get("team_id")
        next_index = (team_ids.index(current_id) + 1) % len(team_ids) if current_id in team_ids else 0
        player["team_id"] = team_ids[next_index]

    try:
        result = _mutate_room(code, switch)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/players/<player_id>/remove")
def remove_player(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def remove(current):
        if current.get("phase") != "lobby":
            raise ValueError("Players can only be removed before the game starts.")
        current.get("players", {}).pop(player_id, None)

    try:
        result = _mutate_room(code, remove)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})
