# test08-28-2025
from flask import Flask, Response, render_template, request, send_file, redirect, url_for, session, flash, jsonify
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re, traceback
from urllib.parse import urlparse, urljoin
from zipfile import ZipFile
import threading
from datetime import datetime, timedelta, timezone
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import storage
from werkzeug.utils import secure_filename
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file, ai_validate_custom_text
from build_pdf import generate_pdf
from PIL import Image, ImageDraw, ImageFont
try:
    import stripe  # type: ignore
except Exception:
    stripe = None
try:
    import markdown2  # type: ignore
except Exception:
    markdown2 = None

# --- App Setup ---
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "supersecret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

# Add near top with other config
app.config.update(
    SERVER_NAME='faithsparksprintables.com',
    APPLICATION_ROOT='/',
    PREFERRED_URL_SCHEME='https'
)

def is_safe_url(target: str) -> bool:
    if not target:
        return False
    ref = urlparse(request.host_url)
    test = urlparse(urljoin(request.host_url, target))
    return (test.scheme in ("http", "https")) and (ref.netloc == test.netloc)

# Jinja filter for Markdown
def _md(text: str) -> str:
    try:
        if not text:
            return ''
        if markdown2:
            return markdown2.markdown(text)
        return text
    except Exception:
        return text
app.jinja_env.filters['markdown'] = _md
# Recommended cookie settings for HTTPS
app.config["SESSION_COOKIE_SECURE"] = True
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
    else:
        session.pop("user_info", None)
        session.pop("user_email", None)


# --- Firebase ---
creds_str = os.getenv("FIREBASE_CREDS_JSON")
STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("STORAGE_BUCKET")

if creds_str:
    with open("/tmp/firebase-creds.json", "w") as f:
        json.dump(json.loads(creds_str), f)
    firebase_admin.initialize_app(credentials.Certificate("/tmp/firebase-creds.json"))
    db = firestore.client()
    # Storage client (optional)
    try:
        storage_client = storage.Client.from_service_account_json("/tmp/firebase-creds.json") if STORAGE_BUCKET else None
    except Exception as e:
        print(f"⚠️ Storage client init failed: {e}")
        storage_client = None
else:
    db = None
    print("⚠️ Firestore not initialized")
    storage_client = None

# --- Stripe ---
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_PRICE_FAMILY = os.getenv('STRIPE_PRICE_FAMILY')  # legacy single
STRIPE_PRICE_CLASSROOM = os.getenv('STRIPE_PRICE_CLASSROOM')  # legacy single
STRIPE_PRICE_FAMILY_MONTHLY = os.getenv('STRIPE_PRICE_FAMILY_MONTHLY')
STRIPE_PRICE_FAMILY_ANNUAL = os.getenv('STRIPE_PRICE_FAMILY_ANNUAL')
STRIPE_PRICE_CLASSROOM_MONTHLY = os.getenv('STRIPE_PRICE_CLASSROOM_MONTHLY')
STRIPE_PRICE_CLASSROOM_ANNUAL = os.getenv('STRIPE_PRICE_CLASSROOM_ANNUAL')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
if STRIPE_SECRET_KEY and stripe:
    try:
        stripe.api_key = STRIPE_SECRET_KEY
    except Exception as _e:
        print(f"⚠️ Could not init Stripe: {_e}")

# --- Quotas ---
FREE_LIFETIME_QUOTA = int(os.getenv('FREE_LIFETIME_QUOTA', '10'))
FREE_MONTHLY_QUOTA = int(os.getenv('FREE_MONTHLY_QUOTA', '1'))
FAMILY_MONTHLY_QUOTA = int(os.getenv('FAMILY_MONTHLY_QUOTA', '15'))
CLASSROOM_MONTHLY_QUOTA = int(os.getenv('CLASSROOM_MONTHLY_QUOTA', '100'))

def _month_key():
    return datetime.now(timezone.utc).strftime('%Y-%m')

def _get_user_plan(email: str) -> str:
    if not db or not email:
        return 'free'
    try:
        u = db.collection('users').document(email).get()
        if u.exists:
            d = u.to_dict() or {}
            # gift expiration handling
            exp = d.get('giftExpiresAt')
            try:
                if exp and hasattr(exp, 'timestamp'):
                    # Firestore timestamp
                    if datetime.now(timezone.utc) > exp:
                        # expire gift
                        db.collection('users').document(email).set({ 'plan': 'free', 'isPro': False, 'giftExpiresAt': None }, merge=True)
                        d['plan'] = 'free'
                        d['isPro'] = False
            except Exception:
                pass
            plan = d.get('plan')
            if plan:
                return plan
            if d.get('isPro'):
                return 'family'
    except Exception:
        pass
    return 'free'

def _get_usage(email: str) -> tuple[int,int]:
    if not db or not email:
        return (0,0)
    try:
        u = db.collection('users').document(email).get()
        if u.exists:
            d = u.to_dict() or {}
            usage = d.get('usage') or {}
            lifetime = int(usage.get('lifetime') or 0)
            months = usage.get('months') or {}
            mk = _month_key()
            monthly = int(months.get(mk) or 0)
            return (lifetime, monthly)
    except Exception:
        pass
    return (0,0)

def _quota_for_plan(plan: str) -> tuple[int|None,int|None]:
    plan = (plan or 'free').lower()
    if plan in ('classroom','school','plus_classroom'):
        return (CLASSROOM_MONTHLY_QUOTA, None)
    if plan in ('family','plus','plus_family'):
        return (FAMILY_MONTHLY_QUOTA, None)
    return (FREE_MONTHLY_QUOTA, FREE_LIFETIME_QUOTA)

def _update_usage(email: str, add: int):
    if not db or not email or add <= 0:
        return
    try:
        u = db.collection('users').document(email).get()
        existing = u.to_dict() if u.exists else {}
        usage = existing.get('usage') or {}
        lifetime = int(usage.get('lifetime') or 0) + add
        months = usage.get('months') or {}
        mk = _month_key()
        monthly = int(months.get(mk) or 0) + add
        db.collection('users').document(email).set({ 'usage': { 'lifetime': lifetime, 'months': { mk: monthly } } }, merge=True)
    except Exception:
        pass

def _get_free_slugs() -> set[str]:
    """Return set of collection slugs that shouldn't count toward quota."""
    if not db:
        return set()
    try:
        doc = db.collection('config').document('app').get()
        if doc.exists:
            data = doc.to_dict() or {}
            slugs = data.get('freeSlugs') or []
            return set([str(s).strip().lower() for s in slugs if str(s).strip()])
    except Exception:
        pass
    return set()

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

def normalize_slug(text):
    text = text.replace("⚠️", "")
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s:–—]+', '_', text)
    return text.strip('_').lower()

def extract_version_from_text(text, fallback_version):
    fallback_version = "esv" if fallback_version.lower() == "auto" else fallback_version.lower()
    match = re.search(r'\((\w{2,6})\)$', text.strip())
    if match:
        version = match.group(1).lower()
        verse = text[:match.start()].strip()
    else:
        version = fallback_version
        verse = text.strip()
    return version, verse.title()

def update_zip_bundle():
    with ZipFile("output/worksheets_bundle.zip", "w") as zf:
        for file in os.listdir("output"):
            if file.endswith(".pdf"):
                zf.write(os.path.join("output", file), file)

os.makedirs("output", exist_ok=True)
os.makedirs("output/thumbs", exist_ok=True)
os.makedirs("output/packs", exist_ok=True)

# --- Theming ---
THEMES = {
    'teal': {
        'primary': '#0ea5a8', 'primary_dark': '#0b8a8d',
        'background': '#ffffff', 'box': '#edf2f7',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
    'blue': {
        'primary': '#3182ce', 'primary_dark': '#2b6cb0',
        'background': '#ffffff', 'box': '#edf2f7',
        'text': '#2d3748', 'text_secondary': '#718096'
    },
    'christmas': {
        'primary': '#065f46', 'primary_dark': '#064e3b',
        'background': '#ffffff', 'box': '#f1f5f9',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
    'thanksgiving': {
        'primary': '#b45309', 'primary_dark': '#92400e',
        'background': '#fffaf0', 'box': '#fef3c7',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
}

def get_theme_vars(name: str) -> dict | None:
    """Return theme vars for a given name from presets or Firestore custom themes."""
    if name in THEMES:
        return THEMES[name]
    if db and name:
        try:
            d = db.collection('themes').document(name).get()
            if d.exists:
                data = d.to_dict() or {}
                return {
                    'primary': data.get('primary') or '#0ea5a8',
                    'primary_dark': data.get('primary_dark') or data.get('primaryDark') or '#0b8a8d',
                    'background': data.get('background') or '#ffffff',
                    'box': data.get('box') or '#edf2f7',
                    'text': data.get('text') or '#1f2937',
                    'text_secondary': data.get('text_secondary') or data.get('textSecondary') or '#6b7280',
                    'extras': {
                        'snow': bool(data.get('snow') or (data.get('extras') or {}).get('snow')),
                        'lights': bool(data.get('lights') or (data.get('extras') or {}).get('lights')),
                        'leaves': bool(data.get('leaves') or (data.get('extras') or {}).get('leaves')),
                        'string_lights': bool(data.get('string_lights') or (data.get('extras') or {}).get('string_lights')),
                        'snow_svg': bool(data.get('snow_svg') or (data.get('extras') or {}).get('snow_svg')),
                        'custom_css': (data.get('extra_css') or (data.get('extras', {}) if isinstance(data.get('extras'), dict) else {}).get('custom_css') or ''),
                    }
                }
        except Exception:
            pass
    return None

def list_all_themes() -> dict:
    """Return mapping name->vars for all presets + custom themes (best-effort if Firestore present)."""
    out = dict(THEMES)
    if db:
        try:
            for d in db.collection('themes').stream():
                name = d.id
                data = d.to_dict() or {}
                out[name] = {
                    'primary': data.get('primary') or '#0ea5a8',
                    'primary_dark': data.get('primary_dark') or data.get('primaryDark') or '#0b8a8d',
                    'background': data.get('background') or '#ffffff',
                    'box': data.get('box') or '#edf2f7',
                    'text': data.get('text') or '#1f2937',
                    'text_secondary': data.get('text_secondary') or data.get('textSecondary') or '#6b7280',
                    'extras': {
                        'snow': bool(data.get('snow') or (data.get('extras') or {}).get('snow')),
                        'lights': bool(data.get('lights') or (data.get('extras') or {}).get('lights')),
                        'leaves': bool(data.get('leaves') or (data.get('extras') or {}).get('leaves')),
                        'string_lights': bool(data.get('string_lights') or (data.get('extras') or {}).get('string_lights')),
                        'snow_svg': bool(data.get('snow_svg') or (data.get('extras') or {}).get('snow_svg')),
                        'custom_css': (data.get('extra_css') or (data.get('extras') or {}).get('custom_css') or ''),
                    }
                }
        except Exception:
            pass
    return out

def get_theme_selection():
    """Return (name, vars) for the current theme. Prefers Firestore, then env THEME_NAME, else 'teal'."""
    name = 'teal'
    auto = None
    auto_rules = []
    if db:
        try:
            conf = db.collection('config').document('app').get()
            if conf.exists:
                n = (conf.to_dict() or {}).get('theme')
                if n:
                    name = n
                confd = (conf.to_dict() or {})
                auto = confd.get('autoTheme') or None
                auto_rules = confd.get('autoThemes') or []
        except Exception:
            pass
    if name == 'teal':
        env_sel = os.getenv('THEME_NAME')
        if env_sel:
            name = env_sel
    # Auto theme override if in date range
    try:
        # Highest priority matching rule wins
        if isinstance(auto_rules, list) and len(auto_rules):
            def _key(r):
                try:
                    return int(r.get('priority') or 0)
                except Exception:
                    return 0
            for r in sorted(auto_rules, key=_key, reverse=True):
                if r.get('enabled') and r.get('name') and _rule_matches(r):
                    name = r.get('name')
                    break
        elif auto and auto.get('enabled') and auto.get('name'):
            if _is_today_in_range(auto.get('start',''), auto.get('end','')):
                name = auto.get('name')
    except Exception:
        pass
    # Live preview via session and query param (does not persist)
    try:
        # Session-driven preview set from admin page (with optional TTL)
        pv = session.get('preview_theme')
        pv_exp = session.get('preview_theme_exp')
        if pv:
            if pv_exp and int(datetime.now(timezone.utc).timestamp()) > int(pv_exp):
                session.pop('preview_theme', None)
                session.pop('preview_theme_exp', None)
            elif (get_theme_vars(pv) is not None):
                name = pv
        qname = (request.args.get('theme') or '').strip()
        if qname and (get_theme_vars(qname) is not None):
            name = qname
            # If pv=1 query param present, persist session preview
            if request.args.get('pv') in ('1','true','True','yes'):
                session['preview_theme'] = qname
                try:
                    session['preview_theme_exp'] = int(datetime.now(timezone.utc).timestamp()) + 3600
                except Exception:
                    pass
    except Exception:
        pass
    vars = get_theme_vars(name) or THEMES['teal']
    return name, vars

@app.route("/login/google/start")
def start_google_login():
    nxt = request.args.get("next")
    # Default to /browse if missing/unsafe
    if not _is_safe_next(nxt or ""):
        nxt = url_for("browse")
    session["after_login_next"] = nxt
    return redirect(url_for("google.login"))

@app.route("/oauth/finish")
def oauth_finish():
    # by now google.authorized is True; @before_request already hydrated user_info
    nxt = session.pop("post_login_next", None) or request.args.get("next")
    if nxt and is_safe_url(nxt):
        return redirect(nxt)
    return redirect(url_for("index"))

@app.route('/admin/theme/preview', methods=['POST'])
@admin_required
def admin_theme_preview():
    try:
        payload = request.get_json(silent=True) or {}
        if payload.get('clear'):
            session.pop('preview_theme', None)
            session.pop('preview_theme_exp', None)
            return jsonify({ 'ok': True, 'cleared': True })
        sel = (payload.get('theme') or '').strip()
        if sel and (get_theme_vars(sel) is not None):
            session['preview_theme'] = sel
            ttl = payload.get('ttlMinutes')
            try:
                if ttl:
                    ttl = int(ttl)
                    session['preview_theme_exp'] = int(datetime.now(timezone.utc).timestamp()) + max(60, ttl*60)
            except Exception:
                pass
            return jsonify({ 'ok': True, 'theme': sel })
        return jsonify({ 'ok': False, 'error': 'Unknown theme' }), 400
    except Exception as e:
        return jsonify({ 'ok': False, 'error': str(e) }), 500

# --- Collections ---
def load_collections():
    try:
        with open('collections.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        # minimal defaults; you can expand/override via collections.json
        return {
            "back-to-school": ["Proverbs 22:6", "Colossians 3:23", "Psalm 119:105"],
            "memory-verses": ["John 3:16", "Romans 8:28", "Philippians 4:13"],
            "psalms": ["Psalm 23:1", "Psalm 100:4", "Psalm 1:1"],
            "advent": ["Isaiah 9:6", "Micah 5:2", "Luke 2:11"],
            "easter": ["John 11:25", "Luke 24:6", "1 Corinthians 15:3-4"],
        }

COLLECTIONS = load_collections()

def get_collections(show_all: bool = False):
    """Return list of collection dicts: {slug,title,verses,defaultVersion,zipUrl,description}.
    Uses Firestore if available, else falls back to collections.json.
    """
    if db:
        try:
            if show_all:
                docs = db.collection('collections').stream()
            else:
                docs = db.collection('collections').where(filter=firestore.FieldFilter('isPublic','==', True)).stream()
            items = []
            for d in docs:
                data = d.to_dict()
                pr = data.get('prewarm') or {}
                items.append({
                    'slug': d.id,
                    'title': data.get('title') or d.id.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description',''),
                    'isFree': data.get('isFree', False),
                    'isSubscriberOnly': data.get('isSubscriberOnly', False),
                    'priceId': data.get('priceId'),
                    'prewarm': pr,
                    'lastBuilt': _fmt_dt(pr.get('finishedAt')) if isinstance(pr, dict) else None,
                    'order': int(data.get('order') or 9999),
                })
            if items:
                return items
        except Exception as e:
            print(f"⚠️ Could not load collections from Firestore: {e}")
    # Fallback to JSON
    items = []
    for slug, verses in (COLLECTIONS or {}).items():
        items.append({
            'slug': slug,
            'title': slug.replace('-', ' ').title(),
            'verses': verses,
            'defaultVersion': None,
            'zipUrl': None,
            'description': '',
            'isFree': False,
            'isSubscriberOnly': False,
            'priceId': None,
            'prewarm': None,
            'lastBuilt': None,
            'order': 9999,
        })
    return items

def get_collection_meta(slug: str):
    """Return a single collection dict or None."""
    if db:
        try:
            d = db.collection('collections').document(slug).get()
            if d.exists:
                data = d.to_dict()
                return {
                    'slug': slug,
                    'title': data.get('title') or slug.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description',''),
                    'isSubscriberOnly': data.get('isSubscriberOnly', False),
                    'priceId': data.get('priceId'),
                    'prewarm': data.get('prewarm'),
                    'isFree': data.get('isFree', False),
                }
        except Exception as e:
            print(f"⚠️ Load collection meta failed: {e}")
    # Fallback
    verses = (COLLECTIONS or {}).get(slug)
    if verses is None:
        return None
    return {'slug': slug, 'title': slug.replace('-', ' ').title(), 'verses': verses, 'defaultVersion': None, 'zipUrl': None, 'description': '', 'prewarm': None, 'isFree': False, 'isSubscriberOnly': False, 'priceId': None}

def get_collection_verses(slug: str):
    meta = get_collection_meta(slug)
    return meta['verses'] if meta else []

def make_thumbnail(verse_ref: str, version: str, base_name: str):
    """Create a small PNG thumbnail for listings. Lightweight and dependency-free."""
    try:
        w, h = 560, 420
        img = Image.new("RGB", (w, h), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        # Simple header bar
        draw.rectangle([0,0,w,44], fill=(230, 242, 255))
        title = "Bible Copywork Worksheet"
        try:
            font_big = ImageFont.truetype("fonts/KGPrimaryDotsLined.ttf", 22)
            font_small = ImageFont.truetype("fonts/KGPrimaryDotsLined.ttf", 16)
        except Exception:
            font_big = ImageFont.load_default()
            font_small = ImageFont.load_default()
        draw.text((16, 12), title, fill=(27, 49, 94), font=font_big)
        ref_text = f"{verse_ref} ({version})"
        draw.text((16, 70), ref_text, fill=(20, 20, 20), font=font_big)
        # Lines to suggest writing area
        y = 130
        for i in range(6):
            draw.line([(16, y), (w-16, y)], fill=(180, 180, 180), width=1)
            y += 40
        out = os.path.join("output", "thumbs", f"{base_name}.png")
        img.save(out, format="PNG")
        return out
    except Exception as e:
        print(f"⚠️ Thumbnail generation failed: {e}")
        return None

def upload_to_storage(local_path: str, dst_path: str) -> str | None:
    """Upload file to GCS bucket. Keeps object private. Returns None (do not store signed URLs)."""
    if not storage_client or not STORAGE_BUCKET:
        return None
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(dst_path)
        blob.upload_from_filename(local_path)
        # Keep private; do not return signed URL here (it expires)
        return None
    except Exception as e:
        print(f"⚠️ Upload to storage failed: {e}")
        return None

def signed_url_for_path(dst_path: str, minutes: int = 120) -> str | None:
    """Generate a short‑lived signed URL for a GCS object path within the configured bucket."""
    if not storage_client or not STORAGE_BUCKET:
        return None
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(dst_path)
        if not blob.exists():
            return None
        url = blob.generate_signed_url(version="v4", expiration=timedelta(minutes=minutes), method="GET")
        return url
    except Exception as e:
        print(f"⚠️ Signed URL error: {e}")
        return None

# --- Routes ---
@app.route("/")
def index():
    # If we just finished OAuth, honor the stored next
    if google.authorized:
        nxt = session.pop("after_login_next", None)
        if nxt:
            return redirect(nxt)
    return render_template("index.html", user_info=session.get("user_info"))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/healthz", methods=["GET", "HEAD"])
def healthz():
    return Response("ok", 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    })

@app.route("/generate", methods=["GET", "POST"])
@login_required
def generate():
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

        last_pdf = None
        free_skip_count = False
        # If coming from a free collection, skip counting usage
        if from_collection:
            free_slugs = _get_free_slugs()
            if from_collection.strip().lower() in free_slugs:
                free_skip_count = True

        success_count = 0
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
                canonical_ref = data.get("verse") or verse
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

        update_zip_bundle()
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

@app.route("/delete/<filename>")
@login_required
def delete_worksheet(filename):
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")
    try:
        docs = db.collection("worksheets") \
            .where(filter=firestore.FieldFilter("email", "==", user_email)) \
            .where(filter=firestore.FieldFilter("filename", "==", filename)) \
            .limit(1).stream()
        doc = next(docs, None)
        if doc:
            doc.reference.delete()

        file_path = os.path.join("output", filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        flash("Worksheet deleted successfully.", "success")
    except Exception as e:
        traceback.print_exc()
        flash(f"Error deleting worksheet: {e}", "error")

    return redirect(url_for("history"))

@app.route("/delete_bulk", methods=["POST"])
@login_required
def delete_bulk():
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")
    selected = request.form.getlist("selected_files")

    try:
        for filename in selected:
            docs = db.collection("worksheets") \
                .where(filter=firestore.FieldFilter("email", "==", user_email)) \
                .where(filter=firestore.FieldFilter("filename", "==", filename)) \
                .limit(1).stream()
            doc = next(docs, None)
            if doc:
                doc.reference.delete()
            file_path = os.path.join("output", filename)
            if os.path.exists(file_path):
                os.remove(file_path)

        flash("Selected worksheets deleted.", "success")
    except Exception as e:
        traceback.print_exc()
        flash(f"Error deleting worksheets: {e}", "error")

    return redirect(url_for("history"))

@app.route("/history")
@login_required
def history():
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")
    try:
        docs = db.collection("worksheets") \
            .where(filter=firestore.FieldFilter("email", "==", user_email)) \
            .order_by("timestamp", direction=firestore.Query.DESCENDING) \
            .stream()
        history_items = [doc.to_dict() | {"timestamp": doc.get("timestamp")} for doc in docs]
        return render_template("history.html", history=history_items, email=user_email)
    except Exception as e:
        traceback.print_exc()
        return f"Error fetching history: {e}", 500
@app.route("/download/<filename>")
@login_required
def download_file(filename):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        # analytics per-verse download
        try:
            if db:
                base = os.path.splitext(filename)[0]
                db.collection('analytics').document('verses').set({ base: firestore.Increment(1) }, merge=True)
                today = datetime.now(timezone.utc).strftime('%Y%m%d')
                db.collection('analytics_daily').document(f'verses_{today}').set({ base: firestore.Increment(1) }, merge=True)
        except Exception:
            pass
        return send_file(file_path, as_attachment=True, download_name=os.path.basename(file_path), conditional=True)

    # 🟢 Auto-fallback: regenerate instead of error
    user_email = session.get("user_email")
    docs = db.collection("worksheets") \
        .where(filter=firestore.FieldFilter("email", "==", user_email)) \
        .where(filter=firestore.FieldFilter("filename", "==", filename)) \
        .limit(1).stream()

    doc = next(docs, None)
    if not doc:
        flash("⚠️ File missing and original data not found.", "error")
        return redirect(url_for("history"))

    # reuse regenerate logic
    return redirect(url_for("regenerate", filename=filename))

@app.route('/thumb/<path:filename>')
@login_required
def thumb(filename):
    """Serve generated thumbnails from output/thumbs."""
    path = os.path.join('output', 'thumbs', filename)
    no_gen = request.args.get('skip') in ('1','true','True','yes')
    if os.path.exists(path):
        # If storage is configured, redirect to cloud copy when available
        if storage_client and STORAGE_BUCKET:
            try:
                bucket = storage_client.bucket(STORAGE_BUCKET)
                blob = bucket.blob(f'thumbs/{filename}')
                if blob.exists():
                    blob.make_public()  # ensure public
                    return redirect(blob.public_url)
            except Exception:
                pass
        resp = send_file(path, conditional=True)
        try:
            resp.headers['Cache-Control'] = 'public, max-age=86400'
        except Exception:
            pass
        return resp
    # On-demand create if missing (unless caller skips generation)
    if no_gen:
        return ("", 404)
    base = os.path.splitext(os.path.basename(filename))[0]
    pdf_name = base + '.pdf'
    if db:
        user_email = session.get('user_email')
        docs = db.collection('worksheets') \
            .where(filter=firestore.FieldFilter('email', '==', user_email)) \
            .where(filter=firestore.FieldFilter('filename', '==', pdf_name)) \
            .limit(1).stream()
        doc = next(docs, None)
        if doc:
            meta = doc.to_dict()
            verse_ref = meta.get('verse', base)
            version = meta.get('version', 'ESV')
            out = make_thumbnail(verse_ref, version, base)
            if out and os.path.exists(out):
                # upload for durability
                upload_to_storage(out, f'thumbs/{filename}')
                if storage_client and STORAGE_BUCKET:
                    try:
                        bucket = storage_client.bucket(STORAGE_BUCKET)
                        blob = bucket.blob(f'thumbs/{filename}')
                        if blob.exists():
                            blob.make_public()
                            return redirect(blob.public_url)
                    except Exception:
                        pass
                resp = send_file(out, conditional=True)
                try:
                    resp.headers['Cache-Control'] = 'public, max-age=86400'
                except Exception:
                    pass
                return resp
    return ("", 404)

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
    if not db:
        return "Firestore not configured", 500
    email = session.get('user_email')
    if not is_admin_email(email):
        return "Forbidden", 403
    try:
        data = load_collections()
        batch = db.batch()
        order = 1
        for slug, verses in data.items():
            ref = db.collection('collections').document(slug)
            batch.set(ref, {
                'title': slug.replace('-', ' ').title(),
                'verses': verses,
                'isPublic': True,
                'order': order,
                'defaultVersion': 'esv',
                # Mark starter pack as free download
                'isFree': True if slug == 'starter' else False,
            })
            order += 1
        batch.commit()
        return "Seeded collections from collections.json", 200
    except Exception as e:
        traceback.print_exc()
        return f"Seed error: {e}", 500

@app.context_processor
def inject_helpers():
    try:
        email = session.get('user_email')
        is_pro = False
        theme_name, theme_vars = get_theme_selection()
        # Resolve themed logo and favicon
        logo_url = url_for('static', filename='faith_sparks_logo.png')
        favicon_url = url_for('static', filename='favicon.ico')
        if db:
            try:
                conf = db.collection('config').document('app').get()
                if conf.exists:
                    logos = (conf.to_dict() or {}).get('logos') or {}
                    if isinstance(logos, dict):
                        logo_url = logos.get(theme_name) or logos.get('default') or logo_url
                    favs = (conf.to_dict() or {}).get('favicons') or {}
                    if isinstance(favs, dict):
                        favicon_url = favs.get(theme_name) or favs.get('default') or favicon_url
            except Exception:
                pass
        site_content = {}
        if db:
            try:
                cdoc = db.collection('config').document('content').get()
                if cdoc.exists:
                    site_content = cdoc.to_dict() or {}
            except Exception:
                pass
        usage_nav = None
        if db and email:
            try:
                u = db.collection('users').document(email).get()
                if u.exists:
                    is_pro = bool((u.to_dict() or {}).get('isPro'))
            except Exception:
                pass
            # usage chip
            try:
                plan = _get_user_plan(email)
                m_lim, _ = _quota_for_plan(plan)
                used_life, used_m = _get_usage(email)
                if m_lim is not None:
                    usage_nav = {
                        'text': f"{used_m}/{m_lim}",
                        'title': f"{used_m} of {m_lim} used this month",
                    }
                else:
                    usage_nav = { 'text': '∞', 'title': 'Unlimited this month' }
            except Exception:
                usage_nav = None
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
        }
    except Exception:
        return {
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
    prices = {
        'family': {
            'monthly': STRIPE_PRICE_FAMILY_MONTHLY,
            'annual': STRIPE_PRICE_FAMILY_ANNUAL,
            'single': STRIPE_PRICE_FAMILY,
        },
        'classroom': {
            'monthly': STRIPE_PRICE_CLASSROOM_MONTHLY,
            'annual': STRIPE_PRICE_CLASSROOM_ANNUAL,
            'single': STRIPE_PRICE_CLASSROOM,
        }
    }
    meta = { 'family': {}, 'classroom': {} }
    def _price_meta(pid):
        if not pid or not stripe:
            return None
        try:
            p = stripe.Price.retrieve(pid)
            return {
                'amount': (p.get('unit_amount') or 0) / 100.0,
                'currency': (p.get('currency') or 'usd').upper(),
                'recurring': (p.get('recurring') or {}).get('interval')
            }
        except Exception:
            return None
    # Try to enrich with amounts and savings
    try:
        fam_m = _price_meta(prices['family'].get('monthly'))
        fam_y = _price_meta(prices['family'].get('annual'))
        if fam_m: meta['family']['monthly'] = fam_m
        if fam_y: meta['family']['annual'] = fam_y
        if fam_m and fam_y and fam_m.get('amount'):
            m12 = fam_m['amount'] * 12.0
            save = max(0.0, 1.0 - (fam_y['amount'] / m12))
            meta['family']['save_pct'] = round(save * 100)
        cls_m = _price_meta(prices['classroom'].get('monthly'))
        cls_y = _price_meta(prices['classroom'].get('annual'))
        if cls_m: meta['classroom']['monthly'] = cls_m
        if cls_y: meta['classroom']['annual'] = cls_y
        if cls_m and cls_y and cls_m.get('amount'):
            m12 = cls_m['amount'] * 12.0
            save = max(0.0, 1.0 - (cls_y['amount'] / m12))
            meta['classroom']['save_pct'] = round(save * 100)
    except Exception:
        pass
    return render_template('plus.html', prices=prices, meta=meta, promo_hint='SAVE25')

def _is_safe_next(target: str) -> bool:
    if not target:
        return False
    host_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return (test_url.scheme in ("http", "https") and host_url.netloc == test_url.netloc)


def _resolve_price_id(id_or_product: str) -> str:
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
    if not STRIPE_SECRET_KEY or not stripe:
        return 'Stripe not configured', 500
    id_or_price = (request.form.get('price_id') or '').strip()
    if not id_or_price:
        return 'Missing price', 400
    price_id = _resolve_price_id(id_or_price)
    user_email = session.get('user_email')
    try:
        chk = stripe.checkout.Session.create(
            mode='subscription',
            customer_email=user_email,
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=url_for('plus_success', _external=True) + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=url_for('plus_pricing', _external=True),
            allow_promotion_codes=True,
            metadata={'email': user_email, 'plan_price_id': price_id},
        )
        return redirect(chk.url, code=303)
    except Exception as e:
        traceback.print_exc()
        return f"Stripe error: {e}", 500

@app.route('/plus/success')
def plus_success():
    return render_template('success.html')

@app.route('/billing')
@login_required
def billing_portal():
    if not STRIPE_SECRET_KEY or not stripe:
        return 'Stripe not configured', 500
    email = session.get('user_email')
    if not db or not email:
        return redirect(url_for('index'))
    try:
        u = db.collection('users').document(email).get()
        if not u.exists:
            flash('No subscription found for your account.', 'warning')
            return redirect(url_for('plus_pricing'))
        cid = (u.to_dict() or {}).get('stripeCustomerId')
        if not cid:
            flash('No subscription found for your account.', 'warning')
            return redirect(url_for('plus_pricing'))
        ps = stripe.billing_portal.Session.create(customer=cid, return_url=url_for('index', _external=True))
        return redirect(ps.url)
    except Exception as e:
        traceback.print_exc()
        flash(f'Billing portal error: {e}', 'error')
        return redirect(url_for('plus_pricing'))

@app.route('/stripe/webhook', methods=['POST'])
def stripe_webhook():
    if not STRIPE_WEBHOOK_SECRET or not stripe:
        return ('', 200)
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return (f"Webhook error: {e}", 400)

    et = event.get('type')
    obj = event.get('data', {}).get('object', {})
    try:
        if et == 'checkout.session.completed':
            email = (obj.get('customer_details') or {}).get('email') or obj.get('customer_email') or (obj.get('metadata') or {}).get('email')
            subscription_id = obj.get('subscription')
            customer_id = obj.get('customer')
            price_id = (obj.get('metadata') or {}).get('plan_price_id')
            pack_slug = (obj.get('metadata') or {}).get('pack_slug')
            # Retrieve subscription to capture price if needed
            try:
                if subscription_id and STRIPE_SECRET_KEY:
                    sub = stripe.Subscription.retrieve(subscription_id, expand=['items.data.price'])
                    if sub and sub.get('items') and sub['items']['data']:
                        price_id = sub['items']['data'][0]['price']['id']
            except Exception:
                pass
            if db and email:
                if subscription_id:
                    plan = 'family' if price_id == STRIPE_PRICE_FAMILY else 'classroom' if price_id == STRIPE_PRICE_CLASSROOM else 'plus'
                    db.collection('users').document(email).set({
                        'isPro': True,
                        'plan': plan,
                        'stripeCustomerId': customer_id,
                        'subscriptionId': subscription_id,
                        'priceId': price_id,
                        'updatedAt': firestore.SERVER_TIMESTAMP,
                    }, merge=True)
                elif pack_slug:
                    # one-time pack purchase
                    db.collection('users').document(email).set({
                        'purchases': { pack_slug: True },
                        'updatedAt': firestore.SERVER_TIMESTAMP,
                    }, merge=True)
        elif et == 'customer.subscription.deleted':
            sub = obj
            customer_id = sub.get('customer')
            if db and customer_id:
                try:
                    # Find user by stripeCustomerId
                    q = db.collection('users').where(filter=firestore.FieldFilter('stripeCustomerId','==', customer_id)).limit(1).stream()
                    udoc = next(q, None)
                    if udoc:
                        udoc.reference.set({ 'plan': 'free', 'isPro': False, 'subscriptionId': None, 'updatedAt': firestore.SERVER_TIMESTAMP }, merge=True)
                except Exception:
                    pass
        # You can handle other events as needed
    except Exception:
        traceback.print_exc()
    return ('', 200)

@app.route('/admin/analytics')
@admin_required
def admin_analytics():
    col_items = get_collections(show_all=True)
    by_slug = { c['slug']: c for c in col_items }
    top_packs = []
    top_packs_week = []
    top_verses = []
    top_verses_week = []
    if db:
        try:
            doc = db.collection('analytics').document('packs').get()
            if doc.exists:
                counts = doc.to_dict() or {}
                for slug, cnt in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                    top_packs.append({ 'slug': slug, 'title': by_slug.get(slug, {'title': slug}).get('title'), 'downloads': cnt })
        except Exception as e:
            print(f"⚠️ analytics packs error: {e}")
        try:
            agg = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                d = (today - timedelta(days=i)).strftime('%Y%m%d')
                dd = db.collection('analytics_daily').document(f'packs_{d}').get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for slug, n in data.items():
                        agg[slug] = agg.get(slug, 0) + int(n)
            for slug, cnt in sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                top_packs_week.append({ 'slug': slug, 'title': by_slug.get(slug, {'title': slug}).get('title'), 'downloads': cnt })
        except Exception as e:
            print(f"⚠️ analytics weekly packs error: {e}")
        try:
            d = db.collection('analytics').document('verses').get()
            if d.exists:
                data = d.to_dict() or {}
                for k, v in sorted(data.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                    top_verses.append({ 'key': k, 'count': v })
        except Exception as e:
            print(f"⚠️ analytics verses error: {e}")
        try:
            agg = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                dkey = (today - timedelta(days=i)).strftime('%Y%m%d')
                dd = db.collection('analytics_daily').document(f'verses_{dkey}').get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for key, n in data.items():
                        agg[key] = agg.get(key, 0) + int(n)
            for k, v in sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                top_verses_week.append({ 'key': k, 'count': v })
        except Exception as e:
            print(f"⚠️ analytics weekly verses error: {e}")
    return render_template('admin_analytics.html', top_packs=top_packs, top_packs_week=top_packs_week, top_verses=top_verses, top_verses_week=top_verses_week)

# ----- Admin: Gift Plan -----
@app.route('/admin/gift', methods=['GET','POST'])
@admin_required
def admin_gift():
    if request.method == 'POST':
        if not db:
            return 'Firestore not configured', 500
        action = (request.form.get('action') or 'gift').strip()
        if action == 'revoke':
            email = (request.form.get('email') or '').strip().lower()
            if not email:
                flash('Email is required', 'error')
                return redirect(url_for('admin_gift'))
            try:
                db.collection('users').document(email).set({ 'plan': 'free', 'isPro': False, 'gifted': False, 'giftExpiresAt': None, 'updatedAt': firestore.SERVER_TIMESTAMP }, merge=True)
                flash('Gift revoked', 'success')
            except Exception as e:
                traceback.print_exc()
                flash(f'Revoke failed: {e}', 'error')
            return redirect(url_for('admin_gift'))
        # default: create/update gift
        email = (request.form.get('email') or '').strip().lower()
        plan = (request.form.get('plan') or 'family').strip().lower()
        expires = (request.form.get('expires') or '').strip()
        if not email:
            flash('Email is required', 'error')
            return redirect(url_for('admin_gift'))
        data = {
            'plan': plan,
            'isPro': plan in ('family','classroom','plus','plus_family','plus_classroom'),
            'gifted': True,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        if expires:
            try:
                y,m,d = [int(x) for x in expires.split('-')]
                dt = datetime(y,m,d,23,59,59,tzinfo=timezone.utc)
                data['giftExpiresAt'] = dt
            except Exception:
                flash('Could not parse expiration date; ignoring.', 'warning')
        try:
            db.collection('users').document(email).set(data, merge=True)
            try:
                admin_email = session.get('user_email')
                entry = { 'email': email, 'plan': plan, 'expiresAt': data.get('giftExpiresAt'), 'by': admin_email, 'at': firestore.SERVER_TIMESTAMP }
                db.collection('gifts').add(entry)
            except Exception:
                pass
            flash('Gift plan saved', 'success')
        except Exception as e:
            traceback.print_exc()
            flash(f'Gift save failed: {e}', 'error')
        return redirect(url_for('admin_gift'))
    # GET: show last 50 gifts
    gifts = []
    gifted_users = []
    if db:
        try:
            q = db.collection('gifts').order_by('at', direction=firestore.Query.DESCENDING).limit(50).stream()
            for d in q:
                gifts.append(d.to_dict())
        except Exception:
            gifts = []
        try:
            # Current gifted users (gifted true or plan != free with gift flag/expiry present)
            q2 = db.collection('users').where(filter=firestore.FieldFilter('gifted','==', True)).stream()
            for d in q2:
                ud = d.to_dict() or {}
                gifted_users.append({ 'email': d.id, 'plan': ud.get('plan','free'), 'expiresAt': ud.get('giftExpiresAt') })
        except Exception:
            gifted_users = []
    return render_template('admin_gift.html', gifts=gifts, gifted_users=gifted_users)

# ----- Admin: Collections CRUD -----
@app.route('/admin/collections')
@admin_required
def admin_collections():
    if not db:
        return "Firestore not configured", 500
    cols = get_collections(show_all=True)

    # Enrich with Stripe price metadata
    if stripe and STRIPE_SECRET_KEY:
        cache = {}
        for c in cols:
            pid = c.get('priceId')
            if not pid:
                continue
            if pid in cache:
                c['priceMeta'] = cache[pid]
                continue
            try:
                p = stripe.Price.retrieve(pid)
                meta = {
                    'amount': (p.get('unit_amount') or 0)/100.0,
                    'currency': (p.get('currency') or 'usd').upper()
                }
                c['priceMeta'] = meta
                cache[pid] = meta
            except Exception:
                c['priceMeta'] = None

    # Filter collections by visibility
    filt = (request.args.get('visibility') or 'all').lower()
    if filt == 'public':
        cols = [c for c in cols if c.get('isPublic', True)]
    elif filt == 'private':
        cols = [c for c in cols if not c.get('isPublic', True)]

    return render_template('admin_collections.html', 
                         collections=cols, 
                         visibility=filt)

@app.route('/admin/collections/new', methods=['GET','POST'])
@admin_required
def admin_collections_new():
    if not db:
        return "Firestore not configured", 500
    if request.method == 'POST':
        slug = (request.form.get('slug') or '').strip().lower()
        title = (request.form.get('title') or slug.replace('-', ' ').title()).strip()
        is_public = request.form.get('isPublic') == 'on'
        is_free = request.form.get('isFree') == 'on'
        default_version = (request.form.get('defaultVersion') or '').strip().lower() or None
        order = request.form.get('order')
        order_val = int(order) if order and order.isdigit() else None
        zip_url = (request.form.get('zipUrl') or '').strip() or None
        description = (request.form.get('description') or '').strip()
        is_sub_only = request.form.get('isSubscriberOnly') == 'on'
        price_id = (request.form.get('priceId') or '').strip() or None
        verses_raw = request.form.get('verses') or ''
        parts = re.split(r'[\n,]+', verses_raw)
        verses = [p.strip() for p in parts if p.strip()]
        if not slug or not verses:
            flash('Slug and at least one verse are required', 'error')
            return render_template('admin_collection_form.html', mode='new', data=request.form)
        data = {
            'title': title,
            'verses': verses,
            'isPublic': is_public,
            'isFree': is_free,
            'description': description,
            'isSubscriberOnly': is_sub_only,
            'priceId': price_id,
        }
        data['defaultVersion'] = default_version or 'esv'
        if order_val is not None: data['order'] = order_val
        if zip_url: data['zipUrl'] = zip_url
        db.collection('collections').document(slug).set(data)
        flash('Collection created', 'success')
        return redirect(url_for('admin_collections'))
    return render_template('admin_collection_form.html', mode='new', data={})

@app.route('/admin/collections/<slug>', methods=['GET','POST'])
@admin_required
def admin_collections_edit(slug):
    if not db:
        return "Firestore not configured", 500
    doc = db.collection('collections').document(slug).get()
    if not doc.exists:
        return "Not found", 404
    current = doc.to_dict()
    if request.method == 'POST':
        title = (request.form.get('title') or '').strip() or current.get('title')
        is_public = request.form.get('isPublic') == 'on'
        is_free = request.form.get('isFree') == 'on'
        is_sub_only = request.form.get('isSubscriberOnly') == 'on'
        price_id = (request.form.get('priceId') or '').strip() or None

        # Precedence: Free > Subscriber/Price
        if is_free:
            is_sub_only = False
            price_id = None

        data = {
            'title': title,
            'verses': current.get('verses', []),
            'isPublic': is_public,
            'isFree': is_free,
            'description': current.get('description', ''),
            'isSubscriberOnly': is_sub_only,
            'priceId': price_id,
        }

        # Don't clobber unknown fields
        db.collection('collections').document(slug).set(data, merge=True)
        flash('Collection updated', 'success')
        return redirect(url_for('admin_collections'))
    # Pre-fill textarea with newline-joined verses
    form_data = {
        'slug': slug,
        'title': current.get('title',''),
        'isPublic': current.get('isPublic', True),
        'isFree': current.get('isFree', False),
        'isSubscriberOnly': current.get('isSubscriberOnly', False),
        'priceId': current.get('priceId',''),
        'defaultVersion': current.get('defaultVersion',''),
        'order': current.get('order',''),
        'zipUrl': current.get('zipUrl',''),
        'description': current.get('description',''),
        'verses': "\n".join(current.get('verses', [])),
    }
    return render_template('admin_collection_form.html', mode='edit', data=form_data)

@app.route('/admin/collections/<slug>/delete', methods=['POST'])
@admin_required
def admin_collections_delete(slug):
    if not db:
        return "Firestore not configured", 500
    db.collection('collections').document(slug).delete()
    flash('Collection deleted', 'success')
    return redirect(url_for('admin_collections'))

@app.route('/admin/theme', methods=['GET','POST'])
@admin_required
def admin_theme():
    name, _vars = get_theme_selection()
    if request.method == 'POST':
        if not db:
            flash('Firestore not configured', 'error')
            return redirect(url_for('admin_theme'))
        sel = (request.form.get('theme') or 'teal').strip()
        if sel not in THEMES:
            # allow selecting a custom theme if it exists in Firestore
            if not (db and db.collection('themes').document(sel).get().exists):
                flash('Unknown theme', 'error')
                return redirect(url_for('admin_theme'))
        try:
            db.collection('config').document('app').set({ 'theme': sel }, merge=True)
            flash('Theme updated', 'success')
        except Exception as e:
            traceback.print_exc()
            flash(f'Error saving theme: {e}', 'error')
        return redirect(url_for('admin_theme'))
    # load auto settings
    auto = {}
    autoThemes = []
    logos = {}
    favicons = {}
    if db:
        try:
            conf = db.collection('config').document('app').get()
            if conf.exists:
                confd = (conf.to_dict() or {})
                auto = confd.get('autoTheme') or {}
                autoThemes = confd.get('autoThemes') or []
                logos = confd.get('logos') or {}
                favicons = confd.get('favicons') or {}
        except Exception:
            pass
    return render_template('admin_theme.html', themes=list_all_themes(), current=name, auto=auto, autoThemes=autoThemes, logos=logos, favicons=favicons)

@app.route('/admin/theme/new', methods=['GET','POST'])
@admin_required
def admin_theme_new():
    if request.method == 'POST':
        if not db:
            flash('Firestore not configured', 'error')
            return redirect(url_for('admin_theme_new'))
        slug = (request.form.get('slug') or '').strip().lower()
        if not slug:
            flash('Slug is required', 'error')
            return render_template('admin_theme_form.html', mode='new', data=request.form)
        data = {
            'primary': (request.form.get('primary') or '').strip() or '#0ea5a8',
            'primary_dark': (request.form.get('primary_dark') or '').strip() or '#0b8a8d',
            'background': (request.form.get('background') or '').strip() or '#ffffff',
            'box': (request.form.get('box') or '').strip() or '#edf2f7',
            'text': (request.form.get('text') or '').strip() or '#1f2937',
            'text_secondary': (request.form.get('text_secondary') or '').strip() or '#6b7280',
            'snow': True if request.form.get('snow') == 'on' else False,
            'lights': True if request.form.get('lights') == 'on' else False,
            'leaves': True if request.form.get('leaves') == 'on' else False,
            'string_lights': True if request.form.get('string_lights') == 'on' else False,
            'snow_svg': True if request.form.get('snow_svg') == 'on' else False,
            'extra_css': (request.form.get('extra_css') or '').strip(),
        }
        try:
            db.collection('themes').document(slug).set(data)
            flash('Theme created', 'success')
            return redirect(url_for('admin_theme'))
        except Exception as e:
            traceback.print_exc()
            flash(f'Error saving theme: {e}', 'error')
            return render_template('admin_theme_form.html', mode='new', data=request.form)
    # GET: optional clone source
    src = (request.args.get('from') or '').strip()
    data = {}
    if src:
        try:
            vars = get_theme_vars(src)
            if vars:
                data = {
                    'slug': f"{src}-copy",
                    'primary': vars.get('primary'),
                    'primary_dark': vars.get('primary_dark'),
                    'background': vars.get('background'),
                    'box': vars.get('box'),
                    'text': vars.get('text'),
                    'text_secondary': vars.get('text_secondary'),
                    'snow': (vars.get('extras') or {}).get('snow'),
                    'lights': (vars.get('extras') or {}).get('lights'),
                    'leaves': (vars.get('extras') or {}).get('leaves'),
                    'extra_css': (vars.get('extras') or {}).get('custom_css'),
                }
        except Exception:
            pass
    return render_template('admin_theme_form.html', mode='new', data=data)

@app.route('/admin/theme/<slug>', methods=['GET','POST'])
@admin_required
def admin_theme_edit(slug):
    if not db:
        return 'Firestore not configured', 500
    doc = db.collection('themes').document(slug).get()
    if not doc.exists:
        return 'Not found', 404
    current = doc.to_dict() or {}
    if request.method == 'POST':
        data = {
            'primary': (request.form.get('primary') or '').strip() or '#0ea5a8',
            'primary_dark': (request.form.get('primary_dark') or '').strip() or '#0b8a8d',
            'background': (request.form.get('background') or '').strip() or '#ffffff',
            'box': (request.form.get('box') or '').strip() or '#edf2f7',
            'text': (request.form.get('text') or '').strip() or '#1f2937',
            'text_secondary': (request.form.get('text_secondary') or '').strip() or '#6b7280',
            'snow': True if request.form.get('snow') == 'on' else False,
            'lights': True if request.form.get('lights') == 'on' else False,
            'leaves': True if request.form.get('leaves') == 'on' else False,
            'string_lights': True if request.form.get('string_lights') == 'on' else False,
            'snow_svg': True if request.form.get('snow_svg') == 'on' else False,
            'extra_css': (request.form.get('extra_css') or '').strip(),
        }
        try:
            db.collection('themes').document(slug).set(data)
            flash('Theme updated', 'success')
            return redirect(url_for('admin_theme'))
        except Exception as e:
            traceback.print_exc()
            flash(f'Error saving theme: {e}', 'error')
    form_data = {
        'slug': slug,
        'primary': current.get('primary',''),
        'primary_dark': current.get('primary_dark') or current.get('primaryDark',''),
        'background': current.get('background',''),
        'box': current.get('box',''),
        'text': current.get('text',''),
        'text_secondary': current.get('text_secondary') or current.get('textSecondary',''),
        'snow': current.get('snow') or (current.get('extras') or {}).get('snow'),
        'lights': current.get('lights') or (current.get('extras') or {}).get('lights'),
        'leaves': current.get('leaves') or (current.get('extras') or {}).get('leaves'),
        'string_lights': current.get('string_lights') or (current.get('extras') or {}).get('string_lights'),
        'snow_svg': current.get('snow_svg') or (current.get('extras') or {}).get('snow_svg'),
        'extra_css': current.get('extra_css') or (current.get('extras') or {}).get('custom_css'),
    }
    return render_template('admin_theme_form.html', mode='edit', data=form_data)

@app.route('/admin/theme/<slug>/delete', methods=['POST'])
@admin_required
def admin_theme_delete(slug):
    if not db:
        return 'Firestore not configured', 500
    try:
        db.collection('themes').document(slug).delete()
        flash('Theme deleted', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Error deleting theme: {e}', 'error')
    return redirect(url_for('admin_theme'))

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
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    enabled = request.form.get('enabled') == 'on'
    name = (request.form.get('auto_theme') or '').strip()
    start = (request.form.get('auto_start') or '').strip()
    end = (request.form.get('auto_end') or '').strip()
    try:
        db.collection('config').document('app').set({ 'autoTheme': { 'enabled': enabled, 'name': name, 'start': start, 'end': end } }, merge=True)
        flash('Auto theme settings saved', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Error saving auto theme: {e}', 'error')
    return redirect(url_for('admin_theme'))

def _save_auto_rules(rules: list[dict]):
    if not db:
        return
    db.collection('config').document('app').set({ 'autoThemes': rules }, merge=True)

@app.route('/admin/theme/auto_rules/add', methods=['POST'])
@admin_required
def admin_theme_add_rule():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    name = (request.form.get('name') or '').strip()
    start = (request.form.get('start') or '').strip()
    end = (request.form.get('end') or '').strip()
    priority = request.form.get('priority') or '0'
    enabled = request.form.get('enabled') == 'on'
    try:
        conf = db.collection('config').document('app').get()
        rules = (conf.to_dict() or {}).get('autoThemes') or []
        rid = f"r{int(datetime.now(timezone.utc).timestamp())}"
        weekdays = request.form.getlist('weekdays')
        weekdays = [int(x) for x in weekdays if (x.isdigit())]
        time_start = (request.form.get('time_start') or '').strip()
        time_end = (request.form.get('time_end') or '').strip()
        rules.append({ 'id': rid, 'name': name, 'start': start, 'end': end, 'timeStart': time_start, 'timeEnd': time_end, 'weekdays': weekdays, 'priority': int(priority or 0), 'enabled': enabled })
        _save_auto_rules(rules)
        flash('Rule added', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Error adding rule: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/theme/auto_rules/update', methods=['POST'])
@admin_required
def admin_theme_update_rule():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    rid = (request.form.get('rid') or '').strip()
    try:
        conf = db.collection('config').document('app').get()
        rules = (conf.to_dict() or {}).get('autoThemes') or []
        new_rules = []
        for r in rules:
            if r.get('id') == rid:
                r = {
                    'id': rid,
                    'name': (request.form.get('name') or r.get('name')),
                    'start': (request.form.get('start') or r.get('start')),
                    'end': (request.form.get('end') or r.get('end')),
                    'timeStart': (request.form.get('time_start') or r.get('timeStart') or ''),
                    'timeEnd': (request.form.get('time_end') or r.get('timeEnd') or ''),
                    'weekdays': [int(x) for x in request.form.getlist('weekdays')] if request.form.getlist('weekdays') else (r.get('weekdays') or []),
                    'priority': int(request.form.get('priority') or r.get('priority') or 0),
                    'enabled': (request.form.get('enabled') == 'on'),
                }
            new_rules.append(r)
        _save_auto_rules(new_rules)
        flash('Rule updated', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Error updating rule: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/theme/auto_rules/delete', methods=['POST'])
@admin_required
def admin_theme_delete_rule():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    rid = (request.form.get('rid') or '').strip()
    try:
        conf = db.collection('config').document('app').get()
        rules = (conf.to_dict() or {}).get('autoThemes') or []
        rules = [r for r in rules if (r.get('id') != rid)]
        _save_auto_rules(rules)
        flash('Rule deleted', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Error deleting rule: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/theme/vars/<name>')
@admin_required
def admin_theme_vars(name):
    vars = get_theme_vars(name)
    if not vars:
        return jsonify({ 'error': 'Not found' }), 404
    return jsonify(vars)

@app.route('/admin/theme/logo', methods=['POST'])
@admin_required
def admin_theme_logo():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    theme = (request.form.get('theme') or '').strip() or 'default'
    f = request.files.get('file')
    if not f or not f.filename:
        flash('No file uploaded', 'error')
        return redirect(url_for('admin_theme'))
    filename = secure_filename(f.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.svg'):
        flash('Unsupported file type', 'error')
        return redirect(url_for('admin_theme'))
    local_path = os.path.join('output', f'logo_{theme}{ext}')
    try:
        f.save(local_path)
        url = None
        if storage_client and STORAGE_BUCKET:
            url = upload_to_storage(local_path, f'branding/{theme}/logo{ext}')
        if not url:
            # fallback to serving local path via packs (not public); better to use cloud URL
            url = url_for('static', filename='faith_sparks_logo.png')
        # Update config logos map
        db.collection('config').document('app').set({ 'logos': { theme: url } }, merge=True)
        flash('Logo uploaded', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Upload failed: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/theme/favicon', methods=['POST'])
@admin_required
def admin_theme_favicon():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    theme = (request.form.get('theme') or '').strip() or 'default'
    f = request.files.get('file')
    if not f or not f.filename:
        flash('No file uploaded', 'error')
        return redirect(url_for('admin_theme'))
    filename = secure_filename(f.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.ico', '.png', '.jpg', '.jpeg'):
        flash('Unsupported file type (use .ico or .png)', 'error')
        return redirect(url_for('admin_theme'))
    local_path = os.path.join('output', f'favicon_{theme}{ext}')
    try:
        f.save(local_path)
        url = None
        if storage_client and STORAGE_BUCKET:
            url = upload_to_storage(local_path, f'branding/{theme}/favicon{ext}')
        if not url:
            url = url_for('static', filename='favicon.ico')
        db.collection('config').document('app').set({ 'favicons': { theme: url } }, merge=True)
        flash('Favicon uploaded', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Upload failed: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/content', methods=['GET','POST'])
@admin_required
def admin_content():
    data = {}
    free_slugs = []
    collections_list = []
    if db:
        try:
            doc = db.collection('config').document('content').get()
            if doc.exists:
                data = doc.to_dict() or {}
            adoc = db.collection('config').document('app').get()
            if adoc.exists:
                free_slugs = (adoc.to_dict() or {}).get('freeSlugs') or []
            # Pull available collections for helper UI
            try:
                collections_list = get_collections()
            except Exception:
                collections_list = []
        except Exception:
            pass
    if request.method == 'POST':
        if not db:
            flash('Firestore not configured', 'error')
            return redirect(url_for('admin_content'))
        action = request.form.get('action') or 'save'
        if action == 'apply_preset' or action == 'apply_and_save_active':
            name = (request.form.get('preset_name') or '').strip()
            if not name:
                flash('Select a preset to apply', 'warning')
                return redirect(url_for('admin_content'))
            try:
                doc = db.collection('config').document('content').get()
                conf = doc.to_dict() if doc.exists else {}
                presets = (conf or {}).get('contentPresets') or {}
                preset = presets.get(name)
                if not preset:
                    flash('Preset not found', 'error')
                else:
                    db.collection('config').document('content').set(preset, merge=True)
                    if action == 'apply_and_save_active':
                        db.collection('config').document('content').set({ 'activePreset': name }, merge=True)
                        flash(f'Applied and set active preset: {name}', 'success')
                    else:
                        flash(f'Applied preset: {name}', 'success')
            except Exception as e:
                traceback.print_exc()
                flash(f'Error applying preset: {e}', 'error')
            return redirect(url_for('admin_content'))
        elif action == 'save_preset':
            name = (request.form.get('new_preset_name') or '').strip()
            if not name:
                flash('Enter a name for the preset', 'warning')
                return redirect(url_for('admin_content'))
            try:
                payload = {
                    'announcement_enabled': request.form.get('announcement_enabled') == 'on',
                    'announcement_text': (request.form.get('announcement_text') or '').strip(),
                    'home_title': (request.form.get('home_title') or '').strip(),
                    'home_subtitle': (request.form.get('home_subtitle') or '').strip(),
                    'home_cta_text': (request.form.get('home_cta_text') or '').strip() or 'Generate a Worksheet',
                    'home_cta_url': (request.form.get('home_cta_url') or '/generate').strip(),
                    'browse_banner_enabled': request.form.get('browse_banner_enabled') == 'on',
                    'browse_banner_text': (request.form.get('browse_banner_text') or '').strip(),
                    'generate_banner_enabled': request.form.get('generate_banner_enabled') == 'on',
                    'generate_banner_text': (request.form.get('generate_banner_text') or '').strip(),
                    'plus_banner_enabled': request.form.get('plus_banner_enabled') == 'on',
                    'plus_banner_text': (request.form.get('plus_banner_text') or '').strip(),
                    'about_html': (request.form.get('about_html') or '').strip(),
                    'home_intro_html': (request.form.get('home_intro_html') or '').strip(),
                }
                doc = db.collection('config').document('content').get()
                conf = doc.to_dict() if doc.exists else {}
                presets = (conf or {}).get('contentPresets') or {}
                presets[name] = payload
                db.collection('config').document('content').set({ 'contentPresets': presets }, merge=True)
                flash(f'Saved preset: {name}', 'success')
            except Exception as e:
                traceback.print_exc()
                flash(f'Error saving preset: {e}', 'error')
            return redirect(url_for('admin_content'))
        else:
            payload = {
                'announcement_enabled': request.form.get('announcement_enabled') == 'on',
                'announcement_text': (request.form.get('announcement_text') or '').strip(),
                'home_title': (request.form.get('home_title') or '').strip(),
                'home_subtitle': (request.form.get('home_subtitle') or '').strip(),
                'home_cta_text': (request.form.get('home_cta_text') or '').strip() or 'Generate a Worksheet',
                'home_cta_url': (request.form.get('home_cta_url') or '/generate').strip(),
                'browse_banner_enabled': request.form.get('browse_banner_enabled') == 'on',
                'browse_banner_text': (request.form.get('browse_banner_text') or '').strip(),
                'generate_banner_enabled': request.form.get('generate_banner_enabled') == 'on',
                'generate_banner_text': (request.form.get('generate_banner_text') or '').strip(),
                'plus_banner_enabled': request.form.get('plus_banner_enabled') == 'on',
                'plus_banner_text': (request.form.get('plus_banner_text') or '').strip(),
                'about_html': (request.form.get('about_html') or '').strip(),
                'home_intro_html': (request.form.get('home_intro_html') or '').strip(),
            }
            try:
                db.collection('config').document('content').set(payload, merge=True)
                # Also save free slugs configuration to config/app (from text + checkboxes)
                all_slugs = []
                free_raw = (request.form.get('free_slugs') or '').strip()
                if free_raw:
                    all_slugs.extend([s.strip().lower() for s in re.split(r'[\s,]+', free_raw) if s.strip()])
                from_checks = request.form.getlist('free_slugs_checks') or []
                all_slugs.extend([s.strip().lower() for s in from_checks if s.strip()])
                if db:
                    db.collection('config').document('app').set({ 'freeSlugs': sorted(list(set(all_slugs))) }, merge=True)
                flash('Content saved', 'success')
            except Exception as e:
                traceback.print_exc()
                flash(f'Error saving: {e}', 'error')
            return redirect(url_for('admin_content'))
    return render_template('admin_content.html', data=data, free_slugs=free_slugs, collections_list=collections_list)

@app.route('/admin/help')
@admin_required
def admin_help():
    return render_template('admin_help.html')

@app.route('/admin/theme/clone_activate', methods=['POST'])
@admin_required
def admin_theme_clone_activate():
    if not db:
        flash('Firestore not configured', 'error')
        return redirect(url_for('admin_theme'))
    src = (request.form.get('from') or '').strip()
    if not src:
        flash('Missing source theme', 'error')
        return redirect(url_for('admin_theme'))
    try:
        vars = get_theme_vars(src)
        if not vars:
            flash('Unknown source theme', 'error')
            return redirect(url_for('admin_theme'))
        new_slug = f"{src}-copy-{int(datetime.now(timezone.utc).timestamp())}"
        data = {
            'primary': vars.get('primary'),
            'primary_dark': vars.get('primary_dark'),
            'background': vars.get('background'),
            'box': vars.get('box'),
            'text': vars.get('text'),
            'text_secondary': vars.get('text_secondary'),
            'snow': (vars.get('extras') or {}).get('snow', False),
            'lights': (vars.get('extras') or {}).get('lights', False),
            'leaves': (vars.get('extras') or {}).get('leaves', False),
            'string_lights': (vars.get('extras') or {}).get('string_lights', False),
            'snow_svg': (vars.get('extras') or {}).get('snow_svg', False),
            'extra_css': (vars.get('extras') or {}).get('custom_css', ''),
        }
        db.collection('themes').document(new_slug).set(data)
        db.collection('config').document('app').set({ 'theme': new_slug }, merge=True)
        flash(f'Cloned and activated: {new_slug}', 'success')
    except Exception as e:
        traceback.print_exc()
        flash(f'Clone failed: {e}', 'error')
    return redirect(url_for('admin_theme'))

@app.route('/admin/collections/<slug>/move', methods=['POST'])
@admin_required
def admin_collections_move(slug):
    if not db:
        return "Firestore not configured", 500
    direction = request.form.get('dir', 'up')
    
    # Load ALL collections (including private ones)
    items = get_collections(show_all=True)
    items.sort(key=lambda c: (int(c.get('order') or 9999), c.get('title','')))
    
    idx = next((i for i, c in enumerate(items) if c['slug'] == slug), None)
    if idx is None:
        return redirect(url_for('admin_collections'))
    if direction == 'up' and idx > 0:
        a, b = items[idx-1], items[idx]
    elif direction == 'down' and idx < len(items)-1:
        a, b = items[idx], items[idx+1]
    else:
        return redirect(url_for('admin_collections'))
    # Swap their order values, defaulting missing to sequence
    a_order = int(a.get('order') or (idx))
    b_order = int(b.get('order') or (idx+1))
    try:
        db.collection('collections').document(a['slug']).set({ 'order': b_order }, merge=True)
        db.collection('collections').document(b['slug']).set({ 'order': a_order }, merge=True)
    except Exception:
        pass
    return redirect(url_for('admin_collections'))

@app.route('/admin/collections/<slug>/set_order', methods=['POST'])
@admin_required
def admin_collections_set_order(slug):
    if not db:
        return "Firestore not configured", 500
    order = request.form.get('order')
    try:
        val = int(order)
    except Exception:
        flash('Invalid order value', 'error')
        return redirect(url_for('admin_collections'))
    try:
        db.collection('collections').document(slug).set({ 'order': val }, merge=True)
    except Exception:
        pass
    return redirect(url_for('admin_collections'))

@app.route('/admin/prewarm/<slug>', methods=['POST'])
@admin_required
def admin_prewarm_pack(slug):
    if not db:
        return "Firestore not configured", 500
        
    # Mark as running and spawn background job
    ref = db.collection('collections').document(slug)
    ref.set({ 'prewarm': { 'status': 'running', 'startedAt': firestore.SERVER_TIMESTAMP } }, merge=True)

    def _job():
        try:
            meta = get_collection_meta(slug)
            if not meta:
                ref.set({ 'prewarm': { 'status': 'error', 'error': 'Not found', 'finishedAt': firestore.SERVER_TIMESTAMP } }, merge=True)
                return

            verses = meta.get('verses', [])
            default_version = (meta.get('defaultVersion') or 'esv').lower()
            use_cursive = False

            ref.set({ 'prewarm': { 'status': 'running', 'total': len(verses), 'done': 0, 'startedAt': firestore.SERVER_TIMESTAMP } }, merge=True)
            
            generated_files = []
            done = 0
            
            for v in verses:
                try:
                    version, verse = extract_version_from_text(v, default_version)
                    input_slug = normalize_slug(verse)
                    version_up = version.upper()
                    pdf_path = f"output/{input_slug}_{version_up}.pdf"
                    # Try cache first
                    cached = db.collection("verse_cache").document(f"{input_slug}_{version_up}").get()
                    if cached and cached.exists:
                        data = cached.to_dict().get('data', {})
                    else:
                        content = request_verse_data(verse, version)
                        if not content:
                            print(f"⚠️ Skip prewarm: could not fetch {verse} ({version})")
                            continue
                        data = parse_and_clean_json(content)
                        if not data or not data.get('fullVerse'):
                            print(f"⚠️ Skip prewarm: invalid data for {verse}")
                            continue
                        data.update({ 'version': version_up, 'cursive': use_cursive })
                        db.collection("verse_cache").document(f"{input_slug}_{version_up}").set({
                            'verse': verse, 'version': version_up, 'slug': f"{input_slug}_{version_up}", 'data': data,
                            'timestamp': firestore.SERVER_TIMESTAMP
                        })
                        save_json_to_file(data, f"output/{input_slug}_{version_up}.json")
                    if not os.path.exists(pdf_path):
                        generate_pdf(data, pdf_path, use_cursive=use_cursive)
                    if os.path.exists(pdf_path):
                        generated_files.append(pdf_path)
                finally:
                    done += 1
                    try:
                        ref.set({ 'prewarm': { 'status': 'running', 'total': len(verses), 'done': done } }, merge=True)
                    except Exception:
                        pass

            if not generated_files:
                ref.set({ 'prewarm': { 'status': 'error', 'error': 'No files generated', 'finishedAt': firestore.SERVER_TIMESTAMP } }, merge=True)
                return

            zip_name = f"{slug}.zip"
            zip_path = os.path.join('output', 'packs', zip_name)
            
            try:
                with ZipFile(zip_path, 'w') as z:
                    for p in generated_files:
                        z.write(p, os.path.basename(p))
            except Exception as e:
                traceback.print_exc()
                ref.set({ 'prewarm': { 'status': 'error', 'error': str(e), 'finishedAt': firestore.SERVER_TIMESTAMP } }, merge=True)
                return

            # Create application context for URL generation
            with app.app_context():
                url = upload_to_storage(zip_path, f"packs/{zip_name}")
                if not url:
                    url = url_for('serve_pack', filename=zip_name, _external=True)
            
            ref.set({
                'zipUrl': url,
                'prewarm': {
                    'status': 'done',
                    'finishedAt': firestore.SERVER_TIMESTAMP,
                    'done': len(generated_files),
                    'total': len(verses)
                }
            }, merge=True)

        except Exception as e:
            traceback.print_exc()
            ref.set({
                'prewarm': {
                    'status': 'error',
                    'error': str(e),
                    'finishedAt': firestore.SERVER_TIMESTAMP
                }
            }, merge=True)

    threading.Thread(target=_job, daemon=True).start()
    flash('Prewarm started. You can refresh this page to see progress.', 'success')
    return redirect(url_for('browse_detail', slug=slug))

@app.route('/admin/prewarm/<slug>/status')
@admin_required
def admin_prewarm_status(slug):
    if not db:
        return ("Firestore not configured", 500)
    try:
        doc = db.collection('collections').document(slug).get()
        if not doc.exists:
            return jsonify({ 'error': 'Not found' }), 404
        data = doc.to_dict() or {}
        pr = data.get('prewarm') or {}
        safe = {}
        for k, v in pr.items():
            try:
                # stringify non-JSON serializable values (e.g., Firestore timestamps)
                json.dumps(v)  # type: ignore
                safe[k] = v
            except Exception:
                try:
                    from datetime import datetime as _dt
                    if hasattr(v, 'isoformat'):
                        safe[k] = v.isoformat()  # type: ignore
                    else:
                        safe[k] = str(v)
                except Exception:
                    safe[k] = str(v)
        # Include zipUrl if present for convenience
        if data.get('zipUrl'):
            safe['zipUrl'] = data.get('zipUrl')
        return jsonify(safe), 200
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500

@app.route('/packs/<path:filename>')
@login_required
def serve_pack(filename):
    path = os.path.join('output', 'packs', filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True, download_name=os.path.basename(path), conditional=True)
    return ("", 404)

@app.route('/dl/pack/<slug>')
def dl_pack(slug):
    # Public download endpoint for packs; increments analytics and redirects
    if not db:
        return "Firestore not configured", 500
    d = db.collection('collections').document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict()
    # Require sign-in unless this pack is explicitly free
    is_free = bool(meta.get('isFree'))
    if not is_free and not google.authorized:
        flash('Please sign in to download packs.', 'warning')
        return redirect(url_for('google.login', next=request.url))
    # Subscriber-only gating
    if meta.get('isSubscriberOnly') and not is_free:
        allowed = False
        if google.authorized:
            email = session.get('user_email')
            # purchased or plus
            try:
                u = db.collection('users').document(email).get()
                if u.exists:
                    ud = u.to_dict() or {}
                    if ud.get('isPro') or (ud.get('plan') in ('family','classroom','plus','plus_family','plus_classroom')):
                        allowed = True
                    purchases = ud.get('purchases') or {}
                    if purchases.get(slug):
                        allowed = True
            except Exception:
                pass
        if not allowed:
            if meta.get('priceId'):
                flash('This pack is included with Plus, or buy it a la carte.', 'info')
                return redirect(url_for('browse_detail', slug=slug))
            flash('This pack is included with Plus.', 'info')
            return redirect(url_for('plus_pricing'))
    # Increment analytics counter
    try:
        # All-time counter
        db.collection('analytics').document('packs').set({ slug: firestore.Increment(1) }, merge=True)
        # Daily counter for weekly rollups (UTC date)
        today = datetime.now(timezone.utc).strftime('%Y%m%d')
        db.collection('analytics_daily').document(f'packs_{today}').set({ slug: firestore.Increment(1) }, merge=True)
    except Exception:
        pass
    url = meta.get('zipUrl')
    # Prefer signed GCS URL when available
    try:
        gcs_signed = signed_url_for_path(f"packs/{slug}.zip", minutes=120)
        if gcs_signed:
            return redirect(gcs_signed)
    except Exception:
        pass
    if url:
        return redirect(url)
    # fallback to local if present
    path = os.path.join('output', 'packs', f'{slug}.zip')
    if os.path.exists(path):
        return send_file(path, as_attachment=True, download_name=os.path.basename(path), conditional=True)
    return "Pack not available", 404

@app.route('/buy/pack/<slug>')
@login_required
def buy_pack(slug):
    if not stripe or not STRIPE_SECRET_KEY:
        return 'Stripe not configured', 500
    if not db:
        return 'Firestore not configured', 500

    d = db.collection('collections').document(slug).get()
    if not d.exists:
        return 'Not found', 404
    meta = d.to_dict() or {}

    # Already purchased? send them back with a happy message
    email = session.get('user_email')
    try:
        pur = db.collection('purchases').document(email).get().to_dict() if email and db else {}
        if pur and (pur.get('packs') or {}).get(slug):
            flash('You already own this pack. Download away! 🎉', 'success')
            return redirect(url_for('browse_detail', slug=slug))
    except Exception:
        pass

    # Use same fallback as Jinja helper (Option A — Stripe Checkout)
    price_id = (meta.get('priceId') or os.getenv('STRIPE_DEFAULT_PACK_PRICE', '')).strip()
    if not price_id:
        flash('This pack is not available for one-time purchase.', 'warning')
        return redirect(url_for('browse_detail', slug=slug))

    try:
        chk = stripe.checkout.Session.create(
            mode='payment',
            customer_email=email,
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=url_for('buy_success', slug=slug, _external=True) + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=url_for('browse_detail', slug=slug, _external=True),
            metadata={'email': email, 'pack_slug': slug},
        )
        return redirect(chk.url, code=303)
    except Exception as e:
        traceback.print_exc()
        return f'Stripe error: {e}', 500

@app.route('/buy/success/<slug>')
@login_required
def buy_success(slug):
    flash('Purchase successful. You can now download this pack.', 'success')
    return redirect(url_for('browse_detail', slug=slug))

@app.route('/toggle_favorite/<filename>', methods=['POST'])
@login_required
def toggle_favorite(filename):
    if not db:
        return ("Firestore not configured", 500)
    user_email = session.get('user_email')
    docs = db.collection('worksheets') \
        .where(filter=firestore.FieldFilter('email', '==', user_email)) \
        .where(filter=firestore.FieldFilter('filename', '==', filename)) \
        .limit(1).stream()
    doc = next(docs, None)
    if not doc:
        return redirect(url_for('history'))
    current = bool(doc.to_dict().get('favorite'))
    doc.reference.update({'favorite': not current})
    return redirect(url_for('history'))

@app.route('/browse')
def browse():
    """Browse page: public if PUBLIC_BROWSE enabled; else requires login."""
    if not is_public_browse_enabled() and not google.authorized:
        return redirect(url_for('google.login', next=request.url))
    items = []
    if db and google.authorized:
        user_email = session.get('user_email')
        recent = db.collection('worksheets') \
            .where(filter=firestore.FieldFilter('email', '==', user_email)) \
            .order_by('timestamp', direction=firestore.Query.DESCENDING) \
            .limit(24).stream()
        items = [doc.to_dict() for doc in recent]
    is_admin = is_admin_email(session.get('user_email'))
    col_items = get_collections(show_all=is_admin)
    # Sort by explicit order then title
    col_items.sort(key=lambda c: (int(c.get('order') or 9999), c.get('title','')))
    # enrich with counts
    collections = [ { 'slug': c['slug'], 'title': c['title'], 'count': len(c['verses']), 'zipUrl': c.get('zipUrl'), 'isFree': c.get('isFree'), 'isSubscriberOnly': c.get('isSubscriberOnly'), 'priceId': c.get('priceId') } for c in col_items ]
    # Attach live price meta so Buy buttons reflect Stripe amounts
    if stripe and STRIPE_SECRET_KEY:
        seen: dict[str,dict] = {}
        for c in collections:
            pid = c.get('priceId')
            if not pid:
                continue
            if pid in seen:
                c['priceMeta'] = seen[pid]
                continue
            try:
                p = stripe.Price.retrieve(pid)
                meta = { 'amount': (p.get('unit_amount') or 0)/100.0, 'currency': (p.get('currency') or 'usd').upper() }
                c['priceMeta'] = meta
                seen[pid] = meta
            except Exception:
                c['priceMeta'] = None
    # Top packs by download count (all-time)
    top_packs = []
    # Top packs this week (sum of last 7 daily docs)
    top_packs_week = []
    if db:
        try:
            doc = db.collection('analytics').document('packs').get()
            if doc.exists:
                counts = doc.to_dict() or {}
                # sort by count desc and map to known collections
                by_slug = { c['slug']: c for c in collections }
                sorted_slugs = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
                for slug, cnt in sorted_slugs[:6]:
                    meta = by_slug.get(slug)
                    if meta:
                        top_packs.append({ 'slug': slug, 'title': meta['title'], 'downloads': cnt, 'zipUrl': meta.get('zipUrl'), 'isFree': meta.get('isFree') })
        except Exception as e:
            print(f"⚠️ Could not load analytics packs: {e}")

        # Weekly rollup
        try:
            by_slug = { c['slug']: c for c in collections }
            agg: dict[str,int] = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                d = (today - timedelta(days=i)).strftime('%Y%m%d')
                dd = db.collection('analytics_daily').document(f'packs_{d}').get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for slug, n in data.items():
                        agg[slug] = agg.get(slug, 0) + int(n)
            sorted_slugs = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)
            for slug, cnt in sorted_slugs[:6]:
                meta = by_slug.get(slug)
                if meta:
                    top_packs_week.append({ 'slug': slug, 'title': meta['title'], 'downloads': cnt, 'zipUrl': meta.get('zipUrl'), 'isFree': meta.get('isFree') })
        except Exception as e:
            print(f"⚠️ Could not compute weekly top packs: {e}")
    purchases = {}
    if db and google.authorized:
        try:
            u = db.collection('users').document(session.get('user_email')).get()
            if u.exists:
                purchases = (u.to_dict() or {}).get('purchases') or {}
        except Exception:
            purchases = {}
    return render_template('browse.html', items=items, collections=collections, top_packs=top_packs, top_packs_week=top_packs_week, purchases=purchases)

@app.route('/browse/<slug>')
def browse_detail(slug):
    """Show collection details, but gate downloads behind Plus/purchase."""
    if not is_public_browse_enabled() and not google.authorized:
        return redirect(url_for('google.login', next=request.url))
    
    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404

    # Always show the collection contents
    can_download = False
    needs_purchase = False
    
    # Check download permissions if logged in
    if google.authorized and db:
        email = session.get('user_email')
        try:
            u = db.collection('users').document(email).get()
            if u.exists:
                ud = u.to_dict() or {}
                # Allow if:
                # 1. Collection is free
                # 2. User has Plus subscription
                # 3. User has purchased this collection
                if meta.get('isFree'):
                    can_download = True
                elif ud.get('isPro') or (ud.get('plan') in ('family','classroom','plus','plus_family','plus_classroom')):
                    can_download = True
                elif (ud.get('purchases') or {}).get(slug):
                    can_download = True
                # Show purchase option if not free and has price
                elif meta.get('priceId'):
                    needs_purchase = True

        except Exception as e:
            print(f"Error checking permissions: {e}")

    # Add Stripe price metadata if needed
    if meta.get('priceId') and stripe and STRIPE_SECRET_KEY:
        try:
            p = stripe.Price.retrieve(meta['priceId'])
            meta['priceMeta'] = {
                'amount': (p.get('unit_amount') or 0)/100.0,
                'currency': (p.get('currency') or 'usd').upper()
            }
        except Exception:
            meta['priceMeta'] = None

    return render_template(
        'browse_detail.html',
        c=meta,
        can_download=can_download,
        needs_purchase=needs_purchase
    )

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
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")

    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"

    docs = db.collection("worksheets") \
        .where(filter=firestore.FieldFilter("email", "==", user_email)) \
        .where(filter=firestore.FieldFilter("filename", "==", filename)) \
        .limit(1).stream()
    doc = next(docs, None)
    if not doc:
        flash(f"Original data not found for {filename}", "error")
        return redirect(url_for("history"))

    meta = doc.to_dict()
    verse = meta["verse"]
    version = meta["version"]
    use_cursive = meta.get("cursive", False)
    is_custom = meta.get("custom", False)
    original_text = meta.get("text", verse)
    custom_prompt = meta.get("imageIdea", "An open Bible or prayer hands")
    slug = normalize_slug(verse)
    pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"

    try:
        if is_custom:
            data = {
                "verse": verse,
                "fullVerse": original_text,
                "traceableVerse": original_text,
                "handwritingLines": 3,
                "reflectionQuestion": "Why is this meaningful to you?",
                "imageIdea": custom_prompt,
                "version": "DIY",
                "cursive": use_cursive,
                "disclaimer": "This content was submitted by the user and not verified as Scripture."
            }
        else:
            content = request_verse_data(verse, version.lower())
            if not content:
                flash("Verse fetch failed during regeneration.", "error")
                return redirect(url_for("history"))
            data = parse_and_clean_json(content)
            data.update({
                "version": version.upper(),
                "cursive": use_cursive
            })

        generate_pdf(data, pdf_path, use_cursive=use_cursive)

        if os.path.exists(pdf_path):
            # analytics per-verse on regenerated download
            try:
                if db:
                    base = os.path.splitext(os.path.basename(pdf_path))[0]
                    db.collection('analytics').document('verses').set({ base: firestore.Increment(1) }, merge=True)
                    today = datetime.now(timezone.utc).strftime('%Y%m%d')
                    db.collection('analytics_daily').document(f'verses_{today}').set({ base: firestore.Increment(1) }, merge=True)
            except Exception:
                pass
            flash(f"Regenerated: {filename}", "success")
            return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
        else:
            return f"PDF not created: {pdf_path}", 500

    except Exception as e:
        traceback.print_exc()
        return f"Regenerate error: {e}", 500

# --- Error Handlers ---
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
    """List users with search and plan management."""
    if not db:
        return "Firestore not configured", 500
    q = (request.args.get("q") or "").strip().lower()
    docs = db.collection("users").limit(200).stream()
    users = []
    for d in docs:
        u = d.to_dict() or {}
        u["id"] = d.id  # document id is email in your app
        if q and q not in (u.get("email","").lower() or d.id.lower()):
            continue
        users.append(u)
    users.sort(key=lambda u: (u.get("email") or u["id"]).lower())
    return render_template("admin_users.html", users=users, q=q, plan_label=plan_label)

@app.route("/admin/users/<uid>/set_plan", methods=["POST"])
@admin_required 
def admin_users_set_plan(uid):
    """Update a user's plan."""
    if not db:
        return "Firestore not configured", 500
    plan = plan_norm(request.form.get("plan", "free"))
    db.collection("users").document(uid).set(
        {"plan": plan, "isPro": plan != "free", "updatedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    flash("Plan updated.", "success")
    return redirect(url_for("admin_users"))

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
        data = {"text": f"{used_m}/{m_lim}", "title": f"{used_m} of {m_lim} used this month"}
    else:
        data = {"text": "∞", "title": "Unlimited this month"}
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "no-store, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/admin/users/<uid>/reset_usage", methods=["POST"])
@admin_required
def admin_users_reset_usage(uid):
    """Reset usage counters based on plan type."""
    if not db:
        return "Firestore not configured", 500
    ref = db.collection("users").document(uid)
    snap = ref.get()
    user = snap.to_dict() if snap.exists else {}
    plan = plan_norm(user.get("plan", "free"))
    mk = _month_key()

    # Resets by plan:
    # - Free: wipe lifetime & this month's usage => user gets 10 lifetime + 1/mo again
    # - Plus Family: wipe this month's usage (15/mo)
    # - Plus Classroom: wipe this month's usage (100/mo)
    if plan == "free":
        new_usage = {"lifetime": 0, "months": {mk: 0}}
    else:
        # keep lifetime; just reset current month
        existing = (user or {}).get("usage") or {}
        lifetime = int((existing.get("lifetime") or 0))
        new_usage = {"lifetime": lifetime, "months": {mk: 0}}

    ref.set({"usage": new_usage, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    flash(f"Usage reset for {uid} ({plan_label(plan)})", "success")
    return redirect(url_for("admin_users"))
