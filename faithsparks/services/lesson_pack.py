from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import zipfile
from html import escape
from pathlib import Path

from firebase_admin import firestore
from faithsparks.services.firestore import db
from faithsparks.services.storage import blob_exists, upload_to_storage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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

LESSON_PACK_VERSIONS = {"nlt", "esv", "kjv", "web"}
LESSON_PACK_AGE_PROFILES = {
    "3-5": {
        "label": "Ages 3-5",
        "minutes": "8-10 minutes",
        "handwriting_lines": 5,
        "word_search_size": 8,
        "word_search_words": 6,
        "word_search_directions": [(1, 0), (0, 1)],
        "difficulty_note": "Gentle level: words go right or down.",
        "reflection": "What is one good thing this verse helps you remember?",
        "memory_help": "Say one short phrase at a time and add a hand motion for each phrase.",
        "activity": "Draw one large symbol from the verse and let your child explain it back to you.",
        "conversation": [
            "What word do you remember?",
            "What does this verse show us about God?",
            "What can we thank God for today?",
        ],
    },
    "6-8": {
        "label": "Ages 6-8",
        "minutes": "10-15 minutes",
        "handwriting_lines": 4,
        "word_search_size": 10,
        "word_search_words": 8,
        "word_search_directions": [(1, 0), (0, 1), (-1, 0), (0, -1)],
        "difficulty_note": "Growing level: words may go forward or backward.",
        "reflection": "What does this verse teach you about God or how to live?",
        "memory_help": "Cover one phrase at a time, repeat it twice, then connect it to the next phrase.",
        "activity": "Make a small reminder card with the reference on one side and a key word on the other.",
        "conversation": [
            "Which word feels most important, and why?",
            "What does this verse tell us about God?",
            "Where could we practice this truth today?",
        ],
    },
    "9-10": {
        "label": "Ages 9-10",
        "minutes": "15-20 minutes",
        "handwriting_lines": 3,
        "word_search_size": 12,
        "word_search_words": 10,
        "word_search_directions": None,
        "difficulty_note": "Challenge level: words may run in any direction.",
        "reflection": "How would you explain the main truth of this verse in your own words?",
        "memory_help": "Write the first letter of each word, then use those letters to recall the whole verse.",
        "activity": "Write a real-life scenario where this verse could guide a choice, response, or prayer.",
        "conversation": [
            "What is the main claim or command in this verse?",
            "What might be difficult about living this out?",
            "How could this change one decision this week?",
        ],
    },
    "10+": {
        "label": "Ages 10+",
        "minutes": "20-25 minutes",
        "handwriting_lines": 2,
        "word_search_size": 14,
        "word_search_words": 12,
        "word_search_directions": None,
        "difficulty_note": "Advanced level: a larger grid with words in any direction.",
        "reflection": "What does this passage reveal, require, or promise, and how should you respond?",
        "memory_help": "Break the verse into thought units, paraphrase each one, then recite the original wording.",
        "activity": "Compare the verse with its surrounding paragraph and write one observation and one application.",
        "conversation": [
            "How does the surrounding passage sharpen the meaning?",
            "Which belief or habit does this verse challenge?",
            "How could you explain this truth to someone else?",
        ],
    },
}
_lesson_pack_build_locks: dict[str, threading.Lock] = {}
_lesson_pack_build_locks_guard = threading.Lock()


def _normalize_lesson_pack_options(version: str, age_bracket: str) -> tuple[str, str]:
    normalized_version = (version or "web").strip().lower()
    normalized_age = (age_bracket or "6-8").strip()
    if normalized_version not in LESSON_PACK_VERSIONS:
        raise ValueError("Choose a supported Bible version.")
    if normalized_age not in LESSON_PACK_AGE_PROFILES:
        raise ValueError("Choose a supported age range.")
    return normalized_version, normalized_age


def _lesson_pack_age_profile(age_bracket: str) -> dict:
    _, normalized_age = _normalize_lesson_pack_options("web", age_bracket)
    return dict(LESSON_PACK_AGE_PROFILES[normalized_age])


def _normalize_lesson_pack_version(version: str) -> str:
    normalized_version, _ = _normalize_lesson_pack_options(version, "6-8")
    return normalized_version


def _lesson_pack_variant_id(age_bracket: str, use_cursive: bool) -> str:
    age_token = age_bracket.replace("+", "-plus").replace(" ", "")
    return f"ages-{age_token}-{'cursive' if use_cursive else 'print'}"


def _lesson_pack_slug(
    pack_title: str,
    verse: str,
    version: str,
    age_bracket: str,
    use_cursive: bool,
) -> str:
    raw_base = f"{pack_title}-{verse}-{version}"
    base = re.sub(r"[^a-z0-9]+", "-", raw_base.lower()).strip("-")[:96].rstrip("-")
    base = base or "lesson-pack"
    variant = _lesson_pack_variant_id(age_bracket, use_cursive)
    digest = hashlib.sha256(f"{raw_base}|{variant}".encode("utf-8")).hexdigest()[:10]
    return f"{base}-{variant}-{digest}"


def _lesson_pack_lock(cache_key: str) -> threading.Lock:
    with _lesson_pack_build_locks_guard:
        return _lesson_pack_build_locks.setdefault(cache_key, threading.Lock())


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


def _clean_meaning_text(raw: str | None, fallback: str) -> str:
    text = (raw or "").strip()
    if not text:
        return fallback
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            text = str(data.get("meaning") or data.get("summary") or data.get("label") or "").strip()
    except Exception:
        pass
    try:
        parsed = parse_and_clean_json(text)
        if isinstance(parsed, dict):
            text = str(parsed.get("meaning") or parsed.get("summary") or parsed.get("label") or text).strip()
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
    profile = _lesson_pack_age_profile(age_bracket)
    big_idea = meaning.strip() or f"Talk about {theme_label.lower()} and how God shows it here."
    prompt_words = ", ".join(words[:4]) if words else theme_label
    days = _parent_guide_days(profile)
    lines = [
        title,
        "",
        f"Verse: {verse} ({version.upper()})",
        f"Age focus: {profile['label']}",
        f"Daily time: {profile['minutes']}",
        "",
        "Big idea:",
        big_idea,
        "",
        "Before you begin:",
        "Gather the printed pack, a pencil, crayons or colored pencils, and a Bible.",
        "",
        "5-day family rhythm:",
        "",
    ]
    for day, focus, activity in days:
        lines.append(f"{day} - {focus}: {activity}")
    lines.extend([
        "",
        "Quick talk prompts:",
        f"- Words to notice: {prompt_words}",
        *[f"- {prompt}" for prompt in profile["conversation"]],
        "",
        "Hands-on connection:",
        profile["activity"],
        "",
        "Memory help:",
        profile["memory_help"],
        "",
        "Prayer prompt:",
        f"Thank God for what this verse teaches about {theme_label.lower()}, and ask for help living it today.",
        "",
        "Print tip:",
        "Use the worksheet first, the coloring page for conversation, and the word search for review.",
    ])
    return "\n".join(lines).strip() + "\n"


def _parent_guide_days(profile: dict) -> list[tuple[str, str, str]]:
    return [
        (
            "Day 1",
            "Read and notice",
            "Read the verse twice. Circle or say one word that stands out.",
        ),
        (
            "Day 2",
            "Copy and understand",
            f"Complete the worksheet and answer: {profile['reflection']}",
        ),
        (
            "Day 3",
            "Create and talk",
            f"Use the coloring page while you discuss the big idea. {profile['activity']}",
        ),
        (
            "Day 4",
            "Practice and play",
            "Complete the word search, then use each found word to retell the verse.",
        ),
        (
            "Day 5",
            "Remember and respond",
            f"Practice the verse using this approach: {profile['memory_help']} "
            "Pray one response together.",
        ),
    ]




def _pdf_page_count(path: Path | None) -> int:
    if not path or not Path(path).exists() or Path(path).stat().st_size <= 0:
        return 0
    try:
        from pypdf import PdfReader
    except Exception:
        return 0
    try:
        return len(PdfReader(str(path)).pages)
    except Exception:
        return 0


def _merge_pdf_files(
    output_path: Path,
    source_paths: list[Path | None],
    *,
    required_paths: list[Path] | None = None,
) -> bool:
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:
        return False

    required_paths = required_paths or []
    if any(_pdf_page_count(path) <= 0 for path in required_paths):
        return False

    writer = PdfWriter()
    added = False
    for source in source_paths:
        if _pdf_page_count(source) <= 0:
            continue
        try:
            reader = PdfReader(str(source))
            for page in reader.pages:
                writer.add_page(page)
            added = True
        except Exception:
            continue
    if not added:
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(".tmp.pdf")
    with open(temporary, 'wb') as fh:
        writer.write(fh)
    if _pdf_page_count(temporary) <= 0:
        temporary.unlink(missing_ok=True)
        return False
    os.replace(temporary, output_path)
    return True


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
    profile = _lesson_pack_age_profile(age_bracket)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "LessonPackTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=23,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#163047"),
        spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "LessonPackSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=11,
        textColor=colors.HexColor("#52606D"),
        alignment=TA_CENTER,
        spaceAfter=4,
    )
    section_style = ParagraphStyle(
        "LessonPackSection",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.2,
        leading=13,
        textColor=colors.HexColor("#1B6B70"),
        spaceBefore=7,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "LessonPackBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11.2,
        textColor=colors.HexColor("#17212B"),
        spaceAfter=3,
    )
    small_style = ParagraphStyle(
        "LessonPackSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.8,
        leading=9.5,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=2,
    )

    def p(text: str) -> Paragraph:
        return Paragraph(escape((text or "").replace("\n", "<br/>")), body_style)

    def bullet(text: str) -> Paragraph:
        return Paragraph(f"&bull;&nbsp; {escape(text)}", body_style)

    big_idea = meaning.strip() or f"Talk about {theme_label.lower()} and how God shows it here."
    prompt_words = ", ".join(words[:4]) if words else theme_label
    days = _parent_guide_days(profile)

    day_rows = [[
        Paragraph("Day", ParagraphStyle("GuideTableHead", parent=body_style, fontName="Helvetica-Bold", textColor=colors.white)),
        Paragraph("Family rhythm", ParagraphStyle("GuideTableHead2", parent=body_style, fontName="Helvetica-Bold", textColor=colors.white)),
    ]]
    for day, focus, activity in days:
        day_rows.append([
            Paragraph(escape(day), ParagraphStyle("GuideDay", parent=body_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#163047"))),
            Paragraph(f"<b>{escape(focus)}</b><br/>{escape(activity)}", body_style),
        ])
    rhythm = Table(day_rows, colWidths=[0.72 * inch, 5.95 * inch], repeatRows=1, hAlign="LEFT")
    rhythm.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B6B70")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F5FAFA")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F5FAFA"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#C8D8DA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    details = Table([
        [Paragraph("AGE", small_style), Paragraph("DAILY TIME", small_style), Paragraph("THEME", small_style)],
        [Paragraph(escape(profile["label"]), body_style), Paragraph(escape(profile["minutes"]), body_style), Paragraph(escape(theme_label), body_style)],
    ], colWidths=[1.35 * inch, 1.55 * inch, 3.77 * inch], hAlign="LEFT")
    details.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF7F7")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C8D8DA")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8E5E6")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    story = [
        Paragraph(escape(title), title_style),
        Paragraph(escape(f"Verse: {verse} ({version.upper()})"), subtitle_style),
        Spacer(1, 0.06 * inch),
        details,
        Spacer(1, 0.08 * inch),
        Paragraph("Big idea", section_style),
        p(big_idea),
        Paragraph("Before you begin", section_style),
        p("Gather the printed pack, a pencil, crayons or colored pencils, and a Bible."),
        Paragraph("5-day family rhythm", section_style),
        rhythm,
        Paragraph("Conversation starters", section_style),
        bullet(f"Words to notice: {prompt_words}"),
        *[bullet(prompt) for prompt in profile["conversation"]],
        Paragraph("Hands-on connection", section_style),
        p(profile["activity"]),
        Paragraph("Memory help", section_style),
        p(profile["memory_help"]),
        Paragraph("Prayer prompt", section_style),
        p(f"Thank God for what this verse teaches about {theme_label.lower()}, and ask for help living it today."),
        Spacer(1, 0.04 * inch),
        Paragraph(escape("Use the worksheet first, the coloring page for conversation, and the word search for review."), small_style),
    ]
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.58 * inch,
        title=title,
        author="Faith Sparks Printables",
    )
    def decorate_page(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#C8D8DA"))
        canvas.setLineWidth(0.65)
        canvas.roundRect(0.42 * inch, 0.42 * inch, 7.66 * inch, 10.16 * inch, 12, fill=0, stroke=1)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(0.62 * inch, 0.28 * inch, "Faith Sparks Family Lesson Guide")
        canvas.drawRightString(7.88 * inch, 0.28 * inch, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate_page, onLaterPages=decorate_page)


LESSON_PACK_CACHE_COLLECTION = "lesson_pack_cache"
LESSON_PACK_OUTPUT_DIR = Path("output") / "lesson_packs"


def _lesson_pack_user_doc_id(user_email: str, slug: str) -> str:
    email_part = re.sub(r"[^a-z0-9]+", "-", (user_email or "anonymous").strip().lower()).strip("-") or "anonymous"
    return f"{email_part}-{slug}"[:1400]


def _record_user_lesson_pack(user_email: str, result: dict, *, mark_created: bool = False) -> None:
    if not (db and result and result.get("slug")):
        return
    email = (user_email or "anonymous").strip().lower() or "anonymous"
    slug = result["slug"]
    payload = {
        "email": email,
        "slug": slug,
        "title": result.get("title") or slug.replace("-", " ").title(),
        "theme": result.get("theme"),
        "verse": result.get("verse"),
        "version": str(result.get("version") or "").upper(),
        "age_bracket": result.get("age_bracket"),
        "use_cursive": bool(result.get("use_cursive") or result.get("useCursive")),
        "pdf_filename": f"{slug}.pdf" if result.get("combined_pdf") or result.get("pdf_path") else None,
        "pdf_path": result.get("combined_pdf") or result.get("pdf_path"),
        "pdf_storage_path": result.get("pdf_storage_path"),
        "zip_filename": f"{slug}.zip",
        "zip_path": result.get("zip_path"),
        "zip_storage_path": result.get("zip_storage_path"),
        "manifest_storage_path": result.get("manifest_storage_path"),
        "components": result.get("components") if isinstance(result.get("components"), dict) else {},
        "status": result.get("status") or "complete",
        "warnings": result.get("warnings") if isinstance(result.get("warnings"), list) else [],
        "cache_key": result.get("cache_key"),
        "type": "lesson_pack",
        "updated_at": firestore.SERVER_TIMESTAMP,
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    if mark_created:
        payload["created_at"] = firestore.SERVER_TIMESTAMP
    try:
        db.collection("lesson_packs").document(_lesson_pack_user_doc_id(email, slug)).set(payload, merge=True)
    except Exception:
        pass


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


def _lesson_pack_storage_path(slug: str, filename: str) -> str:
    return f"lesson_packs/{slug}/{filename}"


def _safe_cached_pack_path(raw_path: str | None, slug: str, suffix: str) -> Path | None:
    if not raw_path:
        return None
    candidate = Path(raw_path)
    if candidate.suffix.lower() != suffix:
        return None
    try:
        base = LESSON_PACK_OUTPUT_DIR.resolve()
        resolved = candidate.resolve()
        expected_dir = (LESSON_PACK_OUTPUT_DIR / slug).resolve()
        if base not in resolved.parents or expected_dir not in resolved.parents:
            return None
    except Exception:
        return None
    return candidate if candidate.exists() else None


def _cached_lesson_pack_has_artifact(cached_pack: dict) -> bool:
    slug = cached_pack.get("slug")
    if not slug or not re.fullmatch(r"[a-z0-9\-]+", slug):
        return False
    if cached_pack.get("status") == "partial":
        return False
    components = cached_pack.get("components")
    if isinstance(components, dict) and not all(
        components.get(name) for name in ("worksheet", "coloring", "word_search", "parent_guide")
    ):
        return False
    pdf_path = _safe_cached_pack_path(cached_pack.get("combined_pdf") or cached_pack.get("pdf_path"), slug, ".pdf")
    zip_path = _safe_cached_pack_path(cached_pack.get("zip_path"), slug, ".zip")
    fallback_pdf = LESSON_PACK_OUTPUT_DIR / slug / f"{slug}.pdf"
    fallback_zip = LESSON_PACK_OUTPUT_DIR / slug / f"{slug}.zip"
    if pdf_path or zip_path or fallback_pdf.exists() or fallback_zip.exists():
        return True
    storage_paths = [
        cached_pack.get("pdf_storage_path") or _lesson_pack_storage_path(slug, f"{slug}.pdf"),
        cached_pack.get("zip_storage_path") or _lesson_pack_storage_path(slug, f"{slug}.zip"),
    ]
    return any(blob_exists(path) for path in storage_paths if path)


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
    version = _normalize_lesson_pack_version(version)
    profile = _lesson_pack_age_profile(age_bracket)
    use_cursive = bool(use_cursive)

    raw_verse = request_verse_data(verse_input, version=version)
    verse_data = parse_and_clean_json(raw_verse) if raw_verse else {}
    verse_ref = normalize_reference_title(verse_input)
    normalized = normalize_verse_data(verse_data, verse_ref, version)
    normalized["version"] = version
    if not normalized.get("fullVerse"):
        try:
            normalized["fullVerse"] = fetch_passage_text(normalized["verse"], version)
        except Exception:
            normalized["fullVerse"] = ""
    if not str(normalized.get("fullVerse") or "").strip():
        raise ValueError("We could not find Scripture text for that reference and version.")

    cache_key = _lesson_pack_cache_key(normalized["verse"], version, age_bracket, use_cursive)
    cached_pack = _load_cached_lesson_pack(cache_key)
    if cached_pack and _cached_lesson_pack_has_artifact(cached_pack):
        _record_user_lesson_pack(user_email, cached_pack)
        return cached_pack

    with _lesson_pack_lock(cache_key):
        cached_pack = _load_cached_lesson_pack(cache_key)
        if cached_pack and _cached_lesson_pack_has_artifact(cached_pack):
            _record_user_lesson_pack(user_email, cached_pack)
            return cached_pack
        return _build_lesson_pack_artifacts(
            user_email=user_email,
            normalized=normalized,
            age_bracket=age_bracket,
            use_cursive=use_cursive,
            profile=profile,
            cache_key=cache_key,
        )


def _build_lesson_pack_artifacts(
    *,
    user_email: str,
    normalized: dict,
    age_bracket: str,
    use_cursive: bool,
    profile: dict,
    cache_key: str,
) -> dict:
    from build_games import generate_word_search_pdf
    from build_pdf import generate_pdf
    from faithsparks.services.illustrate import create_coloring_sheet

    meaning = _clean_meaning_text(
        request_verse_meaning(normalized["verse"], normalized["fullVerse"], version=normalized["version"]),
        fallback=f"Talk about {normalized['title'].lower()} and how God shows it here.",
    )
    theme_label = _clean_theme_label(
        request_theme_label(f"{normalized['fullVerse']}\n\n{meaning}", context_label="lesson pack"),
        fallback=normalized["title"],
    )
    pack_title = f"{theme_label} Lesson Pack"
    slug = _lesson_pack_slug(
        pack_title, normalized["verse"], normalized["version"], age_bracket, use_cursive
    )
    pack_dir = LESSON_PACK_OUTPUT_DIR / slug
    pack_dir.mkdir(parents=True, exist_ok=True)

    worksheet_pdf = pack_dir / f"{slug}-worksheet.pdf"
    worksheet_payload = {
        **normalized,
        "title": pack_title,
        "handwritingLines": profile["handwriting_lines"],
        "reflectionQuestion": profile["reflection"],
        "traceableVerse": normalized.get("traceableVerse") or normalized["fullVerse"],
        "imageIdea": normalized.get("imageIdea") or f"Draw a picture that reminds you of {theme_label.lower()}.",
    }
    generate_pdf(worksheet_payload, worksheet_pdf, use_cursive=use_cursive)
    if _pdf_page_count(worksheet_pdf) <= 0:
        raise RuntimeError("The worksheet PDF could not be verified.")

    coloring_title = f"{theme_label} Coloring Page"
    warnings: list[str] = []
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
        if _pdf_page_count(coloring_pdf) <= 0:
            coloring_pdf = None
            coloring_png = None
            warnings.append("The coloring page could not be verified and was left out of this pack.")
    except Exception:
        coloring_pdf = None
        coloring_png = None
        warnings.append("The coloring page was temporarily unavailable and was left out of this pack.")

    word_search_words = _pick_pack_words(
        theme_label,
        normalized["title"],
        normalized["fullVerse"],
        meaning,
        minimum=min(6, profile["word_search_words"]),
        maximum=profile["word_search_words"],
    )
    word_search_pdf = pack_dir / f"{slug}-word-search.pdf"
    generate_word_search_pdf(
        title=f"{theme_label} Word Search",
        words=word_search_words,
        pdf_path=word_search_pdf,
        size=profile["word_search_size"],
        subtitle=f"{normalized['verse']} - {normalized['version'].upper()}",
        difficulty_note=profile["difficulty_note"],
        allowed_directions=profile["word_search_directions"],
        scripture_versions=[normalized["version"].upper()],
    )
    if _pdf_page_count(word_search_pdf) <= 0:
        raise RuntimeError("The word-search PDF could not be verified.")

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
    if _pdf_page_count(guide_pdf) <= 0:
        raise RuntimeError("The parent-guide PDF could not be verified.")

    components = {
        "worksheet": True,
        "coloring": bool(coloring_pdf),
        "word_search": True,
        "parent_guide": True,
    }
    status = "complete" if all(components.values()) else "partial"
    generated_files = [worksheet_pdf.name]
    if coloring_pdf:
        generated_files.append(coloring_pdf.name)
    generated_files.extend([word_search_pdf.name, guide_pdf.name])
    manifest = {
        "schemaVersion": 2,
        "slug": slug,
        "title": pack_title,
        "theme": theme_label,
        "verse": normalized["verse"],
        "version": normalized["version"],
        "ageBracket": age_bracket,
        "useCursive": bool(use_cursive),
        "status": status,
        "components": components,
        "warnings": warnings,
        "files": generated_files,
    }
    manifest_json = pack_dir / f"{slug}-manifest.json"
    manifest_tmp = manifest_json.with_suffix(".tmp.json")
    manifest_tmp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    os.replace(manifest_tmp, manifest_json)

    combined_pdf = pack_dir / f"{slug}.pdf"
    combined_ok = _merge_pdf_files(
        combined_pdf,
        [worksheet_pdf, coloring_pdf, word_search_pdf, guide_pdf],
        required_paths=[worksheet_pdf, word_search_pdf, guide_pdf],
    )
    components["combined_pdf"] = combined_ok
    manifest["components"] = components
    manifest["files"] = [*generated_files, *([combined_pdf.name] if combined_ok else [])]
    manifest_tmp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    os.replace(manifest_tmp, manifest_json)

    zip_path = pack_dir / f"{slug}.zip"
    zip_tmp = zip_path.with_suffix(".tmp.zip")
    with zipfile.ZipFile(zip_tmp, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in [worksheet_pdf, coloring_pdf, word_search_pdf, guide_pdf, combined_pdf if combined_ok else None, manifest_json]:
            if path and path.exists():
                zf.write(path, arcname=path.name)
    os.replace(zip_tmp, zip_path)

    pdf_storage_path = _lesson_pack_storage_path(slug, f"{slug}.pdf") if combined_ok else None
    zip_storage_path = _lesson_pack_storage_path(slug, f"{slug}.zip")
    manifest_storage_path = _lesson_pack_storage_path(slug, manifest_json.name)
    if combined_ok:
        upload_to_storage(str(combined_pdf), pdf_storage_path)
    upload_to_storage(str(zip_path), zip_storage_path)
    upload_to_storage(str(manifest_json), manifest_storage_path)

    result = {
        "slug": slug,
        "title": pack_title,
        "theme": theme_label,
        "verse": normalized["verse"],
        "version": normalized["version"],
        "age_bracket": age_bracket,
        "use_cursive": bool(use_cursive),
        "meaning": meaning,
        "worksheet_pdf": str(worksheet_pdf),
        "coloring_pdf": str(coloring_pdf) if coloring_pdf else None,
        "coloring_png": str(coloring_png) if coloring_png else None,
        "word_search_pdf": str(word_search_pdf),
        "guide_pdf": str(guide_pdf),
        "manifest_json": str(manifest_json),
        "combined_pdf": str(combined_pdf) if combined_ok else None,
        "pdf_storage_path": pdf_storage_path,
        "zip_path": str(zip_path),
        "zip_storage_path": zip_storage_path,
        "manifest_storage_path": manifest_storage_path,
        "components": components,
        "status": status,
        "warnings": warnings,
        "word_search_words": word_search_words,
        "cache_key": cache_key,
    }

    if db:
        _record_user_lesson_pack(user_email, result, mark_created=True)
        if status == "complete":
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
