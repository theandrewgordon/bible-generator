"""Act It Out: a simple Bible charades and clue party game."""

from __future__ import annotations

import io
import base64
import binascii
import hashlib
import os
import random
import re
import secrets
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone

import qrcode
from flask import Blueprint, abort, current_app, has_app_context, jsonify, redirect, render_template, request, send_file, session, url_for
from google.cloud import firestore as google_firestore

from faithsparks.services.firestore import db
from faithsparks.services.game_content import (
    build_family_rounds,
    free_sampler_ids,
    legacy_family_prompts,
    read_recent_history,
    strong_seed,
    updated_recent_history,
)
from faithsparks.services.game_content_health import load_precomputed_health
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.stripe_svc import STRIPE_PRICE_FAMILY_GAME_NIGHT
from faithsparks.services.users import get_user_doc, has_active_plus, has_family_game_night_access
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
ROUND_COUNT_OPTIONS = {10, 15, 20}
ROUND_SECONDS = 45
DRAW_MIN_SECONDS = 12
CONTROLLER_PAIR_TTL_SECONDS = 10 * 60
POINTS_CORRECT = 100
PLAYER_CONNECTED_SECONDS = 40
MAX_AVATAR_DATA_LENGTH = 60_000
MAX_DRAWING_DATA_LENGTH = 260_000
AVATAR_DATA_RE = re.compile(r"^data:image/jpeg;base64,[A-Za-z0-9+/=]+$")
DRAWING_DATA_RE = re.compile(r"^data:image/png;base64,[A-Za-z0-9+/=]+$")
PRESET_AVATARS = {
    "fox": "Friendly fox",
    "sunflower": "Sunflower",
    "ocean": "Ocean sunrise",
    "david": "David with a harp",
    "esther": "Queen Esther",
    "jesus-children": "Jesus welcoming children",
    "noah": "Noah's ark",
    "empty-tomb": "Empty tomb",
    "cross": "Jesus on the cross",
}
TEAMS = [
    {"id": "gold", "name": "Gold Team", "color": "gold"},
    {"id": "blue", "name": "Blue Team", "color": "blue"},
]

PROMPTS = legacy_family_prompts()

ACT_THEMES = ["Bible Stories", "Jesus' Miracles", "Parables", "People Moments", "Worship & Church", "Everyday Faith", "Guess the Story"]
DRAW_THEMES = ["Bible Stories", "Jesus' Miracles", "Parables", "People & Places", "Worship & Church", "Faith Pictures", "Easy Objects", "Big Scenes"]
THEMES = [*ACT_THEMES, *DRAW_THEMES]

FAMILY_GAME_MODES = {"mixed", "act", "draw", "clue", "guess"}
CONTROL_MODES = {"couch", "team_auto", "hosted"}
FAMILY_DIFFICULTIES = {
    "younger": {"easy"},
    "whole_family": {"easy", "medium"},
    "challenge": {"medium", "hard"},
}
FAMILY_CATEGORIES = {
    "bible_stories": "Bible Stories",
    "jesus_miracles": "Jesus and His Miracles",
    "parables": "Parables",
    "people": "People of the Bible",
    "worship_church": "Worship and Church",
    "everyday_faith": "Everyday Faith",
}
PROMPT_THEME_CATEGORIES = {
    "Bible Stories": "bible_stories",
    "Guess the Story": "bible_stories",
    "Big Scenes": "bible_stories",
    "Jesus' Miracles": "jesus_miracles",
    "Parables": "parables",
    "People Moments": "people",
    "People & Places": "people",
    "Worship & Church": "worship_church",
    "Everyday Faith": "everyday_faith",
    "Faith Pictures": "everyday_faith",
    "Easy Objects": "everyday_faith",
}
FAMILY_MODE_SEQUENCE = ("act", "draw", "clue", "guess")


def _free_prompt_ids() -> set[str]:
    """Explicit normalized sampler; IDs are validated at startup/CI."""
    return set(free_sampler_ids())


FREE_FAMILY_PROMPT_IDS = _free_prompt_ids()
FAMILY_FUNNEL_EVENTS = {
    "sales_page_view",
    "play_free_click",
    "unlock_click",
    "setup_view",
    "room_created",
    "first_player_joined",
    "game_started",
    "game_finished",
}
FAMILY_CTA_EVENTS = {"play_free_click", "unlock_click"}
FEEDBACK_FAVORITE_MODES = {"act", "draw", "clue", "guess", "mixed"}
FEEDBACK_PLAY_AGAIN = {"yes", "maybe", "no"}
BOT_USER_AGENT_RE = re.compile(r"bot|crawler|spider|slurp|preview", re.IGNORECASE)


def _privacy_rate_key() -> str:
    """Rate-limit without persisting a raw IP address."""
    return hashlib.sha256(get_client_ip().encode("utf-8")).hexdigest()[:24]


def _record_family_funnel_event(event: str, room: dict | None, code: str) -> None:
    """Record aggregate launch events without player names or room secrets."""
    if event not in FAMILY_FUNNEL_EVENTS or (room or {}).get("game_type") != "family_game_night":
        return
    client = db()
    if not client:
        return
    try:
        root = client.collection("analytics").document("family_game_night_funnel")
        root.set(
            {
                "total": google_firestore.Increment(1),
                "events": {event: google_firestore.Increment(1)},
                "updatedAt": google_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        if code:
            root.collection("recent").document(f"{event}-{code}").set(
                {
                    "event": event,
                    "roomCode": code,
                    "freeSampler": bool((room or {}).get("free_sampler")),
                    "gameMode": (room or {}).get("game_mode"),
                    "roundCount": int((room or {}).get("round_count", 0)),
                    "createdAt": google_firestore.SERVER_TIMESTAMP,
                }
            )
    except Exception:
        current_app.logger.exception("Family Game Night funnel event failed: %s", event)


def _record_family_page_event(event: str) -> None:
    """Count a page event once per browser session; analytics never blocks access."""
    if event not in {"sales_page_view", "setup_view"}:
        return
    if BOT_USER_AGENT_RE.search(request.headers.get("User-Agent", "")):
        return
    session_key = f"family_game_night_metric:{event}"
    if session.get(session_key):
        return
    session[session_key] = True
    try:
        _record_family_funnel_event(event, {"game_type": "family_game_night"}, "")
    except Exception:
        current_app.logger.exception("Family Game Night page analytics failed")

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


def _is_admin_email(email: str) -> bool:
    allowed = [item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()]
    return bool(email and email.lower() in allowed)


def _session_host_key(code: str) -> str:
    keys = session.get("act_it_out_host_keys", {})
    return str(keys.get(code, "")) if isinstance(keys, dict) else ""


def _register_host_room(code: str, room: dict) -> None:
    """Give this browser durable, room-scoped host authority.

    Google OAuth may briefly become unavailable between requests. The signed
    Flask session remains valid in that case, so keep game control independent
    from a fresh OAuth lookup without trusting the guessable room code alone.
    """
    host_key = secrets.token_urlsafe(32)
    room["host_key"] = host_key

    host_rooms = [item for item in session.get("act_it_out_host_rooms", []) if item != code]
    host_rooms.append(code)
    host_rooms = host_rooms[-8:]
    session["act_it_out_host_rooms"] = host_rooms

    existing = session.get("act_it_out_host_keys", {})
    host_keys = dict(existing) if isinstance(existing, dict) else {}
    host_keys[code] = host_key
    session["act_it_out_host_keys"] = {
        room_code: host_keys[room_code]
        for room_code in host_rooms
        if room_code in host_keys
    }


def _forget_host_room(code: str) -> None:
    session["act_it_out_host_rooms"] = [
        item for item in session.get("act_it_out_host_rooms", []) if item != code
    ]
    existing = session.get("act_it_out_host_keys", {})
    host_keys = dict(existing) if isinstance(existing, dict) else {}
    host_keys.pop(code, None)
    session["act_it_out_host_keys"] = host_keys


def _is_host(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    email = _host_email()
    if not room:
        return False
    if email and room.get("host_email") == email:
        return True
    session_key = _session_host_key(code)
    room_key = str(room.get("host_key") or "")
    return bool(session_key and room_key and secrets.compare_digest(session_key, room_key))


def _can_delete_room(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    email = _host_email()
    return bool(room and (_is_host(code, room) or _is_admin_email(email)))


def _player_session_key(code: str) -> str:
    return f"act_it_out_player_{code}"


def _player_id(code: str) -> str | None:
    return session.get(_player_session_key(code))


def _controller_role(code: str, room: dict | None = None) -> str | None:
    roles = session.get("family_game_controller_roles", {})
    capability = roles.get(code) if isinstance(roles, dict) else None
    room = room or _get_room(code)
    if isinstance(capability, str):
        legacy_pairing = (room or {}).get("controller_pairings", {}).get(capability, {})
        return capability if legacy_pairing.get("claimed") and not legacy_pairing.get("generation") else None
    if not isinstance(capability, dict):
        return None
    role = str(capability.get("role") or "")
    pairing = (room or {}).get("controller_pairings", {}).get(role, {})
    generation = str(capability.get("generation") or "")
    return role if pairing.get("claimed") and generation and secrets.compare_digest(generation, str(pairing.get("generation") or "")) else None


def _new_controller_pairings(control_mode: str) -> tuple[dict, dict]:
    roles = ["couch"] if control_mode == "couch" else (["gold", "blue"] if control_mode == "team_auto" else ["host"])
    raw, stored = {}, {}
    for role in roles:
        token = secrets.token_urlsafe(32)
        raw[role] = token
        stored[role] = {"token_hash": hashlib.sha256(token.encode()).hexdigest(), "expires_at": time.time() + CONTROLLER_PAIR_TTL_SECONDS, "claimed": False, "generation": secrets.token_urlsafe(16)}
    return raw, stored


def _valid_avatar_data(value: str) -> bool:
    if not value:
        return True
    if len(value) > MAX_AVATAR_DATA_LENGTH or not AVATAR_DATA_RE.fullmatch(value):
        return False
    try:
        image_bytes = base64.b64decode(value.split(",", 1)[1], validate=True)
    except (ValueError, binascii.Error):
        return False
    return image_bytes.startswith(b"\xff\xd8\xff")


def _valid_drawing_data(value: str) -> bool:
    if not value or len(value) > MAX_DRAWING_DATA_LENGTH or not DRAWING_DATA_RE.fullmatch(value):
        return False
    try:
        image_bytes = base64.b64decode(value.split(",", 1)[1], validate=True)
    except (ValueError, binascii.Error):
        return False
    return image_bytes.startswith(b"\x89PNG\r\n\x1a\n")


def _team_meta(team_id: str | None) -> dict | None:
    return next((team for team in TEAMS if team["id"] == team_id), None)


def _player_limit(room: dict) -> int:
    configured_limit = room.get("player_limit")
    if isinstance(configured_limit, int) and configured_limit > 0:
        return configured_limit
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
    team_names = room.get("team_names", {})
    return [
        {
            **team,
            "name": team_names.get(team["id"], team["name"]),
            "score": sum(int(player.get("score", 0)) for player in players.values() if player.get("team_id") == team["id"]),
            "players": sum(1 for player in players.values() if player.get("team_id") == team["id"]),
        }
        for team in TEAMS
    ]


def _room_full_message(room: dict) -> str:
    if room.get("player_limit"):
        return f"This room is full at {_player_limit(room)} players."
    if room.get("team_mode"):
        return f"This team room is full at {TEAM_PLAYER_LIMIT} players."
    return f"This room already has {INDIVIDUAL_PLAYER_LIMIT} players."


def _prompt_pool(theme: str, game_type: str = "act_it_out") -> list[dict]:
    if game_type == "draw_it":
        draw_prompts = [prompt for prompt in PROMPTS if "draw" in prompt["modes"]]
        if theme in {"Mix It Up", "Draw It"}:
            return draw_prompts
        selected = [prompt for prompt in draw_prompts if prompt["theme"] == theme]
        return selected or draw_prompts
    act_prompts = [prompt for prompt in PROMPTS if "draw" not in prompt["modes"]]
    if theme == "Mix It Up":
        return act_prompts
    selected = [prompt for prompt in act_prompts if prompt["theme"] == theme]
    return selected or act_prompts


def _family_prompt_pool(
    categories: set[str],
    difficulty: str,
    mode: str | None = None,
    *,
    free_sampler: bool = False,
) -> list[dict]:
    allowed_difficulties = FAMILY_DIFFICULTIES[difficulty]
    return [
        prompt
        for prompt in PROMPTS
        if PROMPT_THEME_CATEGORIES.get(prompt["theme"]) in categories
        and prompt.get("difficulty", "easy") in allowed_difficulties
        and (mode is None or mode in prompt["modes"])
        and (not free_sampler or prompt["id"] in FREE_FAMILY_PROMPT_IDS)
    ]


def _draw_choices(answer: str, seed: int, allowed_prompt_ids: set[str] | None = None) -> list[str]:
    distractors = [
        prompt["answer"]
        for prompt in PROMPTS
        if "draw" in prompt["modes"]
        and prompt["answer"] != answer
        and (allowed_prompt_ids is None or prompt["id"] in allowed_prompt_ids)
    ]
    ordered = sorted(set(distractors), key=lambda item: (strong_seed("draw-choice", seed, item), item))
    choices = [answer, *ordered[:3]]
    return sorted(choices, key=lambda item: (strong_seed("draw-choice-order", seed, item), item))


def _build_rounds(
    code: str,
    theme: str,
    count: int = DEFAULT_ROUNDS,
    game_type: str = "act_it_out",
    *,
    categories: set[str] | None = None,
    difficulty: str = "whole_family",
    game_mode: str = "mixed",
    free_sampler: bool = False,
    recent_prompt_ids: set[str] | None = None,
) -> list[dict]:
    if game_type == "family_game_night":
        selected_categories = categories or set(FAMILY_CATEGORIES)
        rounds, diagnostics = build_family_rounds(
            code,
            count,
            categories=selected_categories,
            difficulty_values=FAMILY_DIFFICULTIES[difficulty],
            game_mode=game_mode,
            free_sampler=free_sampler,
            recent_prompt_ids=recent_prompt_ids,
        )
        allowed_choices = set(FREE_FAMILY_PROMPT_IDS) if free_sampler else None
        seed = strong_seed("family-game-night-draw-choices", code)
        for index, round_ in enumerate(rounds):
            if round_["mode"] == "draw":
                round_["choices"] = _draw_choices(round_["answer"], seed + index, allowed_choices)
        if has_app_context():
            current_app.logger.info(
                "Family Game Night rounds built eligible=%s answers=%s stories=%s relaxations=%s",
                diagnostics["eligible_pool_size"], diagnostics["unique_answer_capacity"],
                diagnostics["story_group_capacity"],
                ",".join(diagnostics["relaxations_used"]) or "none",
            )
        return rounds
    pool = deepcopy(_prompt_pool(theme, game_type))
    seed = strong_seed("legacy-family-game", code, theme, game_type, count)
    rng = random.Random(seed)
    rng.shuffle(pool)
    rounds = []
    for index in range(count):
        prompt = pool[index % len(pool)]
        mode = "draw" if game_type == "draw_it" else rng.choice(prompt["modes"])
        answer = prompt["answer"]
        rounds.append({
            "id": f"{prompt['id']}-{index}",
            "prompt_id": prompt["id"],
            "answer": answer,
            "mode": mode,
            "theme": prompt["theme"],
            "instruction": prompt.get("instruction", ""),
            "forbidden_words": prompt.get("forbidden_words", []) if mode == "clue" else [],
            "clues": prompt.get("clues", []) if mode == "guess" else [],
            "choices": _draw_choices(answer, seed + index) if mode == "draw" else [],
        })
    return rounds


def _available_players(
    room: dict,
    team_id: str | None = None,
    connected_only: bool = False,
) -> list[tuple[str, dict]]:
    now = time.time()
    players = [
        (player_id, player)
        for player_id, player in room.get("players", {}).items()
        if not player.get("away", False)
        and (not team_id or player.get("team_id") == team_id)
        and (not connected_only or _player_connected(player, now))
    ]
    return sorted(players, key=lambda item: (float(item[1].get("joined_at", 0)), item[1].get("name", "").lower()))


def _player_connected(player: dict, now: float | None = None) -> bool:
    now = now or time.time()
    return now - float(player.get("last_seen", player.get("joined_at", 0))) < PLAYER_CONNECTED_SECONDS


def _draw_guesser_ids(room: dict, connected_only: bool = True) -> list[str]:
    now = time.time()
    return [
        player_id
        for player_id, player in _available_players(room)
        if player_id != room.get("active_player_id")
        and (not connected_only or _player_connected(player, now))
    ]


def _active_round(room: dict) -> dict | None:
    index = int(room.get("round_index", 0))
    rounds = room.get("rounds", [])
    return rounds[index] if 0 <= index < len(rounds) else None


def _select_turn(room: dict) -> None:
    round_index = int(room.get("round_index", 0))
    if room.get("team_mode"):
        team = TEAMS[round_index % len(TEAMS)]
        players = _available_players(room, team["id"], connected_only=True)
        if not players:
            players = _available_players(room, connected_only=True)
        room["active_team_id"] = team["id"] if players else None
    else:
        players = _available_players(room, connected_only=True)
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
    adaptive_prepare = room.get("control_mode", "hosted") in {"couch", "team_auto"} and (_active_round(room) or {}).get("mode") != "guess"
    room["phase"] = "prepare" if adaptive_prepare else "round"
    room["prompt_locked"] = False
    if not adaptive_prepare:
        room["round_started_at"] = now
        room["round_deadline"] = now + int(room.get("timer_seconds", ROUND_SECONDS))
    else:
        room.pop("round_started_at", None)
        room.pop("round_deadline", None)
    if (_active_round(room) or {}).get("mode") == "guess":
        room["clue_index"] = 0
    else:
        room.pop("clue_index", None)
    room.pop("drawing_data", None)
    room["draw_answers"] = {}


def _finish_room(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    room["phase"] = "finished"
    room["finished_at"] = now
    room["completion_number"] = int(room.get("completion_number", 0)) + 1
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
    if outcome == "correct" and active.get("mode") == "guess":
        # The first clue is visible at index zero. Reward earlier answers while
        # keeping the final clue worth enough to feel meaningful.
        points = max(25, POINTS_CORRECT - (25 * int(room.get("clue_index", 0))))
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


def _complete_draw_round(room: dict, outcome: str = "draw", now: float | None = None) -> None:
    now = now or time.time()
    active = _active_round(room)
    if not active or active.get("mode") != "draw" or room.get("phase") != "round":
        raise ValueError("This drawing round is not active.")
    answers = room.get("draw_answers", {})
    correct_count = sum(1 for answer in answers.values() if answer.get("correct"))
    guesser_count = len(_draw_guesser_ids(room))
    drawer_bonus = 0
    active_player = room.get("players", {}).get(room.get("active_player_id") or "")
    if active_player and guesser_count and correct_count >= max(1, (guesser_count + 1) // 2):
        drawer_bonus = 50
        active_player["score"] = int(active_player.get("score", 0)) + drawer_bonus
    room.setdefault("round_results", []).append({
        "round_index": int(room.get("round_index", 0)),
        "answer": active["answer"],
        "mode": active["mode"],
        "outcome": outcome,
        "points": drawer_bonus,
        "player_id": room.get("active_player_id"),
        "team_id": room.get("active_team_id"),
        "correct_guesses": correct_count,
        "guess_count": len(answers),
        "guesser_count": guesser_count,
        "drawer_bonus": drawer_bonus,
    })
    room["last_result"] = room["round_results"][-1]
    room["phase"] = "reveal"
    room.pop("round_deadline", None)


def _maybe_complete_draw_round(room: dict) -> bool:
    active = _active_round(room)
    if room.get("phase") != "round" or not active or active.get("mode") != "draw":
        return False
    if time.time() - float(room.get("round_started_at", 0)) < DRAW_MIN_SECONDS:
        return False
    guesser_ids = _draw_guesser_ids(room)
    if not guesser_ids:
        return False
    answers = room.get("draw_answers", {})
    if all(guesser_id in answers for guesser_id in guesser_ids):
        _complete_draw_round(room, "draw")
        return True
    return False


def _advance_round(room: dict, now: float | None = None) -> None:
    next_index = int(room.get("round_index", 0)) + 1
    if next_index >= len(room.get("rounds", [])):
        _finish_room(room, now)
        return
    room["round_index"] = next_index
    room.pop("last_result", None)
    _start_round(room, now)


def _skip_round(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    active = _active_round(room)
    if not active or room.get("phase") != "round":
        raise ValueError("There is no active card to skip.")
    if active.get("mode") == "draw":
        for player_id, answer in room.get("draw_answers", {}).items():
            if answer.get("correct"):
                player = room.get("players", {}).get(player_id)
                if player:
                    player["score"] = max(0, int(player.get("score", 0)) - POINTS_CORRECT)
    room.setdefault("round_results", []).append({
        "round_index": int(room.get("round_index", 0)),
        "answer": active["answer"],
        "mode": active["mode"],
        "outcome": "skipped",
        "points": 0,
        "player_id": room.get("active_player_id"),
        "team_id": room.get("active_team_id"),
    })
    room.pop("drawing_data", None)
    room["draw_answers"] = {}
    _advance_round(room, now)


def _public_players(room: dict, code: str) -> list[dict]:
    now = time.time()
    players = []
    for player_id, player in room.get("players", {}).items():
        team = _team_meta(player.get("team_id"))
        players.append({
            "id": player_id,
            "name": player["name"],
            "score": int(player.get("score", 0)),
            "connected": _player_connected(player, now),
            "away": bool(player.get("away", False)),
            "team_id": team["id"] if team else None,
            "team_name": room.get("team_names", {}).get(team["id"], team["name"]) if team else None,
            "team_color": team["color"] if team else None,
            "avatar": (
                f"/group-games/{_game_slug(room)}/room/{code}/avatar/{player_id}"
                if player.get("avatar")
                else None
            ),
            "avatar_preset": player.get("avatar_preset"),
        })
    return sorted(players, key=lambda player: (player.get("team_id") or "", -player["score"], player["name"].lower()))


def _public_room(room: dict, code: str) -> dict:
    active = _active_round(room)
    active_player = room.get("players", {}).get(room.get("active_player_id") or "")
    active_team = _team_meta(active_player.get("team_id") if active_player else room.get("active_team_id"))
    visible_round = None
    if active:
        clue_index = int(room.get("clue_index", 0))
        clues = active.get("clues", [])
        visible_round = {
            "mode": active["mode"],
            "theme": active["theme"],
            "answer": active["answer"] if room.get("phase") in {"reveal", "finished"} else None,
            "instruction": active.get("instruction", "") if room.get("phase") in {"reveal", "finished"} else "",
            "clues": clues[: clue_index + 1] if active.get("mode") == "guess" and room.get("phase") in {"round", "reveal", "finished"} else [],
            "clue_count": len(clues),
            "clue_index": clue_index if active.get("mode") == "guess" else None,
            "points_available": (
                max(25, POINTS_CORRECT - (25 * clue_index))
                if active.get("mode") == "guess"
                else POINTS_CORRECT
            ),
            "drawing": room.get("drawing_data") if active.get("mode") == "draw" and room.get("phase") in {"round", "reveal"} else None,
            "choices": active.get("choices", []) if active.get("mode") == "draw" and room.get("phase") == "round" else [],
        }
        if active.get("mode") == "draw":
            guesser_ids = _draw_guesser_ids(room)
            visible_round["answered_count"] = len(room.get("draw_answers", {}))
            visible_round["guesser_count"] = len(guesser_ids)
            visible_round["answered_player_ids"] = list(room.get("draw_answers", {}).keys())
    players = _public_players(room, code)
    return {
        "code": code,
        "phase": room.get("phase", "lobby"),
        "game_type": room.get("game_type", "act_it_out"),
        "control_mode": room.get("control_mode", "hosted"),
        "controller_status": {
            role: bool(pairing.get("claimed"))
            for role, pairing in room.get("controller_pairings", {}).items()
        },
        "game_name": _game_title(room),
        "theme": room.get("theme", "Bible Stories"),
        "team_mode": bool(room.get("team_mode", False)),
        "teams": _team_state(room),
        "players": players,
        "round_index": int(room.get("round_index", 0)),
        "round_total": len(room.get("rounds", [])),
        "round": visible_round,
        "active_player_id": room.get("active_player_id"),
        "active_player_name": active_player.get("name") if active_player else None,
        "active_team_id": active_team["id"] if active_team else None,
        "active_team_name": room.get("team_names", {}).get(active_team["id"], active_team["name"]) if active_team else None,
        "active_team_color": active_team["color"] if active_team else None,
        "timer_seconds": int(room.get("timer_seconds", ROUND_SECONDS)),
        "round_deadline": room.get("round_deadline"),
        "last_result": room.get("last_result"),
        "family_score": sum(player["score"] for player in players),
        "completion_number": int(room.get("completion_number", 0)),
        "expires_at": room.get("expires_at"),
    }


def _require_room(code: str) -> dict:
    room = _get_room(code)
    if not room:
        abort(404)
    return room


def _game_slug(room: dict | None) -> str:
    return "draw-it" if (room or {}).get("game_type") == "draw_it" else "act-it-out"


def _game_title(room: dict | None) -> str:
    if (room or {}).get("game_type") == "family_game_night":
        return "Family Game Night"
    return "Draw It" if _game_slug(room) == "draw-it" else "Act It Out"


def _active_rooms_for_host(email: str) -> list[dict]:
    if not email:
        return []
    client = db()
    if client:
        docs = client.collection("act_it_out_rooms").where(
            filter=google_firestore.FieldFilter("host_email", "==", email)
        ).stream()
        rooms = [(doc.id, doc.to_dict()) for doc in docs]
    else:
        with _local_lock:
            rooms = [(code, deepcopy(room)) for code, room in _local_rooms.items()]
    cutoff = time.time() - ROOM_TTL_SECONDS
    now = time.time()
    expired_codes = [
        code
        for code, room in rooms
        if (
            room.get("host_email") == email
            and (
                now >= float(room.get("expires_at", float("inf")))
                or float(room.get("updated_at", 0)) < cutoff
            )
        )
    ]
    for code in expired_codes:
        _delete_room(code)
    return sorted(
        [
            {
                "code": code,
                "phase": room.get("phase", "lobby"),
                "players": len(room.get("players", {})),
                "theme": room.get("theme", "Bible Stories"),
                "game_type": room.get("game_type", "act_it_out"),
            }
            for code, room in rooms
            if (
                room.get("host_email") == email
                and float(room.get("updated_at", 0)) >= cutoff
                and now < float(room.get("expires_at", float("inf")))
            )
        ],
        key=lambda item: item["code"],
    )


@bp.get("/church-games")
@bp.get("/group-games")
def hub():
    return render_template("group_games.html", noindex=True)


@bp.get("/family-game-night")
def family_game_night():
    """Public product page; stable game URLs remain behind this wrapper."""
    _record_family_page_event("sales_page_view")
    email = _host_email()
    user_data = get_user_doc(email) if email else {}
    owns_complete_game = has_family_game_night_access(user_data)
    return render_template(
        "family_game_night.html",
        owns_complete_game=owns_complete_game,
        included_with_plus=has_active_plus(user_data),
        checkout_available=bool(STRIPE_PRICE_FAMILY_GAME_NIGHT),
    )


def _owns_family_game_night(email: str) -> bool:
    return has_family_game_night_access(get_user_doc(email) if email else {})


def _render_family_setup(error: str | None = None, status: int = 200):
    email = _host_email()
    owns_complete_game = _owns_family_game_night(email)
    try:
        capacity_matrix = (
            load_precomputed_health().get("family_game_night", {}).get("capacity", {}).get("matrix", {})
            if owns_complete_game else {}
        )
    except Exception:
        capacity_matrix = {}
    response = render_template(
        "family_game_night_setup.html",
        is_host_signed_in=bool(email),
        owns_complete_game=owns_complete_game,
        categories=FAMILY_CATEGORIES,
        capacity_matrix=capacity_matrix,
        error=error,
        active_rooms=[room for room in _active_rooms_for_host(email) if room.get("game_type") == "family_game_night"],
        noindex=True,
    )
    return (response, status) if status != 200 else response


@bp.get("/family-game-night/play")
def family_game_night_setup():
    _record_family_page_event("setup_view")
    return _render_family_setup()


@bp.post("/api/family-game-night/analytics")
def family_game_night_analytics_event():
    event = str(request.form.get("event") or (request.get_json(silent=True) or {}).get("event") or "").strip()
    if event not in FAMILY_CTA_EVENTS:
        return jsonify({"error": "Unknown event."}), 400
    session_key = f"family_game_night_metric:{event}"
    if session.get(session_key):
        return jsonify({"ok": True, "duplicate": True})
    rate = check_rate_limit("family-game-night-analytics", _privacy_rate_key(), limit=30, window_seconds=60 * 60)
    if not rate.allowed:
        return jsonify({"ok": True}), 202
    try:
        _record_family_funnel_event(event, {"game_type": "family_game_night"}, "")
    except Exception:
        current_app.logger.exception("Family Game Night CTA analytics failed")
    session[session_key] = True
    return jsonify({"ok": True})


@bp.post("/family-game-night/create")
def create_family_game_night_room():
    email = _host_email()
    if not email:
        return redirect(url_for("google.login", next=url_for("act_it_out.family_game_night_setup")))
    rate = check_rate_limit("family-game-night-create", email, limit=8, window_seconds=60 * 60)
    if not rate.allowed:
        return _render_family_setup("Too many rooms were created recently. Please try again later.", 429)

    play_style = (request.form.get("play_style") or "").strip()
    control_mode = (request.form.get("control_mode") or "hosted").strip()
    game_mode = (request.form.get("game_mode") or "").strip()
    difficulty = (request.form.get("difficulty") or "").strip()
    category_values = request.form.getlist("categories")
    categories = {value.strip() for value in category_values if value.strip()}
    try:
        round_count = int(request.form.get("round_count", ""))
    except (TypeError, ValueError):
        round_count = -1

    errors = []
    if control_mode not in CONTROL_MODES:
        errors.append("Choose Couch Play, Team Play, or Hosted Play.")
    if play_style not in {"teams", "individual"}:
        errors.append("Choose teams or everyone for themselves.")
    if round_count not in ROUND_COUNT_OPTIONS:
        errors.append("Choose a 10, 15, or 20 round game.")
    if game_mode not in FAMILY_GAME_MODES:
        errors.append("Choose Mixed Game Night or one of the four game modes.")
    if difficulty not in FAMILY_DIFFICULTIES:
        errors.append("Choose a family difficulty level.")
    if not categories or not categories <= set(FAMILY_CATEGORIES):
        errors.append("Choose at least one available Bible category.")
    if errors:
        return _render_family_setup(" ".join(errors), 400)

    owns_complete_game = _owns_family_game_night(email)
    if not owns_complete_game and (round_count != 10 or game_mode != "mixed" or difficulty != "whole_family" or categories != set(FAMILY_CATEGORIES)):
        return _render_family_setup("The free game includes 10 mixed rounds for the whole family with all categories. Unlock the complete game to customize these choices.", 403)

    code = _new_code()
    try:
        rounds = _build_rounds(
            code,
            "Mixed Game Night" if game_mode == "mixed" else game_mode,
            round_count,
            "family_game_night",
            categories=categories,
            difficulty=difficulty,
            game_mode=game_mode,
            free_sampler=not owns_complete_game,
            recent_prompt_ids=set(read_recent_history(session.get("family_game_night_recent_prompt_ids"))),
        )
    except ValueError as exc:
        return _render_family_setup(str(exc), 400)
    team_mode = play_style == "teams"
    raw_pairings, controller_pairings = _new_controller_pairings(control_mode)
    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "game_type": "family_game_night",
        "theme": "Mixed Game Night" if game_mode == "mixed" else game_mode,
        "game_mode": game_mode,
        "control_mode": control_mode,
        "difficulty": difficulty,
        "categories": sorted(categories),
        "free_sampler": not owns_complete_game,
        "player_limit": 6 if not owns_complete_game else (TEAM_PLAYER_LIMIT if team_mode else INDIVIDUAL_PLAYER_LIMIT),
        "team_mode": team_mode,
        "team_names": {"gold": "Gold Team", "blue": "Blue Team"},
        "teams": TEAMS if team_mode else [],
        "round_count": round_count,
        "rounds": rounds,
        "round_index": 0,
        "timer_seconds": ROUND_SECONDS,
        "players": {},
        "round_results": [],
        "controller_pairings": controller_pairings,
    }
    _register_host_room(code, room)
    _set_room(code, room)
    if raw_pairings:
        pairings = dict(session.get("family_game_pairing_tokens", {}))
        pairings[code] = raw_pairings
        session["family_game_pairing_tokens"] = pairings
    session["family_game_night_recent_prompt_ids"] = updated_recent_history(
        session.get("family_game_night_recent_prompt_ids"),
        [round_["prompt_id"] for round_ in rounds],
    )
    _record_family_funnel_event("room_created", room, code)
    return redirect(f"/group-games/act-it-out/host/{code}")


@bp.get("/church-games/act-it-out")
@bp.get("/group-games/act-it-out")
def home():
    email = _host_email()
    selected_theme = request.args.get("theme") or "Mix It Up"
    if selected_theme not in {"Mix It Up", *ACT_THEMES}:
        selected_theme = "Mix It Up"
    return render_template(
        "act_it_out_home.html",
        game_title="Act It Out",
        game_slug="act-it-out",
        game_type="act_it_out",
        headline="Bible charades for group game night.",
        subhead="One TV screen, phones for players, and quick rounds where the answer stays secret until reveal.",
        form_action=url_for("act_it_out.create_room"),
        themes=["Mix It Up", *ACT_THEMES],
        theme_counts={
            theme: len(_prompt_pool(theme, "act_it_out"))
            for theme in ["Mix It Up", *ACT_THEMES]
        },
        selected_theme=selected_theme,
        team_default=False,
        is_host_signed_in=bool(email),
        active_rooms=[room for room in _active_rooms_for_host(email) if room.get("game_type") != "draw_it"],
        noindex=True,
    )


@bp.get("/group-games/draw-it")
def draw_it_home():
    email = _host_email()
    return render_template(
        "act_it_out_home.html",
        game_title="Draw It",
        game_slug="draw-it",
        game_type="draw_it",
        headline="Draw a Bible prompt. Everyone guesses on phones.",
        subhead="A shared-screen drawing game built for families, classrooms, and bigger groups.",
        form_action=url_for("act_it_out.create_draw_room"),
        themes=["Mix It Up", *DRAW_THEMES],
        theme_counts={
            theme: len(_prompt_pool(theme, "draw_it"))
            for theme in ["Mix It Up", *DRAW_THEMES]
        },
        selected_theme=request.args.get("theme") if request.args.get("theme") in {"Mix It Up", *DRAW_THEMES} else "Mix It Up",
        team_default=False,
        is_host_signed_in=bool(email),
        active_rooms=[room for room in _active_rooms_for_host(email) if room.get("game_type") == "draw_it"],
        noindex=True,
    )


@bp.post("/church-games/act-it-out/create")
@bp.post("/group-games/act-it-out/create")
def create_room():
    return _create_room("act_it_out")


@bp.post("/group-games/draw-it/create")
def create_draw_room():
    return _create_room("draw_it")


def _create_room(game_type: str):
    email = _host_email()
    if not email:
        next_url = url_for("act_it_out.draw_it_home") if game_type == "draw_it" else url_for("act_it_out.home")
        return redirect(url_for("google.login", next=next_url))
    rate = check_rate_limit("act-it-out-create", email or get_client_ip(), limit=8, window_seconds=60 * 60)
    if not rate.allowed:
        return "Too many rooms created. Please try again later.", 429
    theme = request.form.get("theme") or "Mix It Up"
    allowed_themes = set(["Mix It Up", *DRAW_THEMES] if game_type == "draw_it" else ["Mix It Up", *ACT_THEMES])
    if theme not in allowed_themes:
        theme = "Mix It Up"
    team_mode = request.form.get("team_mode") == "on"
    try:
        round_count = int(request.form.get("round_count", DEFAULT_ROUNDS))
    except (TypeError, ValueError):
        round_count = DEFAULT_ROUNDS
    if round_count not in ROUND_COUNT_OPTIONS:
        round_count = DEFAULT_ROUNDS
    code = _new_code()
    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "game_type": game_type,
        "theme": theme,
        "team_mode": team_mode,
        "teams": TEAMS if team_mode else [],
        "round_count": round_count,
        "rounds": _build_rounds(code, theme, round_count, game_type),
        "round_index": 0,
        "timer_seconds": ROUND_SECONDS,
        "players": {},
        "round_results": [],
    }
    _register_host_room(code, room)
    _set_room(code, room)
    host_path = f"/group-games/draw-it/host/{code}" if game_type == "draw_it" else f"/group-games/act-it-out/host/{code}"
    return redirect(host_path)


@bp.get("/church-games/act-it-out/host/<code>")
@bp.get("/group-games/act-it-out/host/<code>")
@bp.get("/group-games/draw-it/host/<code>")
def host_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if not _is_host(code, room) and _controller_role(code, room) != "host":
        abort(403)
    return render_template("act_it_out_room.html", code=code, role="host", game_slug=_game_slug(room), game_title=_game_title(room), noindex=True)


@bp.get("/church-games/act-it-out/display/<code>")
@bp.get("/group-games/act-it-out/display/<code>")
@bp.get("/group-games/draw-it/display/<code>")
def display_room(code: str):
    code = code.upper()
    room = _require_room(code)
    return render_template("act_it_out_room.html", code=code, role="display", game_slug=_game_slug(room), game_title=_game_title(room), noindex=True)


@bp.route("/family-game-night/controller/<code>", methods=["GET", "POST"])
def pair_family_controller(code: str):
    code = code.upper()
    room = _require_room(code)
    if room.get("game_type") != "family_game_night":
        abort(404)
    error = None
    if request.method == "POST":
        rate = check_rate_limit("family-controller-pair", _privacy_rate_key(), limit=12, window_seconds=10 * 60)
        if not rate.allowed:
            error = "Too many pairing attempts. Wait a few minutes."
        else:
            token = (request.form.get("pairing_token") or "").strip()
            digest = hashlib.sha256(token.encode()).hexdigest()
            claimed = {}
            def claim(current):
                for role, pairing in current.get("controller_pairings", {}).items():
                    if secrets.compare_digest(pairing.get("token_hash", ""), digest):
                        if pairing.get("claimed") or time.time() > float(pairing.get("expires_at", 0)):
                            raise ValueError("This pairing code expired or was already used.")
                        pairing["claimed"] = True
                        paused_round_seconds = pairing.pop("resume_round_seconds", None)
                        if paused_round_seconds is not None and current.get("phase") == "round":
                            current["round_deadline"] = time.time() + max(1, float(paused_round_seconds))
                        claimed["generation"] = pairing.get("generation")
                        if role == "host":
                            claimed.update(role=role, player_id=None)
                            return
                        if role == "couch":
                            # Couch Play has one physical controller. If someone
                            # followed the public player link first, normalize
                            # that accidental lobby state instead of creating a
                            # mysterious third participant.
                            if current.get("phase") == "lobby":
                                current["players"] = {}
                        player_id = secrets.token_urlsafe(8)
                        pairing["player_id"] = player_id
                        team_id = role if role in {"gold", "blue"} else "gold"
                        current.setdefault("players", {})[player_id] = {"name": f"{team_id.title()} Team Controller" if role != "couch" else "Family Controller", "score": int(pairing.pop("recovery_score", 0)), "joined_at": time.time(), "last_seen": time.time(), "away": False, "team_id": team_id if current.get("team_mode") else None, "avatar": None, "avatar_preset": "sunflower" if team_id == "gold" else "ocean"}
                        if role == "couch" and current.get("team_mode"):
                            current["players"].setdefault("couch-blue-team", {"name": "Blue Team", "score": 0, "joined_at": time.time() + .001, "last_seen": time.time(), "away": False, "team_id": "blue", "avatar": None, "avatar_preset": "ocean", "virtual_controller_team": True})
                        claimed.update(role=role, player_id=player_id)
                        return
                raise ValueError("That pairing code is not valid for this room.")
            try:
                _mutate_room(code, claim)
            except ValueError as exc:
                error = str(exc)
            if claimed:
                if claimed.get("player_id"):
                    session[_player_session_key(code)] = claimed["player_id"]
                roles = dict(session.get("family_game_controller_roles", {})); roles[code] = {"role": claimed["role"], "generation": claimed["generation"]}; session["family_game_controller_roles"] = roles
                return redirect(f"/group-games/act-it-out/host/{code}" if claimed["role"] == "host" else f"/group-games/act-it-out/play/{code}")
    response = render_template("family_game_controller_pair.html", code=code, error=error, noindex=True)
    return response, (400 if error else 200), {"Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store"}


@bp.get("/church-games/act-it-out/room/<code>/qr")
@bp.get("/group-games/act-it-out/room/<code>/qr")
@bp.get("/group-games/draw-it/room/<code>/qr")
def room_qr(code: str):
    code = code.upper()
    room = _require_room(code)
    join_url = request.url_root.rstrip("/") + f"/group-games/{_game_slug(room)}/join/{code}"
    image = qrcode.make(join_url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    response = send_file(output, mimetype="image/png", download_name=f"act-it-out-{code}.png")
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.get("/group-games/act-it-out/room/<code>/controller-qr/<role>")
def controller_pair_qr(code: str, role: str):
    """Render a private pairing QR without putting its capability in request logs."""
    code = code.upper()
    room = _require_room(code)
    if not _is_host(code, room) or role not in room.get("controller_pairings", {}):
        abort(403)
    all_tokens = session.get("family_game_pairing_tokens", {})
    token = all_tokens.get(code, {}).get(role) if isinstance(all_tokens, dict) else None
    pairing = room.get("controller_pairings", {}).get(role, {})
    if not token or pairing.get("claimed") or time.time() > float(pairing.get("expires_at", 0)):
        abort(410)
    pair_url = request.url_root.rstrip("/") + f"/family-game-night/controller/{code}#{token}"
    image = qrcode.make(pair_url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    response = send_file(output, mimetype="image/png", download_name=f"family-controller-{code}-{role}.png")
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@bp.post("/api/family-game-night/rooms/<code>/controllers/<role>/replace")
def replace_family_controller(code: str, role: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room) or role not in (room or {}).get("controller_pairings", {}):
        abort(403)
    rate = check_rate_limit("family-controller-replace", _privacy_rate_key(), limit=20, window_seconds=60 * 60)
    if not rate.allowed:
        return jsonify({"error": "Too many controller replacements. Try again later."}), 429
    token = secrets.token_urlsafe(32)
    replacement = {
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "expires_at": time.time() + CONTROLLER_PAIR_TTL_SECONDS,
        "claimed": False,
        "generation": secrets.token_urlsafe(16),
    }

    def replace(current):
        old = current.get("controller_pairings", {}).get(role, {})
        controls_active_turn = (
            current.get("control_mode") == "couch" and role == "couch"
        ) or (
            current.get("control_mode") == "team_auto" and role == current.get("active_team_id")
        )
        if controls_active_turn and current.get("phase") == "round" and current.get("round_deadline"):
            replacement["resume_round_seconds"] = max(1, float(current.pop("round_deadline")) - time.time())
        old_player = old.get("player_id")
        if old_player:
            player = current.get("players", {}).pop(old_player, None)
            if player:
                replacement["recovery_score"] = int(player.get("score", 0))
        current["controller_pairings"][role] = replacement

    if _mutate_room(code, replace) is None:
        abort(404)
    all_tokens = dict(session.get("family_game_pairing_tokens", {}))
    room_tokens = dict(all_tokens.get(code, {})); room_tokens[role] = token; all_tokens[code] = room_tokens
    session["family_game_pairing_tokens"] = all_tokens
    return jsonify({"ok": True, "token": token})


@bp.post("/api/family-game-night/rooms/<code>/teams/names")
def rename_family_teams(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)
    payload = request.get_json(silent=True) or {}
    names = {}
    for team in ("gold", "blue"):
        name = " ".join(str(payload.get(team) or "").strip().split())
        if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
            return jsonify({"error": "Use simple family-friendly team names up to 18 characters."}), 400
        names[team] = name
    if names["gold"].casefold() == names["blue"].casefold():
        return jsonify({"error": "Choose two different team names."}), 400

    def rename(current):
        current["team_names"] = names
        for player in current.get("players", {}).values():
            if player.get("virtual_controller_team"):
                player["name"] = names[player["team_id"]]

    if _mutate_room(code, rename) is None:
        abort(404)
    return jsonify({"ok": True})


@bp.get("/church-games/act-it-out/room/<code>/avatar/<player_id>")
@bp.get("/group-games/act-it-out/room/<code>/avatar/<player_id>")
@bp.get("/group-games/draw-it/room/<code>/avatar/<player_id>")
def player_avatar(code: str, player_id: str):
    room = _require_room(code.upper())
    avatar = room.get("players", {}).get(player_id, {}).get("avatar", "")
    if not avatar or not _valid_avatar_data(avatar):
        abort(404)
    image_bytes = base64.b64decode(avatar.split(",", 1)[1], validate=True)
    response = send_file(io.BytesIO(image_bytes), mimetype="image/jpeg")
    response.headers["Cache-Control"] = "private, max-age=300"
    return response


def _render_join_page(code: str, error: str | None = None):
    room = _get_room(code)
    return render_template(
        "act_it_out_join.html",
        code=code,
        error=error,
        team_mode=bool((room or {}).get("team_mode")),
        game_slug=_game_slug(room),
        game_title=_game_title(room),
        preset_avatars=PRESET_AVATARS,
        noindex=True,
    )


@bp.route("/church-games/act-it-out/join/<code>", methods=["GET", "POST"])
@bp.route("/group-games/act-it-out/join/<code>", methods=["GET", "POST"])
@bp.route("/group-games/draw-it/join/<code>", methods=["GET", "POST"])
def join_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if room.get("game_type") == "family_game_night" and room.get("control_mode") in {"couch", "team_auto"}:
        return "This room uses private controllers. Ask the host for the matching controller invite.", 403
    existing_id = _player_id(code)
    if request.method == "POST":
        rate = check_rate_limit(
            "act-it-out-join",
            get_client_ip(),
            limit=80 if room.get("team_mode") else 60,
            window_seconds=10 * 60,
        )
        if not rate.allowed:
            return _render_join_page(code, "Too many join attempts. Please wait a few minutes."), 429
        name = " ".join((request.form.get("player_name") or "").strip().split())
        if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
            return _render_join_page(code, "Choose a simple family-friendly name using letters or numbers."), 400
        if room.get("phase") != "lobby":
            return _render_join_page(code, "This game has already started."), 409
        player_id = existing_id or secrets.token_urlsafe(8)
        avatar = (request.form.get("avatar_data") or "").strip()
        avatar_preset = (request.form.get("avatar_preset") or "").strip()
        if avatar_preset not in PRESET_AVATARS:
            avatar_preset = ""
        if not _valid_avatar_data(avatar):
            return _render_join_page(
                code, "That picture could not be prepared. Try another selfie or join without one."
            ), 400
        if room.get("team_mode") and avatar:
            return _render_join_page(
                code, "Team rooms use preset avatars to keep large games fast. Choose a preset instead."
            ), 400

        def add_player(current):
            if current.get("team_mode") and avatar:
                raise ValueError("Team rooms use preset avatars to keep large games fast. Choose a preset instead.")
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
                "avatar": avatar or existing.get("avatar"),
                "avatar_preset": "" if avatar else (
                    avatar_preset or existing.get("avatar_preset", "")
                ),
            }

        try:
            result = _mutate_room(code, add_player)
        except ValueError as exc:
            return _render_join_page(code, str(exc)), 409
        joined_room = result[1] if result else None
        if joined_room and len(joined_room.get("players", {})) == 1:
            _record_family_funnel_event("first_player_joined", joined_room, code)
        session[_player_session_key(code)] = player_id
        return redirect(f"/group-games/{_game_slug(room)}/play/{code}")
    if existing_id and existing_id in room.get("players", {}):
        return redirect(f"/group-games/{_game_slug(room)}/play/{code}")
    return _render_join_page(code)


@bp.get("/church-games/act-it-out/play/<code>")
@bp.get("/group-games/act-it-out/play/<code>")
@bp.get("/group-games/draw-it/play/<code>")
def player_room(code: str):
    code = code.upper()
    room = _require_room(code)
    player_id = _player_id(code)
    if not player_id or player_id not in room.get("players", {}):
        return redirect(f"/group-games/{_game_slug(room)}/join/{code}")
    return render_template("act_it_out_room.html", code=code, role="player", game_slug=_game_slug(room), game_title=_game_title(room), noindex=True)


@bp.post("/api/church-games/act-it-out/rooms/<code>/profile")
@bp.post("/api/group-games/act-it-out/rooms/<code>/profile")
@bp.post("/api/group-games/draw-it/rooms/<code>/profile")
def update_player_profile(code: str):
    code = code.upper()
    player_id = _player_id(code)
    if not player_id:
        abort(403)
    payload = request.get_json(silent=True) or {}
    name = " ".join(str(payload.get("player_name") or "").strip().split())
    avatar = payload.get("avatar_data")
    avatar_preset = str(payload.get("avatar_preset") or "").strip()
    if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
        return jsonify({"error": "Choose a simple family-friendly name using letters or numbers."}), 400
    if avatar_preset not in PRESET_AVATARS:
        avatar_preset = ""
    if avatar is not None:
        avatar = str(avatar).strip()
        if not _valid_avatar_data(avatar):
            return jsonify({"error": "That picture could not be prepared. Try another selfie or use a preset."}), 400

    def update(current):
        if current.get("phase") != "lobby":
            raise ValueError("Player profiles can only be changed before the game starts.")
        player = current.get("players", {}).get(player_id)
        if not player:
            raise PermissionError
        if any(
            other_id != player_id and other.get("name", "").casefold() == name.casefold()
            for other_id, other in current.get("players", {}).items()
        ):
            raise ValueError("That player name is already in this room. Add a family initial or nickname.")
        player["name"] = name
        player["last_seen"] = time.time()
        if avatar is not None:
            if current.get("team_mode") and avatar:
                raise ValueError("Team rooms use preset avatars to keep large games fast. Choose a preset instead.")
            player["avatar"] = avatar
            player["avatar_preset"] = "" if avatar else avatar_preset
        elif "avatar_preset" in payload:
            player["avatar"] = ""
            player["avatar_preset"] = avatar_preset

    try:
        result = _mutate_room(code, update)
    except PermissionError:
        abort(403)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.get("/api/church-games/act-it-out/rooms/<code>")
@bp.get("/api/group-games/act-it-out/rooms/<code>")
@bp.get("/api/group-games/draw-it/rooms/<code>")
def room_state(code: str):
    code = code.upper()
    room = _require_room(code)
    active_for_timing = _active_round(room)
    if (
        room.get("phase") == "round"
        and room.get("control_mode") == "team_auto"
        and active_for_timing
        and active_for_timing.get("mode") == "guess"
    ):
        elapsed = max(0, time.time() - float(room.get("round_started_at", time.time())))
        scheduled_index = min(len(active_for_timing.get("clues", [])) - 1, int(elapsed // 8))
        if scheduled_index > int(room.get("clue_index", 0)):
            def advance_scheduled_clue(current):
                current["clue_index"] = max(int(current.get("clue_index", 0)), scheduled_index)
            result = _mutate_room(code, advance_scheduled_clue)
            if result:
                room = result[1]
    if room.get("phase") == "round" and room.get("round_deadline") and time.time() >= float(room["round_deadline"]):
        def expire(current):
            if current.get("phase") == "round":
                active = _active_round(current)
                if active and active.get("mode") == "draw":
                    _complete_draw_round(current, "timeout")
                else:
                    _complete_round(current, "pass")
        result = _mutate_room(code, expire)
        if result is None:
            abort(404)
        room = result[1]
    if room.get("phase") in {"prepare", "round"}:
        active = _active_round(room)
        if active and active.get("mode") == "draw":
            guesser_ids = _draw_guesser_ids(room)
            if guesser_ids and all(guesser_id in room.get("draw_answers", {}) for guesser_id in guesser_ids):
                def complete_if_ready(current):
                    _maybe_complete_draw_round(current)

                result = _mutate_room(code, complete_if_ready)
                if result is None:
                    abort(404)
                room = result[1]
    state = _public_room(room, code)
    player_id = _player_id(code)
    active = _active_round(room)
    player = room.get("players", {}).get(player_id or "")
    control_mode = room.get("control_mode", "hosted")
    controller_role = _controller_role(code)
    can_control = bool(
        _is_host(code, room)
        or (control_mode == "hosted" and controller_role == "host")
        or (control_mode == "couch" and controller_role == "couch")
        or (control_mode == "team_auto" and controller_role == room.get("active_team_id"))
    )
    viewer = {"is_host": _is_host(code, room), "player_id": player_id, "can_control": can_control, "controller_role": controller_role}
    if viewer["is_host"]:
        all_tokens = session.get("family_game_pairing_tokens", {})
        viewer["pairing_tokens"] = all_tokens.get(code, {}) if isinstance(all_tokens, dict) else {}
    if active and not room.get("prompt_locked") and (
        viewer["is_host"]
        or (active.get("mode") != "guess" and can_control)
        or (active.get("mode") != "guess" and player_id and player_id == room.get("active_player_id"))
    ):
        viewer["secret_prompt"] = {
            "answer": active["answer"],
            "mode": active["mode"],
            "instruction": active.get("instruction", ""),
            "forbidden_words": active.get("forbidden_words", []),
            "clues": active.get("clues", []),
        }
    if active and active.get("mode") == "draw" and player_id:
        draw_answer = room.get("draw_answers", {}).get(player_id)
        if draw_answer:
            viewer["draw_answer"] = {
                "choice": draw_answer.get("choice"),
                "correct": bool(draw_answer.get("correct")),
            }
    state["viewer"] = viewer
    return jsonify(state)


@bp.post("/api/church-games/act-it-out/rooms/<code>/start")
@bp.post("/api/group-games/act-it-out/rooms/<code>/start")
@bp.post("/api/group-games/draw-it/rooms/<code>/start")
def start_game(code: str):
    code = code.upper()
    room = _get_room(code)
    player_id = _player_id(code)
    if not _is_host(code, room) and not _controller_role(code):
        abort(403)

    def start(current):
        pairings = current.get("controller_pairings", {})
        if current.get("control_mode") == "couch" and not pairings.get("couch", {}).get("claimed"):
            raise ValueError("Pair the Couch controller phone first. You do not add a second team manually.")
        if current.get("control_mode") == "team_auto" and not all(pairings.get(role, {}).get("claimed") for role in ("gold", "blue")):
            raise ValueError("Pair both the Gold and Blue team phones before starting.")
        if not current.get("players"):
            raise ValueError("Invite at least one player before starting.")
        if current.get("game_type") == "draw_it" and len(_available_players(current, connected_only=True)) < 2:
            raise ValueError("Draw It needs at least two connected players: one to draw and one to guess.")
        if current.get("team_mode"):
            teams_with_players = {
                player.get("team_id")
                for _player_id, player in _available_players(current, connected_only=True)
            }
            if not all(team["id"] in teams_with_players for team in TEAMS):
                raise ValueError("Team mode needs at least one connected player on each team.")
        elif not _available_players(current, connected_only=True):
            raise ValueError("Invite at least one connected player before starting.")
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
    _record_family_funnel_event("game_started", result[1], code)
    return jsonify({"ok": True})


def _host_action(code: str, action: str):
    code = code.upper()
    room = _get_room(code)
    control_mode = (room or {}).get("control_mode", "hosted")
    controller_role = _controller_role(code)
    controller_allowed = bool(
        (control_mode == "hosted" and controller_role == "host")
        or
        (control_mode == "couch" and controller_role == "couch")
        or (control_mode == "team_auto" and controller_role == (room or {}).get("active_team_id"))
    )
    if not _is_host(code, room) and not controller_allowed:
        abort(403)

    def mutate(current):
        if action == "ready":
            if current.get("phase") != "prepare":
                raise ValueError("This prompt is not waiting for readiness.")
            current["prompt_locked"] = True
            current["phase"] = "round"
            current["round_started_at"] = time.time()
            current["round_deadline"] = time.time() + int(current.get("timer_seconds", ROUND_SECONDS))
        elif action in {"correct", "pass", "forbidden"}:
            active = _active_round(current)
            if active and active.get("mode") == "draw" and current.get("control_mode", "hosted") == "hosted":
                _complete_draw_round(current, "manual")
            else:
                _complete_round(current, action)
        elif action == "clue":
            active = _active_round(current)
            if current.get("phase") != "round" or not active or active.get("mode") != "guess":
                raise ValueError("There is no clue to reveal right now.")
            max_index = max(0, len(active.get("clues", [])) - 1)
            current["clue_index"] = min(max_index, int(current.get("clue_index", 0)) + 1)
        elif action == "next":
            if current.get("phase") != "reveal":
                raise ValueError("Score or pass this round before continuing.")
            _advance_round(current)
        elif action == "skip":
            _skip_round(current)
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
    if result[1].get("phase") == "finished":
        _record_family_funnel_event("game_finished", result[1], code)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/correct")
@bp.post("/api/group-games/act-it-out/rooms/<code>/correct")
@bp.post("/api/group-games/draw-it/rooms/<code>/correct")
def correct_round(code: str):
    return _host_action(code, "correct")


@bp.post("/api/group-games/act-it-out/rooms/<code>/ready")
def ready_round(code: str):
    return _host_action(code, "ready")


@bp.post("/api/church-games/act-it-out/rooms/<code>/pass")
@bp.post("/api/group-games/act-it-out/rooms/<code>/pass")
@bp.post("/api/group-games/draw-it/rooms/<code>/pass")
def pass_round(code: str):
    return _host_action(code, "pass")


@bp.post("/api/group-games/act-it-out/rooms/<code>/forbidden")
def forbidden_word_round(code: str):
    return _host_action(code, "forbidden")


@bp.post("/api/church-games/act-it-out/rooms/<code>/clue")
@bp.post("/api/group-games/act-it-out/rooms/<code>/clue")
@bp.post("/api/group-games/draw-it/rooms/<code>/clue")
def reveal_clue(code: str):
    return _host_action(code, "clue")


@bp.post("/api/church-games/act-it-out/rooms/<code>/next")
@bp.post("/api/group-games/act-it-out/rooms/<code>/next")
@bp.post("/api/group-games/draw-it/rooms/<code>/next")
def next_round(code: str):
    return _host_action(code, "next")


@bp.post("/api/church-games/act-it-out/rooms/<code>/skip")
@bp.post("/api/group-games/act-it-out/rooms/<code>/skip")
@bp.post("/api/group-games/draw-it/rooms/<code>/skip")
def skip_round(code: str):
    return _host_action(code, "skip")


@bp.post("/api/church-games/act-it-out/rooms/<code>/end")
@bp.post("/api/group-games/act-it-out/rooms/<code>/end")
@bp.post("/api/group-games/draw-it/rooms/<code>/end")
def end_game(code: str):
    return _host_action(code, "end")


@bp.post("/api/group-games/act-it-out/rooms/<code>/feedback")
def submit_family_game_night_feedback(code: str):
    code = code.upper()
    room = _get_room(code)
    if not room or room.get("game_type") != "family_game_night" or room.get("phase") != "finished":
        abort(404)
    player_id = _player_id(code)
    if not _is_host(code, room) and (not player_id or player_id not in room.get("players", {})):
        abort(403)
    submitted_key = f"family_game_night_feedback:{code}:{int(room.get('completion_number', 1))}"
    if session.get(submitted_key):
        return jsonify({"ok": True, "duplicate": True})
    rate = check_rate_limit("family-game-night-feedback", _privacy_rate_key(), limit=5, window_seconds=60 * 60)
    if not rate.allowed:
        return jsonify({"error": "Please wait before sending more feedback."}), 429

    payload = request.get_json(silent=True) or {}
    try:
        enjoyment = int(payload.get("enjoyment"))
    except (TypeError, ValueError):
        enjoyment = 0
    favorite_mode = str(payload.get("favorite_mode") or "").strip()
    play_again = str(payload.get("play_again") or "").strip()
    comment = " ".join(str(payload.get("comment") or "").strip().split())
    quote_approved = payload.get("quote_approved") is True
    if enjoyment not in {1, 2, 3, 4, 5}:
        return jsonify({"error": "Choose an enjoyment rating from 1 to 5."}), 400
    if favorite_mode not in FEEDBACK_FAVORITE_MODES:
        return jsonify({"error": "Choose a favorite way to play."}), 400
    if play_again not in FEEDBACK_PLAY_AGAIN:
        return jsonify({"error": "Choose whether your family would play again."}), 400
    if len(comment) > 500:
        return jsonify({"error": "Keep feedback to 500 characters or fewer."}), 400

    client = db()
    if not client:
        return jsonify({"error": "Feedback could not be saved right now."}), 503
    try:
        client.collection("family_game_night_feedback").add(
            {
                "enjoyment": enjoyment,
                "favoriteMode": favorite_mode,
                "playAgain": play_again,
                "comment": comment,
                "quoteApproved": quote_approved,
                "teamMode": bool(room.get("team_mode")),
                "roundCount": int(room.get("round_count", 0)),
                "gameMode": room.get("game_mode", "mixed"),
                "createdAt": google_firestore.SERVER_TIMESTAMP,
            }
        )
        client.collection("analytics").document("family_game_night_feedback").set(
            {
                "total": google_firestore.Increment(1),
                "ratingSum": google_firestore.Increment(enjoyment),
                "playAgain": {play_again: google_firestore.Increment(1)},
                "favoriteMode": {favorite_mode: google_firestore.Increment(1)},
                "updatedAt": google_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        current_app.logger.exception("Family Game Night feedback persistence failed")
        return jsonify({"error": "Feedback could not be saved right now."}), 503
    session[submitted_key] = True
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/play-again")
@bp.post("/api/group-games/act-it-out/rooms/<code>/play-again")
@bp.post("/api/group-games/draw-it/rooms/<code>/play-again")
def play_again_same_players(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def reset(current):
        if current.get("phase") != "finished":
            raise ValueError("Finish the current game before starting another one.")
        round_count = int(current.get("round_count") or len(current.get("rounds", [])) or DEFAULT_ROUNDS)
        current["round_count"] = round_count
        current["rounds"] = _build_rounds(
            f"{code}-{int(time.time())}",
            current.get("theme", "Mix It Up"),
            round_count,
            current.get("game_type", "act_it_out"),
            categories=set(current.get("categories") or FAMILY_CATEGORIES),
            difficulty=current.get("difficulty", "whole_family"),
            game_mode=current.get("game_mode", "mixed"),
            free_sampler=bool(current.get("free_sampler", False)),
            recent_prompt_ids=set(read_recent_history(session.get("family_game_night_recent_prompt_ids"))),
        )
        current["round_index"] = 0
        current["round_results"] = []
        current["phase"] = "lobby"
        current.pop("finished_at", None)
        current.pop("last_result", None)
        current.pop("round_deadline", None)
        current.pop("round_started_at", None)
        current.pop("drawing_data", None)
        current.pop("draw_answers", None)
        current.pop("active_player_id", None)
        current.pop("active_team_id", None)
        for player in current.get("players", {}).values():
            player["score"] = 0
            player["away"] = False
            player["last_seen"] = time.time()

    try:
        result = _mutate_room(code, reset)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    updated_room = result[1]
    if updated_room.get("game_type") == "family_game_night":
        session["family_game_night_recent_prompt_ids"] = updated_recent_history(
            session.get("family_game_night_recent_prompt_ids"),
            [round_["prompt_id"] for round_ in updated_room.get("rounds", [])],
        )
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/heartbeat")
@bp.post("/api/group-games/act-it-out/rooms/<code>/heartbeat")
@bp.post("/api/group-games/draw-it/rooms/<code>/heartbeat")
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
        if current.get("control_mode") == "couch":
            for teammate in current.get("players", {}).values():
                if teammate.get("virtual_controller_team"):
                    teammate["last_seen"] = time.time()

    try:
        result = _mutate_room(code, beat)
    except PermissionError:
        abort(403)
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/drawing")
@bp.post("/api/group-games/act-it-out/rooms/<code>/drawing")
@bp.post("/api/group-games/draw-it/rooms/<code>/drawing")
def submit_drawing(code: str):
    code = code.upper()
    player_id = _player_id(code)
    data = (request.get_json(silent=True) or {}).get("drawing", "")
    if not player_id:
        abort(403)
    if not _valid_drawing_data(data):
        return jsonify({"error": "That drawing could not be sent. Try clearing and drawing again."}), 400

    def save(current):
        active = _active_round(current)
        if current.get("phase") != "round" or not active or active.get("mode") != "draw":
            raise ValueError("This is not a drawing round.")
        if current.get("active_player_id") != player_id:
            raise PermissionError
        player = current.get("players", {}).get(player_id)
        if player:
            player["last_seen"] = time.time()
        current["drawing_data"] = data

    try:
        result = _mutate_room(code, save)
    except PermissionError:
        abort(403)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/group-games/draw-it/rooms/<code>/guess")
@bp.post("/api/group-games/act-it-out/rooms/<code>/guess")
def submit_draw_guess(code: str):
    code = code.upper()
    player_id = _player_id(code)
    choice = str((request.get_json(silent=True) or {}).get("choice", "")).strip()
    if not player_id:
        abort(403)

    def save(current):
        active = _active_round(current)
        if current.get("phase") != "round" or not active or active.get("mode") != "draw":
            raise ValueError("This is not a drawing guess round.")
        if current.get("active_player_id") == player_id:
            raise ValueError("The drawer does not guess this round.")
        player = current.get("players", {}).get(player_id)
        if not player or player.get("away"):
            raise PermissionError
        player["last_seen"] = time.time()
        choices = active.get("choices", [])
        if choice not in choices:
            raise ValueError("Choose one of the answers on your screen.")
        answers = current.setdefault("draw_answers", {})
        if player_id in answers:
            raise ValueError("Your answer is already locked.")
        correct = choice == active["answer"]
        if correct:
            player["score"] = int(player.get("score", 0)) + POINTS_CORRECT
        answers[player_id] = {
            "choice": choice,
            "correct": correct,
            "answered_at": time.time(),
        }
        _maybe_complete_draw_round(current)

    try:
        result = _mutate_room(code, save)
    except PermissionError:
        abort(403)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/group-games/draw-it/rooms/<code>/draw-correct")
@bp.post("/api/group-games/act-it-out/rooms/<code>/draw-correct")
def award_spoken_draw_guess(code: str):
    """Let the host record a correct Draw It guess called out aloud."""
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)
    player_id = str((request.get_json(silent=True) or {}).get("player_id", "")).strip()

    def award(current):
        active = _active_round(current)
        if current.get("phase") != "round" or not active or active.get("mode") != "draw":
            raise ValueError("This is not a drawing guess round.")
        if player_id == current.get("active_player_id"):
            raise ValueError("The drawer cannot receive a guessing point.")
        player = current.get("players", {}).get(player_id)
        eligible_ids = set(_draw_guesser_ids(current))
        if not player or player_id not in eligible_ids:
            raise ValueError("Choose a connected guesser.")
        answers = current.setdefault("draw_answers", {})
        if player_id in answers:
            raise ValueError("That player's answer is already locked.")
        player["score"] = int(player.get("score", 0)) + POINTS_CORRECT
        answers[player_id] = {
            "choice": active["answer"],
            "correct": True,
            "answered_at": time.time(),
            "awarded_by_host": True,
        }
        _maybe_complete_draw_round(current)

    try:
        result = _mutate_room(code, award)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/teams/rebalance")
@bp.post("/api/group-games/act-it-out/rooms/<code>/teams/rebalance")
@bp.post("/api/group-games/draw-it/rooms/<code>/teams/rebalance")
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
@bp.post("/api/group-games/act-it-out/rooms/<code>/players/<player_id>/team")
@bp.post("/api/group-games/draw-it/rooms/<code>/players/<player_id>/team")
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


@bp.post("/api/church-games/act-it-out/rooms/<code>/players/<player_id>/away")
@bp.post("/api/group-games/act-it-out/rooms/<code>/players/<player_id>/away")
@bp.post("/api/group-games/draw-it/rooms/<code>/players/<player_id>/away")
def toggle_player_away(code: str, player_id: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room):
        abort(403)

    def toggle(current):
        if current.get("phase") not in {"lobby", "round"}:
            raise ValueError("Players can be marked away while gathering or playing a card.")
        player = current.get("players", {}).get(player_id)
        if not player:
            raise ValueError("That player is no longer in the room.")
        marking_away = not bool(player.get("away", False))
        if current.get("phase") == "round" and current.get("active_player_id") == player_id and marking_away:
            now = time.time()
            alternates = [
                other
                for other_id, other in current.get("players", {}).items()
                if other_id != player_id and not other.get("away", False) and _player_connected(other, now)
            ]
            if not alternates:
                raise ValueError("No other connected players are available for this card.")
        player["away"] = marking_away
        player["last_seen"] = time.time()
        if current.get("phase") == "round":
            active = _active_round(current)
            if current.get("active_player_id") == player_id:
                _start_round(current)
            elif active and active.get("mode") == "draw":
                _maybe_complete_draw_round(current)

    try:
        result = _mutate_room(code, toggle)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/church-games/act-it-out/rooms/<code>/players/<player_id>/remove")
@bp.post("/api/group-games/act-it-out/rooms/<code>/players/<player_id>/remove")
@bp.post("/api/group-games/draw-it/rooms/<code>/players/<player_id>/remove")
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


@bp.post("/api/church-games/act-it-out/rooms/<code>/close")
@bp.post("/api/group-games/act-it-out/rooms/<code>/close")
@bp.post("/api/group-games/draw-it/rooms/<code>/close")
def close_room(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _can_delete_room(code, room):
        abort(403)
    redirect_url = url_for("act_it_out.draw_it_home") if _game_slug(room) == "draw-it" else url_for("act_it_out.home")
    _delete_room(code)
    _forget_host_room(code)
    return jsonify({"ok": True, "redirect": redirect_url})


@bp.post("/church-games/act-it-out/rooms/<code>/delete")
@bp.post("/group-games/act-it-out/rooms/<code>/delete")
@bp.post("/group-games/draw-it/rooms/<code>/delete")
def delete_room_from_home(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _can_delete_room(code, room):
        abort(403)
    redirect_url = url_for("act_it_out.draw_it_home") if _game_slug(room) == "draw-it" else url_for("act_it_out.home")
    _delete_room(code)
    _forget_host_room(code)
    return redirect(redirect_url)
