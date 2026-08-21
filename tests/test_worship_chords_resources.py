import unittest

import app
from faithsparks.services.chords import (
    chart_has_chords,
    key_distance,
    normalize_key,
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


class WorshipResourceAndVideoTests(unittest.TestCase):
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
