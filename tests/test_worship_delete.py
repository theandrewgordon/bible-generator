import json
import tempfile
import unittest
from pathlib import Path

import app


class WorshipDeleteTests(unittest.TestCase):
    def test_delete_prunes_song_from_saved_setlists(self):
        original_root = app.app.root_path
        original_db = app.db
        with tempfile.TemporaryDirectory() as tmp:
            setlists_dir = Path(tmp) / "setlists"
            setlists_dir.mkdir()
            fp = setlists_dir / "2026-05-31.json"
            fp.write_text(
                json.dumps(
                    {
                        "date": "2026-05-31",
                        "songs": ["keep-song", "delete-song"],
                        "notes": {"keep-song": "Key C", "delete-song": "Skip intro"},
                    }
                ),
                encoding="utf-8",
            )
            try:
                app.app.root_path = tmp
                app.db = None
                changed = app._remove_song_from_worship_setlists("delete-song")
            finally:
                app.app.root_path = original_root
                app.db = original_db

            data = json.loads(fp.read_text(encoding="utf-8"))

        self.assertEqual(changed, 1)
        self.assertEqual(data["songs"], ["keep-song"])
        self.assertEqual(data["notes"], {"keep-song": "Key C"})

    def test_delete_removes_empty_saved_setlist(self):
        original_root = app.app.root_path
        original_db = app.db
        with tempfile.TemporaryDirectory() as tmp:
            setlists_dir = Path(tmp) / "setlists"
            setlists_dir.mkdir()
            fp = setlists_dir / "2026-05-31.json"
            fp.write_text(json.dumps({"date": "2026-05-31", "songs": ["delete-song"], "notes": {}}), encoding="utf-8")
            try:
                app.app.root_path = tmp
                app.db = None
                changed = app._remove_song_from_worship_setlists("delete-song")
            finally:
                app.app.root_path = original_root
                app.db = original_db

            exists = fp.exists()

        self.assertEqual(changed, 1)
        self.assertFalse(exists)

    def test_reset_library_deletes_local_songs_and_setlists(self):
        original_root = app.app.root_path
        original_db = app.db
        with tempfile.TemporaryDirectory() as tmp:
            songs_dir = Path(tmp) / "songs"
            setlists_dir = Path(tmp) / "setlists"
            songs_dir.mkdir()
            setlists_dir.mkdir()
            (songs_dir / "song-a.json").write_text(json.dumps({"id": "song-a", "title": "Song A"}), encoding="utf-8")
            (songs_dir / "song-b.json").write_text(json.dumps({"id": "song-b", "title": "Song B"}), encoding="utf-8")
            (setlists_dir / "2026-05-31.json").write_text(json.dumps({"songs": ["song-a"]}), encoding="utf-8")
            try:
                app.app.root_path = tmp
                app.db = None
                deleted = app._delete_all_worship_library_data()
            finally:
                app.app.root_path = original_root
                app.db = original_db

            remaining_songs = list(songs_dir.glob("*.json"))
            remaining_setlists = list(setlists_dir.glob("*.json"))

        self.assertEqual(deleted, {"songs": 2, "setlists": 1})
        self.assertEqual(remaining_songs, [])
        self.assertEqual(remaining_setlists, [])


if __name__ == "__main__":
    unittest.main()
