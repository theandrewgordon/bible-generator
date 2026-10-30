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

    def test_reports_when_no_verified_text_is_available(self):
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=None), mock.patch(
            "faithsparks.services.scripture_checked.fetch_checked_text", return_value=None
        ):
            with self.assertRaisesRegex(RuntimeError, "Try WEB or KJV.*Paste your own text"):
                app._build_quick_worship_scripture("John 3:16", "esv")

    def test_esv_nlt_without_key_use_copywork_checked_text(self):
        checked = "For God so loved the world, that he gave his only Son."
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value=None), mock.patch(
            "faithsparks.services.scripture_checked.fetch_checked_text", return_value=checked
        ) as fetch_checked:
            item = app._build_quick_worship_scripture("John 3:16", "esv")
        fetch_checked.assert_called_once_with("John 3:16", "esv")
        self.assertEqual(" ".join(item["parts"]["reading"]), checked)
        self.assertEqual(item["version"], "ESV")

    def test_licensed_key_takes_priority_over_checked_text(self):
        with mock.patch("faithsparks.services.scripture.fetch_verse_text", return_value="Licensed text."), mock.patch(
            "faithsparks.services.scripture_checked.fetch_checked_text"
        ) as fetch_checked:
            app._build_quick_worship_scripture("John 3:16", "nlt")
        fetch_checked.assert_not_called()

    def test_picker_matches_copywork_versions(self):
        with mock.patch.dict("os.environ", {"ESV_API_KEY": "", "API_BIBLE_KEY": "", "API_BIBLE_IDS": "", "SCRIPTURE_AI_CHECKED": "1"}):
            self.assertEqual([item["id"] for item in app._worship_scripture_version_options()], ["web", "kjv", "esv", "nlt"])

    def test_picker_hides_esv_nlt_when_checked_path_is_off_and_no_key(self):
        with mock.patch.dict("os.environ", {"ESV_API_KEY": "", "API_BIBLE_KEY": "", "API_BIBLE_IDS": "", "SCRIPTURE_AI_CHECKED": "0"}):
            self.assertEqual(app._worship_scripture_version_options(), [
                {"id": "web", "label": "WEB"},
                {"id": "kjv", "label": "KJV"},
            ])

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


class ScriptureDashTests(unittest.TestCase):
    def test_lookup_reference_normalizes_dashes(self):
        from faithsparks.services.scripture import lookup_reference
        for ref in ("Philippians 4:1–9", "Philippians 4:1—9", "Philippians 4:1 – 9", "Philippians 4:1−9", "Philippians 4:1-9"):
            self.assertEqual(lookup_reference(ref), "Philippians 4:1-9")

    def test_fetch_uses_hyphen_for_en_dash_reference(self):
        from faithsparks.services import scripture
        scripture._cache.clear(); scripture._recent_misses.clear()
        with mock.patch.object(scripture, "_fetch_bible_api", return_value="Text.") as api:
            self.assertEqual(scripture.fetch_verse_text("Philippians 4:1–9", "web"), "Text.")
        api.assert_called_once_with("Philippians 4:1-9", "web")

    def test_checked_path_receives_normalized_reference(self):
        from faithsparks.services import scripture_checked
        with mock.patch.object(scripture_checked, "_cached", return_value="Cached NLT.") as cached:
            self.assertEqual(scripture_checked.fetch_checked_text("Philippians 4:1–9", "nlt"), "Cached NLT.")
        cached.assert_called_once_with("Philippians 4:1-9", "nlt")


class CheckedVerseByVerseTests(unittest.TestCase):
    def test_range_is_split_into_single_verses(self):
        from faithsparks.services import scripture_checked as sc
        self.assertEqual(sc._single_chapter_verses("Philippians 4:6-8"),
                         ["Philippians 4:6", "Philippians 4:7", "Philippians 4:8"])
        self.assertEqual(sc._single_chapter_verses("John 3:16"), [])
        self.assertEqual(sc._single_chapter_verses("Psalm 23"), [])
        self.assertEqual(sc._single_chapter_verses("John 3:16-4:2"), [])
        self.assertEqual(sc._single_chapter_verses("Psalm 119:1-176"), [])  # too long: not split

    def test_range_quotes_each_verse_and_joins(self):
        from faithsparks.services import scripture_checked as sc
        seen = []
        def one(ref, version, code):
            seen.append(ref)
            return f"[{ref}]"
        with mock.patch.object(sc, "_cached", return_value=None), mock.patch.object(sc, "_fetch_one", side_effect=one):
            text = sc.fetch_checked_text("Philippians 4:1–3", "nlt")
        self.assertEqual(seen, ["Philippians 4:1", "Philippians 4:2", "Philippians 4:3"])
        self.assertEqual(text, "[Philippians 4:1] [Philippians 4:2] [Philippians 4:3]")

    def test_one_failed_verse_refuses_the_passage(self):
        from faithsparks.services import scripture_checked as sc
        with mock.patch.object(sc, "_cached", return_value=None), mock.patch.object(
            sc, "_fetch_one", side_effect=["a", None, "c"]
        ):
            self.assertIsNone(sc.fetch_checked_text("Philippians 4:1-3", "nlt"))

    def test_cached_verses_skip_the_ai(self):
        from faithsparks.services import scripture_checked as sc
        cache = {("Philippians 4:1", "nlt"): "one", ("Philippians 4:2", "nlt"): "two"}
        with mock.patch.object(sc, "_cached", side_effect=lambda r, v: cache.get((r, v))), mock.patch.object(
            sc, "_fetch_one"
        ) as fetch_one:
            self.assertEqual(sc.fetch_checked_text("Philippians 4:1-2", "nlt"), "one two")
        fetch_one.assert_not_called()


class CleanQuoteTests(unittest.TestCase):
    def test_keeps_scriptures_own_opening_quote(self):
        from faithsparks.services.scripture_checked import _clean_quote
        self.assertEqual(_clean_quote("“For God so loved the world,"), "“For God so loved the world,")

    def test_removes_quotes_wrapping_the_whole_reply(self):
        from faithsparks.services.scripture_checked import _clean_quote
        self.assertEqual(_clean_quote('"The Lord is my shepherd."'), "The Lord is my shepherd.")
        self.assertEqual(_clean_quote("“The Lord is my shepherd.”"), "The Lord is my shepherd.")

    def test_keeps_inner_quotes_and_strips_verse_number(self):
        from faithsparks.services.scripture_checked import _clean_quote
        self.assertEqual(_clean_quote('16 Jesus said, “Follow me.”'), "Jesus said, “Follow me.”")
        self.assertEqual(_clean_quote('"Jesus said, “Follow me.”"'), "Jesus said, “Follow me.”")
