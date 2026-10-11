"""House-church features: follow-along phones, simple mode, song section map."""

import time
import unittest
from pathlib import Path

from flask import g

import app


class _LiveBase(unittest.TestCase):
    def setUp(self):
        self.original_db = app.db
        self.original_env = app.APP_ENV
        app.db = None
        app.APP_ENV = "dev"
        app._worship_live_memory.clear()
        app._worship_live_state_cache.clear()
        selected = [{
            "id": "sample",
            "title": "Sample Song",
            "parts": {"verse1": ["First lyric"], "chorus": ["Chorus lyric"]},
            "arrangement": ["verse1", "chorus"],
        }]
        slides = app._build_worship_mobile_slides(selected, {"sample": "Leader-only note: capo 2"})
        self.data = {
            "id": "live-session-abcdefghijkl",
            "scope": "grace",
            "name": "Sunday Worship",
            "song_ids": ["sample"],
            "notes": {"sample": "Leader-only note: capo 2"},
            "slides": slides,
            "slide_count": len(slides),
            "current_index": 0,
            "blank": False,
            "revision": 0,
            "expires_epoch": time.time() + 3600,
        }
        app._create_worship_live_session(self.data)
        self.client = app.app.test_client()

    def tearDown(self):
        app._worship_live_memory.clear()
        app._worship_live_state_cache.clear()
        app.db = self.original_db
        app.APP_ENV = self.original_env

    def token(self, role):
        return app._make_worship_live_token(scope="grace", session_id=self.data["id"], role=role)

    def exchange(self, **tokens):
        return self.client.post(
            f"/worship/live/exchange/{self.data['id']}", json=tokens, headers={"X-Worship-Live": "1"}
        )


class FollowAlongTests(_LiveBase):
    def test_follow_link_opens_lyrics_without_leader_notes(self):
        self.assertEqual(self.exchange(follow=self.token("follow")).status_code, 200)
        page = self.client.get(f"/worship/live/follow/{self.data['id']}")
        html = page.get_data(as_text=True)
        self.assertEqual(page.status_code, 200)
        self.assertIn("Chorus lyric", html)
        self.assertNotIn("capo 2", html)
        self.assertEqual(page.headers["Cache-Control"], "private, no-store")

    def test_follow_without_cookie_shows_secure_bootstrap(self):
        page = self.client.get(f"/worship/live/follow/{self.data['id']}")
        self.assertIn("payload.follow", page.get_data(as_text=True))

    def test_follow_phone_tracks_leader_but_sees_no_stage_messages(self):
        self.exchange(follow=self.token("follow"))
        app._update_worship_live_session("grace", self.data["id"], "set_message", message="Pastor running long")
        app._update_worship_live_session("grace", self.data["id"], "next")
        state = self.client.get(f"/worship/live/state/{self.data['id']}").get_json()
        self.assertTrue(state["ok"])
        self.assertEqual(state["current_index"], 1)
        self.assertNotIn("stage_message", state)

    def test_follow_token_cannot_control_or_present(self):
        self.exchange(follow=self.token("follow"))
        control = self.client.post(
            f"/worship/live/control/{self.data['id']}", json={"action": "next"}, headers={"X-Worship-Live": "1"}
        )
        self.assertEqual(control.status_code, 410)
        presenter = self.client.get(f"/worship/live/present/{self.data['id']}")
        self.assertNotIn("wl-stage", presenter.get_data(as_text=True))
        qr = self.client.get(f"/worship/live/follow-qr/{self.data['id']}.png")
        self.assertEqual(qr.status_code, 410)

    def test_presenter_screen_shows_follow_code_and_view_only_gets_no_stage_link(self):
        self.exchange(view=self.token("view"))
        html = self.client.get(f"/worship/live/present/{self.data['id']}").get_data(as_text=True)
        self.assertIn("follow along on your phone", html)
        self.assertNotIn("#stage=", html)
        qr = self.client.get(f"/worship/live/follow-qr/{self.data['id']}.png")
        self.assertEqual(qr.status_code, 200)
        self.assertEqual(qr.mimetype, "image/png")

    def test_remote_offers_follow_link(self):
        self.exchange(control=self.token("control"))
        html = self.client.get(f"/worship/live/remote/{self.data['id']}").get_data(as_text=True)
        self.assertIn("Follow along on phones", html)
        self.assertIn("#follow=", html)

    def test_follow_state_reads_are_cached_briefly(self):
        calls = []
        original = app._worship_live_memory.get

        class Spy(dict):
            def get(inner_self, key, default=None):
                calls.append(key)
                return original(key, default)

        spy = Spy(app._worship_live_memory)
        app._worship_live_memory = spy
        try:
            for _ in range(5):
                app._get_worship_live_session(
                    "grace", self.data["id"], include_slides=False, cache_seconds=1.0
                )
        finally:
            app._worship_live_memory = dict(spy)
        self.assertEqual(len(calls), 1)

    def test_ending_session_clears_follow_cache(self):
        app._get_worship_live_session("grace", self.data["id"], include_slides=False)
        app._delete_worship_live_session("grace", self.data["id"])
        self.assertIsNone(
            app._get_worship_live_session("grace", self.data["id"], include_slides=False, cache_seconds=60)
        )


class SimpleModeTests(unittest.TestCase):
    def _start(self, simple):
        selected = [{"id": "s", "title": "Unchecked", "parts": {"v": ["Line"]}, "arrangement": ["v"]}]
        original = app._resolve_selected_worship_items
        app._resolve_selected_worship_items = lambda *_a, **_k: selected
        try:
            with app.app.test_request_context("/worship/live/start", method="POST", data={"song_order": "s"}):
                g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "leader@example.com"
                app.session["worship_simple_mode"] = simple
                return app.worship_live_start()
        finally:
            app._resolve_selected_worship_items = original
            app._worship_live_memory.clear()

    def test_simple_mode_goes_live_without_preflight_stop(self):
        response = self._start(True)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        self.assertIn("#follow=", response.get_json()["follow_url"])

    def test_full_controls_keep_preflight_check(self):
        response, status = self._start(False)
        self.assertEqual(status, 409)

    def test_simple_mode_is_default(self):
        with app.app.test_request_context("/worship"):
            self.assertTrue(app._worship_simple_mode())

    def test_worship_page_simple_and_full_layouts(self):
        template = Path("templates/worship.html").read_text(encoding="utf-8")
        self.assertIn('id="download-btn"', template)
        self.assertIn("formaction=\"{{ url_for('worship_build') }}\"", template)
        self.assertIn("Show review &amp; validation checks", template)
        self.assertIn("{% if worship_simple_mode or song.type == 'presentation'", template)


if __name__ == "__main__":
    unittest.main()
