import os
import json
import re
from typing import Iterable, List, Tuple

import httpx
from dotenv import load_dotenv
from openai import OpenAI

from faithsparks.util.request_utils import (
    extract_json_candidate,
    log_ai_parse_failure,
    log_ai_parse_recovery,
)

# --- Load API Key ---
load_dotenv("secret.env")
CLIENT_TIMEOUT = httpx.Timeout(connect=5.0, read=25.0, write=25.0, pool=None)
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    organization=os.getenv("OPENAI_ORG_ID"),
    timeout=CLIENT_TIMEOUT,
)


def get_openai_client() -> OpenAI:
    """Expose the shared OpenAI client to other modules."""
    return client


def strip_fences(text: str) -> str:
    """Remove leading/trailing ```json fences that some models add."""
    if not text:
        return text
    trimmed = text.strip()
    # Handle responses that start with a bare "json" line.
    trimmed = re.sub(r"^json\s*", "", trimmed, flags=re.IGNORECASE)
    if trimmed.startswith("```"):
        parts = trimmed.split("```", 2)
        if len(parts) >= 3:
            trimmed = parts[1] if parts[1] else parts[2]
            trimmed = trimmed.strip()
    # Collapse JS-style string concatenation into valid JSON strings.
    trimmed = re.sub(r"\"\s*\+\s*\n\s*\"", "", trimmed)
    if trimmed.startswith("{") or trimmed.startswith("["):
        return trimmed
    return trimmed

# === Slug & Normalization ===
def normalize_slug(verse_ref):
    """Convert verse reference to filesystem-safe slug."""
    return (
        verse_ref.lower()
        .replace(":", "_")
        .replace("–", "_")
        .replace("—", "_")
        .replace(" ", "_")
    )

# === Prompt Construction ===
def build_prompt(verse_ref, version):
    """Generate OpenAI prompt to build worksheet JSON."""
    return [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {"role": "user", "content": f"""
Return valid JSON with:
- "title": a short display title for the worksheet, using the normalized verse reference.
- "verse": the reference
- "fullVerse": full Bible verse from the {version.upper()} version (no reference, capitalize first letter, full sentence).
- "traceableVerse": If fullVerse has 26 words or fewer, return it exactly. If longer, return the most important self-contained 27-word-or-less excerpt that preserves the spiritual message.
- "handwritingLines": 3
- "reflectionQuestion": one simple life-application question
- "imageIdea": coloring prompt based on the verse
- "version": "{version.lower()}"

Rules:
- Capitalize pronouns for God/Jesus (He, His, etc.)
- Use Unicode quotes for internal quotes: “ ” and ‘ ’
- No ASCII straight quotes, no quotes around whole verse
- No extra spaces before punctuation
- If the verse reference ends with a letter suffix (e.g., "a" or "b"), return ONLY that portion:
  - "a" = the first clause/segment; stop before the natural break.
  - "b" = the remaining clause/segment after that break.
- Return JSON only, no explanation

Verse: {verse_ref}
"""}
    ]


def build_meaning_prompt(verse_ref, full_verse, version, min_words: int = 6, max_words: int = 10):
    """Generate OpenAI prompt to summarize a verse meaning for matching games."""
    return [
        {"role": "system", "content": "You help Christian homeschoolers create Bible games."},
        {"role": "user", "content": f"""
Return valid JSON with:
- "meaning": a kid-friendly, plain-English meaning of the verse ({min_words}–{max_words} words).

Rules:
- Do not quote the verse.
- No Bible references.
- Use simple, present-tense phrasing.
- No quotes around the meaning.
- Return JSON only.

Verse reference: {verse_ref}
Verse text ({version.upper()}): {full_verse}
"""}
    ]


def build_theme_prompt(source_text, context_label: str = "verse"):
    """Generate OpenAI prompt for a short topic label."""
    return [
        {"role": "system", "content": "You help Christian homeschoolers create Bible games."},
        {"role": "user", "content": f"""
Return valid JSON with:
- "theme": a 1–3 word topic label in Title Case.

Rules:
- Keep it kid-friendly and simple.
- No punctuation, no quotes, no Bible references.
- Return JSON only.

Context ({context_label}):
{source_text}
"""}
    ]
# === GPT Call Wrapper ===
def call_openai(prompt):
    """Call OpenAI API with a given prompt."""
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=prompt
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"⚠️ OpenAI error: {e}")
        return None


def normalize_verse_data(data, verse_ref: str, version: str):
    """Fill in required worksheet fields without mutating saved raw values."""
    normalized = dict(data or {})
    verse_ref = normalize_reference_title(verse_ref)
    normalized["verse"] = preserve_letter_suffix(verse_ref, normalized.get("verse") or verse_ref)
    normalized["version"] = (normalized.get("version") or version or "esv").strip().lower()
    normalized["title"] = (normalized.get("title") or normalize_reference_title(normalized["verse"])).strip()
    normalized["fullVerse"] = (normalized.get("fullVerse") or "").strip()
    normalized["traceableVerse"] = (normalized.get("traceableVerse") or normalized["fullVerse"]).strip()
    normalized["handwritingLines"] = int(normalized.get("handwritingLines") or 3)
    normalized["reflectionQuestion"] = (normalized.get("reflectionQuestion") or "Why is this meaningful to you?").strip()
    normalized["imageIdea"] = (normalized.get("imageIdea") or "An open Bible or prayer hands").strip()
    return normalized


# === Request Verse Data ===
def request_verse_data(verse_ref, version="esv"):
    """Request worksheet data from OpenAI, retrying once if needed."""
    prompt = build_prompt(verse_ref, version)

    for attempt in range(2):
        content = call_openai(prompt)
        if not content:
            continue
        data = parse_and_clean_json(content)
        if data:
            return json.dumps(normalize_verse_data(data, verse_ref, version), ensure_ascii=False)

    return None


def request_verse_meaning(verse_ref, full_verse, version="esv", min_words: int = 6, max_words: int = 10):
    """Request a short meaning summary for a verse."""
    prompt = build_meaning_prompt(verse_ref, full_verse, version, min_words=min_words, max_words=max_words)
    content = call_openai(prompt)
    if content:
        return content
    print("🔁 Retrying OpenAI meaning call...")
    return call_openai(prompt)


def request_theme_label(source_text, context_label: str = "verse"):
    """Request a short theme label from OpenAI."""
    prompt = build_theme_prompt(source_text, context_label=context_label)
    content = call_openai(prompt)
    if content:
        return content
    print("🔁 Retrying OpenAI theme call...")
    return call_openai(prompt)


def build_crossword_clues_prompt(words: list[str], theme: str | None = None):
    """Generate OpenAI prompt for short crossword clues."""
    theme_text = f"Theme: {theme}\n" if theme else ""
    return [
        {"role": "system", "content": "You help Christian homeschoolers create Bible games."},
        {"role": "user", "content": f"""
Return valid JSON with:
- "clues": an array of objects with "word" and "clue".

Rules:
- Use the exact words provided.
- Clues should be 3–7 words, kid-friendly, and specific.
- Each clue should give a simple meaning or synonym for the word.
- If a theme is provided, make clues feel on-theme.
- Do not include the answer word or close variants in the clue.
- Avoid generic filler like "Bible word", "God's word", or "a Bible word".
- No Bible references in the clues.
- Return JSON only (no markdown, no "json" prefix).

{theme_text}Words:
{", ".join(words)}
"""}
    ]


def request_crossword_clues(words: list[str], theme: str | None = None):
    """Request short clue lines for a list of words."""
    if not words:
        return None
    prompt = build_crossword_clues_prompt(words, theme=theme)
    content = call_openai(prompt)
    if content:
        return content
    print("🔁 Retrying OpenAI crossword clue call...")
    return call_openai(prompt)

# === JSON Safety Wrapper ===
def parse_and_clean_json(content):
    """Safely parse OpenAI's JSON response."""
    if not content:
        log_ai_parse_failure("", reason="empty response")
        return {}

    content = strip_fences(content)
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        log_ai_parse_failure(content, reason=str(exc))
        candidate = extract_json_candidate(content)
        if candidate is not None:
            log_ai_parse_recovery()
            return candidate
        return {}

# === Retry Shortening for Long Traceable Verses ===
def retry_traceable_fix(data):
    """Retry GPT if traceableVerse is longer than 26 words."""
    trace = data.get("traceableVerse", "")
    if len(trace.split()) <= 26:
        return data

    retry_prompt = [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {"role": "user", "content": f"""
Your previous traceableVerse was too long. Return new JSON with a shorter traceableVerse (<=26 words) while preserving meaning.

Original verse: {data.get("fullVerse", "")}

Only return updated JSON, and keep the original fullVerse as-is.
"""}
    ]
    new_content = call_openai(retry_prompt)
    if new_content:
        try:
            fixed = json.loads(strip_fences(new_content))
            data["traceableVerse"] = fixed.get("traceableVerse", data["traceableVerse"])
        except Exception as e:
            print(f"⚠️ Retry fix parse failed: {e}")
    return data

# === Save Locally ===
def save_json_to_file(data, path):
    """Save worksheet data to a local file."""
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"⚠️ Could not save JSON to {path}: {e}")

# === Custom Text Filtering ===
def ai_validate_custom_text(text):
    """Use GPT to check if custom content is safe and scripture-like."""
    prompt = [
        {"role": "system", "content": "You review religious education content for safety and accuracy."},
        {"role": "user", "content": f"""
Analyze the following custom text for appropriateness in a Christian children's worksheet.

1. Flag if it includes profanity, crude, or lewd content.
2. Evaluate if it resembles a Bible verse (even if paraphrased from a modern version).
3. Return JSON with:
  - "safe": true/false
  - "isScriptureLike": true/false
  - "reason": short explanation

Text: {text}
"""}
    ]
    result = call_openai(prompt)
    try:
        analysis = json.loads(strip_fences(result))
        return analysis.get("safe", False) and analysis.get("isScriptureLike", False)
    except Exception as e:
        print(f"⚠️ Custom validation failed: {e}")
        return False


def parse_reference_list(raw: str) -> List[str]:
    """Split a blob of references on commas/newlines and normalize whitespace."""
    if not raw:
        return []
    refs = re.split(r"[,;\n]+", raw)
    cleaned: List[str] = []
    for ref in refs:
        fixed = " ".join(ref.split())
        if fixed:
            cleaned.append(fixed)
    return cleaned


def normalize_reference_title(ref: str) -> str:
    """Best-effort title-casing that keeps leading numerals (e.g., '1 John')."""
    if not ref:
        return ""
    trimmed = " ".join(ref.split())
    if not trimmed:
        return ""
    # Title-case the book name but leave the verse portion untouched so suffixes
    # like "18a" or "18b" stay lowercase.
    parts = re.search(r"\s\d", trimmed)
    if parts:
        book = trimmed[: parts.start()].strip()
        verse_part = trimmed[parts.start() :].strip()
    else:
        book = trimmed
        verse_part = ""

    book_words = book.split(" ")
    if book_words and book_words[0].isdigit() and len(book_words) > 1:
        book_title = f"{book_words[0]} {' '.join(book_words[1:]).title()}"
    else:
        book_title = book.title()

    if verse_part:
        return f"{book_title} {verse_part}".strip()
    return book_title


def preserve_letter_suffix(original_ref: str, candidate_ref: str) -> str:
    """Ensure a/b suffix from the original ref is kept on the candidate reference."""
    orig = (original_ref or "").strip()
    cand = (candidate_ref or "").strip()
    letter_match = re.search(r":\d+([a-z])\b", orig.lower())
    if not letter_match:
        return normalize_reference_title(cand)

    letter = letter_match.group(1)
    if re.search(r":\d+[a-z]\b", cand.lower()):
        return normalize_reference_title(cand)

    if re.search(r":\d+\b", cand):
        fixed = re.sub(r"(:\d+)\b", rf"\1{letter}", cand, count=1)
        return normalize_reference_title(fixed)

    return normalize_reference_title(orig)


def split_version_from_reference(text: str, fallback_version: str = "kjv") -> Tuple[str, str]:
    """Return (version, reference) honoring inline tags like `(KJV)`."""
    fallback = (fallback_version or "kjv").strip().lower() or "kjv"
    match = re.search(r"\(([A-Za-z0-9]{2,12})\)\s*$", text or "")
    if match:
        version = match.group(1).lower()
        verse = (text or "")[: match.start()].strip()
    else:
        version = fallback
        verse = (text or "").strip()
    return version, normalize_reference_title(verse)


def fetch_passage_text(reference: str, version: str = "kjv") -> dict:
    """Fetch full verse text via the existing worksheet helper."""
    content = request_verse_data(reference, version.lower())
    data = parse_and_clean_json(content) if content else {}
    full = (data or {}).get("fullVerse")
    if not full:
        raise ValueError(f"Verse text missing for {reference} ({version})")
    canonical = normalize_reference_title(data.get("verse") or reference)
    return {
        "reference": canonical,
        "text": full.strip(),
        "version": version.upper(),
    }


def moderate_text_block(text: str) -> dict:
    """Run OpenAI moderation; returns {flagged: bool, categories: {...}}."""
    cleaned = (text or "").strip()
    if not cleaned:
        return {"flagged": False, "categories": {}}
    try:
        model = os.getenv("ILLUSTRATE_MODERATION_MODEL", "omni-moderation-latest")
        resp = client.moderations.create(model=model, input=cleaned[:2000])
        result = resp.results[0]
        return {
            "flagged": bool(getattr(result, "flagged", False)),
            "categories": getattr(result, "categories", {}) or {},
        }
    except Exception as exc:
        print(f"⚠️ Moderation failed: {exc}")
        return {"flagged": True, "categories": {"error": True}}
