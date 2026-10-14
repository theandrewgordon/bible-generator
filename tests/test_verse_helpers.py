import json
import sys
import types
import unittest
from unittest.mock import patch

try:
    import flask  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - test shim
    flask_stub = types.ModuleType("flask")
    flask_stub.current_app = types.SimpleNamespace(logger=None)
    flask_stub.g = types.SimpleNamespace()
    flask_stub.request = types.SimpleNamespace(
        method="GET",
        headers={},
        path="/",
        args={},
        get_json=lambda **_: None,
        form={},
        get_data=lambda **_: b"",
        full_path="/",
    )
    flask_stub.session = {}
    sys.modules["flask"] = flask_stub

if "dotenv" not in sys.modules:  # pragma: no cover - test shim
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *_, **__: None
    sys.modules["dotenv"] = dotenv_stub

if "openai" not in sys.modules:  # pragma: no cover - test shim
    openai_stub = types.ModuleType("openai")

    class _FakeOpenAI:  # pragma: no cover - test shim
        def __init__(self, *_, **__):
            pass

    openai_stub.OpenAI = _FakeOpenAI
    sys.modules["openai"] = openai_stub

from verse_helpers import normalize_verse_data, request_verse_data


class VerseHelperTests(unittest.TestCase):
    def setUp(self):
        # A licensed/public-domain source answers; the AI only supplies extras.
        source = patch("faithsparks.services.scripture.fetch_verse_text", return_value="For God so loved the world.")
        source.start()
        self.addCleanup(source.stop)
        cache = patch("verse_helpers._load_cached_verse_data", return_value=None)
        cache.start()
        self.addCleanup(cache.stop)

    def test_no_bible_source_means_no_worksheet(self):
        response = json.dumps({"verse": "john 3:16", "fullVerse": "AI-written words", "version": "niv"})
        with patch("faithsparks.services.scripture.fetch_verse_text", return_value=None), \
                patch("verse_helpers.call_openai", return_value=response):
            self.assertIsNone(request_verse_data("john 3:16", "niv"))

    def test_half_verse_uses_real_words(self):
        full = "And we know that for those who love God all things work together for good, for those who are called according to his purpose."
        response = json.dumps({"verse": "Romans 8:28a", "fullVerse": "We know God works all things for good", "version": "esv"})
        with patch("faithsparks.services.scripture.fetch_verse_text", return_value=full), \
                patch("verse_helpers.call_openai", return_value=response):
            payload = json.loads(request_verse_data("Romans 8:28a", "esv"))
        self.assertEqual(payload["fullVerse"], "And we know that for those who love God all things work together for good,")
    def test_normalize_verse_data_fills_title_and_defaults(self):
        data = normalize_verse_data(
            {"verse": "john 3:16", "fullVerse": "For God so loved the world."},
            "john 3:16",
            "esv",
        )

        self.assertEqual(data["verse"], "John 3:16")
        self.assertEqual(data["title"], "John 3:16")
        self.assertEqual(data["version"], "esv")
        self.assertEqual(data["handwritingLines"], 3)
        self.assertEqual(data["reflectionQuestion"], "Why is this meaningful to you?")

    def test_request_verse_data_repairs_missing_title(self):
        response = json.dumps(
            {
                "verse": "john 3:16",
                "fullVerse": "For God so loved the world.",
                "traceableVerse": "For God so loved the world.",
                "handwritingLines": 3,
                "reflectionQuestion": "Why is this meaningful to you?",
                "imageIdea": "A heart with light",
                "version": "esv",
            }
        )

        with patch("verse_helpers.call_openai", return_value=response):
            payload = json.loads(request_verse_data("john 3:16", "esv"))

        self.assertEqual(payload["title"], "John 3:16")
        self.assertEqual(payload["verse"], "John 3:16")
        self.assertEqual(payload["version"], "esv")

    def test_request_verse_data_repairs_malformed_json_on_retry(self):
        malformed = '{"verse": "john 3:16", "fullVerse": "For God so loved the world.'
        repaired = json.dumps(
            {
                "verse": "john 3:16",
                "fullVerse": "For God so loved the world.",
                "traceableVerse": "For God so loved the world.",
                "handwritingLines": 3,
                "reflectionQuestion": "Why is this meaningful to you?",
                "imageIdea": "A heart with light",
                "version": "esv",
            }
        )

        with patch("verse_helpers.call_openai", side_effect=[malformed, repaired]):
            payload = json.loads(request_verse_data("john 3:16", "esv"))

        self.assertEqual(payload["title"], "John 3:16")
        self.assertEqual(payload["verse"], "John 3:16")


if __name__ == "__main__":
    unittest.main()
