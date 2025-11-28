"""
Utility helpers for loading and querying the pre-seeded coloring catalog.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Dict

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "coloring_pages.json"


def load_coloring_pages() -> List[Dict]:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _match(items: List[str], query: str) -> bool:
    q = query.lower()
    return any(q in (item or "").lower() for item in items)


def find_by_reference(pages: List[Dict], reference_query: str) -> List[Dict]:
    query = reference_query.lower()
    result = []
    for page in pages:
        refs = [page.get("bible_reference", "")]
        refs.extend(page.get("tags", []))
        if _match(refs, query):
            result.append(page)
    return result


def find_by_tag(pages: List[Dict], tag_query: str) -> List[Dict]:
    return [page for page in pages if _match(page.get("tags", []), tag_query)]


if __name__ == "__main__":
    catalog = load_coloring_pages()
    print(f"Loaded {len(catalog)} coloring entries.")
    sample = find_by_tag(catalog, "Noah")
    print("Noah-themed titles:", [entry["title"] for entry in sample])
