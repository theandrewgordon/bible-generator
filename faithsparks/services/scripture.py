"""Authoritative scripture text sourcing.

The worksheet generator must never paraphrase or misquote the Bible — for this
audience an inaccurate verse is a trust-killer, and copyrighted translations
(NLT/CSB/ESV) can't be reproduced from an LLM's memory without a license.

This module fetches verse text from trustworthy sources so the AI only handles
non-scripture content (reflection question, coloring idea, title):

  * Public-domain translations (KJV, WEB, ASV, ...) -> bible-api.com (no key,
    free to reproduce).
  * ESV -> api.esv.org when ESV_API_KEY is set (licensed; attribution required).
  * Other translations (NLT, CSB, ...) -> scripture.api.bible when API_BIBLE_KEY
    and a version->bibleId mapping (API_BIBLE_IDS) are set (licensed).

fetch_verse_text() returns authoritative text, or None when no trustworthy
source is configured/available for that translation — in which case the caller
keeps the existing behavior (so nothing breaks).
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import quote
from urllib.request import Request, urlopen

_TIMEOUT = 6

# Public-domain translations served by bible-api.com (safe to reproduce freely).
_PUBLIC_DOMAIN = {
    "kjv", "web", "webbe", "oeb-us", "oeb-cw", "clementine", "almeida",
    "rccv", "bbe", "darby", "ylt", "asv", "dra",
}

# In-process cache: (reference_lower, version) -> str | None
_cache: dict[tuple[str, str], str | None] = {}


def _clean(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _has_letter_suffix(reference: str) -> bool:
    # e.g. "John 3:16a" / "Romans 8:28b" — a clause split an API can't do reliably.
    return bool(re.search(r":\d+\s*[ab]\b", reference) or re.search(r"\b\d+[ab]\b", reference))


def _http_get_json(url: str, headers: dict | None = None) -> dict:
    req = Request(url, headers={"User-Agent": "FaithSparksPrintables/1.0", **(headers or {})})
    with urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read(300_000).decode("utf-8", errors="replace"))


def _fetch_bible_api(reference: str, version: str) -> str | None:
    url = f"https://bible-api.com/{quote(reference)}?translation={quote(version)}"
    data = _http_get_json(url)
    return data.get("text")


def _fetch_esv(reference: str) -> str | None:
    key = os.getenv("ESV_API_KEY", "").strip()
    if not key:
        return None
    url = (
        "https://api.esv.org/v3/passage/text/?q=" + quote(reference)
        + "&include-headings=false&include-footnotes=false&include-verse-numbers=false"
        + "&include-short-copyright=false&include-passage-references=false"
    )
    data = _http_get_json(url, {"Authorization": "Token " + key})
    passages = data.get("passages") or []
    return passages[0] if passages else None


def _api_bible_ids() -> dict:
    """version -> bibleId map from env, e.g. API_BIBLE_IDS='nlt:abc123,csb:def456'."""
    raw = os.getenv("API_BIBLE_IDS", "")
    out: dict[str, str] = {}
    for pair in raw.split(","):
        if ":" in pair:
            ver, bid = pair.split(":", 1)
            ver, bid = ver.strip().lower(), bid.strip()
            if ver and bid:
                out[ver] = bid
    return out


def _fetch_api_bible(reference: str, bible_id: str) -> str | None:
    key = os.getenv("API_BIBLE_KEY", "").strip()
    if not key:
        return None
    # API.Bible needs OSIS-style passage ids; this best-effort path is only used
    # when an operator has configured keys/ids, so keep it simple and defensive.
    url = (
        f"https://api.scripture.api.bible/v1/bibles/{quote(bible_id)}/search?query="
        + quote(reference) + "&limit=1"
    )
    data = _http_get_json(url, {"api-key": key})
    passages = ((data.get("data") or {}).get("passages")) or []
    if not passages:
        return None
    content = passages[0].get("content") or ""
    return re.sub(r"<[^>]+>", " ", content)  # strip any HTML tags


def fetch_verse_text(reference: str, version: str) -> str | None:
    """Authoritative verse text for reference+version, or None. Never raises."""
    version = (version or "").strip().lower()
    reference = _clean(reference)
    if not reference or not version or _has_letter_suffix(reference):
        return None

    cache_key = (reference.lower(), version)
    if cache_key in _cache:
        return _cache[cache_key]

    text = None
    try:
        if version in _PUBLIC_DOMAIN:
            text = _fetch_bible_api(reference, version)
        elif version == "esv":
            # Prefer Crossway's ESV API, but installations that already have
            # licensed ESV access through API.Bible may use that source too.
            text = _fetch_esv(reference)
            if not text:
                bible_id = _api_bible_ids().get(version)
                if bible_id:
                    text = _fetch_api_bible(reference, bible_id)
        else:
            bible_id = _api_bible_ids().get(version)
            if bible_id:
                text = _fetch_api_bible(reference, bible_id)
    except Exception:
        text = None

    text = _clean(text) or None
    _cache[cache_key] = text
    return text


_NORM_RE = re.compile(r"[^a-z0-9 ]")


def _norm(text: str) -> str:
    return _NORM_RE.sub("", re.sub(r"\s+", " ", (text or "").lower())).strip()


def derive_traceable(authoritative: str, llm_excerpt: str | None, max_words: int = 26) -> str:
    """Produce the tracing text using EXACT scripture words.

    Short verses trace in full. For long verses, keep the AI's chosen excerpt
    only if it's a verbatim run of the real text; otherwise fall back to the
    first sentence (or first max_words words) of the authoritative text.
    """
    authoritative = _clean(authoritative)
    words = authoritative.split()
    if len(words) <= max_words:
        return authoritative
    if llm_excerpt and _norm(llm_excerpt) and _norm(llm_excerpt) in _norm(authoritative):
        return _clean(llm_excerpt)
    sentence = re.match(r"(.+?[.!?])(\s|$)", authoritative)
    if sentence and len(sentence.group(1).split()) <= max_words:
        return sentence.group(1).strip()
    return " ".join(words[:max_words]).rstrip(",;:")
