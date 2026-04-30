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
    words = tokenize_traceable(text)
    lines: list[str] = []
    current_words: list[str] = []

    def flush():
        if current_words:
            lines.append(" ".join(current_words))

    for word in words:
        tentative = current_words + [word]
        tentative_line = " ".join(tentative)
        width = pdfmetrics.stringWidth(tentative_line, font, font_size)

        if width > max_width and current_words:
            if current_words[-1].lower() in TRACE_CONNECTORS and len(current_words) > 1:
                connector = current_words.pop()
                flush()
                current_words = [connector, word]
            else:
                flush()
                current_words = [word]
        else:
            current_words = tentative

        soft_line = " ".join(current_words)
        if len(soft_line) > 60 and len(current_words) > 1:
            tail = current_words.pop()
            flush()
            current_words = [tail]
    flush()
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

def draw_tracing_box(c, title, text, x, y, width, use_cursive=False):
    font = 'LearningCurve' if use_cursive else 'KGPrimaryDots'
    font_size = layout.TRACE_FONT_SIZE
    padding = 10
    text = capitalize_first_letter(_pdf_safe_text(text))
    lines = wrap_text_lines(text, font, font_size, width - 40)
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


def generate_pdf(data, pdf_path, use_cursive=False):
    width, height = letter
    margin = layout.DEFAULT_MARGIN_INCH * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    # Load brand assets
    logo_reader = _load_image("static/faith_sparks_logo_192.png")
    qr_reader = _load_image("faithsparks_qr.png")
    logo_size = 48
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size, width=logo_size, height=logo_size)

    # Title
    worksheet_title = _pdf_safe_text(data.get("title") or data.get("verse") or "Bible Copywork Worksheet")
    c.setTitle(worksheet_title)
    c.setAuthor("Faith Sparks Printables")
    c.setSubject(f"Bible copywork worksheet for {data.get('verse', '')}")
    c.setCreator("Faith Sparks Printables")
    keywords = [worksheet_title, data.get("verse", ""), data.get("version", "").upper(), "Bible", "Copywork"]
    c.setKeywords(", ".join(filter(None, keywords)))
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y - 12, "Bible Copywork Worksheet")
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, y - 30, worksheet_title)
    y -= logo_size + 16

    # Reference line
    verse_display = _pdf_safe_text(f"{data['verse']} ({data['version'].upper()})")
    font_size = layout.VERSE_FONT_MAX if len(verse_display) < 28 else layout.VERSE_FONT_MIN
    c.setFont("Helvetica-Bold", font_size)
    c.drawCentredString(width / 2, y, verse_display)
    y -= 20

    # Full verse box
    y = draw_paragraph_box(c, "Verse:", data["fullVerse"], margin, y, usable_width)

    # Traceable text logic
    full = data.get("fullVerse", "")
    trace = data.get("traceableVerse", full)
    if len(full.split()) <= 26:
        trace = full

    # Cursive toggle (from JSON payload)
# use_cursive now comes from function param instead of inside the data
    y = draw_tracing_box(c, "Trace it:", trace, margin, y, usable_width, use_cursive=use_cursive)

    # Handwriting section
    y -= 6
    y = draw_handwriting_box(c, "Now write it yourself:", margin, y, usable_width, data["handwritingLines"])

    # Reflection
    y = draw_paragraph_box(
        c,
        "Think about this:",
        data["reflectionQuestion"],
        margin,
        y,
        usable_width,
        ensure_question=True,
    )

    # Coloring section
    available_height = y - (layout.DEFAULT_MARGIN_INCH * inch)
    box_h = min(available_height, 2.5 * inch)
    box_w = 4.5 * inch
    gap = 0.4 * inch
    label_w = min(usable_width - box_w - gap, layout.COLORING_PROMPT_WIDTH_MAX * inch)
    if label_w < layout.COLORING_PROMPT_WIDTH_MIN * inch:
        label_w = usable_width - box_w - gap
    draw_paragraph_box(
        c,
        "Coloring Prompt:",
        data["imageIdea"],
        margin,
        y,
        label_w,
        style=COLORING_STYLE,
        ensure_question=True,
    )
    c.setLineWidth(1.25)
    c.roundRect(margin + label_w + gap, y - box_h, box_w, box_h, radius=8)
    content_bottom = y - box_h

    # Border + Footer
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)

    verse_code = _pdf_safe_text(
        data["verse"].upper().replace(":", "_").replace(" ", "_") + f"_{data['version'].upper()}"
    )
    c.setFillColor(black)
    footer_lift = 0
    if content_bottom and content_bottom > inch:
        footer_lift = min(layout.FOOTER_LIFT_MAX, content_bottom - inch)
    c.drawRightString(width - margin, 0.32 * inch + footer_lift, f"FS-{verse_code}")
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)

    c.drawCentredString(width / 2, 0.23 * inch + footer_lift, f"© {COPYRIGHT_YEAR} Faith Sparks Printables · For personal use only")

    append_scripture_notices_page(c, versions_used=[data.get("version")], margin=margin)
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
