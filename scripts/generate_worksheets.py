#!/usr/bin/env python3
"""
Quick helper to generate a batch of worksheets locally.

Usage:
    python3 scripts/generate_worksheets.py \
        --version esv \
        --verses "Psalm 19:14" "Micah 6:8"

Requires OPENAI_API_KEY to be set (same as the web app).
Outputs JSON/PDF into the existing `output/` directory.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from build_pdf import generate_pdf  # type: ignore  # added to path above
from faithsparks.util.slug import normalize_slug
from verse_helpers import parse_and_clean_json, request_verse_data, save_json_to_file

DEFAULT_VERSES = [
    "Psalm 19:14",
    "Micah 6:8",
    "John 14:6",
    "Hebrews 13:8",
    "Psalm 118:24",
    "Matthew 22:37-39",
    "2 Corinthians 5:7",
    "Romans 6:23",
    "Ephesians 2:8-9",
    "Psalm 100:4",
    "Proverbs 16:3",
    "Colossians 3:17",
]


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate worksheet PDFs for a list of verses.")
    parser.add_argument(
        "--verses",
        nargs="+",
        help="Verses to generate (default is a curated list).",
    )
    parser.add_argument(
        "--version",
        default="esv",
        help="Bible version to request (default: esv).",
    )
    parser.add_argument(
        "--no-cursive",
        action="store_true",
        help="Disable cursive trace font when generating PDFs.",
    )
    return parser


def generate_for_verse(verse: str, version: str, use_cursive: bool, out_dir: Path) -> bool:
    print(f"→ Generating {verse} ({version.upper()})")
    content = request_verse_data(verse, version.lower())
    if not content:
        print(f"  ⚠️ Failed to fetch data for {verse}.")
        return False

    data = parse_and_clean_json(content)
    if not data:
        print(f"  ⚠️ Could not parse JSON for {verse}.")
        return False

    data.setdefault("verse", verse)
    data.setdefault("version", version.upper())
    data["cursive"] = use_cursive

    slug = normalize_slug(verse)
    json_path = out_dir / f"{slug}_{version.upper()}.json"
    pdf_suffix = "_cursive" if use_cursive else ""
    pdf_path = out_dir / f"{slug}_{version.upper()}{pdf_suffix}.pdf"

    save_json_to_file(data, json_path)
    try:
        generate_pdf(data, pdf_path, use_cursive=use_cursive)
    except Exception as exc:
        print(f"  ❌ Failed to generate PDF: {exc}")
        return False

    print(f"  ✅ Saved JSON -> {json_path}")
    print(f"  ✅ Saved PDF  -> {pdf_path}")
    return True


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    verses = args.verses or DEFAULT_VERSES
    out_dir = Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)

    success = 0
    for verse in verses:
        success += int(generate_for_verse(verse, args.version, not args.no_cursive, out_dir))

    print(f"\nDone. Generated {success}/{len(verses)} worksheets.")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
