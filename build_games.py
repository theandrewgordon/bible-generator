from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple
import random
import string

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


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


def _load_image(path: str):
    try:
        return ImageReader(path)
    except Exception:
        return None


def generate_match_game_pdf(
    title: str,
    references: List[str],
    verses: List[MatchItem],
    answer_key: List[int],
    pdf_path: str,
    directions_text: str = "Draw a line to match each Bible reference (left) to the correct verse (right).",
    show_version: bool = True,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    # Brand assets
    logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
    qr_reader = _load_image("faithsparks_qr.png")
    logo_size = 42
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size + 4, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size + 4, width=logo_size, height=logo_size)

    # Title block
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, title)
    y -= 10
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    c.setFillGray(0)
    y -= logo_size + 4

    # Directions
    directions_h = 0.38 * inch
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin + 10, y - 14, "Directions:")
    c.setFont("Helvetica", 10)
    c.drawString(margin + 80, y - 14, directions_text)
    y -= directions_h + 10

    # Table layout
    left_width = 1.7 * inch
    gap = 0.2 * inch
    right_width = usable_width - left_width - gap
    font_left = ("Helvetica-Bold", 9)
    font_right = ("Helvetica", 8)
    pad_x = 5
    pad_y = 5

    rows: List[Tuple[List[str], List[str]]] = []
    for idx, ref in enumerate(references, start=1):
        left_text = f"{chr(64 + idx)}. {ref}"
        verse_item = verses[idx - 1]
        label = f" ({verse_item.version.upper()})" if (show_version and verse_item.version) else ""
        right_text = f"{idx}. {verse_item.text}{label}"
        left_lines = _wrap_text(left_text, font_left[0], font_left[1], left_width - 2 * pad_x)
        right_lines = _wrap_text(right_text, font_right[0], font_right[1], right_width - 2 * pad_x)
        rows.append((left_lines, right_lines))

    line_h_left = font_left[1] + 2
    line_h_right = font_right[1] + 2

    table_top = y
    row_heights = []
    for left_lines, right_lines in rows:
        row_height = max(len(left_lines) * line_h_left, len(right_lines) * line_h_right) + pad_y * 2
        row_heights.append(row_height)

    bottom_limit = 1.6 * inch
    available_height = table_top - bottom_limit
    if available_height > 0:
        total_height = sum(row_heights)
        if total_height < available_height and row_heights:
            extra = (available_height - total_height) / len(row_heights)
            row_heights = [h + extra for h in row_heights]

    for (left_lines, right_lines), row_height in zip(rows, row_heights):
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

    # Divider line above answer key
    divider_y = 1.22 * inch
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.line(margin, divider_y, width - margin, divider_y)
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, divider_y + 6, "Answer key (flip page)")

    # Upside-down answer key at bottom (easy cut/flip)
    key = ", ".join(
        [f"{chr(64 + i)} -> {answer_key[i - 1]}" for i in range(1, len(references) + 1)]
    )
    key_lines = _wrap_text(f"Answer key: {key}", "Helvetica", 8, width - 2 * margin)
    c.saveState()
    c.translate(width / 2, 0.75 * inch)
    c.rotate(180)
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    for idx, line in enumerate(key_lines):
        c.drawCentredString(0, idx * 10, line)
    c.restoreState()

    # Border + Footer
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)
    code = "".join([ch for ch in title.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
    c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")
    c.save()


def _place_word(grid, word, rng, directions):
    size = len(grid)
    attempts = 120
    word = word.upper()
    for _ in range(attempts):
        dx, dy = rng.choice(directions)
        if dx == 0 and dy == 0:
            continue
        max_x = size - 1 if dx <= 0 else size - len(word)
        max_y = size - 1 if dy <= 0 else size - len(word)
        x = rng.randint(0, max_x)
        y = rng.randint(0, max_y)
        ok = True
        for i, ch in enumerate(word):
            xx = x + dx * i
            yy = y + dy * i
            if not (0 <= xx < size and 0 <= yy < size):
                ok = False
                break
            existing = grid[yy][xx]
            if existing not in ("", ch):
                ok = False
                break
        if not ok:
            continue
        for i, ch in enumerate(word):
            xx = x + dx * i
            yy = y + dy * i
            grid[yy][xx] = ch
        return True
    return False


def generate_word_search_pdf(title: str, words: List[str], pdf_path: str, size: int = 12) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
    qr_reader = _load_image("faithsparks_qr.png")
    logo_size = 42
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size + 4, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size + 4, width=logo_size, height=logo_size)

    # Title block
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, title)
    y -= 10
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    c.setFillGray(0)
    y -= logo_size + 4

    # Directions
    directions_h = 0.38 * inch
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin + 10, y - 14, "Directions:")
    c.setFont("Helvetica", 10)
    c.drawString(
        margin + 80,
        y - 14,
        "Circle each word in the puzzle. Words can go forward, backward, or diagonal.",
    )
    y -= directions_h + 10

    # Build grid
    rng = random.Random(title)
    grid = [["" for _ in range(size)] for _ in range(size)]
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    clean_words = []
    for w in words:
        w = "".join([ch for ch in w.upper() if ch.isalpha()])
        if 3 <= len(w) <= size:
            clean_words.append(w)
    clean_words = clean_words[:12]

    for w in clean_words:
        _place_word(grid, w, rng, directions)
    for y_idx in range(size):
        for x_idx in range(size):
            if not grid[y_idx][x_idx]:
                grid[y_idx][x_idx] = rng.choice(string.ascii_uppercase)

    # Draw grid
    cell = 0.32 * inch
    grid_size_px = size * cell
    start_x = margin
    start_y = y - grid_size_px
    c.setFont("Helvetica-Bold", 9)
    for row in range(size):
        for col in range(size):
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 3, grid[row][col])

    # Word list
    list_x = start_x + grid_size_px + 0.4 * inch
    list_y = start_y + grid_size_px - 10
    c.setFont("Helvetica-Bold", 10)
    c.drawString(list_x, list_y, "Find these words:")
    list_y -= 12
    c.setFont("Helvetica", 9)
    for word in clean_words:
        c.drawString(list_x, list_y, word.title())
        list_y -= 12

    # Border + Footer
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)
    code = "".join([ch for ch in title.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
    c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")
    c.save()
