import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from firebase_admin import firestore
from PIL import Image, ImageDraw, ImageFont
from flask import Blueprint, jsonify, make_response, render_template, redirect, url_for, session, Response, request, flash, send_file, abort, current_app, g
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day
from faithsparks.services.collections import get_collections
from faithsparks.services.lesson_pack import (
    LESSON_PACK_AGE_PROFILES,
    LESSON_PACK_MODES,
    LESSON_PACK_SESSION_MINUTES,
    available_lesson_pack_versions,
    selectable_lesson_pack_versions,
    create_lesson_pack,
)
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.firestore import db
from faithsparks.services.storage import signed_url_for_path
from faithsparks.util.request_utils import get_client_ip
from faithsparks.products import MATURITY, products_for, products_for_audience


bp = Blueprint('public', __name__)
MAX_LESSON_PACK_VERSE_LEN = 120
MAX_LESSON_PACK_VERSION_LEN = 12
MAX_LESSON_PACK_AGE_LEN = 24


def _is_signed_in() -> bool:
    return bool(google.authorized and session.get("user_email"))


def _require_login(next_url: str | None = None):
    flash("Please sign in to use your lesson packs.", "warning")
    return redirect(url_for("google.login", next=next_url or request.url))


def _valid_lesson_pack_slug(slug: str) -> bool:
    return bool(re.fullmatch(r'[a-z0-9\-]+', slug or ""))


def _owned_lesson_pack(slug: str) -> dict | None:
    session_owned = set(session.get("owned_lesson_pack_slugs") or [])
    if not (_valid_lesson_pack_slug(slug) and db and session.get("user_email")):
        return {"slug": slug} if slug in session_owned else None
    email = session["user_email"]
    try:
        docs = (
            db.collection("lesson_packs")
            .where(filter=firestore.FieldFilter("email", "==", email))
            .where(filter=firestore.FieldFilter("slug", "==", slug))
            .limit(1)
            .stream()
        )
        doc = next(docs, None)
        if doc:
            return doc.to_dict()
        return {"slug": slug} if slug in session_owned else None
    except Exception as exc:
        try:
            current_app.logger.warning("[%s] lesson pack ownership check failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        return {"slug": slug} if slug in session_owned else None


def _remember_lesson_pack_slug(slug: str) -> None:
    if not _valid_lesson_pack_slug(slug):
        return
    owned = set(session.get("owned_lesson_pack_slugs") or [])
    owned.add(slug)
    session["owned_lesson_pack_slugs"] = sorted(owned)[-25:]


def _too_long(value: str, max_len: int) -> bool:
    return len(value or "") > max_len


def _lesson_pack_storage_paths(owned: dict, slug: str) -> tuple[str | None, str | None]:
    pdf_storage_path = owned.get("pdf_storage_path") or f"lesson_packs/{slug}/{slug}.pdf"
    zip_storage_path = owned.get("zip_storage_path") or f"lesson_packs/{slug}/{slug}.zip"
    return pdf_storage_path, zip_storage_path


def _lesson_pack_local_paths(slug: str) -> tuple[Path, Path]:
    pack_dir = Path('output') / 'lesson_packs' / slug
    return pack_dir / f'{slug}.pdf', pack_dir / f'{slug}.zip'


def _lesson_pack_local_manifest(slug: str) -> dict:
    manifest_path = Path("output") / "lesson_packs" / slug / f"{slug}-manifest.json"
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _lesson_pack_result_details(owned: dict, slug: str) -> dict:
    manifest = _lesson_pack_local_manifest(slug)
    raw_components = owned.get("components") or manifest.get("components") or {}
    components = raw_components if isinstance(raw_components, dict) else {}
    normalized_components = {
        "worksheet": bool(components.get("worksheet", True)),
        "coloring": bool(components.get("coloring", False)),
        "word_search": bool(components.get("word_search", True)),
        "parent_guide": bool(components.get("parent_guide", True)),
        "combined_pdf": bool(components.get("combined_pdf", owned.get("pdf_storage_path"))),
    }
    warnings = owned.get("warnings") or manifest.get("warnings") or []
    if not isinstance(warnings, list):
        warnings = []
    pdf_path, _ = _lesson_pack_local_paths(slug)
    has_pdf = pdf_path.exists() or bool(owned.get("pdf_storage_path")) or normalized_components["combined_pdf"]
    lesson_mode = owned.get("lesson_mode") or manifest.get("lessonMode") or "house-church"
    session_minutes = owned.get("session_minutes") or manifest.get("sessionMinutes") or 40
    include_coloring = owned.get("include_coloring")
    if include_coloring is None:
        include_coloring = manifest.get("includeColoring", normalized_components["coloring"])
    scripture_verified = owned.get("scripture_verified")
    if scripture_verified is None:
        scripture_verified = manifest.get("scriptureVerified", False)
    return {
        "components": normalized_components,
        "status": owned.get("status") or manifest.get("status") or "ready",
        "warnings": [str(item) for item in warnings if str(item).strip()][:5],
        "download_format": "PDF" if has_pdf else "ZIP",
        "lesson_mode": lesson_mode if lesson_mode in LESSON_PACK_MODES else "house-church",
        "session_minutes": int(session_minutes) if str(session_minutes).isdigit() else 40,
        "include_coloring": bool(include_coloring),
        "scripture_verified": bool(scripture_verified),
        "mode_label": LESSON_PACK_MODES.get(lesson_mode, LESSON_PACK_MODES["house-church"])["short_label"],
    }


def _lesson_pack_artifact_available(owned: dict, slug: str) -> bool:
    pdf_path, zip_path = _lesson_pack_local_paths(slug)
    if pdf_path.exists() or zip_path.exists():
        return True
    pdf_storage_path, zip_storage_path = _lesson_pack_storage_paths(owned, slug)
    return bool(
        (pdf_storage_path and signed_url_for_path(pdf_storage_path, minutes=10))
        or (zip_storage_path and signed_url_for_path(zip_storage_path, minutes=10))
    )


@bp.route('/')
def index():
    if google.authorized:
        nxt = session.pop("after_login_next", None)
        if nxt:
            return redirect(nxt)
    game_of_week = _get_game_of_week()
    return render_template(
        'index.html',
        user_info=session.get('user_info'),
        proverb_of_day=get_proverb_of_day(),
        game_of_week=game_of_week,
    )


@bp.route('/about')
def about():
    return render_template('about.html')


@bp.route('/copyright')
def copyright_policy():
    return render_template('copyright_policy.html')


@bp.route('/terms')
def terms():
    return render_template('terms.html')


@bp.route('/privacy')
def privacy():
    return render_template('privacy.html')


@bp.route('/start-here')
def start_here():
    return render_template(
        'start_here.html',
        proverb_of_day=get_proverb_of_day(),
        game_of_week=_get_game_of_week(),
    )


@bp.get('/families')
def families():
    return render_template(
        'audience_start.html',
        audience_kicker='For Families & Homeschool',
        audience_title='Bring Scripture into the week you already have.',
        page_description='Simple tools for homeschool mornings, family worship, memory work, and time together—without another complicated curriculum.',
        primary_label="Make today’s worksheet",
        primary_path='/generate',
        secondary_label='Plan a family Scripture week',
        secondary_path='/lesson-pack?mode=family',
        products=products_for_audience('families'),
        audience='families',
    )


@bp.get('/churches')
def churches():
    return render_template(
        'audience_start.html',
        audience_kicker='For Churches & Small Groups',
        audience_title='Prepare the gathering. Lead it from the room.',
        page_description='Low-prep tools for house churches and small teams: build the plan, present worship clearly, and help mixed ages participate.',
        primary_label='Build a gathering',
        primary_path='/lesson-pack?mode=house-church',
        secondary_label='Open Worship',
        secondary_path='/worship',
        products=products_for_audience('churches'),
        audience='churches',
    )


@bp.get('/prepare')
def prepare():
    return render_template('prepare.html', products=products_for('prepare'))


@bp.get('/play')
def play():
    return render_template('play.html', products=products_for('play'))


@bp.get('/labs')
def labs():
    return render_template(
        'labs.html',
        products=products_for('labs'),
        maturity_labels=MATURITY,
        noindex=True,
    )


_SAME_BRAIN_FILE = Path(__file__).resolve().parents[1] / "content" / "lab_games" / "same-brain.html"
SAME_BRAIN_SHORT_COLLECTION = "same_brain_challenges"
SAME_BRAIN_DAILY_COLLECTION = "same_brain_daily_stats"
SAME_BRAIN_TOGETHER_COLLECTION = "same_brain_together"
SAME_BRAIN_SHORT_TTL_DAYS = 30
SAME_BRAIN_TOGETHER_TTL_DAYS = 2
SAME_BRAIN_SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_SAME_BRAIN_PUBLIC_EVENTS = {
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
}


def _same_brain_public_csrf() -> str:
    token = str(session.get("_csrf_token") or "")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _same_brain_public_challenge_payload(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    try:
        version = int(raw.get("v") or 0)
    except (TypeError, ValueError):
        return None
    name = " ".join(str(raw.get("n") or "").split()).strip()[:20]
    qids = raw.get("q")
    answers = raw.get("a")
    if version != 1 or not name or not isinstance(qids, list) or not isinstance(answers, list):
        return None
    if len(qids) not in {5, 10} or len(answers) != len(qids):
        return None
    clean_qids = [str(q or "").strip()[:40] for q in qids]
    if any(not q for q in clean_qids) or len(set(clean_qids)) != len(clean_qids):
        return None
    clean_answers = []
    for value in answers:
        try:
            answer = int(value)
        except (TypeError, ValueError):
            return None
        if answer < 0 or answer > 3:
            return None
        clean_answers.append(answer)

    clean = {
        "v": 1,
        "n": name,
        "q": clean_qids,
        "a": clean_answers,
        "p": str(raw.get("p") or "shared").strip().lower()[:24],
    }
    audience = str(raw.get("u") or "everyone").strip().lower()
    if audience not in {"kids", "tween", "mixed", "everyone"}:
        audience = "everyone"
    clean["u"] = audience
    referral = re.sub(r"[^A-Z0-9]", "", str(raw.get("r") or "").upper())[:12]
    if referral:
        clean["r"] = referral
    daily_label = " ".join(str(raw.get("d") or "").split()).strip()[:40]
    if daily_label:
        clean["d"] = daily_label
    daily_key = str(raw.get("dk") or "").strip()[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", daily_key):
        clean["dk"] = daily_key

    custom = raw.get("x")
    if custom is not None:
        if not isinstance(custom, list) or len(custom) > 10:
            return None
        clean_custom = []
        for item in custom:
            if not isinstance(item, dict):
                return None
            item_id = str(item.get("id") or "").strip()[:40]
            question = " ".join(str(item.get("q") or "").split()).strip()[:140]
            options = item.get("a")
            if not item_id or not question or not isinstance(options, list) or not (2 <= len(options) <= 4):
                return None
            clean_options = [" ".join(str(v or "").split()).strip()[:60] for v in options]
            if any(not value for value in clean_options):
                return None
            clean_custom.append({"id": item_id, "q": question, "a": clean_options})
        if clean_custom:
            clean["x"] = clean_custom

    history = raw.get("h")
    if history is not None:
        if not isinstance(history, dict):
            return None
        try:
            score = int(history.get("s"))
        except (TypeError, ValueError):
            return None
        if score < 0 or score > 100:
            return None
        clean["h"] = {
            "s": score,
            "a": " ".join(str(history.get("a") or "").split()).strip()[:20],
            "b": " ".join(str(history.get("b") or "").split()).strip()[:20],
        }
    return clean


def _same_brain_owner_id() -> str:
    email = str(session.get("user_email") or "").strip().lower()
    if not email:
        return ""
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


def _same_brain_short_code() -> str:
    return "".join(secrets.choice(SAME_BRAIN_SHORT_CODE_ALPHABET) for _ in range(7))


@bp.post('/same-brain/challenge')
def same_brain_public_challenge_create():
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    limit = check_rate_limit(
        "same_brain_public_challenge_create",
        get_client_ip(),
        limit=60,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429

    payload = _same_brain_public_challenge_payload(request.get_json(silent=True) or {})
    if payload is None:
        return jsonify({"error": "invalid"}), 400
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    ref = None
    code = ""
    for _ in range(10):
        code = _same_brain_short_code()
        ref = db.collection(SAME_BRAIN_SHORT_COLLECTION).document(code)
        try:
            if not ref.get().exists:
                break
        except Exception:
            return jsonify({"error": "storage_unavailable"}), 503
    if ref is None:
        return jsonify({"error": "storage_unavailable"}), 503
    try:
        if ref.get().exists:
            return jsonify({"error": "try_again"}), 503
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503

    now = datetime.now(timezone.utc)
    creator_key = secrets.token_urlsafe(18)
    creator_key_hash = hashlib.sha256(creator_key.encode("utf-8")).hexdigest()
    try:
        ref.set({
            "payload": payload,
            "creatorKeyHash": creator_key_hash,
            "ownerId": _same_brain_owner_id(),
            "responses": [],
            "createdAt": now,
            "expiresAt": now + timedelta(days=SAME_BRAIN_SHORT_TTL_DAYS),
        })
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    return jsonify({"ok": True, "code": code, "creatorKey": creator_key}), 201


@bp.get('/same-brain/challenge/<code>')
def same_brain_public_challenge_get(code: str):
    code = str(code or "").strip().upper()
    if len(code) != 7 or any(ch not in SAME_BRAIN_SHORT_CODE_ALPHABET for ch in code):
        return jsonify({"error": "not_found"}), 404
    limit = check_rate_limit(
        "same_brain_public_challenge_get",
        get_client_ip(),
        limit=600,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503
    try:
        snap = db.collection(SAME_BRAIN_SHORT_COLLECTION).document(code).get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410
    payload = _same_brain_public_challenge_payload(data.get("payload") or {})
    if payload is None:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"ok": True, "challenge": payload})


def _same_brain_valid_code(code: str) -> str | None:
    code = str(code or "").strip().upper()
    if len(code) != 7 or any(ch not in SAME_BRAIN_SHORT_CODE_ALPHABET for ch in code):
        return None
    return code


def _same_brain_response_payload(raw, challenge: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    name = " ".join(str(raw.get("name") or "").split()).strip()[:20]
    response_id = re.sub(r"[^A-Za-z0-9_-]", "", str(raw.get("responseId") or ""))[:64]
    answers = raw.get("answers")
    qids = list(challenge.get("q") or [])
    if not name or len(response_id) < 8 or not isinstance(answers, list) or len(answers) != len(qids):
        return None
    clean_answers = []
    for value in answers:
        try:
            answer = int(value)
        except (TypeError, ValueError):
            return None
        if answer < 0 or answer > 3:
            return None
        clean_answers.append(answer)
    creator_answers = list(challenge.get("a") or [])
    if len(creator_answers) != len(clean_answers):
        return None
    matches = sum(1 for a, b in zip(creator_answers, clean_answers) if int(a) == int(b))
    score = round(matches / len(clean_answers) * 100) if clean_answers else 0
    return {
        "id": response_id,
        "name": name,
        "answers": clean_answers,
        "score": score,
    }


@bp.post('/same-brain/challenge/<code>/response')
def same_brain_public_challenge_response(code: str):
    code = _same_brain_valid_code(code)
    if not code:
        return jsonify({"error": "not_found"}), 404

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    limit = check_rate_limit(
        "same_brain_public_challenge_response",
        get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    ref = db.collection(SAME_BRAIN_SHORT_COLLECTION).document(code)
    transaction = db.transaction()

    @firestore.transactional
    def save_response(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            return "not_found", None
        data = snap.to_dict() or {}
        expires = data.get("expiresAt")
        if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
            return "expired", None
        challenge = _same_brain_public_challenge_payload(data.get("payload") or {})
        if challenge is None:
            return "not_found", None
        response = _same_brain_response_payload(request.get_json(silent=True) or {}, challenge)
        if response is None:
            return "invalid", None

        responses = list(data.get("responses") or [])
        existing_index = next((i for i, item in enumerate(responses) if str(item.get("id") or "") == response["id"]), None)
        stored = {
            **response,
            "completedAt": datetime.now(timezone.utc),
        }
        if existing_index is None:
            if len(responses) >= 100:
                responses = responses[-99:]
            responses.append(stored)
        else:
            responses[existing_index] = stored
        txn.update(ref, {"responses": responses})
        return "ok", response

    try:
        status, response = save_response(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if status == "not_found":
        return jsonify({"error": "not_found"}), 404
    if status == "expired":
        return jsonify({"error": "expired"}), 410
    if status == "invalid":
        return jsonify({"error": "invalid"}), 400
    return jsonify({"ok": True, "score": response["score"]})


@bp.get('/same-brain/challenge/<code>/results')
def same_brain_public_challenge_results(code: str):
    code = _same_brain_valid_code(code)
    if not code:
        return jsonify({"error": "not_found"}), 404
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    limit = check_rate_limit(
        "same_brain_public_challenge_results",
        get_client_ip(),
        limit=600,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429

    try:
        snap = db.collection(SAME_BRAIN_SHORT_COLLECTION).document(code).get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410

    supplied = str(request.args.get("key") or "")
    stored_hash = str(data.get("creatorKeyHash") or "")
    supplied_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest() if supplied else ""
    key_ok = bool(stored_hash and supplied_hash and hmac.compare_digest(stored_hash, supplied_hash))
    owner_ok = bool(data.get("ownerId") and data.get("ownerId") == _same_brain_owner_id())
    if not key_ok and not owner_ok:
        return jsonify({"error": "forbidden"}), 403

    challenge = _same_brain_public_challenge_payload(data.get("payload") or {})
    if challenge is None:
        return jsonify({"error": "not_found"}), 404

    responses = []
    for raw in list(data.get("responses") or []):
        try:
            answers = [int(v) for v in list(raw.get("answers") or [])]
            if len(answers) != len(challenge.get("q") or []):
                continue
            responses.append({
                "id": str(raw.get("id") or "")[:64],
                "name": " ".join(str(raw.get("name") or "Friend").split()).strip()[:20] or "Friend",
                "answers": answers,
                "score": max(0, min(100, int(raw.get("score") or 0))),
            })
        except (TypeError, ValueError):
            continue

    return jsonify({
        "ok": True,
        "code": code,
        "challenge": challenge,
        "responses": responses,
        "responseCount": len(responses),
    })


def _same_brain_daily_date(value: str) -> str | None:
    value = str(value or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    today = datetime.now(timezone.utc).date()
    if abs((parsed - today).days) > 2:
        return None
    return value




def _same_brain_together_code(code: str) -> str | None:
    code = str(code or "").strip().upper()
    if len(code) != 7 or any(ch not in SAME_BRAIN_SHORT_CODE_ALPHABET for ch in code):
        return None
    return code


def _same_brain_together_result(data: dict) -> dict:
    players = []
    for raw in list(data.get("players") or [])[:2]:
        if not isinstance(raw, dict):
            continue
        players.append({
            "id": str(raw.get("id") or ""),
            "name": " ".join(str(raw.get("name") or "").split()).strip()[:20],
            "answers": [int(v) for v in list(raw.get("answers") or [])[:5]],
        })
    result = {
        "ok": True,
        "code": str(data.get("code") or ""),
        "questionIds": list(data.get("questionIds") or [])[:5],
        "pack": str(data.get("pack") or "random")[:24],
        "audience": str(data.get("audience") or "everyone")[:16],
        "playerCount": len(players),
        "ready": len(players) == 2,
    }
    if len(players) == 2:
        matches = sum(1 for a, b in zip(players[0]["answers"], players[1]["answers"]) if a == b)
        result["score"] = round(matches / 5 * 100)
        result["players"] = players
    return result


@bp.post('/same-brain/together')
def same_brain_public_together_create():
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    limit = check_rate_limit(
        "same_brain_public_together_create",
        get_client_ip(),
        limit=60,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429
    raw = request.get_json(silent=True) or {}
    qids = raw.get("questionIds")
    if not isinstance(qids, list) or len(qids) != 5:
        return jsonify({"error": "invalid"}), 400
    clean_qids = [str(q or "").strip()[:40] for q in qids]
    if any(not q for q in clean_qids) or len(set(clean_qids)) != 5:
        return jsonify({"error": "invalid"}), 400
    audience = str(raw.get("audience") or "everyone").strip().lower()
    if audience not in {"kids", "tween", "mixed", "everyone"}:
        audience = "everyone"
    pack = str(raw.get("pack") or "random").strip().lower()[:24]
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    ref = None
    code = ""
    for _ in range(10):
        code = _same_brain_short_code()
        ref = db.collection(SAME_BRAIN_TOGETHER_COLLECTION).document(code)
        try:
            if not ref.get().exists:
                break
        except Exception:
            return jsonify({"error": "storage_unavailable"}), 503
    if ref is None:
        return jsonify({"error": "storage_unavailable"}), 503
    now = datetime.now(timezone.utc)
    try:
        ref.set({
            "code": code,
            "questionIds": clean_qids,
            "pack": pack,
            "audience": audience,
            "players": [],
            "createdAt": now,
            "updatedAt": now,
            "expiresAt": now + timedelta(days=SAME_BRAIN_TOGETHER_TTL_DAYS),
        })
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    return jsonify({
        "ok": True,
        "code": code,
        "questionIds": clean_qids,
        "pack": pack,
        "audience": audience,
    }), 201


@bp.get('/same-brain/together/<code>')
def same_brain_public_together_get(code: str):
    code = _same_brain_together_code(code)
    if not code or not db:
        return jsonify({"error": "not_found"}), 404
    try:
        snap = db.collection(SAME_BRAIN_TOGETHER_COLLECTION).document(code).get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410
    return jsonify({
        "ok": True,
        "code": code,
        "questionIds": list(data.get("questionIds") or [])[:5],
        "pack": str(data.get("pack") or "random")[:24],
        "audience": str(data.get("audience") or "everyone")[:16],
        "playerCount": min(len(list(data.get("players") or [])), 2),
    })


@bp.post('/same-brain/together/<code>/answer')
def same_brain_public_together_answer(code: str):
    code = _same_brain_together_code(code)
    if not code or not db:
        return jsonify({"error": "not_found"}), 404
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    raw = request.get_json(silent=True) or {}
    name = " ".join(str(raw.get("name") or "").split()).strip()[:20]
    player_id = re.sub(r"[^A-Za-z0-9_-]", "", str(raw.get("playerId") or ""))[:64]
    answers = raw.get("answers")
    if not name or len(player_id) < 8 or not isinstance(answers, list) or len(answers) != 5:
        return jsonify({"error": "invalid"}), 400
    try:
        clean_answers = [int(v) for v in answers]
    except (TypeError, ValueError):
        return jsonify({"error": "invalid"}), 400
    if any(v < 0 or v > 3 for v in clean_answers):
        return jsonify({"error": "invalid"}), 400

    ref = db.collection(SAME_BRAIN_TOGETHER_COLLECTION).document(code)
    transaction = db.transaction()

    @firestore.transactional
    def save_player(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            return "not_found", None
        data = snap.to_dict() or {}
        expires = data.get("expiresAt")
        if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
            return "expired", None
        players = list(data.get("players") or [])
        existing = next((i for i, p in enumerate(players) if str(p.get("id") or "") == player_id), None)
        stored = {
            "id": player_id,
            "name": name,
            "answers": clean_answers,
            "completedAt": datetime.now(timezone.utc),
        }
        if existing is None:
            if len(players) >= 2:
                return "full", data
            players.append(stored)
        else:
            players[existing] = stored
        data["players"] = players
        data["updatedAt"] = datetime.now(timezone.utc)
        txn.update(ref, {"players": players, "updatedAt": data["updatedAt"]})
        return "ok", data

    try:
        status, data = save_player(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if status == "not_found":
        return jsonify({"error": "not_found"}), 404
    if status == "expired":
        return jsonify({"error": "expired"}), 410
    if status == "full":
        return jsonify({"error": "full"}), 409
    return jsonify(_same_brain_together_result(data))


@bp.get('/same-brain/together/<code>/result')
def same_brain_public_together_result(code: str):
    code = _same_brain_together_code(code)
    if not code or not db:
        return jsonify({"error": "not_found"}), 404
    player_id = re.sub(r"[^A-Za-z0-9_-]", "", str(request.args.get("playerId") or ""))[:64]
    if len(player_id) < 8:
        return jsonify({"error": "forbidden"}), 403
    try:
        snap = db.collection(SAME_BRAIN_TOGETHER_COLLECTION).document(code).get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    players = list(data.get("players") or [])
    if not any(str(p.get("id") or "") == player_id for p in players if isinstance(p, dict)):
        return jsonify({"error": "forbidden"}), 403
    return jsonify(_same_brain_together_result(data))


@bp.post('/same-brain/daily')
def same_brain_public_daily_submit():
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    limit = check_rate_limit(
        "same_brain_public_daily_submit",
        get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429

    payload = request.get_json(silent=True) or {}
    date_key = _same_brain_daily_date(payload.get("date"))
    response_id = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("responseId") or ""))[:64]
    qids = [str(v or "").strip()[:40] for v in (payload.get("questionIds") or [])]
    answers = payload.get("answers") or []
    if not date_key or len(response_id) < 8 or len(qids) != 5 or len(set(qids)) != 5 or len(answers) != 5:
        return jsonify({"error": "invalid"}), 400
    clean_answers = []
    for value in answers:
        try:
            answer = int(value)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid"}), 400
        if answer < 0 or answer > 3:
            return jsonify({"error": "invalid"}), 400
        clean_answers.append(answer)
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    stats_ref = db.collection(SAME_BRAIN_DAILY_COLLECTION).document(date_key)
    response_ref = stats_ref.collection("responses").document(response_id)
    transaction = db.transaction()

    @firestore.transactional
    def record(txn):
        if response_ref.get(transaction=txn).exists:
            return True
        snap = stats_ref.get(transaction=txn)
        data = snap.to_dict() or {}
        questions = dict(data.get("questions") or {})
        for qid, answer in zip(qids, clean_answers):
            counts = list(questions.get(qid) or [0, 0, 0, 0])[:4]
            while len(counts) < 4:
                counts.append(0)
            counts[answer] = int(counts[answer] or 0) + 1
            questions[qid] = counts
        txn.set(
            stats_ref,
            {
                "players": int(data.get("players") or 0) + 1,
                "questions": questions,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        txn.set(response_ref, {"createdAt": firestore.SERVER_TIMESTAMP})
        return False

    try:
        duplicate = record(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    return jsonify({"ok": True, "duplicate": duplicate})


@bp.get('/same-brain/daily/<date_key>')
def same_brain_public_daily_get(date_key: str):
    date_key = _same_brain_daily_date(date_key)
    qids = [str(v or "").strip()[:40] for v in (request.args.get("q") or "").split(",") if str(v or "").strip()]
    if not date_key or len(qids) != 5 or len(set(qids)) != 5:
        return jsonify({"error": "invalid"}), 400

    limit = check_rate_limit(
        "same_brain_public_daily_get",
        get_client_ip(),
        limit=600,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "rate_limited"}), 429
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503
    try:
        snap = db.collection(SAME_BRAIN_DAILY_COLLECTION).document(date_key).get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    data = snap.to_dict() or {} if snap.exists else {}
    questions = data.get("questions") if isinstance(data.get("questions"), dict) else {}
    return jsonify({
        "ok": True,
        "date": date_key,
        "players": max(0, int(data.get("players") or 0)),
        "questions": {qid: [max(0, int(v or 0)) for v in list(questions.get(qid) or [0, 0, 0, 0])[:4]] for qid in qids},
    })


@bp.get('/same-brain/my-challenges')
def same_brain_public_my_challenges():
    owner_id = _same_brain_owner_id()
    if not owner_id:
        return jsonify({"error": "signin_required"}), 401
    if not db:
        return jsonify({"error": "storage_unavailable"}), 503

    rows = []
    try:
        query = db.collection(SAME_BRAIN_SHORT_COLLECTION).where("ownerId", "==", owner_id).limit(30)
        for snap in query.stream():
            data = snap.to_dict() or {}
            expires = data.get("expiresAt")
            if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
                continue
            payload = _same_brain_public_challenge_payload(data.get("payload") or {})
            if not payload:
                continue
            responses = [r for r in (data.get("responses") or []) if isinstance(r, dict)]
            rows.append({
                "code": snap.id,
                "name": payload.get("n") or "You",
                "pack": payload.get("p") or "shared",
                "dailyLabel": payload.get("d") or "",
                "responseCount": len(responses),
                "createdAt": getattr(data.get("createdAt"), "timestamp", lambda: 0)(),
            })
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    rows.sort(key=lambda item: item.get("createdAt") or 0, reverse=True)
    return jsonify({"ok": True, "challenges": rows[:20]})


def _same_brain_font(size: int, bold: bool = False):
    names = ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf"] if bold else ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


@bp.get('/same-brain/og.png')
def same_brain_og_image():
    image = Image.new("RGB", (1200, 630), "#211936")
    draw = ImageDraw.Draw(image)
    for y in range(630):
        t = y / 629
        r = int(33 + (111 - 33) * t)
        g = int(25 + (75 - 25) * t)
        b = int(54 + (216 - 54) * t)
        draw.line((0, y, 1200, y), fill=(r, g, b))
    draw.ellipse((890, 70, 1130, 310), fill=(92, 72, 148))
    draw.ellipse((1010, 360, 1180, 530), fill=(98, 76, 154))
    title_font = _same_brain_font(92, True)
    sub_font = _same_brain_font(42, False)
    tiny_font = _same_brain_font(30, True)
    draw.text((90, 120), "SAME BRAIN?", font=title_font, fill="white")
    draw.text((90, 255), "Think you know each other?", font=sub_font, fill="#efe9ff")
    draw.rounded_rectangle((90, 360, 570, 455), radius=44, fill="#ffffff")
    draw.text((135, 385), "5 questions. 1 friend. Go.", font=tiny_font, fill="#5c3fbc")
    draw.text((90, 535), "faithsparksprintables.com/same-brain", font=_same_brain_font(25, False), fill="#ded4ff")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    output.seek(0)
    response = send_file(output, mimetype="image/png", max_age=86400)
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@bp.get('/same-brain')
def same_brain_public():
    # Challenge URLs can contain custom questions, but are intentionally capped
    # so malformed links cannot turn this lightweight public route into a large
    # request/parser surface.
    if len(request.query_string or b"") > 8000:
        return Response("That Same Brain challenge link is too large.", 414, mimetype="text/plain")

    if not _SAME_BRAIN_FILE.is_file():
        abort(404)

    html = _SAME_BRAIN_FILE.read_text(encoding="utf-8")
    is_challenge_page = bool(request.args.get("c") or request.args.get("s") or request.args.get("g"))
    if not is_challenge_page:
        html = html.replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">', 1)
    preview_name = ""
    preview_code = _same_brain_valid_code(request.args.get("s") or "")
    if preview_code and db:
        try:
            preview_snap = db.collection(SAME_BRAIN_SHORT_COLLECTION).document(preview_code).get()
            preview_data = preview_snap.to_dict() or {} if preview_snap.exists else {}
            preview_payload = _same_brain_public_challenge_payload(preview_data.get("payload") or {})
            if preview_payload:
                preview_name = preview_payload.get("n") or ""
        except Exception:
            preview_name = ""
    if "</head>" in html:
        safe_name = str(preview_name).replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;") if preview_name else ""
        preview_title = (safe_name + " challenged you — Same Brain?") if safe_name else "Same Brain? — Play Today’s 5"
        image_url = request.url_root.rstrip("/") + "/same-brain/og.png"
        social_meta = (
            '<meta property="og:title" content="' + preview_title + '">'
            '<meta property="og:description" content="Answer 5 quick questions and see how often your brains match.">'
            '<meta property="og:type" content="website">'
            '<meta property="og:image" content="' + image_url + '">'
            '<meta property="og:image:width" content="1200">'
            '<meta property="og:image:height" content="630">'
            '<meta name="twitter:card" content="summary_large_image">'
            '<meta name="twitter:title" content="' + preview_title + '">'
            '<meta name="twitter:description" content="Answer 5 quick questions and see how often your brains match.">'
            '<meta name="twitter:image" content="' + image_url + '">'
        )
        html = html.replace("</head>", social_meta + "</head>", 1)
    bootstrap = (
        "<style>"
        ".advanced-play,.shop{display:none!important}"
        ".labs,.topbar a[href='/labs/games']{display:none!important}"
        "</style>"
        "<script>"
        "window.__SAME_BRAIN_PUBLIC__=true;"
        "window.__GAMES_SYNC_CONFIG__="
        + json.dumps({"csrfToken": _same_brain_public_csrf()}).replace("<", "\\u003c")
        + ";"
        "</script>"
    )
    if "</head>" in html:
        html = html.replace("</head>", bootstrap + "</head>", 1)
    else:
        html = bootstrap + html

    # Public sharing should feel standalone rather than like a Labs escape
    # hatch. Keep the development route untouched for signed-in testing.
    html = html.replace(
        "<title>Same Brain? | Faith Sparks Labs</title>",
        "<title>Same Brain? — Play Today’s 5</title>",
        1,
    )

    response = make_response(html)
    response.mimetype = "text/html"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Challenge query strings contain nicknames/answers and should never land
    # in search results. The clean landing page may be indexed.
    if request.args.get("c") or request.args.get("s") or request.args.get("g") or request.args.get("t"):
        response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return response


@bp.post('/same-brain/analytics')
def same_brain_public_analytics():
    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    pack = str(payload.get("pack") or "unknown").strip().lower()[:24]
    run_id = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("runId") or ""))[:64]
    audience = str(payload.get("audience") or "everyone").strip().lower()
    if audience not in {"kids", "tween", "mixed", "everyone"}:
        audience = "everyone"
    question_id = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("questionId") or ""))[:64]
    source_code = re.sub(r"[^A-Z0-9]", "", str(payload.get("sourceCode") or "").upper())[:12]
    try:
        elapsed_ms = max(0, min(120000, int(payload.get("elapsedMs") or 0)))
    except (TypeError, ValueError):
        elapsed_ms = 0
    if event not in _SAME_BRAIN_PUBLIC_EVENTS:
        return jsonify({"error": "unknown_event"}), 400

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _same_brain_public_csrf()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    # Public analytics is deliberately aggregate-only. Rate limit per IP so a
    # shared link cannot be used as a cheap write-amplification endpoint.
    limit = check_rate_limit(
        "same_brain_public_analytics",
        get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"ok": True, "rate_limited": True})

    detail_key = question_id or source_code or ""
    dedupe_key = f"sb_public_metric:{run_id or 'legacy'}:{event}:{pack}:{detail_key}"
    if session.get(dedupe_key):
        return jsonify({"ok": True, "duplicate": True})

    try:
        if db:
            db.collection("analytics").document("same_brain_public_funnel").set(
                {
                    "total": firestore.Increment(1),
                    "events": {event: firestore.Increment(1)},
                    "packs": {pack: firestore.Increment(1)},
                    "audiences": {audience: firestore.Increment(1)},
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            if run_id:
                run_update = {
                    "events": {event: True},
                    "pack": pack,
                    "audience": audience,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                }
                if source_code:
                    run_update["sourceCode"] = source_code
                db.collection("same_brain_public_runs").document(run_id).set(run_update, merge=True)
            if question_id and event in {"question_seen", "question_answered", "question_abandoned", "question_flagged"}:
                update = {
                    event: firestore.Increment(1),
                    "audiences": {audience: firestore.Increment(1)},
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                }
                if elapsed_ms and event in {"question_answered", "question_abandoned"}:
                    update["elapsedMsTotal"] = firestore.Increment(elapsed_ms)
                    update["elapsedSamples"] = firestore.Increment(1)
                db.collection("same_brain_question_stats").document(question_id).set(update, merge=True)
    except Exception:
        # Analytics can never be allowed to break the game.
        pass

    session[dedupe_key] = True
    return jsonify({"ok": True})


@bp.route('/lesson-pack', methods=['GET', 'POST'])
def lesson_pack():
    if request.method == 'GET':
        available_versions = available_lesson_pack_versions()
        version_prefill = (request.args.get('version') or 'web').strip().lower()
        age_prefill = (request.args.get('age') or '6-8').strip()
        mode_prefill = (request.args.get('mode') or 'house-church').strip().lower()
        try:
            minutes_prefill = int(request.args.get('minutes') or 40)
        except (TypeError, ValueError):
            minutes_prefill = 40
        if version_prefill not in selectable_lesson_pack_versions():
            version_prefill = 'web'
        if age_prefill not in LESSON_PACK_AGE_PROFILES:
            age_prefill = '6-8'
        if mode_prefill not in LESSON_PACK_MODES:
            mode_prefill = 'house-church'
        if minutes_prefill not in LESSON_PACK_SESSION_MINUTES:
            minutes_prefill = 40
        return render_template(
            'lesson_pack.html',
            verse_prefill=(request.args.get('verse') or '').strip(),
            version_prefill=version_prefill,
            age_prefill=age_prefill,
            cursive_prefill=(request.args.get('cursive') or '').strip().lower() in {'1', 'true', 'yes', 'on'},
            mode_prefill=mode_prefill,
            minutes_prefill=minutes_prefill,
            coloring_prefill=(request.args.get('coloring') or '').strip().lower() in {'1', 'true', 'yes', 'on'},
            lesson_pack_modes=LESSON_PACK_MODES,
            available_versions=available_versions,
            selectable_versions=selectable_lesson_pack_versions(),
            selection_from_url=any(key in request.args for key in ('verse', 'version', 'age', 'cursive', 'mode', 'minutes', 'coloring')),
            lesson_pack_signed_in=_is_signed_in(),
            proverb_of_day=get_proverb_of_day(),
            description="Build a low-prep, all-age house church gathering pack from one verified Bible passage.",
            og_description="A fast house church lesson pack with a gathering plan, worksheet, word search, and optional coloring page.",
        )

    verse_input = (request.form.get('verse') or '').strip()
    version = (request.form.get('version') or 'web').strip().lower()
    age_bracket = (request.form.get('age_bracket') or '6-8').strip()
    use_cursive = (request.form.get('use_cursive') or '').lower() in {'1', 'true', 'yes', 'on'}
    lesson_mode = (request.form.get('lesson_mode') or 'house-church').strip().lower()
    include_coloring = (request.form.get('include_coloring') or '').lower() in {'1', 'true', 'yes', 'on'}
    try:
        session_minutes = int(request.form.get('session_minutes') or 40)
    except (TypeError, ValueError):
        session_minutes = 40

    def builder_url(**overrides):
        values = {
            "verse": verse_input,
            "version": version,
            "age": age_bracket,
            "mode": lesson_mode,
            "minutes": session_minutes,
            "cursive": "1" if use_cursive else None,
            "coloring": "1" if include_coloring else None,
        }
        values.update(overrides)
        return url_for('public.lesson_pack', **values)
    if not verse_input:
        flash('Please enter a verse reference.', 'warning')
        return redirect(url_for('public.lesson_pack'))
    if (
        version not in selectable_lesson_pack_versions()
        or age_bracket not in LESSON_PACK_AGE_PROFILES
        or lesson_mode not in LESSON_PACK_MODES
        or session_minutes not in LESSON_PACK_SESSION_MINUTES
    ):
        flash("Choose one of the available formats, lengths, versions, and age ranges.", "warning")
        return redirect(builder_url(version='web', age='6-8', mode='house-church', minutes=40))
    if (
        _too_long(verse_input, MAX_LESSON_PACK_VERSE_LEN)
        or _too_long(version, MAX_LESSON_PACK_VERSION_LEN)
        or _too_long(age_bracket, MAX_LESSON_PACK_AGE_LEN)
    ):
        flash("Please shorten the lesson pack details and try again.", "warning")
        return redirect(url_for('public.lesson_pack'))
    if not _is_signed_in():
        next_url = builder_url()
        return _require_login(next_url)

    user_key = session.get("user_email") or get_client_ip()
    ip_key = get_client_ip()
    user_limit = check_rate_limit("lesson_pack:user", user_key, limit=6, window_seconds=60 * 60)
    ip_limit = check_rate_limit("lesson_pack:ip", ip_key, limit=18, window_seconds=60 * 60)
    if not user_limit.allowed or not ip_limit.allowed:
        flash("You've made several lesson packs recently. Please wait a bit before creating another.", "warning")
        return redirect(url_for('public.lesson_pack'))

    try:
        result = create_lesson_pack(
            user_email=session.get('user_email'),
            verse_input=verse_input,
            version=version,
            age_bracket=age_bracket,
            use_cursive=use_cursive,
            lesson_mode=lesson_mode,
            session_minutes=session_minutes,
            include_coloring=include_coloring,
        )
    except ValueError as exc:
        flash(str(exc) or "We couldn't build that lesson pack.", 'warning')
        return redirect(builder_url())
    except Exception as exc:
        try:
            current_app.logger.exception("[%s] lesson pack creation failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        if "could not be saved reliably" in str(exc).lower():
            flash("Your pages were built, but we could not save them reliably. Please try again.", 'warning')
        else:
            flash("We couldn't create that lesson pack yet. Please check the verse and try again.", 'warning')
        return redirect(builder_url())

    _remember_lesson_pack_slug(result['slug'])
    return redirect(url_for('public.lesson_pack_result', slug=result['slug']))


@bp.route('/lesson-pack/result/<slug>')
def lesson_pack_result(slug):
    if not _is_signed_in():
        return _require_login()
    # Sanitize slug: only allow safe filesystem characters.
    if not _valid_lesson_pack_slug(slug):
        abort(404)
    owned = _owned_lesson_pack(slug)
    if not owned:
        abort(404)
    if not _lesson_pack_artifact_available(owned, slug):
        flash('That pack is no longer available. Build a new one below.', 'warning')
        return redirect(url_for('public.lesson_pack'))
    manifest = _lesson_pack_local_manifest(slug)
    title = owned.get('title') or manifest.get('title') or slug.replace('-lesson-pack-', ': ').replace('-', ' ').title()
    details = _lesson_pack_result_details(owned, slug)
    return render_template(
        'lesson_pack_result.html',
        slug=slug,
        title=title,
        verse=owned.get('verse') or manifest.get('verse') or '',
        version=str(owned.get('version') or manifest.get('version') or 'web').lower(),
        age_bracket=owned.get('age_bracket') or manifest.get('ageBracket') or '6-8',
        use_cursive=bool(owned.get('use_cursive') if owned.get('use_cursive') is not None else manifest.get('useCursive')),
        noindex=True,
        **details,
    )


@bp.route('/lesson-pack/download/<slug>')
def lesson_pack_download(slug):
    if not _is_signed_in():
        return _require_login()
    if not _valid_lesson_pack_slug(slug):
        abort(404)
    owned = _owned_lesson_pack(slug)
    if not owned:
        abort(404)
    pdf_path, zip_path = _lesson_pack_local_paths(slug)
    if pdf_path.exists():
        return send_file(
            pdf_path,
            as_attachment=True,
            download_name=f'{slug}.pdf',
            mimetype='application/pdf',
        )
    if zip_path.exists():
        return send_file(
            zip_path,
            as_attachment=True,
            download_name=f'{slug}.zip',
            mimetype='application/zip',
        )
    pdf_storage_path, zip_storage_path = _lesson_pack_storage_paths(owned, slug)
    signed_pdf = signed_url_for_path(pdf_storage_path) if pdf_storage_path else None
    if signed_pdf:
        return redirect(signed_pdf)
    signed_zip = signed_url_for_path(zip_storage_path) if zip_storage_path else None
    if signed_zip:
        return redirect(signed_zip)
    flash('That pack is no longer available. Build it again below.', 'warning')
    return redirect(url_for('public.lesson_pack'))


@bp.route('/scripture-attribution')
def scripture_attribution():
    return render_template('scripture_attribution.html')


@bp.route('/healthz', methods=['GET', 'HEAD'])
def healthz():
    return Response("ok", 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    })


def _get_game_of_week():
    try:
        items = get_collections(show_all=False)
        games = [c for c in items if (c.get("kind") or "bundle") == "game"]
        games.sort(key=lambda c: (int(c.get("order") or 9999), c.get("title", "")))
        return games[0] if games else None
    except Exception:
        return None
