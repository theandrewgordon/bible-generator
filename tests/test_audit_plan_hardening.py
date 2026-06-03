import unittest
import os
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("OPENAI_API_KEY", "test-key")

import app
from faithsparks.services import lesson_pack
from faithsparks.services.rate_limit import check_rate_limit, reset_memory_limits
from faithsparks.views import billing, games, public


class _FakeDoc:
    def __init__(self, exists=False, data=None):
        self.exists = exists
        self._data = data or {}
        self.set_calls = []

    def to_dict(self):
        return dict(self._data)

    def get(self):
        return self

    def set(self, payload, merge=False):
        self.set_calls.append((payload, merge))


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or {}
        self.last_doc = None

    def document(self, doc_id):
        self.last_doc = self.docs.setdefault(doc_id, _FakeDoc())
        return self.last_doc


class _FakeDb:
    def __init__(self, collections=None):
        self.collections = collections or {}

    def collection(self, name):
        self.collections.setdefault(name, _FakeCollection())
        return self.collections[name]


class AuditPlanHardeningTests(unittest.TestCase):
    def test_lesson_pack_post_requires_login_before_generation(self):
        with app.app.test_request_context("/lesson-pack", method="POST", data={"verse": "John 3:16"}):
            app.g.flask_dance_google = SimpleNamespace(authorized=False)
            with mock.patch.object(public, "create_lesson_pack", side_effect=AssertionError("should not generate")):
                response = public.lesson_pack()

        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/google", response.location)

    def test_lesson_pack_result_requires_owner(self):
        with app.app.test_request_context("/lesson-pack/result/gods-love-john-3-16-nlt"):
            app.g.flask_dance_google = SimpleNamespace(authorized=True)
            app.session["user_email"] = "owner@example.com"
            with mock.patch.object(public, "_owned_lesson_pack", return_value=None):
                with self.assertRaises(Exception) as ctx:
                    public.lesson_pack_result("gods-love-john-3-16-nlt")

        self.assertEqual(getattr(ctx.exception, "code", None), 404)

    def test_cached_lesson_pack_records_user_ownership(self):
        cached = {
            "slug": "gods-love-john-3-16-nlt",
            "title": "God's Love Lesson Pack",
            "verse": "John 3:16",
            "version": "nlt",
            "age_bracket": "6-8",
            "combined_pdf": "output/lesson_packs/gods-love-john-3-16-nlt/gods-love-john-3-16-nlt.pdf",
            "zip_path": "output/lesson_packs/gods-love-john-3-16-nlt/gods-love-john-3-16-nlt.zip",
            "cache_key": "john-3-16-nlt-6-8-print",
        }
        fake_db = _FakeDb(
            {
                "lesson_pack_cache": _FakeCollection({"john-3-16-nlt-6-8-print": _FakeDoc(True, cached)}),
                "lesson_packs": _FakeCollection(),
            }
        )
        with mock.patch.object(lesson_pack, "db", fake_db), \
            mock.patch.object(lesson_pack, "request_verse_data", return_value='{"verse":"John 3:16","fullVerse":"For God so loved the world.","title":"John 3:16"}'), \
            mock.patch.object(lesson_pack, "parse_and_clean_json", return_value={"verse": "John 3:16", "fullVerse": "For God so loved the world.", "title": "John 3:16"}), \
            mock.patch.object(lesson_pack, "normalize_verse_data", return_value={"verse": "John 3:16", "version": "nlt", "fullVerse": "For God so loved the world.", "title": "John 3:16"}), \
            mock.patch.object(Path, "exists", return_value=True):
            result = lesson_pack.create_lesson_pack(user_email="owner@example.com", verse_input="John 3:16")

        self.assertEqual(result["slug"], "gods-love-john-3-16-nlt")
        owner_doc = fake_db.collections["lesson_packs"].last_doc
        self.assertTrue(owner_doc.set_calls)
        self.assertEqual(owner_doc.set_calls[-1][0]["email"], "owner@example.com")

    def test_cached_lesson_pack_rejects_missing_artifact_paths(self):
        cached = {
            "slug": "gods-love-john-3-16-nlt",
            "combined_pdf": "",
            "zip_path": "",
            "pdf_storage_path": "",
            "zip_storage_path": "",
        }

        with mock.patch.object(lesson_pack, "blob_exists", return_value=False):
            self.assertFalse(lesson_pack._cached_lesson_pack_has_artifact(cached))

    def test_lesson_pack_download_redirects_to_owned_storage_artifact(self):
        owned = {
            "slug": "gods-love-john-3-16-nlt",
            "pdf_storage_path": "lesson_packs/gods-love-john-3-16-nlt/gods-love-john-3-16-nlt.pdf",
        }
        with app.app.test_request_context("/lesson-pack/download/gods-love-john-3-16-nlt"):
            app.g.flask_dance_google = SimpleNamespace(authorized=True)
            app.session["user_email"] = "owner@example.com"
            with mock.patch.object(public, "_owned_lesson_pack", return_value=owned), \
                mock.patch.object(public.Path, "exists", return_value=False), \
                mock.patch.object(public, "signed_url_for_path", return_value="https://storage.example/signed.pdf"):
                response = public.lesson_pack_download("gods-love-john-3-16-nlt")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.location, "https://storage.example/signed.pdf")

    def test_memory_rate_limit_blocks_after_limit(self):
        reset_memory_limits()
        self.assertTrue(check_rate_limit("test", "key", limit=1, window_seconds=60).allowed)
        blocked = check_rate_limit("test", "key", limit=1, window_seconds=60)
        self.assertFalse(blocked.allowed)
        self.assertGreaterEqual(blocked.retry_after, 1)

    def test_games_words_rate_limit_returns_json_429(self):
        denied = SimpleNamespace(allowed=False, retry_after=60)
        with app.app.test_request_context("/games/words", method="POST", json={"refs": "John 3:16"}):
            app.g.flask_dance_google = SimpleNamespace(authorized=True)
            with mock.patch.object(games, "check_rate_limit", return_value=denied):
                response, status = games.games_words()

        self.assertEqual(status, 429)
        self.assertIn("Please wait", response.get_json()["error"])

    def test_service_worker_caches_assets_only(self):
        sw = Path("static/service-worker.js").read_text()
        self.assertNotIn("'/'", sw)
        self.assertIn("request.mode === 'navigate'", sw)
        self.assertIn("url.pathname.startsWith('/static/')", sw)
        self.assertNotIn("publicNavigations", sw)

    def test_stripe_checkout_error_does_not_echo_exception(self):
        original_stripe = billing.stripe
        billing.stripe = SimpleNamespace(
            checkout=SimpleNamespace(Session=SimpleNamespace(create=mock.Mock(side_effect=RuntimeError("sk_test_secret"))))
        )
        original_secret = billing.STRIPE_SECRET_KEY
        billing.STRIPE_SECRET_KEY = "sk_test_fake"
        try:
            with app.app.test_request_context("/create_checkout_session", method="POST", data={"price_id": "price_123"}):
                app.session["user_email"] = "owner@example.com"
                response = billing.create_checkout_session()
        finally:
            billing.stripe = original_stripe
            billing.STRIPE_SECRET_KEY = original_secret

        self.assertEqual(response.status_code, 302)
        self.assertNotIn("sk_test_secret", response.location)


if __name__ == "__main__":
    unittest.main()
