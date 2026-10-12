"""Live Worship 'hot' mode: single-process memory state, write-through to Firestore."""

import os
import time
import unittest
from pathlib import Path
from unittest import mock

import app

ROOT = Path(__file__).resolve().parents[1]
SID = "live-session-abcdefghijkl"


class _Snap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data else None


class _Ref:
    """One Firestore document that counts reads and writes."""

    def __init__(self):
        self.data = None
        self.gets = 0
        self.sets = 0

    def get(self, field_paths=None, transaction=None):
        self.gets += 1
        return _Snap(self.data)

    def set(self, data, merge=False):
        self.sets += 1
        self.data = {**(self.data or {}), **data} if merge else dict(data)


class _Collection:
    def __init__(self, ref):
        self.ref = ref

    def document(self, _id):
        return self.ref


class HotLiveStateTests(unittest.TestCase):
    def setUp(self):
        self.ref = _Ref()
        self.patches = [
            mock.patch.object(app, "db", object()),
            mock.patch.object(app, "_worship_live_ref_for_scope", lambda scope: _Collection(self.ref)),
            mock.patch.dict(os.environ, {"WORSHIP_LIVE_HOT": "1"}),
        ]
        for patch in self.patches:
            patch.start()
        app._worship_live_state_cache.clear()
        app._create_worship_live_session({
            "id": SID, "scope": "grace", "name": "Sunday", "slide_count": 5, "current_index": 0,
            "blank": False, "revision": 0, "expires_epoch": time.time() + 3600, "slides": [{}] * 5,
        })

    def tearDown(self):
        app._worship_live_state_cache.clear()
        for patch in reversed(self.patches):
            patch.stop()

    def test_polls_and_taps_never_read_firestore(self):
        for _ in range(20):
            self.assertEqual(app._get_worship_live_session("grace", SID, include_slides=False)["current_index"], 0)
        for _ in range(3):
            state = app._update_worship_live_session("grace", SID, "next")
        self.assertEqual(state["current_index"], 3)
        self.assertEqual(app._get_worship_live_session("grace", SID, include_slides=False)["current_index"], 3)
        self.assertEqual(self.ref.gets, 0)
        self.assertEqual(self.ref.sets, 1 + 3)  # create + one write-through per tap
        self.assertEqual(self.ref.data["current_index"], 3)  # Firestore stays current for restarts

    def test_restart_falls_back_to_firestore_once(self):
        app._update_worship_live_session("grace", SID, "next")
        app._worship_live_state_cache.clear()  # new process after a deploy
        self.assertEqual(app._get_worship_live_session("grace", SID, include_slides=False)["current_index"], 1)
        app._get_worship_live_session("grace", SID, include_slides=False)
        self.assertEqual(self.ref.gets, 1)

    def test_expired_session_is_rejected_from_memory(self):
        cached = app._worship_live_state_cache[("grace", SID)][1]
        cached["expires_epoch"] = time.time() - 1
        self.assertIsNone(app._get_worship_live_session("grace", SID, include_slides=False))
        with self.assertRaises(LookupError):
            app._update_worship_live_session("grace", SID, "next")


class HotModeSwitchTests(unittest.TestCase):
    def test_off_with_several_processes_unless_forced(self):
        with mock.patch.object(app, "db", object()):
            with mock.patch.dict(os.environ, {"WEB_CONCURRENCY": "2", "WORSHIP_LIVE_HOT": ""}):
                self.assertFalse(app._worship_live_hot())
                self.assertEqual(app._worship_live_idle_poll_ms(800), 800)
            with mock.patch.dict(os.environ, {"WEB_CONCURRENCY": "1", "WORSHIP_LIVE_HOT": ""}):
                self.assertTrue(app._worship_live_hot())
                self.assertEqual(app._worship_live_idle_poll_ms(800), 250)
            with mock.patch.dict(os.environ, {"WEB_CONCURRENCY": "1", "WORSHIP_LIVE_HOT": "0"}):
                self.assertFalse(app._worship_live_hot())

    def test_render_runs_one_process(self):
        render = (ROOT / "render.yaml").read_text(encoding="utf-8")
        self.assertRegex(render, r"key: WEB_CONCURRENCY\n\s+value: 1\b")


class BackgroundTests(unittest.TestCase):
    def test_presenter_preloads_backgrounds(self):
        presenter = (ROOT / "templates" / "worship_live_presenter.html").read_text(encoding="utf-8")
        self.assertIn("preloadBackgrounds", presenter)

    def test_backgrounds_are_cacheable(self):
        backgrounds = sorted((ROOT / "static" / "worship" / "backgrounds").glob("*.jpg"))
        response = app.app.test_client().get(f"/static/worship/backgrounds/{backgrounds[0].name}")
        self.assertIn("max-age=604800", response.headers.get("Cache-Control", ""))


if __name__ == "__main__":
    unittest.main()
