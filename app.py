# test08-28-2025
from flask import Flask, render_template, request, send_file, redirect, url_for, session, flash
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re, traceback
from zipfile import ZipFile
import threading
from datetime import datetime, timedelta, timezone
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import storage
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file, ai_validate_custom_text
from build_pdf import generate_pdf
from PIL import Image, ImageDraw, ImageFont

# --- App Setup ---
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "supersecret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)
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
    redirect_to="index",
    scope=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
)
app.register_blueprint(google_bp, url_prefix="/login")

from flask import request

@app.before_request
def load_user_info():
    """
    Don't clear the session during the OAuth dance.
    Only fetch user_info after we're authorized.
    """
    # Skip meddling while the Flask-Dance blueprint is doing its work
    if request.blueprint == "google" or request.path.startswith("/login/google"):
        return

    if google.authorized:
        if "user_info" not in session:
            resp = google.get("/oauth2/v1/userinfo")
            if resp.ok:
                session["user_info"] = resp.json()
                session["user_email"] = session["user_info"].get("email")
                # Clear client-side generate form on fresh sign-in
                session["clear_storage"] = True
    else:
        # Not authorized: just drop cached user display info (do NOT clear entire session)
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

# --- Helpers ---
def login_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            return redirect(url_for("google.login"))
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

def get_collections():
    """Return list of collection dicts: {slug,title,verses,defaultVersion,zipUrl,description}.
    Uses Firestore if available, else falls back to collections.json.
    """
    if db:
        try:
            docs = db.collection('collections').where(filter=firestore.FieldFilter('isPublic','==', True)).stream()
            items = []
            for d in docs:
                data = d.to_dict()
                items.append({
                    'slug': d.id,
                    'title': data.get('title') or d.id.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description',''),
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
                    'prewarm': data.get('prewarm'),
                }
        except Exception as e:
            print(f"⚠️ Load collection meta failed: {e}")
    # Fallback
    verses = (COLLECTIONS or {}).get(slug)
    if verses is None:
        return None
    return {'slug': slug, 'title': slug.replace('-', ' ').title(), 'verses': verses, 'defaultVersion': None, 'zipUrl': None, 'description': '', 'prewarm': None}

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
    """Upload file to the configured GCS bucket. Returns public URL or None."""
    if not storage_client or not STORAGE_BUCKET:
        return None
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(dst_path)
        blob.upload_from_filename(local_path)
        # Make public (simple). For private, switch to signed URLs.
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"⚠️ Upload to storage failed: {e}")
        return None

# --- Routes ---
@app.route("/")
def index():
    return render_template("index.html", user_info=session.get("user_info"))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/about")
def about():
    return render_template("about.html")

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
            return render_template("generate.html", prefill_verse=prefill, clear_storage=clear_storage, default_version_override=default_version_override, collection_slug=col)

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

        last_pdf = None

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

        # analytics: collection generate count
        if db and from_collection:
            try:
                db.collection('analytics').document('pack_generates').set({ from_collection: firestore.Increment(1) }, merge=True)
            except Exception:
                pass

        update_zip_bundle()
        session["clear_storage"] = True

        if len(items_to_generate) == 1 and os.path.exists(last_pdf):
            flash("Worksheet generated successfully!", "success")
            return send_file(last_pdf, as_attachment=True)
        elif len(items_to_generate) > 1:
            zip_path = "output/worksheets_bundle.zip"
            if os.path.exists(zip_path):
                flash("Bundle generated successfully!", "success")
                return send_file(zip_path, as_attachment=True)

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
        return send_file(file_path, as_attachment=True)

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
        return send_file(path)
    # On-demand create if missing
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
                return send_file(out)
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
            })
            order += 1
        batch.commit()
        return "Seeded collections from collections.json", 200
    except Exception as e:
        traceback.print_exc()
        return f"Seed error: {e}", 500

@app.context_processor
def inject_admin_flag():
    try:
        return { 'is_admin': is_admin_email(session.get('user_email')) }
    except Exception:
        return { 'is_admin': False }

@app.route('/admin/analytics')
@admin_required
def admin_analytics():
    col_items = get_collections()
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

# ----- Admin: Collections CRUD -----
@app.route('/admin/collections')
@admin_required
def admin_collections():
    if not db:
        return "Firestore not configured", 500
    cols = get_collections()
    return render_template('admin_collections.html', collections=cols)

@app.route('/admin/collections/new', methods=['GET','POST'])
@admin_required
def admin_collections_new():
    if not db:
        return "Firestore not configured", 500
    if request.method == 'POST':
        slug = (request.form.get('slug') or '').strip().lower()
        title = (request.form.get('title') or slug.replace('-', ' ').title()).strip()
        is_public = request.form.get('isPublic') == 'on'
        default_version = (request.form.get('defaultVersion') or '').strip().lower() or None
        order = request.form.get('order')
        order_val = int(order) if order and order.isdigit() else None
        zip_url = (request.form.get('zipUrl') or '').strip() or None
        description = (request.form.get('description') or '').strip()
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
            'description': description,
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
        default_version = (request.form.get('defaultVersion') or '').strip().lower() or None
        order = request.form.get('order')
        order_val = int(order) if order and order.isdigit() else None
        zip_url = (request.form.get('zipUrl') or '').strip() or None
        description = (request.form.get('description') or '').strip()
        verses_raw = request.form.get('verses')
        verses = current.get('verses', [])
        if verses_raw is not None:
            parts = re.split(r'[\n,]+', verses_raw)
            verses = [p.strip() for p in parts if p.strip()]
        data = {
            'title': title,
            'verses': verses,
            'isPublic': is_public,
            'description': description,
        }
        if default_version: data['defaultVersion'] = default_version
        else: data['defaultVersion'] = 'esv'
        if order_val is not None: data['order'] = order_val
        else: data.pop('order', None)
        if zip_url: data['zipUrl'] = zip_url
        else: data.pop('zipUrl', None)
        db.collection('collections').document(slug).set(data)
        flash('Collection updated', 'success')
        return redirect(url_for('admin_collections'))
    # Pre-fill textarea with newline-joined verses
    form_data = {
        'slug': slug,
        'title': current.get('title',''),
        'isPublic': current.get('isPublic', True),
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

@app.route('/admin/prewarm/<slug>', methods=['POST'])
@admin_required
def admin_prewarm_pack(slug):
    if not db:
        return "Firestore not configured", 500
    # Mark as running and spawn background job to avoid request timeouts
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
                        db.collection('verse_cache').document(f"{input_slug}_{version_up}").set({
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

            url = upload_to_storage(zip_path, f"packs/{zip_name}") or url_for('serve_pack', filename=zip_name, _external=True)
            ref.set({ 'zipUrl': url, 'prewarm': { 'status': 'done', 'finishedAt': firestore.SERVER_TIMESTAMP, 'done': len(generated_files), 'total': len(verses) } }, merge=True)
        except Exception as e:
            traceback.print_exc()
            ref.set({ 'prewarm': { 'status': 'error', 'error': str(e), 'finishedAt': firestore.SERVER_TIMESTAMP } }, merge=True)

    threading.Thread(target=_job, daemon=True).start()
    flash('Prewarm started. You can refresh this page to see progress.', 'success')
    return redirect(url_for('browse_detail', slug=slug))

@app.route('/packs/<path:filename>')
@login_required
def serve_pack(filename):
    path = os.path.join('output', 'packs', filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
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
    if url:
        return redirect(url)
    # fallback to local if present
    path = os.path.join('output', 'packs', f'{slug}.zip')
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    return "Pack not available", 404

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
        return redirect(url_for('google.login'))
    items = []
    if db and google.authorized:
        user_email = session.get('user_email')
        recent = db.collection('worksheets') \
            .where(filter=firestore.FieldFilter('email', '==', user_email)) \
            .order_by('timestamp', direction=firestore.Query.DESCENDING) \
            .limit(24).stream()
        items = [doc.to_dict() for doc in recent]
    col_items = get_collections()
    # enrich with counts
    collections = [ { 'slug': c['slug'], 'title': c['title'], 'count': len(c['verses']), 'zipUrl': c.get('zipUrl') } for c in col_items ]
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
                        top_packs.append({ 'slug': slug, 'title': meta['title'], 'downloads': cnt, 'zipUrl': meta.get('zipUrl') })
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
                    top_packs_week.append({ 'slug': slug, 'title': meta['title'], 'downloads': cnt, 'zipUrl': meta.get('zipUrl') })
        except Exception as e:
            print(f"⚠️ Could not compute weekly top packs: {e}")
    return render_template('browse.html', items=items, collections=collections, top_packs=top_packs, top_packs_week=top_packs_week)

@app.route('/browse/<slug>')
def browse_detail(slug):
    if not is_public_browse_enabled() and not google.authorized:
        return redirect(url_for('google.login'))
    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    return render_template('browse_detail.html', c=meta)


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
            return send_file(pdf_path, as_attachment=True)
        else:
            return f"PDF not created: {pdf_path}", 500

    except Exception as e:
        traceback.print_exc()
        return f"Regenerate error: {e}", 500
