"""ESV/NLT text when no licensed API key is configured: AI-quoted, then checked.

The AI (gpt-4o by default) is asked to quote the verse exactly. The quote is
then cross-checked against the same reference in two public-domain
translations (WEB and KJV) fetched from bible-api.com:

* content-word overlap with WEB or KJV must reach ``MIN_OVERLAP``. Correct
  ESV/NLT verses score about 0.5-1.0; a wrong or neighbouring verse scores
  about 0-0.2.
* the word count must be 60-170% of WEB's, which catches half verses and
  extra verses.

This catches wrong references, missing or extra verses, and invented text.
It cannot prove every word is exact; a licensed key always takes priority.
Checked quotes are cached (memory and Firestore), so each verse costs one
AI call ever. Turn the whole path off with ``SCRIPTURE_AI_CHECKED=0``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone

from faithsparks.services.ai_budget import UNITS, ai_budget_ok
from faithsparks.services.firestore import db

log = logging.getLogger(__name__)

CHECKED_VERSIONS = {"esv": "ESV", "nlt": "NLT"}
MIN_OVERLAP = 0.45
MIN_LENGTH_RATIO, MAX_LENGTH_RATIO = 0.6, 1.7
CACHE_COLLECTION = "scripture_checked"
_memory: dict[tuple[str, str], str] = {}

_STOP = set(
    "a an the and or but of to in on at by for from with as is are was were be been being it its this that "
    "these those he him his she her they them their we us our you your i me my not no so then than there here "
    "which who whom what when where all shall will would should may might can could do does did has have had "
    "into upon unto also even o oh".split()
)
_ARCHAIC = {
    "thee": "you", "thou": "you", "thy": "your", "thine": "your", "ye": "you", "hath": "has",
    "doth": "does", "art": "are", "shalt": "shall", "wilt": "will", "saith": "says",
}


def enabled() -> bool:
    return os.getenv("SCRIPTURE_AI_CHECKED", "1").strip().lower() not in {"0", "false", "no", "off"}


def _content_words(text: str) -> set[str]:
    words = set()
    for word in re.findall(r"[a-z]+", (text or "").lower()):
        word = _ARCHAIC.get(word, word)
        if word in _STOP:
            continue
        for suffix in ("eth", "est", "ing", "ed", "es", "s"):
            if len(word) > 4 and word.endswith(suffix):
                word = word[: -len(suffix)]
                break
        words.add(word)
    return words


def _word_count(text: str) -> int:
    return len(re.findall(r"\w+", text or ""))


def cross_check(quote: str, web: str | None, kjv: str | None) -> tuple[bool, float]:
    """Return (passes, overlap) for an AI quote against public-domain text."""
    references = [text for text in (web, kjv) if text]
    if not quote or not references:
        return False, 0.0
    quoted = _content_words(quote)
    overlap = 0.0
    for text in references:
        expected = _content_words(text)
        if expected:
            overlap = max(overlap, len(quoted & expected) / len(expected))
    ratio = _word_count(quote) / max(1, _word_count(references[0]))
    return overlap >= MIN_OVERLAP and MIN_LENGTH_RATIO <= ratio <= MAX_LENGTH_RATIO, overlap


def _cache_id(reference: str, version: str) -> str:
    return hashlib.sha256(f"{reference.lower()}|{version}".encode()).hexdigest()[:40]


def _cached(reference: str, version: str) -> str | None:
    key = (reference.lower(), version)
    if key in _memory:
        return _memory[key]
    if not db:
        return None
    try:
        snap = db.collection(CACHE_COLLECTION).document(_cache_id(reference, version)).get()
        text = (snap.to_dict() or {}).get("text") if snap.exists else None
    except Exception:
        log.warning("scripture_checked cache read failed", exc_info=True)
        return None
    if text:
        _memory[key] = text
    return text or None


def _store(reference: str, version: str, text: str, overlap: float, model: str) -> None:
    _memory[(reference.lower(), version)] = text
    if not db:
        return
    try:
        db.collection(CACHE_COLLECTION).document(_cache_id(reference, version)).set({
            "reference": reference, "version": version, "text": text, "overlap": round(overlap, 3),
            "model": model, "checkedAt": datetime.now(timezone.utc),
        })
    except Exception:
        log.warning("scripture_checked cache write failed", exc_info=True)


_WRAPPING_QUOTES = (('"', '"'), ("“", "”"))


def _clean_quote(text: str) -> str:
    """Tidy an AI quote without changing Scripture's own punctuation.

    Only a matched pair of quotation marks wrapping the whole reply is removed;
    a lone opening mark (ESV John 3:16 begins “For God so loved…) is the text's own.
    """
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    for opening, closing in _WRAPPING_QUOTES:
        inner = text[len(opening):-len(closing)] if len(text) > 1 else ""
        if text.startswith(opening) and text.endswith(closing) and opening not in inner and closing not in inner:
            text = inner.strip()
            break
    return re.sub(r"^\d{1,3}\s+", "", text)  # a leading verse number


def _ask_ai(reference: str, code: str) -> tuple[str, str]:
    from verse_helpers import get_openai_client

    model = os.getenv("SCRIPTURE_AI_MODEL", "gpt-4o")
    response = get_openai_client().chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=800,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You quote published Bible translations exactly, word for word."},
            {"role": "user", "content": (
                f"Quote {reference} in the {code} exactly as published. Verse text only: no verse numbers, "
                f"headings, footnotes or quotation marks around it. If you are not certain of the exact {code} "
                'wording, return an empty string. Reply as JSON: {"text": "..."}'
            )},
        ],
    )
    payload = json.loads(response.choices[0].message.content or "{}")
    return str(payload.get("text") or "") if isinstance(payload, dict) else "", model


def fetch_checked_text(reference: str, version: str) -> str | None:
    """Checked AI quote for ESV/NLT, or None (fail closed). Never raises."""
    version = (version or "").strip().lower()
    code = CHECKED_VERSIONS.get(version)
    from faithsparks.services.scripture import lookup_reference

    reference = lookup_reference(reference)  # same cache key and lookup for "1–9" and "1-9"
    if not code or not reference or not enabled():
        return None
    cached = _cached(reference, version)
    if cached:
        return cached
    verse_refs = _single_chapter_verses(reference)
    if verse_refs:
        return _fetch_by_verse(verse_refs, version)
    return _fetch_one(reference, version, code)


# A long passage in one AI reply gets cut off mid-quote (truncated JSON).
# Quote ranges verse by verse instead: each verse is short, cached on its own,
# and cross-checked against the same WEB/KJV verse, which is a stricter check.
MAX_VERSES_PER_PASSAGE = 40
_RANGE_RE = re.compile(r"^(?P<book>.+?)\s+(?P<chapter>\d+):(?P<start>\d+)-(?P<end>\d+)$")


def _single_chapter_verses(reference: str) -> list[str]:
    """'Philippians 4:1-9' -> ['Philippians 4:1', ..., 'Philippians 4:9']; [] for anything else."""
    match = _RANGE_RE.match(reference)
    if not match:
        return []
    start, end = int(match["start"]), int(match["end"])
    if not 1 <= start < end or end - start + 1 > MAX_VERSES_PER_PASSAGE:
        return []
    return [f"{match['book']} {match['chapter']}:{verse}" for verse in range(start, end + 1)]


def _fetch_by_verse(verse_refs: list[str], version: str) -> str | None:
    code = CHECKED_VERSIONS[version]
    quotes = []
    for verse_ref in verse_refs:
        quote = _cached(verse_ref, version) or _fetch_one(verse_ref, version, code)
        if not quote:
            return None  # one unverified verse fails the whole passage
        quotes.append(quote)
    return " ".join(quotes)


def _fetch_one(reference: str, version: str, code: str) -> str | None:
    from faithsparks.services.scripture import fetch_verse_text

    web, kjv = fetch_verse_text(reference, "web"), fetch_verse_text(reference, "kjv")
    if not (web or kjv):
        return None  # nothing to check against: refuse rather than guess
    if not ai_budget_ok("scripture_checked", UNITS["gpt4o"]):
        return None
    try:
        quote, model = _ask_ai(reference, code)
        quote = _clean_quote(quote)
    except Exception:
        log.warning("scripture_checked: AI quote failed for %s %s", reference, code, exc_info=True)
        return None
    passes, overlap = cross_check(quote, web, kjv)
    if not passes:
        log.warning("scripture_checked: rejected %s %s (overlap %.2f)", reference, code, overlap)
        return None
    _store(reference, version, quote, overlap, model)
    return quote
