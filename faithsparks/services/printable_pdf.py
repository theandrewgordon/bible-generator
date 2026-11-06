"""Ink-friendly US Letter card PDFs for private admin exports.

The logo is the site file static/faith_sparks_logo.png. Scripture notices come
from the shared notice helper so the page names the same translation as the cards.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, Paragraph
from reportlab.lib.styles import ParagraphStyle

from faithsparks.pdf_notices import append_scripture_notices_page
from faithsparks.services.printable_products import export_errors, notice_for, reference_line
from faithsparks.services.scripture import TRANSLATIONS

# Same Faith Sparks mark as the site. The 512px file is the existing print-sized
# raster of that logo, so exports are not a redraw and are not a 900KB embed.
LOGO_PATH = Path(__file__).resolve().parents[2] / "static" / "faith_sparks_logo_512.png"

PAGE_W, PAGE_H = letter
CARD_W = 3.9 * inch
CARD_H = 5.0 * inch
MARGIN_X = (PAGE_W - (2 * CARD_W)) / 3
MARGIN_Y = (PAGE_H - (2 * CARD_H)) / 3
_SCALES = (1.0, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64)


def _pdf_safe(value: str) -> str:
    text = str(value or "")
    return (
        text.replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
        .replace("—", "-")
        .replace("–", "-")
        .replace("…", "...")
        .replace("\u00a0", " ")
    )


def _logo():
    if not LOGO_PATH.is_file():
        return None
    return ImageReader(str(LOGO_PATH))


def _style(name: str, font: str, size: float, leading: float, color: str = "#1c1917") -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        spaceAfter=0,
        spaceBefore=0,
    )


def _story(card: dict, translation: str, scale: float) -> list:
    def add(text: str, style: ParagraphStyle, *, html: str | None = None):
        body = html if html is not None else escape(_pdf_safe(text))
        if body:
            items.append(Paragraph(body, style))

    items: list = []
    kicker = _style("kicker", "Helvetica-Bold", 8 * scale, 10 * scale, "#44403c")
    title = _style("title", "Helvetica-Bold", 12 * scale, 14.5 * scale)
    meta = _style("meta", "Helvetica-Bold", 8 * scale, 10.5 * scale)
    verse = _style("verse", "Times-Italic", 9.5 * scale, 12 * scale)
    label = _style("label", "Helvetica", 8 * scale, 10.2 * scale)

    def labeled(name: str, text: str):
        add("", label, html=f"<b>{name}</b> {escape(_pdf_safe(text))}")

    if card["kind"] == "scripture":
        day = " ".join(part for part in (f"Day {card['number']}" if card.get("number") else "", card.get("label") or "") if part)
        add(day, kicker)
        add(card.get("title") or "", title)
        add(reference_line(card, translation), meta)
        add(card.get("scripture_text") or "", verse)
        if card.get("younger_prompt"):
            labeled("Little ones.", card["younger_prompt"])
        if card.get("older_prompt"):
            labeled("Big kids.", card["older_prompt"])
        if card.get("prayer"):
            labeled("Prayer.", card["prayer"])
        if card.get("activity"):
            labeled("Activity.", card["activity"])
        return items
    add(card.get("title") or "Card", title)
    if card["kind"] == "title":
        add("Write your family name on the line.", label)
        add("the ____________________ family", meta)
    elif card["kind"] == "memory":
        add(card.get("activity") or "Write a few memories from this Advent.", label)
        for number in range(1, 5):
            add(f"{number}. ________________________________", label)
    else:
        add(card.get("activity") or "Add your own verse or tradition.", label)
        add("Verse: ________________________________", label)
        add("Tradition: ________________________________", label)
    return items


def _fits(flowables: list, width: float, height: float) -> bool:
    probe = canvas.Canvas(BytesIO(), pagesize=letter)
    frame = Frame(0, 0, width, height, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0)
    leftover = list(flowables)
    frame.addFromList(leftover, probe)
    return not leftover


def card_scale(card: dict, translation: str, width: float, height: float) -> tuple[float, bool]:
    for scale in _SCALES:
        if _fits(_story(card, translation, scale), width, height):
            return scale, True
    return _SCALES[-1], False


def layout_report(product: dict) -> list[str]:
    inner_w = CARD_W - 16
    inner_h = CARD_H - 16
    warnings = []
    for index, card in enumerate(product["cards"], start=1):
        _scale, fitted = card_scale(card, product["translation"], inner_w, inner_h)
        if not fitted:
            warnings.append(card.get("title") or card.get("reference") or f"Card {index}")
    return warnings


def _draw_wrapped(pdf: canvas.Canvas, text: str, x: float, y: float, width: float, font: str, size: float, leading: float) -> float:
    pdf.setFont(font, size)
    words = _pdf_safe(text).split()
    line = ""
    for word in words:
        trial = f"{line} {word}".strip()
        if stringWidth(trial, font, size) <= width:
            line = trial
            continue
        if line:
            pdf.drawString(x, y, line)
            y -= leading
        line = word
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def _draw_cover(pdf: canvas.Canvas, product: dict) -> None:
    translation = product["translation"]
    name = TRANSLATIONS[translation]["name"]
    code = translation.upper()
    logo = _logo()
    y = PAGE_H - 0.7 * inch
    if logo is not None:
        logo_size = 1.7 * inch
        pdf.drawImage(
            logo,
            (PAGE_W - logo_size) / 2,
            y - logo_size,
            width=logo_size,
            height=logo_size,
            preserveAspectRatio=True,
            mask="auto",
            anchor="c",
        )
        y -= logo_size + 18
    pdf.setFillColor("#1c1917")
    y = _draw_wrapped(pdf, product["title"], 0.8 * inch, y, PAGE_W - 1.6 * inch, "Helvetica-Bold", 22, 26)
    y -= 8
    if product.get("subtitle"):
        y = _draw_wrapped(pdf, product["subtitle"], 0.8 * inch, y, PAGE_W - 1.6 * inch, "Helvetica", 12, 16)
        y -= 6
    if product.get("audience"):
        y = _draw_wrapped(pdf, product["audience"], 0.8 * inch, y, PAGE_W - 1.6 * inch, "Helvetica", 11, 14)
        y -= 8
    y = _draw_wrapped(
        pdf,
        f"Scripture edition: {name} ({code}). Excerpts are labeled on the card. Wording is not taken from another translation.",
        0.8 * inch,
        y,
        PAGE_W - 1.6 * inch,
        "Helvetica",
        11,
        14,
    )
    if product.get("story_arc"):
        y -= 8
        _draw_wrapped(pdf, product["story_arc"], 0.8 * inch, y, PAGE_W - 1.6 * inch, "Helvetica", 10, 13)


def _draw_instructions(pdf: canvas.Canvas, product: dict) -> None:
    _code, notice = notice_for(product["translation"])
    logo = _logo()
    y = PAGE_H - 0.7 * inch
    if logo is not None:
        pdf.drawImage(logo, 0.75 * inch, y - 0.85 * inch, width=0.85 * inch, height=0.85 * inch, preserveAspectRatio=True, mask="auto")
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(1.8 * inch, y - 0.45 * inch, "How to use these cards")
        y -= 1.15 * inch
    else:
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(0.75 * inch, y, "How to use these cards")
        y -= 28
    for index, step in enumerate(product.get("instructions") or [], start=1):
        y = _draw_wrapped(pdf, f"{index}. {step}", 0.75 * inch, y, PAGE_W - 1.5 * inch, "Helvetica", 11, 14)
        y -= 6
    y -= 8
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(0.75 * inch, y, "Scripture notice")
    y -= 16
    _draw_wrapped(pdf, notice, 0.75 * inch, y, PAGE_W - 1.5 * inch, "Helvetica", 9, 12)


def _card_origin(index_on_page: int) -> tuple[float, float]:
    column = index_on_page % 2
    row = index_on_page // 2
    x = MARGIN_X + column * (CARD_W + MARGIN_X)
    y = PAGE_H - MARGIN_Y - CARD_H - row * (CARD_H + MARGIN_Y)
    return x, y


def _draw_card(pdf: canvas.Canvas, card: dict, translation: str, x: float, y: float, warnings: list[str]) -> None:
    pdf.saveState()
    pdf.setStrokeColor("#44403c")
    pdf.setDash(2, 2)
    pdf.setLineWidth(0.8)
    pdf.rect(x, y, CARD_W, CARD_H, stroke=1, fill=0)
    pdf.setDash()
    pad = 8
    inner_w = CARD_W - 2 * pad
    inner_h = CARD_H - 2 * pad
    scale, fitted = card_scale(card, translation, inner_w, inner_h)
    if not fitted:
        warnings.append(card.get("title") or card.get("reference") or "Card")
    frame = Frame(x + pad, y + pad, inner_w, inner_h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0)
    story = _story(card, translation, scale)
    frame.addFromList(story, pdf)
    if story:
        pdf.setFillColor("#44403c")
        pdf.setFont("Helvetica", 6)
        pdf.drawString(x + pad, y + 2, "Layout warning: shorten this card")
    pdf.restoreState()


def render_product_pdf(product: dict) -> tuple[bytes, list[str]]:
    """Build the PDF in memory. Returns bytes and any cards that still overflow."""
    problems = export_errors(product)
    if problems:
        raise ValueError("\n".join(problems))
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter, pageCompression=1)
    pdf.setTitle(_pdf_safe(product["title"]))
    pdf.setAuthor("Faith Sparks")
    pdf.setSubject(f"{product['translation'].upper()} printable card set. Unpublished draft.")
    _draw_cover(pdf, product)
    pdf.showPage()
    _draw_instructions(pdf, product)
    pdf.showPage()
    drawn_warnings: list[str] = []
    for index, card in enumerate(product["cards"]):
        if index and index % 4 == 0:
            pdf.showPage()
        x, y = _card_origin(index % 4)
        _draw_card(pdf, card, product["translation"], x, y, drawn_warnings)
    append_scripture_notices_page(pdf, versions_used=[product["translation"]])
    pdf.save()
    return buffer.getvalue(), drawn_warnings
