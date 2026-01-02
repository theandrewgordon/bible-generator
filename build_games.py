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


def _load_image(path: str):
    try:
        return ImageReader(path)
    except Exception:
        return None


def _can_place_word(grid, word: str, row: int, col: int, direction: str) -> bool:
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


def _place_word(grid, word: str, row: int, col: int, direction: str) -> None:
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
    if _can_place_word(grid, first, start_row, start_col, "across"):
        _place_word(grid, first, start_row, start_col, "across")
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
                        if _can_place_word(grid, word, row, col, "down"):
                            _place_word(grid, word, row, col, "down")
                            entries.append(CrosswordEntry(word=word, clue="", row=row, col=col, direction="down"))
                            placed = True
                            break
                        # Try place horizontally
                        row = r
                        col = c - idx
                        if _can_place_word(grid, word, row, col, "across"):
                            _place_word(grid, word, row, col, "across")
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
    c.drawString(list_x, list_y, f"Find these words ({len(clean_words)}):")
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

    # Build grid
    word_list = [w.upper() for w in words]
    grid, entries = _build_crossword_layout(word_list, size=size)
    clues = clues or ["A Bible word" for _ in word_list]
    clue_map = {w.upper(): clues[idx] if idx < len(clues) else "A Bible word" for idx, w in enumerate(word_list)}
    for entry in entries:
        entry.clue = clue_map.get(entry.word, "A Bible word")

    # Draw grid
    cell = 0.28 * inch
    grid_size_px = size * cell
    start_x = margin
    start_y = y - grid_size_px
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

    # Clues
    clues_y = start_y - 0.35 * inch
    col_gap = 0.4 * inch
    col_width = (usable_width - col_gap) / 2
    left_x = margin
    right_x = margin + col_width + col_gap

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
