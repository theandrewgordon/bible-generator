"""AI-assisted coloring sheet pipeline."""

from __future__ import annotations

import base64
import json
import os
import uuid
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

from build_pdf import build_coloring_pdf
from faithsparks.services.firestore import db, firestore
from faithsparks.services.storage import upload_to_storage
from faithsparks.util.slug import normalize_slug
from verse_helpers import (
    fetch_passage_text,
    get_openai_client,
    moderate_text_block,
    parse_reference_list,
    split_version_from_reference,
)

MAX_CUSTOM_TEXT_CHARS = 500
MAX_VERSE_REFERENCES = 4
TEXT_MODEL = os.getenv("ILLUSTRATE_TEXT_MODEL", "gpt-4.1-mini")
IMAGE_MODEL = os.getenv("ILLUSTRATE_IMAGE_MODEL", "gpt-image-1")
PRIMARY_VERSION = os.getenv("ILLUSTRATE_PRIMARY_VERSION", "kjv")
COMPARE_VERSION = os.getenv("ILLUSTRATE_COMPARE_VERSION")

SAFE_SYMBOLS = [
    "cross",
    "dove",
    "ichthys fish",
    "loaves and fish",
    "shepherd's staff",
    "olive branch",
    "rainbow",
    "crown",
    "heart",
    "sunburst",
    "stars",
    "mountain range",
    "river",
    "boat on calm water",
    "lantern or oil lamp",
    "wheat sheaf",
    "grapevine",
    "lilies",
]

GENERAL_IMAGERY = [
    "kids joyfully worshipping",
    "children reading scripture together",
    "family prayer circle",
    "shepherd with lambs",
    "Jesus welcoming children (gentle, no blood)",
    "peaceful hillside with animals",
    "ark of animals under rainbow",
    "garden with flowing river",
    "angels rejoicing (simple robes)",
    "city on a hill at sunrise",
    "Bethlehem-style village",
]

HISTORICAL_PROPS = [
    "shepherd's staff at rest",
    "sling coiled on the ground",
    "shield leaning against wall",
    "harp resting on stand",
    "scroll on table",
    "basket with loaves",
    "stone pile beside calm stream",
]

BLOCKED_WORDS = {
    "blood",
    "gore",
    "murder",
    "kill",
    "slay",
    "demon",
    "occult",
    "curse",
    "hellfire",
    "seduce",
    "lust",
    "weapon",
}

COMPOSITION_BY_AGE = {
    "3-5": {"foreground": 3, "background": 1},
    "6-8": {"foreground": 4, "background": 2},
    "9-10": {"foreground": 5, "background": 2},
}

SENSITIVITY_FLAGS = ("violence", "death", "demons", "adult_themes")


class IllustrationError(Exception):
    def __init__(self, message: str, status_code: int = 400, details: Dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}


def _ensure_dirs():
    Path("worksheets").mkdir(parents=True, exist_ok=True)
    Path("output").mkdir(parents=True, exist_ok=True)
    Path("output/thumbs").mkdir(parents=True, exist_ok=True)


def detect_blocked_term(text: str) -> str | None:
    lowered = (text or "").lower()
    for term in BLOCKED_WORDS:
        if term in lowered:
            return term
    return None


def _extract_response_text(resp) -> str:
    chunks: List[str] = []
    output = getattr(resp, "output", None)
    if output:
        for item in output:
            contents = getattr(item, "content", None) or []
            for piece in contents:
                if getattr(piece, "type", None) == "text":
                    text_obj = getattr(piece, "text", None)
                    if text_obj and getattr(text_obj, "value", None):
                        chunks.append(text_obj.value)
    if not chunks and hasattr(resp, "output_text"):
        chunks.append(resp.output_text)
    return "".join(chunks).strip()


def _summarize_context(prompt_text: str, age_bracket: str) -> Dict:
    client = get_openai_client()
    if not client:
        raise IllustrationError("OpenAI client is not configured", 500)

    system_prompt = (
        "You are a Christian education art director. "
        "Summarize the passage in 2-3 kid-friendly sentences, provide up to 3 theological bullet points, "
        "offer 1-2 theological element-to-meaning notes, and flag sensitive content (violence, death, demons, adult themes). "
        "Output JSON only."
    )
    schema = {
        "name": "IllustrateSummary",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "theological_points": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 3,
                },
                "theological_notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 2,
                },
                "sensitivity": {
                    "type": "object",
                    "properties": {
                        "violence": {"type": "boolean"},
                        "death": {"type": "boolean"},
                        "demons": {"type": "boolean"},
                        "adult_themes": {"type": "boolean"},
                    },
                    "required": list(SENSITIVITY_FLAGS),
                },
            },
            "required": ["summary", "theological_points", "sensitivity", "theological_notes"],
        },
    }

    try:
        resp = client.responses.create(
            model=TEXT_MODEL,
            temperature=0.3,
            response_format={"type": "json_schema", "json_schema": schema},
            input=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"Age bracket: {age_bracket}\n"
                        "Summarize the following content for a black-and-white coloring sheet:\n\n"
                        f"{prompt_text[:4000]}"
                    ),
                },
            ],
        )
    except Exception as exc:
        raise IllustrationError("Unable to summarize passage", 502) from exc

    raw = _extract_response_text(resp)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise IllustrationError("AI summary was malformed", 502, {"raw": raw}) from exc


def build_scene_blueprint(
    summary_payload: Dict,
    *,
    age_bracket: str,
    user_symbols_only: bool,
    allow_historical_props: bool,
) -> Tuple[Dict, bool]:
    composition = COMPOSITION_BY_AGE.get(age_bracket, COMPOSITION_BY_AGE["6-8"])
    sensitivity = summary_payload.get("sensitivity", {}) or {}
    forced = any(bool(sensitivity.get(flag)) for flag in SENSITIVITY_FLAGS)
    effective_symbols = bool(user_symbols_only or forced)
    imagery = SAFE_SYMBOLS if effective_symbols else GENERAL_IMAGERY
    props = HISTORICAL_PROPS if (allow_historical_props and not effective_symbols) else []

    blueprint = {
        "age_bracket": age_bracket,
        "style": "black-and-white line art coloring page, thick outlines, high contrast, no shading, no text, minimal background clutter",
        "composition": {
            "foreground_max": composition["foreground"],
            "background_max": composition["background"],
        },
        "imagery_allowed": imagery,
        "historical_props": props,
        "symbols_only": effective_symbols,
        "theological_notes": summary_payload.get("theological_notes") or summary_payload.get("theological_points") or [],
    }
    return blueprint, forced


def _prompt_from_blueprint(blueprint: Dict, summary: Dict, references: List[str], include_reference: bool) -> str:
    ref_line = (
        f"Reference focus: {', '.join(references)}. "
        if references and include_reference
        else ""
    )
    notes = ", ".join(blueprint.get("theological_notes") or [])
    parts = [
        f"Create a gentle Christian coloring illustration for kids ages {blueprint['age_bracket']}.",
        f"Ensure: {blueprint['style']}.",
        f"Foreground items limit: {blueprint['composition']['foreground_max']}.",
        f"Background items limit: {blueprint['composition']['background_max']}.",
        f"Allowed imagery: {', '.join(blueprint['imagery_allowed'])}.",
    ]
    if blueprint["symbols_only"]:
        parts.append("Use only universal Christian symbols.")
    elif blueprint["historical_props"]:
        parts.append(
            f"Optional historical props at rest only: {', '.join(blueprint['historical_props'])}."
        )
    if ref_line:
        parts.append(ref_line.strip())
    if notes:
        parts.append(f"Theological mapping notes (metadata only): {notes}.")
    parts.append(
        "Absolutely no depiction of God the Father, no blood, gore, injuries, combat, or demons. Keep characters smiling and calm."
    )
    return " ".join(parts).strip()


def _save_png(b64_data: str, path: Path) -> None:
    binary = base64.b64decode(b64_data)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(binary)


def _make_thumbnail(src: Path, dest: Path) -> None:
    try:
        with Image.open(src) as img:
            img = img.convert("L")
            img.thumbnail((560, 420))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, format="PNG")
    except Exception:
        pass


def _coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return bool(value) if value is not None else default


def _compose_source_blocks(verses: List[Dict], custom_text: str) -> str:
    blocks: List[str] = []
    for item in verses:
        compare = item.get("compare")
        compare_line = f"\nESV: {compare}" if compare else ""
        blocks.append(f"{item['reference']} ({item['version']}): {item['text']}{compare_line}")
    if custom_text:
        blocks.append(f"Custom text: {custom_text}")
    return "\n\n".join(blocks)


def _fetch_compare_text(reference: str) -> str | None:
    if not COMPARE_VERSION:
        return None
    try:
        data = fetch_passage_text(reference, COMPARE_VERSION)
        return data.get("text")
    except Exception:
        return None


def create_coloring_sheet(
    *,
    user_email: str,
    verse_input: str,
    custom_text: str,
    title_override: str,
    age_bracket: str,
    include_reference: bool,
    symbols_only: bool,
    historical_props: bool,
) -> Dict:
    if not (verse_input or custom_text):
        raise IllustrationError("Please provide at least one verse or custom text.")

    references = parse_reference_list(verse_input)
    if len(references) > MAX_VERSE_REFERENCES:
        references = references[:MAX_VERSE_REFERENCES]

    verses: List[Dict] = []
    for raw in references:
        version, reference = split_version_from_reference(raw, PRIMARY_VERSION)
        try:
            verse_payload = fetch_passage_text(reference, version)
        except Exception as exc:
            raise IllustrationError(f"Could not fetch text for {reference} ({version.upper()}).") from exc
        compare_text = _fetch_compare_text(reference)
        if compare_text:
            verse_payload["compare"] = compare_text
        verses.append(verse_payload)

    custom_text = (custom_text or "").strip()
    if custom_text and len(custom_text) > MAX_CUSTOM_TEXT_CHARS:
        raise IllustrationError(f"Custom text must be under {MAX_CUSTOM_TEXT_CHARS} characters.")

    if custom_text:
        moderation = moderate_text_block(custom_text)
        if moderation.get("flagged"):
            raise IllustrationError("Custom text did not pass safety review.")
        blocked_term = detect_blocked_term(custom_text)
        if blocked_term:
            raise IllustrationError(f"Please remove sensitive word: '{blocked_term}'.")

    if not verses and not custom_text:
        raise IllustrationError("Unable to build scene without content.")

    source_blob = _compose_source_blocks(verses, custom_text)
    summary = _summarize_context(source_blob, age_bracket)
    blueprint, forced_symbols = build_scene_blueprint(
        summary,
        age_bracket=age_bracket,
        user_symbols_only=symbols_only,
        allow_historical_props=historical_props,
    )

    prompt = _prompt_from_blueprint(
        blueprint,
        summary,
        [v["reference"] for v in verses],
        include_reference,
    )

    client = get_openai_client()
    if not client:
        raise IllustrationError("OpenAI client is not configured", 500)

    try:
        img_resp = client.images.generate(
            model=IMAGE_MODEL,
            prompt=prompt,
            size="1024x1024",
            quality="standard",
        )
    except Exception as exc:
        raise IllustrationError("Could not render coloring art", 502) from exc

    data = img_resp.data[0]
    b64 = getattr(data, "b64_json", None)
    if not b64:
        raise IllustrationError("Image response missing image data", 502)
    _ensure_dirs()

    base_title = title_override.strip() or (
        (verses[0]["reference"] + " Coloring Sheet")
        if verses
        else "Custom Prayer Coloring Sheet"
    )
    slug = normalize_slug(base_title or f"coloring_{uuid.uuid4().hex[:8]}")
    png_filename = f"{slug}_coloring.png"
    pdf_filename = f"{slug}_coloring.pdf"
    png_path = Path("worksheets") / png_filename
    pdf_path = Path("output") / pdf_filename
    thumb_path = Path("output/thumbs") / f"{slug}_coloring.png"

    _save_png(b64, png_path)
    _make_thumbnail(png_path, thumb_path)

    reference_line = ", ".join(v["reference"] for v in verses)
    build_coloring_pdf(
        pdf_path,
        image_path=png_path,
        title=base_title,
        reference_text=reference_line if include_reference else "",
        age_bracket=age_bracket,
        summary_text=summary.get("summary", ""),
    )

    upload_to_storage(str(pdf_path), f"worksheets/{pdf_filename}")
    upload_to_storage(str(png_path), f"worksheets/{png_filename}")
    if thumb_path.exists():
        upload_to_storage(str(thumb_path), f"thumbs/{thumb_path.name}")

    if db:
        record = {
            "email": user_email,
            "verse": base_title,
            "version": "COLORING",
            "filename": pdf_filename,
            "imageFilename": png_filename,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "type": "coloring",
            "ageBracket": age_bracket,
            "includeReference": bool(include_reference),
            "coloring": {
                "summary": summary.get("summary", ""),
                "theologicalPoints": summary.get("theological_points", []),
                "symbolsOnly": blueprint["symbols_only"],
                "historicalProps": bool(blueprint["historical_props"]),
            },
            "referenceList": [v["reference"] for v in verses],
        }
        try:
            db.collection("worksheets").add(record)
        except Exception:
            pass

    return {
        "title": base_title,
        "summary": summary.get("summary", ""),
        "scene_blueprint": blueprint,
        "forced_symbols_only": forced_symbols,
        "pdf_filename": pdf_filename,
        "png_filename": png_filename,
        "references": [v["reference"] for v in verses],
    }
