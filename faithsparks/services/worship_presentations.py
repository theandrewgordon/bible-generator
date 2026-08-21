"""Safe conversion and sermon-note helpers for imported worship presentations."""

from __future__ import annotations

import json
import html
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote
from zipfile import BadZipFile, ZipFile

from PIL import Image, ImageOps
from pypdf import PdfReader


MAX_PRESENTATION_BYTES = 25 * 1024 * 1024
MAX_PRESENTATION_SLIDES = 100
MAX_PRESENTATION_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_SERMON_NOTES_CHARS = 60_000


class WorshipPresentationError(ValueError):
    """A presentation cannot be safely imported or converted."""


class WorshipPresentationDependencyError(RuntimeError):
    """The server is missing a required presentation conversion tool."""


def _resolve_binary(env_name: str, executable: str) -> str:
    configured = str(os.getenv(env_name) or "").strip()
    if configured:
        resolved = shutil.which(configured)
        if resolved:
            return resolved
        candidate = Path(configured)
        if candidate.is_file():
            return str(candidate)
        return ""
    return shutil.which(executable) or ""


def _binary(env_name: str, executable: str) -> str:
    candidate = _resolve_binary(env_name, executable)
    if not candidate:
        raise WorshipPresentationDependencyError(
            f"Presentation conversion is not installed ({executable} is unavailable)."
        )
    return candidate


def presentation_conversion_capabilities() -> dict[str, bool]:
    """Report which import formats the current server can render."""
    has_pdftoppm = bool(_resolve_binary("PDFTOPPM_BIN", "pdftoppm"))
    has_soffice = bool(_resolve_binary("SOFFICE_BIN", "soffice"))
    return {
        "pdf": has_pdftoppm,
        "pptx": has_pdftoppm and has_soffice,
    }


def validate_pptx(path: str | Path) -> None:
    """Reject malformed, macro-enabled, or expansion-heavy PPTX archives."""
    try:
        with ZipFile(path) as archive:
            infos = archive.infolist()
            names = {info.filename for info in infos}
            if "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
                raise WorshipPresentationError("That file is not a valid PowerPoint presentation.")
            if any(name.lower().endswith("vbaproject.bin") for name in names):
                raise WorshipPresentationError("Macro-enabled PowerPoint files are not supported.")
            for relationship_name in (name for name in names if name.endswith(".rels")):
                relationships = archive.read(relationship_name).decode("utf-8", errors="ignore")
                for relationship in re.findall(r"<Relationship\b[^>]+>", relationships, flags=re.I):
                    if not re.search(r'TargetMode=["\']External["\']', relationship, flags=re.I):
                        continue
                    relationship_type = re.search(r'Type=["\']([^"\']+)["\']', relationship, flags=re.I)
                    if relationship_type and relationship_type.group(1).rstrip("/").endswith("/hyperlink"):
                        continue
                    raise WorshipPresentationError(
                        "That PowerPoint links to external media. Embed the media or export the deck as PDF."
                    )
            if len(infos) > 5_000:
                raise WorshipPresentationError("That PowerPoint contains too many embedded files.")
            total_size = sum(max(0, int(info.file_size)) for info in infos)
            if total_size > MAX_PRESENTATION_UNCOMPRESSED_BYTES:
                raise WorshipPresentationError("That PowerPoint expands beyond the safe import limit.")
            for info in infos:
                compressed = max(1, int(info.compress_size))
                if info.file_size > 20 * 1024 * 1024 and info.file_size / compressed > 250:
                    raise WorshipPresentationError("That PowerPoint contains an unsafe compressed file.")
    except (BadZipFile, OSError) as exc:
        raise WorshipPresentationError("That file is not a valid PowerPoint presentation.") from exc


def extract_pptx_speaker_notes(path: str | Path) -> str:
    """Extract visible text from PPTX speaker-note XML as optional analysis input."""
    try:
        with ZipFile(path) as archive:
            names = [
                name for name in archive.namelist()
                if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", name)
            ]
            names.sort(key=lambda name: int(re.search(r"(\d+)", Path(name).stem).group(1)))
            sections: list[str] = []
            for index, name in enumerate(names, 1):
                xml = archive.read(name).decode("utf-8", errors="ignore")
                bits = [
                    re.sub(r"\s+", " ", text).strip()
                    for text in re.findall(r"<a:t>(.*?)</a:t>", xml, flags=re.S)
                ]
                bits = [
                    html.unescape(bit).strip()
                    for bit in bits
                    if bit and not re.fullmatch(r"\d+", bit)
                ]
                if bits:
                    sections.append(f"Slide {index}: " + " ".join(bits))
            return "\n\n".join(sections)[:MAX_SERMON_NOTES_CHARS]
    except (BadZipFile, OSError):
        return ""


def _validate_pdf(path: Path) -> int:
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            raise WorshipPresentationError("Password-protected PDFs are not supported.")
        count = len(reader.pages)
    except WorshipPresentationError:
        raise
    except Exception as exc:
        raise WorshipPresentationError("That file is not a valid PDF.") from exc
    if not count:
        raise WorshipPresentationError("That presentation has no slides.")
    if count > MAX_PRESENTATION_SLIDES:
        raise WorshipPresentationError(
            f"Presentations are limited to {MAX_PRESENTATION_SLIDES} slides."
        )
    return count


def render_presentation(source_path: str | Path, suffix: str, work_dir: str | Path) -> list[Path]:
    """Convert a PPTX/PDF to normalized JPEG slide images in ``work_dir``."""
    source_path = Path(source_path)
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    suffix = suffix.lower()
    if suffix not in {".pptx", ".pdf"}:
        raise WorshipPresentationError("Upload a .pptx or PDF file.")
    if source_path.stat().st_size > MAX_PRESENTATION_BYTES:
        raise WorshipPresentationError("Presentations must be 25 MB or smaller.")

    pdf_path = source_path
    if suffix == ".pptx":
        validate_pptx(source_path)
        soffice = _binary("SOFFICE_BIN", "soffice")
        profile = work_dir / "libreoffice-profile"
        profile.mkdir(exist_ok=True)
        command = [
            soffice,
            "--headless",
            "--safe-mode",
            "--nologo",
            "--nodefault",
            "--nofirststartwizard",
            f"-env:UserInstallation=file://{quote(str(profile.resolve()))}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(work_dir),
            str(source_path),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
        except subprocess.TimeoutExpired as exc:
            raise WorshipPresentationError("PowerPoint conversion timed out. Try exporting it as PDF.") from exc
        converted = work_dir / f"{source_path.stem}.pdf"
        if result.returncode != 0 or not converted.is_file():
            raise WorshipPresentationError("PowerPoint conversion failed. Try exporting it as PDF.")
        pdf_path = converted

    expected_pages = _validate_pdf(pdf_path)
    pdftoppm = _binary("PDFTOPPM_BIN", "pdftoppm")
    raster_prefix = work_dir / "rendered-slide"
    try:
        result = subprocess.run(
            [pdftoppm, "-jpeg", "-r", "144", "-jpegopt", "quality=92", str(pdf_path), str(raster_prefix)],
            capture_output=True,
            text=True,
            timeout=150,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise WorshipPresentationError("Slide rendering timed out. Try a smaller presentation.") from exc
    if result.returncode != 0:
        raise WorshipPresentationError("The presentation slides could not be rendered.")

    def page_number(path: Path) -> int:
        match = re.search(r"-(\d+)\.jpg$", path.name)
        return int(match.group(1)) if match else 0

    rasterized = sorted(work_dir.glob("rendered-slide-*.jpg"), key=page_number)
    if len(rasterized) != expected_pages:
        raise WorshipPresentationError("The presentation did not render every slide.")

    normalized: list[Path] = []
    for index, path in enumerate(rasterized, 1):
        output = work_dir / f"slide-{index:03d}.jpg"
        try:
            with Image.open(path) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
                if image.width * image.height > 20_000_000:
                    image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                image.save(output, "JPEG", quality=91, optimize=True)
        except (OSError, Image.DecompressionBombError) as exc:
            raise WorshipPresentationError(f"Slide {index} could not be read safely.") from exc
        normalized.append(output)
    return normalized


def deterministic_highlights(notes: str, limit: int = 6) -> list[str]:
    """Select concise, source-grounded lines when AI analysis is unavailable."""
    notes = re.sub(r"\r\n?", "\n", str(notes or "")).strip()[:MAX_SERMON_NOTES_CHARS]
    if not notes:
        return []
    candidates: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    chunks = re.split(r"\n+|(?<=[.!?])\s+(?=[A-Z0-9])", notes)
    for order, raw in enumerate(chunks):
        text = re.sub(r"^[\s•*\-–—\d.)]+", "", raw)
        text = re.sub(r"\s+", " ", text).strip(" \t.;")
        if len(text) < 18 or len(text) > 180:
            continue
        key = re.sub(r"[^a-z0-9]+", "", text.casefold())
        if not key or key in seen:
            continue
        seen.add(key)
        score = 0
        if re.match(r"^[•*\-–—\d.)]", raw.strip()):
            score += 4
        if re.search(r"\b(?:remember|because|therefore|truth|hope|grace|faith|love|Jesus|God|Christ)\b", text, re.I):
            score += 2
        if re.search(r"\b(?:[1-3]\s*)?[A-Z][a-z]+\s+\d+:\d+", text):
            score += 2
        if 35 <= len(text) <= 120:
            score += 2
        candidates.append((score, order, text))
    chosen = sorted(candidates, key=lambda item: (-item[0], item[1]))[: max(1, min(limit, 8))]
    chosen.sort(key=lambda item: item[1])
    return [text for _, _, text in chosen]


def suggest_sermon_highlights(notes: str, api_key: str = "", model: str = "gpt-4o-mini") -> list[str]:
    """Return editable audience-facing key points, with a deterministic fallback."""
    notes = str(notes or "").strip()[:MAX_SERMON_NOTES_CHARS]
    fallback = deterministic_highlights(notes)
    if not notes or not api_key or api_key.startswith("test-") or os.getenv("WORSHIP_NOTES_AI_ENABLED", "1") == "0":
        return fallback
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            temperature=0.1,
            response_format={"type": "json_object"},
            max_tokens=700,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You turn a pastor's sermon notes into 3 to 8 concise, audience-facing key points. "
                        "Use only claims present in the notes. Preserve Scripture references. Each point must be "
                        "a complete thought under 120 characters. Return JSON: {\"highlights\":[\"...\"]}."
                    ),
                },
                {"role": "user", "content": notes},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        raw = payload.get("highlights") if isinstance(payload, dict) else []
        highlights: list[str] = []
        for item in raw if isinstance(raw, list) else []:
            text = re.sub(r"\s+", " ", str(item or "")).strip(" •-–—")
            if 12 <= len(text) <= 160 and text not in highlights:
                highlights.append(text)
            if len(highlights) >= 8:
                break
        return highlights or fallback
    except Exception:
        return fallback
