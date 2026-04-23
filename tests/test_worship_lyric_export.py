import unittest

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

        response.direct_passthrough = False
        body = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("Holy Forever", body)
        self.assertIn("Chorus\nYour name is the highest\nYour name is the greatest", body)
        self.assertEqual(body.count("Your name is the highest"), 1)
        self.assertGreaterEqual(body.count("Chorus"), 2)


if __name__ == "__main__":
    unittest.main()
