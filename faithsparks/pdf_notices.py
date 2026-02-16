import re

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth


def _wrap_lines(text: str, font: str, size: int, max_width: float) -> list[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


_NOTICE_ORDER = ["KJV", "NLT", "CSB", "ESV"]
_NOTICE_TEXT = {
    "KJV": "Scripture quotations marked (KJV) are from the King James Version of the Bible (public domain).",
    "NLT": (
        "Scripture quotations marked (NLT) are taken from the Holy Bible, New Living Translation, "
        "copyright (c)1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House "
        "Publishers, Carol Stream, Illinois 60188. All rights reserved."
    ),
    "CSB": (
        "Scripture quotations marked (CSB) have been taken from the Christian Standard Bible (R), "
        "Copyright (c) 2017 by Holman Bible Publishers. Used by permission. Christian Standard Bible (R) "
        "and CSB (R) are federally registered trademarks of Holman Bible Publishers."
    ),
    "ESV": (
        "Scripture quotations are from the ESV (R) Bible (The Holy Bible, English Standard Version (R)), "
        "(c) 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. "
        "The ESV text may not be quoted in any publication made available to the public by a Creative "
        "Commons license. The ESV may not be translated in whole or in part into any other language. "
        "Used by permission. All rights reserved."
    ),
}


def _normalize_versions(versions_used) -> list[str]:
    if versions_used is None:
        return list(_NOTICE_ORDER)
    if isinstance(versions_used, str):
        versions = [versions_used]
    else:
        versions = list(versions_used)
    normalized = set()
    for value in versions:
        token = re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()
        if token in _NOTICE_TEXT:
            normalized.add(token)
    return [v for v in _NOTICE_ORDER if v in normalized]


def append_scripture_notices_page(c, versions_used=None, margin: float = 0.6 * inch) -> None:
    """
    Append a standard Scripture attribution/permissions page to the current PDF.
    """
    width, height = letter
    c.showPage()

    y = height - margin
    max_width = width - (2 * margin)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, y, "Scripture Attribution & Permissions")
    y -= 24

    c.setFont("Helvetica", 10)
    intro = (
        "Faith Sparks Printables includes limited Scripture quotations for educational use. "
        "Quotations are shown verbatim and marked by translation."
    )
    for line in _wrap_lines(intro, "Helvetica", 10, max_width):
        c.drawString(margin, y, line)
        y -= 13
    y -= 6

    selected_versions = _normalize_versions(versions_used)

    if not selected_versions:
        c.setFont("Helvetica", 10)
        msg = "No KJV, NLT, CSB, or ESV quotations were selected for this document."
        for line in _wrap_lines(msg, "Helvetica", 10, max_width):
            c.drawString(margin, y, line)
            y -= 13
        y -= 8

    sections = []
    for code in selected_versions:
        heading = "KJV (Public Domain)" if code == "KJV" else code
        sections.append((heading, _NOTICE_TEXT[code]))

    for heading, body in sections:
        if y < margin + 120:
            c.showPage()
            y = height - margin
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, heading)
        y -= 14
        c.setFont("Helvetica", 9)
        for line in _wrap_lines(body, "Helvetica", 9, max_width):
            c.drawString(margin, y, line)
            y -= 11
        y -= 8

    if y < margin + 36:
        c.showPage()
        y = height - margin
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(margin, y, "All Scripture quotations are provided in English only.")
