"""AI-assisted coloring sheet pipeline."""

from __future__ import annotations

import base64
import json
import os
import uuid
import logging
import time
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image
from openai import APIConnectionError, APITimeoutError, RateLimitError

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
from faithsparks.util.request_utils import extract_json_candidate

MAX_CUSTOM_TEXT_CHARS = 500
MAX_VERSE_REFERENCES = 4
TEXT_MODEL = os.getenv("ILLUSTRATE_TEXT_MODEL", "gpt-4.1-mini")
TEXT_MODEL_FALLBACK = os.getenv("ILLUSTRATE_TEXT_FALLBACK", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("ILLUSTRATE_IMAGE_MODEL", "gpt-image-1")
PRIMARY_VERSION = os.getenv("ILLUSTRATE_PRIMARY_VERSION", "kjv")
COMPARE_VERSION = os.getenv("ILLUSTRATE_COMPARE_VERSION")
IMAGE_SIZE_SETTING = (os.getenv("ILLUSTRATE_IMAGE_SIZE", "1024x1024") or "").lower()
IMAGE_REQ_TIMEOUT = float(os.getenv("ILLUSTRATE_IMAGE_TIMEOUT", "12"))
TEXT_REQ_TIMEOUT = float(os.getenv("ILLUSTRATE_TEXT_TIMEOUT", "8"))


def _brand_asset_path(env_key: str, fallback: str | None) -> Path | None:
    raw = os.getenv(env_key)
    candidate = (raw or "").strip() or (fallback or "")
    return Path(candidate) if candidate else None


LOGO_ASSET_PATH = _brand_asset_path("ILLUSTRATE_LOGO_ASSET", "faith_sparks_logo.png")
QR_ASSET_PATH = _brand_asset_path("ILLUSTRATE_QR_ASSET", "faithsparks_qr.png")

logger = logging.getLogger(__name__)
IMAGE_RETRY_DELAY = float(os.getenv("ILLUSTRATE_IMAGE_RETRY_DELAY", "0.8"))
IMAGE_MAX_ATTEMPTS = int(os.getenv("ILLUSTRATE_IMAGE_ATTEMPTS", "1"))

_ALLOWED_IMAGE_SIZES = {
    "1024": "1024x1024",
    "1024x1024": "1024x1024",
    "square": "1024x1024",
    "landscape": "1536x1024",
    "1536x1024": "1536x1024",
    "portrait": "1024x1536",
    "1024x1536": "1024x1536",
}
RESOLVED_IMAGE_SIZE = _ALLOWED_IMAGE_SIZES.get(IMAGE_SIZE_SETTING, "1024x1024")
if IMAGE_SIZE_SETTING and IMAGE_SIZE_SETTING not in _ALLOWED_IMAGE_SIZES:
    logger.warning(
        "ILLUSTRATE_IMAGE_SIZE '%s' is not supported. Falling back to %s.",
        IMAGE_SIZE_SETTING,
        RESOLVED_IMAGE_SIZE,
    )
IMAGE_SIZE = RESOLVED_IMAGE_SIZE


def _generate_image_with_retry(client, **kwargs):
    """Call OpenAI Images with a small retry window for transient issues."""
    kwargs.pop("quality", None)  # high quality is slower + error-prone
    kwargs["n"] = 1
    last_exc: Exception | None = None
    timed_client = client.with_options(timeout=IMAGE_REQ_TIMEOUT)
    for attempt in range(1, IMAGE_MAX_ATTEMPTS + 1):
        start = time.perf_counter()
        try:
            response = timed_client.images.generate(**kwargs)
            elapsed = time.perf_counter() - start
            logger.info(
                "Illustrate image attempt %s/%s succeeded in %.2fs (size=%s)",
                attempt,
                IMAGE_MAX_ATTEMPTS,
                elapsed,
                kwargs.get("size"),
            )
            return response
        except (APITimeoutError, APIConnectionError) as exc:
            elapsed = time.perf_counter() - start
            last_exc = exc
            logger.warning(
                "Illustrate image attempt %s/%s timed out after %.2fs: %s",
                attempt,
                IMAGE_MAX_ATTEMPTS,
                elapsed,
                exc,
            )
            if attempt < IMAGE_MAX_ATTEMPTS and IMAGE_RETRY_DELAY > 0:
                time.sleep(IMAGE_RETRY_DELAY)
        except RateLimitError as exc:
            elapsed = time.perf_counter() - start
            last_exc = exc
            logger.warning(
                "Illustrate image attempt %s/%s rate limited after %.2fs: %s",
                attempt,
                IMAGE_MAX_ATTEMPTS,
                elapsed,
                exc,
            )
            break
        except Exception as exc:  # pylint: disable=broad-except
            elapsed = time.perf_counter() - start
            last_exc = exc
            logger.exception(
                "Illustrate image attempt %s/%s failed after %.2fs: %s",
                attempt,
                IMAGE_MAX_ATTEMPTS,
                elapsed,
                exc,
            )
            break
    if last_exc:
        raise last_exc
    raise RuntimeError("Image generation failed with unknown error")

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
    """Make sure the worksheet and output folders exist before saving files."""
    Path("worksheets").mkdir(parents=True, exist_ok=True)
    Path("output").mkdir(parents=True, exist_ok=True)
    Path("output/thumbs").mkdir(parents=True, exist_ok=True)


def detect_blocked_term(text: str) -> str | None:
    """Return a blocked term that appears in the text, if any."""
    lowered = (text or "").lower()
    for term in BLOCKED_WORDS:
        if term in lowered:
            return term
    return None


def _extract_response_text(resp) -> str:
    """Flatten OpenAI Responses output into a single text blob."""
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
    """Use OpenAI Responses to create a safe summary + theological notes for the scene."""
    client = get_openai_client()
    if not client:
        raise IllustrationError("OpenAI client is not configured", 500)
    text_client = client.with_options(timeout=TEXT_REQ_TIMEOUT)

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

    errors: List[str] = []
    models = []
    if TEXT_MODEL:
        models.append(TEXT_MODEL)
    if TEXT_MODEL_FALLBACK and TEXT_MODEL_FALLBACK not in models:
        models.append(TEXT_MODEL_FALLBACK)

    last_raw = None
    def _call_response(model_name: str):
        request_input = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Age bracket: {age_bracket}\n"
                    "Summarize the following content for a black-and-white coloring sheet:\n\n"
                    f"{prompt_text[:4000]}"
                ),
            },
        ]
        base_kwargs = {
            "model": model_name,
            "temperature": 0.3,
            "input": request_input,
        }
        response_format = {"type": "json_schema", "json_schema": schema}
        create_kwargs = dict(base_kwargs)
        create_kwargs["response_format"] = response_format
        try:
            return text_client.responses.create(**create_kwargs)
        except (APITimeoutError, APIConnectionError) as exc:
            logger.warning("Illustrate summary via %s timed out: %s", model_name, exc)
            raise IllustrationError(
                "Summary generation timed out. Please try again.",
                504,
                {"details": [f"{model_name}: {str(exc)[:200]}"]},
            ) from exc
        except TypeError as exc:
            if "response_format" in str(exc):
                parse_kwargs = dict(base_kwargs)
                if hasattr(text_client.responses, "parse"):
                    try:
                        return text_client.responses.parse(**parse_kwargs)
                    except TypeError:
                        pass
                # older SDK: fall back to chat completions asking for JSON
                chat_messages = [
                    {"role": "system", "content": system_prompt + " Return strict JSON matching the provided schema."},
                    request_input[1],
                ]
                completion = text_client.chat.completions.create(
                    model=model_name,
                    temperature=0.3,
                    messages=chat_messages,
                )
                class _Wrapper:
                    def __init__(self, text):
                        self.output = []
                        self.output_text = text

                text = ""
                if completion.choices:
                    text = completion.choices[0].message.content or ""
                if not text.strip():
                    raise IllustrationError(
                        "Illustration summary was empty.",
                        422,
                        {"details": [f"{model_name}: chat completion returned no text"]},
                    )
                return _Wrapper(text)
            raise

    for model in models:
        try:
            resp = _call_response(model)
            raw = _extract_response_text(resp)
            last_raw = raw
            if not raw.strip():
                raise IllustrationError(
                    "Illustration summary was empty.",
                    422,
                    {"details": [f"{model}: empty response"]},
                )
            return _parse_summary_json(raw)
        except IllustrationError:
            raise
        except Exception as exc:
            msg = f"{model}: {exc}"
            errors.append(msg)
            logger.warning("Illustrate summary failed via %s: %s", model, exc)
            continue

    detail = {"details": errors}
    if last_raw:
        detail["raw"] = last_raw
    raise IllustrationError("Unable to summarize passage with available models.", 422, detail)


def build_scene_blueprint(
    summary_payload: Dict,
    *,
    age_bracket: str,
    user_symbols_only: bool,
    allow_historical_props: bool,
) -> Tuple[Dict, bool]:
    """Translate the AI summary into concrete art direction plus guardrail flags."""
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
    """Build the natural-language instruction that is sent to the image model."""
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
    """Persist the generated PNG to disk."""
    binary = base64.b64decode(b64_data)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(binary)


def _make_thumbnail(src: Path, dest: Path) -> None:
    """Create a small grayscale preview for the worksheet history."""
    try:
        with Image.open(src) as img:
            img = img.convert("L")
            img.thumbnail((560, 420))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, format="PNG")
    except Exception:
        pass


def _brand_coloring_image(target: Path) -> None:
    """Overlay Faith Sparks logo + QR onto the generated PNG."""
    if not target.exists():
        return

    assets: List[Tuple[str, Path]] = []
    for alignment, asset_path in (("left", LOGO_ASSET_PATH), ("right", QR_ASSET_PATH)):
        if asset_path and asset_path.exists():
            assets.append((alignment, asset_path))

    if not assets:
        return

    try:
        with Image.open(target) as base_img:
            base = base_img.convert("RGBA")
            width, height = base.size
            margin = max(24, int(min(width, height) * 0.035))
            max_dim = max(80, int(min(width, height) * 0.18))

            for alignment, asset_path in assets:
                try:
                    with Image.open(asset_path) as overlay_img:
                        overlay = overlay_img.convert("RGBA")
                except Exception:
                    logger.warning("Illustrate branding asset failed to load: %s", asset_path, exc_info=True)
                    continue

                overlay.thumbnail((max_dim, max_dim), Image.LANCZOS)
                ow, oh = overlay.size
                if not ow or not oh:
                    continue
                if alignment == "left":
                    position = (margin, margin)
                else:
                    position = (width - margin - ow, margin)
                base.paste(overlay, position, overlay)

            branded = base.convert("RGB")
            branded.save(target)
    except Exception:
        logger.exception("Failed adding branding overlays to %s", target)


def _coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return bool(value) if value is not None else default


def _compose_source_blocks(verses: List[Dict], custom_text: str) -> str:
    """Combine Bible text and custom text into a single prompt source string."""
    blocks: List[str] = []
    for item in verses:
        compare = item.get("compare")
        compare_line = f"\nESV: {compare}" if compare else ""
        blocks.append(f"{item['reference']} ({item['version']}): {item['text']}{compare_line}")
    if custom_text:
        blocks.append(f"Custom text: {custom_text}")
    return "\n\n".join(blocks)


def _fetch_compare_text(reference: str) -> str | None:
    """Fetch a comparison translation when configured."""
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
    """Primary entry point for the Illustrate feature."""
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
    guardrails: List[str] = []
    if forced_symbols and not symbols_only:
        guardrails.append("symbols_only_forced")
        logger.info(
            "Illustrate guardrail: forcing symbols-only for refs=%s due to sensitivity flags",
            [v["reference"] for v in verses] or ["custom_text"],
        )
    if historical_props and not blueprint["historical_props"]:
        guardrails.append("historical_props_removed")
        logger.info(
            "Illustrate guardrail: removing historical props for refs=%s (symbols_only=%s)",
            [v["reference"] for v in verses] or ["custom_text"],
            blueprint["symbols_only"],
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
        img_resp = _generate_image_with_retry(
            client,
            model=IMAGE_MODEL,
            prompt=prompt,
            size=RESOLVED_IMAGE_SIZE,
            n=1,
        )
    except RateLimitError as exc:
        raise IllustrationError(
            "Illustrate is temporarily rate-limited. Please try again shortly.",
            429,
            {"details": [str(exc)[:200]]},
        ) from exc
    except (APITimeoutError, APIConnectionError) as exc:
        raise IllustrationError(
            "Image generation timed out. Please try again.",
            504,
            {"details": [str(exc)[:200]]},
        ) from exc
    except Exception as exc:  # pylint: disable=broad-except
        raise IllustrationError(
            "Could not render coloring art",
            500,
            {"details": [str(exc)[:200]]},
        ) from exc

    data = img_resp.data[0]
    b64 = getattr(data, "b64_json", None)
    if not b64:
        raise IllustrationError(
            "Image response missing image data",
            500,
            {"details": ["OpenAI response missing b64_json payload"]},
        )
    _ensure_dirs()

    base_title = title_override.strip() or (
        (verses[0]["reference"] + " Coloring Sheet")
        if verses
        else "Custom Prayer Coloring Sheet"
    )
    base_slug = normalize_slug(base_title or "coloring")
    unique_suffix = uuid.uuid4().hex[:6]
    slug = f"{base_slug}-{unique_suffix}"
    png_filename = f"{slug}.png"
    pdf_filename = f"{slug}.pdf"
    png_path = Path("worksheets") / png_filename
    pdf_path = Path("output") / pdf_filename
    thumb_path = Path("output/thumbs") / f"{slug}_coloring.png"

    _save_png(b64, png_path)
    _brand_coloring_image(png_path)
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
            "guardrails": guardrails,
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
        "guardrails": guardrails,
        "pdf_filename": pdf_filename,
        "png_filename": png_filename,
        "references": [v["reference"] for v in verses],
    }
def _parse_summary_json(raw: str) -> Dict:
    """Load JSON, falling back to extracting best-effort dictionary."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        candidate = extract_json_candidate(raw)
        if isinstance(candidate, dict):
            return candidate
        raise
