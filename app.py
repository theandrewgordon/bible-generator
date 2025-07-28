from flask import Flask, request, send_file, render_template
import os
import json
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file
from build_pdf import generate_pdf
from werkzeug.utils import secure_filename

app = Flask(__name__)
os.makedirs("output", exist_ok=True)

def normalize_slug(text):
    return text.lower().replace(":", "_").replace("–", "_").replace("—", "_").replace(" ", "_")

@app.route('/')
def home():
    return render_template("form.html")

@app.route('/generate', methods=['POST'])
def generate():
    try:
        verse = request.form.get('verse', '').strip()
        version = request.form.get('version', '').strip().lower()
        use_cursive = 'cursive' in request.form

        # Basic input validation
        if not verse or not version:
            return "<h1>400 Bad Request</h1><p>Verse and version are required.</p>", 400
        if len(verse) > 100 or len(version) > 10:
            return "<h1>400 Bad Request</h1><p>Input too long.</p>", 400

        # Request GPT-generated data
        content = request_verse_data(verse, version=version)
        if not content:
            return "<h1>500 Internal Server Error</h1><p>Failed to retrieve verse data.</p>", 500

        data = parse_and_clean_json(content)
        data['version'] = version
        data['cursive'] = use_cursive

        slug = normalize_slug(verse)
        json_path = f"output/{slug}_{version}.json"
        pdf_path = f"output/{slug}_{version}.pdf"

        save_json_to_file(data, json_path)
        generate_pdf(data, pdf_path, use_cursive=use_cursive)

        return send_file(pdf_path, as_attachment=True)

    except Exception as e:
        return f"<h1>500 Internal Server Error</h1><p>{str(e)}</p>", 500

@app.route('/preview')
def preview():
    verse = request.args.get('verse')
    if not verse:
        return "", 400
    content = request_verse_data(verse)
    data = parse_and_clean_json(content)
    return data.get("fullVerse", "")

@app.route('/download_all')
def download_all():
    zip_path = "output/worksheets_bundle.zip"
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return "<p>No bundle found.</p>", 404

if __name__ == '__main__':
    app.run(debug=True)
