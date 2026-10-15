import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from firebase_admin import firestore as google_firestore
from google.cloud import firestore as cloud_firestore
from openai import OpenAI
from flask import Blueprint, Response, jsonify, make_response, render_template, redirect, request, session, send_file

from faithsparks.services.firestore import db
from faithsparks.services.users import get_user_doc, has_active_plus
from faithsparks.services.storage import download_storage_bytes, upload_storage_bytes
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.sharded_counters import read_counts, shard_ref

bp = Blueprint("lab_games", __name__, url_prefix="/labs/games")

_GAME_DIR = Path(__file__).resolve().parents[1] / "content" / "lab_games"

_SHARED_ASSETS = {"games-core.js", "games-ui.css", "games-save-migration.js"}

LAB_GAMES = (
    {
        "slug": "gordon-ice-cream-town",
        "game_id": "gordon-ice-cream-town",
        "aliases": (),
        "name": "Gordon Ice Cream Town",
        "description": "Take customer orders at Gordon Ice Cream Town, make ice cream, shakes, and sodas, and deliver each order to the right customer.",
        "icon": "🍨",
        "accent": "#d66b8a",
        "maturity": "sandbox",
        "file": "gordon-ice-cream-town.html",
        "available": True,
    },
    {
        "slug": "gordon-window-washing",
        "game_id": "gordon-window-washing",
        "aliases": (),
        "name": "Gordon Window Washing",
        "description": "Wash Gordon Ice Cream Town windows with the right cleaner and squeegee as new messes and tools unlock.",
        "icon": "✨",
        "accent": "#4f9bb5",
        "maturity": "sandbox",
        "file": "gordon-window-washing.html",
        "available": True,
    },
    {
        "slug": "gordon-mail-run",
        "game_id": "gordon-mail-run",
        "aliases": ("mail-sorting",),
        "name": "Gordon Mail Run",
        "description": "Sort Games mail, then unlock delivery routes that rotate with sorting levels.",
        "icon": "✉️",
        "accent": "#d28a35",
        "maturity": "sandbox",
        "file": "gordon-mail-run.html",
        "available": True,
    },
    {
        "slug": "gordon-family-stables",
        "game_id": "gordon-family-stables",
        "aliases": (),
        "name": "Gordon Family Stables",
        "description": "Choose a horse and race through increasingly challenging Gordon Family Stables courses.",
        "icon": "🐴",
        "accent": "#6b8f52",
        "maturity": "sandbox",
        "file": "gordon-family-stables.html",
        "available": True,
    },
    {
        "slug": "same-brain",
        "game_id": "same-brain",
        "aliases": (),
        "name": "Same Brain?",
        "description": "Answer five weird questions, challenge a friend, and reveal how often your brains make the same choice.",
        "icon": "🧠",
        "accent": "#6f4bd8",
        "maturity": "sandbox",
        "file": "same-brain.html",
        "available": True,
        "games": False,
    },
)


def _signed_in_email() -> str | None:
    return (session.get("user_email") or "").strip().casefold() or None


def _beta_allowlist() -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv("LAB_GAMES_BETA_EMAILS", "").split(",")
        if item.strip()
    }


def _has_beta_access(email: str | None) -> bool:
    """Beta list or admins. An empty list is open only outside production."""
    if not email:
        return False
    allowlist = _beta_allowlist()
    admins = {item.strip().casefold() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
    if email.casefold() in allowlist or email.casefold() in admins:
        return True
    return not allowlist and os.getenv("APP_ENV", "dev").lower() not in {"prod", "production"}


def _access_denied():
    return (
        render_template(
            "lab_games.html",
            games=LAB_GAMES,
            signed_in=True,
            access_denied=True,
            noindex=True,
        ),
        403,
    )


def _require_access():
    email = _signed_in_email()
    if not email:
        next_url = request.full_path.rstrip("?") if request.query_string else request.path
        return redirect(f"/login/google/start?next={next_url}")
    if not _has_beta_access(email):
        return _access_denied()
    return None


def _game_for_slug(slug: str) -> dict | None:
    for game in LAB_GAMES:
        if slug == game["slug"] or slug in game.get("aliases", ()):
            return game
    return None


def _csrf_token_value() -> str:
    token = str(session.get("_csrf_token") or "")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _default_games_roster() -> dict:
    return {
        "version": 1,
        "players": [],
        "activePlayerId": "",
        "settings": {"sound": True, "music": True},
    }


_SYNCED_GAME_FIELDS = ("sessions", "completions", "bestScore", "highestLevel", "bestStars", "bestAccuracy", "xp")
_GAME_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")


def _safe_nonnegative_int(value) -> int:
    try:
        return max(0, min(int(value or 0), 10**15))
    except (TypeError, ValueError, OverflowError):
        return 0


def _sanitize_game_progress(raw: object) -> dict:
    """Milestone stats per game (numbers only; resume snapshots stay on device)."""
    out: dict[str, dict[str, int]] = {}
    if not isinstance(raw, dict):
        return out
    for game_id, row in list(raw.items())[:12]:
        if not isinstance(game_id, str) or not _GAME_ID_RE.match(game_id) or not isinstance(row, dict):
            continue
        clean = {}
        for key in _SYNCED_GAME_FIELDS:
            try:
                value = int(row.get(key) or 0)
            except (TypeError, ValueError, OverflowError):
                continue
            if value > 0:
                clean[key] = min(value, 10**12)
        if clean:
            out[game_id] = clean
    return out


def _merge_game_progress(existing: dict, incoming: dict) -> dict:
    merged = {game_id: dict(row) for game_id, row in (existing or {}).items()}
    for game_id, row in (incoming or {}).items():
        target = merged.setdefault(game_id, {})
        for key, value in row.items():
            target[key] = max(int(target.get(key) or 0), int(value))
    return dict(list(merged.items())[:12])


def _sanitize_games_roster(payload: object) -> dict:
    source = payload if isinstance(payload, dict) else {}
    players = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()

    for raw in source.get("players") or []:
        if not isinstance(raw, dict) or len(players) >= 8:
            continue
        name = " ".join(str(raw.get("name") or "").split()).strip()[:20]
        player_id = str(raw.get("id") or "").strip()[:80]
        if not name or not player_id:
            continue
        name_key = name.casefold()
        if player_id in seen_ids or name_key in seen_names:
            continue
        seen_ids.add(player_id)
        seen_names.add(name_key)
        players.append(
            {
                "id": player_id,
                "name": name,
                "avatar": str(raw.get("avatar") or "star").strip()[:32],
                "createdAt": _safe_nonnegative_int(raw.get("createdAt")),
                "games": _sanitize_game_progress(raw.get("games")),
            }
        )

    settings_raw = source.get("settings") if isinstance(source.get("settings"), dict) else {}
    active_id = str(source.get("activePlayerId") or "").strip()[:80]
    if active_id and active_id not in seen_ids:
        active_id = ""

    return {
        "version": 1,
        "players": players,
        "activePlayerId": active_id,
        "settings": {
            "sound": settings_raw.get("sound") is not False,
            "music": settings_raw.get("music") is not False,
        },
    }


def _load_games_roster(email: str | None) -> dict:
    if not email or not db:
        return _default_games_roster()
    try:
        snap = db.collection("users").document(email).get()
        if not snap.exists:
            return _default_games_roster()
        data = snap.to_dict() or {}
        return _sanitize_games_roster(data.get("gamesRoster", data.get("odysseyRoster")))
    except Exception:
        return _default_games_roster()


def _merge_games_rosters(existing: dict, incoming: dict) -> dict:
    base = _sanitize_games_roster(existing)
    new = _sanitize_games_roster(incoming)
    by_id = {p["id"]: dict(p) for p in base["players"]}
    name_to_id = {p["name"].casefold(): p["id"] for p in base["players"]}

    for player in new["players"]:
        match_id = player["id"]
        if match_id not in by_id:
            match_id = name_to_id.get(player["name"].casefold(), match_id)
        if match_id in by_id:
            merged = dict(by_id[match_id])
            progress = _merge_game_progress(merged.get("games"), player.get("games"))
            merged.update(player)
            merged["games"] = progress
            merged["id"] = match_id
            by_id[match_id] = merged
        elif len(by_id) < 8:
            by_id[player["id"]] = dict(player)
            name_to_id[player["name"].casefold()] = player["id"]

    players = list(by_id.values())[:8]
    ids = {p["id"] for p in players}
    active_id = new["activePlayerId"] if new["activePlayerId"] in ids else base["activePlayerId"]
    if active_id not in ids:
        active_id = ""

    return {
        "version": 1,
        "players": players,
        "activePlayerId": active_id,
        "settings": {**base["settings"], **new["settings"]},
    }


def _games_bootstrap(email: str | None) -> tuple[dict, dict]:
    roster = _load_games_roster(email)
    config = {
        "url": "/labs/games/roster",
        "csrfToken": _csrf_token_value(),
    }
    return roster, config


@bp.get("")
@bp.get("/")
def index():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    roster, sync_config = _games_bootstrap(_signed_in_email())
    return render_template(
        "lab_games.html",
        games=LAB_GAMES,
        signed_in=True,
        access_denied=False,
        noindex=True,
        games_roster=roster,
        games_sync_config=sync_config,
    )


@bp.get("/assets/<filename>")
def asset(filename: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    if filename not in _SHARED_ASSETS:
        return render_template("404.html"), 404

    asset_path = _GAME_DIR / filename
    if not asset_path.is_file():
        return render_template("404.html"), 404

    mimetype = "text/javascript" if filename.endswith(".js") else "text/css"
    response = send_file(asset_path, mimetype=mimetype, conditional=True, etag=True)
    # Revalidate every time (cheap 304) instead of re-downloading on each play.
    response.headers["Cache-Control"] = "private, no-cache"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response


@bp.route("/roster", methods=["GET", "PUT"])
def roster():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    email = _signed_in_email()
    if request.method == "GET":
        return jsonify(_load_games_roster(email))

    sent_token = request.headers.get("X-CSRF-Token") or request.headers.get("X-CSRFToken") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    incoming = _sanitize_games_roster(request.get_json(silent=True) or {})
    existing = _load_games_roster(email)
    merged = _merge_games_rosters(existing, incoming)

    if not db or not email:
        return jsonify(merged)

    try:
        db.collection("users").document(email).set({"gamesRoster": merged}, merge=True)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503

    return jsonify(merged)


SAME_BRAIN_POINT_EVENTS = {
    "complete": 10,
    "daily_complete": 15,
    "group_complete": 12,
}
SAME_BRAIN_COSMETICS = {
    "frame_stars": 80,
    "avatar_owl": 90,
    "avatar_fox": 100,
    "avatar_robot": 100,
    "avatar_alien": 110,
    "avatar_octopus": 110,
    "avatar_astronaut": 130,
    "theme_sunset": 120,
    "theme_arcade": 140,
}


def _same_brain_user_state(email: str | None) -> dict:
    data = get_user_doc(email) if email else {}
    sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
    return {
        "plus": has_active_plus(data),
        "bits": max(0, int(sb.get("bits") or 0)),
        "unlocks": sorted({str(v)[:40] for v in (sb.get("unlocks") or []) if str(v).strip()}),
        "avatar": str(sb.get("avatar") or "brain")[:40],
        "theme": str(sb.get("theme") or "classic")[:40],
        "dailyStreak": max(0, int(sb.get("dailyStreak") or 0)),
        "dailyBest": max(0, int(sb.get("dailyBest") or 0)),
        "lastDailyDate": str(sb.get("lastDailyDate") or "")[:10],
    }


@bp.get("/same-brain/profile")
def same_brain_profile():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    return jsonify(_same_brain_user_state(_signed_in_email()))


@bp.post("/same-brain/points")
def same_brain_points():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    if not _same_brain_user_limit("points", 60):
        return jsonify({"error": "rate_limited"}), 429
    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    event_id = str(payload.get("eventId") or "").strip()[:96]
    daily_key = str(payload.get("dateKey") or "").strip()[:10]
    amount = SAME_BRAIN_POINT_EVENTS.get(event)
    email = _signed_in_email()
    client = db()
    if not amount or not event_id or not email or not client:
        return jsonify({"error": "invalid"}), 400
    ref = client.collection("users").document(email)
    transaction = client.transaction()

    @cloud_firestore.transactional
    def award(txn):
        snap = ref.get(transaction=txn)
        data = snap.to_dict() or {}
        sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
        awarded = list(sb.get("awarded") or [])
        if event_id in awarded:
            return max(0, int(sb.get("bits") or 0)), True
        bits = max(0, int(sb.get("bits") or 0)) + int(amount)
        awarded = (awarded + [event_id])[-150:]
        update = {**sb, "bits": bits, "awarded": awarded}
        if event == "daily_complete":
            try:
                play_date = datetime.strptime(daily_key, "%Y-%m-%d").date()
            except (TypeError, ValueError):
                play_date = None
            utc_today = datetime.now(timezone.utc).date()
            if play_date is not None and abs((play_date - utc_today).days) <= 2:
                today_key = play_date.isoformat()
                yesterday_key = (play_date - timedelta(days=1)).isoformat()
                previous = str(sb.get("lastDailyDate") or "")
                streak = max(0, int(sb.get("dailyStreak") or 0))
                if previous == today_key:
                    pass
                elif previous == yesterday_key:
                    streak += 1
                else:
                    streak = 1
                update["dailyStreak"] = streak
                update["dailyBest"] = max(streak, int(sb.get("dailyBest") or 0))
                update["lastDailyDate"] = today_key
        txn.set(ref, {"sameBrain": update}, merge=True)
        return bits, False

    try:
        bits, duplicate = award(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    state = _same_brain_user_state(email)
    return jsonify({
        "ok": True,
        "bits": bits,
        "duplicate": duplicate,
        "dailyStreak": state["dailyStreak"],
        "dailyBest": state["dailyBest"],
        "lastDailyDate": state["lastDailyDate"],
    })


@bp.post("/same-brain/unlock")
def same_brain_unlock():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    payload = request.get_json(silent=True) or {}
    item = str(payload.get("item") or "").strip()
    cost = SAME_BRAIN_COSMETICS.get(item)
    email = _signed_in_email()
    client = db()
    if cost is None or not email or not client:
        return jsonify({"error": "invalid"}), 400
    ref = client.collection("users").document(email)
    transaction = client.transaction()

    @cloud_firestore.transactional
    def buy(txn):
        snap = ref.get(transaction=txn)
        data = snap.to_dict() or {}
        sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
        unlocks = list(sb.get("unlocks") or [])
        bits = max(0, int(sb.get("bits") or 0))
        if item in unlocks:
            return bits, unlocks, True
        if bits < cost:
            return bits, unlocks, False
        bits -= cost
        unlocks.append(item)
        txn.set(ref, {"sameBrain": {**sb, "bits": bits, "unlocks": unlocks}}, merge=True)
        return bits, unlocks, True

    try:
        bits, unlocks, success = buy(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not success:
        return jsonify({"error": "not_enough_bits", "bits": bits}), 409
    return jsonify({"ok": True, "bits": bits, "unlocks": unlocks})


@bp.post("/same-brain/tts")
def same_brain_tts():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    user_state = _same_brain_user_state(_signed_in_email())
    if not user_state["plus"]:
        return jsonify({"error": "plus_required"}), 403
    if not os.getenv("OPENAI_API_KEY"):
        return jsonify({"error": "tts_unavailable"}), 503
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    if not _same_brain_user_limit("tts", 40):
        return jsonify({"error": "rate_limited"}), 429
    payload = request.get_json(silent=True) or {}
    text = " ".join(str(payload.get("text") or "").split()).strip()[:500]
    voice = str(payload.get("voice") or "marin").strip().lower()
    question_id = str(payload.get("questionId") or "").strip()[:64]
    cacheable = bool(payload.get("cacheable")) and bool(question_id) and not question_id.startswith("custom_")
    if voice not in {"marin", "cedar", "coral", "sage"}:
        voice = "marin"
    if not text:
        return jsonify({"error": "invalid"}), 400

    model = "gpt-4o-mini-tts"
    instructions = "Warm, natural, playful game-host delivery. Clear and friendly. Do not sound exaggerated."
    cache_path = ""
    if cacheable:
        digest = hashlib.sha256(
            ("|".join([model, voice, question_id, instructions, text])).encode("utf-8")
        ).hexdigest()
        cache_path = f"same_brain/tts/{voice}/{digest}.mp3"
        cached_audio = download_storage_bytes(cache_path)
        if cached_audio:
            response = Response(cached_audio, mimetype="audio/mpeg")
            response.headers["Cache-Control"] = "private, max-age=604800"
            response.headers["X-AI-Voice"] = "OpenAI"
            response.headers["X-TTS-Cache"] = "HIT"
            return response

    from faithsparks.services.ai_budget import ai_budget_ok

    if not ai_budget_ok("same_brain_tts", 1):
        return jsonify({"error": "tts_unavailable"}), 503
    try:
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=1)
        speech = client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            instructions=instructions,
            response_format="mp3",
        )
        audio = speech.read()
    except Exception:
        return jsonify({"error": "tts_failed"}), 503

    if cache_path:
        upload_storage_bytes(audio, cache_path, content_type="audio/mpeg")

    response = Response(audio, mimetype="audio/mpeg")
    response.headers["Cache-Control"] = "private, max-age=604800" if cacheable else "private, max-age=86400"
    response.headers["X-AI-Voice"] = "OpenAI"
    response.headers["X-TTS-Cache"] = "MISS" if cacheable else "BYPASS"
    return response


SAME_BRAIN_GROUP_COLLECTION = "same_brain_groups"
SAME_BRAIN_GROUP_TTL_DAYS = 14
SAME_BRAIN_GROUP_MAX_PLAYERS = 8


def _recent_docs(collection, limit: int):
    """Newest-first sample; falls back to an unordered read if ordering fails."""
    try:
        return list(collection.order_by("updatedAt", direction="DESCENDING").limit(limit).stream())
    except Exception:
        return list(collection.limit(limit).stream())


def _same_brain_user_limit(scope: str, limit: int) -> bool:
    """Per-user, per-worker hourly cap for cost-bearing Same Brain endpoints."""
    key = _signed_in_email() or request.remote_addr or "unknown"
    return check_rate_limit(f"same_brain_{scope}", key, limit=limit, window_seconds=3600, local_only=True).allowed


def _same_brain_group_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(7))


def _same_brain_clean_name(value: object) -> str:
    return " ".join(str(value or "").split()).strip()[:20]


def _same_brain_validate_answers(question_ids: object, answers: object) -> tuple[list[str], list[int]] | None:
    if not isinstance(question_ids, list) or not isinstance(answers, list):
        return None
    if len(question_ids) not in {5, 10} or len(answers) != len(question_ids):
        return None
    qids = [str(item or "").strip()[:40] for item in question_ids]
    if any(not item for item in qids) or len(set(qids)) != len(qids):
        return None
    normalized = []
    for raw in answers:
        if type(raw) is not int:
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None
        if value < 0 or value > 3:
            return None
        normalized.append(value)
    return qids, normalized


def _same_brain_group_audience(value) -> str:
    return value if value in ("kids", "tween", "mixed", "everyone") else "everyone"


def _same_brain_group_result(data: dict) -> dict:
    players = []
    for raw in data.get("players") or []:
        if not isinstance(raw, dict):
            continue
        players.append({
            "name": _same_brain_clean_name(raw.get("name")),
            "answers": [int(v) for v in (raw.get("answers") or [])[:10]],
        })
    return {
        "code": str(data.get("code") or ""),
        "pack": str(data.get("pack") or "random")[:24],
        "audience": _same_brain_group_audience(data.get("audience")),
        "questionIds": list(data.get("questionIds") or [])[:10],
        "players": players[:SAME_BRAIN_GROUP_MAX_PLAYERS],
        "maxPlayers": SAME_BRAIN_GROUP_MAX_PLAYERS,
    }


def _same_brain_group_invite(data: dict) -> dict:
    players = [p for p in (data.get("players") or []) if isinstance(p, dict)]
    host_name = _same_brain_clean_name(players[0].get("name")) if players else "A friend"
    return {
        "code": str(data.get("code") or ""),
        "pack": str(data.get("pack") or "random")[:24],
        "audience": _same_brain_group_audience(data.get("audience")),
        "questionIds": list(data.get("questionIds") or [])[:10],
        "hostName": host_name,
        "playerCount": min(len(players), SAME_BRAIN_GROUP_MAX_PLAYERS),
        "maxPlayers": SAME_BRAIN_GROUP_MAX_PLAYERS,
    }


def _same_brain_group_ref(code: str):
    code = (code or "").strip().upper()
    if not code or len(code) > 12:
        return None
    try:
        client = db()
    except Exception:
        client = None
    return client.collection(SAME_BRAIN_GROUP_COLLECTION).document(code) if client else None


@bp.post("/same-brain/group")
def same_brain_group_create():
    access_response = None if request.path.startswith("/same-brain/group") else _require_access()
    if access_response is not None:
        return access_response

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    payload = request.get_json(silent=True) or {}
    name = _same_brain_clean_name(payload.get("name"))
    validated = _same_brain_validate_answers(payload.get("questionIds"), payload.get("answers"))
    if not name or not validated:
        return jsonify({"error": "invalid"}), 400
    question_ids, answers = validated
    if len(question_ids) == 10 and not has_active_plus(get_user_doc(_signed_in_email())):
        return jsonify({"error": "plus_required"}), 403
    pack = str(payload.get("pack") or "random").strip().lower()[:24]

    ref = None
    code = ""
    for _ in range(8):
        code = _same_brain_group_code()
        ref = _same_brain_group_ref(code)
        if ref is not None and not ref.get().exists:
            break
    if ref is None:
        return jsonify({"error": "storage_unavailable"}), 503
    if ref.get().exists:
        return jsonify({"error": "try_again"}), 503

    now = datetime.now(timezone.utc)
    result_key = secrets.token_urlsafe(18)
    data = {
        "code": code,
        "pack": pack,
        "questionIds": question_ids,
        "audience": _same_brain_group_audience(payload.get("audience")),
        "players": [{"name": name, "answers": answers, "joinedAt": now}],
        "createdAt": now,
        "updatedAt": now,
        "expiresAt": now + timedelta(days=SAME_BRAIN_GROUP_TTL_DAYS),
        "resultKeyHash": hashlib.sha256(result_key.encode("utf-8")).hexdigest(),
    }
    try:
        ref.create(data)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    response = _same_brain_group_result(data)
    response["resultKey"] = result_key
    return jsonify(response), 201


@bp.get("/same-brain/group/<code>")
def same_brain_group_get(code: str):
    access_response = None if request.path.startswith("/same-brain/group") else _require_access()
    if access_response is not None:
        return access_response
    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    try:
        snap = ref.get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410
    return jsonify(_same_brain_group_invite(data))


@bp.get("/same-brain/group/<code>/results")
def same_brain_group_results(code: str):
    access_response = None if request.path.startswith("/same-brain/group") else _require_access()
    if access_response is not None:
        return access_response
    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    try:
        snap = ref.get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410
    supplied = str(request.args.get("key") or "")
    expected = str(data.get("resultKeyHash") or "")
    supplied_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    participant = any(hmac.compare_digest(supplied_hash, str(p.get("resultKeyHash") or "")) for p in data.get("players", []))
    if not supplied or not (participant or (expected and hmac.compare_digest(supplied_hash, expected))):
        return jsonify({"error": "forbidden"}), 403
    return jsonify(_same_brain_group_result(data))


@bp.post("/same-brain/group/<code>/join")
def same_brain_group_join(code: str):
    access_response = None if request.path.startswith("/same-brain/group") else _require_access()
    if access_response is not None:
        return access_response

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    payload = request.get_json(silent=True) or {}
    name = _same_brain_clean_name(payload.get("name"))
    validated = _same_brain_validate_answers(payload.get("questionIds"), payload.get("answers"))
    if not name or not validated:
        return jsonify({"error": "invalid"}), 400
    question_ids, answers = validated
    player_key = str(payload.get("playerKey") or "")[:128]
    key_hash = hashlib.sha256(player_key.encode("utf-8")).hexdigest() if len(player_key) >= 16 else ""

    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    client = db()
    if not client:
        return jsonify({"error": "storage_unavailable"}), 503
    transaction = client.transaction()

    @cloud_firestore.transactional
    def add_player(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            return ("not_found", None)
        data = snap.to_dict() or {}
        expires = data.get("expiresAt")
        if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
            return ("expired", None)
        if list(data.get("questionIds") or []) != question_ids:
            return ("invalid", None)
        players = list(data.get("players") or [])
        if key_hash and any(p.get("resultKeyHash") == key_hash for p in players):
            return ("ok", data)
        if len(players) >= SAME_BRAIN_GROUP_MAX_PLAYERS:
            return ("full", data)
        name_key = name.casefold()
        if any(_same_brain_clean_name(p.get("name")).casefold() == name_key for p in players if isinstance(p, dict)):
            return ("name_taken", data)
        players.append({"name": name, "answers": answers, "resultKeyHash": key_hash, "joinedAt": datetime.now(timezone.utc)})
        data["players"] = players
        data["updatedAt"] = datetime.now(timezone.utc)
        txn.update(ref, {"players": players, "updatedAt": data["updatedAt"]})
        return ("ok", data)

    try:
        status, data = add_player(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if status != "ok":
        status_code = {"expired": 410, "not_found": 404, "invalid": 400, "full": 409, "name_taken": 409}.get(status, 400)
        return jsonify({"error": status}), status_code
    return jsonify(_same_brain_group_result(data))


SAME_BRAIN_EVENTS = {
    "rematch_requested",
    "challenge_accepted",
    "home_view",
    "return_visit",
    "start",
    "challenge_created",
    "challenge_shared",
    "beat_chain_shared",
    "custom_created",
    "challenge_opened",
    "result_completed",
    "result_shared",
    "response_submitted",
    "creator_result_opened",
    "daily_crowd_viewed",
    "together_created",
    "together_joined",
    "together_completed",
    "together_opened",
    "together_first_finished",
    "question_seen",
    "question_answered",
    "question_abandoned",
    "question_flagged",
    "plus_trial_started",
    "plus_upgrade_clicked",
    "rematch_started",
}


@bp.post("/same-brain/analytics")
def same_brain_analytics():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    pack = str(payload.get("pack") or "unknown").strip().lower()[:24]
    run_id = "".join(ch for ch in str(payload.get("runId") or "") if ch.isalnum() or ch in {"-", "_"})[:64]
    audience = str(payload.get("audience") or "everyone").strip().lower()
    if audience not in {"kids", "tween", "mixed", "everyone"}:
        audience = "everyone"
    question_id = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("questionId") or ""))[:64].strip()
    source_code = re.sub(r"[^A-Z0-9]", "", str(payload.get("sourceCode") or "").upper())[:12]
    try:
        elapsed_ms = max(0, min(120000, int(payload.get("elapsedMs") or 0)))
    except (TypeError, ValueError):
        elapsed_ms = 0
    if event not in SAME_BRAIN_EVENTS:
        return jsonify({"error": "unknown_event"}), 400

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    if not _same_brain_user_limit("analytics", 300):
        return jsonify({"ok": True, "rate_limited": True})

    detail_key = question_id or source_code or ""
    dedupe_key = f"same_brain_metric:{run_id or 'legacy'}:{event}:{pack}:{detail_key}"
    if session.get(dedupe_key):
        return jsonify({"ok": True, "duplicate": True})

    try:
        client = db()
        if client:
            shard_ref(client, "same_brain_funnel").set(
                {
                    "total": google_firestore.Increment(1),
                    "events": {event: google_firestore.Increment(1)},
                    "packs": {pack: google_firestore.Increment(1)},
                    "audiences": {audience: google_firestore.Increment(1)},
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            if run_id:
                run_update = {
                    "events": {event: True},
                    "pack": pack,
                    "audience": audience,
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                }
                if source_code:
                    run_update["sourceCode"] = source_code
                client.collection("same_brain_lab_runs").document(run_id).set(run_update, merge=True)
            if question_id and event in {"question_seen", "question_answered", "question_abandoned", "question_flagged"}:
                update = {
                    event: google_firestore.Increment(1),
                    "audiences": {audience: google_firestore.Increment(1)},
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                }
                if elapsed_ms and event in {"question_answered", "question_abandoned"}:
                    update["elapsedMsTotal"] = google_firestore.Increment(elapsed_ms)
                    update["elapsedSamples"] = google_firestore.Increment(1)
                client.collection("same_brain_question_stats_lab").document(question_id).set(update, merge=True)
    except Exception:
        # Analytics must never interrupt gameplay.
        pass

    # Bound the signed session cookie during long replay sessions.
    old_keys = [key for key in session if key.startswith("same_brain_metric:")]
    for key in old_keys[:-63]:
        session.pop(key, None)
    session[dedupe_key] = True
    return jsonify({"ok": True})


_SAME_BRAIN_METRICS_CACHE_SECONDS = 600
_same_brain_metrics_cache: dict[str, tuple[float, bytes, str]] = {}


def _is_games_admin(email: str | None) -> bool:
    allowed = {item.strip().casefold() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
    return bool(email and email in allowed)


@bp.get("/same-brain/metrics")
def same_brain_metrics():
    """Admin-only dashboard. Expensive (~800 reads), so cached for 10 minutes."""
    access_response = _require_access()
    if access_response is not None:
        return access_response
    if not _is_games_admin(_signed_in_email()):
        return Response("Not found", status=404, mimetype="text/plain")
    cache_key = "json" if request.args.get("format") == "json" else "html"
    cached = _same_brain_metrics_cache.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < _SAME_BRAIN_METRICS_CACHE_SECONDS and request.args.get("fresh") != "1":
        return Response(cached[1], mimetype=cached[2])
    response = make_response(_same_brain_metrics_response())
    if response.status_code == 200:
        _same_brain_metrics_cache[cache_key] = (now, response.get_data(), response.mimetype)
    return response


def _same_brain_metrics_response():
    client = db()

    def _doc_counts(doc_id: str) -> dict:
        if not client:
            return {}
        try:
            data = read_counts(client, doc_id)
            return data.get("events") if isinstance(data.get("events"), dict) else {}
        except Exception:
            return {}

    def _run_docs(collection_name: str, limit: int = 500) -> list[dict]:
        if not client:
            return []
        rows = []
        try:
            for snap in _recent_docs(client.collection(collection_name), limit):
                data = snap.to_dict() or {}
                events = data.get("events") if isinstance(data.get("events"), dict) else {}
                rows.append({
                    "id": snap.id,
                    "events": {str(k): bool(v) for k, v in events.items()},
                    "pack": str(data.get("pack") or "unknown")[:24],
                    "audience": str(data.get("audience") or "everyone")[:16],
                    "sourceCode": str(data.get("sourceCode") or "")[:12],
                })
        except Exception:
            return []
        return rows

    def _question_stats(limit: int = 300) -> list[dict]:
        if not client:
            return []
        rows = []
        try:
            for snap in _recent_docs(client.collection("same_brain_question_stats"), limit):
                data = snap.to_dict() or {}
                seen = max(0, int(data.get("question_seen") or 0))
                answered = max(0, int(data.get("question_answered") or 0))
                abandoned = max(0, int(data.get("question_abandoned") or 0))
                flagged = max(0, int(data.get("question_flagged") or 0))
                samples = max(0, int(data.get("elapsedSamples") or 0))
                elapsed_total = max(0, int(data.get("elapsedMsTotal") or 0))
                rows.append({
                    "id": snap.id,
                    "seen": seen,
                    "answered": answered,
                    "abandoned": abandoned,
                    "flagged": flagged,
                    "avgMs": round(elapsed_total / samples) if samples else None,
                    "abandonRate": round(abandoned / seen * 100, 1) if seen else None,
                })
        except Exception:
            return []
        return rows

    public_events = _doc_counts("same_brain_public_funnel")
    labs_events = _doc_counts("same_brain_funnel")
    public_runs = _run_docs("same_brain_public_runs")
    question_rows = _question_stats()

    def _event_count(events: dict, name: str) -> int:
        return max(0, int(events.get(name) or 0))

    def _cohort_rate_rows(rows: list[dict], den_event: str, num_event: str) -> dict:
        denominator_runs = [row for row in rows if row["events"].get(den_event)]
        denominator = len(denominator_runs)
        numerator = sum(1 for row in denominator_runs if row["events"].get(num_event))
        if denominator <= 0:
            return {"value": None, "numerator": 0, "denominator": 0}
        return {
            "value": round(numerator / denominator * 100, 1),
            "numerator": numerator,
            "denominator": denominator,
        }

    def _cohort_rate(den_event: str, num_event: str) -> dict:
        return _cohort_rate_rows(public_runs, den_event, num_event)

    metrics = [
        {
            "key": "creatorCompletion",
            "label": "Creator quiz completion",
            "why": "Of people who start their own quiz, how many finish all 5 and create a challenge?",
            "rate": _cohort_rate("start", "challenge_created"),
            "good": 70,
            "watch": 50,
            "problem": "People are dropping out before finishing the five questions.",
            "action": "Test the five-question flow on phones. Shorten/confusing questions or remove any interaction friction.",
        },
        {
            "key": "creatorShare",
            "label": "Creator share rate",
            "why": "Of finished challenges, how many actually get shared?",
            "rate": _cohort_rate("challenge_created", "challenge_shared"),
            "good": 30,
            "watch": 15,
            "problem": "People finish but do not send the challenge.",
            "action": "Improve the challenge-created payoff, share copy, preview, and primary Share button.",
        },
        {
            "key": "inviteCompletion",
            "label": "Friend completion rate",
            "why": "Of friends who open a challenge, how many finish and submit their result?",
            "rate": _cohort_rate("challenge_opened", "response_submitted"),
            "good": 65,
            "watch": 40,
            "problem": "Invitees open the game but do not finish it.",
            "action": "Simplify the invite/name step and inspect where mobile players abandon the five questions.",
        },
        {
            "key": "chainRate",
            "label": "Viral chain rate",
            "why": "Of friends who see a result, how many challenge the next person?",
            "rate": _cohort_rate("result_completed", "beat_chain_shared"),
            "good": 20,
            "watch": 10,
            "problem": "People enjoy the result but the chain stops there.",
            "action": "Strengthen the 'Who knows you better?' CTA and make the next share feel personally interesting.",
        },
        {
            "key": "resultShare",
            "label": "Result-card share rate",
            "why": "Of completed results, how many share the result card itself?",
            "rate": _cohort_rate("result_completed", "result_shared"),
            "good": 20,
            "watch": 8,
            "problem": "The result is not interesting enough to show other people.",
            "action": "Improve the result card/highlights before adding more gameplay features.",
        },
        {
            "key": "togetherCompletion",
            "label": "Start Together completion",
            "why": "Of people who create a two-phone Together game, how many reach the shared result?",
            "rate": _cohort_rate("together_created", "together_completed"),
            "good": 70,
            "watch": 45,
            "problem": "Together games are being created but not completed on both phones.",
            "action": "Test sharing, room re-entry, waiting, and second-player completion on real devices.",
        },
    ]

    for metric in metrics:
        rate = metric["rate"]
        value = rate["value"]
        sample = rate["denominator"]
        if sample < 10:
            metric["status"] = "learning"
            metric["statusLabel"] = "Not enough data"
            metric["diagnosis"] = f"Only {sample} matched run{'s' if sample != 1 else ''}. Wait for at least 10 before reacting."
        elif value is None:
            metric["status"] = "learning"
            metric["statusLabel"] = "No data"
            metric["diagnosis"] = "No matched runs yet."
        elif value >= metric["good"]:
            metric["status"] = "good"
            metric["statusLabel"] = "Healthy"
            metric["diagnosis"] = "This part of the loop looks healthy for now."
        elif value >= metric["watch"]:
            metric["status"] = "watch"
            metric["statusLabel"] = "Watch"
            metric["diagnosis"] = metric["problem"]
        else:
            metric["status"] = "problem"
            metric["statusLabel"] = "Problem"
            metric["diagnosis"] = metric["problem"]

    rough_home = _event_count(public_events, "home_view")
    rough_returns = _event_count(public_events, "return_visit")
    rough_return_rate = round(min(rough_returns, rough_home) / rough_home * 100, 1) if rough_home else None

    legacy_anomalies = []
    legacy_starts = _event_count(public_events, "start")
    legacy_results = _event_count(public_events, "result_completed")
    if legacy_results > legacy_starts and legacy_starts > 0:
        legacy_anomalies.append(
            "Old aggregate counters show more completed results than starts. This is expected from the previous session-level dedupe logic and should not be used as a completion rate."
        )
    if not public_runs:
        legacy_anomalies.append(
            "Run-based tracking has just started. The dashboard will become trustworthy as new plays arrive."
        )

    next_problem = next((m for m in metrics if m["status"] == "problem"), None)
    next_watch = next((m for m in metrics if m["status"] == "watch"), None)
    priority = next_problem or next_watch


    audience_summary = {}
    for audience in ("kids", "tween", "mixed", "everyone"):
        rows = [row for row in public_runs if row.get("audience") == audience]
        audience_summary[audience] = {
            "runs": len(rows),
            "creatorCompletion": _cohort_rate_rows(rows, "start", "challenge_created"),
            "friendCompletion": _cohort_rate_rows(rows, "challenge_opened", "response_submitted"),
            "chainRate": _cohort_rate_rows(rows, "result_completed", "beat_chain_shared"),
        }

    top_question_flags = sorted(
        [row for row in question_rows if row["flagged"] or row["abandoned"]],
        key=lambda row: (row["flagged"], row["abandonRate"] or 0, row["seen"]),
        reverse=True,
    )[:12]
    referral_runs = sum(1 for row in public_runs if row.get("sourceCode"))
    plus_trial_starts = _event_count(public_events, "plus_trial_started")
    plus_upgrade_clicks = _event_count(public_events, "plus_upgrade_clicked")

    rates = {
        "completionRate": _cohort_rate("start", "challenge_created"),
        "challengeAcceptanceRate": _cohort_rate("challenge_opened", "challenge_accepted"),
        "inviteCompletionRate": _cohort_rate("challenge_opened", "response_submitted"),
        "chainRate": _cohort_rate("result_completed", "beat_chain_shared"),
        "rematchRate": _cohort_rate("result_completed", "rematch_requested"),
        "creatorPayoffRate": _cohort_rate("challenge_created", "creator_result_opened"),
        "returnRate": _cohort_rate("home_view", "return_visit"),
        "shareRate": _cohort_rate("challenge_created", "challenge_shared"),
    }
    payload = {
        "rates": rates,
        "rateDefinitions": {"returnRate": "Returning page visits / page visits, same browser; not user retention", "completionRate": "Creator runs that created a challenge / creator starts", "sample": "The 500 most recently updated public runs"},
        "ok": True,
        "runBased": True,
        "trackedRuns": len(public_runs),
        "metrics": metrics,
        "audiences": audience_summary,
        "questionHealth": top_question_flags,
        "referralRuns": referral_runs,
        "plusSignals": {"trialStarts": plus_trial_starts, "upgradeClicks": plus_upgrade_clicks},
        "roughReturnRate": {
            "value": rough_return_rate,
            "returns": rough_returns,
            "homeViews": rough_home,
            "note": "Directional only: return/home counters are still session-based, not a clean user cohort.",
        },
        "priority": {
            "label": priority["label"],
            "action": priority["action"],
        } if priority else None,
        "warnings": legacy_anomalies,
        "raw": {
            "publicEvents": {key: max(0, int(value or 0)) for key, value in public_events.items()},
            "labsEvents": {key: max(0, int(value or 0)) for key, value in labs_events.items()},
        },
    }

    if request.args.get("format") == "json":
        return jsonify(payload)

    def _pct(value):
        return "—" if value is None else f"{value:.1f}%"

    status_styles = {
        "good": ("#eaf8ef", "#1d7a3b", "✅"),
        "watch": ("#fff7df", "#8a6410", "⚠️"),
        "problem": ("#fff0f0", "#a52a2a", "🚨"),
        "learning": ("#f2effa", "#655a7b", "🧪"),
    }

    metric_cards = []
    for metric in metrics:
        bg, fg, icon = status_styles[metric["status"]]
        rate = metric["rate"]
        metric_cards.append(f"""
        <section class="metric">
          <div class="metric-top">
            <div><div class="eyebrow">{icon} {metric["statusLabel"]}</div><h2>{metric["label"]}</h2></div>
            <div class="number">{_pct(rate["value"])}</div>
          </div>
          <div class="sample">{rate["numerator"]} of {rate["denominator"]} matched runs</div>
          <p>{metric["why"]}</p>
          <div class="diagnosis" style="background:{bg};color:{fg}">
            <strong>{metric["diagnosis"]}</strong>
            <span>{metric["action"] if metric["status"] in {"problem", "watch"} else ""}</span>
          </div>
        </section>
        """)

    warning_html = "".join(f"<li>{warning}</li>" for warning in legacy_anomalies) or "<li>No tracking anomalies detected.</li>"
    priority_html = (
        f"<div class='priority'><strong>Fix this next: {priority['label']}</strong><span>{priority['action']}</span></div>"
        if priority else
        "<div class='priority healthy'><strong>No obvious funnel problem yet.</strong><span>Keep collecting real-user runs before changing the game.</span></div>"
    )

    raw_rows = "".join(
        f"<tr><td>{key.replace('_', ' ')}</td><td>{max(0, int(value or 0))}</td></tr>"
        for key, value in sorted(public_events.items())
    ) or "<tr><td colspan='2'>No public events yet.</td></tr>"

    audience_rows = "".join(
        f"<tr><td>{audience}</td><td>{data['runs']}</td><td>{_pct(data['creatorCompletion']['value'])}</td><td>{_pct(data['friendCompletion']['value'])}</td><td>{_pct(data['chainRate']['value'])}</td></tr>"
        for audience, data in audience_summary.items()
    )
    question_health_rows = "".join(
        f"<tr><td>{row['id']}</td><td>{row['seen']}</td><td>{row['flagged']}</td><td>{_pct(row['abandonRate'])}</td><td>{'—' if row['avgMs'] is None else str(round(row['avgMs']/100)/10)+'s'}</td></tr>"
        for row in top_question_flags
    ) or "<tr><td colspan='5'>No question-quality warnings yet.</td></tr>"

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Same Brain MVP Metrics</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f7f4fc;color:#241d36;font:16px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:980px;margin:0 auto;padding:32px 18px 60px}}h1{{font-size:2rem;margin:0}}h2{{font-size:1.05rem;margin:3px 0 0}}p{{color:#675f78;margin:9px 0}}
.top{{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}}.sub{{color:#756b86;margin-top:5px}}
.chip{{background:#fff;border:1px solid #ded6ef;border-radius:999px;padding:8px 12px;font-weight:800;white-space:nowrap}}
.priority{{border:1px solid #d9cff2;background:#fff;border-radius:16px;padding:15px 17px;margin:16px 0;display:flex;flex-direction:column;gap:4px}}
.priority strong{{color:#5b3fd0}}.priority span{{color:#665e76}}.priority.healthy strong{{color:#24753d}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}}.metric{{background:#fff;border:1px solid #e0d9ee;border-radius:18px;padding:17px;box-shadow:0 8px 24px rgba(59,37,97,.05)}}
.metric-top{{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}}.eyebrow{{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#756b86}}
.number{{font-size:2rem;font-weight:950;color:#6f4bd8}}.sample{{font-size:.82rem;color:#847b91;margin-top:7px}}.diagnosis{{border-radius:12px;padding:10px 11px;margin-top:12px;font-size:.86rem;display:flex;flex-direction:column;gap:3px}}
.section{{background:#fff;border:1px solid #e0d9ee;border-radius:18px;padding:18px;margin-top:14px}}ul{{margin:9px 0;padding-left:20px;color:#665e76}}table{{width:100%;border-collapse:collapse}}td,th{{padding:7px 4px;border-bottom:1px solid #eee9f5;text-align:left}}th{{font-size:.8rem;color:#756b86}}td:last-child{{font-weight:800}}
.note{{font-size:.84rem;color:#7b7288}}a{{color:#5b3fd0;font-weight:800}}@media(max-width:700px){{.grid{{grid-template-columns:1fr}}.top{{flex-direction:column}}}}
</style>
</head>
<body><main>
<div class="top"><div><h1>🧠 Same Brain MVP Health</h1><div class="sub">Find the first place the viral loop is leaking. Fix that before adding features.</div></div><div class="chip">{len(public_runs)} tracked runs</div></div>
{priority_html}
<div class="grid">{''.join(metric_cards)}</div>
<section class="section">
<h2>Return behavior</h2>
<div class="number">{_pct(rough_return_rate)}</div>
<p>{rough_returns} return events / {rough_home} home views.</p>
<div class="note">Directional only for now. These counters are session-based, so do not make product decisions from this until there is more traffic.</div>
</section>
<section class="section">
<h2>Audience breakdown</h2>
<table><thead><tr><th>Audience</th><th>Runs</th><th>Creator finish</th><th>Friend finish</th><th>Viral chain</th></tr></thead><tbody>{audience_rows}</tbody></table>
<p class="note">Use this to see whether Kids, Tween/Teen, Mixed Ages, or Everyone is carrying the loop.</p>
</section>
<section class="section">
<h2>Question health</h2>
<table><thead><tr><th>Question ID</th><th>Seen</th><th>Flagged</th><th>Abandon</th><th>Avg time</th></tr></thead><tbody>{question_health_rows}</tbody></table>
<p class="note">High flags, abandonment, or answer time are candidates for rewrite/removal. Wait for meaningful sample sizes.</p>
</section>
<section class="section">
<h2>Growth & Plus signals</h2>
<p><strong>{referral_runs}</strong> attributed viral-chain runs · <strong>{plus_trial_starts}</strong> premium deck trials · <strong>{plus_upgrade_clicks}</strong> Plus clicks.</p>
<div class="note">These are intent signals, not paid conversions. Keep the recipient side free.</div>
</section>
<section class="section"><h2>Data-quality notes</h2><ul>{warning_html}</ul><div class="note">The old 200% completion rate was not real. The previous counters did not represent matched cohorts. New runs are now matched anonymously by quiz run.</div></section>
<section class="section"><h2>Raw public events</h2><table>{raw_rows}</table><p class="note">Useful for debugging, not for calculating funnel rates by hand.</p></section>
<section class="section"><a href="?format=json">View raw dashboard JSON</a></section>
</main></body></html>"""
    response = make_response(html)
    response.mimetype = "text/html"
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.get("/<slug>")
def play(slug: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    game = _game_for_slug(slug)
    if not game:
        return render_template("404.html"), 404

    game_path = _GAME_DIR / game["file"]
    if not game_path.is_file():
        return render_template("404.html"), 404

    roster, sync_config = _games_bootstrap(_signed_in_email())
    html = game_path.read_text(encoding="utf-8")
    bootstrap = (
        "<script>"
        "window.__GAMES_ACCOUNT_ROSTER__=" + json.dumps(roster).replace("<", "\\u003c") + ";"
        "window.__GAMES_SYNC_CONFIG__=" + json.dumps(sync_config).replace("<", "\\u003c") + ";"
        "</script>"
    )
    if "</head>" in html:
        html = html.replace("</head>", bootstrap + "</head>", 1)
    else:
        html = bootstrap + html

    response = make_response(html)
    response.mimetype = "text/html"
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response
