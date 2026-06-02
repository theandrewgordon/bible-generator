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

    def test_clean_lyrics_site_paste_stops_at_azlyrics_footer(self):
        pasted = '''"Gratitude" lyrics
Brandon Lake Lyrics
"Gratitude"

All my words fall short
I got nothing new

So I throw up my hands
And praise You again

Submit Corrections
Writer(s): Someone
AZLyrics
album:
"House Of Miracles"
'''

        cleaned = app._clean_lyrics_site_paste(pasted)

        self.assertIn("So I throw up my hands", cleaned["lyrics"])
        self.assertNotIn("Submit Corrections", cleaned["lyrics"])
        self.assertNotIn("Writer(s)", cleaned["lyrics"])
        self.assertNotIn("House Of Miracles", cleaned["lyrics"])

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

    def test_detects_line_exploded_ai_parse(self):
        parsed = {
            "parts": {f"verse{i}": [f"Line {i}"] for i in range(1, 14)},
            "arrangement": [f"verse{i}" for i in range(1, 14)],
        }

        self.assertTrue(app._looks_like_line_exploded_worship_parse(parsed))

    def test_detects_line_exploded_ai_parse_before_key_normalization(self):
        parsed = {
            "parts": {f"Verse {i}": [f"Line {i}"] for i in range(1, 14)},
            "arrangement": [f"Verse {i}" for i in range(1, 14)],
        }

        self.assertTrue(app._looks_like_line_exploded_worship_parse(parsed))

    def test_fallback_parse_reuses_near_repeat_chorus(self):
        pasted = '''"Near Repeat" lyrics
Example Artist Lyrics
"Near Repeat"

Verse line one
Verse line two

Chorus line one
Chorus line two
Chorus line three
Chorus line four

Second verse line one
Second verse line two

Chorus line one
Chorus line two
Chorus line three
Chorus line four

Bridge line one
Bridge line two
Bridge line three

Chorus line one
Chorus line two
Chorus line three
'''

        parsed = app._fallback_parse_worship_lyrics(pasted)

        self.assertEqual(parsed["arrangement"], ["verse1", "chorus", "verse2", "chorus", "verse3", "chorus"])
        self.assertEqual(parsed["parts"]["chorus"], ["Chorus line one", "Chorus line two", "Chorus line three", "Chorus line four"])


if __name__ == "__main__":
    unittest.main()
