from flask import Flask, request, send_file, render_template
import os
import json
import re
from zipfile import ZipFile
from werkzeug.utils import secure_filename
from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
)
from build_pdf import generate_pdf

app = Flask(__name__)
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

@app.route('/')
def home():
    return render_template("generate.html")

@app.route('/generate', methods=['POST'])
def generate():
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
                print(f"✅ Using cached JSON for {verse} ({version})")
                with open(json_path, "r") as f:
                    data = json.load(f)
            else:
                print(f"🔁 No cache for {verse} ({version}) — calling OpenAI")
                content = request_verse_data(verse, version=version)
                if not content:
                    print(f"❌ No content for: {verse}")
                    continue

                try:
                    data = parse_and_clean_json(content)
                except Exception as json_error:
                    print(f"❌ JSON error for {verse}: {json_error}")
                    continue

                if not data or 'verse' not in data:
                    print(f"❌ Incomplete data for {verse}: {data}")
                    continue

                data['version'] = version.upper()
                data['cursive'] = use_cursive
                save_json_to_file(data, json_path)

            generate_pdf(data, pdf_path, use_cursive=use_cursive)

        update_zip_bundle()

        if len(verses) == 1 and final_pdf:
            return send_file(final_pdf, as_attachment=True)
        else:
            return send_file("output/worksheets_bundle.zip", as_attachment=True)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"<h1>500 Internal Server Error</h1><pre>{str(e)}</pre>", 500

@app.route('/preview')
def preview():
    verse_input = request.args.get('verse', '').strip()
    fallback_version = request.args.get('version', 'nlt').strip().lower()
    if not verse_input:
        return "", 400

    verses = [v.strip() for v in verse_input.split(",") if v.strip()]
    previews = []
    for verse_entry in verses:
        version, clean_verse = extract_version_from_text(verse_entry, fallback_version)
        content = request_verse_data(clean_verse, version=version)
        data = parse_and_clean_json(content)
        full = data.get("fullVerse", "")
        if full:
            html = f"<strong>{clean_verse}</strong> ({version.upper()}): {full}"
            previews.append(html)

    return "<br><br>".join(previews)

@app.route('/download_all')
def download_all():
    zip_path = "output/worksheets_bundle.zip"
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return "<p>No bundle found.</p>", 404

@app.route('/about')
def about():
    return render_template("about.html")

@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404

if __name__ == '__main__':
    app.run(debug=True)
