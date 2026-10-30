"""Authoritative scripture text sourcing.

The worksheet generator must never paraphrase or misquote the Bible — for this
audience an inaccurate verse is a trust-killer, and copyrighted translations
(NLT/CSB/ESV) can't be reproduced from an LLM's memory without a license.

This module fetches verse text from trustworthy sources so generated products
can keep Scripture separate from any optional creative assistance:

  * Public-domain translations (KJV, WEB, ASV, ...) -> bible-api.com (no key,
    free to reproduce).
  * ESV -> api.esv.org when ESV_API_KEY is set (licensed; attribution required).
  * Other translations (NLT, CSB, ...) -> scripture.api.bible when API_BIBLE_KEY
    and a version->bibleId mapping (API_BIBLE_IDS) are set (licensed).

fetch_verse_text() returns authoritative text, or None when no trustworthy
source is configured or available. Products that print Scripture should fail
closed when None is returned.
"""
from __future__ import annotations

import json
import os
import re
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

_TIMEOUT = 6

# Public-domain translations served by bible-api.com (safe to reproduce freely).
_PUBLIC_DOMAIN = {
    "kjv", "web", "webbe", "oeb-us", "oeb-cw", "clementine", "almeida",
    "rccv", "bbe", "darby", "ylt", "asv", "dra",
}

# One translation catalog shared by every product picker.  Keep the ids lower
# case in data and use ``code`` for display so a lesson pack, game, worksheet,
# and worship item all describe the same source in the same way.
TRANSLATIONS = {
    "web": {
        "code": "WEB",
        "name": "World English Bible",
        "source": "bible-api.com",
        "licensed": False,
    },
    "kjv": {
        "code": "KJV",
        "name": "King James Version",
        "source": "bible-api.com",
        "licensed": False,
    },
    "esv": {
        "code": "ESV",
        "name": "English Standard Version",
        "source": "ESV API or API.Bible",
        "licensed": True,
    },
    "nlt": {
        "code": "NLT",
        "name": "New Living Translation",
        "source": "API.Bible",
        "licensed": True,
    },
}


def _api_bible_ids() -> dict[str, str]:
    """Return configured API.Bible ids (``API_BIBLE_IDS=nlt:id,esv:id``)."""
    raw = os.getenv("API_BIBLE_IDS", "")
    out: dict[str, str] = {}
    for pair in raw.split(","):
        if ":" not in pair:
            continue
        version, bible_id = pair.split(":", 1)
        version, bible_id = version.strip().lower(), bible_id.strip()
        if version and bible_id:
            out[version] = bible_id
    return out


def available_translation_ids() -> set[str]:
    """Translations backed by a source that this installation can call."""
    available = {version for version in TRANSLATIONS if version in _PUBLIC_DOMAIN}
    api_key = os.getenv("API_BIBLE_KEY", "").strip()
    api_ids = _api_bible_ids()
    if os.getenv("ESV_API_KEY", "").strip() or (api_key and api_ids.get("esv")):
        available.add("esv")
    if api_key and api_ids.get("nlt"):
        available.add("nlt")
    return available


def copywork_translation_ids() -> set[str]:
    """Translations printable on worksheets, games and lesson packs.

    Adds ESV/NLT through the AI-quote-plus-cross-check path when no licensed
    key is set (see scripture_checked). Worship Quick Scripture uses the same rule.
    """
    from faithsparks.services import scripture_checked

    available = available_translation_ids()
    if scripture_checked.enabled():
        available |= set(scripture_checked.CHECKED_VERSIONS)
    return available


def translation_options(*, include_unavailable: bool = True, include_checked: bool = False) -> list[dict]:
    """Return picker-ready metadata for the canonical translation catalog."""
    available = copywork_translation_ids() if include_checked else available_translation_ids()
    options = []
    for version, metadata in TRANSLATIONS.items():
        if not include_unavailable and version not in available:
            continue
        options.append({
            "id": version,
            **metadata,
            "available": version in available,
        })
    return options


def fetch_copywork_verse_text(reference: str, version: str) -> str | None:
    """Verse text only, under Copywork's licensing rule: licensed/public-domain source
    first, then (ESV/NLT with no key) the AI quote cross-checked against WEB/KJV.
    Fails closed (None). One cached AI call per verse ever; no worksheet generation."""
    text = fetch_verse_text(reference, version)
    if text:
        return text
    from faithsparks.services import scripture_checked

    return scripture_checked.fetch_checked_text(reference, version)


def fetch_copywork_text(reference: str, version: str, *, authoritative_fetch=None) -> str | None:
    """Use the same text path as Copywork for products that permit its fallback.

    An authoritative provider is always preferred.  If one is not configured,
    Copywork's existing worksheet pipeline is the shared fallback, so a user
    who has permission for a licensed translation sees the same result in
    games and lesson materials.
    """
    text = (authoritative_fetch or fetch_verse_text)(reference, version)
    if text:
        return text
    try:
        from verse_helpers import request_verse_data

        payload = request_verse_data(reference, version)
        data = json.loads(payload) if payload else {}
        return _clean(data.get("fullVerse")) or None
    except Exception:
        return None

# In-process cache: (reference_lower, version) -> str | None
_cache: dict[tuple[str, str], str | None] = {}
# A failed lookup is retried after this long (a short outage shouldn't make
# every page view wait for the source's timeout).
MISS_RETRY_SECONDS = 120
_recent_misses: dict[tuple[str, str], float] = {}


def _clean(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


_DASHES = re.compile(r"\s*[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]\s*")


def lookup_reference(reference: str) -> str:
    """Reference as Bible APIs expect it: en/em dashes and minus signs become '-'.

    Mac and iOS auto-replace "1-9" with "1–9"; bible-api.com answers 404 for that.
    """
    return _DASHES.sub("-", _clean(reference))


def _has_letter_suffix(reference: str) -> bool:
    # e.g. "John 3:16a" / "Romans 8:28b" — a clause split an API can't do reliably.
    return bool(re.search(r":\d+\s*[ab]\b", reference) or re.search(r"\b\d+[ab]\b", reference))


def _http_get_json(url: str, headers: dict | None = None) -> dict:
    req = Request(url, headers={"User-Agent": "FaithSparksPrintables/1.0", **(headers or {})})
    with urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read(300_000).decode("utf-8", errors="replace"))


def _fetch_bible_api(reference: str, version: str) -> str | None:
    """bible-api.com is free and rate-limited: retry once after a short pause on 429."""
    import time
    from urllib.error import HTTPError
    url = f"https://bible-api.com/{quote(reference)}?translation={quote(version)}"
    for attempt in range(2):
        try:
            return _http_get_json(url).get("text")
        except HTTPError as exc:
            if exc.code != 429 or attempt:
                raise
            time.sleep(2)
    return None


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
    # Verse numbers come as <span data-number="16" class="v">16</span>; drop them
    # first, or stripping tags leaves "16 For God so loved..." in the text.
    content = re.sub(r'<span[^>]*class="[^"]*\bv\b[^"]*"[^>]*>.*?</span>', " ", content, flags=re.S)
    content = re.sub(r"<sup[^>]*>.*?</sup>", " ", content, flags=re.S)
    return re.sub(r"<[^>]+>", " ", content)  # strip remaining HTML tags


def fetch_verse_text(reference: str, version: str) -> str | None:
    """Authoritative verse text for reference+version, or None. Never raises."""
    version = (version or "").strip().lower()
    reference = lookup_reference(reference)
    if not reference or not version or _has_letter_suffix(reference):
        return None

    cache_key = (reference.lower(), version)
    if cache_key in _cache:
        return _cache[cache_key]
    if time.monotonic() < _recent_misses.get(cache_key, 0):
        return None  # failed moments ago: don't make the next visitor wait again

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
    # A missing provider or a brief network outage must not poison this process
    # for the rest of its lifetime. Cache only verified Scripture text.
    if text:
        _cache[cache_key] = text
    else:
        _recent_misses[cache_key] = time.monotonic() + MISS_RETRY_SECONDS
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


_SUFFIX_RE = re.compile(r"^(?P<base>.*?:\s*\d+)\s*(?P<part>[ab])\s*$", re.I)


def split_letter_suffix(reference: str) -> tuple[str, str | None]:
    """'Romans 8:28a' -> ('Romans 8:28', 'a'); other references -> (reference, None)."""
    match = _SUFFIX_RE.match(_clean(reference))
    if not match:
        return _clean(reference), None
    return match.group("base").strip(), match.group("part").lower()


def verse_part(full: str, part: str, hint: str | None = None) -> str:
    """Exact words for the 'a' or 'b' half of a verse.

    Use the AI's suggested half only when it is a verbatim run of the real verse
    (returned with the real punctuation); otherwise split at the clause break
    nearest the middle. Never returns words that aren't in ``full``.
    """
    words = _clean(full).split()
    if not words:
        return ""
    norm_words = [_norm(w) for w in words]
    hint_words = [_norm(w) for w in _clean(hint).split() if _norm(w)]
    if hint_words:
        n = len(hint_words)
        for start in range(0, len(words) - n + 1):
            if norm_words[start:start + n] == hint_words:
                return " ".join(words[start:start + n])
    breaks = [i + 1 for i, w in enumerate(words[:-1]) if w.endswith((";", ":", ".", ",", "?", "!"))]
    cut = min(breaks, key=lambda i: abs(i - len(words) / 2)) if breaks else max(1, len(words) // 2)
    return " ".join(words[:cut] if part == "a" else words[cut:])

