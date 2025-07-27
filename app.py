from flask import Flask, request, send_file, render_template
import os
import json
from test_chatgpt import request_verse_data, parse_and_clean_json, save_json_to_file
from build_pdf import generate_pdf

app = Flask(__name__)
os.makedirs("output", exist_ok=True)

@app.route('/')
def home():
    return render_template("form.html")

@app.route('/generate', methods=['POST'])
def generate():
    try:
        verse = request.form['verse'].strip()
        version = request.form['version'].strip().lower()
        use_cursive = 'cursive' in request.form  # checkbox is only in form if checked

        # Pass version to GPT
        content = request_verse_data(verse, version=version)
        if not content:
            return "<h1>500 Internal Server Error</h1><p>Failed to retrieve verse data.</p>", 500

        data = parse_and_clean_json(content)
        data['version'] = version  # make sure it's aligned
        data['cursive'] = use_cursive  # pass into PDF generator

        slug = verse.lower().replace(":", "_").replace(" ", "_")
        json_path = f"output/{slug}_{version}.json"
        pdf_path = f"output/{slug}_{version}.pdf"

        save_json_to_file(data, json_path)
        generate_pdf(data, pdf_path)

        return send_file(pdf_path, as_attachment=True)

    except Exception as e:
        return f"<h1>500 Internal Server Error</h1><p>{str(e)}</p>", 500

if __name__ == '__main__':
    app.run(debug=True)
