import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from pptx import Presentation
from reportlab.pdfgen import canvas

import app
from faithsparks.services.worship_presentations import (
    deterministic_highlights,
    presentation_conversion_capabilities,
    render_presentation,
    suggest_sermon_highlights,
)


class WorshipPresentationTests(unittest.TestCase):
    def test_conversion_capabilities_require_both_tools_for_powerpoint(self):
        def resolve(executable):
            return f"/usr/bin/{executable}" if executable == "pdftoppm" else None

        with patch("faithsparks.services.worship_presentations.shutil.which", side_effect=resolve):
            capabilities = presentation_conversion_capabilities()

        self.assertEqual(capabilities, {"pdf": True, "pptx": False})

    def test_configured_converter_command_can_be_resolved_from_path(self):
        def resolve(executable):
            if executable in {"custom-soffice", "pdftoppm"}:
                return f"/usr/local/bin/{executable}"
            return None

        with patch.dict(os.environ, {"SOFFICE_BIN": "custom-soffice"}, clear=False):
            with patch("faithsparks.services.worship_presentations.shutil.which", side_effect=resolve):
                capabilities = presentation_conversion_capabilities()

        self.assertEqual(capabilities, {"pdf": True, "pptx": True})

    def test_notes_create_grounded_editable_highlight_candidates(self):
        notes = """
        - Grace meets us before we have everything figured out.
        - Romans 8:1 reminds us that there is no condemnation in Christ.
        Remember: God is still working when the outcome is not visible.
        """

        highlights = deterministic_highlights(notes)
        fallback = suggest_sermon_highlights(notes, api_key="")

        self.assertEqual(highlights, fallback)
        self.assertIn("Romans 8:1", " ".join(highlights))
        self.assertTrue(all(point in notes for point in highlights))

    def test_presentation_expands_visible_pages_and_selected_highlights_in_order(self):
        item = {
            "id": "romans-8-sermon",
            "title": "Romans 8 Sermon",
            "type": "presentation",
            "presentation_slides": [
                {"id": "slide-1", "image_path": "one.jpg", "source_number": 1},
                {"id": "slide-2", "image_path": "two.jpg", "source_number": 2, "hidden": True},
            ],
            "highlight_position": "before",
            "highlight_suggestions": [
                {"id": "highlight-1", "text": "There is no condemnation in Christ.", "enabled": True},
                {"id": "highlight-2", "text": "Unused point", "enabled": False},
            ],
        }

        with app.app.test_request_context("/worship"):
            slides = app._build_worship_mobile_slides([item])

        self.assertEqual([slide["kind"] for slide in slides], ["highlight", "presentation"])
        self.assertEqual(slides[0]["lines"], ["There is no condemnation in Christ."])
        self.assertEqual(slides[1]["media_slide_id"], "slide-1")
        self.assertIn("slide=slide-1", slides[1]["image_url"])

    def test_normalization_sanitizes_presentation_controls(self):
        normalized = app.normalize_worship_song({
            "title": " Sermon ",
            "type": "presentation",
            "presentation_slides": [
                {"id": "slide one", "image_path": " path.jpg ", "source_number": "bad"},
                {"id": "slide one", "image_path": "other.jpg", "hidden": "yes"},
            ],
            "highlight_position": "somewhere",
            "highlight_suggestions": [{"text": "  Key   point  ", "enabled": "on"}],
        })

        self.assertEqual(normalized["presentation_slides"][0]["id"], "slide-one")
        self.assertEqual(normalized["presentation_slides"][0]["source_number"], 1)
        self.assertEqual(normalized["presentation_slides"][1]["id"], "slide-2")
        self.assertTrue(normalized["presentation_slides"][1]["hidden"])
        self.assertEqual(normalized["highlight_position"], "after")
        self.assertEqual(normalized["highlight_suggestions"][0]["text"], "Key point")
        self.assertTrue(normalized["highlight_suggestions"][0]["enabled"])

    def test_imported_slide_is_contained_on_powerpoint_canvas(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "portrait.jpg"
            Image.new("RGB", (600, 900), "#24505f").save(image_path, "JPEG")
            deck = Presentation()
            deck.slide_width = app.Inches(13.333)
            deck.slide_height = app.Inches(7.5)

            slide = app.create_imported_presentation_slide(deck, str(image_path))

        pictures = [shape for shape in slide.shapes if shape.shape_type == 13]
        self.assertEqual(len(pictures), 1)
        self.assertLess(pictures[0].width, deck.slide_width)
        self.assertEqual(pictures[0].height, deck.slide_height)

    @unittest.skipUnless(shutil.which("pdftoppm"), "pdftoppm is required for presentation rendering")
    def test_pdf_import_renders_every_page(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "sermon.pdf"
            pdf = canvas.Canvas(str(source), pagesize=(960, 540))
            pdf.drawString(80, 450, "Opening slide")
            pdf.showPage()
            pdf.drawString(80, 450, "Second slide")
            pdf.save()

            pages = render_presentation(source, ".pdf", Path(temp_dir) / "rendered")

            self.assertEqual(len(pages), 2)
            self.assertTrue(all(path.is_file() for path in pages))
            with Image.open(pages[0]) as image:
                self.assertGreater(image.width, image.height)


if __name__ == "__main__":
    unittest.main()
