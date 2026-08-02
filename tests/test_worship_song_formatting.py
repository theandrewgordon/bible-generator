import unittest

import app


class WorshipSongFormattingTests(unittest.TestCase):
    def test_normalize_worship_song_canonicalizes_parts_and_arrangement(self):
        song = {
            "title": "House of the Lord",
            "parts": {
                "Verse 1": ["Line A", "Line B"],
                "Chorus 1": ["Praise You", "Forever"],
                "Chorus 2": ["A different refrain"],
                "PreChorus": ["We sing"],
            },
            "arrangement": ["Verse 1", "Pre-Chorus", "Chorus 1", "Chorus 2"],
        }

        normalized = app.normalize_worship_song(song)

        self.assertEqual(normalized["id"], "house-of-the-lord")
        self.assertIn("verse1", normalized["parts"])
        self.assertIn("chorus", normalized["parts"])
        self.assertIn("pre_chorus", normalized["parts"])
        self.assertIn("chorus2", normalized["parts"])
        self.assertEqual(normalized["arrangement"], ["verse1", "pre_chorus", "chorus", "chorus2"])

    def test_song_id_allows_named_versions_to_coexist(self):
        original = app._worship_song_id_base("Holy Forever", "Chris Tomlin", "Original")
        acoustic = app._worship_song_id_base("Holy Forever", "Chris Tomlin", "Acoustic")

        self.assertNotEqual(original, acoustic)
        self.assertTrue(original.endswith("-original"))
        self.assertTrue(acoustic.endswith("-acoustic"))

    def test_normalize_service_slide_cleans_text_and_layout(self):
        normalized = app.normalize_worship_song({
            "title": " Welcome ",
            "type": "welcome",
            "service_lines": ["  We are glad you're here  ", "", "Coffee after service"],
            "image_layout": "unexpected",
            "image_path": " worship-media/church/welcome.jpg ",
        })

        self.assertEqual(normalized["service_lines"], ["We are glad you're here", "Coffee after service"])
        self.assertEqual(normalized["image_layout"], "full")
        self.assertEqual(normalized["image_path"], "worship-media/church/welcome.jpg")

    def test_build_lyric_sheet_blocks_references_repeat_chorus(self):
        song = {
            "title": "Holy Forever",
            "parts": {
                "verse1": ["A thousand generations"],
                "chorus": ["Your name is the highest", "Your name is the greatest"],
                "verse2": ["If you've been forgiven"],
            },
            "arrangement": ["verse1", "chorus", "verse2", "chorus"],
        }

        blocks = app.build_lyric_sheet_blocks(song)

        self.assertEqual(len(blocks), 4)
        self.assertEqual(blocks[1]["part"], "chorus")
        self.assertFalse(blocks[1]["reference_only"])
        self.assertEqual(blocks[1]["lines"], ["Your name is the highest", "Your name is the greatest"])
        self.assertEqual(blocks[3]["part"], "chorus")
        self.assertTrue(blocks[3]["reference_only"])
        self.assertEqual(blocks[3]["lines"], [])
        self.assertEqual(blocks[3]["label"], "Chorus")

    def test_worship_part_label_formats_canonical_key(self):
        self.assertEqual(app._worship_part_label("pre_chorus"), "Pre Chorus")
        self.assertEqual(app._worship_part_label("chorus2"), "Chorus 2")

    def test_unique_worship_song_id_uses_artist_and_suffix(self):
        existing = {"same-song-artist-a", "same-song-artist-a-2"}
        original_get = app.get_worship_song
        try:
            app.get_worship_song = lambda song_id: {"id": song_id} if song_id in existing else None
            song_id = app._make_unique_worship_song_id("Same Song", "Artist A")
        finally:
            app.get_worship_song = original_get

        self.assertEqual(song_id, "same-song-artist-a-3")


if __name__ == "__main__":
    unittest.main()
