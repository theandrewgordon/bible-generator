import unittest

import app


class WorshipParseCleanupTests(unittest.TestCase):
    def test_clean_lyrics_site_paste_strips_page_chrome(self):
        pasted = '''AZLyrics.com

"Sample Song" lyrics
Example Artist Lyrics
Play "Sample Song"on Apple Music
"Sample Song"

First verse line
Second verse line

Lift this chorus
Lift this chorus again

You May Also Like
Other Artist - "Other Song"
Submit Lyrics
Copyright 2000-2026 AZLyrics.com
'''

        cleaned = app._clean_lyrics_site_paste(pasted)

        self.assertEqual(cleaned["title"], "Sample Song")
        self.assertEqual(cleaned["artist"], "Example Artist")
        self.assertIn("First verse line", cleaned["lyrics"])
        self.assertIn("Lift this chorus", cleaned["lyrics"])
        self.assertNotIn("You May Also Like", cleaned["lyrics"])
        self.assertNotIn("Copyright", cleaned["lyrics"])

    def test_fallback_parse_creates_parts_and_arrangement(self):
        pasted = '''"Sample Song" lyrics
Example Artist Lyrics
"Sample Song"

Verse one line
Verse one second line

Shared chorus line
Shared chorus second line

Verse two line
Verse two second line

Shared chorus line
Shared chorus second line
'''

        parsed = app._fallback_parse_worship_lyrics(pasted)

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["title"], "Sample Song")
        self.assertEqual(parsed["artist"], "Example Artist")
        self.assertIn("chorus", parsed["parts"])
        self.assertEqual(parsed["arrangement"], ["verse1", "chorus", "verse2", "chorus"])

    def test_extract_readable_text_from_html_skips_scripts_and_preserves_lines(self):
        html = """<html><head><style>.x{}</style><script>bad()</script></head>
<body><h1>Sample Song</h1><p>Verse line<br>Second line</p><footer>Submit Lyrics</footer></body></html>"""

        text = app._extract_readable_text_from_html(html)

        self.assertIn("Sample Song", text)
        self.assertIn("Verse line", text)
        self.assertIn("Second line", text)
        self.assertNotIn("bad()", text)

    def test_import_url_rejects_localhost(self):
        self.assertFalse(app._is_safe_worship_import_url("http://127.0.0.1:5000/worship"))
        self.assertFalse(app._is_safe_worship_import_url("file:///tmp/song.txt"))

    def test_labeled_fallback_parse_uses_section_headers(self):
        pasted = """Example Song

[Verse 1]
First verse line
Second verse line

[Chorus]
Shared chorus line

[Verse 2]
Another verse line

[Chorus]
Shared chorus line
"""

        parsed = app._fallback_parse_worship_lyrics(pasted, title="Example Song")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["arrangement"], ["verse1", "chorus", "verse2", "chorus"])
        self.assertEqual(parsed["parts"]["verse1"], ["First verse line", "Second verse line"])
        self.assertEqual(parsed["parts"]["chorus"], ["Shared chorus line"])


if __name__ == "__main__":
    unittest.main()
