import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from build_pdf import generate_pdf
from zipfile import ZipFile
from verse_helpers import (
    build_prompt,
    call_openai,
    request_and_retry_trace_fix,
    save_json_to_file,
    slugify,
)

# Load environment and initialize OpenAI client
load_dotenv("secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Setup
version = "nlt"
output_dir = "output"
pdf_dir = "worksheets"
os.makedirs(output_dir, exist_ok=True)
os.makedirs(pdf_dir, exist_ok=True)

# ✅ You can override this in-code or leave it blank for prompt
verses_input = ""  # e.g. "John 3:16, Ephesians 2:8-9"

def parse_verses(verse_string):
    return [v.strip() for v in verse_string.split(",") if v.strip()]

def process_verse(verse_ref):
    print(f"\n⏳ Processing: {verse_ref} ({version.upper()})")
    slug = slugify(f"{verse_ref}_{version}")
    json_path = os.path.join(output_dir, f"{slug}.json")
    pdf_path = os.path.join(pdf_dir, f"{slug}.pdf")

    if os.path.exists(pdf_path):
        print(f"⚠️ Skipping existing: {pdf_path}")
        return

    prompt = build_prompt(verse_ref, version)
    content = call_openai(client, prompt)
    if not content:
        print("🔁 Retrying...")
        content = call_openai(client, prompt)
        if not content:
            print("❌ Failed: No response.")
            return

    try:
        data = json.loads(content)
        data["verse"] = verse_ref
        data = request_and_retry_trace_fix(client, data, verse_ref, version)
        save_json_to_file(json_path, data)
        generate_pdf(data, pdf_path, use_cursive=True)
        print(f"✅ Saved: {pdf_path}")
    except Exception as e:
        print(f"❌ Failed processing {verse_ref}: {e}")

def update_zip_bundle():
    zip_path = "output/worksheets_bundle.zip"
    with ZipFile(zip_path, "w") as zf:
        for pdf in os.listdir(pdf_dir):
            if pdf.endswith(".pdf"):
                zf.write(os.path.join(pdf_dir, pdf), pdf)

def main():
    verses = parse_verses(verses_input)
    if not verses:
        user_input = input("Enter one or more Bible verses (comma-separated): ")
        verses = parse_verses(user_input)

    for verse in verses:
        process_verse(verse)

    update_zip_bundle()

if __name__ == "__main__":
    main()
