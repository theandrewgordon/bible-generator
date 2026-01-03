from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple
import math
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


@dataclass
class CrosswordEntry:
    word: str
    clue: str
    row: int
    col: int
    direction: str


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


def _draw_section_label(c, x: float, y: float, text: str):
    label_w = stringWidth(text, "Helvetica-Bold", 8) + 14
    label_h = 14
    c.setFillGray(0.97)
    c.roundRect(x, y - label_h + 3, label_w, label_h, radius=7, fill=1, stroke=0)
    c.setFillGray(0.45)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 7, y - 7, text)
    c.setFillGray(0)
    return label_w


def _load_image(path: str):
    try:
        return ImageReader(path)
    except Exception:
        return None


def _can_place_crossword_word(grid, word: str, row: int, col: int, direction: str) -> bool:
    size = len(grid)
    dr = 0 if direction == "across" else 1
    dc = 1 if direction == "across" else 0
    for i, ch in enumerate(word):
        r = row + dr * i
        c = col + dc * i
        if r < 0 or c < 0 or r >= size or c >= size:
            return False
        existing = grid[r][c]
        if existing not in ("", ch):
            return False
    # Ensure word does not run into another letter on either end
    before_r = row - dr
    before_c = col - dc
    after_r = row + dr * len(word)
    after_c = col + dc * len(word)
    if 0 <= before_r < size and 0 <= before_c < size and grid[before_r][before_c]:
        return False
    if 0 <= after_r < size and 0 <= after_c < size and grid[after_r][after_c]:
        return False
    return True


def _place_crossword_word(grid, word: str, row: int, col: int, direction: str) -> None:
    dr = 0 if direction == "across" else 1
    dc = 1 if direction == "across" else 0
    for i, ch in enumerate(word):
        r = row + dr * i
        c = col + dc * i
        grid[r][c] = ch


def _build_crossword_layout(words: List[str], size: int = 13) -> Tuple[List[List[str]], List[CrosswordEntry]]:
    grid = [["" for _ in range(size)] for _ in range(size)]
    entries: List[CrosswordEntry] = []
    if not words:
        return grid, entries

    sorted_words = sorted(words, key=len, reverse=True)
    first = sorted_words[0].upper()
    start_col = max(0, (size - len(first)) // 2)
    start_row = size // 2
    if _can_place_crossword_word(grid, first, start_row, start_col, "across"):
        _place_crossword_word(grid, first, start_row, start_col, "across")
        entries.append(CrosswordEntry(word=first, clue="", row=start_row, col=start_col, direction="across"))

    for word in sorted_words[1:]:
        word = word.upper()
        placed = False
        for r in range(size):
            for c in range(size):
                if grid[r][c] and grid[r][c] in word:
                    for idx, ch in enumerate(word):
                        if ch != grid[r][c]:
                            continue
                        # Try place vertically
                        row = r - idx
                        col = c
                        if _can_place_crossword_word(grid, word, row, col, "down"):
                            _place_crossword_word(grid, word, row, col, "down")
                            entries.append(CrosswordEntry(word=word, clue="", row=row, col=col, direction="down"))
                            placed = True
                            break
                        # Try place horizontally
                        row = r
                        col = c - idx
                        if _can_place_crossword_word(grid, word, row, col, "across"):
                            _place_crossword_word(grid, word, row, col, "across")
                            entries.append(CrosswordEntry(word=word, clue="", row=row, col=col, direction="across"))
                            placed = True
                            break
                    if placed:
                        break
            if placed:
                break
    return grid, entries


def _number_crossword_entries(entries: List[CrosswordEntry]) -> Tuple[dict, List[CrosswordEntry], List[CrosswordEntry]]:
    positions = {}
    for entry in entries:
        positions.setdefault((entry.row, entry.col), []).append(entry)
    numbered = {}
    number = 1
    for (row, col) in sorted(positions.keys()):
        numbered[(row, col)] = number
        number += 1
    across = []
    down = []
    for entry in entries:
        num = numbered.get((entry.row, entry.col), 0)
        if entry.direction == "across":
            across.append((num, entry))
        else:
            down.append((num, entry))
    across.sort(key=lambda x: x[0])
    down.sort(key=lambda x: x[0])
    return numbered, [e for _, e in across], [e for _, e in down]


def generate_match_game_pdf(
    title: str,
    references: List[str],
    verses: List[MatchItem],
    answer_key: List[int],
    pdf_path: str,
    directions_text: str = "Draw a line to match each Bible reference (left) to the correct verse (right).",
    show_version: bool = True,
    subtitle: str | None = None,
    print_tip: str = "Print tip: Use pencil so kids can erase.",
    difficulty_note: str | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    logo_size = 42

    def draw_footer(title_text: str):
        c.setStrokeGray(0.88)
        c.setLineWidth(0.6)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")

    # Brand assets
    logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
    qr_reader = _load_image("faithsparks_qr.png")
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size + 4, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size + 4, width=logo_size, height=logo_size)

    # Title block
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, title)
    y -= 12
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    if subtitle:
        y -= 12
        c.setFont("Helvetica-Oblique", 9)
        c.setFillGray(0.35)
        c.drawCentredString(width / 2, y, subtitle)
    c.setFillGray(0)
    y -= logo_size + 4

    # Directions
    directions_h = 0.38 * inch
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin + 10, y - 14, "Directions:")
    c.setFont("Helvetica", 10)
    c.drawString(margin + 80, y - 14, directions_text)
    y -= directions_h + 6
    if print_tip:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, print_tip)
        c.setFillGray(0)
        y -= 12
    if difficulty_note:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, difficulty_note)
        c.setFillGray(0)
        y -= 12
    c.setFont("Helvetica", 8)
    c.setFillGray(0.45)
    c.drawString(margin + 10, y - 4, "Answer key on next page.")
    c.setFillGray(0)
    y -= 12

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

    total_height = sum(row_heights)
    panel_pad = 6
    panel_bottom = table_top - total_height - panel_pad
    c.setFillGray(0.98)
    c.roundRect(margin - 6, panel_bottom, usable_width + 12, total_height + panel_pad * 2, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, margin - 2, table_top + 16, "Puzzle")

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

    # Border + Footer
    draw_footer(title)
    c.showPage()

    # Answer key page (no logo/QR)
    y = height - margin - 10
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, "Answer Key")
    y -= 12
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    if subtitle:
        y -= 12
        c.setFont("Helvetica-Oblique", 9)
        c.setFillGray(0.35)
        c.drawCentredString(width / 2, y, subtitle)
    c.setFillGray(0)
    y -= logo_size + 4

    key_lines = []
    for idx, ref in enumerate(references, start=1):
        key_lines.append(f"{chr(64 + idx)} -> {answer_key[idx - 1]}")
    rows = int(math.ceil(len(key_lines) / 2)) if key_lines else 1
    panel_pad = 6
    panel_h = rows * 12 + panel_pad * 2 + 6
    panel_top = y + 6
    panel_bottom = panel_top - panel_h
    c.setFillGray(0.98)
    c.roundRect(margin, panel_bottom, usable_width, panel_h, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, margin + 4, panel_top + 6, "Answer key")

    c.setFont("Helvetica", 11)
    col_gap = 0.5 * inch
    col_width = (usable_width - col_gap) / 2
    left_x = margin + panel_pad
    right_x = margin + panel_pad + col_width + col_gap
    y_cursor = panel_top - panel_pad - 4
    for i, line in enumerate(key_lines):
        x = left_x if i % 2 == 0 else right_x
        if i % 2 == 0 and i > 0:
            y_cursor -= 14
        c.drawString(x, y_cursor, line)
    draw_footer(title)
    c.save()


def _place_word_search_word(grid, word, rng, directions):
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
        positions = []
        for i, ch in enumerate(word):
            xx = x + dx * i
            yy = y + dy * i
            grid[yy][xx] = ch
            positions.append((xx, yy))
        return positions
    return None


def generate_word_search_pdf(
    title: str,
    words: List[str],
    pdf_path: str,
    size: int = 12,
    subtitle: str | None = None,
    print_tip: str = "Print tip: Use pencil so kids can erase.",
    difficulty_note: str | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    def draw_header(title_text: str, subtitle_text: str | None):
        nonlocal y
        y = height - margin - 10
        logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
        qr_reader = _load_image("faithsparks_qr.png")
        logo_size = 42
        if logo_reader:
            c.drawImage(
                logo_reader,
                margin,
                y - logo_size + 4,
                width=logo_size,
                height=logo_size,
                preserveAspectRatio=True,
                mask="auto",
            )
        if qr_reader:
            c.drawImage(qr_reader, width - margin - logo_size, y - logo_size + 4, width=logo_size, height=logo_size)

        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(width / 2, y, title_text)
        y -= 12
        c.setFont("Helvetica", 9)
        c.setFillGray(0.4)
        c.drawCentredString(width / 2, y, "Faith Sparks Printables")
        if subtitle_text:
            y -= 12
            c.setFont("Helvetica-Oblique", 9)
            c.setFillGray(0.35)
            c.drawCentredString(width / 2, y, subtitle_text)
        c.setFillGray(0)
        y -= logo_size + 4

    def draw_answer_header(title_text: str, subtitle_text: str | None):
        nonlocal y
        y = height - margin - 10
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(width / 2, y, title_text)
        y -= 12
        c.setFont("Helvetica", 9)
        c.setFillGray(0.4)
        c.drawCentredString(width / 2, y, "Faith Sparks Printables")
        if subtitle_text:
            y -= 12
            c.setFont("Helvetica-Oblique", 9)
            c.setFillGray(0.35)
            c.drawCentredString(width / 2, y, subtitle_text)
        c.setFillGray(0)
        y -= 18

    def draw_footer(title_text: str):
        c.setStrokeGray(0.88)
        c.setLineWidth(0.6)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")

    def draw_word_fit(x: float, y_pos: float, text: str, max_width: float, base_size: int = 9) -> None:
        size = base_size
        while size >= 7 and c.stringWidth(text, "Helvetica", size) > max_width:
            size -= 1
        c.setFont("Helvetica", size)
        c.drawString(x, y_pos, text)
        c.setFont("Helvetica", base_size)

    draw_header(title, subtitle)

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
    y -= directions_h + 6
    if print_tip:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, print_tip)
        c.setFillGray(0)
        y -= 12
    if difficulty_note:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, difficulty_note)
        c.setFillGray(0)
        y -= 12
    c.setFont("Helvetica", 8)
    c.setFillGray(0.45)
    c.drawString(margin + 10, y - 4, "Answer key on next page.")
    c.setFillGray(0)
    y -= 12

    # Build grid
    rng = random.Random(title)
    grid = [["" for _ in range(size)] for _ in range(size)]
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    clean_words = []
    seen = set()
    for raw in words:
        w = "".join([ch for ch in (raw or "").upper() if ch.isalpha()])
        if not w or w in seen:
            continue
        if 3 <= len(w) <= size:
            clean_words.append(w)
            seen.add(w)
    clean_words = clean_words[:12]

    solution_positions = set()
    for w in clean_words:
        placed = _place_word_search_word(grid, w, rng, directions)
        if placed:
            solution_positions.update(placed)
    for y_idx in range(size):
        for x_idx in range(size):
            if not grid[y_idx][x_idx]:
                grid[y_idx][x_idx] = rng.choice(string.ascii_uppercase)

    # Draw grid (light panel)
    cell = 0.32 * inch
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillGray(0.98)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, start_x - 4, start_y + grid_size_px + 18, "Puzzle")
    c.setFont("Helvetica-Bold", 9)
    for row in range(size):
        for col in range(size):
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 3, grid[row][col])

    # Word list (boxed)
    list_x = start_x + grid_size_px + 0.4 * inch
    list_y = start_y + grid_size_px - 10
    list_box_w = width - margin - list_x + 8
    list_box_h = max(88, (len(clean_words) + 2) * 12 + 16)
    c.setFillGray(0.98)
    c.roundRect(list_x - 10, list_y - list_box_h + 12, list_box_w + 4, list_box_h, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, list_x - 4, list_y + 18, "Word list")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(list_x, list_y, f"Find these words ({len(clean_words)}):")
    list_y -= 12
    c.setFont("Helvetica", 9)
    max_word_width = list_box_w - 12
    for word in clean_words:
        draw_word_fit(list_x, list_y, word.title(), max_word_width, base_size=9)
        list_y -= 12

    draw_footer(title)
    c.showPage()

    # Answer key page (no logo/QR)
    draw_answer_header("Answer Key", subtitle)
    if print_tip:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, "Word search solution")
        c.setFillGray(0)
        y -= 12

    cell = 0.32 * inch
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    _draw_section_label(c, start_x - 4, start_y + grid_size_px + 18, "Answer key")
    c.setFont("Helvetica-Bold", 9)
    for row in range(size):
        for col in range(size):
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            if (col, row) in solution_positions:
                c.setFillGray(0.88)
                c.rect(x, y_pos, cell, cell, fill=1, stroke=0)
                c.setFillGray(0)
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 3, grid[row][col])

    list_x = start_x + grid_size_px + 0.4 * inch
    list_y = start_y + grid_size_px - 10
    list_box_w = width - margin - list_x + 12
    list_box_h = max(88, (len(clean_words) + 2) * 12 + 16)
    c.setFillGray(0.98)
    c.roundRect(list_x - 10, list_y - list_box_h + 12, list_box_w, list_box_h, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, list_x - 4, list_y + 18, "Answer words")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(list_x, list_y, "Answer words:")
    list_y -= 12
    c.setFont("Helvetica", 9)
    max_word_width = list_box_w - 12
    for word in clean_words:
        draw_word_fit(list_x, list_y, word.title(), max_word_width, base_size=9)
        list_y -= 12

    draw_footer(title)
    c.save()


def generate_crossword_pdf(
    title: str,
    words: List[str],
    clues: List[str],
    pdf_path: str,
    size: int = 13,
    subtitle: str | None = None,
    print_tip: str = "Print tip: Use pencil so kids can erase.",
    difficulty_note: str | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    logo_size = 42

    def draw_footer(title_text: str):
        c.setStrokeGray(0.88)
        c.setLineWidth(0.6)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, "© 2025 Faith Sparks Printables")

    def draw_word_fit(x: float, y_pos: float, text: str, max_width: float, base_size: int = 9) -> None:
        size = base_size
        while size >= 7 and c.stringWidth(text, "Helvetica", size) > max_width:
            size -= 1
        c.setFont("Helvetica", size)
        c.drawString(x, y_pos, text)
        c.setFont("Helvetica", base_size)

    logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
    qr_reader = _load_image("faithsparks_qr.png")
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size + 4, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size + 4, width=logo_size, height=logo_size)

    # Title block
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, title)
    y -= 12
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    if subtitle:
        y -= 12
        c.setFont("Helvetica-Oblique", 9)
        c.setFillGray(0.35)
        c.drawCentredString(width / 2, y, subtitle)
    c.setFillGray(0)
    y -= logo_size + 4

    # Directions
    directions_h = 0.38 * inch
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin + 10, y - 14, "Directions:")
    c.setFont("Helvetica", 10)
    c.drawString(margin + 80, y - 14, "Fill in the crossword using the clues below.")
    y -= directions_h + 6
    if print_tip:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, print_tip)
        c.setFillGray(0)
        y -= 12
    if difficulty_note:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, difficulty_note)
        c.setFillGray(0)
        y -= 12
    c.setFont("Helvetica", 8)
    c.setFillGray(0.45)
    c.drawString(margin + 10, y - 4, "Answer key on next page.")
    c.setFillGray(0)
    y -= 12

    # Build grid
    word_list = []
    seen = set()
    for raw in words:
        w = "".join([ch for ch in (raw or "").upper() if ch.isalpha()])
        if not w or w in seen or len(w) > size:
            continue
        seen.add(w)
        word_list.append(w)
    grid, entries = _build_crossword_layout(word_list, size=size)
    def _fallback_clue(word: str) -> str:
        clean = (word or "").strip().upper()
        if not clean:
            return "Word in this puzzle"
        return f"Starts with {clean[0]}, {len(clean)} letters"

    clues = clues or [_fallback_clue(w) for w in word_list]
    clue_map = {
        w.upper(): clues[idx] if idx < len(clues) else _fallback_clue(w)
        for idx, w in enumerate(word_list)
    }
    for entry in entries:
        entry.clue = clue_map.get(entry.word, _fallback_clue(entry.word))

    # Word bank (above grid)
    bank_padding = 6
    bank_rows = int(math.ceil(len(word_list) / 2)) if word_list else 1
    bank_line_h = 11
    bank_header_h = 10
    bank_h = bank_padding * 2 + bank_header_h + bank_rows * bank_line_h
    bank_top = y
    bank_bottom = y - bank_h
    c.setFillGray(0.98)
    c.roundRect(margin, bank_bottom, usable_width, bank_h, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, margin + 4, bank_top - 2, "Word bank")
    c.setFont("Helvetica-Bold", 10)
    col_gap = 0.5 * inch
    col_width = (usable_width - col_gap) / 2
    left_x = margin + bank_padding
    right_x = margin + bank_padding + col_width + col_gap
    y_cursor = bank_top - bank_padding - bank_header_h
    c.setFont("Helvetica", 9)
    for idx, word in enumerate(word_list):
        x = left_x if idx % 2 == 0 else right_x
        if idx % 2 == 0 and idx > 0:
            y_cursor -= bank_line_h
        draw_word_fit(x, y_cursor, word.title(), col_width - 6, base_size=9)
    y = bank_bottom - 8

    # Draw grid (light panel)
    cell = 0.28 * inch
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillGray(0.98)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, start_x - 4, start_y + grid_size_px + 18, "Puzzle")
    numbers, across_entries, down_entries = _number_crossword_entries(entries)

    for row in range(size):
        for col in range(size):
            if not grid[row][col]:
                continue
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            c.rect(x, y_pos, cell, cell)
            number = numbers.get((row, col))
            if number:
                c.setFont("Helvetica", 6)
                c.drawString(x + 2, y_pos + cell - 8, str(number))

    # Clues (boxed)
    clues_y = start_y - 0.45 * inch
    col_gap = 0.4 * inch
    col_width = (usable_width - col_gap) / 2
    left_x = margin
    right_x = margin + col_width + col_gap
    panel_top = clues_y + 10
    panel_bottom = 1.25 * inch
    c.setFillGray(0.98)
    c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, margin + 4, panel_top + 6, "Clues")
    clues_y = panel_top - 12
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_x, clues_y, "Across")
    c.drawString(right_x, clues_y, "Down")
    clues_y -= 12
    c.setFont("Helvetica", 8)

    def draw_clue_list(items, x, y_start):
        y_cursor = y_start
        for num, entry in items:
            text = f"{num}. {entry.clue}"
            lines = _wrap_text(text, "Helvetica", 8, col_width)
            for line in lines:
                c.drawString(x, y_cursor, line)
                y_cursor -= 10
        return y_cursor

    across = [(numbers.get((e.row, e.col), 0), e) for e in across_entries]
    down = [(numbers.get((e.row, e.col), 0), e) for e in down_entries]
    draw_clue_list(across, left_x, clues_y)
    draw_clue_list(down, right_x, clues_y)

    draw_footer(title)
    c.showPage()

    # Answer key page
    y = height - margin - 10
    # no logo/QR
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, "Answer Key")
    y -= 12
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    if subtitle:
        y -= 12
        c.setFont("Helvetica-Oblique", 9)
        c.setFillGray(0.35)
        c.drawCentredString(width / 2, y, subtitle)
    c.setFillGray(0)
    y -= logo_size + 4

    cell = 0.28 * inch
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillGray(0.98)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, start_x - 4, start_y + grid_size_px + 18, "Answer key")
    c.setFont("Helvetica", 8)
    for row in range(size):
        for col in range(size):
            if not grid[row][col]:
                continue
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 3, grid[row][col])
            number = numbers.get((row, col))
            if number:
                c.setFont("Helvetica", 6)
                c.drawString(x + 2, y_pos + cell - 8, str(number))
                c.setFont("Helvetica", 8)

    draw_footer(title)
    c.save()
