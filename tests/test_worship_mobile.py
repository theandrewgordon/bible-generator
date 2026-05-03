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

        original_resolve = app._resolve_selected_worship_items
        try:
            app._resolve_selected_worship_items = lambda *_args, **_kwargs: selected
            with app.app.test_request_context("/worship/mobile?song_order=holy-forever", method="GET"):
                g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                html = app.worship_mobile()
        finally:
            app._resolve_selected_worship_items = original_resolve

        self.assertIn("Worship mobile view", html)
        self.assertIn("Holy Forever", html)
        self.assertIn("Copy link", html)
        self.assertIn("song order: holy-forever", html)


if __name__ == "__main__":
    unittest.main()
