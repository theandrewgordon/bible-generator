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

# Register fonts
pdfmetrics.registerFont(TTFont('KGPrimaryDots', 'fonts/KGPrimaryDotsLined.ttf'))
pdfmetrics.registerFont(TTFont('LearningCurve', 'fonts/LearningCurveDashed-w4DP.ttf'))

# Styles and layout constants
LIGHT_GRAY = 0.95
TRACE_BG = HexColor("#f9f9f9")
line_spacing = 22
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

TRACE_CONNECTORS = {"and", "but", "for", "nor", "or", "so", "yet", "in", "on", "at", "to", "by", "of"}


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
        if len(soft_line) > 55 and len(current_words) > 1:
            tail = current_words.pop()
            flush()
            current_words = [tail]
    flush()
    return [ln.strip() for ln in lines if ln.strip()]

def draw_rounded_box(c, x, y, width, height):
    c.setFillGray(LIGHT_GRAY)
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
    font_size = 30
    padding = 10
    text = capitalize_first_letter(_pdf_safe_text(text))
    lines = wrap_text_lines(text, font, font_size, width - 40)
    box_height = len(lines) * (font_size + 11) + 2 * padding + 20
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
        ty -= font_size + 11

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
    margin = 0.75 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    # Load brand assets
    logo_reader = _load_image("static/faith_sparks_logo_small.jpg")
    qr_reader = _load_image("faithsparks_qr.png")
    logo_size = 48
    if logo_reader:
        c.drawImage(logo_reader, margin, y - logo_size, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
    if qr_reader:
        c.drawImage(qr_reader, width - margin - logo_size, y - logo_size, width=logo_size, height=logo_size)

    # Title
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y - 12, "Bible Copywork Worksheet")
    y -= logo_size + 10

    # Reference line
    verse_display = _pdf_safe_text(f"{data['verse']} ({data['version'].upper()})")
    c.setFont("Helvetica-Bold", 14 if len(verse_display) < 25 else 12)
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
    available_height = y - (0.75 * inch)
    box_h = min(available_height, 2.5 * inch)
    box_w = 4.5 * inch
    gap = 0.4 * inch
    label_w = min(usable_width - box_w - gap, 4.0 * inch)
    if label_w < 3.2 * inch:
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

    # Border + Footer
    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)

    verse_code = _pdf_safe_text(
        data["verse"].upper().replace(":", "_").replace(" ", "_") + f"_{data['version'].upper()}"
    )
    c.setFillColor(black)
    c.drawRightString(width - margin, 0.32 * inch, f"FS-{verse_code}")
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, 0.23 * inch, "© 2025 Faith Sparks Printables · For personal use only")

    c.save()
    print(f"✅ Final worksheet saved to: {pdf_path}")
