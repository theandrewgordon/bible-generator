from flask import Flask, render_template, request, send_file, redirect, url_for, session
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re
import firebase_admin
from firebase_admin import credentials, firestore
from zipfile import ZipFile
from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
)
from build_pdf import generate_pdf

# --- Flask Setup ---
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "supersecret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

# --- Google Auth Setup ---
google_bp = make_google_blueprint(
    client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirect_to="index",
    scope=["profile", "email"],  # <-- add email here
)

app.register_blueprint(google_bp, url_prefix="/login")

# --- Firebase Firestore ---
creds_str = os.environ.get("FIREBASE_CREDS_JSON")
if creds_str:
    creds_dict = json.loads(creds_str)
    with open("/tmp/firebase-creds.json", "w") as f:
        json.dump(creds_dict, f)

    cred = credentials.Certificate("/tmp/firebase-creds.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
else:
    print("⚠️ No FIREBASE_CREDS_JSON set — skipping Firestore init")
    db = None

# --- Helpers ---
os.makedirs("output", exist_ok=True)

def normalize_slug(text):
    return text.lower().replace(":", "_").replace("–", "_").replace("—", "_").replace(" ", "_")

def extract_version_from_text(verse_text, fallback_version):
    match = re.search(r'\((\w{2,6})\)$', verse_text.strip())
    if match:
        return match.group(1).lower(), verse_text[:match.start()].strip()
    return fallback_version.lower(), verse_text.strip()

def update_zip_bundle():
    zip_path = "output/worksheets_bundle.zip"
    with ZipFile(zip_path, "w") as zf:
        for filename in os.listdir("output"):
            if filename.endswith(".pdf"):
                zf.write(os.path.join("output", filename), filename)

# --- Routes ---

@app.route("/")
def index():
    user_info = None
    if google.authorized:
        resp = google.get("/oauth2/v1/userinfo")
        if resp.ok:
            user_info = resp.json()
            session["user_email"] = user_info.get("email", "unknown@example.com")  # <-- avoid crash

    return render_template("index.html", user_info=user_info)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/generate", methods=["GET", "POST"])
def generate():
    if request.method == "GET":
        return render_template("generate.html")

    try:
        verse_input = request.form.get('verse', '').strip()
        selected_version = request.form.get('version', '').strip().lower()
        use_cursive = 'cursive' in request.form

        if not verse_input:
            return "<h1>400 Bad Request</h1><p>Verse is required.</p>", 400

        verses = [v.strip() for v in verse_input.split(",") if v.strip()]
        final_pdf = None

        for verse_entry in verses:
            version, verse = extract_version_from_text(verse_entry, selected_version)
            slug = normalize_slug(verse)
            json_path = f"output/{slug}_{version}.json"
            pdf_path = f"output/{slug}_{version}.pdf"
            final_pdf = pdf_path

            if os.path.exists(json_path):
                with open(json_path, "r") as f:
                    data = json.load(f)
            else:
                content = request_verse_data(verse, version=version)
                if not content:
                    continue
                try:
                    data = parse_and_clean_json(content)
                except Exception as json_error:
                    print(f"❌ JSON error for {verse}: {json_error}")
                    continue

                if not data or 'verse' not in data:
                    continue

                data['version'] = version.upper()
                data['cursive'] = use_cursive
                save_json_to_file(data, json_path)

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

            # Firestore logging
            if db:
                try:
                    db.collection("worksheets").add({
                        "email": session.get("user_email", "anonymous"),
                        "verse": verse,
                        "version": version.upper(),
                        "filename": os.path.basename(pdf_path),
                        "timestamp": firestore.SERVER_TIMESTAMP,
                        "cursive": use_cursive
                    })
                except Exception as firestore_error:
                    print(f"⚠️ Firestore error: {firestore_error}")

        update_zip_bundle()

        if len(verses) == 1 and final_pdf:
            return send_file(final_pdf, as_attachment=True)
        else:
            return send_file("output/worksheets_bundle.zip", as_attachment=True)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"<h1>500 Internal Server Error</h1><pre>{str(e)}</pre>", 500

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/success")
def success():
    return render_template("success.html")

@app.route("/preview")
def preview():
    verse_input = request.args.get('verse', '').strip()
    fallback_version = request.args.get('version', 'nlt').strip().lower()
    if not verse_input:
        return "", 400

    previews = []
    for verse_entry in verse_input.split(","):
        version, clean_verse = extract_version_from_text(verse_entry.strip(), fallback_version)
        content = request_verse_data(clean_verse, version=version)
        data = parse_and_clean_json(content)
        full = data.get("fullVerse", "")
        if full:
            html = f"<strong>{clean_verse}</strong> ({version.upper()}): {full}"
            previews.append(html)

    return "<br><br>".join(previews)

@app.route("/download_all")
def download_all():
    zip_path = "output/worksheets_bundle.zip"
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return "<p>No bundle found.</p>", 404

@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404

if __name__ == "__main__":
    app.run(debug=True)
