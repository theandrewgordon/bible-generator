import json
import tempfile
import unittest
from pathlib import Path

import app


class WorshipSetlistTests(unittest.TestCase):
    def setUp(self):
        self.original_root = app.app.root_path
        self.original_db = app.db
        self.tmp = tempfile.TemporaryDirectory()
        app.app.root_path = self.tmp.name
        app.db = None

    def tearDown(self):
        app.app.root_path = self.original_root
        app.db = self.original_db
        self.tmp.cleanup()

    def test_save_setlist_defaults_to_date_and_metadata(self):
        with app.app.test_request_context(
            "/worship/setlist/save",
            method="POST",
            data={"song_ids": ["song-one", "song-two"], "notes_json": json.dumps({"song-one": "Capo 2"})},
        ):
            app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
            app.session["user_email"] = "leader@example.com"
            response = app.worship_setlist_save()

        data = response.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["id"], data["date"])
        self.assertEqual(data["song_count"], 2)
        self.assertEqual(data["created_by"], "leader@example.com")
        self.assertTrue((Path(self.tmp.name) / "setlists" / f"{data['id']}.json").exists())

    def test_rename_setlist_keeps_songs_and_notes(self):
        setlists_dir = Path(self.tmp.name) / "setlists"
        setlists_dir.mkdir()
        (setlists_dir / "2026-05-31.json").write_text(
            json.dumps({"id": "2026-05-31", "date": "2026-05-31", "songs": ["song-one"], "notes": {"song-one": "Intro"}}),
            encoding="utf-8",
        )
        with app.app.test_request_context(
            "/worship/setlist/rename",
            method="POST",
            data={"setlist_id": "2026-05-31", "setlist_name": "Sunday AM"},
        ):
            app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
            app.session["user_email"] = "leader@example.com"
            response = app.worship_setlist_rename()

        data = response.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["name"], "Sunday AM")
        self.assertEqual(data["songs"], ["song-one"])
        self.assertFalse((setlists_dir / "2026-05-31.json").exists())

    def test_duplicate_setlist_creates_copy(self):
        setlists_dir = Path(self.tmp.name) / "setlists"
        setlists_dir.mkdir()
        (setlists_dir / "2026-05-31.json").write_text(
            json.dumps({"id": "2026-05-31", "date": "2026-05-31", "name": "Sunday", "songs": ["song-one"], "notes": {}}),
            encoding="utf-8",
        )
        with app.app.test_request_context(
            "/worship/setlist/duplicate",
            method="POST",
            data={"setlist_id": "2026-05-31", "setlist_name": "Copy of Sunday"},
        ):
            app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
            app.session["user_email"] = "leader@example.com"
            response = app.worship_setlist_duplicate()

        data = response.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["name"], "Copy of Sunday")
        self.assertEqual(data["songs"], ["song-one"])
        self.assertTrue((setlists_dir / f"{data['id']}.json").exists())

    def test_mobile_setlist_id_loads_saved_notes(self):
        songs_dir = Path(self.tmp.name) / "songs"
        songs_dir.mkdir()
        (songs_dir / "song-one.json").write_text(
            json.dumps(
                {
                    "id": "song-one",
                    "title": "Song One",
                    "parts": {"verse1": ["Line one"]},
                    "arrangement": ["verse1"],
                }
            ),
            encoding="utf-8",
        )
        setlists_dir = Path(self.tmp.name) / "setlists"
        setlists_dir.mkdir()
        (setlists_dir / "2026-05-31.json").write_text(
            json.dumps({"id": "2026-05-31", "date": "2026-05-31", "songs": ["song-one"], "notes": {"song-one": "Start soft"}}),
            encoding="utf-8",
        )

        with app.app.test_request_context("/worship/mobile?setlist_id=2026-05-31"):
            app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
            app.session["user_email"] = "leader@example.com"
            html = app.worship_mobile()

        self.assertIn("Start soft", html)

    def test_local_setlists_filter_by_selected_scope(self):
        setlists_dir = Path(self.tmp.name) / "setlists"
        setlists_dir.mkdir()
        (setlists_dir / "default.json").write_text(
            json.dumps({"id": "default", "date": "2026-05-31", "songs": ["default-song"], "worship_scope": "default"}),
            encoding="utf-8",
        )
        (setlists_dir / "grace.json").write_text(
            json.dumps({"id": "grace", "date": "2026-06-01", "songs": ["grace-song"], "worship_scope": "grace-church"}),
            encoding="utf-8",
        )

        with app.app.test_request_context("/worship"):
            app.session["worship_church_id"] = "grace-church"
            setlists = app._load_recent_setlists()

        self.assertEqual([item["id"] for item in setlists], ["grace"])


if __name__ == "__main__":
    unittest.main()
