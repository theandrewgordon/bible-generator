import os
import json
from pathlib import Path
from build_pdf import generate_pdf

input_dir = Path("output")
output_dir = Path("worksheets")
output_dir.mkdir(parents=True, exist_ok=True)

def is_too_long(text):
    return len(text.split()) > 26

def process_file(json_file):
    slug = json_file.stem
    pdf_path = output_dir / f"{slug}.pdf"

    # Skip if already generated
    if pdf_path.exists():
        print(f"⏭️ Skipped (already exists): {pdf_path.name}")
        return

    try:
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load JSON: {json_file.name} ({e})")
        return

    traceable = data.get("traceableVerse", "")
    full = data.get("fullVerse", "")

    if is_too_long(traceable):
        print(f"⚠️ Traceable too long in {json_file.name} ({len(traceable.split())} words)")
        if not is_too_long(full):
            print("✅ Replacing with shorter fullVerse")
            data["traceableVerse"] = full
        else:
            print(f"❌ Both are too long in {json_file.name}. Please regenerate manually.")

    use_cursive = data.get("cursive", True)  # Default to True if not specified
    generate_pdf(data, str(pdf_path), use_cursive=use_cursive)
    print(f"✅ Saved: {pdf_path.name}")

def main():
    print(f"🔍 Scanning {input_dir} for JSON files...")
    for json_file in input_dir.glob("*.json"):
        process_file(json_file)

if __name__ == "__main__":
    main()
