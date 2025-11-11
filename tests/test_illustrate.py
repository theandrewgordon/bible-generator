import sys
import types
import unittest

try:
    import flask  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - test shim
    flask_stub = types.ModuleType("flask")

    class _FakeFlask:
        def __init__(self, *_, **__):
            pass

    flask_stub.Flask = _FakeFlask
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

def _noop(*_args, **_kwargs):
    return None


if "build_pdf" not in sys.modules:  # pragma: no cover - test shim
    fake_build_pdf = types.ModuleType("build_pdf")
    fake_build_pdf.build_coloring_pdf = _noop
    sys.modules["build_pdf"] = fake_build_pdf

firestore_stub = types.ModuleType("faithsparks.services.firestore")
firestore_stub.db = None
firestore_stub.firestore = types.SimpleNamespace(SERVER_TIMESTAMP=None)
sys.modules.setdefault("faithsparks.services.firestore", firestore_stub)

storage_stub = types.ModuleType("faithsparks.services.storage")
storage_stub.upload_to_storage = _noop
sys.modules.setdefault("faithsparks.services.storage", storage_stub)

dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = _noop
sys.modules.setdefault("dotenv", dotenv_stub)

openai_stub = types.ModuleType("openai")

class _FakeOpenAI:  # pragma: no cover - test shim
    def __init__(self, *_, **__):
        pass

openai_stub.OpenAI = _FakeOpenAI
sys.modules.setdefault("openai", openai_stub)

from faithsparks.services import illustrate


class BlueprintTests(unittest.TestCase):
    def test_force_symbols_when_sensitive(self):
        summary = {
            "theological_notes": ["dove = Holy Spirit"],
            "sensitivity": {"violence": True, "death": False, "demons": False, "adult_themes": False},
        }
        blueprint, forced = illustrate.build_scene_blueprint(
            summary,
            age_bracket="9-10",
            user_symbols_only=False,
            allow_historical_props=True,
        )
        self.assertTrue(forced)
        self.assertTrue(blueprint["symbols_only"])
        self.assertEqual(blueprint["historical_props"], [])

    def test_respects_age_defaults(self):
        summary = {"sensitivity": {flag: False for flag in illustrate.SENSITIVITY_FLAGS}}
        blueprint, forced = illustrate.build_scene_blueprint(
            summary,
            age_bracket="unknown",
            user_symbols_only=False,
            allow_historical_props=False,
        )
        self.assertFalse(forced)
        self.assertEqual(blueprint["composition"], {"foreground_max": 4, "background_max": 2})

    def test_user_symbols_option(self):
        summary = {"sensitivity": {flag: False for flag in illustrate.SENSITIVITY_FLAGS}}
        blueprint, forced = illustrate.build_scene_blueprint(
            summary,
            age_bracket="3-5",
            user_symbols_only=True,
            allow_historical_props=True,
        )
        self.assertFalse(forced)
        self.assertTrue(blueprint["symbols_only"])
        self.assertEqual(blueprint["historical_props"], [])


class BlocklistTests(unittest.TestCase):
    def test_detects_blocked_terms_case_insensitive(self):
        term = illustrate.detect_blocked_term("Please avoid BLOOD imagery")
        self.assertEqual(term, "blood")

    def test_no_blocked_term_returns_none(self):
        self.assertIsNone(illustrate.detect_blocked_term("Gentle rivers and doves"))


if __name__ == "__main__":
    unittest.main()
