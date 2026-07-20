import unittest
import os
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "test-key")

import app
from faithsparks.services import analytics as analytics_svc


class StatelessHardeningTests(unittest.TestCase):
    def setUp(self):
        self.original_app_env = app.APP_ENV
        self.original_app_env_var = os.environ.get("APP_ENV")
        self.original_use_local = os.environ.get("USE_LOCAL_STORAGE")
        self.original_db = app.db
        app.db = None  # Simulate no Firestore to force file fallback

    def tearDown(self):
        app.APP_ENV = self.original_app_env
        app.db = self.original_db
        if self.original_app_env_var is None:
            os.environ.pop("APP_ENV", None)
        else:
            os.environ["APP_ENV"] = self.original_app_env_var
        if self.original_use_local is None:
            os.environ.pop("USE_LOCAL_STORAGE", None)
        else:
            os.environ["USE_LOCAL_STORAGE"] = self.original_use_local

    def test_local_storage_allowed_in_development(self):
        app.APP_ENV = "development"
        os.environ["APP_ENV"] = "development"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        self.assertTrue(app._is_local_storage_allowed())
        self.assertTrue(analytics_svc._is_sqlite_allowed())

    def test_local_storage_disallowed_in_production(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        self.assertFalse(app._is_local_storage_allowed())
        self.assertFalse(analytics_svc._is_sqlite_allowed())

    def test_local_storage_allowed_in_production_if_explicitly_set(self):
        app.APP_ENV = "production"
        os.environ["APP_ENV"] = "production"
        os.environ["USE_LOCAL_STORAGE"] = "true"
        self.assertTrue(app._is_local_storage_allowed())
        self.assertTrue(analytics_svc._is_sqlite_allowed())

    def test_save_song_raises_in_production_without_firestore(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with self.assertRaises(RuntimeError) as ctx:
            app.save_worship_song({"title": "Test Song", "parts": {}})
        self.assertIn("Local fallback is disabled", str(ctx.exception))

    def test_get_song_raises_in_production_without_firestore(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with self.assertRaises(RuntimeError) as ctx:
            app.get_worship_song("test-song")
        self.assertIn("Local fallback is disabled", str(ctx.exception))

    def test_missing_song_returns_none_when_firestore_query_succeeds(self):
        class MissingDocument:
            exists = False

        class FakeReference:
            def document(self, _song_id):
                return self

            def get(self):
                return MissingDocument()

        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with (
            patch.object(app, "init_firebase", return_value=(object(), None)),
            patch.object(app, "_worship_song_refs_for_read", return_value=[FakeReference()]),
        ):
            result = app.get_worship_song("brand-new-song")

        self.assertIsNone(result)

    def test_list_songs_raises_in_production_without_firestore(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with self.assertRaises(RuntimeError) as ctx:
            app.list_worship_songs()
        self.assertIn("Local fallback is disabled", str(ctx.exception))

    def test_persist_setlist_raises_in_production_without_firestore(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with self.assertRaises(RuntimeError) as ctx:
            app._persist_worship_setlist({"id": "2026-06-21", "songs": []})
        self.assertIn("Local fallback is disabled", str(ctx.exception))

    def test_get_setlist_raises_in_production_without_firestore(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        with self.assertRaises(RuntimeError) as ctx:
            app._get_worship_setlist("2026-06-21")
        self.assertIn("Local fallback is disabled", str(ctx.exception))

    def test_missing_setlist_returns_none_when_firestore_query_succeeds(self):
        class MissingDocument:
            exists = False

        class FakeReference:
            def document(self, _setlist_id):
                return self

            def get(self):
                return MissingDocument()

        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        app.db = object()
        with patch.object(app, "_worship_setlist_refs_for_read", return_value=[FakeReference()]):
            result = app._get_worship_setlist("2026-07-20-new")

        self.assertIsNone(result)

    def test_sqlite_analytics_returns_empty_in_production(self):
        app.APP_ENV = "prod"
        os.environ["APP_ENV"] = "prod"
        os.environ.pop("USE_LOCAL_STORAGE", None)
        # Verify writing/reading doesn't fail with sqlite3.OperationalError/AttributeError
        # and instead gracefully returns defaults or does nothing
        analytics_svc.record_visit("127.0.0.1", "Mozilla")
        analytics_svc.record_login("user@example.com")

        overview = analytics_svc.daily_overview()
        self.assertEqual(overview["total_visitors"], 0)
        self.assertEqual(overview["total_logins"], 0)
        self.assertEqual(overview["series"], [])

        recent = analytics_svc.recent_visits()
        self.assertEqual(recent, [])


if __name__ == "__main__":
    unittest.main()
