# test08-28-2025
from flask import Flask, Response, render_template, request, send_file, send_from_directory, redirect, url_for, session, flash, jsonify, g
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
from datetime import datetime

import os, json, re, traceback
import logging
import sys
import uuid
from urllib.parse import urlparse, urljoin, urlunparse
from zipfile import ZipFile
import threading
from io import BytesIO
from datetime import datetime, timedelta, timezone
from firebase_admin import firestore
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
import time
import pathlib
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
    ai_validate_custom_text,
    normalize_reference_title,
    preserve_letter_suffix,
)
from build_pdf import generate_pdf
from PIL import Image, ImageDraw, ImageFont
try:
    import markdown2  # type: ignore
except Exception:
    markdown2 = None

# Extracted services/utilities
from faithsparks.services.firestore import db
from faithsparks.services.storage import upload_to_storage, signed_url_for_path
from faithsparks.services.collections import get_collections, get_collection_meta, get_collection_verses, COLLECTIONS
from faithsparks.services.usage import _month_key, _get_user_plan, _get_usage, _quota_for_plan, _update_usage, _get_free_slugs
from faithsparks.services.themes import THEMES, get_theme_vars, list_all_themes, get_theme_selection
from faithsparks.services.stripe_svc import (
    stripe, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY,
    STRIPE_PRICE_FAMILY, STRIPE_PRICE_CLASSROOM,
    STRIPE_PRICE_FAMILY_MONTHLY, STRIPE_PRICE_FAMILY_ANNUAL,
    STRIPE_PRICE_CLASSROOM_MONTHLY, STRIPE_PRICE_CLASSROOM_ANNUAL,
    STRIPE_WEBHOOK_SECRET, resolve_price_id as _resolve_price_id
)
from faithsparks.util.slug import normalize_slug
from faithsparks.services import analytics as analytics_svc
from faithsparks.util.request_utils import get_client_ip, get_request_payload, log_request_summary
from faithsparks.views.worksheets import MAX_WORKSHEETS_PER_REQUEST

# Map passwords to pack metadata
PACKS = {
    # ESV – Print
    "sparks-esv-print": {
        "id": "esv_print",
        "name": "ESV Print Handwriting (30 Worksheets)",
        "filename": "30_Pack_ESV.pdf",
    },
    # ESV – Cursive
    "sparks-esv-cursive": {
        "id": "esv_cursive",
        "name": "ESV Cursive Handwriting (30 Worksheets)",
        "filename": "30_Pack_ESV_Cursive.pdf",
    },
    # KJV – Print
    "sparks-kjv-print": {
        "id": "kjv_print",
        "name": "KJV Print Handwriting (30 Worksheets)",
        "filename": "30_Pack_KJV.pdf",
    },
    # KJV – Cursive
    "sparks-kjv-cursive": {
        "id": "kjv_cursive",
        "name": "KJV Cursive Handwriting (30 Worksheets)",
        "filename": "30_Pack_KJV_Cursive.pdf",
    },
    # Mega bundle (all 4)
    "sparks-mega-bundle": {
        "id": "mega_bundle",
        "name": "Mega Bundle – All 4 Packs (120 Worksheets)",
        "filename": "30_Pack_MegaPack.zip",
    },
}

_CONFIG_CACHE: dict[str, dict] = {}
_CONFIG_TTL_SECS = 60
CLEANUP_INTERVAL_S = 60 * 60
CLEANUP_MAX_AGE_S = 7 * 24 * 60 * 60
_LAST_CLEANUP: float = 0.0

def _get_cached_config(doc_id: str) -> dict | None:
    """Cache repeated config reads for a short TTL."""
    now = time.time()
    entry = _CONFIG_CACHE.get(doc_id)
    if entry and now - entry.get("ts", 0) < _CONFIG_TTL_SECS:
        return entry["data"]
    if not db:
        return {}
    try:
        snap = db.collection("config").document(doc_id).get()
        data = snap.to_dict() if snap.exists else {}
    except Exception:
        data = {}
    _CONFIG_CACHE[doc_id] = {"data": data, "ts": now}
    return data

def _refresh_owned_packs(email: str | None) -> set[str]:
    """Cache the list of user-owned packs in session to avoid repeated reads."""
    if not (db and email):
        session.pop("user_owned_packs", None)
        return set()
    try:
        docs = db.collection("users").document(email).collection("purchases").stream()
        packs = {doc.id for doc in docs}
    except Exception:
        packs = set()
    session["user_owned_packs"] = list(packs)
    return packs

def _should_fetch_usage(path: str) -> bool:
    """Only refresh usage info for high-traffic pages."""
    if not path:
        return False
    for prefix in ("/generate", "/browse", "/prints", "/history", "/plus", "/games"):
        if path.startswith(prefix):
            return True
    return False

def _cleanup_output_dirs():
    global _LAST_CLEANUP
    now = time.time()
    if now - _LAST_CLEANUP < CLEANUP_INTERVAL_S:
        return
    _LAST_CLEANUP = now
    dirs = ["output", "output/thumbs", "output/packs"]
    cutoff = now - CLEANUP_MAX_AGE_S
    for base in dirs:
        path = pathlib.Path(base)
        if not path.exists():
            continue
        for child in path.iterdir():
            try:
                if child.is_dir():
                    continue
                if child.stat().st_mtime < cutoff:
                    child.unlink()
            except Exception:
                continue
# --- App Setup ---
# --- Environment / config flags (MUST be defined before use) ---
APP_ENV = os.getenv("APP_ENV", "dev").lower()
PRIMARY_DOMAIN = os.getenv("PRIMARY_DOMAIN", "faithsparksprintables.com")

# --- App Setup ---
app = Flask(__name__)

# Fail fast in production if secret is missing
if APP_ENV in {"prod", "production"} and not os.getenv("FLASK_SECRET_KEY"):
    raise RuntimeError("FLASK_SECRET_KEY must be set in production")

app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-only-secret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)


# Structured logging to stdout for easier aggregation
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
if not app.logger.handlers:
    app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)
app.logger.propagate = False


# Always prefer https URLs when generating links
app.config.update(PREFERRED_URL_SCHEME="https")

# Only pin cookies to the apex domain in production
if APP_ENV in {"prod", "production"}:
    app.config["SESSION_COOKIE_DOMAIN"] = f".{PRIMARY_DOMAIN}"

# Respect proxy headers (Render/Cloudflare) when enabled
enable_proxy_fix = os.getenv(
    "ENABLE_PROXY_FIX",
    "1" if APP_ENV in {"prod", "production"} else "0",
).lower() in {"1", "true", "yes"}
if enable_proxy_fix:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

@app.route('/manifest.webmanifest')
def pwa_manifest():
    """Serve the PWA manifest with minimal caching for quick updates."""
    response = send_from_directory('static', 'manifest.webmanifest')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Content-Type'] = 'application/manifest+json'
    return response

@app.route('/service-worker.js')
def service_worker():
    """Serve the service worker from the app root for full-scope control."""
    response = send_from_directory('static', 'service-worker.js')
    response.headers['Cache-Control'] = 'no-cache'
    return response


@app.route('/robots.txt')
def robots_txt():
    body = "\n".join(
        [
            "User-agent: *",
            "Allow: /",
            "Sitemap: https://faithsparksprintables.com/sitemap.xml",
            "",
        ]
    )
    return Response(body, mimetype="text/plain")


# Jinja filter for Markdown
def _md(text: str) -> str:
    try:
        if not text:
            return ""
        if markdown2:
            return markdown2.markdown(text)
        return text
    except Exception:
        return text

app.jinja_env.filters["markdown"] = _md

# Recommended cookie settings (don't break localhost/dev)
app.config["SESSION_COOKIE_SECURE"] = (APP_ENV in {"prod", "production"})
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


# Helpful OAuth env flags (no-op if already set)
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
# Do NOT set OAUTHLIB_INSECURE_TRANSPORT to 1 in production

# --- Google Auth ---
google_bp = make_google_blueprint(
    client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirect_to="oauth_finish",                    # <— was "index"
    scope=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
)
app.register_blueprint(google_bp, url_prefix="/login")

@app.before_request
def add_request_id():
    if not getattr(g, "req_id", None):
        g.req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

@app.before_request
def cleanup_old_outputs():
    _cleanup_output_dirs()

@app.before_request
def force_primary_domain():
    if APP_ENV not in {"prod", "production"}:
        return
    host = request.host.split(":")[0]
    if host == PRIMARY_DOMAIN:
        return
    parsed = urlparse(request.url)
    target = parsed._replace(scheme="https", netloc=PRIMARY_DOMAIN)
    return redirect(urlunparse(target), code=301)

def is_safe_url(target: str) -> bool:
    if not target:
        return False
    ref = urlparse(request.host_url)
    test = urlparse(urljoin(request.host_url, target))
    return (test.scheme in ("http", "https")) and (ref.netloc == test.netloc)

@app.before_request
def load_user_info():
    # When Flask-Dance blueprint handles /login/google*, capture ?next=...
    if request.blueprint == "google" or request.path.startswith("/login/google"):
        nxt = request.args.get("next")
        if nxt and is_safe_url(nxt):
            session["post_login_next"] = nxt
        return  # don't do user_info fetch mid-dance

    if google.authorized:
        if "user_info" not in session:
            resp = google.get("/oauth2/v1/userinfo")
            if resp.ok:
                session["user_info"] = resp.json()
                session["user_email"] = session["user_info"].get("email")
                session["clear_storage"] = True
                _refresh_owned_packs(session["user_email"])
        elif not session.get("user_owned_packs"):
            _refresh_owned_packs(session.get("user_email"))
    else:
        session.pop("user_info", None)
        session.pop("user_email", None)
        session.pop("user_owned_packs", None)


# -----------------------------
# CSRF (lightweight, no Flask-WTF)
# -----------------------------
import secrets
from flask import abort

CSRF_SESSION_KEY = "_csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_FORM_FIELD = "csrf_token"

def _get_csrf_token() -> str:
    """Return (and create if missing) a session-bound CSRF token."""
    tok = session.get(CSRF_SESSION_KEY)
    if not tok:
        tok = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = tok
    return tok

def _constant_time_eq(a: str, b: str) -> bool:
    try:
        return secrets.compare_digest(a or "", b or "")
    except Exception:
        return False

# Routes/endpoints to skip CSRF checks (webhooks + OAuth + static)
_CSRF_EXEMPT_PREFIXES = (
    "/stripe/webhook",
    "/login/google",     # flask-dance endpoints under this prefix
    "/oauth",            # your /oauth/finish etc
    "/static/",
    "/service-worker.js",
    "/manifest.webmanifest",
)

@app.before_request
def csrf_protect():
    """Validate CSRF token on mutating requests."""
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return

    path = request.path or ""
    for p in _CSRF_EXEMPT_PREFIXES:
        if path.startswith(p):
            return

    # Accept token from header (AJAX/fetch) or form field
    sent = (
        request.headers.get(CSRF_HEADER_NAME)
        or request.form.get(CSRF_FORM_FIELD)
        or request.args.get(CSRF_FORM_FIELD)  # last-resort (avoid using in new code)
    )

    expected = session.get(CSRF_SESSION_KEY)

    if not expected:
        # session missing token -> force creation and fail this request
        _get_csrf_token()
        abort(403)

    if not _constant_time_eq(sent, expected):
        abort(403)

@app.context_processor
def inject_csrf():
    """Expose csrf_token() helper to all templates."""
    return {"csrf_token": _get_csrf_token}


@app.before_request
def track_visit():
    if request.method not in ("GET", "HEAD"):
        return
    endpoint = request.endpoint or ""
    path = request.path or ""
    if endpoint == "static" or path.startswith("/static/"):
        return
    try:
        ip = get_client_ip()
        ua = request.headers.get("User-Agent", "")
        analytics_svc.record_visit(ip, ua)
    except Exception:
        app.logger.debug("Failed to record visit", exc_info=True)


@app.after_request
def add_correlation_headers(resp):
    req_id = getattr(g, "req_id", None)
    if req_id:
        resp.headers["X-Request-ID"] = req_id
    return resp


app.teardown_appcontext(analytics_svc.close_db)

# quotas and usage moved to yourapp.services.usage

# --- Helpers ---
def login_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            # keep path + query (e.g., /generate?v=John%203:16%20(ESV))
            next_url = request.full_path.rstrip("?") if request.query_string else request.path
            return redirect(url_for("google.login", next=next_url))
        return func(*args, **kwargs)
    return wrapper

def admin_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            return redirect(url_for("google.login"))
        email = session.get('user_email')
        if not is_admin_email(email):
            return "Forbidden", 403
        return func(*args, **kwargs)
    return wrapper

def is_public_browse_enabled() -> bool:
    return os.getenv('PUBLIC_BROWSE', '0') in ('1','true','True','yes','on')

def _fmt_dt(ts):
    try:
        return ts.strftime('%Y-%m-%d %H:%M') if ts else None
    except Exception:
        try:
            # Fallback to string
            return str(ts)
        except Exception:
            return None


def get_pack_by_password(raw_password: str):
    """Normalize and resolve a pack from a user-entered password."""
    if not raw_password:
        return None
    key = raw_password.strip().lower()
    return PACKS.get(key)


def get_pack_by_id(pack_id: str):
    """Return pack metadata by its id."""
    for data in PACKS.values():
        if data.get("id") == pack_id:
            return data
    return None


def _user_has_pack(user_email: str | None, pack_id: str) -> bool:
    if not (user_email and pack_id):
        return False
    owned = set(session.get("user_owned_packs") or [])
    if pack_id in owned:
        return True
    if not db:
        return False
    try:
        doc = (
            db.collection("users")
            .document(user_email)
            .collection("purchases")
            .document(pack_id)
            .get()
        )
        exists = doc.exists
        if exists:
            owned.add(pack_id)
            session["user_owned_packs"] = list(owned)
        return exists
    except Exception:
        return False


# --- Downloads portal ---
@app.route("/downloads", methods=["GET", "POST"])
def downloads():
    """
    Password-gated portal for pre-made worksheet packs.
    """
    error = None
    pack = None

    if request.method == "POST":
        password = request.form.get("password", "")
        pack = get_pack_by_password(password)
        if not pack:
            error = "That password doesn’t match any product. Please double-check and try again."
        else:
            session["unlocked_pack_id"] = pack["id"]
            flash(f"Unlocked {pack['name']}.", "success")

    if not pack:
        unlocked = session.get("unlocked_pack_id")
        if unlocked:
            pack = get_pack_by_id(unlocked)

    user_email = session.get("user_email")

    return render_template("downloads.html", error=error, pack=pack, user_email=user_email)


@app.route("/downloads/file/<pack_id>")
def download_file_pack(pack_id):
    """
    Serve the actual bundle for the unlocked pack.
    """
    unlocked_id = session.get("unlocked_pack_id")
    user_email = session.get("user_email")
    if not ((unlocked_id and unlocked_id == pack_id) or _user_has_pack(user_email, pack_id)):
        flash("Please enter your product password first.")
        return redirect(url_for("downloads"))
    if not unlocked_id and _user_has_pack(user_email, pack_id):
        session["unlocked_pack_id"] = pack_id

    pack = get_pack_by_id(pack_id)
    if not pack:
        flash("We couldn’t find that product.")
        return redirect(url_for("downloads"))

    bundles_dir = os.path.join(app.root_path, "static", "bundles")
    filename = pack["filename"]
    file_path = os.path.join(bundles_dir, filename)

    if not os.path.exists(file_path):
        app.logger.warning("Bundle missing on disk: %s", file_path)
        flash("We couldn’t find your download file. Please contact support.")
        return redirect(url_for("downloads"))

    return send_from_directory(
        bundles_dir,
        filename,
        as_attachment=True,
        download_name=filename,
    )


@app.route("/downloads/claim", methods=["POST"])
@login_required
def claim_pack():
    """
    Save the unlocked pack to the signed-in user's library.
    """
    user_email = session.get("user_email")
    pack_id = request.form.get("pack_id")
    if not pack_id:
        flash("We couldn’t tell which pack to save.")
        return redirect(url_for("downloads"))

    pack_meta = get_pack_by_id(pack_id)
    if not pack_meta:
        flash("That pack doesn’t exist.")
        return redirect(url_for("downloads"))

    try:
        doc_ref = (
            db.collection("users")
            .document(user_email)
            .collection("purchases")
            .document(pack_id)
        )
        doc_ref.set(
            {
                "pack_id": pack_id,
                "name": pack_meta["name"],
                "filename": pack_meta["filename"],
                "created_at": firestore.SERVER_TIMESTAMP,
                "source": "downloads_portal",
            },
            merge=True,
        )
        flash("Pack saved to your Faith Sparks Library! You can access it anytime from your account.")
        owned = set(session.get("user_owned_packs") or [])
        owned.add(pack_id)
        session["user_owned_packs"] = list(owned)
    except Exception as e:
        app.logger.exception("Failed to save pack to library: %s", e)
        flash("We couldn’t save this to your library. Please try again.")

    return redirect(url_for("downloads"))


@app.route("/downloads/restore/<pack_id>")
@login_required
def restore_pack(pack_id):
    """
    Restore an owned pack from Library, set session unlock, and bounce to portal.
    """
    user_email = session.get("user_email")
    if not _user_has_pack(user_email, pack_id):
        flash("That pack is not in your library yet.")
        return redirect(url_for("prints"))
    session["unlocked_pack_id"] = pack_id
    flash("Pack ready to download.")
    return redirect(url_for("downloads"))

# normalize_slug moved to yourapp.util.slug

def extract_version_from_text(text, fallback_version):
    norm_fallback = (fallback_version or "esv").lower().strip()
    fallback_version = "esv" if norm_fallback in ("", "auto") else norm_fallback
    match = re.search(r'\(([A-Za-z0-9]{2,12})\)\s*$', text.strip())
    if match:
        version = match.group(1).lower()
        verse = text[:match.start()].strip()
    else:
        version = fallback_version
        verse = text.strip()
    return version, normalize_reference_title(verse)


def _boolish(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower().strip() in {"1", "true", "yes", "on"}
    return bool(value) if value is not None else default


SONGS_DIR = os.path.join(app.root_path, "songs")  # kept for local fallback

# --- Worship song persistence helpers ---
_WORSHIP_COLLECTION = "worship_songs"
_worship_seeded = False


def _seed_worship_from_files() -> None:
    """One-time per-process seed: load /songs/*.json into Firestore if collection is empty."""
    global _worship_seeded
    if _worship_seeded:
        return
    _worship_seeded = True
    if not db:
        return
    try:
        if list(db.collection(_WORSHIP_COLLECTION).limit(1).stream()):
            return  # already has documents
        songs_folder = Path(app.root_path) / "songs"
        if not songs_folder.is_dir():
            return
        for fp in sorted(songs_folder.glob("*.json")):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                song_id = data.get("id") or fp.stem
                data["id"] = song_id
                db.collection(_WORSHIP_COLLECTION).document(song_id).set(data)
                app.logger.info("Seeded worship song: %s", song_id)
            except Exception as exc:
                app.logger.warning("Worship seed skip %s: %s", fp.name, exc)
    except Exception as exc:
        app.logger.warning("Worship seed failed: %s", exc)


def list_worship_songs() -> list[dict]:
    """List all worship songs sorted by title. Firestore first, file fallback."""
    if db:
        try:
            results = []
            for doc in db.collection(_WORSHIP_COLLECTION).stream():
                data = doc.to_dict()
                if data and data.get("id"):
                    results.append(data)
            return sorted(results, key=lambda s: s.get("title", "").lower())
        except Exception as exc:
            app.logger.warning("list_worship_songs Firestore error: %s", exc)
    songs_folder = Path(app.root_path) / "songs"
    songs = []
    if songs_folder.is_dir():
        for fp in sorted(songs_folder.glob("*.json")):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    songs.append(json.load(f))
            except Exception:
                pass
    return songs


def get_worship_song(song_id: str) -> dict | None:
    """Load one song by id. Firestore first, file fallback."""
    if db:
        try:
            doc = db.collection(_WORSHIP_COLLECTION).document(song_id).get()
            if doc.exists:
                return doc.to_dict()
        except Exception as exc:
            app.logger.warning("get_worship_song(%s) Firestore error: %s", song_id, exc)
    fp = Path(app.root_path) / "songs" / f"{song_id}.json"
    if fp.exists():
        try:
            with open(fp, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def save_worship_song(song: dict) -> None:
    """Persist a song. Firestore when available, local file fallback."""
    song_id = song["id"]
    if db:
        try:
            db.collection(_WORSHIP_COLLECTION).document(song_id).set(song)
            return
        except Exception as exc:
            app.logger.warning("save_worship_song(%s) Firestore error: %s", song_id, exc)
    songs_folder = Path(app.root_path) / "songs"
    songs_folder.mkdir(exist_ok=True)
    with open(songs_folder / f"{song_id}.json", "w", encoding="utf-8") as f:
        json.dump(song, f, indent=2, ensure_ascii=False)


def delete_worship_song(song_id: str) -> bool:
    """Delete a song from Firestore and local file if present. Returns True if anything was deleted."""
    deleted = False
    if db:
        try:
            ref = db.collection(_WORSHIP_COLLECTION).document(song_id)
            if ref.get().exists:
                ref.delete()
                deleted = True
        except Exception as exc:
            app.logger.warning("delete_worship_song(%s) Firestore error: %s", song_id, exc)
    fp = Path(app.root_path) / "songs" / f"{song_id}.json"
    if fp.exists():
        try:
            fp.unlink()
            deleted = True
        except Exception:
            pass
    return deleted


def _load_recent_setlists() -> list[dict]:
    """Return up to 10 most recent setlists, newest first."""
    if db:
        try:
            results = []
            for doc in db.collection("worship_setlists").stream():
                data = doc.to_dict()
                if data and data.get("date") and isinstance(data.get("songs"), list):
                    results.append({"date": data["date"], "songs": data["songs"]})
            results.sort(key=lambda x: x["date"], reverse=True)
            return results[:10]
        except Exception as exc:
            app.logger.warning("_load_recent_setlists Firestore error: %s", exc)
    setlists_dir = Path(app.root_path) / "setlists"
    if not setlists_dir.is_dir():
        return []
    results = []
    for fp in sorted(setlists_dir.glob("*.json"), reverse=True):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("date") and isinstance(data.get("songs"), list):
                results.append({"date": data["date"], "songs": data["songs"]})
        except Exception:
            pass
        if len(results) >= 10:
            break
    return results


def chunk_lines(lines: list[str], max_lines: int = 4) -> list[list[str]]:
    clean = [str(line).strip() for line in lines if str(line).strip()]
    if not clean:
        return []
    return [clean[i : i + max_lines] for i in range(0, len(clean), max_lines)]


_TYPE_BG = {
    "song":      RGBColor(28, 28, 28),
    "scripture": RGBColor(10, 20, 55),
    "prayer":    RGBColor(10, 40, 20),
    "reading":   RGBColor(10, 40, 20),
}
_DEFAULT_BG = RGBColor(28, 28, 28)


def apply_dark_background(slide, rgb: RGBColor = _DEFAULT_BG) -> None:
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = rgb


def add_centered_textbox(slide, text: str, top: float, height: float, font_size: int, bold: bool):
    box = slide.shapes.add_textbox(Inches(0.5), Inches(top), Inches(12.333), Inches(height))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor(255, 255, 255)
    return box


def create_divider_slide(prs: Presentation, title: str, artist: str, key: str, item_type: str = "song"):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    apply_dark_background(slide, _TYPE_BG.get(item_type, _DEFAULT_BG))
    add_centered_textbox(slide, title, top=2.5, height=1.5, font_size=54, bold=True)
    subtitle_parts = []
    if artist:
        subtitle_parts.append(artist)
    if key:
        subtitle_parts.append(f"Key: {key}")
    if subtitle_parts:
        add_centered_textbox(slide, " | ".join(subtitle_parts), top=4.2, height=1.0, font_size=32, bold=False)
    return slide


def create_content_slide(prs: Presentation, lines: list[str], item_type: str = "song"):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    apply_dark_background(slide, _TYPE_BG.get(item_type, _DEFAULT_BG))
    add_centered_textbox(slide, "\n".join(lines), top=1.5, height=4.5, font_size=48, bold=True)
    return slide



os.makedirs("output", exist_ok=True)
os.makedirs("output/thumbs", exist_ok=True)
os.makedirs("output/packs", exist_ok=True)

# --- Theming ---
# theme helpers moved to yourapp.services.themes

@app.route("/login/google/start")
def start_google_login():
    nxt = request.args.get("next")
    # Default to /browse if missing/unsafe
    if not is_safe_url(nxt or ""):
        nxt = url_for("browse")
    session["post_login_next"] = nxt
    return redirect(url_for("google.login", next=nxt))

@app.route("/oauth/finish")
def oauth_finish():
    # by now google.authorized is True; @before_request already hydrated user_info
    nxt = session.pop("post_login_next", None) or request.args.get("next")

    email = session.get("user_email")
    if email:
        try:
            analytics_svc.record_login(email)
        except Exception:
            app.logger.debug("Failed to record login", exc_info=True)

    if nxt and is_safe_url(nxt):
        return redirect(nxt)

    # Safe fallback if public blueprint isn't available for any reason
    if "public.index" in app.view_functions:
        return redirect(url_for("public.index"))
    return redirect(url_for("browse"))


@app.route('/admin/theme/preview', methods=['POST'])
@admin_required
def admin_theme_preview():
    from faithsparks.views.admin.theme import admin_theme_preview as _impl
    return _impl()

    

"""Collections helpers moved to yourapp.services.collections"""

 

# storage helpers moved to yourapp.services.storage

# --- Routes ---

# Mount public routes blueprint
try:
    from faithsparks.views.public import bp as public_bp
    app.register_blueprint(public_bp)
except Exception:
    pass

@app.route("/logout")
def logout():
    session.clear()
    if "public.index" in app.view_functions:
        return redirect(url_for("public.index"))
    return redirect(url_for("browse"))

from pathlib import Path
from tempfile import NamedTemporaryFile
import json


@app.route('/worship', methods=['GET'])
def worship():
    _seed_worship_from_files()
    songs = list_worship_songs()
    setlists = _load_recent_setlists()
    return render_template('worship.html', songs=songs, setlists=setlists)


@app.route("/worship/build", methods=["POST"])
@login_required
def worship_build():
    song_order = request.form.get("song_order", "")

    # song_order is the authoritative source (set by JS drag order).
    # Fall back to song_ids[] only when song_order is absent (e.g. non-JS submit).
    if song_order:
        raw_ids = [s.strip() for s in song_order.split(",") if s.strip()]
    else:
        raw_ids = request.form.getlist("song_ids")

    # Deduplicate while preserving order
    seen: set = set()
    ordered_ids = []
    for sid in raw_ids:
        if sid not in seen:
            seen.add(sid)
            ordered_ids.append(sid)

    if not ordered_ids:
        flash("Select at least one item to build a deck.", "warning")
        return redirect(url_for("worship"))

    selected_items = []
    for song_id in ordered_ids:
        song = get_worship_song(song_id)
        if song:
            selected_items.append(song)

    if not selected_items:
        flash("No valid items were selected.", "warning")
        return redirect(url_for("worship"))

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    for item in selected_items:
        item_type = item.get("type", "song")
        create_divider_slide(prs, item.get("title", ""), item.get("artist", ""), item.get("key", ""), item_type)
        parts = item.get("parts", {}) or {}
        arrangement = item.get("arrangement", []) or []
        for part_name in arrangement:
            part_lines = parts.get(part_name, [])
            if not isinstance(part_lines, list):
                continue
            for chunk in chunk_lines(part_lines, max_lines=4):
                create_content_slide(prs, chunk, item_type)

    tmp = NamedTemporaryFile(delete=False, suffix=".pptx")
    prs.save(tmp.name)
    tmp.close()
    return send_file(
        tmp.name,
        as_attachment=True,
        download_name="house_church_worship.pptx",
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )

@app.route("/worship/add", methods=["GET", "POST"])
@login_required
def worship_add():
    if request.method == "POST":
        # Overwrite confirmation branch
        if request.form.get("overwrite"):
            pending = session.pop("pending_worship_song", None)
            if pending:
                save_worship_song(pending)
                flash(f"'{pending['title']}' overwritten.", "success")
                return redirect(url_for("worship"))
            flash("Nothing to overwrite.", "warning")
            return redirect(url_for("worship_add"))

        title = request.form.get("title", "").strip()
        artist = request.form.get("artist", "").strip()
        key = request.form.get("key", "").strip()
        song_type = request.form.get("type", "song").strip() or "song"

        part_names = request.form.getlist("part_name")
        part_lines_raw = request.form.getlist("part_lines")
        arrangement_raw = request.form.get("arrangement", "")

        if not title:
            flash("Title is required.", "warning")
            return redirect(url_for("worship_add"))

        parts = {}
        for name, lines_text in zip(part_names, part_lines_raw):
            name = name.strip()
            if not name:
                continue
            lines = [l.strip() for l in lines_text.splitlines() if l.strip()]
            if lines:
                parts[name] = lines

        arrangement = [
            a.strip() for a in arrangement_raw.split(",")
            if a.strip() and a.strip() in parts
        ]

        song_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        song = {
            "id": song_id,
            "title": title,
            "artist": artist,
            "key": key,
            "type": song_type,
            "parts": parts,
            "arrangement": arrangement,
        }

        if get_worship_song(song_id):
            session["pending_worship_song"] = song
            return redirect(url_for("worship_add", conflict=song_id))

        save_worship_song(song)
        flash(f"'{title}' saved.", "success")
        return redirect(url_for("worship"))

    conflict_song = None
    conflict_id = request.args.get("conflict", "")
    if conflict_id:
        conflict_song = get_worship_song(conflict_id)
    return render_template("worship_add.html", conflict_song=conflict_song)


@app.route("/worship/add/parse", methods=["POST"])
@login_required
def worship_add_parse():
    from openai import OpenAI

    raw_lyrics = request.form.get("raw_lyrics", "").strip()
    title = request.form.get("title", "").strip()
    artist = request.form.get("artist", "").strip()
    key = request.form.get("key", "").strip()

    if not raw_lyrics:
        flash("Paste some lyrics to parse.", "warning")
        return redirect(url_for("worship_add"))

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        flash("OPENAI_API_KEY is not set in the environment.", "error")
        return redirect(url_for("worship_add"))

    prompt = f"""Parse the following song lyrics into structured JSON.

Title: {title or '(infer from lyrics)'}
Artist: {artist or '(unknown)'}
Key: {key or '(unknown)'}

Lyrics:
{raw_lyrics}

Return ONLY valid JSON — no markdown fences, no explanation — in this exact format:
{{
  "id": "<slugified-title>",
  "title": "<title>",
  "artist": "<artist or empty string>",
  "key": "<key or empty string>",
  "type": "song",
  "parts": {{
    "verse1": ["line 1", "line 2"],
    "chorus": ["line 1", "line 2"]
  }},
  "arrangement": ["verse1", "chorus"]
}}

Rules:
- id: title lowercased, spaces and special characters replaced by hyphens, no leading/trailing hyphens
- parts keys: use verse1, verse2, chorus, bridge, pre_chorus, outro, intro as appropriate
- arrangement: list of part keys in the order they appear in the song
- each part value is an array of individual lyric lines (no blank strings)
- type is always "song"
"""

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        raw_json = response.choices[0].message.content.strip()
        # Strip markdown code fences if model wraps the response anyway
        raw_json = re.sub(r"^```[a-z]*\n?", "", raw_json)
        raw_json = re.sub(r"\n?```$", "", raw_json).strip()
        song = json.loads(raw_json)
    except json.JSONDecodeError as e:
        flash(f"AI returned invalid JSON: {e}", "error")
        return redirect(url_for("worship_add"))
    except Exception as e:
        flash(f"AI parse failed: {e}", "error")
        return redirect(url_for("worship_add"))

    if not isinstance(song.get("parts"), dict) or not isinstance(song.get("arrangement"), list):
        flash("AI response was missing required fields (parts/arrangement).", "error")
        return redirect(url_for("worship_add"))

    song_id = song.get("id") or re.sub(
        r"[^a-z0-9]+", "-", song.get("title", "unknown").lower()
    ).strip("-")
    song["id"] = song_id

    if get_worship_song(song_id):
        session["pending_worship_song"] = song
        return redirect(url_for("worship_add", conflict=song_id))

    save_worship_song(song)
    flash(f"'{song.get('title', song_id)}' parsed and saved.", "success")
    return redirect(url_for("worship"))


@app.route("/worship/delete", methods=["POST"])
@login_required
def worship_delete():
    song_id = request.form.get("song_id", "").strip()
    if not song_id or ".." in song_id or "/" in song_id or "\\" in song_id:
        flash("Invalid song id.", "warning")
        return redirect(url_for("worship"))

    if delete_worship_song(song_id):
        flash("Song deleted.", "success")
    else:
        flash("Song not found.", "warning")
    return redirect(url_for("worship"))


@app.route("/worship/edit/<song_id>", methods=["GET", "POST"])
@login_required
def worship_edit(song_id):
    if ".." in song_id or "/" in song_id or "\\" in song_id:
        flash("Invalid song id.", "warning")
        return redirect(url_for("worship"))

    song = get_worship_song(song_id)
    if not song:
        flash("Song not found.", "warning")
        return redirect(url_for("worship"))

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        artist = request.form.get("artist", "").strip()
        key = request.form.get("key", "").strip()
        song_type = request.form.get("type", "song").strip() or "song"

        part_names = request.form.getlist("part_name")
        part_lines_raw = request.form.getlist("part_lines")
        arrangement_raw = request.form.get("arrangement", "")

        if not title:
            flash("Title is required.", "warning")
            return redirect(url_for("worship_edit", song_id=song_id))

        parts = {}
        for name, lines_text in zip(part_names, part_lines_raw):
            name = name.strip()
            if not name:
                continue
            lines = [l.strip() for l in lines_text.splitlines() if l.strip()]
            if lines:
                parts[name] = lines

        arrangement = [
            a.strip() for a in arrangement_raw.split(",")
            if a.strip() and a.strip() in parts
        ]

        song = {
            "id": song_id,
            "title": title,
            "artist": artist,
            "key": key,
            "type": song_type,
            "parts": parts,
            "arrangement": arrangement,
        }

        save_worship_song(song)
        flash(f"'{title}' updated.", "success")
        return redirect(url_for("worship"))

    return render_template("worship_edit.html", song=song)


@app.route("/worship/setlist/save", methods=["POST"])
@login_required
def worship_setlist_save():
    song_ids = request.form.getlist("song_ids")
    if not song_ids:
        return jsonify({"ok": False, "error": "No songs"}), 400

    today = datetime.now().strftime("%Y-%m-%d")
    data = {"date": today, "songs": song_ids}

    if db:
        try:
            db.collection("worship_setlists").document(today).set(data)
        except Exception as exc:
            app.logger.warning("worship_setlist_save Firestore error: %s", exc)

    setlists_dir = Path(app.root_path) / "setlists"
    try:
        setlists_dir.mkdir(exist_ok=True)
        with open(setlists_dir / f"{today}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as exc:
        app.logger.warning("worship_setlist_save file error: %s", exc)

    return jsonify({"ok": True})


## about + healthz moved to public blueprint

@app.route("/generate", methods=["GET", "POST"])
@login_required
def generate():
    from faithsparks.views.worksheets import generate as _impl
    return _impl()
    """
    try:
        if request.method == "GET":
            clear_storage = session.pop("clear_storage", False)
            # Collection prefill support
            prefill = request.args.get("verse", "").strip()
            col = request.args.get("collection")
            default_version_override = None
            if not prefill and col:
                meta = get_collection_meta(col)
                if meta and meta.get('verses'):
                    prefill = ", ".join(meta['verses'])
                    default_version_override = meta.get('defaultVersion')
                    # if coming from collection, do not clear immediately
                    clear_storage = False
            # Usage/plan info for banner
            email = session.get('user_email')
            plan = _get_user_plan(email)
            m_limit, l_limit = _quota_for_plan(plan)
            used_life, used_m = _get_usage(email)
            # Remaining computations
            def r(limit, used):
                return None if limit is None else max(0, int(limit) - int(used))
            remain_m = r(m_limit, used_m)
            # percent used for monthly (for upgrade banner)
            pct = 0
            try:
                if m_limit is not None and int(m_limit) > 0:
                    pct = int(round((used_m / float(m_limit)) * 100))
            except Exception:
                pct = 0
            usage_info = {
                'plan': plan,
                'monthly_used': int(used_m),
                'monthly_limit': m_limit,
                'lifetime_used': int(used_life),
                'lifetime_limit': l_limit,
                'monthly_remaining': remain_m,
                'monthly_pct_used': pct,
            }
            return render_template("generate.html", prefill_verse=prefill, clear_storage=clear_storage, default_version_override=default_version_override, collection_slug=col, usage_info=usage_info)

        verse_input = request.form.get("verse", "").strip()
        from_collection = (request.form.get('collection_slug') or '').strip() or None
        custom_text = request.form.get("custom_text", "").strip()
        custom_title = request.form.get("custom_title", "").strip()
        selected_version = request.form.get("version", "esv").strip().lower()
        use_cursive = request.form.get("cursive") == "on"
        custom_prompt = request.form.get("custom_prompt", "").strip()
        user_email = session.get("user_email", "anonymous")

        tag_list = [v.strip() for v in re.split(r'[,;\n]+', verse_input) if v.strip()]
        is_custom = bool(custom_text)

        if not tag_list and not is_custom:
            flash("Please enter a verse or custom text to generate.", "warning")
            return redirect(url_for("generate"))

        items_to_generate = []

        for v in tag_list:
            version, verse = extract_version_from_text(v, selected_version)
            items_to_generate.append({
                "slug": normalize_slug(verse),
                "verse": verse,
                "version": version.upper(),
                "is_custom": False,
                "text": None
            })

        if is_custom:
            ai_validate_custom_text(custom_text)  # Basic filtering
            title = custom_title or "Custom Text (User Submitted)"
            items_to_generate.append({
                "slug": normalize_slug(title),
                "verse": title,
                "version": "DIY",
                "is_custom": True,
                "text": custom_text
            })

        # --- Quota check ---
        generated_target = (len(tag_list) if tag_list else 0) + (1 if is_custom else 0)

        user_plan = _get_user_plan(user_email)
        monthly_limit, lifetime_limit = _quota_for_plan(user_plan)
        used_lifetime, used_monthly = _get_usage(user_email)

        def _remaining(limit, used):
            return 10**9 if limit is None else max(0, int(limit) - int(used))

        allowed = min(_remaining(monthly_limit, used_monthly), _remaining(lifetime_limit, used_lifetime))
        if allowed <= 0:
            flash("You've reached your monthly limit. Consider Plus for more.", "warning")
            return redirect(url_for("browse"))

        if generated_target > allowed:
            flash(f"Your plan allows {allowed} more this month; generating the first {allowed}.", "warning")
            keep = allowed
            tag_list = tag_list[:keep]
            keep -= len(tag_list)
            if is_custom and keep <= 0:
                is_custom = False

        # Rebuild items_to_generate AFTER trimming
        items_to_generate = []
        for v in tag_list:
            version, verse = extract_version_from_text(v, selected_version)
            items_to_generate.append({
                "slug": normalize_slug(verse),
                "verse": verse,
                "version": version.upper(),
                "is_custom": False,
                "text": None
            })
        if is_custom:
            ai_validate_custom_text(custom_text)
            title = custom_title or "Custom Text (User Submitted)"
            items_to_generate.append({
                "slug": normalize_slug(title),
                "verse": title,
                "version": "DIY",
                "is_custom": True,
                "text": custom_text
            })

        if len(items_to_generate) > MAX_WORKSHEETS_PER_REQUEST:
            flash(
                f"Please generate at most {MAX_WORKSHEETS_PER_REQUEST} worksheets at once. "
                f"Keeping the first {MAX_WORKSHEETS_PER_REQUEST}.",
                "warning",
            )
            items_to_generate = items_to_generate[:MAX_WORKSHEETS_PER_REQUEST]

        last_pdf = None
        free_skip_count = False
        # If coming from a free collection, skip counting usage
        if from_collection:
            free_slugs = _get_free_slugs()
            if from_collection.strip().lower() in free_slugs:
                free_skip_count = True

        success_count = 0
        bundle_files = []
        for item in items_to_generate:
            # initial metadata from input
            input_slug = item["slug"]
            version = item["version"]
            verse = item["verse"]  # may be a query string; will be replaced by canonical ref if available
            is_custom = item["is_custom"]
            text = item["text"]
            # temporary path before we possibly update with canonical reference
            pdf_path = f"output/{input_slug}_{version}{'_cursive' if use_cursive else ''}.pdf"
            last_pdf = pdf_path

            existing = db.collection("worksheets").where(filter=firestore.FieldFilter("email", "==", user_email))\
                .where(filter=firestore.FieldFilter("verse", "==", verse))\
                .where(filter=firestore.FieldFilter("version", "==", version))\
                .where(filter=firestore.FieldFilter("cursive", "==", use_cursive)).limit(1).stream() if db else []
            doc = next(existing, None)
            if doc:
                existing_path = os.path.join("output", doc.to_dict().get("filename"))
                if os.path.exists(existing_path):
                    try:
                        flash("Already generated — using your existing PDF.", "info")
                    except Exception:
                        pass
                    last_pdf = existing_path
                    bundle_files.append(existing_path)
                    continue

            if is_custom:
                data = {
                    "verse": verse,
                    "fullVerse": text,
                    "traceableVerse": text,
                    "handwritingLines": 3,
                    "reflectionQuestion": "Why is this meaningful to you?",
                    "imageIdea": custom_prompt,
                    "version": "DIY",
                    "cursive": use_cursive,
                    "disclaimer": "This content was submitted by the user and not verified as Scripture."
                }
            else:
                # Try cache by input slug first
                cached = db.collection("verse_cache").document(f"{input_slug}_{version}").get() if db else None
                if cached and cached.exists:
                    data = cached.to_dict()["data"]
                else:
                    content = request_verse_data(verse, version)
                    if not content:
                        flash(f"Verse fetch failed for {verse} ({version})", "error")
                        continue
                    data = parse_and_clean_json(content)
                    data.update({"version": version, "cursive": use_cursive})
                    # Save cache under canonical reference slug if available
                    canonical_ref = data.get("verse") or verse
                    canonical_slug = normalize_slug(canonical_ref)
                    if db:
                        db.collection("verse_cache").document(f"{canonical_slug}_{version}").set({
                            "verse": canonical_ref,
                            "version": version,
                            "slug": f"{canonical_slug}_{version}",
                            "data": data,
                            "timestamp": firestore.SERVER_TIMESTAMP
                        })
                    save_json_to_file(data, f"output/{canonical_slug}_{version}.json")

            # Validate minimum fields before PDF
            try:
                if not isinstance(data, dict):
                    raise ValueError("Invalid data from model")
                # Ensure required fields or skip
                if not data.get("verse"):
                    data["verse"] = verse
                # Preserve letter suffix from user input even if the model drops it.
                data["verse"] = preserve_letter_suffix(verse, data.get("verse"))
                if not data.get("version"):
                    data["version"] = version
                if not data.get("fullVerse"):
                    flash(f"AI response missing fullVerse for {verse} ({version}); skipping.", "warning")
                    continue
                generate_pdf(data, pdf_path, use_cursive=use_cursive)
            except Exception as e:
                traceback.print_exc()
                flash(f"Could not build PDF for {verse} ({version}): {e}", "error")
                continue

            # If this is a Bible verse (not custom), prefer the canonical verse reference
            if not is_custom:
                canonical_ref = preserve_letter_suffix(verse, data.get("verse") or verse)
                data["verse"] = canonical_ref
                canonical_slug = normalize_slug(canonical_ref)
                # update pdf path and rename if necessary
                desired_path = f"output/{canonical_slug}_{version}{'_cursive' if use_cursive else ''}.pdf"
                if pdf_path != desired_path and os.path.exists(pdf_path):
                    os.replace(pdf_path, desired_path)
                pdf_path = desired_path
                # make thumbnail
                make_thumbnail(canonical_ref, version, os.path.splitext(os.path.basename(pdf_path))[0])
            else:
                # custom: thumbnail with provided title
                make_thumbnail(verse, version, os.path.splitext(os.path.basename(pdf_path))[0])

            bundle_files.append(pdf_path)

            if db:
                db.collection("worksheets").add({
                    "email": user_email,
                    "verse": (data.get("verse") if not is_custom else verse),
                    "version": version,
                    "filename": os.path.basename(pdf_path),
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "cursive": use_cursive,
                    "custom": is_custom,
                    **({"text": text, "imageIdea": custom_prompt} if is_custom else {})
                })

            # Track last generated path for redirect/download
            last_pdf = pdf_path
            success_count += 1

        # analytics: collection generate count
        if db and from_collection:
            try:
                db.collection('analytics').document('pack_generates').set({ from_collection: firestore.Increment(1) }, merge=True)
            except Exception:
                pass

        update_zip_bundle(bundle_files)
        # Record usage increments (skip if free slug)
        try:
            if not free_skip_count:
                _update_usage(user_email, success_count)
        except Exception:
            pass
        session["clear_storage"] = True

        if len(items_to_generate) == 1 and os.path.exists(last_pdf):
            flash("Worksheet generated successfully!", "success")
            return send_file(last_pdf, as_attachment=True, download_name=os.path.basename(last_pdf), conditional=True)
        elif len(items_to_generate) > 1:
            zip_path = "output/worksheets_bundle.zip"
            if os.path.exists(zip_path):
                flash("Bundle generated successfully!", "success")
                return send_file(zip_path, as_attachment=True, download_name=os.path.basename(zip_path), conditional=True)

        return "No worksheets were generated successfully", 500

    except Exception as e:
        traceback.print_exc()
        return f"Server error: {e}", 500
    """


@app.route("/illustrate", methods=["GET", "POST"])
@login_required
def illustrate():
    """Legacy route retained only for redirecting to the generate page."""
    flash("Coloring now lives on the Generate page. Browse the new library there.", "info")
    target = url_for("generate") + "#coloring"
    if request.method == "POST":
        return jsonify({"redirect": target, "message": "Coloring moved to /generate"}), 410
    return redirect(target)

@app.route("/delete/<filename>")
@login_required
def delete_worksheet(filename):
    from faithsparks.views.worksheets import delete_worksheet as _impl
    return _impl(filename)

@app.route("/delete_bulk", methods=["POST"])
@login_required
def delete_bulk():
    from faithsparks.views.worksheets import delete_bulk as _impl
    return _impl()
    

@app.route("/prints")
@login_required
def prints():
    from faithsparks.views.worksheets import history as _impl
    return _impl()

@app.route("/history")
def history():
    return redirect(url_for("prints"))
@app.route("/download/<filename>")
@login_required
def download_file(filename):
    from faithsparks.views.worksheets import download_file as _impl
    return _impl(filename)


@app.route("/coloring/image/<path:filename>")
@login_required
def coloring_image(filename):
    safe_name = os.path.basename(filename)
    local_path = os.path.join("worksheets", safe_name)
    if os.path.exists(local_path):
        return send_file(local_path, mimetype="image/png", conditional=True)
    remote = signed_url_for_path(f"worksheets/{safe_name}")
    if remote:
        return redirect(remote)
    flash("Image not found. It may have been removed.", "error")
    return redirect(url_for("prints"))

@app.route('/thumb/<path:filename>')
@login_required
def thumb(filename):
    from faithsparks.views.worksheets import thumb as _impl
    return _impl(filename)

# --- Admin utilities ---
def is_admin_email(email: str) -> bool:
    allow = os.getenv('ADMIN_EMAILS', '')
    if not allow:
        return False
    allowed = [e.strip().lower() for e in allow.split(',') if e.strip()]
    return (email or '').lower() in allowed

@app.route('/admin/seed_collections')
@login_required
def admin_seed_collections():
    from faithsparks.views.admin.collections import admin_seed_collections as _impl
    return _impl()

@app.context_processor
def inject_helpers():
    fb_purchase = session.pop('fb_purchase', None)
    fb_user_match = None
    try:
        email = session.get('user_email')
        is_pro = False
        theme_name, theme_vars = get_theme_selection()
        # Resolve themed logo and favicon
        logo_url = url_for('static', filename='faith_sparks_logo.png')
        favicon_url = url_for('static', filename='favicon.ico')
        conf = _get_cached_config('app') or {}
        logos = (conf or {}).get('logos') or {}
        if isinstance(logos, dict):
            logo_url = logos.get(theme_name) or logos.get('default') or logo_url
        favs = (conf or {}).get('favicons') or {}
        if isinstance(favs, dict):
            favicon_url = favs.get(theme_name) or favs.get('default') or favicon_url
        site_content = _get_cached_config('content') or {}
        usage_nav = None
        path = request.path or ""
        if db and email:
            try:
                u = db.collection('users').document(email).get()
                if u.exists:
                    is_pro = bool((u.to_dict() or {}).get('isPro'))
            except Exception:
                pass
            # usage chip (sometimes expensive)
            if _should_fetch_usage(path):
                try:
                    plan = _get_user_plan(email)
                    m_lim, _ = _quota_for_plan(plan)
                    used_life, used_m = _get_usage(email)
                    if m_lim is not None:
                        try:
                            used_val = int(used_m)
                        except Exception:
                            used_val = 0
                        try:
                            limit_val = int(m_lim)
                        except Exception:
                            limit_val = 0
                        remaining = max(0, limit_val - used_val)
                        label = "credit" if remaining == 1 else "credits"
                        pct_used = 0
                        try:
                            if limit_val > 0:
                                pct_used = int(round((used_val / float(limit_val)) * 100))
                        except Exception:
                            pct_used = 0
                        usage_nav = {
                            'text': f"{remaining} {label} left",
                            'title': f"{used_val} of {limit_val} used this month · {remaining} {label} remaining",
                            'pct': pct_used,
                        }
                    else:
                        usage_nav = { 'text': '∞', 'title': 'Unlimited this month', 'pct': 0 }
                except Exception:
                    usage_nav = None
        if email:
            try:
                import hashlib
                fb_user_match = hashlib.sha256((email or '').strip().lower().encode('utf-8', 'ignore')).hexdigest()
            except Exception:
                fb_user_match = None
        def stripe_price_url(pid: str|None):
            if not pid:
                return '#'
            key = os.getenv('STRIPE_SECRET_KEY','')
            base = 'https://dashboard.stripe.com/prices/'
            try:
                if 'sk_test' in key:
                    base = 'https://dashboard.stripe.com/test/prices/'
            except Exception:
                pass
            return base + str(pid)
        def env(name, default=''):
            return os.getenv(name, default)

        def pack_effective_price_id(c):
            """Per-collection priceId overrides STRIPE_DEFAULT_PACK_PRICE; empty => no Buy."""
            pid = (c.get('priceId') or '').strip()
            if not pid:
                pid = os.getenv('STRIPE_DEFAULT_PACK_PRICE', '').strip()
            return pid or None

        def month_key():
            """Get current month key for usage tracking"""
            return datetime.now(timezone.utc).strftime('%Y-%m')

        return {
            'fb_purchase': fb_purchase,
            'fb_user_match': fb_user_match,
            'is_admin': is_admin_email(email),
            'is_signed_in': bool(email),
            'is_pro': is_pro,
            'support_email': os.getenv('SUPPORT_EMAIL', 'support@faithsparksprintables.com'),
            'stripe_pk': STRIPE_PUBLISHABLE_KEY,
            'theme_name': theme_name,
            'theme': theme_vars,
            'logo_url': logo_url,
            'favicon_url': favicon_url,
            'site_content': site_content,
            'usage_nav': usage_nav,
            'env': env,
            'pack_effective_price_id': pack_effective_price_id,
            'stripe_price_url': stripe_price_url,
            'month_key': month_key,
            'plan_label': plan_label,
            'current_year': datetime.now().year,

        }
    except Exception:
        return {
            'fb_purchase': fb_purchase,
            'fb_user_match': fb_user_match,
            'is_admin': False,
            'is_signed_in': False,
            'is_pro': False,
            'support_email': os.getenv('SUPPORT_EMAIL', 'support@faithsparksprintables.com'),
            'stripe_pk': None,
            'theme_name': 'teal',
            'theme': THEMES.get('teal'),
            'logo_url': url_for('static', filename='faith_sparks_logo.png'),
            'favicon_url': url_for('static', filename='favicon.ico'),
            'site_content': {},
            'usage_nav': None,
        }

# --- Plus / Checkout ---
@app.route('/plus')
def plus_pricing():
    from faithsparks.views.billing import plus_pricing as _impl
    return _impl()

def _is_safe_next(target: str) -> bool:
    if not target:
        return False
    host_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return (test_url.scheme in ("http", "https") and host_url.netloc == test_url.netloc)


def resolve_price_id_local(id_or_product: str) -> str:
    """Accepts a price_... or prod_... and returns a valid price id.
    If a product id is given, tries product.default_price else the first active recurring price.
    """
    if not stripe:
        raise RuntimeError('Stripe SDK not available')
    pid = (id_or_product or '').strip()
    if not pid:
        raise ValueError('Missing price id')
    if pid.startswith('price_'):
        return pid
    if pid.startswith('prod_'):
        # Try default_price first
        try:
            prod = stripe.Product.retrieve(pid, expand=['default_price'])
            dp = prod.get('default_price')
            if isinstance(dp, dict) and dp.get('id'):
                return dp['id']
            # fallback: list active recurring prices
            prices = stripe.Price.list(product=pid, active=True, limit=10)
            if prices and prices.data:
                # prefer recurring, else first
                recurring = [p for p in prices.data if p.get('recurring')]
                target = (recurring[0] if recurring else prices.data[0])
                return target.id
        except Exception:
            pass
        # As a final fallback, let it error out
        return pid
    # Unknown format; let Stripe validate
    return pid

@app.route('/create_checkout_session', methods=['POST'])
@login_required
def create_checkout_session():
    from faithsparks.views.billing import create_checkout_session as _impl
    return _impl()

@app.route('/plus/success')
def plus_success():
    from faithsparks.views.billing import plus_success as _impl
    return _impl()

@app.route('/billing')
@login_required
def billing_portal():
    from faithsparks.views.billing import billing_portal as _impl
    return _impl()

@app.route('/stripe/webhook', methods=['POST'])
def stripe_webhook():
    from faithsparks.views.billing import stripe_webhook as _impl
    return _impl()

@app.route('/admin/analytics')
@admin_required
def admin_analytics():
    from faithsparks.views.admin.analytics import admin_analytics as _impl
    return _impl()

# ----- Admin: Gift Plan -----
@app.route('/admin/gift', methods=['GET','POST'])
@admin_required
def admin_gift():
    from faithsparks.views.admin.gifts import admin_gift as _impl
    return _impl()

# ----- Admin: Collections CRUD -----
@app.route('/admin/collections')
@admin_required
def admin_collections():
    from faithsparks.views.admin.collections import admin_collections as _impl
    return _impl()

@app.route('/admin/collections/new', methods=['GET','POST'])
@admin_required
def admin_collections_new():
    from faithsparks.views.admin.collections import admin_collections_new as _impl
    return _impl()

@app.route('/admin/collections/<slug>', methods=['GET','POST'])
@admin_required
def admin_collections_edit(slug):
    from faithsparks.views.admin.collections import admin_collections_edit as _impl
    return _impl(slug)

@app.route('/admin/collections/<slug>/delete', methods=['POST'])
@admin_required
def admin_collections_delete(slug):
    from faithsparks.views.admin.collections import admin_collections_delete as _impl
    return _impl(slug)

@app.route('/admin/theme', methods=['GET','POST'])
@admin_required
def admin_theme():
    from faithsparks.views.admin.theme import admin_theme as _impl
    return _impl()

@app.route('/admin/theme/new', methods=['GET','POST'])
@admin_required
def admin_theme_new():
    from faithsparks.views.admin.theme import admin_theme_new as _impl
    return _impl()

@app.route('/admin/theme/<slug>', methods=['GET','POST'])
@admin_required
def admin_theme_edit(slug):
    from faithsparks.views.admin.theme import admin_theme_edit as _impl
    return _impl(slug)

@app.route('/admin/theme/<slug>/delete', methods=['POST'])
@admin_required
def admin_theme_delete(slug):
    from faithsparks.views.admin.theme import admin_theme_delete as _impl
    return _impl(slug)

def _parse_date_str(s: str):
    from datetime import date
    s = (s or '').strip()
    if not s:
        return None
    try:
        # Try YYYY-MM-DD
        parts = [int(p) for p in s.split('-')]
        if len(parts) == 3:
            return date(parts[0], parts[1], parts[2])
    except Exception:
        pass
    try:
        # Try MM-DD (assume this year)
        parts = [int(p) for p in s.split('-')]
        if len(parts) == 2:
            today = datetime.now(timezone.utc).date()
            return today.replace(month=parts[0], day=parts[1])
    except Exception:
        return None
    return None

def _is_today_in_range(start_s: str, end_s: str) -> bool:
    from datetime import date
    today = datetime.now(timezone.utc).date()
    start = _parse_date_str(start_s)
    end = _parse_date_str(end_s)
    if not start or not end:
        return False
    # Normalize years to this or adjacent year to handle wrapping (e.g., Dec -> Jan)
    s = start.replace(year=today.year)
    e = end.replace(year=today.year)
    if e < s:
        # wraps year-end: if today >= s or today <= e
        return today >= s or today <= e
    return s <= today <= e

def _parse_time_str(s: str):
    s = (s or '').strip()
    if not s:
        return None
    try:
        hh, mm = s.split(':')
        return int(hh) * 60 + int(mm)
    except Exception:
        return None

def _is_now_in_time_range(start_t: str, end_t: str) -> bool:
    """Return True if current local time is within [start,end], inclusive; supports wrap-around (e.g., 22:00–06:00)."""
    now = datetime.now().hour * 60 + datetime.now().minute
    s = _parse_time_str(start_t)
    e = _parse_time_str(end_t)
    if s is None or e is None:
        return True
    if e < s:
        return now >= s or now <= e
    return s <= now <= e

def _weekday_today_sun0() -> int:
    # Python: Monday=0..Sunday=6; convert to Sunday=0..Saturday=6
    return (datetime.now().weekday() + 1) % 7

def _rule_matches(r: dict) -> bool:
    if not r or not r.get('name'):
        return False
    if not _is_today_in_range(r.get('start',''), r.get('end','')):
        return False
    if not _is_now_in_time_range(r.get('timeStart',''), r.get('timeEnd','')):
        return False
    w = r.get('weekdays') or []
    if isinstance(w, list) and len(w):
        if _weekday_today_sun0() not in [int(x) for x in w]:
            return False
    return True

@app.route('/admin/theme/auto', methods=['POST'])
@admin_required
def admin_theme_auto():
    from faithsparks.views.admin.theme import admin_theme_auto as _impl
    return _impl()

def _save_auto_rules(rules: list[dict]):
    if not db:
        return
    db.collection('config').document('app').set({ 'autoThemes': rules }, merge=True)

@app.route('/admin/theme/auto_rules/add', methods=['POST'])
@admin_required
def admin_theme_add_rule():
    from faithsparks.views.admin.theme import admin_theme_add_rule as _impl
    return _impl()

@app.route('/admin/theme/auto_rules/update', methods=['POST'])
@admin_required
def admin_theme_update_rule():
    from faithsparks.views.admin.theme import admin_theme_update_rule as _impl
    return _impl()

@app.route('/admin/theme/auto_rules/delete', methods=['POST'])
@admin_required
def admin_theme_delete_rule():
    from faithsparks.views.admin.theme import admin_theme_delete_rule as _impl
    return _impl()

@app.route('/admin/theme/vars/<name>')
@admin_required
def admin_theme_vars(name):
    from faithsparks.views.admin.theme import admin_theme_vars as _impl
    return _impl(name)

@app.route('/admin/theme/logo', methods=['POST'])
@admin_required
def admin_theme_logo():
    from faithsparks.views.admin.theme import admin_theme_logo as _impl
    return _impl()

@app.route('/admin/theme/favicon', methods=['POST'])
@admin_required
def admin_theme_favicon():
    from faithsparks.views.admin.theme import admin_theme_favicon as _impl
    return _impl()

@app.route('/admin/content', methods=['GET','POST'])
@admin_required
def admin_content():
    from faithsparks.views.admin.content import admin_content as _impl
    return _impl()

@app.route('/admin/help')
@admin_required
def admin_help():
    from faithsparks.views.admin.help import admin_help as _impl
    return _impl()

@app.route('/admin/theme/clone_activate', methods=['POST'])
@admin_required
def admin_theme_clone_activate():
    from faithsparks.views.admin.theme import admin_theme_clone_activate as _impl
    return _impl()

@app.route('/admin/collections/<slug>/move', methods=['POST'])
@admin_required
def admin_collections_move(slug):
    from faithsparks.views.admin.collections import admin_collections_move as _impl
    return _impl(slug)

@app.route('/admin/collections/<slug>/set_order', methods=['POST'])
@admin_required
def admin_collections_set_order(slug):
    from faithsparks.views.admin.collections import admin_collections_set_order as _impl
    return _impl(slug)

@app.route('/admin/prewarm/<slug>', methods=['POST'])
@admin_required
def admin_prewarm_pack(slug):
    from faithsparks.views.admin.collections import admin_prewarm_pack as _impl
    return _impl(slug)

@app.route('/admin/prewarm/<slug>/status')
@admin_required
def admin_prewarm_status(slug):
    from faithsparks.views.admin.collections import admin_prewarm_status as _impl
    return _impl(slug)

@app.route('/packs/<path:filename>')
@login_required
def serve_pack(filename):
    from faithsparks.views.browse import serve_pack as _impl
    return _impl(filename)

@app.route('/dl/pack/<slug>')
def dl_pack(slug):
    from faithsparks.views.browse import dl_pack as _impl
    return _impl(slug)

@app.route('/buy/pack/<slug>')
@login_required
def buy_pack(slug):
    from faithsparks.views.billing import buy_pack as _impl
    return _impl(slug)

@app.route('/buy/success/<slug>')
@login_required
def buy_success(slug):
    from faithsparks.views.billing import buy_success as _impl
    return _impl(slug)

@app.route('/toggle_favorite/<filename>', methods=['POST'])
@login_required
def toggle_favorite(filename):
    from faithsparks.views.worksheets import toggle_favorite as _impl
    return _impl(filename)

@app.route('/browse')
def browse():
    from faithsparks.views.browse import browse as _impl
    return _impl()

@app.route('/browse/<slug>')
def browse_detail(slug):
    from faithsparks.views.browse import browse_detail as _impl
    return _impl(slug)


@app.route('/games')
def games():
    from faithsparks.views.games import games as _impl
    return _impl()


@app.route('/games/<slug>')
def games_detail(slug):
    from faithsparks.views.games import games_detail as _impl
    return _impl(slug)

@app.route('/games/create', methods=['GET', 'POST'])
def games_create():
    from faithsparks.views.games import games_create as _impl
    return _impl()


@app.route('/games/download/<slug>')
def dl_game(slug):
    from faithsparks.views.games import dl_game as _impl
    return _impl(slug)

@app.post('/games/words')
def games_words():
    from faithsparks.views.games import games_words as _impl
    return _impl()

@app.post("/admin/reset_credits/<uid>")
@admin_required
def admin_reset_credits(uid):
    # Fetch user document
    ref = db.collection("users").document(uid)
    snap = ref.get()
    user = snap.to_dict() if snap.exists else {}

    # Determine plan
    plan = user.get("plan", "free")  # "free", "plus_family", "plus_classroom"

    if plan == "free":
        credits = {
            "lifetime": 10,   # reset lifetime to full
            "monthly": 1,     # 1 per month
        }
    elif plan == "plus_family":
        credits = {
            "monthly": 15,
        }
    elif plan == "plus_classroom":
        credits = {
            "monthly": 100,
        }
    else:
        credits = {}  # fallback if unknown plan

    # Store credits back
    ref.set({"credits": credits}, merge=True)

    flash(f"Credits reset for {uid} ({plan})", "success")
    return redirect(url_for("admin_users"))

@app.route("/regenerate/<filename>")
@login_required
def regenerate(filename):
    from faithsparks.views.worksheets import regenerate as _impl
    return _impl(filename)


# --- Error Handlers ---
@app.errorhandler(403)
def handle_403(e):
    try:
        return render_template("403.html"), 403
    except Exception:
        return "Forbidden (CSRF)", 403


@app.errorhandler(404)
def handle_404(e):
    try:
        return render_template('404.html'), 404
    except Exception:
        return "Not found", 404

@app.errorhandler(500)
def handle_500(e):
    try:
        return render_template('500.html'), 500
    except Exception:
        return "Server error", 500

def plan_norm(p: str) -> str:
    """Normalize plan names to canonical values."""
    p = (p or "free").lower()
    if p in ("plus_family", "family", "plus"):  # treat legacy 'plus' as family
        return "plus_family"
    if p in ("plus_classroom", "classroom", "school"):
        return "plus_classroom"
    return "free"

def plan_label(p: str) -> str:
    """Get human-readable label for a plan."""
    return {
        "plus_family": "Plus Family",
        "plus_classroom": "Plus Classroom", 
        "free": "Free",
    }.get(plan_norm(p), p or "Free")
@app.route("/admin/users")
@admin_required
def admin_users():
    from faithsparks.views.admin.users import admin_users as _impl
    return _impl()

@app.route("/admin/users/<uid>/set_plan", methods=["POST"])
@admin_required 
def admin_users_set_plan(uid):
    from faithsparks.views.admin.users import admin_users_set_plan as _impl
    return _impl(uid)

@app.get("/health")
def health():
    return {"ok": True}, 200

@app.get("/api/usage")
def api_usage():
    email = session.get("user_email")
    if not db or not email:
        return jsonify({"text": "", "title": ""}), 200
    plan = _get_user_plan(email)
    m_lim, _ = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)
    if m_lim is not None:
        try:
            used_val = int(used_m)
        except Exception:
            used_val = 0
        try:
            limit_val = int(m_lim)
        except Exception:
            limit_val = 0
        remaining = max(0, limit_val - used_val)
        label = "credit" if remaining == 1 else "credits"
        data = {
            "text": f"{remaining} {label} left",
            "title": f"{used_val} of {limit_val} used this month · {remaining} {label} remaining",
        }
    else:
        data = {"text": "∞", "title": "Unlimited this month"}
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "no-store, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/admin/users/<uid>/reset_usage", methods=["POST"])
@admin_required
def admin_users_reset_usage(uid):
    from faithsparks.views.admin.users import admin_users_reset_usage as _impl
    return _impl(uid)
