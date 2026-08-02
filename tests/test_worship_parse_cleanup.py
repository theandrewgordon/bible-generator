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

    def test_clean_lyrics_site_paste_removes_placeholder_and_feature_credit(self):
        pasted = '''"Behold Him" lyrics
Paul Baloche Lyrics
"Behold Him"
(feat. Kim Walker-Smith)

Holy, holy, holy
Is the Lord God Almighty
...

Jesus
Son of God, Messiah
'''

        cleaned = app._clean_lyrics_site_paste(pasted)

        self.assertNotIn("feat.", cleaned["lyrics"])
        self.assertNotIn("...", cleaned["lyrics"])
        self.assertIn("Holy, holy, holy", cleaned["lyrics"])
        self.assertIn("Jesus", cleaned["lyrics"])

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

    def test_labeled_chord_sheet_ignores_instrumental_sections_and_applies_repeats(self):
        pasted = """INTRO
|D / Em/D / |D / Em/D / |

VERSE 1
D Bm A
Opening lyric
Second lyric

TURNAROUND
|D / Em/D / |

BRIDGE
G A G/B D
Every mountain sing high
Sing the harmony

REPEAT BRIDGE 2x

LAST BRIDGE
Every mountain sing high
Sing the harmony

VERSE 2
Closing lyric
Final lyric
"""

        parsed = app._fallback_parse_worship_lyrics(pasted, title="Chart Song")

        self.assertEqual(set(parsed["parts"]), {"verse1", "bridge", "verse2"})
        self.assertEqual(
            parsed["arrangement"],
            ["verse1", "bridge", "bridge", "bridge", "bridge", "verse2"],
        )
        self.assertNotIn("D Bm A", parsed["parts"]["verse1"])

    def test_chart_directions_do_not_trigger_under_arranged_coverage(self):
        source = """VERSE 1
Opening one
Opening two
Opening three
Opening four
Opening five
Opening six
BRIDGE
Bridge one
Bridge two
Bridge three
Bridge four
Bridge five
Bridge six
REPEAT BRIDGE 2x
TURNAROUND
|D / Em/D / |D / Em/D / |
"""
        parsed = {
            "parts": {
                "verse1": [f"Opening {word}" for word in ("one", "two", "three", "four", "five", "six")],
                "bridge": [f"Bridge {word}" for word in ("one", "two", "three", "four", "five", "six")],
            },
            "arrangement": ["verse1", "bridge", "bridge", "bridge"],
        }

        self.assertFalse(app._looks_under_arranged_worship_parse(parsed, source))

    def test_labeled_chart_allows_lyrics_split_around_chord_positions(self):
        source = """VERSE 1
All creatures of our God and
King
Lift up your voice and with us
sing
Thou burning sun with golden
beam
Thou silver moon with softer
gleam
VERSE 2
Thou rushing wind that art so
strong
Ye clouds that sail in heaven a
long
Let all things their Creator
bless
And worship Him in humble
ness
"""
        parsed = {
            "parts": {
                "verse1": [
                    "All creatures of our God and King",
                    "Lift up your voice and with us sing",
                    "Thou burning sun with golden beam",
                    "Thou silver moon with softer gleam",
                ],
                "verse2": [
                    "Thou rushing wind that art so strong",
                    "Ye clouds that sail in heaven along",
                    "Let all things their Creator bless",
                    "And worship Him in humbleness",
                ],
            },
            "arrangement": ["verse1", "verse2", "verse1", "verse2"],
        }

        self.assertFalse(app._looks_under_arranged_worship_parse(parsed, source))

    def test_labeled_chart_allows_many_words_split_inside_chord_anchors(self):
        source = """VERSE 1
All crea
tures of our
God and
King
Lift up your
voice and with us
sing
Thou burn
ing sun with golden
beam
VERSE 2
Thou rush
ing wind that art so
strong
Ye clouds that sail in heaven a
long
And worship Him in humble
ness
BRIDGE
Every moun
tain sing
high
And every
thing in be
tween
Sing the har
mony
VERSE 3
Let all
things their Creator
bless
Praise the Fa
ther praise the
Son
And praise the Spirit three in
one
"""
        parsed = {
            "parts": {
                "verse1": [
                    "All creatures of our God and King",
                    "Lift up your voice and with us sing",
                    "Thou burning sun with golden beam",
                ],
                "verse2": [
                    "Thou rushing wind that art so strong",
                    "Ye clouds that sail in heaven along",
                    "And worship Him in humbleness",
                ],
                "bridge": ["Every mountain sing high", "And everything in between", "Sing the harmony"],
                "verse3": [
                    "Let all things their Creator bless",
                    "Praise the Father praise the Son",
                    "And praise the Spirit three in one",
                ],
            },
            "arrangement": ["verse1", "verse2", "bridge", "bridge", "verse3"],
        }

        self.assertFalse(app._looks_under_arranged_worship_parse(parsed, source))

    def test_labeled_chart_still_flags_missing_unique_lyrics(self):
        source = """VERSE 1
Alpha one
Bravo two
Charlie three
Delta four
Echo five
Foxtrot six
VERSE 2
Golf seven
Hotel eight
India nine
Juliet ten
Kilo eleven
Lima twelve
"""
        parsed = {
            "parts": {
                "verse1": ["Alpha one", "Bravo two", "Charlie three", "Delta four"],
                "verse2": ["Golf seven", "Hotel eight", "India nine", "Juliet ten"],
            },
            "arrangement": ["verse1", "verse2", "verse1", "verse2"],
        }

        self.assertTrue(app._looks_under_arranged_worship_parse(parsed, source))

    def test_explicit_repeat_directions_override_ai_arrangement_only(self):
        source = """VERSE 1
Opening lyric
BRIDGE
Bridge lyric
REPEAT BRIDGE 2x
LAST BRIDGE
Bridge lyric
VERSE 2
Closing lyric
"""
        ai_song = {
            "title": "Chart Song",
            "parts": {
                "verse1": ["Opening lyric"],
                "bridge": ["Bridge lyric"],
                "verse2": ["Closing lyric"],
            },
            "arrangement": ["verse1", "bridge", "verse2"],
        }

        repaired = app._apply_explicit_worship_repeats(ai_song, source)

        self.assertEqual(repaired["parts"], ai_song["parts"])
        self.assertEqual(
            repaired["arrangement"],
            ["verse1", "bridge", "bridge", "bridge", "bridge", "verse2"],
        )

    def test_bare_section_shorthand_noise_is_ignored_but_bracketed_is_valid(self):
        self.assertEqual(app._extract_worship_section_label("V"), ("", False))
        self.assertEqual(app._extract_worship_section_label("[V]"), ("v", False))
        self.assertEqual(app._extract_worship_section_label("V1"), ("v1", False))

    def test_chunk_lines_keeps_five_line_hymn_stanzas_together(self):
        slides = app.chunk_lines([
            "Line one",
            "Line two",
            "Line three",
            "Line four",
            "Line five",
        ])

        self.assertEqual(len(slides), 1)
        self.assertEqual(len(slides[0]["lines"]), 5)
        self.assertEqual(slides[0]["font_size"], 42)

    def test_chunk_lines_keeps_trinitarian_praise_conclusion_together(self):
        lines = [
            "Let all things their Creator bless",
            "And worship Him in humbleness",
            "O praise Him hallelujah",
            "Praise praise the Father",
            "Praise the Son",
            "And praise the Spirit",
            "Three in one",
            "O praise Him O praise Him",
            "Hallelujah hallelujah hallelujah",
        ]

        slides = app.chunk_lines(lines)

        self.assertEqual([len(slide["lines"]) for slide in slides], [3, 6])
        self.assertEqual(slides[1]["lines"][:3], lines[3:6])
        self.assertEqual(slides[1]["font_size"], 38)

    def test_fallback_parse_handles_inline_refrain_markers(self):
        pasted = """"Hymn With Refrain" lyrics
Example Artist Lyrics
"Hymn With Refrain"

Verse one first
Verse one second
Verse one third
Verse one fourth
Verse one fifth
[Refrain:]
Refrain first
Refrain second
Verse two first
Verse two second
Verse two third
Verse two fourth
Verse two fifth
[Refrain]
Verse three first
Verse three second
Verse three third
Verse three fourth
Verse three fifth
[Refrain]
Submit Lyrics
"""

        parsed = app._fallback_parse_worship_lyrics(pasted)

        self.assertIsNotNone(parsed)
        self.assertEqual(
            parsed["arrangement"],
            ["verse1", "chorus", "verse2", "chorus", "verse3", "chorus"],
        )
        self.assertEqual(parsed["parts"]["chorus"], ["Refrain first", "Refrain second"])
        self.assertNotIn("chorus2", parsed["parts"])

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

    def test_repeated_arrangement_does_not_mask_missing_source_lines(self):
        source = "\n".join([f"Unique line {i}" for i in range(1, 13)] + ["Chorus A", "Chorus B"])
        parsed = {
            "parts": {
                "verse1": ["Unique line 1", "Unique line 2"],
                "chorus": ["Chorus A", "Chorus B"],
            },
            "arrangement": ["verse1"] + ["chorus"] * 20,
        }

        self.assertTrue(app._looks_under_arranged_worship_parse(parsed, source))

    def test_complete_canonical_parts_pass_coverage_check(self):
        source_lines = [f"Source line {i}" for i in range(1, 13)]
        parsed = {
            "parts": {
                "verse1": source_lines[:4],
                "chorus": source_lines[4:8],
                "verse2": source_lines[8:],
            },
            "arrangement": ["verse1", "chorus", "verse2", "chorus"],
        }

        self.assertFalse(app._looks_under_arranged_worship_parse(parsed, "\n".join(source_lines)))

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

    def test_fallback_parse_continuous_text_recovers_repeated_chorus(self):
        lines = [
            "Opening verse one",
            "Opening verse two",
            "Opening verse three",
            "Opening verse four",
            "Second verse one",
            "Second verse two",
            "Second verse three",
            "Second verse four",
            "Chorus one",
            "Chorus two",
            "Chorus three",
            "Chorus four",
            "Chorus five",
            "Chorus six",
            "Chorus seven",
            "Chorus eight",
            "Third verse one",
            "Third verse two",
            "Third verse three",
            "Third verse four",
            "Chorus one",
            "Chorus two",
            "Chorus three",
            "Chorus four",
            "Chorus five",
            "Chorus six",
            "Chorus seven",
            "Chorus eight",
            "Bridge one",
            "Bridge two",
            "Bridge three",
            "Bridge four",
            "Bridge five",
            "Bridge six",
            "Bridge seven",
            "Bridge eight",
            "Bridge nine",
            "Bridge ten",
            "Bridge eleven",
            "Bridge twelve",
            "Chorus one",
            "Chorus two altered",
            "Chorus three",
            "Chorus four",
            "Chorus five",
            "Chorus six",
            "Chorus seven",
            "Chorus eight",
        ]

        parsed = app._fallback_parse_worship_lyrics("\n".join(lines), title="Continuous Song")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["arrangement"], ["verse1", "chorus", "verse2", "chorus", "bridge", "chorus"])
        self.assertEqual(len(parsed["parts"]["verse1"]), 8)
        self.assertEqual(len(parsed["parts"]["chorus"]), 8)
        self.assertEqual(len(parsed["parts"]["bridge"]), 12)

    def test_continuous_parser_does_not_start_chorus_on_tail_overlap(self):
        lines = [
            "Verse A1",
            "Verse A2",
            "Verse A3",
            "Verse A4",
            "Verse B1",
            "Verse B2",
            "Verse B3",
            "Verse B4",
            "Chorus start",
            "Chorus second",
            "Chorus third",
            "Chorus fourth",
            "Chorus fifth",
            "Chorus sixth",
            "Chorus seventh",
            "Chorus eighth",
            "Verse C1",
            "Verse C2",
            "Verse C3",
            "Verse C4",
            "Chorus start",
            "Chorus second",
            "Chorus third",
            "Chorus fourth",
            "Chorus fifth",
            "Chorus sixth",
            "Chorus seventh",
            "Chorus eighth",
            "Chorus fifth",
            "Chorus sixth",
            "Chorus seventh",
            "Bridge one",
            "Bridge two",
            "Bridge three",
            "Bridge four",
            "Bridge five",
            "Bridge six",
            "Bridge seven",
            "Bridge eight",
            "Bridge nine",
            "Bridge ten",
            "Chorus start",
            "Chorus second altered",
            "Chorus third",
            "Chorus fourth",
            "Chorus fifth",
            "Chorus sixth",
            "Chorus seventh",
            "Chorus eighth",
        ]

        parsed = app._fallback_parse_worship_lyrics("\n".join(lines), title="Tail Overlap")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["arrangement"], ["verse1", "chorus", "verse2", "chorus", "bridge", "chorus"])
        self.assertTrue(parsed["parts"]["bridge"][0].startswith("Chorus fifth"))

    def test_repairs_line_exploded_saved_song(self):
        lines = {
            "verse1": "All my words fall short",
            "verse2": "I got nothing new",
            "verse3": "How could I express",
            "verse4": "All my gratitude?",
            "verse5": "I could sing these songs",
            "verse6": "As I often do",
            "verse7": "But every song must end",
            "verse8": "And You never do",
            "chorus": "So I throw up my hands",
            "verse9": "And praise You again and again",
            "verse10": "Cause all that I have is a",
            "verse11": "Hallelujah, hallelujah",
            "verse12": "And I know it is not much",
            "verse13": "But I have nothing else fit for a king",
            "verse14": "Except for a heart singing",
            "verse15": "I have got one response",
            "verse16": "I have got just one move",
            "verse17": "With my arms stretched wide",
            "verse18": "I will worship You",
            "verse19": "So come on my soul",
            "verse20": "Lift up your song",
            "verse21": "Inside of those lungs",
            "verse22": "Get up and praise the Lord",
            "verse23": "Oh come on my soul",
            "verse24": "Come on my soul",
            "verse25": "Get up and praise the Lord hey",
            "verse26": "Praise the Lord praise the Lord",
            "verse27": "Praise the Lord hey",
            "verse28": "Praise You again and again",
        }
        exploded = {
            "title": "Gratitude",
            "artist": "Brandon Lake",
            "parts": {part: [line] for part, line in lines.items()},
            "arrangement": [
                "verse1", "verse2", "verse3", "verse4", "verse5", "verse6", "verse7", "verse8",
                "chorus", "verse9", "verse10", "verse11", "verse12", "verse13", "verse14", "verse11",
                "verse15", "verse16", "verse17", "verse18",
                "chorus", "verse9", "verse10", "verse11", "verse12", "verse13", "verse14", "verse11",
                "verse19", "verse20", "verse21", "verse22", "verse23", "verse20", "verse21", "verse22",
                "verse24", "verse20", "verse21", "verse25", "verse26", "verse27",
                "chorus", "verse28", "verse10", "verse11", "verse12", "verse13", "verse14", "verse11",
            ],
        }

        repaired = app._repair_line_exploded_worship_song(exploded)

        self.assertIsNotNone(repaired)
        self.assertLess(len(repaired["parts"]), len(exploded["parts"]))
        self.assertIn("chorus", repaired["parts"])
        self.assertIn("bridge", repaired["parts"])
        self.assertGreaterEqual(len(repaired["parts"]["chorus"]), 6)

    def test_continuous_abide_shape_preserves_long_verses_and_second_chorus(self):
        verse1 = [f"Opening verse {i}" for i in range(1, 9)]
        chorus = ["Main refrain 1", "Main refrain 2", "Main refrain 3", "Shared resolution"]
        verse2 = [f"Middle verse {i}" for i in range(1, 5)]
        verse3 = [f"Closing verse {i}" for i in range(1, 9)]
        chorus2 = ["Contrasting refrain 1", "Contrasting refrain 2", "Contrasting refrain 3", "Shared resolution"]
        tag = ["Tag invitation", "Tag resolution"]
        source = verse1 + chorus + verse2 + chorus + verse3 + chorus + chorus2 + tag

        parsed = app._fallback_parse_worship_lyrics("\n".join(source), title="Abide Shape")

        self.assertEqual(
            parsed["arrangement"],
            ["verse1", "chorus", "verse2", "chorus", "verse3", "chorus", "chorus2", "tag"],
        )
        self.assertEqual(parsed["parts"]["verse1"], verse1)
        self.assertEqual(parsed["parts"]["verse3"], verse3)
        self.assertEqual(parsed["parts"]["chorus2"], chorus2)
        self.assertEqual(parsed["parts"]["tag"], tag)

    def test_detects_repeats_not_present_in_unlabelled_source(self):
        source = "\n".join(["Opening lyric", "Second lyric", "Refrain lyric", "Refrain ending"])
        parsed = {
            "parts": {
                "verse1": ["Opening lyric", "Second lyric"],
                "chorus": ["Refrain lyric", "Refrain ending"],
            },
            "arrangement": ["verse1", "chorus", "chorus"],
        }

        self.assertTrue(app._looks_like_invented_worship_repeats(parsed, source))

    def test_second_source_validation_ignores_chords_and_verifies_structure(self):
        song = {
            "title": "Sample",
            "parts": {
                "verse1": ["For my waking breath", "I depend on You"],
                "chorus": ["You are the way", "Teach me to abide"],
            },
            "arrangement": ["verse1", "chorus"],
        }
        chord_sheet = """[Verse 1]
G       D/F#
For my waking breath
Em      C
I depend on You

[Chorus]
C G D Em
You are the way
Teach me to abide
"""

        report = app.validate_worship_song_against_source(
            song, chord_sheet, "https://example.com/chords"
        )

        self.assertEqual(report["status"], "verified")
        self.assertEqual(report["match_percent"], 100)
        self.assertEqual(report["reference_arrangement"], ["verse1", "chorus"])
        self.assertNotIn("D/F#", str(report))
        self.assertEqual(report["coverage"]["structure"], "verified")

    def test_second_source_validation_flags_part_and_arrangement_conflicts(self):
        song = {
            "title": "Sample",
            "parts": {
                "verse1": ["Opening lyric", "Second opening lyric"],
                "bridge": ["Saved contrasting lyric", "Saved ending"],
            },
            "arrangement": ["verse1", "bridge", "bridge"],
        }
        chord_sheet = """[Verse 1]
Opening lyric
Second opening lyric

[Chorus]
Saved refrain!
Saved ending.
"""

        report = app.validate_worship_song_against_source(song, chord_sheet)
        codes = {issue["code"] for issue in report["issues"]}

        self.assertEqual(report["status"], "needs_review")
        self.assertIn("missing_part", codes)
        self.assertIn("extra_part", codes)
        self.assertIn("arrangement_mismatch", codes)

    def test_song_normalization_preserves_validation_metadata(self):
        song = app.normalize_worship_song({
            "title": "Validated Song",
            "parts": {"verse1": ["Line one"]},
            "arrangement": ["verse1"],
            "sources": {"primary_url": " https://lyrics.example/song ", "unused": "drop"},
            "validation": {"status": "verified", "summary": "Looks good"},
        })

        self.assertEqual(song["sources"], {"primary_url": "https://lyrics.example/song"})
        self.assertEqual(song["validation"]["status"], "verified")

    def test_validation_supports_chordpro_and_unnumbered_first_sections(self):
        song = {
            "title": "ChordPro Song",
            "parts": {
                "verse1": ["Amazing grace", "That saved a soul"],
                "chorus": ["Sing it again", "Amazing grace"],
            },
            "arrangement": ["verse1", "chorus", "chorus"],
        }
        source = """Order: V C C
[Verse]
[G]Amazing [D]grace
That [Em]saved a [C]soul

[Chorus 1]
Sing it again
[G]Amazing grace
"""

        report = app.validate_worship_song_against_source(song, source)

        self.assertEqual(report["status"], "verified")
        self.assertEqual(report["reference_parts"], ["verse1", "chorus"])
        self.assertEqual(report["reference_arrangement"], ["verse1", "chorus", "chorus"])

    def test_structure_proposal_uses_primary_wording(self):
        song = {
            "title": "Regroup Me",
            "parts": {
                "verse1": ["Line one", "Line two"],
                "verse2": ["Line three", "Line four"],
                "chorus": ["Saved refrain", "Saved ending"],
            },
            "arrangement": ["verse1", "verse2", "chorus"],
        }
        source = """[Verse 1]
Line one
Line two
Line three
Line four

    [Chorus]
    Saved refrain!
    Saved ending.
"""

        report = app.validate_worship_song_against_source(song, source)
        proposal = report["structure_proposal"]

        self.assertTrue(proposal["safe"])
        self.assertEqual(proposal["parts"]["verse1"], ["Line one", "Line two", "Line three", "Line four"])
        self.assertEqual(proposal["parts"]["chorus"], ["Saved refrain", "Saved ending"])

    def test_partial_structure_proposal_preserves_every_primary_line(self):
        song = {
            "title": "Partial Match",
            "parts": {
                "verse1": ["First one", "First two"],
                "verse2": ["First three", "First four"],
                "chorus": ["Main refrain", "Main ending"],
                "tag": ["Primary-only tag"],
            },
            "arrangement": ["verse1", "verse2", "chorus", "tag"],
        }
        source = """[Verse 1]
First one
First two
First three
First four

[Chorus]
Main refrain
Main ending

[V]
First one
First two
First three
First four
"""

        report = app.validate_worship_song_against_source(song, source)
        proposal = report["structure_proposal"]
        original_lines = sorted(line for lines in song["parts"].values() for line in lines)
        proposed_lines = sorted(line for lines in proposal["parts"].values() for line in lines)

        self.assertTrue(proposal["applicable"])
        self.assertEqual(original_lines, proposed_lines)
        self.assertNotIn("v", report["reference_parts"])
        self.assertIn("tag", proposal["parts"])

    def test_structure_proposal_uses_arrangement_order_and_whole_parts(self):
        song = {
            "title": "Ordered Units",
            "parts": {
                "verse2": ["Later one", "Later two"],
                "verse1": ["Opening one", "Opening two"],
                "bridge": ["Bridge one", "Bridge two", "Bridge three", "Shared ending"],
            },
            "arrangement": ["verse1", "verse2", "bridge"],
        }
        source = """[Verse 1]
Opening one
Opening two
Later one
Later two

[Chorus 2]
Shared ending
"""

        proposal = app.validate_worship_song_against_source(song, source)["structure_proposal"]

        self.assertEqual(
            proposal["parts"]["verse1"],
            ["Opening one", "Opening two", "Later one", "Later two"],
        )
        self.assertEqual(proposal["parts"]["bridge"], song["parts"]["bridge"])
        self.assertNotIn("chorus2", proposal["parts"])

    def test_stale_validation_discards_obsolete_findings(self):
        stale = app._stale_worship_validation({
            "checked_at": "2026-08-02T00:00:00+00:00",
            "source_url": "https://example.com/chords",
            "issues": [{"message": "Old mismatch"}],
            "part_comparisons": [{"part": "verse1"}],
            "structure_proposal": {"safe": True},
        }, "Validate again")

        self.assertEqual(stale["status"], "stale")
        self.assertNotIn("issues", stale)
        self.assertNotIn("part_comparisons", stale)
        self.assertNotIn("structure_proposal", stale)

    def test_abridged_hymn_aligns_verses_by_content_and_extracts_chorus(self):
        chorus = ["O praise Him", "Alleluia forever"]
        song = {
            "title": "Seven Verse Hymn",
            "parts": {
                "verse1": ["Creatures sing", "Lift your voice"],
                "chorus": chorus,
                "verse2": ["Rushing wind", "Clouds above"],
                "verse3": ["Flowing water", "Fire so bright"],
                "verse4": ["Mother earth", "Flowers grow"],
                "verse5": ["Tender hearts", "Cast your care"],
                "verse6": ["Gentle death", "Child of God"],
                "verse7": ["Creator bless", "Three in one"],
            },
            "arrangement": [
                "verse1", "chorus", "verse2", "chorus", "verse3", "chorus",
                "verse4", "chorus", "verse5", "chorus", "verse6", "chorus", "verse7", "chorus",
            ],
        }
        source = """[Verse 1]
Creatures sing
Lift your voice
O praise Him
Alleluia forever

[Verse 2]
Rushing wind
Clouds above
O praise Him
Alleluia forever

[Verse 3]
Flowing water
Fire so bright
O praise Him
Alleluia forever

[Verse 4]
Tender hearts
Cast your care
O praise Him
Alleluia forever

[Verse 5]
Creator bless
Three in one
O praise Him
Alleluia forever
"""

        report = app.validate_worship_song_against_source(song, source)
        proposal = report["version_proposal"]

        self.assertEqual(report["verse_alignment"]["verse4"]["saved_part"], "verse5")
        self.assertEqual(report["verse_alignment"]["verse5"]["saved_part"], "verse7")
        self.assertEqual(
            proposal["selected_saved_parts"],
            ["verse1", "verse2", "verse3", "verse5", "verse7"],
        )
        self.assertEqual(proposal["omitted_saved_parts"], ["verse4", "verse6"])
        self.assertEqual(
            proposal["arrangement"],
            ["verse1", "chorus", "verse2", "chorus", "verse3", "chorus", "verse4", "chorus", "verse5", "chorus"],
        )
        self.assertFalse(report["structure_proposal"]["applicable"])
        self.assertEqual(report["coverage"]["structure"], "alternate_version")


if __name__ == "__main__":
    unittest.main()
