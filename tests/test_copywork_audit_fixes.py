"""Copywork audit 2026-10-14: privacy, scripture, one-page worksheets."""

import json
import os
import sys
import tempfile
import unittest
import zipfile
from io import BytesIO
from types import SimpleNamespace
from unittest import mock

from pypdf import PdfReader

import app
import build_pdf
import faithsparks.services.usage as usage
import faithsparks.services.users as users
import faithsparks.views.worksheets as ws
from faithsparks.services import scripture

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J316 = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."


def _verse_payload(ref, version):
    return json.dumps({"title": ref, "verse": ref, "version": version, "fullVerse": J316,
                       "traceableVerse": J316, "handwritingLines": 3, "reflectionQuestion": "Q?",
                       "imageIdea": "Stars", "verseSource": "authoritative"})


class CopyworkTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        os.makedirs(os.path.join(self.tmp.name, "output", "thumbs"))
        os.symlink(os.path.join(ROOT, "fonts"), os.path.join(self.tmp.name, "fonts"))
        self.cwd = os.getcwd()
        os.chdir(self.tmp.name)
        self.addCleanup(os.chdir, self.cwd)
        self.db = FakeFirestore()
        self.ai_calls = []

        def fake_verse(ref, version):
            self.ai_calls.append((ref, version))
            return _verse_payload(ref, version)

        for patch in (
            mock.patch.object(ws, "db", self.db),
            mock.patch.object(usage, "db", self.db),
            mock.patch.object(users, "db", self.db),
            mock.patch.object(ws, "request_verse_data", side_effect=fake_verse),
            mock.patch.object(ws, "available_translation_ids", return_value={"kjv", "web"}),
            mock.patch.object(ws, "moderate_text_block", return_value={"flagged": False}),
            mock.patch.object(ws, "upload_to_storage", return_value=None),
            mock.patch.object(ws, "download_from_storage", return_value=False),
            mock.patch.object(app, "google", SimpleNamespace(authorized=True)),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.client = app.app.test_client()

    def sign_in(self, email):
        with self.client.session_transaction() as sess:
            sess.update({"user_email": email, "user_info": {"email": email}, "user_owned_packs": ["-"],
                         app.CSRF_SESSION_KEY: "t"})

    def generate(self, email, **form):
        self.sign_in(email)
        return self.client.post("/generate", data={"csrf_token": "t", **form})

    def files_for(self, email):
        return [d["filename"] for d in self.db.store.get("worksheets", {}).values() if d.get("email") == email]


class PrivacyTests(CopyworkTestCase):
    def test_two_families_custom_worksheets_never_share_a_file(self):
        self.generate("alice@x.com", custom_text="Alice loves Ruby. 12 Oak St.")
        self.generate("bob@x.com", custom_text="Bob prays for Grandma.")
        alice, bob = self.files_for("alice@x.com"), self.files_for("bob@x.com")
        self.assertNotEqual(alice, bob)
        alice_text = PdfReader(os.path.join("output", alice[0])).pages[0].extract_text()
        self.assertIn("Alice loves Ruby", alice_text)
        self.assertNotIn("Bob prays", alice_text)

    def test_bundle_is_per_request_and_removed_after_sending(self):
        response = self.generate("a@x.com", verse="John 3:16, John 3:17", version="kjv")
        self.assertEqual(response.mimetype, "application/zip")
        names = zipfile.ZipFile(BytesIO(response.data)).namelist()
        self.assertEqual(len(names), 2)
        self.assertFalse(os.path.exists(os.path.join("output", "worksheets_bundle.zip")))

    def test_old_shared_custom_worksheets_are_not_served(self):
        self.db.collection("worksheets").add({"email": "a@x.com", "filename": "custom_text_user_submitted_DIY.pdf",
                                               "custom": True, "verse": "Custom", "version": "DIY"})
        open(os.path.join("output", "custom_text_user_submitted_DIY.pdf"), "wb").write(b"%PDF-1.4 someone else")
        self.sign_in("a@x.com")
        response = self.client.get("/download/custom_text_user_submitted_DIY.pdf")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/generate", response.location)

    def test_delete_keeps_shared_verse_file_and_removes_private_custom_file(self):
        open(os.path.join("output", "john_316_KJV.pdf"), "wb").write(b"%PDF")
        open(os.path.join("output", "custom-abc-123_DIY.pdf"), "wb").write(b"%PDF")
        with mock.patch("faithsparks.services.storage.delete_storage_path") as storage_delete:
            ws._delete_owned_worksheet_file("john_316_KJV.pdf", {})
            ws._delete_owned_worksheet_file("custom-abc-123_DIY.pdf", {"custom": True})
        self.assertTrue(os.path.exists(os.path.join("output", "john_316_KJV.pdf")))
        self.assertFalse(os.path.exists(os.path.join("output", "custom-abc-123_DIY.pdf")))
        storage_delete.assert_any_call("worksheets/custom-abc-123_DIY.pdf")


class ScriptureTests(CopyworkTestCase):
    def test_unlicensed_translation_is_refused_before_any_ai_call(self):
        response = self.generate("a@x.com", verse="John 3:16 (NIV)", version="kjv")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.ai_calls, [])
        self.assertEqual(self.files_for("a@x.com"), [])

    def test_api_bible_verse_numbers_are_removed(self):
        html = '<p><span data-number="16" class="v">16</span>For God so loved the world.</p>'
        with mock.patch.object(scripture, "_http_get_json",
                               return_value={"data": {"passages": [{"content": html}]}}), \
                mock.patch.dict(os.environ, {"API_BIBLE_KEY": "k"}):
            text = scripture._clean(scripture._fetch_api_bible("John 3:16", "bible-id"))
        self.assertEqual(text, "For God so loved the world.")


class WorksheetPageTests(CopyworkTestCase):
    PS23 = ("The LORD is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me "
            "beside still waters. He restores my soul. He leads me in paths of righteousness for his name's sake. "
            "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with "
            "me; your rod and your staff, they comfort me.")

    def build(self, **data):
        base = {"title": "T", "verse": "Psalm 23:1-4", "version": "esv", "fullVerse": self.PS23,
                "traceableVerse": self.PS23, "handwritingLines": 5, "reflectionQuestion": "Q", "imageIdea": "Sheep"}
        base.update(data)
        path = os.path.join("output", "t.pdf")
        build_pdf.generate_pdf(base, path)
        return PdfReader(path)

    def test_verse_is_traced_word_for_word_never_trimmed(self):
        phil = ("This letter is from Paul and Timothy, slaves of Christ Jesus. I am writing to all of God's holy "
                "people in Philippi who belong to Christ Jesus, including the church elders and deacons.")
        self.assertEqual(build_pdf._trace_text({"fullVerse": phil, "traceableVerse": "This letter is from Paul"}), phil)
        for lines in (3, 5):  # growing and beginner
            pdf = self.build(version="nlt", fullVerse=phil, traceableVerse=phil, handwritingLines=lines)
            self.assertEqual(len(pdf.pages), 1, lines)

    def test_long_single_verse_still_fits_one_page(self):
        esther = ("Then were the king's scribes called at that time in the third month, that is, the month Sivan, on "
                  "the three and twentieth day thereof; and it was written according to all that Mordecai commanded "
                  "unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from "
                  "India unto Ethiopia, an hundred twenty and seven provinces.")
        self.assertEqual(len(self.build(version="kjv", fullVerse=esther, handwritingLines=3).pages), 1)

    def test_passage_too_long_for_a_page_continues_instead_of_cutting(self):
        passage = self.PS23 + " You prepare a table before me in the presence of my enemies; you anoint my head with oil."
        pdf = self.build(fullVerse=passage, traceableVerse=passage, handwritingLines=5)
        self.assertEqual(len(pdf.pages), 2)
        self.assertIn("continued", pdf.pages[1].extract_text())
        self.assertIn("Crossway", pdf.pages[0].extract_text())

    def test_public_domain_and_custom_need_no_notice(self):
        for version in ("kjv", "DIY"):
            pdf = self.build(version=version, fullVerse="Jesus wept.", traceableVerse="Jesus wept.", handwritingLines=3)
            self.assertEqual(len(pdf.pages), 1)
            self.assertNotIn("Scripture quotations", pdf.pages[0].extract_text())


class GenerateFlowTests(CopyworkTestCase):
    def test_flagged_custom_text_is_blocked(self):
        with mock.patch.object(ws, "moderate_text_block", return_value={"flagged": True, "categories": {}}):
            self.generate("a@x.com", custom_text="something unkind")
        self.assertEqual(self.files_for("a@x.com"), [])

    def test_custom_text_is_capped_to_one_page(self):
        self.generate("a@x.com", custom_text="x" * (ws.MAX_CUSTOM_TEXT_LEN + 1))
        self.assertEqual(self.files_for("a@x.com"), [])

    def test_one_success_in_a_batch_sends_that_worksheet(self):
        def one_fails(ref, version):
            return None if "17" in ref else _verse_payload(ref, version)

        with mock.patch.object(ws, "request_verse_data", side_effect=one_fails):
            response = self.generate("a@x.com", verse="John 3:16, John 3:17", version="kjv")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/pdf")


if __name__ == "__main__":
    unittest.main()
