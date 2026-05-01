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

from datetime import datetime
from faithsparks.pdf_notices import append_scripture_notices_page

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
    c.setFillGray(0.95)
    c.setStrokeGray(0.85)
    c.setLineWidth(0.6)
    pill_y = y - 4
    c.roundRect(x, pill_y - label_h, label_w, label_h, radius=7, fill=1, stroke=1)
    c.setFillGray(0.35)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 7, pill_y - 10, text)
    c.setFillGray(0)
    c.setStrokeGray(0)
    c.setLineWidth(1)
    return label_h


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
        if existing == "":
            if direction == "across":
                if (r - 1 >= 0 and grid[r - 1][c]) or (r + 1 < size and grid[r + 1][c]):
                    return False
            else:
                if (c - 1 >= 0 and grid[r][c - 1]) or (c + 1 < size and grid[r][c + 1]):
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
    scripture_versions: List[str] | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    logo_size = 42

    def draw_footer(title_text: str):
        year = datetime.now().year
        c.setStrokeGray(0.92)
        c.setLineWidth(0.5)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, f"© {year} Faith Sparks Printables")


    # Brand assets
    logo_reader = _load_image("static/faith_sparks_logo_192.png")
    qr_reader = _load_image("faithsparks_qr.png")
    panel_top = y + 10
    panel_bottom = y - logo_size - 10
    c.setFillGray(0.96)
    c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=14, fill=1, stroke=0)
    c.setFillGray(0)
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
    c.setFillGray(1)
    c.setStrokeGray(0.84)
    c.setLineWidth(0.8)
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10, fill=1, stroke=1)
    c.setFillGray(0)
    c.setStrokeGray(0)
    c.setLineWidth(1)
    c.setFont("Helvetica-Bold", 9.5)
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
    y -= 26

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
    c.setFillGray(0.985)
    c.roundRect(margin - 6, panel_bottom, usable_width + 12, total_height + panel_pad * 2, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    panel_top = table_top + panel_pad
    _draw_section_label(c, margin - 2, panel_top, "Puzzle")
    c.setStrokeGray(0.8)
    c.setLineWidth(0.6)
    table_bottom = y - total_height
    c.roundRect(margin, table_bottom, usable_width, total_height, radius=10, fill=0, stroke=1)
    c.line(margin + left_width, table_bottom, margin + left_width, y)

    for (left_lines, right_lines), row_height in zip(rows, row_heights):
        y_next = y - row_height
        c.line(margin, y_next, margin + usable_width, y_next)

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
    c.setStrokeGray(0)
    c.setLineWidth(1)

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
    panel_h = rows * 13 + panel_pad * 2 + 18
    panel_top = y + 6
    panel_bottom = panel_top - panel_h
    c.setFillGray(0.985)
    c.roundRect(margin, panel_bottom, usable_width, panel_h, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    c.setFont("Helvetica", 11)
    col_gap = 0.5 * inch
    col_width = (usable_width - col_gap) / 2
    left_x = margin + panel_pad
    right_x = margin + panel_pad + col_width + col_gap
    y_cursor = panel_top - panel_pad - 6
    for i, line in enumerate(key_lines):
        x = left_x if i % 2 == 0 else right_x
        if i % 2 == 0 and i > 0:
            y_cursor -= 15
        c.drawString(x, y_cursor, line)
    draw_footer(title)
    version_list = scripture_versions or [v.version for v in verses if getattr(v, "version", None)]
    append_scripture_notices_page(c, versions_used=version_list, margin=margin)
    c.save()


def _place_word_search_word(grid, word, rng, directions):
    size = len(grid)
    attempts = 200
    word = word.upper()
    L = len(word)

    for _ in range(attempts):
        dx, dy = rng.choice(directions)
        if dx == 0 and dy == 0:
            continue

        # start bounds so word always fits
        if dx == 1:
            min_x, max_x = 0, size - L
        elif dx == -1:
            min_x, max_x = L - 1, size - 1
        else:  # dx == 0
            min_x, max_x = 0, size - 1

        if dy == 1:
            min_y, max_y = 0, size - L
        elif dy == -1:
            min_y, max_y = L - 1, size - 1
        else:  # dy == 0
            min_y, max_y = 0, size - 1

        if max_x < min_x or max_y < min_y:
            continue

        x = rng.randint(min_x, max_x)
        y = rng.randint(min_y, max_y)

        ok = True
        for i, ch in enumerate(word):
            xx = x + dx * i
            yy = y + dy * i
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
    show_word_list: bool = True,
    scripture_versions: List[str] | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    logo_size = 36

    def draw_header(title_text: str, subtitle_text: str | None):
        nonlocal y
        y = height - margin - 10
        logo_reader = _load_image("static/faith_sparks_logo_192.png")
        qr_reader = _load_image("faithsparks_qr.png")
        panel_top = y + 10
        panel_bottom = y - logo_size - 10
        c.setFillGray(0.96)
        c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=14, fill=1, stroke=0)
        c.setFillGray(0)
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

        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(width / 2, y, title_text)
        y -= 12
        c.setFont("Helvetica", 9)
        c.setFillGray(0.4)
        c.drawCentredString(width / 2, y, "Faith Sparks Printables")
        if subtitle_text:
            y -= 10
            c.setFont("Helvetica-Oblique", 8.5)
            c.setFillGray(0.35)
            c.drawCentredString(width / 2, y, subtitle_text)
        c.setFillGray(0)
        c.setStrokeGray(0.86)
        c.setLineWidth(0.6)
        c.line(margin + 10, panel_bottom - 8, width - margin - 10, panel_bottom - 8)
        c.setStrokeGray(0)
        y -= logo_size + 2

    def draw_footer(title_text: str):
        year = datetime.now().year
        c.setStrokeGray(0.88)
        c.setLineWidth(0.6)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, f"© {year} Faith Sparks Printables")

    def draw_word_fit(x: float, y_pos: float, text: str, max_width: float, base_size: int = 9) -> None:
        size = base_size
        while size >= 7 and c.stringWidth(text, "Helvetica", size) > max_width:
            size -= 1
        c.setFont("Helvetica", size)
        c.drawString(x, y_pos, text)
        c.setFont("Helvetica", base_size)

    draw_header(title, subtitle)

    directions_h = 0.28 * inch
    c.setFillGray(1)
    c.setStrokeGray(0.84)
    c.setLineWidth(0.8)
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10, fill=1, stroke=1)
    c.setFillGray(0)
    c.setStrokeGray(0)
    c.setLineWidth(1)
    c.setFont("Helvetica-Bold", 8.8)
    c.drawString(margin + 10, y - 12, "Directions:")
    c.setFont("Helvetica", 9)
    c.drawString(margin + 72, y - 12, "Find each word. Words may go forward, backward, or diagonal.")
    y -= directions_h + 4
    if print_tip:
        c.setFont("Helvetica", 7.5)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, print_tip)
        c.setFillGray(0)
        y -= 10
    if difficulty_note:
        c.setFont("Helvetica", 7.5)
        c.setFillGray(0.45)
        c.drawString(margin + 10, y - 4, difficulty_note)
        c.setFillGray(0)
        y -= 10
    c.setFont("Helvetica", 7.8)
    c.setFillGray(0.45)
    c.drawString(margin + 10, y - 4, "Answer key on next page.")
    c.setFillGray(0)
    y -= 14

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
    placed_words = []
    solution_positions = set()
    for w in clean_words:
        placed = _place_word_search_word(grid, w, rng, directions)
        if placed:
            solution_positions.update(placed)
            placed_words.append(w)
    display_words = sorted(placed_words)
    for y_idx in range(size):
        for x_idx in range(size):
            if not grid[y_idx][x_idx]:
                grid[y_idx][x_idx] = rng.choice(string.ascii_uppercase)

    # Puzzle grid centered and slightly larger when the word list is below it.
    grid_max_width = usable_width
    grid_max_height = y - (1.7 * inch if show_word_list and display_words else 0.3 * inch)
    cell = max(0.3 * inch, min(0.42 * inch, min(grid_max_width, grid_max_height) / max(1, size)))
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 9)
    c.setStrokeGray(0.62)
    c.setLineWidth(0.6)
    for row in range(size):
        for col in range(size):
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 2.7, grid[row][col])
    c.setStrokeGray(0)
    c.setLineWidth(1)

    if show_word_list and display_words:
        list_box_top = start_y - 12
        list_cols = 2 if len(display_words) > 6 else 1
        list_rows = int(math.ceil(len(display_words) / list_cols))
        line_h = 11
        label_h = 13
        list_box_h = max(50, label_h + 14 + list_rows * line_h)
        list_box_bottom = list_box_top - list_box_h
        c.setFillColorRGB(1, 1, 1)
        c.setStrokeGray(0.84)
        c.setLineWidth(0.7)
        c.roundRect(margin, list_box_bottom, usable_width, list_box_h, radius=12, fill=1, stroke=1)
        c.setStrokeGray(0)
        c.setLineWidth(1)
        c.setFillGray(0)
        _draw_section_label(c, margin + 4, list_box_top, "Word list")
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin + 12, list_box_top - 16, f"Find these words ({len(display_words)}):")
        c.setFont("Helvetica", 8.8)
        col_gap = 0.32 * inch
        col_width = (usable_width - 24 - (col_gap * (list_cols - 1))) / list_cols
        max_word_width = col_width - 6
        left_x = margin + 12
        y_cursor = list_box_top - 28
        for idx, word in enumerate(display_words):
            col = idx % list_cols
            row = idx // list_cols
            x = left_x + (col * (col_width + col_gap))
            y_pos = y_cursor - (row * line_h)
            draw_word_fit(x, y_pos, word.title(), max_word_width, base_size=9)

    draw_footer(title)
    c.showPage()

    # Answer key page: just the solution grid, centered and uncluttered.
    y = height - margin - 10
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, y, "Answer Key")
    y -= 12
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, y, "Faith Sparks Printables")
    if subtitle:
        y -= 10
        c.setFont("Helvetica-Oblique", 8.5)
        c.setFillGray(0.35)
        c.drawCentredString(width / 2, y, subtitle)
    c.setFillGray(0)
    y -= 18

    cell = max(0.3 * inch, min(0.42 * inch, usable_width / max(1, size)))
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 10)
    c.setStrokeGray(0.62)
    c.setLineWidth(0.7)
    for row in range(size):
        for col in range(size):
            x = start_x + col * cell
            y_pos = start_y + (size - row - 1) * cell
            if (col, row) in solution_positions:
                c.setFillGray(0.9)
                c.rect(x, y_pos, cell, cell, fill=1, stroke=0)
                c.setFillGray(0)
            c.rect(x, y_pos, cell, cell)
            c.drawCentredString(x + cell / 2, y_pos + cell / 2 - 3, grid[row][col])
    c.setStrokeGray(0)
    c.setLineWidth(1)

    draw_footer(title)
    append_scripture_notices_page(c, versions_used=scripture_versions, margin=margin)
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
    show_word_bank: bool = True,
    scripture_versions: List[str] | None = None,
) -> None:
    width, height = letter
    margin = 0.6 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    logo_size = 42

    def draw_header(title_text: str, subtitle_text: str | None):
        nonlocal y
        y = height - margin - 10
        logo_reader = _load_image("static/faith_sparks_logo_192.png")
        qr_reader = _load_image("faithsparks_qr.png")
        panel_top = y + 10
        panel_bottom = y - logo_size - 10
        c.setFillGray(0.96)
        c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=14, fill=1, stroke=0)
        c.setFillGray(0)
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
        c.setStrokeGray(0.86)
        c.setLineWidth(0.6)
        c.line(margin + 10, panel_bottom - 8, width - margin - 10, panel_bottom - 8)
        c.setStrokeGray(0)
        y -= logo_size + 4

    def draw_answer_header(title_text: str, subtitle_text: str | None):
        nonlocal y
        y = height - margin - 10
        panel_top = y + 10
        header_height = 58 + (12 if subtitle_text else 0)
        panel_bottom = panel_top - header_height
        c.setFillGray(0.96)
        c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=14, fill=1, stroke=0)
        c.setFillGray(0)
        text_y = y
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(width / 2, text_y, title_text)
        text_y -= 12
        c.setFont("Helvetica", 9)
        c.setFillGray(0.4)
        c.drawCentredString(width / 2, text_y, "Faith Sparks Printables")
        if subtitle_text:
            text_y -= 12
            c.setFont("Helvetica-Oblique", 9)
            c.setFillGray(0.35)
            c.drawCentredString(width / 2, text_y, subtitle_text)
        c.setFillGray(0)
        c.setStrokeGray(0.86)
        c.setLineWidth(0.6)
        c.line(margin + 10, panel_bottom - 8, width - margin - 10, panel_bottom - 8)
        c.setStrokeGray(0)
        y = panel_bottom - 12

    def draw_footer(title_text: str):
        year = datetime.now().year
        c.setStrokeGray(0.88)
        c.setLineWidth(0.6)
        c.roundRect(0.5 * inch, 0.5 * inch, width - inch, height - inch, radius=12)
        c.setFillGray(0.4)
        code = "".join([ch for ch in title_text.upper().replace(" ", "_") if ch.isalnum() or ch == "_"])
        c.drawRightString(width - margin, 0.35 * inch, f"FS-GAME-{code[:18]}")
        c.drawCentredString(width / 2, 0.35 * inch, f"© {year} Faith Sparks Printables")


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
    c.setFillGray(1)
    c.setStrokeGray(0.84)
    c.setLineWidth(0.8)
    c.roundRect(margin, y - directions_h + 4, usable_width, directions_h, radius=10, fill=1, stroke=1)
    c.setFillGray(0)
    c.setStrokeGray(0)
    c.setLineWidth(1)
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
    y -= 24

    # Build grid
    word_list = []
    seen = set()
    min_len = 3
    for raw in words:
        w = "".join([ch for ch in (raw or "").upper() if ch.isalpha()])
        if not w or w in seen or len(w) > size or len(w) < min_len:
            continue
        seen.add(w)
        word_list.append(w)
    word_list_full = list(word_list)
    grid, entries = _build_crossword_layout(word_list_full, size=size)
    word_list = [entry.word for entry in entries]
    def _fallback_clue(word: str) -> str:
        clean = (word or "").strip().upper()
        if not clean:
            return "Word in this puzzle"
        return f"Starts with {clean[0]}, {len(clean)} letters"

    clues = clues or [_fallback_clue(w) for w in word_list_full]
    clue_map = {
        w.upper(): clues[idx] if idx < len(clues) else _fallback_clue(w)
        for idx, w in enumerate(word_list_full)
    }
    for entry in entries:
        entry.clue = clue_map.get(entry.word, _fallback_clue(entry.word))

    display_words = sorted(word_list)
    numbers, across_entries, down_entries = _number_crossword_entries(entries)
    col_gap = 0.4 * inch
    col_width = (usable_width - col_gap) / 2
    across = sorted([(numbers.get((e.row, e.col), 0), e) for e in across_entries], key=lambda item: item[0])
    down = sorted([(numbers.get((e.row, e.col), 0), e) for e in down_entries], key=lambda item: item[0])

    # Word bank (above grid)
    if show_word_bank and display_words:
        bank_padding = 6
        bank_rows = int(math.ceil(len(word_list) / 2)) if word_list else 1
        bank_line_h = 12
        bank_header_h = 20
        bank_h = bank_padding * 2 + bank_header_h + bank_rows * bank_line_h
        bank_top = y
        bank_bottom = y - bank_h
        c.setFillColorRGB(1, 1, 1)
        c.setStrokeGray(0.84)
        c.setLineWidth(0.7)
        c.roundRect(margin, bank_bottom, usable_width, bank_h, radius=12, fill=1, stroke=1)
        c.setStrokeGray(0)
        c.setLineWidth(1)
        c.setFillGray(0)
        _draw_section_label(c, margin + 4, bank_top, "Word bank")
        c.setFont("Helvetica-Bold", 10)
        col_gap = 0.5 * inch
        col_width = (usable_width - col_gap) / 2
        left_x = margin + bank_padding
        right_x = margin + bank_padding + col_width + col_gap
        y_cursor = bank_top - bank_padding - bank_header_h - 8
        c.setFont("Helvetica", 9)
        for idx, word in enumerate(display_words):
            x = left_x if idx % 2 == 0 else right_x
            if idx % 2 == 0 and idx > 0:
                y_cursor -= bank_line_h
            draw_word_fit(x, y_cursor, word.title(), col_width - 6, base_size=9)
        y = bank_bottom - 24
    else:
        y -= 12

    def count_lines(items):
        total = 0
        for num, entry in items:
            text = f"{num}. {entry.clue}"
            total += len(_wrap_text(text, "Helvetica", 9, col_width))
        return total or 1

    line_height = 11
    heading_height = 22
    lines_needed = max(count_lines(across), count_lines(down))
    clue_panel_bottom = 1.05 * inch
    clue_panel_min_height = heading_height + (lines_needed * line_height) + 16
    gap_above_clues = 0.28 * inch
    max_grid_height = y - (clue_panel_bottom + clue_panel_min_height + gap_above_clues - 10)
    cell = max(0.28 * inch, min(0.4 * inch, max_grid_height / max(1, size)))
    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    _draw_section_label(c, start_x - 4, start_y + grid_size_px + 8, "Puzzle")
    c.setStrokeGray(0.62)
    c.setLineWidth(0.7)

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
    c.setStrokeGray(0)
    c.setLineWidth(1)

    # Clues (boxed)
    clues_y = start_y - gap_above_clues
    left_x = margin
    right_x = margin + col_width + col_gap
    panel_top = clues_y + 10
    panel_bottom = clue_panel_bottom
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeGray(0.84)
    c.setLineWidth(0.7)
    c.roundRect(margin, panel_bottom, usable_width, panel_top - panel_bottom, radius=12, fill=1, stroke=1)
    c.setStrokeGray(0)
    c.setLineWidth(1)
    c.setFillGray(0)
    label_h = _draw_section_label(c, margin + 4, panel_top, "Clues")
    clues_y = panel_top - label_h - 10
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_x, clues_y, "Across")
    c.drawString(right_x, clues_y, "Down")
    clues_y -= 12
    c.setFont("Helvetica", 9)

    def draw_clue_list(items, x, y_start):
        y_cursor = y_start
        for num, entry in items:
            text = f"{num}. {entry.clue}"
            lines = _wrap_text(text, "Helvetica", 9, col_width)
            for line in lines:
                c.drawString(x, y_cursor, line)
                y_cursor -= 10.5
            y_cursor -= 2
        return y_cursor

    draw_clue_list(across, left_x, clues_y)
    draw_clue_list(down, right_x, clues_y)

    draw_footer(title)
    c.showPage()

    # Answer key page
    draw_answer_header("Answer Key", subtitle)

    grid_size_px = size * cell
    start_x = margin + max(0, (usable_width - grid_size_px) / 2)
    start_y = y - grid_size_px
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(start_x - 8, start_y - 8, grid_size_px + 16, grid_size_px + 16, radius=12, fill=1, stroke=0)
    c.setFillGray(0)
    # Keep answer key header clean; avoid overlapping the grid.
    c.setFont("Helvetica-Bold", 8)
    c.setStrokeGray(0.62)
    c.setLineWidth(0.7)
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
    c.setStrokeGray(0)
    c.setLineWidth(1)

    # Answer words box (fills page and keeps key clear)
    list_box_w = usable_width
    list_box_h = max(76, (len(display_words) + 2) * 11 + 10)
    list_x = margin
    list_y = start_y - 0.4 * inch
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeGray(0.84)
    c.setLineWidth(0.7)
    c.roundRect(list_x, list_y - list_box_h + 12, list_box_w, list_box_h, radius=12, fill=1, stroke=1)
    c.setStrokeGray(0)
    c.setLineWidth(1)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(list_x + 8, list_y, "Answer words:")
    c.setFont("Helvetica", 9)
    col_gap = 0.5 * inch
    col_width = (list_box_w - col_gap - 16) / 2
    left_x = list_x + 8
    right_x = list_x + 8 + col_width + col_gap
    y_cursor = list_y - 12
    for idx, word in enumerate(display_words):
        x = left_x if idx % 2 == 0 else right_x
        if idx % 2 == 0 and idx > 0:
            y_cursor -= 11
        draw_word_fit(x, y_cursor, word.title(), col_width - 6, base_size=9)

    draw_footer(title)
    append_scripture_notices_page(c, versions_used=scripture_versions, margin=margin)
    c.save()
