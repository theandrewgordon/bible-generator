import unittest
from io import BytesIO

from pypdf import PdfReader

import app


class WorshipLyricExportTests(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True

    def test_export_lyric_sheet_references_repeat_chorus(self):
        song = {
            "id": "holy-forever",
            "title": "Holy Forever",
            "artist": "Bethel",
            "key": "C",
            "parts": {
                "verse1": ["A thousand generations"],
                "chorus": ["Your name is the highest", "Your name is the greatest"],
                "verse2": ["If you've been forgiven"],
            },
            "arrangement": ["verse1", "chorus", "verse2", "chorus"],
        }

        original_get = app.get_worship_song
        try:
            app.get_worship_song = lambda song_id: song if song_id == "holy-forever" else None
            with app.app.test_request_context(
                "/worship/export/lyric-sheet",
                method="POST",
                data={"song_order": "holy-forever", "song_ids": ["holy-forever"]},
            ):
                app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                response = app.worship_export_lyric_sheet()
        finally:
            app.get_worship_song = original_get

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/pdf")
        response.direct_passthrough = False
        pdf_bytes = response.get_data()
        body = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(pdf_bytes)).pages)
        self.assertIn("Holy Forever", body)
        self.assertIn("CHORUS", body)
        self.assertIn("Your name is the highest", body)
        self.assertIn("Your name is the greatest", body)
        self.assertEqual(body.count("Your name is the highest"), 1)
        self.assertGreaterEqual(body.count("CHORUS"), 2)
        self.assertIn("(repeat)", body)


if __name__ == "__main__":
    unittest.main()
