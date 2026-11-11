"""Private card-set products for admin printable builds.

Scripture text is stored with the translation it belongs to. Nothing here
invents a verse or copies wording from a different translation. NLT, ESV, and
KJV are first-class editions. WEB stays available because the checked Advent
draft is World English Bible and the site already supports it.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from faithsparks.pdf_notices import scripture_notice_texts
from faithsparks.services.firestore import db
from faithsparks.services.scripture import TRANSLATIONS, fetch_verse_text

COLLECTION = "printable_products"
SCHEMA = "faithsparks.printable_card_set.v1"
ADVENT_SLUG = "family-advent-scripture-cards"
CONTENT_DIR = Path(__file__).resolve().parents[1] / "content" / "printable_products"

# Same translations the scripture service can identify. Notices exist for each.
EDITION_TRANSLATIONS = ("nlt", "esv", "kjv", "web")
CARD_KINDS = {"scripture", "title", "memory", "blank"}
PRODUCT_KINDS = {"advent", "memory", "game"}
STATUSES = {"draft", "archived"}

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_DAY_RE = re.compile(r"^## Day\s+(\d+)\s+[—–-]\s+(.+?):\s+(.+?)\s*$")
_SCRIPTURE_RE = re.compile(
    r"^\*\*Scripture:\*\*\s+(?P<ref>.+?)\s*(?:\(excerpt\))?\s*"
    r"\((?P<ver>WEB|KJV|NLT|ESV|web|kjv|nlt|esv)\)"
    r"(?:\s+\*\((?P<note>.+?)\)\*)?\s*$",
    re.I,
)
_BULLET_RE = re.compile(r"^-\s+\*\*(Little Ones|Big Kids|Family Prayer|Optional Activity)(?:[^*]*)\*\*:\s*(.*)$")
_BONUS_RE = re.compile(r"^-\s+\*\*(.+?)\*\*:?\s*(.+)$")
_ELLIPSIS_RE = re.compile(r"\.\.\.|…")
_LETTER_SUFFIX_RE = re.compile(r"\d\s*[ab]\b", re.I)

LIMITS = {
    "title": 180,
    "subtitle": 500,
    "audience": 240,
    "story_arc": 500,
    "reference": 80,
    "partial_note": 180,
    "scripture_text": 1600,
    "prompt": 800,
    "instructions": 400,
    "listing_title": 180,
    "listing_description": 8000,
    "tag": 40,
}
MAX_CARDS = 80
MAX_INSTRUCTIONS = 16
MAX_TAGS = 20
MAX_IMPORT_BYTES = 400_000


class ProductError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def edition_choices() -> list[dict]:
    return [
        {"id": code, **TRANSLATIONS[code]}
        for code in EDITION_TRANSLATIONS
    ]


def notice_for(translation: str) -> tuple[str, str]:
    code = (translation or "").strip().upper()
    notices = scripture_notice_texts([code])
    if not notices:
        raise ProductError([f"{code or 'Unknown'} has no Scripture notice."])
    return notices[0]


def empty_card(kind: str = "scripture") -> dict:
    return {
        "kind": kind if kind in CARD_KINDS else "scripture",
        "number": "",
        "label": "",
        "title": "",
        "reference": "",
        "scripture_text": "",
        "partial": False,
        "partial_note": "",
        "younger_prompt": "",
        "older_prompt": "",
        "prayer": "",
        "activity": "",
        "scripture_source": "",
    }


def empty_product(*, slug: str, title: str, translation: str, product_kind: str = "advent") -> dict:
    translation = _translation(translation)
    return {
        "schema": SCHEMA,
        "id": slug,
        "title": title.strip(),
        "subtitle": "",
        "audience": "",
        "story_arc": "",
        "translation": translation,
        "product_kind": product_kind if product_kind in PRODUCT_KINDS else "advent",
        "status": "draft",
        "instructions": list(_default_instructions(translation)),
        "cards": [],
        "listing": _empty_listing(),
        "pdf_storage_path": "",
        "updated_at": "",
        "updated_by": "",
    }


def _empty_listing() -> dict:
    return {
        "status": "unpublished_draft",
        "title": "",
        "tags": [],
        "description": "",
        "draft_price_text": "",
        "notes": "Unpublished draft copy only. Not a Faith Sparks checkout price and not posted anywhere.",
    }


def _default_instructions(translation: str) -> list[str]:
    code = translation.upper()
    name = TRANSLATIONS[translation]["name"]
    return [
        "Print on US Letter at Actual size (100%). Cardstock or regular paper both work.",
        "Cut on the dashed lines. Each card page holds four cards.",
        "Read the verse, ask both questions, pray, and try the activity if you want.",
        f"Scripture on these cards is {name} ({code}) only.",
        "An Excerpt label means words were left out. The printed words were imported for this translation and are not copied from another translation.",
        "For personal, family, and one classroom. Please don't resell the file.",
    ]


def _translation(value: str) -> str:
    code = (value or "").strip().lower()
    if code not in EDITION_TRANSLATIONS:
        raise ProductError([
            "Choose NLT, ESV, KJV, or WEB. Each edition keeps its own wording.",
        ])
    return code


def _clip(value: str, limit: int, label: str, errors: list[str]) -> str:
    text = " ".join(str(value or "").split())
    if len(text) > limit:
        errors.append(f"{label} is longer than {limit} characters.")
    return text


def normalize_product(raw: dict, *, slug: str | None = None) -> dict:
    """Return a cleaned product or raise ProductError. Does not invent Scripture."""
    errors: list[str] = []
    data = raw or {}
    product_slug = (slug or data.get("id") or "").strip().lower()
    if not _SLUG_RE.fullmatch(product_slug) or len(product_slug) > 80:
        errors.append("Use a short slug made of lowercase letters, numbers, and hyphens.")
    try:
        translation = _translation(str(data.get("translation") or ""))
    except ProductError as exc:
        translation = "web"
        errors.extend(exc.errors)
    kind = str(data.get("product_kind") or "advent").strip().lower()
    if kind not in PRODUCT_KINDS:
        errors.append("Product kind must be advent, memory, or game.")
        kind = "advent"
    status = str(data.get("status") or "draft").strip().lower()
    if status not in STATUSES:
        status = "draft"
    title = _clip(data.get("title"), LIMITS["title"], "Title", errors)
    if not title:
        errors.append("A title is required.")
    subtitle = _clip(data.get("subtitle"), LIMITS["subtitle"], "Subtitle", errors)
    audience = _clip(data.get("audience"), LIMITS["audience"], "Audience", errors)
    story_arc = _clip(data.get("story_arc"), LIMITS["story_arc"], "Story arc", errors)
    instructions = []
    for line in list(data.get("instructions") or [])[:MAX_INSTRUCTIONS]:
        cleaned = _clip(line, LIMITS["instructions"], "An instruction", errors)
        if cleaned:
            instructions.append(cleaned)
    cards_in = list(data.get("cards") or [])
    if len(cards_in) > MAX_CARDS:
        errors.append(f"A set can hold up to {MAX_CARDS} cards.")
        cards_in = cards_in[:MAX_CARDS]
    cards = [_normalize_card(card, translation, index, errors) for index, card in enumerate(cards_in, start=1)]
    listing = _normalize_listing(data.get("listing") or {}, errors)
    if errors:
        raise ProductError(errors)
    return {
        "schema": SCHEMA,
        "id": product_slug,
        "title": title,
        "subtitle": subtitle,
        "audience": audience,
        "story_arc": story_arc,
        "translation": translation,
        "product_kind": kind,
        "status": status,
        "instructions": instructions or list(_default_instructions(translation)),
        "cards": cards,
        "listing": listing,
        "pdf_storage_path": _storage_path(data.get("pdf_storage_path")),
        "updated_at": str(data.get("updated_at") or ""),
        "updated_by": str(data.get("updated_by") or ""),
    }


def _normalize_card(raw: dict, translation: str, index: int, errors: list[str]) -> dict:
    card = empty_card(str((raw or {}).get("kind") or "scripture"))
    label = f"Card {index}"
    card["number"] = _clip((raw or {}).get("number"), 12, f"{label} number", errors)
    card["label"] = _clip((raw or {}).get("label"), 40, f"{label} label", errors)
    card["title"] = _clip((raw or {}).get("title"), LIMITS["title"], f"{label} title", errors)
    card["younger_prompt"] = _clip((raw or {}).get("younger_prompt"), LIMITS["prompt"], f"{label} younger prompt", errors)
    card["older_prompt"] = _clip((raw or {}).get("older_prompt"), LIMITS["prompt"], f"{label} older prompt", errors)
    card["prayer"] = _clip((raw or {}).get("prayer"), LIMITS["prompt"], f"{label} prayer", errors)
    card["activity"] = _clip((raw or {}).get("activity"), LIMITS["prompt"], f"{label} activity", errors)
    source = str((raw or {}).get("scripture_source") or "").strip().lower()
    if card["kind"] != "scripture":
        return card
    card["reference"] = _clip((raw or {}).get("reference"), LIMITS["reference"], f"{label} reference", errors)
    card["scripture_text"] = _clip((raw or {}).get("scripture_text"), LIMITS["scripture_text"], f"{label} scripture", errors)
    card["partial_note"] = _clip((raw or {}).get("partial_note"), LIMITS["partial_note"], f"{label} excerpt note", errors)
    card["partial"] = bool((raw or {}).get("partial")) or bool(card["partial_note"]) or bool(_ELLIPSIS_RE.search(card["scripture_text"])) or bool(_LETTER_SUFFIX_RE.search(card["reference"]))
    if card["partial"] and not card["partial_note"]:
        errors.append(f"{label} is an excerpt and needs an explicit excerpt note.")
    if source not in {"", "imported", "authoritative_fetch"}:
        source = "imported" if card["scripture_text"] else ""
    card["scripture_source"] = source or ("imported" if card["scripture_text"] else "")
    card["translation"] = translation
    return card


def _normalize_listing(raw: dict, errors: list[str]) -> dict:
    listing = _empty_listing()
    listing["title"] = _clip(raw.get("title"), LIMITS["listing_title"], "Listing title", errors)
    listing["description"] = str(raw.get("description") or "").strip()
    if len(listing["description"]) > LIMITS["listing_description"]:
        errors.append("Listing description is too long.")
    listing["draft_price_text"] = _clip(raw.get("draft_price_text"), 40, "Draft price note", errors)
    tags = []
    for tag in list(raw.get("tags") or [])[:MAX_TAGS]:
        cleaned = _clip(tag, LIMITS["tag"], "A tag", errors)
        if cleaned:
            tags.append(cleaned)
    listing["tags"] = tags
    return listing


def _storage_path(value) -> str:
    path = str(value or "").strip()
    if not path.startswith("printable-products/") or ".." in path or path.endswith("/"):
        return ""
    return path


def export_errors(product: dict) -> list[str]:
    """Problems that must be fixed before a PDF can claim a translation."""
    errors = []
    code = product["translation"].upper()
    scripture_cards = [card for card in product["cards"] if card["kind"] == "scripture"]
    if not scripture_cards:
        errors.append("Add at least one Scripture card before exporting.")
    for index, card in enumerate(product["cards"], start=1):
        if card["kind"] != "scripture":
            continue
        name = card["title"] or card["reference"] or f"Card {index}"
        if not card["reference"]:
            errors.append(f"{name} needs a Scripture reference.")
        if not card["scripture_text"]:
            errors.append(
                f"{name} has no {code} text. Paste or import the exact {code} wording. "
                "Another translation will not be substituted."
            )
        if card["partial"] and not card["partial_note"]:
            errors.append(f"{name} is an excerpt and needs an explicit excerpt note.")
    return errors


def reference_line(card: dict, translation: str) -> str:
    code = translation.upper()
    line = f"{card['reference']} ({code})"
    if card.get("partial"):
        note = card.get("partial_note") or "excerpt"
        line += f" - Excerpt: {note}"
    return line


def load_advent_draft() -> dict:
    """Checked Advent content. The verses in the packaged file are WEB."""
    content_path = CONTENT_DIR / "family-advent-scripture-cards.md"
    listing_path = CONTENT_DIR / "family-advent-scripture-cards.listing.md"
    product = _parse_content_markdown(content_path.read_text(encoding="utf-8"), slug=ADVENT_SLUG)
    product["listing"] = _parse_listing_markdown(listing_path.read_text(encoding="utf-8"))
    product["product_kind"] = "advent"
    return normalize_product(product, slug=ADVENT_SLUG)


def parse_listing_import(raw: bytes) -> dict:
    if len(raw) > MAX_IMPORT_BYTES:
        raise ProductError(["That import is too large."])
    text = raw.decode("utf-8", errors="replace")
    if "## Title" not in text or "## Tags" not in text:
        raise ProductError(["That file is not listing copy."])
    return _normalize_listing(_parse_listing_markdown(text), [])


def parse_import(raw: bytes, filename: str, *, slug: str) -> dict:
    if len(raw) > MAX_IMPORT_BYTES:
        raise ProductError(["That import is too large."])
    text = raw.decode("utf-8", errors="replace")
    name = (filename or "").lower()
    if name.endswith(".json") or text.lstrip().startswith("{"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProductError(["That JSON could not be read."]) from exc
        if not isinstance(data, dict):
            raise ProductError(["The import has to be one product object."])
        data["id"] = slug
        return normalize_product(data, slug=slug)
    if "Family Advent" in text and "## Day" in text:
        product = _parse_content_markdown(text, slug=slug)
        return normalize_product(product, slug=slug)
    if "## Title" in text and "## Tags" in text:
        raise ProductError(["Listing copy imports onto an existing product from the editor, not as a new Scripture set."])
    raise ProductError(["Use the card-set JSON or the Advent content markdown."])


def _parse_content_markdown(text: str, *, slug: str) -> dict:
    lines = text.splitlines()
    title = "Family Advent Scripture Cards"
    subtitle = ""
    audience = ""
    story_arc = ""
    translation = ""
    cards: list[dict] = []
    mode = "intro"
    current: dict | None = None
    quote: list[str] = []

    def finish_card():
        nonlocal current, quote
        if not current:
            return
        if quote:
            current["scripture_text"] = " ".join(quote).strip()
            current["scripture_source"] = "imported"
        cards.append(current)
        current = None
        quote = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("# "):
            title = re.sub(r"\s+[—–-]\s+Content$", "", stripped[2:].strip())
            continue
        day = _DAY_RE.match(stripped)
        if day:
            finish_card()
            mode = "days"
            current = empty_card("scripture")
            current["number"] = day.group(1)
            current["label"] = day.group(2).strip()
            current["title"] = day.group(3).strip()
            continue
        if stripped.lower().startswith("## bonus cards"):
            finish_card()
            mode = "bonus"
            continue
        if mode == "intro":
            if stripped.startswith("**Scripture translation:**"):
                continue
            if stripped.startswith("**Story arc:**"):
                story_arc = stripped.split(":**", 1)[1].strip()
                continue
            if stripped.startswith("Designed for "):
                audience = stripped
                continue
            if stripped and not stripped.startswith("**") and not subtitle:
                subtitle = stripped
            continue
        if mode == "bonus":
            bonus = _BONUS_RE.match(stripped)
            if not bonus:
                continue
            name, body = bonus.group(1).strip(), bonus.group(2).strip().strip('"')
            card = empty_card("blank")
            lowered = name.lower()
            if "title" in lowered:
                card["kind"] = "title"
                card["title"] = body
            elif "memor" in lowered:
                card["kind"] = "memory"
                card["title"] = name
                card["activity"] = body
            else:
                card["title"] = name
                card["activity"] = body
            cards.append(card)
            continue
        if current is None:
            continue
        scripture = _SCRIPTURE_RE.match(stripped)
        if scripture:
            ver = scripture.group("ver").lower()
            if translation and ver != translation:
                raise ProductError([
                    f"{current['title']} is {ver.upper()}, but this set is already {translation.upper()}. "
                    "Import each translation as its own edition."
                ])
            translation = ver
            ref = scripture.group("ref").strip()
            ref = re.sub(r"\s*\(excerpt\)\s*$", "", ref, flags=re.I).strip()
            note = (scripture.group("note") or "").strip()
            marked_excerpt = bool(re.search(r"\(excerpt\)", stripped, re.I))
            current["reference"] = ref
            current["partial"] = bool(note or marked_excerpt)
            current["partial_note"] = note or ("excerpt" if marked_excerpt else "")
            continue
        if stripped.startswith(">"):
            quote.append(stripped.lstrip(">").strip())
            continue
        bullet = _BULLET_RE.match(stripped)
        if not bullet:
            continue
        kind, body = bullet.group(1), bullet.group(2).strip()
        if kind == "Little Ones":
            current["younger_prompt"] = body
        elif kind == "Big Kids":
            current["older_prompt"] = body
        elif kind == "Family Prayer":
            current["prayer"] = body
        else:
            current["activity"] = body
    finish_card()
    if not translation:
        raise ProductError(["The import did not name a Scripture translation on the verses."])
    return {
        "id": slug,
        "title": title,
        "subtitle": subtitle,
        "audience": audience,
        "story_arc": story_arc,
        "translation": translation,
        "product_kind": "advent",
        "status": "draft",
        "instructions": _default_instructions(translation),
        "cards": cards,
        "listing": _empty_listing(),
    }


def _parse_listing_markdown(text: str) -> dict:
    listing = _empty_listing()
    section = ""
    description: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            section = stripped[3:].split("(")[0].strip().lower()
            continue
        if section == "title" and stripped and not stripped.startswith("("):
            if not listing["title"]:
                listing["title"] = stripped
        elif section.startswith("tags") and re.match(r"^\d+\.\s+", stripped):
            listing["tags"].append(re.sub(r"^\d+\.\s+", "", stripped))
        elif section == "description":
            description.append(line.rstrip())
        elif section == "price":
            match = re.search(r"\$\d+(?:\.\d{2})?", stripped)
            if match and not listing["draft_price_text"]:
                listing["draft_price_text"] = match.group(0)
    listing["description"] = "\n".join(description).strip()
    listing["notes"] = (
        "Unpublished draft. Do not post this listing automatically. "
        "The price note is not a Faith Sparks checkout price."
    )
    return listing


def listing_markdown(product: dict) -> str:
    code, body = notice_for(product["translation"])
    listing = product["listing"]
    tags = "\n".join(f"{index}. {tag}" for index, tag in enumerate(listing.get("tags") or [], start=1))
    return "\n".join([
        "UNPUBLISHED DRAFT — do not post this listing automatically.",
        f"Translation edition: {code}",
        "",
        "## Title",
        listing.get("title") or product["title"],
        "",
        "## Tags",
        tags,
        "",
        "## Description",
        listing.get("description") or "",
        "",
        "## Draft price note",
        listing.get("draft_price_text") or "(none)",
        listing.get("notes") or "",
        "",
        "## Scripture notice included in the PDF",
        body,
        "",
    ])


def cards_from_form(form) -> list[dict]:
    indexes = []
    for key in form:
        match = re.fullmatch(r"card-(\d+)-kind", key)
        if match:
            indexes.append(int(match.group(1)))
    cards = []
    for index in sorted(indexes):
        kind = (form.get(f"card-{index}-kind") or "scripture").strip().lower()
        card = empty_card(kind)
        for field in ("number", "label", "title", "reference", "scripture_text", "partial_note", "younger_prompt", "older_prompt", "prayer", "activity"):
            card[field] = form.get(f"card-{index}-{field}") or ""
        card["partial"] = form.get(f"card-{index}-partial") == "on"
        source = (form.get(f"card-{index}-scripture_source") or "").strip().lower()
        card["scripture_source"] = source if source in {"imported", "authoritative_fetch"} else ""
        if card["kind"] != "scripture":
            card["reference"] = ""
            card["scripture_text"] = ""
            card["partial"] = False
            card["partial_note"] = ""
            card["scripture_source"] = ""
        cards.append(card)
    return cards


def product_from_form(form, existing: dict) -> dict:
    data = deepcopy(existing)
    data["title"] = form.get("title") or ""
    data["subtitle"] = form.get("subtitle") or ""
    data["audience"] = form.get("audience") or ""
    data["story_arc"] = form.get("story_arc") or ""
    data["status"] = "archived" if form.get("status") == "archived" else "draft"
    data["product_kind"] = (form.get("product_kind") or existing.get("product_kind") or "advent").strip().lower()
    data["instructions"] = [line.strip() for line in (form.get("instructions") or "").splitlines() if line.strip()]
    data["cards"] = cards_from_form(form)
    listing = dict(existing.get("listing") or _empty_listing())
    listing["title"] = form.get("listing_title") or ""
    listing["description"] = form.get("listing_description") or ""
    listing["draft_price_text"] = form.get("draft_price_text") or ""
    listing["tags"] = [part.strip() for part in re.split(r"[\n,]", form.get("listing_tags") or "") if part.strip()]
    data["listing"] = listing
    # Translation is not edited in place. A different wording needs its own edition.
    data["translation"] = existing["translation"]
    return normalize_product(data, slug=existing["id"])


def clone_for_translation(product: dict, translation: str, slug: str) -> dict:
    """Copy prompts and structure. Scripture text is cleared on purpose."""
    translation = _translation(translation)
    if translation == product["translation"]:
        raise ProductError(["That product is already this translation."])
    cloned = deepcopy(product)
    cloned["id"] = slug
    cloned["translation"] = translation
    cloned["title"] = f"{product['title']} ({translation.upper()})"
    cloned["status"] = "draft"
    cloned["pdf_storage_path"] = ""
    cloned["instructions"] = list(_default_instructions(translation))
    for card in cloned["cards"]:
        if card["kind"] != "scripture":
            continue
        card["scripture_text"] = ""
        card["scripture_source"] = ""
        card["translation"] = translation
    return normalize_product(cloned, slug=slug)


def fill_empty_full_verses(product: dict, fetch=None) -> tuple[dict, list[str]]:
    """Fill blank full verses from the product's own translation. Skip excerpts."""
    fetch = fetch or fetch_verse_text
    version = product["translation"]
    notes = []
    filled = 0
    updated = deepcopy(product)
    for card in updated["cards"]:
        if card["kind"] != "scripture":
            continue
        name = card["reference"] or card["title"] or "A card"
        if card.get("partial") or card.get("partial_note") or _LETTER_SUFFIX_RE.search(card.get("reference") or ""):
            notes.append(f"{name}: excerpt left unchanged. Paste the exact excerpt.")
            continue
        if (card.get("scripture_text") or "").strip():
            continue
        reference = (card.get("reference") or "").strip()
        if not reference:
            notes.append(f"{name}: add a reference before filling.")
            continue
        try:
            text = fetch(reference, version)
        except Exception:
            text = None
        if not text:
            notes.append(
                f"{reference}: no {version.upper()} text is available from the configured source. "
                "Paste the exact wording. Another translation was not used."
            )
            continue
        card["scripture_text"] = str(text).strip()
        card["scripture_source"] = "authoritative_fetch"
        card["partial"] = False
        card["partial_note"] = ""
        filled += 1
    notes.insert(0, f"Filled {filled} empty full verse(s) from {version.upper()} only.")
    return normalize_product(updated, slug=updated["id"]), notes


def _stamp(product: dict, email: str) -> dict:
    product["updated_at"] = datetime.now(timezone.utc).isoformat()
    product["updated_by"] = email
    return product


def firestore_ready() -> bool:
    return db is not None


def list_products() -> list[dict]:
    if not db:
        return []
    found = []
    for snap in db.collection(COLLECTION).stream():
        data = snap.to_dict() or {}
        data["id"] = snap.id
        found.append({
            "id": snap.id,
            "title": data.get("title") or snap.id,
            "translation": data.get("translation") or "",
            "status": data.get("status") or "draft",
            "product_kind": data.get("product_kind") or "advent",
            "cards": len(data.get("cards") or []),
            "updated_at": data.get("updated_at") or "",
        })
    return sorted(found, key=lambda item: (item["title"].lower(), item["id"]))


def get_product(slug: str) -> dict | None:
    if not db or not _SLUG_RE.fullmatch(slug or ""):
        return None
    snap = db.collection(COLLECTION).document(slug).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data["id"] = slug
    return normalize_product(data, slug=slug)


def save_product(product: dict, email: str) -> dict:
    if not db:
        raise ProductError(["Firestore is not configured, so this draft cannot be stored."])
    cleaned = _stamp(normalize_product(product, slug=product["id"]), email)
    db.collection(COLLECTION).document(cleaned["id"]).set(cleaned)
    return cleaned


def delete_product(slug: str) -> bool:
    if not db or not _SLUG_RE.fullmatch(slug or ""):
        return False
    ref = db.collection(COLLECTION).document(slug)
    if not ref.get().exists:
        return False
    ref.delete()
    return True

