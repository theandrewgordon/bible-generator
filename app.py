# test08-28-2025
from flask import Flask, render_template, request, send_file, redirect, url_for, session, flash
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re, traceback
from zipfile import ZipFile
import firebase_admin
from firebase_admin import credentials, firestore
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
    else:
        # Not authorized: just drop cached user display info (do NOT clear entire session)
        session.pop("user_info", None)
        session.pop("user_email", None)


# --- Firebase ---
creds_str = os.getenv("FIREBASE_CREDS_JSON")
if creds_str:
    with open("/tmp/firebase-creds.json", "w") as f:
        json.dump(json.loads(creds_str), f)
    firebase_admin.initialize_app(credentials.Certificate("/tmp/firebase-creds.json"))
    db = firestore.client()
else:
    db = None
    print("⚠️ Firestore not initialized")

# --- Helpers ---
def login_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            return redirect(url_for("google.login"))
        return func(*args, **kwargs)
    return wrapper

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
            return render_template("generate.html", prefill_verse=request.args.get("verse", ""), clear_storage=clear_storage)

        verse_input = request.form.get("verse", "").strip()
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

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

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
        return send_file(path)
    return ("", 404)

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
@login_required
def browse():
    """Simple browse page: shows recent items and collection tiles."""
    if not db:
        return "Firestore not configured", 500
    user_email = session.get('user_email')
    recent = db.collection('worksheets') \
        .where(filter=firestore.FieldFilter('email', '==', user_email)) \
        .order_by('timestamp', direction=firestore.Query.DESCENDING) \
        .limit(24).stream()
    items = [doc.to_dict() for doc in recent]
    collections = [
        { 'slug': 'back-to-school', 'title': 'Back to School' },
        { 'slug': 'memory-verses', 'title': 'Memory Verses' },
        { 'slug': 'psalms', 'title': 'Psalms' },
        { 'slug': 'advent', 'title': 'Advent' },
        { 'slug': 'easter', 'title': 'Easter' },
    ]
    return render_template('browse.html', items=items, collections=collections)


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
            flash(f"Regenerated: {filename}", "success")
            return send_file(pdf_path, as_attachment=True)
        else:
            return f"PDF not created: {pdf_path}", 500

    except Exception as e:
        traceback.print_exc()
        return f"Regenerate error: {e}", 500
