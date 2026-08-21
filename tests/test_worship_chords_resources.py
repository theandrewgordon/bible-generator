import unittest
from unittest import mock

from pypdf import PdfReader

import app
from faithsparks.services.chords import (
    chart_has_chords,
    clean_pasted_chord_chart,
    key_distance,
    normalize_key,
    parse_chord_chart,
    transpose_chart,
    transpose_chord,
)


class WorshipChordTests(unittest.TestCase):
    def test_transposes_chordpro_and_slash_chords(self):
        chart = "{key: G}\n[G]Amazing [C]grace\nG  C  D/F#  Em7"
        transposed = transpose_chart(chart, "G", "A")
        self.assertIn("{key: A}", transposed)
        self.assertIn("[A]Amazing [D]grace", transposed)
        self.assertIn("A  D  E/G#  F#m7", transposed)

    def test_transposes_bar_separated_progressions(self):
        chart = "Intro\n| G / / / | C / D/F# / |"
        transposed = transpose_chart(chart, "G", "A")
        self.assertEqual(transposed, "Intro\n| A / / / | D / E/G# / |")

    def test_flat_target_uses_readable_flat_spelling(self):
        self.assertEqual(transpose_chart("[E]Word [B/D#]word", "E", "Eb"), "[Eb]Word [Bb/D]word")
        self.assertEqual(transpose_chord("F#m7", 1, prefer_flats=True), "Gm7")

    def test_key_validation_preserves_major_minor_mode(self):
        self.assertEqual(normalize_key(" bb "), "Bb")
        self.assertEqual(normalize_key("f#m"), "F#m")
        self.assertEqual(key_distance("C", "D"), 2)
        with self.assertRaises(ValueError):
            key_distance("C", "Dm")

    def test_lyrics_are_not_mistaken_for_plain_chord_rows(self):
        chart = "G  C  D\nGrace is enough for me"
        transposed = transpose_chart(chart, "G", "A")
        self.assertEqual(transposed.splitlines(), ["A  D  E", "Grace is enough for me"])
        self.assertTrue(chart_has_chords(chart))

    def test_chordpro_chart_is_grouped_and_chords_stay_with_lyrics(self):
        chart = """{title: Sample}
Intro
[| C#m / B/D# / | A2/E / / / |]

[Verse 1]
[E]As the [B/D#]deer panteth [C#m]for the [B]water
So my [A]soul longeth [B]after [E]Thee
"""
        sections = parse_chord_chart(chart)

        self.assertEqual([section["title"] for section in sections], ["Intro", "Verse 1"])
        self.assertEqual(sections[0]["lines"][0], {
            "kind": "progression", "text": "| C#m / B/D# / | A2/E / / / |"
        })
        segments = sections[1]["lines"][0]["segments"]
        self.assertEqual([segment["chord"] for segment in segments], ["E", "B/D#", "C#m", "B"])
        self.assertEqual([segment["lyric"] for segment in segments], ["As the ", "deer panteth ", "for the ", "water"])

    def test_parser_preserves_leading_lyrics_and_escapes_in_template(self):
        sections = parse_chord_chart("Verse 1\nBefore [G]after <script>")
        segments = sections[0]["lines"][0]["segments"]
        self.assertEqual(segments[0], {"chord": "", "lyric": "Before "})
        self.assertEqual(segments[1], {"chord": "G", "lyric": "after <script>"})

    def test_cleans_copied_song_page_and_aligns_plain_chord_rows(self):
        pasted = """Search song title, artist, or writer
Home
Abide
Aaron Williams, CAIN
CCLI: 7168160
Key: B
BPM: 150
Time Sig: 6/8
Writers: Aaron Keyes, Aaron Williams, Jake Fauber
Scripture: John 15:5, Matthew 6:11
Lyrics
Chords

B (Original)
Intro

B   F#   C#m7   G#m   E   B/F#   F#

Verse 1

       B                    F#
For my waking breath for my daily bread
G#m              E
I depend on You, I depend on You

Repeat Chorus:

Verse 2
B
   You're The Way, The Truth, and The Life
Videos
Abide lyric video
Links
Other versions of this song
"""
        cleaned = clean_pasted_chord_chart(pasted)

        self.assertTrue(cleaned["changed"])
        self.assertEqual(cleaned["metadata"]["key"], "B")
        self.assertEqual(cleaned["metadata"]["ccli_song_number"], "7168160")
        self.assertEqual(cleaned["metadata"]["bpm"], "150")
        self.assertNotIn("Search song", cleaned["chart"])
        self.assertNotIn("Videos", cleaned["chart"])
        self.assertIn("[B]waking breath for my [F#]daily bread", cleaned["chart"])
        self.assertIn("[G#m]I depend on You, [E]I depend on You", cleaned["chart"])
        self.assertIn("{comment: Repeat Chorus}", cleaned["chart"])

        sections = parse_chord_chart(cleaned["chart"])
        self.assertEqual([section["title"] for section in sections], ["Intro", "Verse 1", "Repeat Chorus", "Verse 2"])

    def test_cleaner_leaves_hand_authored_chordpro_unchanged(self):
        chart = "Verse 1\n[G]Amazing [C]grace"
        cleaned = clean_pasted_chord_chart(chart)
        self.assertFalse(cleaned["changed"])
        self.assertEqual(cleaned["chart"], chart)

    def test_cleaner_does_not_treat_listen_as_a_footer(self):
        pasted = "Chords\nB (Original)\nVerse 1\nB\nListen\nVideos\nVideo title"
        cleaned = clean_pasted_chord_chart(pasted)
        self.assertIn("[B]Listen", cleaned["chart"])
        self.assertNotIn("Videos", cleaned["chart"])

    def test_chordpro_comments_remain_notes_unless_they_name_a_section(self):
        sections = parse_chord_chart("{comment: Capo 2}\n{comment: Verse 1}\n[G]Grace")
        self.assertEqual(sections[0]["lines"][0], {"kind": "note", "text": "Capo 2"})
        self.assertEqual(sections[1]["title"], "Verse 1")

    def test_repeat_sections_are_marked_for_page_break_handling(self):
        sections = parse_chord_chart("Verse 1\n[G]Line\n{comment: Repeat Chorus}\nVerse 2\n[G]Next")
        self.assertEqual([section["title"] for section in sections], ["Verse 1", "Repeat Chorus", "Verse 2"])
        self.assertTrue(sections[1]["repeat"])

    def test_compact_chord_pdf_has_no_browser_headers_and_fits_one_page(self):
        from faithsparks.services.chord_chart_pdf import build_chord_chart_pdf

        chart = """Intro
G  D  Em  C
Verse 1
[G]Opening line with [D]another phrase
[Em]Second line with [C]another phrase
Chorus
[G]This is the first line of the chorus
[D]This is the second line of the chorus
[Em]This is the third line of the [C]chorus
{comment: Repeat Chorus}
Verse 2
[G]Another verse line with [D]another phrase
[Em]The final verse line with [C]another phrase
Chorus
[G]This is the first line of the chorus
[D]This is the second line of the chorus
[Em]This is the third line of the [C]chorus
Tag
[C]Final tag [D]line [G]here
"""
        pdf = build_chord_chart_pdf(
            song={"title": "Sample Song"},
            resource={"title": "Key of G from Publisher"},
            sections=parse_chord_chart(chart),
            target_key="G",
            metadata={"ccli_song_number": "123456", "bpm": "72", "time_signature": "4/4"},
        )
        reader = PdfReader(pdf)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

        self.assertEqual(len(reader.pages), 1)
        self.assertNotIn("http", text.lower())
        self.assertNotIn("Key of G from Publisher - Key G", text)
        self.assertIn("REPEAT CHORUS", text)

    def test_pdf_wraps_a_single_oversized_lyric_segment(self):
        from faithsparks.services.chord_chart_pdf import _song_rows

        rows = _song_rows([{
            "chord": "G",
            "lyric": "This unusually long phrase must wrap safely inside a narrow chart column",
        }], 130)

        self.assertGreater(len(rows), 1)
        self.assertEqual(rows[0][0]["chord"], "G")
        self.assertTrue(all(not row[0]["chord"] for row in rows[1:]))
        self.assertTrue(all(sum(segment["width"] for segment in row) <= 130 for row in rows))

    def test_transposed_chart_subtitle_states_source_and_target_keys_cleanly(self):
        subtitle = app._worship_chord_chart_subtitle(
            "Key of B from Integrity Worship", "B", "E"
        )
        from faithsparks.services.chord_chart_pdf import build_chord_chart_pdf

        self.assertEqual(subtitle, "Integrity Worship chart · Transposed B to E")

        pdf = build_chord_chart_pdf(
            song={"title": "Abide"},
            resource={"title": "Key of B from Integrity Worship"},
            sections=parse_chord_chart("Verse 1\n[E]I depend on You"),
            target_key="E",
            metadata={},
            subtitle=subtitle,
        )
        text = "\n".join(page.extract_text() or "" for page in PdfReader(pdf).pages)

        self.assertIn("Transposed B", text)
        self.assertIn("E", text)
        self.assertNotIn("Key of B from Integrity Worship", text)

    def test_pdf_wraps_long_titles_and_subtitles(self):
        from faithsparks.services.chord_chart_pdf import build_chord_chart_pdf

        title = "A Very Long Worship Song Title That Needs to Wrap Without Leaving the Printable Page"
        resource_title = "Authorized publisher arrangement for the Sunday morning worship team and musicians"
        pdf = build_chord_chart_pdf(
            song={"title": title},
            resource={"title": resource_title},
            sections=parse_chord_chart("Verse 1\n[G]Grace for every season"),
            target_key="G",
            metadata={},
        )
        reader = PdfReader(pdf)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

        self.assertEqual(len(reader.pages), 1)
        self.assertIn("A Very Long Worship Song Title", text)
        self.assertIn("Authorized publisher arrangement", text)

    def test_pdf_fragments_an_unusually_long_section(self):
        from faithsparks.services.chord_chart_pdf import build_chord_chart_pdf

        chart = "Verse 1\n" + "\n".join(
            f"[G]Rehearsal line {number}" for number in range(50)
        )
        pdf = build_chord_chart_pdf(
            song={"title": "Long Rehearsal Chart"},
            resource={"title": "Authorized chart"},
            sections=parse_chord_chart(chart),
            target_key="G",
            metadata={},
        )
        reader = PdfReader(pdf)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

        self.assertEqual(len(reader.pages), 1)
        self.assertIn("VERSE 1 (CONTINUED)", text)
        self.assertIn("Rehearsal line 49", text)

    def test_auto_cleanup_form_values_allow_an_explicit_opt_out(self):
        from werkzeug.datastructures import MultiDict

        checked = MultiDict([("auto_clean_chart", "1"), ("auto_clean_chart", "0")])
        unchecked = MultiDict([("auto_clean_chart", "0")])

        self.assertTrue(app._boolish(checked.get("auto_clean_chart"), True))
        self.assertFalse(app._boolish(unchecked.get("auto_clean_chart"), True))


class WorshipResourceAndVideoTests(unittest.TestCase):
    def test_licensing_report_counts_saved_lyric_source_links(self):
        song = {
            "id": "abide",
            "title": "Abide",
            "type": "song",
            "sources": {"primary_url": "https://integrityworship.com/songs/abide/"},
            "parts": {"verse1": ["I depend on You"]},
            "arrangement": ["verse1"],
        }
        with mock.patch.object(app, "list_worship_songs", return_value=[song]):
            row = app._worship_licensing_rows()[0]

        self.assertIn("integrityworship.com", row["sources"])
        self.assertNotIn("source/resource", row["missing"])

    def test_resource_storage_path_is_bound_to_current_scope_and_song(self):
        resource = {
            "id": "chart-1",
            "storage_path": "worship-resources/grace/sample/chart-1/chart.pdf",
        }
        with app.app.test_request_context("/worship"):
            app.session["worship_church_id"] = "grace"
            self.assertTrue(app._valid_worship_resource_storage_path("sample", resource))
            self.assertFalse(app._valid_worship_resource_storage_path("another-song", resource))
            self.assertFalse(app._valid_worship_resource_storage_path(
                "sample", {**resource, "storage_path": "worship-presentations/grace/secret.pdf"}
            ))

    def test_normalization_sanitizes_resources_and_video(self):
        normalized = app.normalize_worship_song({
            "id": "sample",
            "title": "Sample",
            "type": "video",
            "video_url": "https://youtu.be/dQw4w9WgXcQ?t=4",
            "video_start": "12",
            "video_end": "8",
            "ccli_song_number": "CCLI 123-456",
            "resources": [{
                "id": "chart one",
                "kind": "chordpro",
                "source_type": "songselect",
                "source_url": "https://songselect.ccli.com/example",
                "key": "g",
                "chart_text": "[G]Grace",
            }],
        })
        self.assertEqual(normalized["video_id"], "dQw4w9WgXcQ")
        self.assertEqual(normalized["video_end"], 0)
        self.assertEqual(normalized["ccli_song_number"], "123456")
        self.assertEqual(normalized["resources"][0]["id"], "chart-one")
        self.assertTrue(normalized["resources"][0]["has_chords"])

    def test_youtube_parser_rejects_lookalike_and_http_hosts(self):
        self.assertEqual(app._youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(app._youtube_video_id("https://youtube.example/watch?v=dQw4w9WgXcQ"), "")
        self.assertEqual(app._youtube_video_id("http://youtu.be/dQw4w9WgXcQ"), "")

    def test_video_builds_one_live_slide(self):
        with app.app.test_request_context("/worship"):
            slides = app._build_worship_mobile_slides([{
                "id": "video-1", "title": "Testimony", "type": "video",
                "video_id": "dQw4w9WgXcQ", "video_start": 10, "video_end": 30,
            }])
        self.assertEqual(len(slides), 1)
        self.assertEqual(slides[0]["kind"], "video")
        self.assertEqual(slides[0]["video_start"], 10)


if __name__ == "__main__":
    unittest.main()
