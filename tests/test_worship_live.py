import time
import unittest
from urllib.parse import urlparse

from flask import g
from itsdangerous import BadData

import app


class WorshipLiveTests(unittest.TestCase):
    def setUp(self):
        self.original_db = app.db
        self.original_env = app.APP_ENV
        app.db = None
        app.APP_ENV = "dev"
        app._worship_live_memory.clear()

    def tearDown(self):
        app._worship_live_memory.clear()
        app.db = self.original_db
        app.APP_ENV = self.original_env

    def _session_data(self):
        return {
            "id": "live-session-abcdefghijkl",
            "scope": "grace",
            "name": "Sunday Worship",
            "song_ids": ["sample"],
            "notes": {"sample": "Start softly"},
            "slide_count": 3,
            "current_index": 0,
            "blank": False,
            "revision": 0,
            "expires_epoch": time.time() + 3600,
        }

    def test_live_tokens_separate_view_and_control_permissions(self):
        view = app._make_worship_live_token(
            scope="grace", session_id="live-session-abcdefghijkl", role="view"
        )
        control = app._make_worship_live_token(
            scope="grace", session_id="live-session-abcdefghijkl", role="control"
        )

        self.assertEqual(app._load_worship_live_token(view, required_role="view")["role"], "view")
        self.assertEqual(app._load_worship_live_token(control, required_role="control")["role"], "control")
        with self.assertRaises(BadData):
            app._load_worship_live_token(view, required_role="control")

    def test_live_state_advances_blanks_and_clamps(self):
        data = self._session_data()
        app._create_worship_live_session(data)

        state = app._update_worship_live_session("grace", data["id"], "next")
        self.assertEqual(state["current_index"], 1)
        state = app._update_worship_live_session("grace", data["id"], "toggle_blank")
        self.assertTrue(state["blank"])
        state = app._update_worship_live_session("grace", data["id"], "index", 99)
        self.assertEqual(state["current_index"], 2)
        self.assertEqual(state["revision"], 3)

    def test_start_live_returns_presenter_and_remote_urls(self):
        selected = [{
            "id": "sample",
            "title": "Sample Song",
            "parts": {"verse1": ["A lyric line"]},
            "arrangement": ["verse1"],
        }]
        original_resolve = app._resolve_selected_worship_items
        try:
            app._resolve_selected_worship_items = lambda *_args, **_kwargs: selected
            with app.app.test_request_context(
                "/worship/live/start", method="POST", data={"song_order": "sample", "song_ids": ["sample"]}
            ):
                g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "leader@example.com"
                response = app.worship_live_start()
        finally:
            app._resolve_selected_worship_items = original_resolve

        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertIn("/worship/live/present/", payload["presenter_url"])
        self.assertIn("/worship/live/remote/", payload["remote_url"])
        presenter = urlparse(payload["presenter_url"])
        remote = urlparse(payload["remote_url"])
        self.assertFalse(presenter.query)
        self.assertIn("view=", presenter.fragment)
        self.assertIn("control=", presenter.fragment)
        self.assertFalse(remote.query)
        self.assertTrue(remote.fragment.startswith("control="))
        stored = next(iter(app._worship_live_memory.values()))
        self.assertEqual(stored["slides"][0]["title"], "Sample Song")

    def test_presenter_renders_without_login(self):
        data = self._session_data()
        data["slide_count"] = 2
        selected = [{
            "id": "sample",
            "title": "Sample Song",
            "parts": {"verse1": ["A lyric line"]},
            "arrangement": ["verse1"],
        }]
        data["slides"] = app._build_worship_mobile_slides(selected)
        app._create_worship_live_session(data)
        view = app._make_worship_live_token(scope="grace", session_id=data["id"], role="view")
        control = app._make_worship_live_token(scope="grace", session_id=data["id"], role="control")
        client = app.app.test_client()
        bootstrap = client.get(f"/worship/live/present/{data['id']}")
        self.assertIn("Securing this presenter", bootstrap.get_data(as_text=True))
        exchange = client.post(
            f"/worship/live/exchange/{data['id']}",
            json={"view": view, "control": control},
            headers={"X-Worship-Live": "1"},
        )
        self.assertEqual(exchange.status_code, 200)
        original_resolve = app._resolve_worship_ids_for_scope
        try:
            app._resolve_worship_ids_for_scope = lambda *_args: self.fail("stored live slides should be used")
            response = client.get(f"/worship/live/present/{data['id']}")
        finally:
            app._resolve_worship_ids_for_scope = original_resolve

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("Sample Song", html)
        self.assertIn("Start presenting", html)
        self.assertIn("remote-qr", html)
        self.assertIn("End session", html)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")

    def test_live_control_post_is_capability_csrf_exempt(self):
        self.assertIn("/worship/live/exchange/", app._CSRF_CAPABILITY_POST_PREFIXES)
        self.assertIn("/worship/live/control/", app._CSRF_CAPABILITY_POST_PREFIXES)

    def test_control_route_updates_state_and_rejects_view_token(self):
        data = self._session_data()
        app._create_worship_live_session(data)
        control = app._make_worship_live_token(scope="grace", session_id=data["id"], role="control")
        view = app._make_worship_live_token(scope="grace", session_id=data["id"], role="view")

        with app.app.test_request_context(
            f"/worship/live/control/{control}", method="POST", json={"action": "next"}
        ):
            response = app.worship_live_control(control)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["current_index"], 1)

        with app.app.test_request_context(
            f"/worship/live/control/{view}", method="POST", json={"action": "next"}
        ):
            response, status = app.worship_live_control(view)
        self.assertEqual(status, 410)

    def test_cookie_control_requires_exchange_header_and_can_end_session(self):
        data = self._session_data()
        app._create_worship_live_session(data)
        control = app._make_worship_live_token(scope="grace", session_id=data["id"], role="control")
        client = app.app.test_client()

        exchange = client.post(
            f"/worship/live/exchange/{data['id']}",
            json={"control": control},
            headers={"X-Worship-Live": "1"},
        )
        self.assertEqual(exchange.status_code, 200)
        rejected = client.post(f"/worship/live/control/{data['id']}", json={"action": "next"})
        self.assertEqual(rejected.status_code, 400)
        ended = client.post(
            f"/worship/live/control/{data['id']}",
            json={"action": "end"},
            headers={"X-Worship-Live": "1"},
        )
        self.assertEqual(ended.status_code, 200)
        self.assertTrue(ended.get_json()["ended"])
        self.assertIsNone(app._get_worship_live_session("grace", data["id"]))

    def test_remote_and_qr_render_from_control_capability(self):
        data = self._session_data()
        selected = [{
            "id": "sample",
            "title": "Sample Song",
            "parts": {"verse1": ["A lyric line"]},
            "arrangement": ["verse1"],
        }]
        data["slides"] = app._build_worship_mobile_slides(selected)
        data["slide_count"] = len(data["slides"])
        app._create_worship_live_session(data)
        control = app._make_worship_live_token(scope="grace", session_id=data["id"], role="control")

        client = app.app.test_client()
        exchange = client.post(
            f"/worship/live/exchange/{data['id']}",
            json={"control": control},
            headers={"X-Worship-Live": "1"},
        )
        self.assertEqual(exchange.status_code, 200)
        remote = client.get(f"/worship/live/remote/{data['id']}")
        self.assertEqual(remote.status_code, 200)
        self.assertIn("Next →", remote.get_data(as_text=True))
        self.assertIn("Up next", remote.get_data(as_text=True))
        self.assertIn("End this session", remote.get_data(as_text=True))

        qr = client.get(f"/worship/live/remote-qr/{data['id']}.png")
        self.assertEqual(qr.status_code, 200)
        self.assertEqual(qr.mimetype, "image/png")


if __name__ == "__main__":
    unittest.main()
