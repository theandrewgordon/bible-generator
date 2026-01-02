from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


@dataclass
class MatchItem:
    text: str
    version: str


def _wrap_text(text: str, font: str, size: int, max_width: float) -> List[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: List[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if stringWidth(test, font, size) <= max_width:
            current = test
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def generate_match_game_pdf(
    title: str,
    references: List[str],
    verses: List[MatchItem],
    answer_key: List[int],
    pdf_path: str,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    # Title block
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, title)
    y -= 14
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    c.setFillGray(0)
    y -= 20

    # Directions
    directions_h = 0.45 * inch
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin + 10, y - 14, "Directions:")
    c.setFont("Helvetica", 10)
    c.drawString(
        margin + 80,
        y - 14,
        "Draw a line to match each Bible reference (left) to the correct verse (right).",
    )
    y -= directions_h + 10

    # Table layout
    left_width = 1.7 * inch
    gap = 0.2 * inch
    right_width = usable_width - left_width - gap
    font_left = ("Helvetica-Bold", 10)
    font_right = ("Helvetica", 9)
    pad_x = 6
    pad_y = 6

    rows: List[Tuple[List[str], List[str]]] = []
    for idx, ref in enumerate(references, start=1):
        left_text = f"{chr(64 + idx)}. {ref}"
        verse_item = verses[idx - 1]
        right_text = f"{idx}. {verse_item.text} ({verse_item.version.upper()})"
        left_lines = _wrap_text(left_text, font_left[0], font_left[1], left_width - 2 * pad_x)
        right_lines = _wrap_text(right_text, font_right[0], font_right[1], right_width - 2 * pad_x)
        rows.append((left_lines, right_lines))

    line_h_left = font_left[1] + 2
    line_h_right = font_right[1] + 3

    table_top = y
    for left_lines, right_lines in rows:
        row_height = max(len(left_lines) * line_h_left, len(right_lines) * line_h_right) + pad_y * 2
        y_next = y - row_height

        # Row border
        c.rect(margin, y_next, usable_width, row_height)
        # Divider
        c.line(margin + left_width, y_next, margin + left_width, y)

        # Left cell
        c.setFont(font_left[0], font_left[1])
        ly = y - pad_y - font_left[1]
        for line in left_lines:
            c.drawString(margin + pad_x, ly, line)
            ly -= line_h_left

        # Right cell
        c.setFont(font_right[0], font_right[1])
        ry = y - pad_y - font_right[1]
        for line in right_lines:
            c.drawString(margin + left_width + gap + pad_x, ry, line)
            ry -= line_h_right

        y = y_next

    # Answer key
    y -= 18
    c.roundRect(margin, y - 16, usable_width, 0.3 * inch, radius=8)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin + 10, y - 6, "Answer key:")
    c.setFont("Helvetica", 9)
    key = ", ".join(
        [f"{chr(64 + i)} → {answer_key[i - 1]}" for i in range(1, len(references) + 1)]
    )
    c.drawString(margin + 80, y - 6, key)

    # Footer
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")
    c.save()
