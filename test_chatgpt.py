import os
from dotenv import load_dotenv
from openai import OpenAI
from build_pdf import generate_pdf
from zipfile import ZipFile
from verse_helpers import (
    build_prompt,
    call_openai,
    request_and_retry_trace_fix,
    save_json_to_file,
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

verses = [
    "Luke 8:25",
    "Acts 1:8",  # Example long verse
]

def process_verse(verse_ref):
    print(f"\n⏳ Processing: {verse_ref} ({version.upper()})")
    slug = verse_ref.lower().replace(":", "_").replace("–", "_").replace(" ", "_")
    json_path = os.path.join(output_dir, f"{slug}_{version}.json")
    pdf_path = os.path.join(pdf_dir, f"{slug}_{version}.pdf")

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
        import json
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
        for pdf in os.listdir("worksheets"):
            if pdf.endswith(".pdf"):
                zf.write(f"worksheets/{pdf}", pdf)

def main():
    for verse in verses:
        process_verse(verse)

if __name__ == "__main__":
    main()
