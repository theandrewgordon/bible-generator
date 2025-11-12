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
- Return JSON only, no explanation

Verse: {verse_ref}
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

# === Request Verse Data ===
def request_verse_data(verse_ref, version="esv"):
    """Request worksheet data from OpenAI, retrying once if needed."""
    prompt = build_prompt(verse_ref, version)
    content = call_openai(prompt)
    if content:
        return content
    print("🔁 Retrying OpenAI call...")
    return call_openai(prompt)

# === JSON Safety Wrapper ===
def parse_and_clean_json(content):
    """Safely parse OpenAI's JSON response."""
    if not content:
        log_ai_parse_failure("", reason="empty response")
        return {}

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
            fixed = json.loads(new_content)
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
        analysis = json.loads(result)
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
    parts = trimmed.split(" ")
    if parts[0].isdigit() and len(parts) > 1:
        lead = parts[0]
        rest = " ".join(parts[1:]).title()
        return f"{lead} {rest}"
    return trimmed.title()


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
