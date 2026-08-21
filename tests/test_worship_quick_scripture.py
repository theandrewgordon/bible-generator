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
        with self.assertRaisesRegex(ValueError, "Enter other translations manually"):
            app._build_quick_worship_scripture("John 3:16", "nasb")

    def test_all_copywork_picker_versions_are_available_to_worship(self):
        expected = {"web": "WEB", "kjv": "KJV", "esv": "ESV", "nlt": "NLT"}
        self.assertEqual(app._WORSHIP_SCRIPTURE_VERSIONS, expected)
        for version, label in expected.items():
            with self.subTest(version=version), mock.patch(
                "faithsparks.services.scripture.fetch_verse_text", return_value="Authorized verse text."
            ):
                item = app._build_quick_worship_scripture("John 3:16", version)
                self.assertEqual(item["version"], label)

    def test_reports_when_authoritative_text_is_unavailable(self):
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=None), mock.patch.dict(
            "os.environ", {"ESV_API_KEY": "configured"}
        ):
            with self.assertRaisesRegex(RuntimeError, "Try WEB or KJV"):
                app._build_quick_worship_scripture("John 3:16", "esv")

    def test_picker_hides_copyrighted_versions_without_a_provider(self):
        with mock.patch.dict("os.environ", {"ESV_API_KEY": "", "API_BIBLE_KEY": "", "API_BIBLE_IDS": ""}):
            self.assertEqual(app._worship_scripture_version_options(), [
                {"id": "web", "label": "WEB"},
                {"id": "kjv", "label": "KJV"},
            ])

    def test_picker_enables_configured_authoritative_versions(self):
        env = {
            "ESV_API_KEY": "esv-key",
            "API_BIBLE_KEY": "api-bible-key",
            "API_BIBLE_IDS": "nlt:nlt-bible-id",
        }
        with mock.patch.dict("os.environ", env):
            self.assertEqual([item["id"] for item in app._worship_scripture_version_options()], [
                "web", "kjv", "esv", "nlt"
            ])

    def test_unconfigured_nlt_direct_request_explains_manual_entry(self):
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=None), mock.patch.dict(
            "os.environ", {"API_BIBLE_KEY": "", "API_BIBLE_IDS": ""}
        ):
            with self.assertRaisesRegex(RuntimeError, "Manual Entry"):
                app._build_quick_worship_scripture("John 1:1-2", "nlt")

    def test_builds_manual_scripture_without_changing_words(self):
        text = "In the beginning was the Word, and the Word was with God."
        with app.app.test_request_context("/worship/scripture/preview"):
            item = app._build_manual_worship_scripture("john 1:1", "NIV", text, True)

        self.assertEqual(item["title"], "John 1:1")
        self.assertEqual(item["version"], "NIV")
        self.assertEqual(" ".join(item["parts"]["reading"]), text)
        self.assertEqual(item["scripture_text_source"], "user_supplied")
        self.assertTrue(item["import_rights_confirmed"])

    def test_manual_scripture_requires_text_label_and_confirmation(self):
        with self.assertRaisesRegex(ValueError, "translation label"):
            app._build_manual_worship_scripture("John 1:1", "", "Text", True)
        with self.assertRaisesRegex(ValueError, "exact Scripture text"):
            app._build_manual_worship_scripture("John 1:1", "NIV", "", True)
        with self.assertRaisesRegex(ValueError, "Confirm"):
            app._build_manual_worship_scripture("John 1:1", "NIV", "Text", False)

    def test_manual_scripture_cleans_webpage_noise_conservatively(self):
        paste = """John 1:1–2 NLT
Listen
1 In the beginning the Word already existed.
2 He existed in the beginning with God.
Read full chapter
Footnotes
John 1:1 Or the Word was.
Copyright © Publisher
"""
        cleaned, details = app._clean_manual_scripture_paste(paste, "John 1:1–2", "NLT")

        self.assertEqual(cleaned, "In the beginning the Word already existed.\nHe existed in the beginning with God.")
        self.assertTrue(details["changed"])
        self.assertEqual(details["removed_verse_numbers"], 2)
        self.assertGreaterEqual(details["removed_lines"], 3)

    def test_manual_cleanup_preserves_numbers_inside_scripture(self):
        cleaned, _ = app._clean_manual_scripture_paste(
            "The number of those who were sealed was 144,000 from all the tribes.",
            "Revelation 7:4",
            "NIV",
        )
        self.assertIn("144,000", cleaned)


if __name__ == "__main__":
    unittest.main()
