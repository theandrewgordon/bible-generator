import unittest
from unittest import mock

import app


class WorshipQuickScriptureTests(unittest.TestCase):
    def test_builds_scripture_item_from_authoritative_text(self):
        text = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish."
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=text) as fetch:
            item = app._build_quick_worship_scripture("john 3:16", "kjv")

        fetch.assert_called_once_with("John 3:16", "kjv")
        self.assertEqual(item["title"], "John 3:16")
        self.assertEqual(item["version"], "KJV")
        self.assertEqual(item["type"], "scripture")
        self.assertEqual(item["arrangement"], ["reading"])
        self.assertGreater(len(item["parts"]["reading"]), 1)
        self.assertEqual(" ".join(item["parts"]["reading"]), text)

    def test_rejects_invalid_reference_and_unsupported_version(self):
        with self.assertRaisesRegex(ValueError, "Bible reference"):
            app._build_quick_worship_scripture("John", "web")
        with self.assertRaisesRegex(ValueError, "WEB, KJV, or ESV"):
            app._build_quick_worship_scripture("John 3:16", "nlt")

    def test_reports_when_authoritative_text_is_unavailable(self):
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Try WEB or KJV"):
                app._build_quick_worship_scripture("John 3:16", "esv")


if __name__ == "__main__":
    unittest.main()
