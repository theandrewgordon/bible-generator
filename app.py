from flask import Flask, request, send_file, render_template
import os
from zipfile import ZipFile
from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
    normalize_slug
)
from build_pdf import generate_pdf

app = Flask(__name__)
os.makedirs("output", exist_ok=True)

@app.route('/')
def home():
    return render_template("form.html")

@app.route('/generate', methods=['POST'])
def generate():
    try:
        verse_input = request.form.get('verse', '').strip()
        version = request.form.get('version', '').strip().lower()
        use_cursive = 'cursive' in request.form

        # Basic input validation
        if not verse_input or not version:
            return "<h1>400 Bad Request</h1><p>Verse and version are required.</p>", 400
        if len(verse_input) > 200 or len(version) > 10:
            return "<h1>400 Bad Request</h1><p>Input too long.</p>", 400

        verses = [v.strip() for v in verse_input.split(',') if v.strip()]
        generated_files = []

        for verse in verses:
            content = request_verse_data(verse, version=version)
            if not content:
                continue

            data = parse_and_clean_json(content)
            data['version'] = version
            data['cursive'] = use_cursive

            slug = normalize_slug(verse)
            json_path = f"output/{slug}_{version}.json"
            pdf_path = f"output/{slug}_{version}.pdf"

            save_json_to_file(data, json_path)
            generate_pdf(data, pdf_path, use_cursive=use_cursive)
            generated_files.append(pdf_path)

        if not generated_files:
            return "<h1>500 Error</h1><p>All verse lookups failed.</p>", 500

        # ZIP if more than one file
        if len(generated_files) > 1:
            zip_path = "output/generated_bundle.zip"
            with ZipFile(zip_path, "w") as zf:
                for f in generated_files:
                    zf.write(f, os.path.basename(f))
            return send_file(zip_path, as_attachment=True)

        # Return single PDF
        return send_file(generated_files[0], as_attachment=True)

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
