import os
from verse_helpers import request_verse_data, parse_and_clean_json, retry_traceable_fix, save_json_to_file

VERSIONS = ["kjv", "nlt", "esv", "nasb"]
INPUT_FILE = "top_200_verses.txt"
OUTPUT_FOLDER = "batch_output"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def normalize_filename(verse, version):
    slug = verse.lower().replace(" ", "_").replace(":", "_")
    return f"{slug}_{version}.json"

def generate_batch():
    with open(INPUT_FILE, "r") as f:
        verses = [line.strip() for line in f if line.strip()]

    for version in VERSIONS:
        print(f"\n📘 Generating for version: {version.upper()}")
        for verse in verses:
            try:
                filename = normalize_filename(verse, version)
                output_path = os.path.join(OUTPUT_FOLDER, filename)

                if os.path.exists(output_path):
                    print(f"✅ Skipping (already exists): {filename}")
                    continue

                print(f"⏳ {verse} ({version})...", end=" ")

                raw = request_verse_data(verse, version)
                if not raw:
                    print("❌ Failed to fetch")
                    continue

                data = parse_and_clean_json(raw)
                data = retry_traceable_fix(data)

                save_json_to_file(data, output_path)
                print("✅ Saved")

            except Exception as e:
                print(f"⚠️ Error on {verse}: {e}")

if __name__ == "__main__":
    generate_batch()
