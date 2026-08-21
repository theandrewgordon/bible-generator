"""Compact, musician-friendly PDF rendering for worship chord charts."""

from __future__ import annotations

import re
import unicodedata
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


_DARK = HexColor("#0f172a")
_MUTED = HexColor("#52637a")
_ACCENT = HexColor("#1d4ed8")
_RULE = HexColor("#cbd5e1")
_REPEAT_BG = HexColor("#eef2f7")
_CHORD_FONT = "Helvetica-Bold"
_LYRIC_FONT = "Helvetica"
_CHORD_SIZE = 8.6
_LYRIC_SIZE = 11.5
_SONG_ROW_HEIGHT = 22.5
_SECTION_GAP = 8.0


def _safe_text(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    replacements = {
        "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-",
        "·": "-", "…": "...", "\u00a0": " ", "\u200b": "",
    }
    for source, replacement in replacements.items():
        text = text.replace(source, replacement)
    return text.encode("cp1252", "replace").decode("cp1252")


def _wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    words = _safe_text(text).split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _song_rows(segments: list[dict[str, str]], width: float) -> list[list[dict[str, str]]]:
    rows: list[list[dict[str, str]]] = []
    current: list[dict[str, str]] = []
    used = 0.0
    for segment in segments:
        chord = _safe_text(segment.get("chord", ""))
        lyric = _safe_text(segment.get("lyric", ""))
        segment_width = max(
            stringWidth(chord, _CHORD_FONT, _CHORD_SIZE),
            stringWidth(lyric or " ", _LYRIC_FONT, _LYRIC_SIZE),
        ) + 2.5
        if current and used + segment_width > width:
            rows.append(current)
            current = []
            used = 0.0
        current.append({"chord": chord, "lyric": lyric, "width": segment_width})
        used += segment_width
    if current:
        rows.append(current)
    return rows or [[]]


def _line_height(line: dict, width: float) -> float:
    kind = line.get("kind")
    if kind == "song":
        return len(_song_rows(line.get("segments", []), width)) * _SONG_ROW_HEIGHT
    if kind == "lyrics":
        return 14.5 * len(_wrap_text(line.get("text", ""), _LYRIC_FONT, _LYRIC_SIZE, width))
    if kind in {"chords", "progression"}:
        return 10.5 * len(_wrap_text(line.get("text", ""), _CHORD_FONT, _CHORD_SIZE, width))
    if kind == "note":
        return 10.0 * len(_wrap_text(line.get("text", ""), "Helvetica-Oblique", 7.8, width))
    if kind == "spacer":
        return 3.5
    return 0.0


def _section_height(section: dict, width: float) -> float:
    if section.get("repeat"):
        return 14.0
    heading = 14.0 if section.get("title") else 0.0
    return heading + sum(_line_height(line, width) for line in section.get("lines", [])) + _SECTION_GAP


def _draw_song_line(pdf: canvas.Canvas, line: dict, x: float, y: float, width: float) -> float:
    for row in _song_rows(line.get("segments", []), width):
        cursor = x
        pdf.setFillColor(_ACCENT)
        pdf.setFont(_CHORD_FONT, _CHORD_SIZE)
        for segment in row:
            if segment["chord"]:
                pdf.drawString(cursor, y, segment["chord"])
            cursor += segment["width"]
        cursor = x
        pdf.setFillColor(_DARK)
        pdf.setFont(_LYRIC_FONT, _LYRIC_SIZE)
        for segment in row:
            pdf.drawString(cursor, y - 10.0, segment["lyric"])
            cursor += segment["width"]
        y -= _SONG_ROW_HEIGHT
    return y


def _draw_section(pdf: canvas.Canvas, section: dict, x: float, y: float, width: float) -> float:
    title = _safe_text(section.get("title", "")).upper()
    if section.get("repeat"):
        pdf.setFillColor(_REPEAT_BG)
        pill_width = min(width, stringWidth(title, "Helvetica-Bold", 7.6) + 14)
        pdf.roundRect(x, y - 10, pill_width, 14, 4, stroke=0, fill=1)
        pdf.setFillColor(_MUTED)
        pdf.setFont("Helvetica-Bold", 7.3)
        pdf.drawString(x + 7, y - 7, title)
        return y - 14
    if title:
        pdf.setFillColor(_MUTED)
        pdf.setFont("Helvetica-Bold", 7.4)
        pdf.drawString(x, y, title)
        rule_start = x + min(width * .46, stringWidth(title, "Helvetica-Bold", 7.4) + 9)
        pdf.setStrokeColor(_RULE)
        pdf.setLineWidth(.45)
        pdf.line(rule_start, y + 1.5, x + width, y + 1.5)
        y -= 13.0
    for line in section.get("lines", []):
        kind = line.get("kind")
        if kind == "song":
            y = _draw_song_line(pdf, line, x, y, width)
        elif kind == "lyrics":
            pdf.setFillColor(_DARK)
            pdf.setFont(_LYRIC_FONT, _LYRIC_SIZE)
            for wrapped in _wrap_text(line.get("text", ""), _LYRIC_FONT, _LYRIC_SIZE, width):
                pdf.drawString(x, y - 10, wrapped)
                y -= 14.5
        elif kind in {"chords", "progression"}:
            pdf.setFillColor(_ACCENT)
            pdf.setFont(_CHORD_FONT, _CHORD_SIZE)
            for wrapped in _wrap_text(line.get("text", ""), _CHORD_FONT, _CHORD_SIZE, width):
                pdf.drawString(x, y - 7, wrapped)
                y -= 10.5
        elif kind == "note":
            pdf.setFillColor(_MUTED)
            pdf.setFont("Helvetica-Oblique", 7.8)
            for wrapped in _wrap_text(line.get("text", ""), "Helvetica-Oblique", 7.8, width):
                pdf.drawString(x, y - 7, wrapped)
                y -= 10
        elif kind == "spacer":
            y -= 3.5
    return y - _SECTION_GAP


def _meta_lines(metadata: dict, width: float) -> list[str]:
    fields = []
    for label, name in (
        ("CCLI", "ccli_song_number"), ("BPM", "bpm"), ("Time", "time_signature"),
        ("Writers", "writers"), ("Themes", "themes"), ("Scripture", "scripture"),
    ):
        if metadata.get(name):
            fields.append(f"{label}: {metadata[name]}")
    return _wrap_text("  |  ".join(fields), "Helvetica", 7.1, width) if fields else []


def _title_mentions_key(title: str, key: str) -> bool:
    return bool(key and re.search(rf"\bkey\s+(?:of\s+)?{re.escape(key)}(?![A-Za-z0-9#b])", title, flags=re.I))


def build_chord_chart_pdf(
    *, song: dict, resource: dict, sections: list[dict], target_key: str, metadata: dict
) -> BytesIO:
    """Build a clean chart PDF with automatic one-page/two-column fitting."""
    page_width, page_height = letter
    margin_x = .48 * inch
    top = page_height - .42 * inch
    bottom = .42 * inch
    full_width = page_width - 2 * margin_x
    gap = .30 * inch
    column_width = (full_width - gap) / 2
    title = _safe_text(song.get("title") or "Chord Chart")
    resource_title = _safe_text(resource.get("title") or "")
    subtitle = resource_title
    if target_key and not _title_mentions_key(resource_title, target_key):
        subtitle = f"{subtitle} - Key {target_key}" if subtitle else f"Key {target_key}"

    metadata = dict(metadata or {})
    metadata_lines = _meta_lines(metadata, full_width)
    header_height = 44 + len(metadata_lines) * 9
    body_top = top - header_height
    available = body_top - bottom
    total_one_column = sum(_section_height(section, full_width) for section in sections)
    use_columns = total_one_column > available * .86
    content_width = column_width if use_columns else full_width

    pdf_buffer = BytesIO()
    pdf = canvas.Canvas(pdf_buffer, pagesize=letter, pageCompression=1)
    pdf.setTitle(f"{title} - {target_key}" if target_key else title)

    def draw_header(continued: bool = False) -> float:
        y = top
        pdf.setFillColor(_DARK)
        pdf.setFont("Helvetica-Bold", 19 if not continued else 13)
        pdf.drawString(margin_x, y, title + (" (continued)" if continued else ""))
        y -= 16 if continued else 18
        if not continued and subtitle:
            pdf.setFillColor(_MUTED)
            pdf.setFont("Helvetica", 8.3)
            pdf.drawString(margin_x, y, subtitle)
            y -= 12
        if not continued:
            pdf.setFillColor(_MUTED)
            pdf.setFont("Helvetica", 7.1)
            for meta_line in metadata_lines:
                pdf.drawString(margin_x, y, meta_line)
                y -= 9
        pdf.setStrokeColor(_RULE)
        pdf.setLineWidth(.6)
        pdf.line(margin_x, y - 2, page_width - margin_x, y - 2)
        return y - 14

    y_top = draw_header()
    if not sections:
        pdf.save()
        pdf_buffer.seek(0)
        return pdf_buffer

    if use_columns and sum(_section_height(section, content_width) for section in sections) <= available * 2:
        heights = [_section_height(section, content_width) for section in sections]
        best_split = min(
            range(1, len(sections) + 1),
            key=lambda index: abs(sum(heights[:index]) - sum(heights[index:])),
        )
        if best_split < len(sections) and sections[best_split - 1].get("repeat"):
            best_split -= 1
        columns = [sections[:best_split], sections[best_split:]]
        for column_index, column_sections in enumerate(columns):
            x = margin_x + column_index * (content_width + gap)
            y = y_top
            for section in column_sections:
                y = _draw_section(pdf, section, x, y, content_width)
    else:
        columns_per_page = 2 if use_columns else 1
        column_index = 0
        x = margin_x
        y = y_top
        for section_index, section in enumerate(sections):
            section_height = _section_height(section, content_width)
            next_height = _section_height(sections[section_index + 1], content_width) if section.get("repeat") and section_index + 1 < len(sections) else 0
            if y - section_height - next_height < bottom and y < y_top:
                column_index += 1
                if column_index >= columns_per_page:
                    pdf.showPage()
                    y_top = draw_header(continued=True)
                    column_index = 0
                x = margin_x + column_index * (content_width + gap)
                y = y_top
            y = _draw_section(pdf, section, x, y, content_width)

    pdf.save()
    pdf_buffer.seek(0)
    return pdf_buffer
