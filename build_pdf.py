import os
import json
import re
import unicodedata

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import black, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.pdfbase.pdfdoc import pdfdocEnc
from reportlab.lib.utils import ImageReader

from faithsparks.styles import layout
from faithsparks.pdf_notices import append_scripture_notices_page

from datetime import datetime
COPYRIGHT_YEAR = datetime.now().year

# Register fonts
pdfmetrics.registerFont(TTFont('KGPrimaryDots', 'fonts/KGPrimaryDotsLined.ttf'))
pdfmetrics.registerFont(TTFont('LearningCurve', 'fonts/LearningCurveDashed-w4DP.ttf'))

TRACE_BG = HexColor(layout.TRACE_BACKGROUND)
line_spacing = layout.HANDWRITING_LINE_SPACING
styles = getSampleStyleSheet()

COLORING_STYLE = styles["Normal"].clone("ColoringPrompt")
COLORING_STYLE.leading = COLORING_STYLE.fontSize + 2


def capitalize_first_letter(text):
    return text[0].upper() + text[1:] if text and text[0].islower() else text


def _pdf_safe_text(value: str) -> str:
    """Normalize text so ReportLab's core fonts can encode it."""
    if not value:
        return ""

    # Normalize accents and compatibility chars
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))

    replacements = {
        "“": '"',
        "”": '"',
        "„": '"',
        "‟": '"',
        "‘": "'",
        "’": "'",
        "‚": "'",
        "‛": "'",
        "—": "-",
        "–": "-",
        "―": "-",
        "−": "-",
        "•": "-",
        "·": "-",
        "…": "...",
        "\u00a0": " ",  # non-breaking space
        "\u200b": "",  # zero-width space
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)

    # Drop or replace characters ReportLab still can't encode.
    cleaned_chars = []
    for ch in text:
        try:
            pdfdocEnc(ch)
            cleaned_chars.append(ch)
        except UnicodeEncodeError:
            # Fallback to a safe substitute for printable chars, else drop.
            cleaned_chars.append("?") if ch.isprintable() else None

    cleaned = "".join(cleaned_chars)
    # Collapse excess whitespace introduced during replacements.
    return " ".join(cleaned.split())


_STYLE_REPLACEMENTS = {
    "god's word": "God's Word",
    "his courts": "His courts",
    "your sight": "Your sight",
    "his name": "His Name",
    "his word": "His Word",
}


def format_text_block(value: str, ensure_question: bool = False, ensure_period: bool = False) -> str:
    text = _pdf_safe_text(value)
    lowered = text.lower()
    for needle, replacement in _STYLE_REPLACEMENTS.items():
        if needle in lowered:
            # replace case-insensitively
            text = re.sub(needle, replacement, text, flags=re.IGNORECASE)
            lowered = text.lower()

    text = capitalize_first_letter(text)

    if ensure_question and not text.endswith("?"):
        text = text.rstrip(".! ") + "?"
    elif ensure_period and not text.endswith("."):
        text = text.rstrip("?! ") + "."

    return text

TRACE_CONNECTORS = {"and", "but", "for", "nor", "or", "so", "yet", "in", "on", "at", "to", "by", "of", "that"}


def tokenize_traceable(text):
    return text.split()

def wrap_text_lines(text, font, font_size, max_width):
    """Wrap by measured width; avoid ending a line on a small connector word."""
    words = tokenize_traceable(text)
    lines: list[str] = []
    current_words: list[str] = []
    for word in words:
        tentative = " ".join(current_words + [word])
        if pdfmetrics.stringWidth(tentative, font, font_size) > max_width and current_words:
            if current_words[-1].lower() in TRACE_CONNECTORS and len(current_words) > 1:
                connector = current_words.pop()
                lines.append(" ".join(current_words))
                current_words = [connector, word]
            else:
                lines.append(" ".join(current_words))
                current_words = [word]
        else:
            current_words.append(word)
    if current_words:
        lines.append(" ".join(current_words))
    return [ln.strip() for ln in lines if ln.strip()]

def draw_rounded_box(c, x, y, width, height):
    c.setFillGray(layout.LIGHT_GRAY_FILL)
    c.roundRect(x, y - height, width, height, radius=8, fill=1)
    c.setFillColor(black)

def draw_paragraph_box(c, title, content, x, y, width, padding=10, style=None, ensure_question=False, ensure_period=False):
    content = format_text_block(content, ensure_question=ensure_question, ensure_period=ensure_period)
    para_style = style or styles["Normal"]
    para = Paragraph(content, para_style)
    _, para_height = para.wrap(width - 2 * padding, 1000)
    box_height = para_height + 2 * padding + 20
    draw_rounded_box(c, x, y, width, box_height)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + padding, y - padding - 2, title)
    para.drawOn(c, x + padding, y - padding - para_height - 10)
    return y - box_height - 12

def trace_font(use_cursive=False):
    return 'LearningCurve' if use_cursive else 'KGPrimaryDots'


def trace_lines(text, width, use_cursive=False, font_size=None):
    text = capitalize_first_letter(_pdf_safe_text(text))
    return wrap_text_lines(text, trace_font(use_cursive), font_size or layout.TRACE_FONT_SIZE, width - 40)


def trace_box_height(line_count, font_size):
    return line_count * (font_size + layout.TRACE_LINE_SPACING) + 2 * 10 + 20


def draw_tracing_box(c, title, text, x, y, width, use_cursive=False, font_size=None, lines=None):
    font = trace_font(use_cursive)
    font_size = font_size or layout.TRACE_FONT_SIZE
    padding = 10
    if lines is None:
        lines = trace_lines(text, width, use_cursive, font_size)
    box_height = len(lines) * (font_size + layout.TRACE_LINE_SPACING) + 2 * padding + 20
    c.setFillColor(TRACE_BG)
    c.roundRect(x, y - box_height, width, box_height, radius=8, fill=1)
    c.setFillColor(black)

    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + padding, y - padding - 2, title)

    c.setFont(font, font_size)
    ty = y - padding - 30

    for line in lines:
        c.drawString(x + padding, ty, line)
        if use_cursive:
            underline_y = ty - 5
            c.setLineWidth(1)
            c.line(x + padding, underline_y, x + width - padding, underline_y)
        ty -= font_size + layout.TRACE_LINE_SPACING

    return y - box_height - 10

def draw_handwriting_box(c, title, x, y, width, lines_count=3, padding=10):
    line_height = line_spacing + 6
    box_height = lines_count * line_height + 2 * padding + 20
    c.setFillColor(TRACE_BG)
    c.roundRect(x, y - box_height, width, box_height, radius=8, fill=1)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + padding, y - padding - 2, _pdf_safe_text(title))
    ty = y - padding - 28
    for _ in range(lines_count):
        c.setLineWidth(1)
        c.line(x + padding, ty, x + width - padding, ty)
        c.setDash(2, 2)
        c.line(x + padding, ty + line_spacing / 2, x + width - padding, ty + line_spacing / 2)
        c.setDash(1, 0)
        c.line(x + padding, ty + line_spacing, x + width - padding, ty + line_spacing)
        ty -= line_height
    return y - box_height - 10

def _load_image(path: str):
    try:
        return ImageReader(path)
    except Exception:
        return None


# Worksheets trace the whole verse, word for word. Space is made by stepping
# sizes down and giving up the coloring box first; anything still too long
# (mostly multi-verse passages) continues the tracing on a second page.
COLORING_FULL = 1.75 * inch
COLORING_SMALL = 1.0 * inch
FIT_STEPS = [
    # copy text pt, trace pt, minimum coloring height (0 = no coloring box)
    (12, 30, COLORING_FULL),
    (12, 26, COLORING_FULL),
    (11, 22, COLORING_FULL),
    (11, 26, COLORING_SMALL),
    (11, 22, COLORING_SMALL),
    (10, 20, COLORING_SMALL),
    (10, 22, 0),
    (10, 20, 0),
]
TWO_PAGE_TRACE_SIZE = 24
NOTICE_FONT_SIZE = 6.5
# Public-domain text needs no notice; the reference line already marks it (KJV).
_NO_NOTICE_VERSIONS = {"KJV", "WEB", "ASV", "YLT", "DARBY", "BBE", "DIY", ""}


def _copy_style(size: int):
    style = styles["Normal"].clone(f"Copy{size}")
    style.fontSize = size
    style.leading = size + 3
    return style


def _trace_text(data) -> str:
    """Always the full verse, verbatim."""
    return (data.get("fullVerse") or data.get("traceableVerse") or "").strip()


def _notice_lines(version: str, max_width: float) -> list[str]:
    from faithsparks.pdf_notices import _wrap_lines, scripture_notice_texts
    code = re.sub(r"[^A-Za-z0-9]", "", str(version or "")).upper()
    if code in _NO_NOTICE_VERSIONS:
        return []
    lines: list[str] = []
    for _, text in scripture_notice_texts([code]):
        lines.extend(_wrap_lines(_pdf_safe_text(text), "Helvetica", NOTICE_FONT_SIZE, max_width))
    return lines


def _draw_writing_and_reflection(c, data, *, margin, usable_width, y, lines_count):
    y -= 6
    y = draw_handwriting_box(c, "Write the verse yourself:", margin, y, usable_width, lines_count)
    return draw_paragraph_box(c, "Think about this:", data["reflectionQuestion"], margin, y, usable_width,
                              ensure_question=True)


def _draw_body(c, data, *, margin, usable_width, y, use_cursive, copy_size, trace_size, lines_count):
    """Copy, trace (full verse), write, reflect. Returns the y below them."""
    y = draw_paragraph_box(c, "Copy this verse:", data["fullVerse"], margin, y, usable_width,
                           style=_copy_style(copy_size))
    y = draw_tracing_box(c, "Trace the verse:", _trace_text(data), margin, y, usable_width,
                         use_cursive=use_cursive, font_size=trace_size)
    return _draw_writing_and_reflection(c, data, margin=margin, usable_width=usable_width, y=y,
                                        lines_count=lines_count)


def _fit_layout(data, *, margin, usable_width, y_start, bottom, use_cursive):
    """First step where the whole page fits; None means use two pages."""
    from io import BytesIO
    requested = int(data.get("handwritingLines") or 3)
    attempts = [(step, requested) for step in FIT_STEPS]
    if requested > 3:  # beginner: keep 5 lines unless the verse truly needs the room
        attempts += [(FIT_STEPS[-1], 3)]
    for (copy_size, trace_size, coloring_min), lines_count in attempts:
        probe = canvas.Canvas(BytesIO(), pagesize=letter)
        y_end = _draw_body(probe, data, margin=margin, usable_width=usable_width, y=y_start,
                           use_cursive=use_cursive, copy_size=copy_size, trace_size=trace_size,
                           lines_count=lines_count)
        if y_end - bottom >= coloring_min:
            return {"copy": copy_size, "trace": trace_size, "coloring": coloring_min > 0, "lines": lines_count}
    return None


def _draw_coloring(c, data, *, margin, usable_width, y, bottom):
    available_height = y - bottom
    if available_height < COLORING_SMALL:
        return
    box_h = min(available_height, 2.5 * inch)
    box_w = 4.5 * inch
    gap = 0.4 * inch
    label_w = min(usable_width - box_w - gap, layout.COLORING_PROMPT_WIDTH_MAX * inch)
    if label_w < layout.COLORING_PROMPT_WIDTH_MIN * inch:
        label_w = usable_width - box_w - gap
    draw_paragraph_box(c, "Coloring Prompt:", data["imageIdea"], margin, y, label_w,
                       style=COLORING_STYLE, ensure_question=True)
    c.setLineWidth(1.25)
    c.roundRect(margin + label_w + gap, y - box_h, box_w, box_h, radius=8)


def _draw_header(c, data, *, width, margin, y, continued=False):
    logo_size = 48
    if not continued:
        logo_reader = _load_image("static/faith_sparks_logo_192.png")
        qr_reader = _load_image("faithsparks_qr.png")
        if logo_reader:
            c.drawImage(logo_reader, margin, y - logo_size, width=logo_size, height=logo_size,
                        preserveAspectRatio=True, mask='auto')
        if qr_reader:
            c.drawImage(qr_reader, width - margin - logo_size, y - logo_size, width=logo_size, height=logo_size)
    worksheet_title = _pdf_safe_text(data.get("title") or data.get("verse") or "Bible Copywork Worksheet")
    c.setFillColor(black)
    if continued:
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(width / 2, y - 12, f"{worksheet_title} (continued)")
        return y - 30
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y - 12, "Bible Copywork Worksheet")
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, y - 30, worksheet_title)
    y -= logo_size + 16
    verse_display = _pdf_safe_text(f"{data['verse']} ({data['version'].upper()})")
    font_size = layout.VERSE_FONT_MAX if len(verse_display) < 28 else layout.VERSE_FONT_MIN
    c.setFont("Helvetica-Bold", font_size)
    c.drawCentredString(width / 2, y, verse_display)
    return y - 20


def _draw_footer(c, data, *, width, margin, notice):
    if notice:
        c.setFont("Helvetica", NOTICE_FONT_SIZE)
        c.setFillGray(0.35)
        ny = margin + len(notice) * (NOTICE_FONT_SIZE + 1.5) + 6 - NOTICE_FONT_SIZE - 2
        for line in notice:
            c.drawString(margin, ny, line)
            ny -= NOTICE_FONT_SIZE + 1.5
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, letter[1] - inch)
    verse_code = _pdf_safe_text(
        data["verse"].upper().replace(":", "_").replace(" ", "_") + f"_{data['version'].upper()}"
    )
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - margin, 0.32 * inch, f"FS-{verse_code}"[:60])
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, 0.23 * inch, f"© {COPYRIGHT_YEAR} Faith Sparks Printables · For personal use only")
    c.setFillColor(black)


def generate_pdf(data, pdf_path, use_cursive=False):
    """Worksheet that traces the whole verse word for word.

    One page whenever it fits (nearly every single verse); long passages
    continue the tracing on a second page instead of being cut. Licensed-
    translation notices sit in the footer.
    """
    width, height = letter
    margin = layout.DEFAULT_MARGIN_INCH * inch
    usable_width = width - 2 * margin
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    worksheet_title = _pdf_safe_text(data.get("title") or data.get("verse") or "Bible Copywork Worksheet")
    c.setTitle(worksheet_title)
    c.setAuthor("Faith Sparks Printables")
    c.setSubject(f"Bible copywork worksheet for {data.get('verse', '')}")
    c.setCreator("Faith Sparks Printables")
    keywords = [worksheet_title, data.get("verse", ""), data.get("version", "").upper(), "Bible", "Copywork"]
    c.setKeywords(", ".join(filter(None, keywords)))

    notice = _notice_lines(data.get("version", ""), usable_width)
    notice_height = len(notice) * (NOTICE_FONT_SIZE + 1.5) + (6 if notice else 0)
    bottom = margin + notice_height

    y = _draw_header(c, data, width=width, margin=margin, y=height - margin - 10)
    fit = _fit_layout(data, margin=margin, usable_width=usable_width, y_start=y, bottom=bottom,
                      use_cursive=use_cursive)
    if fit:
        y = _draw_body(c, data, margin=margin, usable_width=usable_width, y=y, use_cursive=use_cursive,
                       copy_size=fit["copy"], trace_size=fit["trace"], lines_count=fit["lines"])
        if fit["coloring"]:
            _draw_coloring(c, data, margin=margin, usable_width=usable_width, y=y, bottom=bottom)
        _draw_footer(c, data, width=width, margin=margin, notice=notice)
    else:
        # Too long for one page: copy + start of tracing here, the rest on page 2.
        size = TWO_PAGE_TRACE_SIZE
        y = draw_paragraph_box(c, "Copy this verse:", data["fullVerse"], margin, y, usable_width,
                               style=_copy_style(10))
        lines = trace_lines(_trace_text(data), usable_width, use_cursive, size)
        per_line = size + layout.TRACE_LINE_SPACING
        room = int(max(0, (y - bottom) - trace_box_height(0, size)) // per_line)
        first, rest = lines[:room], lines[room:]
        if first:
            y = draw_tracing_box(c, "Trace the verse:", "", margin, y, usable_width, use_cursive=use_cursive,
                                 font_size=size, lines=first)
        _draw_footer(c, data, width=width, margin=margin, notice=notice)
        c.showPage()
        y = _draw_header(c, data, width=width, margin=margin, y=height - margin - 10, continued=True)
        while rest:
            room = int(max(1, (y - margin) - trace_box_height(0, size)) // per_line)
            chunk, rest = rest[:room], rest[room:]
            title = "Trace the verse:" if not first else "Trace the verse (continued):"
            y = draw_tracing_box(c, title, "", margin, y, usable_width, use_cursive=use_cursive,
                                 font_size=size, lines=chunk)
            first = first or chunk
            if rest:
                _draw_footer(c, data, width=width, margin=margin, notice=[])
                c.showPage()
                y = _draw_header(c, data, width=width, margin=margin, y=height - margin - 10, continued=True)
        y = _draw_writing_and_reflection(c, data, margin=margin, usable_width=usable_width, y=y,
                                         lines_count=int(data.get("handwritingLines") or 3))
        _draw_coloring(c, data, margin=margin, usable_width=usable_width, y=y, bottom=margin)
        _draw_footer(c, data, width=width, margin=margin, notice=[])
    c.showPage()
    c.save()
    print(f"✅ Final worksheet saved to: {pdf_path}")


def build_coloring_pdf(
    pdf_path,
    *,
    image_path,
    title,
    reference_text="",
    age_bracket="",
    summary_text="",
    versions_used=None,
):
    width, height = letter
    margin = layout.DEFAULT_MARGIN_INCH * inch
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    logo_reader = _load_image("static/faith_sparks_logo_192.png")
    qr_reader = _load_image("faithsparks_qr.png")
    logo_size = 48
    top_y = height - margin - 10
    if logo_reader:
        c.drawImage(logo_reader, margin, top_y - logo_size, width=logo_size, height=logo_size, mask='auto')
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, top_y - logo_size, width=logo_size, height=logo_size)

    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, top_y - logo_size / 2, _pdf_safe_text(title))
    if reference_text:
        c.setFont("Helvetica", 12)
        c.drawCentredString(width / 2, top_y - logo_size - 18, _pdf_safe_text(reference_text))
    if age_bracket:
        c.setFont("Helvetica", 10)
        c.drawRightString(width - margin, top_y + 4, f"Ages {age_bracket}")

    art_top = top_y - logo_size - 36
    summary_block = 1.6 * inch
    art_bottom = margin + summary_block + 36
    art_height = max(1.0 * inch, art_top - art_bottom)
    art_width = width - 2 * margin
    art_reader = _load_image(str(image_path))
    if art_reader:
        iw, ih = art_reader.getSize()
        scale = min(art_width / iw, art_height / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        draw_x = (width - draw_w) / 2
        draw_y = art_bottom + (art_height - draw_h) / 2
        c.drawImage(art_reader, draw_x, draw_y, width=draw_w, height=draw_h, mask='auto')
        content_bottom = draw_y
    else:
        c.setFont("Helvetica-Oblique", 12)
        c.drawCentredString(width / 2, (art_top + art_bottom) / 2, "Art preview unavailable")
        content_bottom = art_bottom

    if summary_text:
        para = Paragraph(_pdf_safe_text(summary_text), styles["Normal"])
        wrap_w = width - 2 * margin
        _, para_height = para.wrap(wrap_w, summary_block)
        para_y = margin + summary_block - 10
        para.drawOn(c, margin, para_y)
        content_bottom = min(content_bottom, para_y)

    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)

    verse_code = _pdf_safe_text((title or "coloring").upper().replace(" ", "_"))
    c.setFillColor(black)
    footer_lift = 0
    if content_bottom and content_bottom > inch:
        footer_lift = min(layout.FOOTER_LIFT_MAX, content_bottom - inch)
    c.drawRightString(width - margin, 0.32 * inch + footer_lift, f"FS-{verse_code}")
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, 0.23 * inch + footer_lift, f"© {COPYRIGHT_YEAR} Faith Sparks Printables · For personal use only")
    append_scripture_notices_page(c, versions_used=versions_used, margin=margin)
    c.save()
