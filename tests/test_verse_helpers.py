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
