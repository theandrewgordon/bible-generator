"""Family Bible Bee: a small, room-code Scripture memory party game."""

from __future__ import annotations

import base64
import binascii
import io
import hashlib
import os
import re
import secrets
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone

import qrcode
from flask import Blueprint, abort, current_app, jsonify, redirect, render_template, request, send_file, session, url_for
from google.api_core import exceptions as google_exceptions
from google.cloud import firestore as google_firestore

from faithsparks.services.firestore import db
from faithsparks.services.controller_capability import (
    read_controller_capability,
    read_controller_invite,
    set_controller_capability,
    set_controller_invite,
)
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.bible_bee_content import (
    DECKS,
    DIFFICULTIES,
    GAME_STYLES,
    TRANSLATIONS,
    build_questions,
    deck_options,
    load_passages,
    load_reference_passages,
    translation_options,
)
from faithsparks.services.game_content import read_recent_history, updated_recent_history
from faithsparks.services.bible_bee_ai import (
    BibleBeeAIError,
    create_one_off_plan,
    validate_questions,
)
from faithsparks.util.request_utils import get_client_ip


bp = Blueprint("bible_bee", __name__)

ROOM_TTL_SECONDS = 6 * 60 * 60
FINISHED_ROOM_TTL_SECONDS = 30 * 60
REVEAL_SECONDS = 10
CONTROLLER_PAIR_TTL_SECONDS = 10 * 60
CONTROL_MODES = {"couch", "team_auto", "hosted"}
REVEAL_SECOND_OPTIONS = {5, 10, 15}
CHALLENGE_QUESTION_SECONDS = 30
DIFFICULTY_QUESTION_SECONDS = {"hard": 25, "expert": 20}
PLAYER_CONNECTED_SECONDS = 40
ROOM_CACHE_SECONDS = 5
MAX_AVATAR_DATA_LENGTH = 60_000
INDIVIDUAL_PLAYER_LIMIT = 8
TEAM_PLAYER_LIMIT = 40
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'-]{0,17}$")
BLOCKED_NAMES = {"admin", "host", "moderator", "faithsparks"}
AVATAR_DATA_RE = re.compile(r"^data:image/jpeg;base64,[A-Za-z0-9+/=]+$")
PRESET_AVATARS = {
    "fox": "Friendly fox",
    "sunflower": "Sunflower",
    "ocean": "Ocean sunrise",
    "david": "David with a harp",
    "esther": "Queen Esther",
    "jesus-children": "Jesus welcoming children",
    "noah": "Noah’s ark",
    "empty-tomb": "Empty tomb",
    "cross": "Jesus on the cross",
}
TEAMS = [
    {"id": "gold", "name": "Gold Team", "color": "gold"},
    {"id": "blue", "name": "Blue Team", "color": "blue"},
]

_local_rooms: dict[str, dict] = {}
_room_cache_loaded_at: dict[str, float] = {}
_local_lock = threading.RLock()
RETRYABLE_STORAGE_ERRORS = (
    google_exceptions.ResourceExhausted,
    google_exceptions.ServiceUnavailable,
    google_exceptions.DeadlineExceeded,
)


class RoomStorageUnavailable(RuntimeError):
    """Raised when Firestore is unavailable and this process has no cached room."""


@bp.errorhandler(RoomStorageUnavailable)
def _room_storage_unavailable(_error):
    response = jsonify({"error": "The game service is catching up. Please retry shortly."})
    response.status_code = 503
    response.headers["Retry-After"] = "5"
    return response


def _cache_room(code: str, room: dict | None) -> None:
    with _local_lock:
        if room is None:
            _local_rooms.pop(code, None)
        else:
            _local_rooms[code] = deepcopy(room)
        _room_cache_loaded_at[code] = time.time()


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
    return client.collection("family_bible_bee_rooms").document(code) if client else None


def _get_room(code: str) -> dict | None:
    code = code.upper()
    with _local_lock:
        cached = deepcopy(_local_rooms.get(code))
        cache_age = time.time() - _room_cache_loaded_at.get(code, 0)
    if cache_age < ROOM_CACHE_SECONDS:
        room = cached
    else:
        ref = _room_ref(code)
        if ref:
            try:
                snap = ref.get()
                room = snap.to_dict() if snap.exists else None
                _cache_room(code, room)
            except RETRYABLE_STORAGE_ERRORS:
                if cached is None:
                    raise RoomStorageUnavailable from None
                current_app.logger.warning("Serving cached Bible Bee room %s after Firestore throttling", code)
                room = cached
        else:
            room = cached
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
    code = code.upper()
    _stamp_room(room)
    _cache_room(code, room)
    ref = _room_ref(code)
    if ref:
        try:
            ref.set(room)
        except RETRYABLE_STORAGE_ERRORS:
            current_app.logger.warning("Cached Bible Bee room %s while Firestore is throttled", code)


def _mutate_room(code: str, callback):
    """Update a room atomically in Firestore and under a lock in local dev."""
    code = code.upper()
    ref = _room_ref(code)
    if ref:
        try:
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

            outcome = update_in_transaction(transaction)
            if outcome:
                _cache_room(code, outcome[1])
            return outcome
        except RETRYABLE_STORAGE_ERRORS:
            current_app.logger.warning("Updating cached Bible Bee room %s while Firestore is throttled", code)

    with _local_lock:
        room = _local_rooms.get(code)
        if room is None:
            return None
        result = callback(room)
        _stamp_room(room)
        return result, deepcopy(room)


def _delete_room(code: str) -> None:
    code = code.upper()
    with _local_lock:
        _local_rooms.pop(code, None)
        _room_cache_loaded_at.pop(code, None)
    ref = _room_ref(code)
    if ref:
        try:
            ref.delete()
        except RETRYABLE_STORAGE_ERRORS:
            current_app.logger.warning("Could not delete Bible Bee room %s while Firestore is throttled", code)


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


def _is_admin_email(email: str) -> bool:
    allowed = [item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()]
    return bool(email and email.lower() in allowed)


def _is_host(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    email = _host_email()
    return bool(room and email and room.get("host_email") == email)


def _can_delete_room(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    email = _host_email()
    return bool(room and email and (room.get("host_email") == email or _is_admin_email(email)))


def _player_id(code: str) -> str | None:
    return session.get(_player_session_key(code))


def _controller_session_key(code: str) -> str:
    return f"bible_bee_controller_{code}"


def _controller_role(code: str, room: dict | None = None) -> str | None:
    room = room or _get_room(code)
    capability = read_controller_capability("bible_bee", code)
    if not capability:
        capability = session.get(_controller_session_key(code))
    if not room or not isinstance(capability, dict):
        return None
    role = str(capability.get("role") or "")
    pairing = room.get("controller_pairings", {}).get(role, {})
    generation = str(capability.get("generation") or "")
    if not pairing.get("claimed") or not generation or not secrets.compare_digest(
        generation, str(pairing.get("generation") or "")
    ):
        return None
    return role


def _pairing_roles(control_mode: str) -> list[str]:
    if control_mode == "couch":
        return ["couch"]
    if control_mode == "team_auto":
        return ["gold", "blue"]
    return ["host"]


def _fresh_pairing() -> tuple[str, dict]:
    token = secrets.token_urlsafe(32)
    generation = secrets.token_urlsafe(16)
    return token, {
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "expires_at": time.time() + CONTROLLER_PAIR_TTL_SECONDS,
        "claimed": False,
        "generation": generation,
    }


def _new_controller_pairings(control_mode: str) -> tuple[dict, dict]:
    raw, stored = {}, {}
    for role in _pairing_roles(control_mode):
        raw[role], stored[role] = _fresh_pairing()
    return raw, stored


def _gameplay_host(code: str, room: dict | None = None) -> bool:
    room = room or _get_room(code)
    return bool(_is_host(code, room) or _controller_role(code, room) == "host")


def _active_team_id(room: dict) -> str:
    return "gold" if int(room.get("question_index", 0)) % 2 == 0 else "blue"


def _controller_can_answer(code: str, room: dict, player_id: str | None) -> bool:
    role = _controller_role(code, room)
    mode = room.get("control_mode", "hosted")
    if mode == "couch":
        return role == "couch" and bool(player_id)
    if mode == "team_auto":
        return role == _active_team_id(room) and bool(player_id)
    return bool(player_id)


def _acting_player_id(code: str, room: dict) -> str | None:
    role = _controller_role(code, room)
    if role == "couch":
        return f"couch-{_active_team_id(room)}"
    if role in {"gold", "blue"}:
        return str(room.get("controller_pairings", {}).get(role, {}).get("player_id") or "") or None
    return _player_id(code)


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


def _player_connected(player: dict, now: float | None = None) -> bool:
    now = now or time.time()
    return now - float(player.get("last_seen", player.get("joined_at", 0))) < PLAYER_CONNECTED_SECONDS


def _eligible_player_ids(room: dict) -> set[str]:
    now = time.time()
    eligible = {
        player_id
        for player_id, player in room.get("players", {}).items()
        if not player.get("away", False) and _player_connected(player, now)
    }
    if room.get("control_mode") in {"couch", "team_auto"}:
        active_team = _active_team_id(room)
        eligible = {
            player_id for player_id in eligible
            for player in [room.get("players", {}).get(player_id, {})]
            if player.get("team_id") == active_team
        }
    return eligible


def _all_eligible_players_answered(room: dict) -> bool:
    eligible = _eligible_player_ids(room)
    return bool(eligible and eligible.issubset(room.get("answers", {}).keys()))


def _player_limit(room: dict) -> int:
    return TEAM_PLAYER_LIMIT if room.get("team_mode") else INDIVIDUAL_PLAYER_LIMIT


def _room_full_message(room: dict) -> str:
    if room.get("team_mode"):
        return f"This team room is full at {TEAM_PLAYER_LIMIT} players."
    return f"This room already has {INDIVIDUAL_PLAYER_LIMIT} players."


def _team_meta(team_id: str | None) -> dict | None:
    return next((team for team in TEAMS if team["id"] == team_id), None)


def _balanced_team_id(room: dict) -> str:
    counts = {team["id"]: 0 for team in TEAMS}
    for player in room.get("players", {}).values():
        team_id = player.get("team_id")
        if team_id in counts:
            counts[team_id] += 1
    _index, team = min(
        enumerate(TEAMS),
        key=lambda item: (counts[item[1]["id"]], item[0]),
    )
    return team["id"]


def _assign_balanced_teams(room: dict) -> None:
    if not room.get("team_mode"):
        return
    players = sorted(
        room.get("players", {}).items(),
        key=lambda item: (float(item[1].get("joined_at", 0)), item[1].get("name", "").lower()),
    )
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
            "score": max(0, sum(
                int(player.get("score", 0))
                for player in players.values()
                if player.get("team_id") == team["id"]
            ) + int(room.get("team_score_adjustments", {}).get(team["id"], 0))),
            "players": sum(1 for player in players.values() if player.get("team_id") == team["id"]),
        }
        for team in TEAMS
    ]


def _reveal_seconds(room: dict) -> int:
    seconds = int(room.get("reveal_seconds", REVEAL_SECONDS))
    return seconds if seconds in REVEAL_SECOND_OPTIONS else REVEAL_SECONDS


def _upramp_stage(room: dict) -> tuple[str, int | None, int]:
    total = max(1, len(room.get("questions", [])))
    progress = int(room.get("question_index", 0)) / total
    if progress < 1 / 3:
        return "Easy", None, 100
    if progress < 2 / 3:
        return "Growing", 30, 140
    return "Hard", 20, 180


def _score_config(room: dict) -> dict:
    if room.get("difficulty") == "upramp":
        _stage, _seconds, correct = _upramp_stage(room)
        return {"correct": correct, "participation": 0}
    return DIFFICULTIES.get(room.get("difficulty"), DIFFICULTIES["family"])


def _start_question_timer(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    room["question_started_at"] = now
    question_seconds = DIFFICULTY_QUESTION_SECONDS.get(room.get("difficulty"))
    if room.get("difficulty") == "upramp":
        _stage, question_seconds, _correct = _upramp_stage(room)
    if room.get("game_style") == "challenge":
        question_seconds = question_seconds or CHALLENGE_QUESTION_SECONDS
    if question_seconds:
        room["question_deadline"] = now + question_seconds
        room["question_seconds"] = question_seconds
    else:
        room.pop("question_deadline", None)
        room.pop("question_seconds", None)


def _complete_oral_round(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    question = _current_question(room)
    if room.get("phase") != "question" or not question or question.get("mode") != "oral":
        raise ValueError("This oral round cannot be completed.")
    eligible = _eligible_player_ids(room)
    judgments = room.get("oral_judgments", {})
    score_config = _score_config(room)
    correct_players = []
    points_by_player = {}
    score_reasons_by_player = {}
    missed = 0
    for player_id in eligible:
        judgment = judgments.get(player_id, "try")
        if judgment == "correct":
            points = int(score_config["correct"])
            correct_players.append(player_id)
        elif judgment == "almost":
            points = max(25, int(score_config["correct"]) // 2)
            missed += 1
        else:
            points = int(score_config["participation"]) if player_id in room.get("answers", {}) else 0
            missed += 1
        room["players"][player_id]["score"] = int(room["players"][player_id].get("score", 0)) + points
        points_by_player[player_id] = points
        score_reasons_by_player[player_id] = (
            f"Full credit +{points}" if judgment == "correct"
            else f"Almost +{points}" if judgment == "almost"
            else f"Practice +{points}" if points else "Practice · no points"
        )
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
            "score_reasons_by_player": score_reasons_by_player,
            "oral_judgments": deepcopy(judgments),
            "bonus": bool(question.get("bonus")),
        }
    )
    if int(room.get("question_index", 0)) + 1 >= len(room.get("questions", [])):
        _append_bonus_review_question(room)
    room["phase"] = "reveal"
    room.pop("question_deadline", None)
    room["reveal_deadline"] = now + _reveal_seconds(room)


def _append_bonus_review_question(room: dict) -> bool:
    if room.get("bonus_added"):
        return False
    room["bonus_added"] = True
    missed_by_passage: dict[str, dict] = {}
    for result in room.get("round_results", []):
        passage_id = result.get("passage_id")
        if not passage_id or result.get("bonus"):
            continue
        entry = missed_by_passage.setdefault(
            passage_id,
            {"passage_id": passage_id, "missed": 0},
        )
        entry["missed"] += int(result.get("missed", 0))
    missed_passages = [entry for entry in missed_by_passage.values() if entry["missed"] > 0]
    if not missed_passages:
        return False
    target = max(missed_passages, key=lambda result: int(result["missed"]))
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
    room["oral_judgments"] = {}
    room["phase"] = "question"
    _start_question_timer(room, now)


def _reveal_current_question(room: dict, now: float | None = None) -> None:
    now = now or time.time()
    question = _current_question(room)
    if room.get("phase") != "question" or not question:
        raise ValueError("This round cannot be revealed.")

    missed = 0
    correct_players = []
    points_by_player = {}
    score_config = _score_config(room)
    eligible_player_ids = _eligible_player_ids(room)
    correct_answerers = sorted(
        (
            (player_id, answer)
            for player_id, answer in room.get("answers", {}).items()
            if player_id in eligible_player_ids and _answer_choice(answer) == question["correct"]
        ),
        key=lambda item: float(item[1].get("answered_at", 0)),
    )
    speed_bonus = (
        {
            player_id: max(10, 50 - (rank * 10))
            for rank, (player_id, _answer) in enumerate(correct_answerers)
        }
        if room.get("control_mode", "hosted") == "hosted"
        else {}
    )
    score_reasons_by_player = {}
    for player_id, player in room.get("players", {}).items():
        if player_id not in eligible_player_ids:
            continue
        answer = room.get("answers", {}).get(player_id)
        if _answer_choice(answer) == question["correct"]:
            points = int(score_config["correct"]) + speed_bonus.get(player_id, 0)
            player["score"] = int(player.get("score", 0)) + points
            correct_players.append(player_id)
            points_by_player[player_id] = points
            bonus = speed_bonus.get(player_id, 0)
            score_reasons_by_player[player_id] = f"Correct +{int(score_config['correct'])}" + (f" · Speed +{bonus}" if bonus else "")
        else:
            missed += 1
            if player_id in room.get("answers", {}):
                points = int(score_config["participation"])
                player["score"] = int(player.get("score", 0)) + points
                points_by_player[player_id] = points
                score_reasons_by_player[player_id] = f"Participation +{points}" if points else "No points"
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
            "score_reasons_by_player": score_reasons_by_player,
            "bonus": bool(question.get("bonus")),
        }
    )
    if int(room.get("question_index", 0)) + 1 >= len(room.get("questions", [])):
        _append_bonus_review_question(room)
    room["phase"] = "reveal"
    room.pop("question_deadline", None)
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
                "deck_name": room.get("deck_name", "Bible Bee"),
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
            "context_note": question.get("context_note") if visible_phase == "reveal" else None,
        }

    now = time.time()
    public_players = []
    for player_id, player in room.get("players", {}).items():
        team = _team_meta(player.get("team_id"))
        team_name = room.get("team_names", {}).get(team["id"], team["name"]) if team else None
        public_players.append(
            {
                "id": player_id,
                "name": player["name"],
                "score": int(player.get("score", 0)),
                "connected": _player_connected(player, now),
                "away": bool(player.get("away", False)),
                "team_id": team["id"] if team else None,
                "team_name": team_name,
                "team_color": team["color"] if team else None,
                "avatar": (
                    url_for("bible_bee.player_avatar", code=code, player_id=player_id)
                    if player.get("avatar")
                    else None
                ),
                "avatar_preset": player.get("avatar_preset"),
            }
        )
    players = sorted(
        public_players,
        key=lambda player: (
            player.get("team_id") or "",
            -player["score"],
            player["name"].lower(),
        ),
    )
    answers = room.get("answers", {})
    return {
        "code": code,
        "phase": phase,
        "deck_name": room.get("deck_name"),
        "translation": room.get("translation"),
        "game_style": room.get("game_style_name", "Classic Mix"),
        "difficulty": room.get("difficulty_name", "Family"),
        "team_mode": bool(room.get("team_mode", False)),
        "control_mode": room.get("control_mode", "hosted"),
        "active_team_id": _active_team_id(room) if room.get("control_mode") in {"couch", "team_auto"} else None,
        "controller_status": {
            role: bool(pairing.get("claimed"))
            for role, pairing in room.get("controller_pairings", {}).items()
        },
        "teams": _team_state(room),
        "difficulty_stage": (
            _upramp_stage(room)[0] if room.get("difficulty") == "upramp" else None
        ),
        "choice_count": int(room.get("choice_count", 4)),
        "question_index": int(room.get("question_index", 0)),
        "question_total": len(room.get("questions", [])),
        "question": public_question,
        "players": players,
        "active_player_count": (
            len(_eligible_player_ids(room))
            if room.get("control_mode") in {"couch", "team_auto"}
            else sum(1 for player in players if not player["away"] and player["connected"])
        ),
        "eligible_answer_count": len(_eligible_player_ids(room)),
        "family_score": sum(team["score"] for team in _team_state(room)) if room.get("team_mode") else sum(player["score"] for player in players),
        "scoring_style": room.get("scoring_style", "competitive"),
        "family_goal": int(room.get("family_goal", len(room.get("questions", [])) * 75)),
        "score_adjustments": list(room.get("score_adjustments", []))[-10:],
        "last_result": deepcopy((room.get("round_results") or [None])[-1]),
        "answered_player_ids": list(answers),
        "oral_judgments": room.get("oral_judgments", {}) if visible_phase == "reveal" else {},
        "review": room.get("review", []),
        "review_summary": room.get("review_summary", {}),
        "reveal_deadline": room.get("reveal_deadline"),
        "question_deadline": room.get("question_deadline"),
        "question_seconds": room.get("question_seconds"),
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
    custom_game = request.form.get("game_source") == "custom"
    one_off_theme = " ".join((request.form.get("one_off_theme") or "").split())[:120]
    control_mode = (request.form.get("control_mode") or "hosted").strip()
    if control_mode not in CONTROL_MODES:
        control_mode = "hosted"
    team_mode = control_mode in {"couch", "team_auto"} or request.form.get("team_mode") == "on"
    version = (request.form.get("version") or "esv").lower()
    style = request.form.get("game_style") or "classic_mix"
    difficulty = request.form.get("difficulty") or "family"
    scoring_style = (request.form.get("scoring_style") or "competitive").strip()
    if scoring_style not in {"competitive", "cooperative"}:
        scoring_style = "competitive"
    try:
        choice_count = int(request.form.get("choice_count", 4))
    except (TypeError, ValueError):
        choice_count = 4
    if choice_count not in {2, 4}:
        choice_count = 4
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
    round_count = round_count if round_count in {3, 5, 10, 15, 20} else 5
    code = _new_code()
    try:
        ai_plan = None
        if custom_game:
            ai_plan = create_one_off_plan(
                one_off_theme,
                DIFFICULTIES[difficulty]["name"],
                round_count,
            )
            passages = load_reference_passages(ai_plan["references"], version)
            deck_id = "one-off"
            deck_name = ai_plan["title"]
        else:
            passages = load_passages(
                deck_id,
                version,
                round_count,
                seed=code,
                recent_references=set(read_recent_history(session.get("bible_bee_recent_references"))),
            )
            deck_name = deck["title"]
        questions = build_questions(
            passages,
            style,
            round_count,
            seed=code,
            choice_count=choice_count,
            difficulty=difficulty,
        )
        ai_review = None
        if custom_game:
            try:
                questions, ai_review = validate_questions(
                    questions,
                    preferred_provider=ai_plan.get("_provider"),
                )
            except BibleBeeAIError:
                # The local generator has already produced a complete playable
                # game. A second-pass quality review should never strand a family.
                ai_review = {"reviewed": 0, "improved": 0, "status": "unavailable"}
            ai_plan.pop("_provider", None)
    except (ValueError, BibleBeeAIError) as exc:
        return _render_home(str(exc), status=503)

    raw_pairings, controller_pairings = _new_controller_pairings(control_mode)
    room = {
        "created_at": time.time(),
        "updated_at": time.time(),
        "host_email": email,
        "phase": "lobby",
        "team_mode": team_mode,
        "control_mode": control_mode,
        "team_names": {"gold": "Gold Team", "blue": "Blue Team"},
        "controller_pairings": controller_pairings,
        "teams": TEAMS if team_mode else [],
        "deck_id": deck_id,
        "deck_name": deck_name,
        "translation": TRANSLATIONS[version]["code"],
        "translation_id": version,
        "game_style": style,
        "game_style_name": GAME_STYLES[style]["name"],
        "difficulty": difficulty,
        "difficulty_name": DIFFICULTIES[difficulty]["name"],
        "scoring_style": scoring_style,
        "family_goal": round_count * int(DIFFICULTIES[difficulty]["correct"]) * 3 // 4,
        "choice_count": choice_count,
        "round_count": round_count,
        "reveal_seconds": reveal_seconds,
        "passages": passages,
        "questions": questions,
        "question_index": 0,
        "players": {},
        "answers": {},
        "review": [],
        "round_results": [],
        "team_score_adjustments": {"gold": 0, "blue": 0},
        "score_adjustments": [],
        "review_summary": {},
        "ai_plan": ai_plan,
        "ai_review": ai_review,
    }
    _set_room(code, room)
    pairing_tokens = dict(session.get("bible_bee_pairing_tokens", {}))
    pairing_tokens[code] = raw_pairings
    session["bible_bee_pairing_tokens"] = pairing_tokens
    session["bible_bee_recent_references"] = updated_recent_history(
        session.get("bible_bee_recent_references"),
        [passage["reference"] for passage in passages],
    )
    host_rooms = list(session.get("bible_bee_host_rooms", []))
    if code not in host_rooms:
        host_rooms.append(code)
    session["bible_bee_host_rooms"] = host_rooms[-8:]
    response = redirect(url_for("bible_bee.host_room", code=code))
    for role, token in raw_pairings.items():
        set_controller_invite(
            response,
            game="bible_bee",
            code=code,
            role=role,
            token=token,
        )
    return response


@bp.get("/family-bible-bee/host/<code>")
def host_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if not _gameplay_host(code, room):
        abort(403)
    return render_template("bible_bee_room.html", code=code, role="host", noindex=True)


@bp.get("/family-bible-bee/display/<code>")
def display_room(code: str):
    code = code.upper()
    _require_room(code)
    return render_template("bible_bee_room.html", code=code, role="display", noindex=True)


@bp.route("/family-bible-bee/controller/<code>", methods=["GET", "POST"])
def pair_controller(code: str):
    code = code.upper()
    room = _require_room(code)
    error = None
    if request.method == "POST":
        rate = check_rate_limit("bible-bee-controller-pair", get_client_ip(), limit=12, window_seconds=10 * 60)
        if not rate.allowed:
            error = "Too many pairing attempts. Wait a few minutes."
        else:
            token = (request.form.get("pairing_token") or "").strip()
            digest = hashlib.sha256(token.encode()).hexdigest()
            claimed = {}

            def claim(current):
                for role, pairing in current.get("controller_pairings", {}).items():
                    if secrets.compare_digest(str(pairing.get("token_hash") or ""), digest):
                        if pairing.get("claimed") or time.time() > float(pairing.get("expires_at", 0)):
                            raise ValueError("This controller invite expired or was already used.")
                        pairing["claimed"] = True
                        paused_question_seconds = pairing.pop("resume_question_seconds", None)
                        paused_reveal_seconds = pairing.pop("resume_reveal_seconds", None)
                        if paused_question_seconds is not None and current.get("phase") == "question":
                            current["question_deadline"] = time.time() + max(1, float(paused_question_seconds))
                        if paused_reveal_seconds is not None and current.get("phase") == "reveal":
                            current["reveal_deadline"] = time.time() + max(1, float(paused_reveal_seconds))
                        if role in {"gold", "blue"}:
                            player_id = f"controller-{role}-{secrets.token_urlsafe(5)}"
                            pairing["player_id"] = player_id
                            current.setdefault("players", {})[player_id] = {
                                "name": f"{role.title()} Team Controller", "score": int(pairing.pop("recovery_score", 0)),
                                "joined_at": time.time(), "last_seen": time.time(), "away": False,
                                "team_id": role, "avatar": None,
                                "avatar_preset": "sunflower" if role == "gold" else "ocean",
                            }
                        elif role == "couch":
                            for index, team in enumerate(("gold", "blue")):
                                player_id = f"couch-{team}"
                                player = current.setdefault("players", {}).setdefault(player_id, {
                                    "name": current.get("team_names", {}).get(team, f"{team.title()} Team"),
                                    "score": 0, "joined_at": time.time() + index / 1000,
                                    "team_id": team, "avatar": None,
                                    "avatar_preset": "sunflower" if team == "gold" else "ocean",
                                    "virtual_controller_team": True,
                                })
                                player["last_seen"] = time.time()
                                player["away"] = False
                        claimed.update(role=role, generation=pairing["generation"])
                        return
                raise ValueError("That controller invite is not valid for this room.")

            try:
                result = _mutate_room(code, claim)
            except ValueError as exc:
                error = str(exc)
            else:
                if result is None:
                    abort(404)
            if claimed:
                session[_controller_session_key(code)] = claimed
                destination = "bible_bee.host_room" if claimed["role"] == "host" else "bible_bee.player_room"
                response = redirect(url_for(destination, code=code))
                set_controller_capability(
                    response,
                    game="bible_bee",
                    code=code,
                    role=claimed["role"],
                    generation=claimed["generation"],
                )
                return response
    response = render_template("family_game_controller_pair.html", code=code, error=error, noindex=True)
    return response, (400 if error else 200), {"Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store"}


@bp.get("/family-bible-bee/controller/<code>/play")
def host_controller(code: str):
    code = code.upper()
    room = _require_room(code)
    if _controller_role(code, room) != "host":
        abort(403)
    return render_template("bible_bee_room.html", code=code, role="host", noindex=True)


@bp.get("/family-bible-bee/room/<code>/controller-qr/<role>")
def controller_qr(code: str, role: str):
    code = code.upper()
    room = _require_room(code)
    if not _is_host(code, room) or role not in room.get("controller_pairings", {}):
        abort(403)
    raw = session.get("bible_bee_pairing_tokens", {})
    token = raw.get(code, {}).get(role) if isinstance(raw, dict) else None
    token = token or read_controller_invite("bible_bee", code, role)
    pairing = room["controller_pairings"][role]
    if not token or pairing.get("claimed") or time.time() > float(pairing.get("expires_at", 0)):
        abort(410)
    pair_url = request.url_root.rstrip("/") + f"/family-bible-bee/controller/{code}#{token}"
    image = qrcode.make(pair_url)
    output = io.BytesIO(); image.save(output, format="PNG"); output.seek(0)
    response = send_file(output, mimetype="image/png", download_name=f"bible-bee-{code}-{role}.png")
    response.headers.update({"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"})
    return response


@bp.post("/api/family-bible-bee/rooms/<code>/controllers/<role>/replace")
def replace_controller(code: str, role: str):
    code = code.upper()
    room = _get_room(code)
    if not _is_host(code, room) or role not in (room or {}).get("controller_pairings", {}):
        abort(403)
    rate = check_rate_limit("bible-bee-controller-replace", _host_email() or get_client_ip(), limit=20, window_seconds=60 * 60)
    if not rate.allowed:
        return jsonify({"error": "Too many controller replacements. Try again later."}), 429
    token, pairing = _fresh_pairing()

    def replace(current):
        old = current.get("controller_pairings", {}).get(role, {})
        controls_active_turn = (
            current.get("control_mode") == "couch" and role == "couch"
        ) or (
            current.get("control_mode") == "team_auto" and role == _active_team_id(current)
        )
        if controls_active_turn and current.get("phase") == "question" and current.get("question_deadline"):
            pairing["resume_question_seconds"] = max(1, float(current.pop("question_deadline")) - time.time())
        if controls_active_turn and current.get("phase") == "reveal" and current.get("reveal_deadline"):
            pairing["resume_reveal_seconds"] = max(1, float(current.pop("reveal_deadline")) - time.time())
        old_player = old.get("player_id")
        if old_player:
            player = current.get("players", {}).pop(old_player, None)
            if player:
                pairing["recovery_score"] = int(player.get("score", 0))
        current["controller_pairings"][role] = pairing

    if _mutate_room(code, replace) is None:
        abort(404)
    raw = dict(session.get("bible_bee_pairing_tokens", {}))
    room_tokens = dict(raw.get(code, {})); room_tokens[role] = token; raw[code] = room_tokens
    session["bible_bee_pairing_tokens"] = raw
    response = jsonify({"ok": True, "token": token})
    set_controller_invite(
        response,
        game="bible_bee",
        code=code,
        role=role,
        token=token,
    )
    return response


@bp.post("/api/family-bible-bee/rooms/<code>/teams/names")
def rename_teams(code: str):
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


@bp.get("/family-bible-bee/room/<code>/avatar/<player_id>")
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
        "bible_bee_join.html",
        code=code,
        error=error,
        team_mode=bool((room or {}).get("team_mode")),
        preset_avatars=PRESET_AVATARS,
        noindex=True,
    )


@bp.route("/family-bible-bee/join/<code>", methods=["GET", "POST"])
def join_room(code: str):
    code = code.upper()
    room = _require_room(code)
    if room.get("control_mode") in {"couch", "team_auto"}:
        return "This room uses private team controllers. Ask the host for the matching controller invite.", 403
    existing_id = _player_id(code)
    if request.method == "POST":
        rate = check_rate_limit(
            "bible-bee-join",
            get_client_ip(),
            limit=80 if room.get("team_mode") else 20,
            window_seconds=10 * 60,
        )
        if not rate.allowed:
            return _render_join_page(
                code, "Too many join attempts. Please wait a few minutes."
            ), 429
        name = " ".join((request.form.get("player_name") or "").strip().split())
        if not SAFE_NAME_RE.fullmatch(name) or name.lower() in BLOCKED_NAMES:
            return _render_join_page(
                code, "Choose a simple family-friendly name using letters or numbers."
            ), 400
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
            if any(
                other_id != player_id and player.get("name", "").casefold() == name.casefold()
                for other_id, player in current.get("players", {}).items()
            ):
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
        if result is None:
            abort(404)
        session[_player_session_key(code)] = player_id
        return redirect(url_for("bible_bee.player_room", code=code))
    if existing_id and existing_id in room.get("players", {}):
        return redirect(url_for("bible_bee.player_room", code=code))
    return _render_join_page(code)


@bp.get("/family-bible-bee/play/<code>")
def player_room(code: str):
    code = code.upper()
    room = _require_room(code)
    player_id = _acting_player_id(code, room)
    if not player_id or player_id not in room.get("players", {}):
        return redirect(url_for("bible_bee.join_room", code=code))
    return render_template("bible_bee_room.html", code=code, role="player", noindex=True)


@bp.post("/api/family-bible-bee/rooms/<code>/profile")
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


@bp.get("/api/family-bible-bee/rooms/<code>")
def room_state(code: str):
    code = code.upper()
    room = _require_room(code)
    question_deadline = room.get("question_deadline")
    if room.get("phase") == "question" and question_deadline and time.time() >= float(question_deadline):
        now = time.time()

        def auto_reveal(current):
            current_deadline = current.get("question_deadline")
            if current.get("phase") == "question" and current_deadline and now >= float(current_deadline):
                question = _current_question(current)
                if question and question.get("mode") == "oral":
                    _complete_oral_round(current, now)
                else:
                    _reveal_current_question(current, now)

        result = _mutate_room(code, auto_reveal)
        if result is None:
            abort(404)
        room = result[1]
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
    player_id = _acting_player_id(code, room)
    controller_role = _controller_role(code, room)
    state["viewer"] = {
        "is_host": _gameplay_host(code, room),
        "is_owner": _is_host(code, room),
        "player_id": player_id,
        "controller_role": controller_role,
        "can_answer": _controller_can_answer(code, room, player_id),
        "has_answered": bool(player_id and player_id in room.get("answers", {})),
    }
    if _is_host(code, room):
        tokens = session.get("bible_bee_pairing_tokens", {})
        room_tokens = dict(tokens.get(code, {})) if isinstance(tokens, dict) else {}
        for role, pairing in room.get("controller_pairings", {}).items():
            if not pairing.get("claimed") and role not in room_tokens:
                token = read_controller_invite("bible_bee", code, role)
                if token:
                    room_tokens[role] = token
        state["viewer"]["pairing_tokens"] = room_tokens
    if _gameplay_host(code, room):
        state["oral_judgments"] = room.get("oral_judgments", {})
    visible_phase = room.get("resume_phase") if room.get("phase") == "paused" else room.get("phase")
    if visible_phase == "reveal" and player_id:
        answer = room.get("answers", {}).get(player_id)
        question = _current_question(room)
        choice = _answer_choice(answer)
        state["viewer"]["answer"] = choice
        if question and question.get("mode") == "oral":
            judgment = room.get("oral_judgments", {}).get(player_id, "try")
            state["viewer"]["oral_judgment"] = judgment
            state["viewer"]["correct"] = judgment == "correct"
        else:
            state["viewer"]["correct"] = bool(question and choice == question["correct"])
        latest_result = (room.get("round_results") or [{}])[-1]
        state["viewer"]["round_points"] = int(
            latest_result.get("points_by_player", {}).get(player_id, 0)
        )
        state["viewer"]["score_reason"] = latest_result.get("score_reasons_by_player", {}).get(player_id, "")
    return jsonify(state)


@bp.post("/api/family-bible-bee/rooms/<code>/start")
def start_game(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _gameplay_host(code, room):
        abort(403)

    def start(room):
        pairings = room.get("controller_pairings", {})
        required = _pairing_roles(room.get("control_mode", "hosted")) if room.get("control_mode") in {"couch", "team_auto"} else []
        if not all(pairings.get(role, {}).get("claimed") for role in required):
            raise ValueError("Pair every required controller before starting.")
        if not room.get("players"):
            raise ValueError("Invite at least one player before starting.")
        room["phase"] = "question"
        room["question_index"] = 0
        room["answers"] = {}
        room["oral_judgments"] = {}
        room["team_score_adjustments"] = {"gold": 0, "blue": 0}
        room["score_adjustments"] = []
        _start_question_timer(room)

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
    room = _get_room(code)
    player_id = _acting_player_id(code, room or {})
    if not player_id:
        abort(403)
    if not room or not _controller_can_answer(code, room, player_id):
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
        room["players"][player_id]["last_seen"] = time.time()
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


@bp.post("/api/family-bible-bee/rooms/<code>/ready")
def ready_to_recite(code: str):
    code = code.upper()
    room = _get_room(code)
    player_id = _acting_player_id(code, room or {})
    if not player_id:
        abort(403)
    if not room or not _controller_can_answer(code, room, player_id):
        abort(403)

    def ready(room):
        question = _current_question(room)
        if room.get("phase") != "question" or not question or question.get("mode") != "oral":
            raise ValueError("This is not an oral recitation round.")
        player = room.get("players", {}).get(player_id)
        if not player or player.get("away"):
            raise PermissionError
        player["last_seen"] = time.time()
        room.setdefault("answers", {})[player_id] = {
            "oral_status": "ready",
            "answered_at": time.time(),
        }

    try:
        result = _mutate_room(code, ready)
    except PermissionError:
        abort(403)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/judge")
def judge_recitation(code: str):
    code = code.upper()
    room = _get_room(code)
    controller_self_judge = room and room.get("control_mode") in {"couch", "team_auto"} and _controller_can_answer(code, room, _acting_player_id(code, room))
    if not _gameplay_host(code, room) and not controller_self_judge:
        abort(403)
    payload = request.get_json(silent=True) or {}
    player_id = str(payload.get("player_id") or "")
    if controller_self_judge:
        player_id = str(_acting_player_id(code, room) or "")
    judgment = str(payload.get("judgment") or "")
    if judgment not in {"correct", "almost", "try"}:
        return jsonify({"error": "Choose full credit, almost there, or keep practicing."}), 400

    def judge(current):
        question = _current_question(current)
        if current.get("phase") != "question" or not question or question.get("mode") != "oral":
            raise ValueError("This is not an oral recitation round.")
        if player_id not in _eligible_player_ids(current):
            raise ValueError("That player is not active in this round.")
        current.setdefault("oral_judgments", {})[player_id] = judgment
        if _eligible_player_ids(current).issubset(current["oral_judgments"].keys()):
            _complete_oral_round(current)

    try:
        result = _mutate_room(code, judge)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/rematch")
def rematch_missed_verses(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _gameplay_host(code, room):
        abort(403)

    def rematch(current):
        if current.get("phase") != "finished":
            raise ValueError("Finish the current game before starting a review rematch.")
        missed_ids = {
            result.get("passage_id")
            for result in current.get("round_results", [])
            if int(result.get("missed", 0)) > 0
        }
        review_questions = []
        seen = set()
        for question in current.get("questions", []):
            passage_id = question.get("passage_id")
            if passage_id in missed_ids and passage_id not in seen:
                review = deepcopy(question)
                review["id"] = f"{question['id']}-rematch"
                review["label"] = f"Review · {question['label'].replace('Bonus Review · ', '')}"
                review.pop("bonus", None)
                review_questions.append(review)
                seen.add(passage_id)
        if not review_questions:
            raise ValueError("There are no missed verses to review.")
        current["questions"] = review_questions
        current["question_index"] = 0
        current["answers"] = {}
        current["oral_judgments"] = {}
        current["round_results"] = []
        current["team_score_adjustments"] = {"gold": 0, "blue": 0}
        current["score_adjustments"] = []
        current["review"] = []
        current["review_summary"] = {}
        current["bonus_added"] = False
        current["phase"] = "question"
        current.pop("finished_at", None)
        for player in current.get("players", {}).values():
            player["score"] = 0
        _start_question_timer(current)

    try:
        result = _mutate_room(code, rematch)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/play-again")
def play_again_same_players(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _gameplay_host(code, room):
        abort(403)

    def reset(current):
        if current.get("phase") != "finished":
            raise ValueError("Finish the current game before starting another one.")
        round_count = int(current.get("round_count") or sum(1 for question in current.get("questions", []) if not question.get("bonus")) or 5)
        round_count = round_count if round_count in {3, 5, 10, 15, 20} else 5
        current["passages"] = (
            load_passages(
                current.get("deck_id", "family-favorites"),
                current.get("translation_id", "esv"),
                round_count,
                seed=f"{code}-{int(time.time())}",
                recent_references=set(read_recent_history(session.get("bible_bee_recent_references"))),
            )
            if current.get("deck_id") != "one-off"
            else current.get("passages", [])
        )
        current["questions"] = build_questions(
            current.get("passages", []),
            current.get("game_style", "classic_mix"),
            round_count,
            seed=f"{code}-{int(time.time())}",
            choice_count=int(current.get("choice_count", 4)),
            difficulty=current.get("difficulty", "family"),
        )
        current["round_count"] = round_count
        current["question_index"] = 0
        current["answers"] = {}
        current["oral_judgments"] = {}
        current["round_results"] = []
        current["team_score_adjustments"] = {"gold": 0, "blue": 0}
        current["score_adjustments"] = []
        current["review"] = []
        current["review_summary"] = {}
        current["bonus_added"] = False
        current["phase"] = "lobby"
        current.pop("finished_at", None)
        current.pop("reveal_deadline", None)
        current.pop("question_deadline", None)
        current.pop("question_seconds", None)
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
    session["bible_bee_recent_references"] = updated_recent_history(
        session.get("bible_bee_recent_references"),
        [passage["reference"] for passage in updated_room.get("passages", [])],
    )
    return jsonify({"ok": True})


@bp.post("/api/family-bible-bee/rooms/<code>/heartbeat")
def player_heartbeat(code: str):
    code = code.upper()
    room = _get_room(code)
    player_id = _acting_player_id(code, room or {})
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
    if not _gameplay_host(code, room):
        abort(403)

    def reveal(room):
        question = _current_question(room)
        if question and question.get("mode") == "oral":
            _complete_oral_round(room)
        else:
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
    if not _gameplay_host(code, room):
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
    if not _gameplay_host(code, room):
        abort(403)

    def pause(current):
        if current.get("phase") == "paused":
            current["phase"] = current.pop("resume_phase", "question")
            if current["phase"] == "reveal":
                remaining = float(current.pop("paused_reveal_seconds", _reveal_seconds(current)))
                current["reveal_deadline"] = time.time() + max(1, remaining)
            elif current.get("paused_question_seconds"):
                remaining = float(current.pop("paused_question_seconds"))
                current["question_deadline"] = time.time() + max(1, remaining)
            elif (
                (_current_question(current) or {}).get("mode") != "oral"
                and _all_eligible_players_answered(current)
            ):
                _reveal_current_question(current)
        elif current.get("phase") in {"question", "reveal"}:
            current["resume_phase"] = current["phase"]
            if current["phase"] == "reveal":
                deadline = float(current.pop("reveal_deadline", time.time() + _reveal_seconds(current)))
                current["paused_reveal_seconds"] = max(1, deadline - time.time())
            elif current.get("question_deadline"):
                deadline = float(current.pop("question_deadline"))
                current["paused_question_seconds"] = max(1, deadline - time.time())
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
    if not _gameplay_host(code, room):
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
                    "missed": len(_eligible_player_ids(current)),
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
    if not _gameplay_host(code, room):
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


@bp.post("/api/family-bible-bee/rooms/<code>/score-adjust")
def adjust_bible_bee_score(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _gameplay_host(code, room):
        abort(403)
    payload = request.get_json(silent=True) or {}
    target_type = str(payload.get("target_type") or "")
    target_id = str(payload.get("target_id") or "")
    try:
        requested_delta = int(payload.get("delta"))
    except (TypeError, ValueError):
        return jsonify({"error": "Choose a valid score adjustment."}), 400
    if requested_delta not in {-50, -25, 25, 50}:
        return jsonify({"error": "Host adjustments use 25- or 50-point steps."}), 400
    rate = check_rate_limit("bible-bee-score-adjust", _host_email() or get_client_ip(), limit=120, window_seconds=60 * 60)
    if not rate.allowed:
        return jsonify({"error": "Too many score adjustments. Try again shortly."}), 429
    applied = {}

    def adjust(current):
        if target_type == "team" and current.get("team_mode"):
            team = _team_meta(target_id)
            if not team:
                raise ValueError("That team is not in this room.")
            current_score = next(item["score"] for item in _team_state(current) if item["id"] == target_id)
            delta = max(-current_score, requested_delta) if requested_delta < 0 else requested_delta
            current.setdefault("team_score_adjustments", {}).setdefault(target_id, 0)
            current["team_score_adjustments"][target_id] += delta
            target_name = current.get("team_names", {}).get(target_id, team["name"])
        elif target_type == "player" and not current.get("team_mode"):
            player = current.get("players", {}).get(target_id)
            if not player:
                raise ValueError("That player is not in this room.")
            current_score = int(player.get("score", 0))
            delta = max(-current_score, requested_delta) if requested_delta < 0 else requested_delta
            player["score"] = current_score + delta
            target_name = player["name"]
        else:
            raise ValueError("Choose a team or player that matches this game.")
        entry = {
            "id": secrets.token_urlsafe(8), "target_type": target_type,
            "target_id": target_id, "target_name": target_name,
            "delta": delta, "reason": "Host adjustment", "created_at": time.time(),
        }
        current.setdefault("score_adjustments", []).append(entry)
        current["score_adjustments"] = current["score_adjustments"][-40:]
        applied.update(entry)

    try:
        result = _mutate_room(code, adjust)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        abort(404)
    return jsonify({"ok": True, "adjustment": applied})


@bp.post("/api/family-bible-bee/rooms/<code>/score-adjust/undo")
def undo_bible_bee_score_adjustment(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _gameplay_host(code, room):
        abort(403)

    def undo(current):
        history = current.setdefault("score_adjustments", [])
        if not history:
            raise ValueError("There is no host adjustment to undo.")
        entry = history.pop()
        if entry["target_type"] == "team":
            current.setdefault("team_score_adjustments", {}).setdefault(entry["target_id"], 0)
            current["team_score_adjustments"][entry["target_id"]] -= int(entry["delta"])
        else:
            player = current.get("players", {}).get(entry["target_id"])
            if not player:
                raise ValueError("That player is no longer in this room.")
            player["score"] = max(0, int(player.get("score", 0)) - int(entry["delta"]))

    try:
        result = _mutate_room(code, undo)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
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


@bp.post("/api/family-bible-bee/rooms/<code>/teams/rebalance")
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


@bp.post("/api/family-bible-bee/rooms/<code>/players/<player_id>/team")
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
        current_id = player.get("team_id")
        team_ids = [team["id"] for team in TEAMS]
        next_index = (team_ids.index(current_id) + 1) % len(team_ids) if current_id in team_ids else 0
        player["team_id"] = team_ids[next_index]

    try:
        result = _mutate_room(code, switch)
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
    if not _can_delete_room(code, room):
        abort(403)
    _delete_room(code)
    host_rooms = [item for item in session.get("bible_bee_host_rooms", []) if item != code]
    session["bible_bee_host_rooms"] = host_rooms
    return jsonify({"ok": True, "redirect": url_for("bible_bee.home")})


@bp.post("/family-bible-bee/rooms/<code>/delete")
def delete_room_from_home(code: str):
    code = code.upper()
    room = _get_room(code)
    if not _can_delete_room(code, room):
        abort(403)
    _delete_room(code)
    session["bible_bee_host_rooms"] = [
        item for item in session.get("bible_bee_host_rooms", []) if item != code
    ]
    return redirect(url_for("bible_bee.home"))
