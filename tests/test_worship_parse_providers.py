import json
import sys
import types
import unittest
from unittest.mock import patch

import app


class WorshipParseProviderTests(unittest.TestCase):
    def test_claude_request_ends_with_user_message_without_prefill(self):
        captured = {}
        expected = {"title": "Example", "parts": {"verse1": ["Line"]}, "arrangement": ["verse1"]}

        class FakeMessages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return types.SimpleNamespace(
                    content=[types.SimpleNamespace(type="text", text=json.dumps(expected))]
                )

        class FakeAnthropic:
            def __init__(self, api_key):
                self.messages = FakeMessages()

        fake_module = types.SimpleNamespace(Anthropic=FakeAnthropic)
        with patch.dict(sys.modules, {"anthropic": fake_module}):
            parsed = app._parse_worship_lyrics_claude("Parse this", "test-key")

        self.assertEqual(parsed, expected)
        self.assertEqual(captured["messages"], [{"role": "user", "content": "Parse this"}])


if __name__ == "__main__":
    unittest.main()
