import unittest

import app


class WorshipSongFormattingTests(unittest.TestCase):
    def test_normalize_worship_song_canonicalizes_parts_and_arrangement(self):
        song = {
            "title": "House of the Lord",
            "parts": {
                "Verse 1": ["Line A", "Line B"],
                "Chorus 1": ["Praise You", "Forever"],
                "PreChorus": ["We sing"],
            },
            "arrangement": ["Verse 1", "Pre-Chorus", "Chorus 1", "Chorus 2"],
        }

        normalized = app.normalize_worship_song(song)

        self.assertEqual(normalized["id"], "house-of-the-lord")
        self.assertIn("verse1", normalized["parts"])
        self.assertIn("chorus", normalized["parts"])
        self.assertIn("pre_chorus", normalized["parts"])
        self.assertEqual(normalized["arrangement"], ["verse1", "pre_chorus", "chorus", "chorus"])

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


if __name__ == "__main__":
    unittest.main()
