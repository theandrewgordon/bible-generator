import unittest

from flask import g
from itsdangerous import BadData

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

    def test_mobile_slides_collapse_only_exact_adjacent_duplicate_cues(self):
        slides = app._build_worship_mobile_slides([
            {
                "id": "sample",
                "title": "Sample",
                "parts": {"chorus": ["Same words"], "verse1": ["Different words"]},
                "arrangement": ["chorus", "chorus", "verse1", "chorus"],
            }
        ])

        lyric_labels = [slide["part_label"] for slide in slides if slide["kind"] == "lyric"]
        self.assertEqual(lyric_labels, ["Chorus", "Verse 1", "Chorus"])

    def test_mobile_capability_is_signed_and_scope_bound(self):
        with app.app.test_request_context("/worship"):
            token = app._make_worship_mobile_token(scope="Grace Church", song_ids=["holy-forever"])
            payload = app._load_worship_mobile_token(token)

        self.assertEqual(payload["scope"], "grace-church")
        self.assertEqual(payload["song_ids"], ["holy-forever"])
        with self.assertRaises(BadData):
            app._load_worship_mobile_token(token + "tampered")

    def test_signed_mobile_link_renders_without_login(self):
        selected = [{
            "id": "holy-forever",
            "title": "Holy Forever",
            "parts": {"verse1": ["A thousand generations"]},
            "arrangement": ["verse1"],
        }]
        original_resolve = app._resolve_worship_ids_for_scope
        try:
            app._resolve_worship_ids_for_scope = lambda ids, scope: selected if ids == ["holy-forever"] and scope == "grace" else []
            with app.app.test_request_context("/worship/mobile"):
                token = app._make_worship_mobile_token(scope="grace", song_ids=["holy-forever"])
            with app.app.test_request_context("/worship/mobile?token=" + token):
                response = app.worship_mobile()
        finally:
            app._resolve_worship_ids_for_scope = original_resolve

        self.assertEqual(response.status_code, 200)
        self.assertIn("Holy Forever", response.get_data(as_text=True))
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")

    def test_service_item_creates_one_mobile_slide_without_song_divider(self):
        with app.app.test_request_context("/worship/mobile"):
            slides = app._build_worship_mobile_slides([
                {
                    "id": "missionary-update-photo",
                    "title": "The Smith Family",
                    "type": "photo",
                    "service_lines": ["Serving in Guatemala", "Pray for their new school"],
                    "image_path": "worship-media/church/photo.jpg",
                    "image_layout": "split",
                }
            ])

        self.assertEqual(len(slides), 1)
        self.assertEqual(slides[0]["kind"], "service")
        self.assertEqual(slides[0]["image_layout"], "split")
        self.assertIn("/worship/media/missionary-update-photo", slides[0]["image_url"])

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
