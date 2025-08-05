from flask import Flask, render_template, request, send_file, redirect, url_for, session, flash
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re
import firebase_admin
from firebase_admin import credentials, firestore
from zipfile import ZipFile
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file
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
    scope=[
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "openid",
    ]
)

app.register_blueprint(google_bp, url_prefix="/login")

# --- Firebase ---
creds_str = os.environ.get("FIREBASE_CREDS_JSON")
if creds_str:
    with open("/tmp/firebase-creds.json", "w") as f:
        json.dump(json.loads(creds_str), f)
    firebase_admin.initialize_app(credentials.Certificate("/tmp/firebase-creds.json"))
    db = firestore.client()
else:
    db = None
    print("⚠️ Firestore not initialized")

# --- Utilities ---
def login_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            return redirect(url_for("google.login"))
        return func(*args, **kwargs)
    return wrapper

def normalize_slug(text):
    return re.sub(r'[\s:–—]', '_', text.lower())

def extract_version_from_text(text, fallback_version):
    match = re.search(r'\((\w{2,6})\)$', text.strip())
    if match:
        version = match.group(1).lower()
        verse = text[:match.start()].strip()
    else:
        version = fallback_version.lower()
        verse = text.strip()
    return version or "esv", verse.title()

def update_zip_bundle():
    with ZipFile("output/worksheets_bundle.zip", "w") as zf:
        for file in os.listdir("output"):
            if file.endswith(".pdf"):
                zf.write(os.path.join("output", file), file)

os.makedirs("output", exist_ok=True)

# --- Routes ---
@app.route("/")
def index():
    if google.authorized:
        resp = google.get("/oauth2/v1/userinfo")
        if resp.ok:
            session["user_email"] = resp.json().get("email", "anonymous")
    return render_template("index.html", user_info=resp.json() if google.authorized else None)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/success")
def success():
    return render_template("success.html")

@app.route("/preview")
def preview():
    verse_input = request.args.get('verse', '').strip()
    fallback = request.args.get('version', 'nlt').lower()
    if not verse_input:
        return "", 400

    previews = []
    for verse_entry in verse_input.split(","):
        version, verse = extract_version_from_text(verse_entry, fallback)
        data = parse_and_clean_json(request_verse_data(verse, version=version))
        previews.append(f"<strong>{verse}</strong> ({version.upper()}): {data.get('fullVerse', '')}")
    return "<br><br>".join(previews)

@app.route("/generate", methods=["GET", "POST"])
@login_required
def generate():
    if request.method == "GET":
        return render_template("generate.html")

    try:
        verse_input = request.form.get('verse', '').strip()
        selected_version = request.form.get('version', '').strip().lower()
        use_cursive = 'cursive' in request.form
        user_email = session.get("user_email", "anonymous")

        if not verse_input:
            return "Verse is required", 400

        verses = [v.strip() for v in verse_input.split(",") if v.strip()]
        last_pdf = None

        for v in verses:
            version, verse = extract_version_from_text(v, selected_version or "esv")
            slug = normalize_slug(verse)
            json_path = f"output/{slug}_{version}.json"
            pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"

            last_pdf = pdf_path

            # Check dedup
            existing = db.collection("worksheets").where(filter=firestore.FieldFilter("email", "==", user_email))\
                .where(filter=firestore.FieldFilter("verse", "==", verse))\
                .where(filter=firestore.FieldFilter("version", "==", version.upper()))\
                .where(filter=firestore.FieldFilter("cursive", "==", use_cursive))\
                .limit(1).stream() if db else []
            doc = next(existing, None)
            if doc and os.path.exists(os.path.join("output", doc.to_dict().get("filename"))):
                last_pdf = os.path.join("output", doc.to_dict().get("filename"))
                continue

            # Cache check
            cached = db.collection("verse_cache").document(f"{slug}_{version}").get() if db else None
            if cached and cached.exists:
                data = cached.to_dict()["data"]
            else:
                content = request_verse_data(verse, version)
                if not content:
                    continue
                data = parse_and_clean_json(content)
                data.update({"version": version.upper(), "cursive": use_cursive})
                if db:
                    db.collection("verse_cache").document(f"{slug}_{version}").set({
                        "verse": verse,
                        "version": version.upper(),
                        "slug": f"{slug}_{version}",
                        "data": data,
                        "timestamp": firestore.SERVER_TIMESTAMP
                    })
                save_json_to_file(data, json_path)

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

            if db:
                db.collection("worksheets").add({
                    "email": user_email,
                    "verse": verse,
                    "version": version.upper(),
                    "filename": os.path.basename(pdf_path),
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "cursive": use_cursive
                })

        update_zip_bundle()
        if len(verses) == 1 and os.path.exists(last_pdf):
            return send_file(last_pdf, as_attachment=True)
        if len(verses) > 1 and os.path.exists("output/worksheets_bundle.zip"):
            return send_file("output/worksheets_bundle.zip", as_attachment=True)
        return "No file generated", 500
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
    results = db.collection("worksheets").where(filter=firestore.FieldFilter("email", "==", user_email))\
        .order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50).stream()
    history = [doc.to_dict() for doc in results]
    return render_template("history.html", history=history, email=user_email)

@app.route("/download/<filename>")
@login_required
def download_file(filename):
    path = os.path.join("output", filename)
    return send_file(path, as_attachment=True) if os.path.exists(path) else "File not found", 404

@app.route("/download_all")
@login_required
def download_all():
    return send_file("output/worksheets_bundle.zip", as_attachment=True) if os.path.exists("output/worksheets_bundle.zip") else "Bundle not found", 404

@app.route("/delete/<filename>")
@login_required
def delete_worksheet(filename):
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")

    docs = db.collection("worksheets").where(filter=firestore.FieldFilter("email", "==", user_email))\
        .where(filter=firestore.FieldFilter("filename", "==", filename)).limit(1).stream()
    doc = next(docs, None)
    if doc:
        doc_data = doc.to_dict()
        db.collection("worksheet_archive").add({**doc_data, "deleted_at": firestore.SERVER_TIMESTAMP})
        doc.reference.delete()
        path = os.path.join("output", filename)
        if os.path.exists(path):
            os.remove(path)
        update_zip_bundle()
        flash("✅ Worksheet deleted", "success")
    return redirect(url_for("history"))

@app.route("/delete_bulk", methods=["POST"])
@login_required
def delete_bulk():
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    selected = request.form.getlist("selected_files")
    if not selected:
        flash("⚠️ No worksheets selected.", "warning")
        return redirect(url_for("history"))

    deleted = 0
    for filename in selected:
        docs = db.collection("worksheets").where(filter=firestore.FieldFilter("email", "==", user_email))\
            .where(filter=firestore.FieldFilter("filename", "==", filename)).limit(1).stream()
        doc = next(docs, None)
        if doc:
            db.collection("worksheet_archive").add({**doc.to_dict(), "deleted_at": firestore.SERVER_TIMESTAMP})
            doc.reference.delete()
        path = os.path.join("output", filename)
        if os.path.exists(path):
            os.remove(path)
        deleted += 1
    update_zip_bundle()
    flash(f"✅ Deleted {deleted} worksheets.", "success")
    return redirect(url_for("history"))

@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404

if __name__ == "__main__":
    app.run(debug=True)
