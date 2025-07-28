from flask import Flask, request, send_file, render_template
import os
import json
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

def update_zip_bundle():
    """Create or update worksheets_bundle.zip from all PDFs in /output."""
    zip_path = "output/worksheets_bundle.zip"
    with ZipFile(zip_path, "w") as zf:
        for filename in os.listdir("output"):
            if filename.endswith(".pdf"):
                zf.write(os.path.join("output", filename), filename)

@app.route('/')
def home():
    return render_template("form.html")

@app.route('/generate', methods=['POST'])
def generate():
    try:
        verse_input = request.form.get('verse', '').strip()
        version = request.form.get('version', '').strip().lower()
        use_cursive = 'cursive' in request.form

        if not verse_input or not version:
            return "<h1>400 Bad Request</h1><p>Verse and version are required.</p>", 400
        if len(verse_input) > 200 or len(version) > 10:
            return "<h1>400 Bad Request</h1><p>Input too long.</p>", 400

        verses = [v.strip() for v in verse_input.split(",") if v.strip()]
        final_pdf = None

        for verse in verses:
            content = request_verse_data(verse, version=version)
            if not content:
                continue  # Skip failed verse

            data = parse_and_clean_json(content)
            data['version'] = version
            data['cursive'] = use_cursive

            slug = normalize_slug(verse)
            json_path = f"output/{slug}_{version}.json"
            pdf_path = f"output/{slug}_{version}.pdf"
            final_pdf = pdf_path  # Will be used if single verse

            save_json_to_file(data, json_path)
            generate_pdf(data, pdf_path, use_cursive=use_cursive)

        update_zip_bundle()

        if len(verses) == 1 and final_pdf:
            return send_file(final_pdf, as_attachment=True)
        else:
            return send_file("output/worksheets_bundle.zip", as_attachment=True)

    except Exception as e:
        return f"<h1>500 Internal Server Error</h1><p>{str(e)}</p>", 500

@app.route('/preview')
def preview():
    verse_input = request.args.get('verse', '').strip()
    version = request.args.get('version', 'nlt').strip().lower()
    if not verse_input:
        return "", 400

    verses = [v.strip() for v in verse_input.split(",") if v.strip()]
    previews = []
    for verse in verses:
        content = request_verse_data(verse, version=version)
        data = parse_and_clean_json(content)
        full = data.get("fullVerse", "")
        if full:
            html = f"<strong>{verse}</strong>: {full}"
            previews.append(html)

    return "<br><br>".join(previews)

@app.route('/download_all')
def download_all():
    zip_path = "output/worksheets_bundle.zip"
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return "<p>No bundle found.</p>", 404

if __name__ == '__main__':
    app.run(debug=True)
