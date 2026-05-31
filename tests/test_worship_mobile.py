import unittest

from flask import g

import app


class WorshipMobileViewTests(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True

    def test_mobile_view_renders_shareable_swipe_page(self):
        selected = [
            {
                "id": "holy-forever",
                "title": "Holy Forever",
                "artist": "Bethel",
                "key": "C",
                "type": "song",
                "background": None,
                "parts": {"verse1": ["A thousand generations"]},
                "arrangement": ["verse1"],
            }
        ]

        original_seed = app._seed_worship_from_files
        original_get = app.get_worship_song
        original_list = app.list_worship_songs
        try:
            app._seed_worship_from_files = lambda: None
            app.get_worship_song = lambda *_args, **_kwargs: None
            app.list_worship_songs = lambda: selected
            with app.app.test_request_context("/worship/mobile?song_order=holy-forever", method="GET"):
                g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                html = app.worship_mobile()
        finally:
            app._seed_worship_from_files = original_seed
            app.get_worship_song = original_get
            app.list_worship_songs = original_list

        self.assertIn("Worship mobile view", html)
        self.assertIn("Holy Forever", html)
        self.assertIn("Copy link", html)
        self.assertIn("song order: holy-forever", html)

    def test_mobile_slides_use_human_part_labels(self):
        slides = app._build_worship_mobile_slides(
            [
                {
                    "id": "sample",
                    "title": "Sample",
                    "parts": {"pre_chorus": ["Before the chorus"], "chorus2": ["Second chorus"]},
                    "arrangement": ["pre_chorus", "chorus2"],
                }
            ]
        )

        labels = [slide.get("part_label") for slide in slides if slide.get("kind") == "lyric"]
        self.assertEqual(labels, ["Pre Chorus", "Chorus 2"])

    def test_resolve_selected_items_uses_cached_list_before_direct_reads(self):
        cached_song = {
            "id": "holy-forever",
            "title": "Holy Forever",
            "parts": {"verse1": ["A thousand generations"]},
            "arrangement": ["verse1"],
        }
        get_calls = []
        original_get = app.get_worship_song
        original_list = app.list_worship_songs
        try:
            app.list_worship_songs = lambda: [cached_song]
            app.get_worship_song = lambda song_id: get_calls.append(song_id) or None
            selected = app._resolve_selected_worship_items("holy-forever", [])
        finally:
            app.get_worship_song = original_get
            app.list_worship_songs = original_list

        self.assertEqual(selected, [cached_song])
        self.assertEqual(get_calls, [])

    def test_resolve_selected_items_does_not_guess_ambiguous_duplicate_title(self):
        songs = [
            {
                "id": "same-song-artist-a",
                "title": "Same Song",
                "artist": "Artist A",
                "parts": {"verse1": ["A"]},
                "arrangement": ["verse1"],
            },
            {
                "id": "same-song-artist-b",
                "title": "Same Song",
                "artist": "Artist B",
                "parts": {"verse1": ["B"]},
                "arrangement": ["verse1"],
            },
        ]
        get_calls = []
        original_get = app.get_worship_song
        original_list = app.list_worship_songs
        try:
            app.list_worship_songs = lambda: songs
            app.get_worship_song = lambda song_id: get_calls.append(song_id) or None
            selected = app._resolve_selected_worship_items("same-song", [])
        finally:
            app.get_worship_song = original_get
            app.list_worship_songs = original_list

        self.assertEqual(selected, [])
        self.assertEqual(get_calls, ["same-song"])


if __name__ == "__main__":
    unittest.main()
