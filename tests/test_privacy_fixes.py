"""Privacy/kids/legal audit 2026-10-14: pixel scope, account deletion, old Scripture PDFs, legal text."""

import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

import app
import faithsparks.services.account_deletion as deletion
import faithsparks.views.worksheets as ws

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHURCHES = app._WORSHIP_CHURCH_COLLECTION


class Base(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore()
        for patch in (
            mock.patch.object(app, "db", self.db),
            mock.patch.object(deletion, "db", self.db),
            mock.patch.object(ws, "db", self.db),
            mock.patch.object(app, "google", SimpleNamespace(authorized=True)),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.client = app.app.test_client()

    def sign_in(self, email):
        with self.client.session_transaction() as sess:
            sess.update({"user_email": email, "user_info": {"email": email}, "user_owned_packs": ["-"],
                         app.CSRF_SESSION_KEY: "t"})


class PixelTests(Base):
    def test_pixel_only_on_marketing_pages_with_auto_events_off(self):
        with mock.patch.dict(os.environ, {"META_PIXEL_ID": "123"}):
            home = self.client.get("/").get_data(as_text=True)
            self.sign_in("parent@x.com")
            games = self.client.get("/games").get_data(as_text=True)
            generate = self.client.get("/generate").get_data(as_text=True)
        self.assertIn("fbevents.js", home)
        self.assertIn('fbq("set", "autoConfig", false', home)
        self.assertNotIn("fbevents.js", games)
        self.assertNotIn("fbevents.js", generate)
        for endpoint in ("lab_games.index", "weekflow.index", "act_it_out.family_game_night", "worship"):
            self.assertNotIn(endpoint, app.META_PIXEL_ENDPOINTS)


class OldScriptureTests(Base):
    def test_unverified_old_worksheet_is_rebuilt_not_served(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        os.makedirs(os.path.join(tmp.name, "output"))
        cwd = os.getcwd()
        os.chdir(tmp.name)
        self.addCleanup(os.chdir, cwd)
        open("output/john_316_NLT.pdf", "wb").write(b"%PDF old ai text")
        json.dump({"fullVerse": "ai words", "verseSource": "ai"}, open("output/john_316_NLT.json", "w"))
        self.db.collection("worksheets").add({"email": "a@x.com", "filename": "john_316_NLT.pdf",
                                               "verse": "John 3:16", "version": "NLT"})
        self.sign_in("a@x.com")
        with mock.patch.object(ws, "download_from_storage", return_value=False):
            response = self.client.get("/download/john_316_NLT.pdf")
            self.assertEqual(response.status_code, 302)
            self.assertIn("regenerate", response.location)
            json.dump({"fullVerse": "checked", "verseSource": "ai_checked"}, open("output/john_316_NLT.json", "w"))
            response = self.client.get("/download/john_316_NLT.pdf")
        self.assertEqual(response.status_code, 200)


class DeletionTests(Base):
    def seed(self):
        users = self.db.collection("users")
        users.document("mom@x.com").set({"stripeCustomerId": "cus_1", "worshipChurchIds": ["grace", "solo"]})
        users.document("mom@x.com").collection("weekflow").document("state").set({"kids": ["Ruby"]})
        users.document("dad@x.com").set({"plan": "free"})
        self.db.collection("worksheets").add({"email": "mom@x.com", "filename": "custom-abc-1_DIY.pdf", "custom": True})
        self.db.collection("worksheets").add({"email": "dad@x.com", "filename": "john_316_KJV.pdf"})
        self.db.collection("gifts").add({"email": "mom@x.com", "plan": "family"})
        grace = self.db.collection(CHURCHES).document("grace")
        grace.set({"id": "grace"})
        grace.collection("members").document("mom@x.com").set({"email": "mom@x.com", "role": "owner"})
        grace.collection("members").document("amy@x.com").set({"email": "amy@x.com", "role": "member"})
        solo = self.db.collection(CHURCHES).document("solo")
        solo.set({"id": "solo"})
        solo.collection("members").document("mom@x.com").set({"email": "mom@x.com", "role": "owner"})

    def test_deletes_everything_hands_over_churches_and_cancels_stripe(self):
        self.seed()
        with mock.patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test"}), \
                mock.patch("stripe.Customer.delete") as stripe_delete, \
                mock.patch.object(ws, "_delete_owned_worksheet_file") as file_delete, \
                mock.patch.object(app, "_delete_worship_church_workspace") as church_delete:
            deletion.delete_user_data("mom@x.com", by="mom@x.com")
        stripe_delete.assert_called_once_with("cus_1")
        file_delete.assert_called_once()
        church_delete.assert_called_once_with("solo")
        store = self.db.store
        self.assertNotIn("mom@x.com", store.get("users", {}))
        self.assertFalse(store.get("users/mom@x.com/weekflow"))
        self.assertIn("dad@x.com", store["users"])
        self.assertEqual([d["email"] for d in store["worksheets"].values()], ["dad@x.com"])
        self.assertEqual(store[f"{CHURCHES}/grace/members"]["amy@x.com"]["role"], "owner")
        self.assertNotIn("mom@x.com", store[f"{CHURCHES}/grace/members"])
        self.assertTrue(next(iter(store["gifts"].values()))["email"].startswith("deleted:"))

    def test_stripe_failure_deletes_nothing(self):
        self.seed()
        with mock.patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test"}), \
                mock.patch("stripe.Customer.delete", side_effect=RuntimeError("down")):
            with self.assertRaises(deletion.AccountDeletionError):
                deletion.delete_user_data("mom@x.com")
        self.assertIn("mom@x.com", self.db.store["users"])

    def test_self_serve_delete_needs_typed_email(self):
        self.sign_in("mom@x.com")
        with mock.patch.object(app, "delete_user_data") as delete:
            self.client.post("/account/delete", data={"csrf_token": "t", "confirm_email": "wrong@x.com"})
            delete.assert_not_called()
            self.client.post("/account/delete", data={"csrf_token": "t", "confirm_email": "Mom@x.com"})
        delete.assert_called_once_with("mom@x.com", by="mom@x.com")
        with self.client.session_transaction() as sess:
            self.assertIsNone(sess.get("user_email"))


class LegalTextTests(Base):
    def test_terms_name_the_state_and_plus_discloses_renewal(self):
        with mock.patch.dict(os.environ, {"LEGAL_STATE": "Example"}):
            terms = self.client.get("/terms").get_data(as_text=True)
        self.assertIn("the State of Example", terms)
        self.assertIn("18 or older", terms)
        self.assertIn("renew automatically", self.client.get("/plus").get_data(as_text=True))
        self.assertIn("Delete your account", self.client.get("/privacy").get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
