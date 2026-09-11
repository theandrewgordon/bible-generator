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


def translation_options(*, include_unavailable: bool = True) -> list[dict]:
    """Return picker-ready metadata for the canonical translation catalog."""
    available = available_translation_ids()
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
    # A missing provider or a brief network outage must not poison this process
    # for the rest of its lifetime. Cache only verified Scripture text.
    if text:
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
