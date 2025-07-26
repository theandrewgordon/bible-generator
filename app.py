from flask import Flask, request, send_file, render_template
import os
import json
from test_chatgpt import request_verse_data, parse_and_clean_json, save_json_to_file
from build_pdf import generate_pdf

app = Flask(__name__)

@app.route('/')
def home():
    return render_template("form.html")  # Basic form for user to input verse

@app.route('/generate', methods=['POST'])
def generate():
    verse = request.form['verse']
    version = "esv"
    slug = verse.lower().replace(":", "_").replace(" ", "_")
    json_path = f"output/{slug}_{version}.json"
    pdf_path = f"output/{slug}_{version}.pdf"

    # Get and save JSON
    content = request_verse_data(verse)
    data = parse_and_clean_json(content)
    save_json_to_file(data, json_path)

    # Generate PDF
    generate_pdf(data, pdf_path)

    return send_file(pdf_path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True)
