import time
import re
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

import app


class WorshipLiveSetupTests(unittest.TestCase):
    def setUp(self):
        self.old_db, self.old_env = app.db, app.APP_ENV
        app.db, app.APP_ENV = None, "dev"
        self.sid = "live-setup-abcdefghijklmnop"
        self.live = {
            "id": self.sid, "scope": "grace", "name": "Sunday",
            "slide_count": 2, "current_index": 0, "revision": 2, "deck_revision": 0,
            "blank": False, "expires_epoch": time.time() + 3600,
            "slides": [{"kind": "lyric", "id": "sample", "title": "Sample", "lines": ["One"]},
                       {"kind": "lyric", "id": "sample", "title": "Sample", "lines": ["Two"]}],
        }
        app._create_worship_live_session(self.live)
        self.client = app.app.test_client()
        self.headers = {"X-Worship-Live": "1", "User-Agent": "Mozilla/5.0"}

    def tearDown(self):
        app._worship_live_memory.clear()
        app._worship_live_state_cache.clear()
        app.db, app.APP_ENV = self.old_db, self.old_env

    def pair(self, *roles):
        response = self.client.post(f"/worship/live/exchange/{self.sid}", json={
            role: app._make_worship_live_token(scope="grace", session_id=self.sid, role=role)
            for role in roles
        }, headers=self.headers)
        self.assertEqual(response.status_code, 200)

    def report(self, **changes):
        payload = dict(current_index=0, revision=2, deck_revision=0, blank=False, clear_words=False, started=True)
        payload.update(changes)
        return self.client.post(f"/worship/live/display/{self.sid}", json=payload, headers=self.headers)

    def test_setup_requires_controller_and_audience_link_contains_only_view_capability(self):
        self.pair("view")
        unauthorized = self.client.get(f"/worship/live/setup/{self.sid}").get_data(as_text=True)
        self.assertNotIn("Open audience window", unauthorized)
        self.pair("control")
        with patch.object(app, "render_template", wraps=app.render_template) as render:
            response = self.client.get(f"/worship/live/setup/{self.sid}")
        self.assertEqual(response.status_code, 200)
        links = render.call_args.kwargs["links"]
        view = urlparse(links["view"])
        self.assertEqual(parse_qs(view.query), {"audience": ["1"]})
        self.assertEqual(set(parse_qs(view.fragment)), {"view"})
        self.assertEqual(set(parse_qs(urlparse(links["control"]).fragment)), {"control"})
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_setup_offers_one_device_link_in_same_tab_with_both_roles(self):
        self.pair("control")
        with patch.object(app, "render_template", wraps=app.render_template) as render:
            response = self.client.get(f"/worship/live/setup/{self.sid}")
        link = urlparse(render.call_args.kwargs["links"]["solo"])
        self.assertEqual(parse_qs(link.query), {"mode": ["solo"]})
        tokens = parse_qs(link.fragment)
        self.assertEqual(set(tokens), {"view", "control"})
        for role in tokens:
            capability = app._load_worship_live_token(tokens[role][0], required_role=role)
            self.assertEqual(capability["session_id"], self.sid)
        html = response.get_data(as_text=True)
        self.assertIn("Present from this phone", html)
        self.assertIn("Laptop + remote setup", html)
        self.assertIn("Open audience window", html)

    def test_one_device_mode_requires_control_and_does_not_expose_leader_codes(self):
        self.pair("view")
        self.assertEqual(self.client.get(f"/worship/live/present/{self.sid}?mode=solo").status_code, 403)
        self.pair("control")
        response = self.client.get(f"/worship/live/present/{self.sid}?mode=solo")
        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("worship-solo.js", html)
        self.assertIn("solo-gestures", html)
        visible = re.sub(r"<script\b.*?</script>", "", html, flags=re.S)
        self.assertNotIn('id="wl-leader-codes"', visible)
        self.assertNotIn('id="wl-remote-btn"', visible)
        self.assertIn("These controls are visible on the TV too", visible)
        self.assertIn("var canControl=true", html)

    def test_audience_mode_remains_view_only_even_with_solo_query(self):
        self.pair("view", "control")
        html = self.client.get(f"/worship/live/present/{self.sid}?audience=1&mode=solo").get_data(as_text=True)
        self.assertIn("var canControl=false", html)
        self.assertNotIn("worship-solo.js", html)
        self.assertNotIn('id="solo-menu"', html)
        self.assertIn("Ready to present", html)

    def test_existing_presenter_keeps_keyboard_and_leader_setup(self):
        self.pair("view", "control")
        html = self.client.get(f"/worship/live/present/{self.sid}").get_data(as_text=True)
        self.assertIn('id="wl-remote-btn"', html)
        self.assertIn('id="wl-leader-codes"', html)
        self.assertNotIn("worship-solo.js", html)

    def test_audience_window_never_renders_private_controls_with_mixed_cookies(self):
        self.pair("view", "control", "stage")
        html = self.client.get(f"/worship/live/present/{self.sid}?audience=1").get_data(as_text=True)
        self.assertIn("Ready to present", html)
        self.assertNotIn("Show leader codes", re.sub(r"<script\b.*?</script>", "", html, flags=re.S))
        self.assertNotIn("Copy remote", html)
        self.assertIn("var canControl=false", html)
        state = self.client.get(f"/worship/live/state/{self.sid}?role=view").get_json()
        self.assertNotIn("stage_message", state)
        self.assertNotIn("display_ack", state)

    def test_report_requires_view_capability_and_header(self):
        self.assertEqual(self.report().status_code, 410)
        self.pair("control")
        self.assertEqual(self.report().status_code, 410)
        self.pair("view")
        self.assertEqual(self.client.post(f"/worship/live/display/{self.sid}", json={}).status_code, 400)
        self.assertEqual(self.report().status_code, 200)

    def test_report_tracks_received_slide_without_mutating_navigation(self):
        self.pair("view", "control")
        self.assertEqual(self.report().status_code, 200)
        state = self.client.get(f"/worship/live/state/{self.sid}").get_json()
        self.assertEqual(state["current_index"], 0)
        self.assertEqual(state["revision"], 2)
        self.assertEqual(state["display_ack"]["current_index"], 0)
        self.assertGreater(state["display_ack"]["seen_epoch"], time.time() - 5)
        app._update_worship_live_session("grace", self.sid, "next")
        self.assertEqual(self.report().status_code, 200)  # A stale display can report its old slide.
        state = self.client.get(f"/worship/live/state/{self.sid}").get_json()
        self.assertEqual(state["current_index"], 1)
        self.assertEqual(state["revision"], 3)
        self.assertEqual(state["display_ack"]["current_index"], 0)
        self.assertEqual(self.report(revision=99).status_code, 400)
        self.assertEqual(self.report(current_index=99).status_code, 400)
        self.assertEqual(self.report(blank="false").status_code, 400)

    def test_collapsed_repeat_cues_keep_counts_without_extra_audience_slides(self):
        song = {"parts": {"bridge": ["Short refrain", "Resolution"]}, "arrangement": ["bridge"] * 3}
        chunks = list(app._iter_worship_lyric_chunks(song))
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0][1]["repeat_count"], 3)
        slides = app._build_worship_mobile_slides([{**song, "id": "sample", "title": "Sample"}])
        lyrics = [slide for slide in slides if slide["kind"] == "lyric"]
        self.assertEqual(lyrics[0]["repeat_count"], 3)
