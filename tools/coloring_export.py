# tools/coloring_export.py

import json
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # adjust if needed
JSON_PATH = ROOT / "data" / "coloring_pages.json"
CSV_PATH = ROOT / "data" / "coloring_pages.csv"
PROMPTS_PATH = ROOT / "data" / "coloring_prompts.txt"


def load_entries():
    with JSON_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def export_csv(entries):
    # flatten tags into a semicolon list for easier import
    fieldnames = [
        "id",
        "title",
        "slug",
        "category",
        "ot_nt",
        "bible_reference",
        "story_summary",
        "tags",
    ]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for e in entries:
            writer.writerow({
                "id": e["id"],
                "title": e["title"],
                "slug": e.get("slug", ""),
                "category": e.get("category", ""),
                "ot_nt": e["ot_nt"],
                "bible_reference": e["bible_reference"],
                "story_summary": e["story_summary"],
                "tags": ";".join(e.get("tags", [])),
            })


def build_image_prompt(entry):
    """
    Prompt tuned for: simple, kid-friendly, Bible-accurate line art.
    """
    tags = ", ".join(entry.get("tags", [])[:6])

    return f"""Simple black-and-white line-art coloring page with clean outlines only — no shading or gray areas. 
Use slightly thicker lines and a kid-friendly, easy-to-color style appropriate for ages 5–10. 
Keep the composition clear, uncluttered, and focused on this Bible scene, with no text in the image.

Scene: {entry['title']} — {entry['story_summary']}
Bible reference: {entry['bible_reference']}
Helpful details to include: {tags}
Style: simple outlines, square composition (approx. 1024x1024), no tiny background clutter, no words or letters anywhere."""
    

def export_prompts(entries):
    """
    Writes a simple text file with one block per coloring page:
    === ID 1 – creation-of-light ===
    <prompt>
    """
    with PROMPTS_PATH.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(f"=== ID {e['id']} – {e.get('slug', e['title'])} ===\n")
            f.write(build_image_prompt(e))
            f.write("\n\n")


def main():
    entries = load_entries()
    export_csv(entries)
    export_prompts(entries)
    print(f"Wrote CSV → {CSV_PATH}")
    print(f"Wrote prompts → {PROMPTS_PATH}")


if __name__ == "__main__":
    main()
