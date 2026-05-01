from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from verse_helpers import (
    fetch_passage_text,
    normalize_reference_title,
    normalize_verse_data,
    parse_and_clean_json,
    request_theme_label,
    request_verse_data,
    request_verse_meaning,
)


STOPWORDS = {
    "THE",
    "AND",
    "FOR",
    "WITH",
    "THAT",
    "THIS",
    "HAVE",
    "FROM",
    "WILL",
    "YOUR",
    "YOU",
    "ARE",
    "HIS",
    "HER",
    "THEIR",
    "ABOUT",
    "WHEN",
    "THEN",
    "THERE",
    "WHAT",
    "WERE",
    "SAID",
    "SAYS",
    "INTO",
    "OVER",
    "UNDER",
    "MORE",
    "MOST",
    "VERY",
    "GOOD",
}

FALLBACK_WORDS = ["BIBLE", "JESUS", "GOD", "LOVE", "FAITH", "PRAY", "TRUST", "PEACE"]


def _clean_theme_label(raw: str | None, fallback: str) -> str:
    text = (raw or "").strip()
    if not text:
        return fallback
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            text = str(data.get("theme") or data.get("label") or "").strip()
    except Exception:
        pass
    text = re.sub(r"^[\s\-:•]+", "", text)
    text = text.replace('"', "").replace("'", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text or fallback


def _pick_pack_words(*parts: str, minimum: int = 8, maximum: int = 12) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()
    for part in parts:
        for token in re.findall(r"[A-Za-z']+", part or ""):
            up = token.upper().strip("'")
            if len(up) < 4 or up in STOPWORDS or up in seen:
                continue
            seen.add(up)
            words.append(up)
            if len(words) >= maximum:
                return words
    for fallback in FALLBACK_WORDS:
        if fallback not in seen:
            words.append(fallback)
            seen.add(fallback)
        if len(words) >= minimum:
            break
    return words[:maximum]


def _build_parent_guide(
    *,
    title: str,
    verse: str,
    version: str,
    meaning: str,
    age_bracket: str,
    theme_label: str,
    words: list[str],
) -> str:
    big_idea = meaning.strip() or f"Talk about {theme_label.lower()} and how God shows it here."
    prompt_words = ", ".join(words[:6]) if words else theme_label
    lines = [
        title,
        "",
        f"Verse: {verse} ({version.upper()})",
        f"Age focus: {age_bracket or 'mixed ages'}",
        "",
        "Big idea:",
        big_idea,
        "",
        "5-day mini plan:",
        "Day 1 — Read it together and underline the key word.",
        "Day 2 — Ask: What does this show us about God?",
        "Day 3 — Pray the verse back to God in simple words.",
        "Day 4 — Do one tiny action that matches the verse.",
        "Day 5 — Recite it, then choose your favorite page from the pack.",
        "",
        "Quick talk prompts:",
        f"- Which words should we notice: {prompt_words}",
        "- How would you explain this to a friend?",
        "- What can we do today that fits this verse?",
        "",
        "Print tip:",
        "Use the worksheet first, then the coloring page, then the word search as a review.",
    ]
    return "\n".join(lines).strip() + "\n"


def create_lesson_pack(
    *,
    user_email: str,
    verse_input: str,
    version: str = "nlt",
    age_bracket: str = "6-8",
    use_cursive: bool = False,
) -> dict:
    verse_input = (verse_input or "").strip()
    if not verse_input:
        raise ValueError("Please enter a verse reference.")

    from build_games import generate_word_search_pdf
    from build_pdf import generate_pdf
    from faithsparks.services.illustrate import create_coloring_sheet

    raw_verse = request_verse_data(verse_input, version=version)
    verse_data = parse_and_clean_json(raw_verse) if raw_verse else {}
    verse_ref = normalize_reference_title(verse_input)
    normalized = normalize_verse_data(verse_data, verse_ref, version)

    if not normalized.get("fullVerse"):
        try:
            normalized["fullVerse"] = fetch_passage_text(normalized["verse"], normalized["version"])
        except Exception:
            normalized["fullVerse"] = ""

    meaning = (request_verse_meaning(normalized["verse"], normalized["fullVerse"], version=normalized["version"]) or "").strip()
    theme_label = _clean_theme_label(
        request_theme_label(f"{normalized['fullVerse']}\n\n{meaning}", context_label="lesson pack"),
        fallback=normalized["title"],
    )
    pack_title = f"{theme_label} Lesson Pack"
    slug = re.sub(r"[^a-z0-9]+", "-", f"{pack_title}-{normalized['verse']}-{normalized['version']}".lower()).strip("-")
    pack_dir = Path("output") / "lesson_packs" / slug
    pack_dir.mkdir(parents=True, exist_ok=True)

    worksheet_pdf = pack_dir / f"{slug}-worksheet.pdf"
    generate_pdf({**normalized, "title": pack_title}, worksheet_pdf, use_cursive=use_cursive)

    coloring_title = f"{theme_label} Coloring Page"
    try:
        coloring_result = create_coloring_sheet(
            user_email=user_email or "anonymous",
            verse_input=normalized["verse"],
            custom_text="",
            title_override=coloring_title,
            age_bracket=age_bracket,
            include_reference=True,
            symbols_only=True,
            historical_props=False,
        )
        coloring_pdf: Path | None = Path("output") / coloring_result["pdf_filename"]
        coloring_png: Path | None = Path("worksheets") / coloring_result["png_filename"]
    except Exception:
        coloring_pdf = None
        coloring_png = None

    word_search_words = _pick_pack_words(theme_label, normalized["title"], normalized["fullVerse"], meaning)
    word_search_pdf = pack_dir / f"{slug}-word-search.pdf"
    generate_word_search_pdf(
        title=f"{theme_label} Word Search",
        words=word_search_words,
        pdf_path=word_search_pdf,
        subtitle=f"{normalized['verse']} • {normalized['version'].upper()}",
        scripture_versions=[normalized["version"].upper()],
    )

    guide_text = _build_parent_guide(
        title=pack_title,
        verse=normalized["verse"],
        version=normalized["version"],
        meaning=meaning,
        age_bracket=age_bracket,
        theme_label=theme_label,
        words=word_search_words,
    )
    guide_txt = pack_dir / f"{slug}-parent-guide.txt"
    guide_txt.write_text(guide_text, encoding="utf-8")

    _coloring_files = [p.name for p in [coloring_pdf, coloring_png] if p]
    manifest = {
        "title": pack_title,
        "theme": theme_label,
        "verse": normalized["verse"],
        "version": normalized["version"],
        "ageBracket": age_bracket,
        "useCursive": bool(use_cursive),
        "files": [worksheet_pdf.name, *_coloring_files, word_search_pdf.name, guide_txt.name],
    }
    manifest_json = pack_dir / f"{slug}-manifest.json"
    manifest_json.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    zip_path = pack_dir / f"{slug}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in [worksheet_pdf, coloring_pdf, coloring_png, word_search_pdf, guide_txt, manifest_json]:
            if path and path.exists():
                zf.write(path, arcname=path.name)

    return {
        "slug": slug,
        "title": pack_title,
        "theme": theme_label,
        "verse": normalized["verse"],
        "version": normalized["version"],
        "age_bracket": age_bracket,
        "meaning": meaning,
        "worksheet_pdf": str(worksheet_pdf),
        "coloring_pdf": str(coloring_pdf) if coloring_pdf else None,
        "coloring_png": str(coloring_png) if coloring_png else None,
        "word_search_pdf": str(word_search_pdf),
        "guide_txt": str(guide_txt),
        "manifest_json": str(manifest_json),
        "zip_path": str(zip_path),
        "word_search_words": word_search_words,
    }
