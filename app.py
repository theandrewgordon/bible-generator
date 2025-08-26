from flask import Flask, render_template, request, send_file, redirect, url_for, session, flash
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re
from zipfile import ZipFile
import firebase_admin
from firebase_admin import credentials, firestore
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file, ai_validate_custom_text
from build_pdf import generate_pdf

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "supersecret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

# --- Google OAuth ---
google_bp = make_google_blueprint(
    client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirect_to="index",
    scope=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
)
app.register_blueprint(google_bp, url_prefix="/login")

@app.before_request
def load_user_info():
    if google.authorized and "user_info" not in session:
        resp = google.get("/oauth2/v1/userinfo")
        if resp.ok:
            session["user_info"] = resp.json()
            session["user_email"] = session["user_info"]["email"]
    elif not google.authorized:
        session.pop("user_info", None)
        session.pop("user_email", None)

# --- Firestore Init ---
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
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)  # Remove all non-word characters except space and dash
    text = re.sub(r'[\s:–—]+', '_', text)  # Replace whitespace/dashes with underscore
    return text.strip('_')

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
    if request.method == "GET":
        clear_storage = session.pop("clear_storage", False)
        return render_template(
            "generate.html",
            prefill_verse=request.args.get("verse", "").strip(),
            clear_storage=clear_storage
        )

    try:
        verse_input = request.form.get('verse', '').strip()
        custom_text = request.form.get('custom_text', '').strip()
        custom_title = request.form.get('custom_title', '').strip()
        selected_version = request.form.get('version', 'esv').strip().lower()
        use_cursive = request.form.get('cursive') == "on"
        user_email = session.get("user_email", "anonymous")

        tag_list = [v.strip() for v in verse_input.split(",") if v.strip()]
        is_custom = bool(custom_text)

        if not tag_list and not is_custom:
            flash("⚠️ Please enter a verse or custom text to generate.", "warning")
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
            safe = ai_validate_custom_text(custom_text)
            label = custom_title or "Custom Text (User Submitted)"
            title = label + (" ⚠️ Unverified" if not safe else "")
            items_to_generate.append({
                "slug": normalize_slug(label),
                "verse": title,              # this becomes the display title
                "version": "DIY",
                "is_custom": True,
                "text": custom_text          # this is used as actual verse content
            })

        last_pdf = None

        for item in items_to_generate:
            slug = item["slug"]
            version = item["version"]
            verse = item["verse"]
            is_custom = item["is_custom"]
            text = item["text"]
            pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"
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
                    continue  # ✅ Skip both PDF and Firestore write

            if is_custom:
                data = {
                    "verse": verse,
                    "fullVerse": text,
                    "traceableVerse": text,
                    "handwritingLines": 3,
                    "reflectionQuestion": "Why is this meaningful to you?",
                    "imageIdea": "An open Bible or prayer hands",
                    "version": "DIY",
                    "cursive": use_cursive,
                    "disclaimer": "This content was submitted by the user and not verified as Scripture."
                }
            else:
                cached = db.collection("verse_cache").document(f"{slug}_{version}").get() if db else None
                if cached and cached.exists:
                    data = cached.to_dict()["data"]
                else:
                    content = request_verse_data(verse, version)
                    if not content:
                        continue
                    data = parse_and_clean_json(content)
                    data.update({"version": version, "cursive": use_cursive})
                    if db:
                        db.collection("verse_cache").document(f"{slug}_{version}").set({
                            "verse": verse,
                            "version": version,
                            "slug": f"{slug}_{version}",
                            "data": data,
                            "timestamp": firestore.SERVER_TIMESTAMP
                        })
                    save_json_to_file(data, f"output/{slug}_{version}.json")

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

            if db:
                db.collection("worksheets").add({
                    "email": user_email,
                    "verse": verse,
                    "version": version,
                    "filename": os.path.basename(pdf_path),
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "cursive": use_cursive,
                    "custom": is_custom,
                    **({"text": text} if is_custom else {})
                })

        update_zip_bundle()
        session["clear_storage"] = True

        if len(items_to_generate) == 1 and os.path.exists(last_pdf):
            return send_file(last_pdf, as_attachment=True)
        elif len(items_to_generate) > 1 and os.path.exists("output/worksheets_bundle.zip"):
            return send_file("output/worksheets_bundle.zip", as_attachment=True)

        return "No worksheets were generated successfully", 500

    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Server error: {e}", 500
@app.route("/history")
@login_required
def history():
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    results = db.collection("worksheets") \
        .where(filter=firestore.FieldFilter("email", "==", user_email)) \
        .order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50).stream()
    history = [doc.to_dict() for doc in results]
    return render_template("history.html", history=history, email=user_email)
from flask import send_from_directory

# 🔽 Download a specific worksheet
@app.route("/download/<filename>")
@login_required
def download_file(filename):
    path = os.path.join("output", filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    else:
        return "File not found", 404

# 🗑️ Delete a specific file (if needed)
@app.route("/delete/<filename>", methods=["POST"])
@login_required
def delete_file(filename):
    user_email = session.get("user_email")
    if not db:
        return "Firestore not configured", 500

    path = os.path.join("output", filename)
    if os.path.exists(path):
        os.remove(path)

    # Delete from Firestore
    docs = db.collection("worksheets") \
        .where(filter=firestore.FieldFilter("email", "==", user_email)) \
        .where(filter=firestore.FieldFilter("filename", "==", filename)).stream()
    for doc in docs:
        doc.reference.delete()

    flash(f"{filename} deleted.", "success")
    return redirect(url_for("history"))

# 🗑️ Bulk delete selected files
@app.route("/delete_bulk", methods=["POST"])
@login_required
def delete_bulk():
    filenames = request.form.getlist("selected_files")
    user_email = session.get("user_email")

    if not filenames:
        flash("No files selected.", "warning")
        return redirect(url_for("history"))

    for filename in filenames:
        path = os.path.join("output", filename)
        if os.path.exists(path):
            os.remove(path)

        if db:
            docs = db.collection("worksheets") \
                .where(filter=firestore.FieldFilter("email", "==", user_email)) \
                .where(filter=firestore.FieldFilter("filename", "==", filename)).stream()
            for doc in docs:
                doc.reference.delete()

    flash(f"Deleted {len(filenames)} file(s).", "success")
    return redirect(url_for("history"))

# 🔁 Regenerate with saved `text` if DIY
@app.route("/regenerate/<filename>")
@login_required
def regenerate(filename):
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")
    docs = db.collection("worksheets") \
        .where(filter=firestore.FieldFilter("email", "==", user_email)) \
        .where(filter=firestore.FieldFilter("filename", "==", filename)).limit(1).stream()
    doc = next(docs, None)
    if not doc:
        return "Original data not found", 404

    meta = doc.to_dict()
    verse = meta["verse"]
    version = meta["version"]
    use_cursive = meta.get("cursive", False)
    is_custom = meta.get("custom", False)
    original_text = meta.get("text", verse)
    slug = normalize_slug(verse)
    pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"

    if is_custom:
        data = {
            "verse": verse,
            "fullVerse": original_text,
            "traceableVerse": original_text,
            "handwritingLines": 3,
            "reflectionQuestion": "Why is this meaningful to you?",
            "imageIdea": "An open Bible or prayer hands",
            "version": "DIY",
            "cursive": use_cursive,
            "disclaimer": "This content was submitted by the user and not verified as Scripture."
        }
    else:
        content = request_verse_data(verse, version.lower())
        if not content:
            return "Verse fetch failed", 500
        data = parse_and_clean_json(content)
        data.update({"version": version.upper(), "cursive": use_cursive})

    generate_pdf(data, pdf_path, use_cursive=use_cursive)
    return send_file(pdf_path, as_attachment=True) if os.path.exists(pdf_path) else "Regeneration failed", 500
