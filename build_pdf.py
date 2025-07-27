import os
import json
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

pdfmetrics.registerFont(TTFont('KGPrimaryDots', 'fonts/KGPrimaryDotsLined.ttf'))
pdfmetrics.registerFont(TTFont('LearningCurve', 'fonts/LearningCurveDashed-w4DP.ttf'))

LIGHT_GRAY = 0.95
line_spacing = 22
styles = getSampleStyleSheet()

def capitalize_first_letter(text):
    return text[0].upper() + text[1:] if text and text[0].islower() else text

def tokenize_traceable(text):
    return text.split()

def wrap_text_lines(text, font, font_size, max_width):
    words = tokenize_traceable(text)
    lines = []
    current_line = ""
    for word in words:
        test_line = f"{current_line} {word}".strip() if current_line else word
        if pdfmetrics.stringWidth(test_line, font, font_size) > max_width:
            lines.append(current_line.strip())
            current_line = word
        else:
            current_line = test_line
    if current_line:
        lines.append(current_line.strip())
    return lines

def draw_rounded_box(c, x, y, width, height):
    c.setFillGray(LIGHT_GRAY)
    c.roundRect(x, y - height, width, height, radius=8, fill=1)
    c.setFillColor(black)

def draw_paragraph_box(c, title, content, x, y, width, padding=10):
    content = capitalize_first_letter(content)
    para = Paragraph(content, styles['Normal'])
    _, para_height = para.wrap(width - 2 * padding, 1000)
    box_height = para_height + 2 * padding + 20
    draw_rounded_box(c, x, y, width, box_height)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + padding, y - padding - 2, title)
    para.drawOn(c, x + padding, y - padding - para_height - 10)
    return y - box_height - 10

def draw_tracing_box(c, title, text, x, y, width, use_cursive=False):
    font = 'LearningCurve' if use_cursive else 'KGPrimaryDots'
    font_size = 30
    padding = 10
    text = capitalize_first_letter(text)
    lines = wrap_text_lines(text, font, font_size, width - 40)
    box_height = len(lines) * (font_size + 10) + 2 * padding + 20
    c.roundRect(x, y - box_height, width, box_height, radius=8, fill=0)

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
        ty -= font_size + 10

    return y - box_height - 10


def draw_handwriting_box(c, title, x, y, width, lines_count=3, padding=10):
    line_height = line_spacing + 6
    box_height = lines_count * line_height + 2 * padding + 20
    c.roundRect(x, y - box_height, width, box_height, radius=8, fill=0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + padding, y - padding - 2, title)
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

def generate_pdf(data, pdf_path, use_cursive=False):
    width, height = letter
    margin = 0.75 * inch
    usable_width = width - 2 * margin
    y = height - margin - 10
    c = canvas.Canvas(str(pdf_path), pagesize=letter)

    logo_path = "faith_sparks_logo.png"
    qr_path = "faithsparks_qr.png"
    logo_size = 50
    if os.path.exists(logo_path):
        c.drawImage(logo_path, margin, y - logo_size, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
    if os.path.exists(qr_path):
        c.drawImage(qr_path, width - margin - logo_size, y - logo_size, width=logo_size, height=logo_size)

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y - 12, "Bible Copywork Worksheet")
    y -= logo_size + 10

    verse_display = f"{data['verse']} ({data['version'].upper()})"
    c.setFont("Helvetica-Bold", 14 if len(verse_display) < 25 else 12)
    c.drawCentredString(width / 2, y, verse_display)
    y -= 20

    # Draw full verse
    y = draw_paragraph_box(c, "Verse:", data["fullVerse"], margin, y, usable_width)

    # Use fullVerse for traceable if it's 26 words or fewer
    full = data.get("fullVerse", "")
    trace = data.get("traceableVerse", full)
    if len(full.split()) <= 26:
        trace = full

    y = draw_tracing_box(c, "Trace it:", trace, margin, y, usable_width, use_cursive=use_cursive)

    y = draw_handwriting_box(c, "Now write it yourself:", margin, y, usable_width, data["handwritingLines"])
    y = draw_paragraph_box(c, "Think about this:", data["reflectionQuestion"], margin, y, usable_width)

    available_height = y - (0.75 * inch)
    box_h = min(available_height, 2.5 * inch)
    box_w = 4.5 * inch
    gap = 0.4 * inch
    label_w = usable_width - box_w - gap
    draw_paragraph_box(c, "Coloring Prompt:", data["imageIdea"], margin, y, label_w)
    c.setLineWidth(1.25)
    c.roundRect(margin + label_w + gap, y - box_h, box_w, box_h, radius=8)

    c.setStrokeGray(0.8)
    c.setLineWidth(0.5)
    c.rect(0.5 * inch, 0.5 * inch, width - inch, height - inch)
    verse_code = data["verse"].upper().replace(":", "_").replace(" ", "_") + f"_{data['version'].upper()}"
    c.setFillColor(black)
    c.drawRightString(width - margin, 0.32 * inch, f"FS-{verse_code}")
    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawCentredString(width / 2, 0.23 * inch, "© 2025 Faith Sparks Printables · For personal use only")
    c.save()
    print(f"✅ Final worksheet saved to: {pdf_path}")

