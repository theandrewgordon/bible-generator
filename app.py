from flask import Flask, render_template, request, send_file, redirect, url_for, session
from flask_dance.contrib.google import make_google_blueprint, google
from flask_session import Session
import os, json, re
import firebase_admin
import os
from flask import flash
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
    scope=["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email", "openid"]
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
    fallback_version = fallback_version.lower() if fallback_version and fallback_version != "auto" else "esv"
    match = re.search(r'\((\w{2,6})\)$', verse_text.strip())
    if match:
        version = match.group(1).lower()
        verse = verse_text[:match.start()].strip()
        if version == "auto":
            version = fallback_version
    else:
        version = fallback_version
        verse = verse_text.strip()
    return version, verse.title()

def update_zip_bundle():
    zip_path = "output/worksheets_bundle.zip"
    with ZipFile(zip_path, "w") as zf:
        for filename in os.listdir("output"):
            if filename.endswith(".pdf"):
                zf.write(os.path.join("output", filename), filename)

# --- Auth Decorator ---
def login_required(func):
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not google.authorized:
            return redirect(url_for("google.login"))
        return func(*args, **kwargs)
    return wrapper

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
@login_required
def generate():
    if request.method == "GET":
        return render_template("generate.html")

    try:
        verse_input = request.form.get('verse', '').strip()
        raw_version = request.form.get('version', '').strip()
        selected_version = "" if raw_version.lower() == "auto" else raw_version.lower()
        use_cursive = 'cursive' in request.form
        user_email = session.get("user_email", "anonymous")

        if not verse_input:
            return "<h1>400 Bad Request</h1><p>Verse is required.</p>", 400

        verses = [v.strip() for v in verse_input.split(",") if v.strip()]
        final_pdf = None

        for verse_entry in verses:
            version, verse = extract_version_from_text(verse_entry, selected_version or "esv")
            normalized_verse = verse.title()
            if version == "auto":
                version = "esv"
            slug = normalize_slug(normalized_verse)
            json_path = f"output/{slug}_{version}.json"
            pdf_path = f"output/{slug}_{version}.pdf"
            final_pdf = pdf_path

            # Check for existing worksheet
            if db:
                try:
                    existing = db.collection("worksheets")\
                        .where("email", "==", user_email)\
                        .where("verse", "==", normalized_verse)\
                        .where("version", "==", version.upper())\
                        .where("cursive", "==", use_cursive)\
                        .limit(1)\
                        .stream()
                    
                    existing_doc = next(existing, None)
                    if existing_doc:
                        existing_filename = existing_doc.to_dict().get("filename")
                        if existing_filename and os.path.exists(os.path.join("output", existing_filename)):
                            print(f"📎 Found existing worksheet for {verse} ({version.upper() if version else 'ESV'})")
                            final_pdf = os.path.join("output", existing_filename)
                            continue
                except Exception as e:
                    print(f"⚠️ Deduplication check failed: {e}")

            # Try Firestore cache first
            cache_doc = None
            if db:
                try:
                    cache_doc = db.collection("verse_cache").document(f"{slug}_{version}").get()
                    if cache_doc.exists:
                        print(f"✅ Cache hit for {slug}_{version}")
                        data = cache_doc.to_dict()["data"]
                    else:
                        print(f"🕵️ Cache miss for {slug}_{version}")
                except Exception as e:
                    print(f"⚠️ Firestore cache lookup error: {e}")

            # If not found in cache, fetch and store
            if not cache_doc or not cache_doc.exists:
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

                # Save to Firestore cache
                if db:
                    try:
                        db.collection("verse_cache").document(f"{slug}_{version}").set({
                            "verse": verse,
                            "version": version.upper(),
                            "slug": f"{slug}_{version}",
                            "data": data,
                            "timestamp": firestore.SERVER_TIMESTAMP
                        })
                        print(f"✅ Saved to cache: {slug}_{version}")
                    except Exception as e:
                        print(f"⚠️ Failed to write cache for {slug}_{version}: {e}")

                # Still save locally if needed
                save_json_to_file(data, json_path)

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

            # Firestore logging
            if db:
                try:
                    db.collection("worksheets").add({
                        "email": session.get("user_email", "anonymous"),
                        "verse": normalized_verse,
                        "version": version.upper(),
                        "filename": os.path.basename(pdf_path),
                        "timestamp": firestore.SERVER_TIMESTAMP,
                        "cursive": use_cursive
                    })
                except Exception as firestore_error:
                    print(f"⚠️ Firestore error: {firestore_error}")

        update_zip_bundle()

        if len(verses) == 1 and final_pdf and os.path.exists(final_pdf):
            return send_file(final_pdf, as_attachment=True)
        elif len(verses) > 1 and os.path.exists("output/worksheets_bundle.zip"):
            return send_file("output/worksheets_bundle.zip", as_attachment=True)
        else:
            return "<h1>500 Error</h1><p>Could not generate requested file(s). Please try again or check your input.</p>", 500

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
@login_required
def download_all():
    zip_path = "output/worksheets_bundle.zip"
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return "<p>No bundle found.</p>", 404

@app.route("/delete_bulk", methods=["POST"])
@login_required
def delete_bulk():
    if not db:
        return "Firestore not configured", 500

    user_email = session.get("user_email")
    if not user_email:
        return redirect(url_for("index"))

    try:
        selected_files = request.form.getlist("selected_files")
        if not selected_files:
            flash("No worksheets selected for deletion.", "warning")
            return redirect(url_for("history"))

        deleted = 0
        for filename in selected_files:
            results = db.collection("worksheets")\
                .where("email", "==", user_email)\
                .where("filename", "==", filename)\
                .limit(1)\
                .stream()

            doc = next(results, None)
            if doc:
                doc_data = doc.to_dict()

                # Archive instead of delete
                db.collection("worksheet_archive").add({
                    **doc_data,
                    "deleted_at": firestore.SERVER_TIMESTAMP
                })

                doc.reference.delete()
                deleted += 1

            file_path = os.path.join("output", filename)
            if os.path.exists(file_path):
                os.remove(file_path)

        update_zip_bundle()
        flash(f"✅ {deleted} worksheet(s) deleted.", "success")
        return redirect(url_for("history"))

    except Exception as e:
        print(f"⚠️ Bulk delete error: {e}")
        flash("⚠️ Error during bulk deletion.", "error")
        return redirect(url_for("history"))



@app.route("/history")
@login_required
def history():
    if not db:
        return "<h1>Firestore is not configured.</h1>", 500

    user_email = session.get("user_email")
    if not user_email:
        return redirect(url_for("index"))

    try:
        results = db.collection("worksheets")\
            .where("email", "==", user_email)\
            .order_by("timestamp", direction=firestore.Query.DESCENDING)\
            .limit(20)\
            .stream()

        history = [{
            "verse": doc.to_dict().get("verse"),
            "version": doc.to_dict().get("version"),
            "filename": doc.to_dict().get("filename"),
            "timestamp": doc.to_dict().get("timestamp")
        } for doc in results]

        return render_template("history.html", history=history, email=user_email)

    except Exception as e:
        print(f"⚠️ Firestore history error: {e}")
        return "<h1>Unable to fetch history.</h1>", 500

@app.route("/download/<filename>")
@login_required
def download_file(filename):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return "<h1>404 Not Found</h1><p>File no longer exists.</p>", 404

@app.route("/delete/<filename>")
@login_required
def delete_worksheet(filename):
    if not db:
        return "Firestore not configured", 500
        
    user_email = session.get("user_email")
    if not user_email:
        return redirect(url_for("index"))

    try:
        # Find the Firestore document
        results = db.collection("worksheets")\
            .where("email", "==", user_email)\
            .where("filename", "==", filename)\
            .limit(1)\
            .stream()
        
        doc = next(results, None)
        if not doc:
            return "Worksheet not found", 404

        # Delete the physical file
        file_path = os.path.join("output", filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            
        # Delete the Firestore record
        doc.reference.delete()
        
        # Regenerate zip bundle without this file
        update_zip_bundle()
        
        return redirect(url_for("history"))

    except Exception as e:
        print(f"⚠️ Delete error: {e}")
        return "Error deleting worksheet", 500

@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404

if __name__ == "__main__":
    app.run(debug=True)
