#!/usr/bin/env python3
"""Install the Geo Detectives 28-image watercolor art pack from a local ZIP.

Run from FaithSparks repository root:
    python scripts/install_geo_watercolor_pack.py /path/to/geo-detectives-28-watercolor-replacements.zip

Only changes Geo Detectives' assets, art CSS, and art references. Does not deploy.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

BASE = "geo-watercolor-replacements/"
EXPECTED = 28


def plan(repo: Path, archive: Path):
    geo = repo / "frontend" / "learning-labs" / "geo"
    data_file, entry_file = geo / "data.json", geo / "main.jsx"
    if not data_file.is_file() or not entry_file.is_file():
        raise ValueError("Expected Geo Detectives source in frontend/learning-labs/geo")
    if not archive.is_file():
        raise ValueError(f"Artwork ZIP not found: {archive}")

    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read(BASE + "art-manifest.json"))
        stylesheet = z.read(BASE + "art-replacements.css").decode("utf-8")
        art_map = {key.casefold(): value for key, value in manifest["termToArt"].items()}
        images = {name.removeprefix(BASE + "art-replacements/"): name
                  for name in z.namelist()
                  if name.startswith(BASE + "art-replacements/") and name.endswith(".webp")}
        if len(art_map) != EXPECTED or len(images) != EXPECTED:
            raise ValueError(f"Expected 28 mappings and 28 WebP files, got {len(art_map)} and {len(images)}")
        if len(set(art_map.values())) != EXPECTED:
            raise ValueError("All replacement concepts need distinct CSS class names")
        if any(not re.fullmatch(r"[a-z0-9-]+\\.webp", n) for n in images):
            raise ValueError("Unexpected artwork filename")
        for name, member in images.items():
            image = z.read(member)
            if not (image.startswith(b"RIFF") and image[8:12] == b"WEBP"):
                raise ValueError(f"Invalid WebP image: {name}")
            if f'./art-replacements/{name}' not in stylesheet:
                raise ValueError(f"Missing CSS image reference: {name}")

        data = json.loads(data_file.read_text(encoding="utf-8"))
        quest, compare = data["quest"], data["compare"]
        names = {q["answer"].casefold() for q in quest}
        if any(term not in names for term in art_map):
            raise ValueError("The game is missing terms expected by the art pack")
        amended = set()
        for item in quest:
            key = item["answer"].casefold()
            if key in art_map:
                item["art"] = art_map[key]
                amended.add(key)
        compare_updated = 0
        for item in compare:
            for i, term in enumerate(item["terms"]):
                key = term.casefold()
                if key in art_map:
                    item["arts"][i] = art_map[key]
                    compare_updated += 1
        entry = entry_file.read_text(encoding="utf-8")
        hook = "import './art.css';"
        if "import './art-replacements.css';" not in entry:
            if hook not in entry:
                raise ValueError("Cannot find the Geo Detectives art.css import")
            entry = entry.replace(hook, "import './art.css';import './art-replacements.css';", 1)
        return {"geo": geo, "data": json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                "main": entry, "css": stylesheet, "images": images,
                "amended": len(amended), "compare": compare_updated}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="ZIP containing the 28 watercolor images")
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--check", action="store_true", help="Validate only; do not change files")
    args = parser.parse_args()
    try:
        p = plan(args.repo_root.resolve(), args.archive.resolve())
        print(f"Verified {len(p['images'])} WebP images and {p['amended']} Quest art mappings; "
              f"{p['compare']} Compare image references will also be updated.")
        if args.check:
            return 0
        geo = p["geo"]
        target = geo / "art-replacements"
        target.mkdir(exist_ok=True)
        with zipfile.ZipFile(args.archive.resolve()) as z:
            for name, member in p["images"].items():
                (target / name).write_bytes(z.read(member))
        (geo / "art-replacements.css").write_text(p["css"], encoding="utf-8")
        (geo / "data.json").write_text(p["data"], encoding="utf-8")
        (geo / "main.jsx").write_text(p["main"], encoding="utf-8")
        print("Installed. Run npm ci/test/build --prefix frontend/learning-labs, "
              "then inspect desktop and mobile before committing built files.")
        return 0
    except (KeyError, ValueError, OSError, zipfile.BadZipFile, json.JSONDecodeError) as e:
        print(f"Artwork installation failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
