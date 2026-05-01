from __future__ import annotations

import json
import re
import zipfile
from html import escape
from pathlib import Path

from firebase_admin import firestore
from faithsparks.services.firestore import db
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

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
    prompt_words = ", ".join(words[:4]) if words else theme_label
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
        "Day 1 — Read it together and circle one key word.",
        "Day 2 — Ask: What does this tell us about God?",
        "Day 3 — Pray the verse back in your own words.",
        "Day 4 — Do one small action that fits the verse.",
        "Day 5 — Recite it and pick a favorite page.",
        "",
        "Quick talk prompts:",
        f"- Words to notice: {prompt_words}",
        "- How would you explain this to a friend?",
        "- What can we do today that fits this verse?",
        "",
        "Print tip:",
        "Use the worksheet first, then the coloring page, then the word search as a review.",
    ]
    return "\\n".join(lines).strip() + "\\n"


def _write_parent_guide_pdf(
    pdf_path: Path,
    *,
    title: str,
    verse: str,
    version: str,
    meaning: str,
    age_bracket: str,
    theme_label: str,
    words: list[str],
) -> None:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "LessonPackTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "LessonPackSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12,
        textColor="#4B5563",
        spaceAfter=6,
    )
    section_style = ParagraphStyle(
        "LessonPackSection",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14,
        textColor="#111827",
        spaceBefore=6,
        spaceAfter=3,
    )
    body_style = ParagraphStyle(
        "LessonPackBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=11.3,
        spaceAfter=4,
    )
    small_style = ParagraphStyle(
        "LessonPackSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.1,
        leading=10,
        textColor="#6B7280",
        spaceAfter=3,
    )

    def p(text: str) -> Paragraph:
        return Paragraph(escape((text or "").replace("\n", "<br/>")), body_style)

    def bullet(text: str) -> Paragraph:
        return Paragraph(f"&bull; {escape(text)}", body_style)

    big_idea = meaning.strip() or f"Talk about {theme_label.lower()} and how God shows it here."
    prompt_words = ", ".join(words[:4]) if words else theme_label

    story = [
        Paragraph(escape(title), title_style),
        Paragraph(escape(f"Verse: {verse} ({version.upper()})"), subtitle_style),
        Paragraph(escape(f"Age focus: {age_bracket or 'mixed ages'}"), subtitle_style),
        Spacer(1, 0.12 * inch),
        Paragraph("Big idea", section_style),
        p(big_idea),
        Paragraph("5-day mini plan", section_style),
        bullet("Day 1 — Read it and circle one key word."),
        bullet("Day 2 — What does this tell us about God?"),
        bullet("Day 3 — Pray the verse in your own words."),
        bullet("Day 4 — Do one small thing that fits the verse."),
        bullet("Day 5 — Recite it and choose a favorite page."),
        Paragraph("Quick talk prompts", section_style),
        bullet(f"Words to notice: {prompt_words}"),
        bullet("How would you say this in one sentence?"),
        Paragraph("Print tip", section_style),
        p("Use the worksheet, then the coloring page, then the word search."),
        Spacer(1, 0.08 * inch),
        Paragraph(escape("Built for easy parent-led use."), small_style),
    ]
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title=title,
        author="Faith Sparks Printables",
    )
    doc.build(story)


LESSON_PACK_CACHE_COLLECTION = "lesson_pack_cache"


def _lesson_pack_cache_key(verse: str, version: str, age_bracket: str, use_cursive: bool) -> str:
    raw = f"{verse}-{(version or 'nlt').strip().lower()}-{(age_bracket or '').strip().lower()}-{'cursive' if use_cursive else 'print'}"
    return re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")


def _load_cached_lesson_pack(cache_key: str) -> dict | None:
    if not (db and cache_key and LESSON_PACK_CACHE_COLLECTION):
        return None
    try:
        snap = db.collection(LESSON_PACK_CACHE_COLLECTION).document(cache_key).get()
    except Exception:
        return None
    if not snap or not snap.exists:
        return None
    data = snap.to_dict() or {}
    return data if isinstance(data, dict) else None


def _store_cached_lesson_pack(cache_key: str, payload: dict) -> None:
    if not (db and cache_key and LESSON_PACK_CACHE_COLLECTION and payload):
        return
    try:
        db.collection(LESSON_PACK_CACHE_COLLECTION).document(cache_key).set(payload, merge=True)
    except Exception:
        pass


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

    cache_key = _lesson_pack_cache_key(normalized["verse"], normalized["version"], age_bracket, use_cursive)
    cached_pack = _load_cached_lesson_pack(cache_key)
    if cached_pack:
        cached_zip = Path(cached_pack.get("zip_path") or "")
        if not cached_zip and cached_pack.get("slug"):
            cached_zip = Path("output") / "lesson_packs" / cached_pack["slug"] / f"{cached_pack['slug']}.zip"
        if cached_zip.exists():
            return cached_pack

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

    guide_pdf = pack_dir / f"{slug}-parent-guide.pdf"
    _write_parent_guide_pdf(
        guide_pdf,
        title=pack_title,
        verse=normalized["verse"],
        version=normalized["version"],
        meaning=meaning,
        age_bracket=age_bracket,
        theme_label=theme_label,
        words=word_search_words,
    )

    _coloring_files = [p.name for p in [coloring_pdf] if p]
    manifest = {
        "title": pack_title,
        "theme": theme_label,
        "verse": normalized["verse"],
        "version": normalized["version"],
        "ageBracket": age_bracket,
        "useCursive": bool(use_cursive),
        "files": [worksheet_pdf.name, *_coloring_files, word_search_pdf.name, guide_pdf.name],
    }
    manifest_json = pack_dir / f"{slug}-manifest.json"
    manifest_json.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    zip_path = pack_dir / f"{slug}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in [worksheet_pdf, coloring_pdf, word_search_pdf, guide_pdf]:
            if path and path.exists():
                zf.write(path, arcname=path.name)

    result = {
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
        "guide_pdf": str(guide_pdf),
        "manifest_json": str(manifest_json),
        "zip_path": str(zip_path),
        "word_search_words": word_search_words,
        "cache_key": cache_key,
    }

    if db:
        try:
            db.collection("lesson_packs").document(slug).set(
                {
                    "email": user_email or "anonymous",
                    "slug": slug,
                    "title": pack_title,
                    "theme": theme_label,
                    "verse": normalized["verse"],
                    "version": normalized["version"].upper(),
                    "age_bracket": age_bracket,
                    "use_cursive": bool(use_cursive),
                    "zip_filename": f"{slug}.zip",
                    "zip_path": str(zip_path),
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "type": "lesson_pack",
                },
                merge=True,
            )
        except Exception:
            pass

        _store_cached_lesson_pack(
            cache_key,
            {
                **result,
                "cache_key": cache_key,
                "zip_filename": f"{slug}.zip",
                "created_at": firestore.SERVER_TIMESTAMP,
                "timestamp": firestore.SERVER_TIMESTAMP,
                "type": "lesson_pack",
            },
        )

    return result
