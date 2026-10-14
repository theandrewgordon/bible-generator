"""Accounts/auth/admin audit 2026-10-14 fixes."""

import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

import app
import faithsparks.views.admin.users as admin_users

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

CHURCHES = app._WORSHIP_CHURCH_COLLECTION


class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore()
        self.google = SimpleNamespace(authorized=True)
        for patch in (
            mock.patch.object(app, "db", self.db),
            mock.patch.object(admin_users, "db", self.db),
            mock.patch.object(app, "google", self.google),
            mock.patch.dict(os.environ, {"ADMIN_EMAILS": "admin@x.com"}),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.client = app.app.test_client()
        church = self.db.collection(CHURCHES).document("grace")
        church.set({"id": "grace", "name": "Grace", "invite_code": "GRACEOLDCODE"})
        church.collection("members").document("pastor@x.com").set({"email": "pastor@x.com", "role": "owner"})
        church.collection("members").document("amy@x.com").set({"email": "amy@x.com", "role": "member"})

    def sign_in(self, email, church="grace"):
        with self.client.session_transaction() as sess:
            sess.clear()
            sess.update({"user_email": email, "user_info": {"email": email}, "user_owned_packs": ["-"],
                         app.CSRF_SESSION_KEY: "t", "worship_church_id": church})

    def post(self, path, **data):
        return self.client.post(path, data={"csrf_token": "t", **data})

    def role(self, email):
        return (self.db.store.get(f"{CHURCHES}/grace/members", {}).get(email) or {}).get("role")


class ChurchTests(AuthTestCase):
    def test_owner_entering_own_code_stays_owner(self):
        self.sign_in("pastor@x.com")
        self.post("/worship/church/join", invite_code="GRACEOLDCODE")
        self.assertEqual(self.role("pastor@x.com"), "owner")

    def test_new_person_joins_as_member(self):
        self.sign_in("new@x.com", church="default")
        self.post("/worship/church/join", invite_code="GRACEOLDCODE")
        self.assertEqual(self.role("new@x.com"), "member")

    def test_owner_can_rotate_invite_code_member_cannot(self):
        self.sign_in("amy@x.com")
        self.assertEqual(self.post("/worship/church/invite/rotate").status_code, 403)
        self.sign_in("pastor@x.com")
        self.post("/worship/church/invite/rotate")
        new_code = self.db.store[CHURCHES]["grace"]["invite_code"]
        self.assertNotEqual(new_code, "GRACEOLDCODE")
        self.sign_in("someone@x.com", church="default")
        self.post("/worship/church/join", invite_code="GRACEOLDCODE")
        self.assertIsNone(self.role("someone@x.com"))

    def test_owner_removes_member_but_not_self(self):
        self.sign_in("pastor@x.com")
        self.post("/worship/church/member/remove", email="amy@x.com")
        self.assertIsNone(self.role("amy@x.com"))
        self.post("/worship/church/member/remove", email="pastor@x.com")
        self.assertEqual(self.role("pastor@x.com"), "owner")


class SessionTests(AuthTestCase):
    def test_get_logout_does_nothing_post_logs_out(self):
        self.sign_in("amy@x.com")
        self.client.get("/logout")
        with self.client.session_transaction() as sess:
            self.assertEqual(sess.get("user_email"), "amy@x.com")
        self.post("/logout")
        with self.client.session_transaction() as sess:
            self.assertIsNone(sess.get("user_email"))

    def test_unverified_google_email_is_not_signed_in(self):
        reply = SimpleNamespace(ok=True, json=lambda: {"email": "admin@x.com", "verified_email": False})
        self.google.get = lambda path: reply
        with self.client.session_transaction() as sess:
            sess.clear()
            sess[app.CSRF_SESSION_KEY] = "t"
        self.client.get("/about")
        with self.client.session_transaction() as sess:
            self.assertIsNone(sess.get("user_email"))

    def test_admin_sign_in_returns_to_the_admin_page(self):
        self.google.authorized = False
        response = self.client.get("/admin/users")
        self.assertIn("next=/admin/users", response.location)

    def test_every_page_refuses_framing_by_other_sites(self):
        with mock.patch.object(app, "APP_ENV", "prod"):
            response = self.client.get("/about", base_url=f"https://{app.PRIMARY_DOMAIN}")
        self.assertEqual(response.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertIn("frame-ancestors 'self'", response.headers.get("Content-Security-Policy", ""))
        self.assertIn("max-age=", response.headers.get("Strict-Transport-Security", ""))


class AdminLogTests(AuthTestCase):
    def test_plan_change_is_logged(self):
        self.sign_in("admin@x.com", church="default")
        self.post("/admin/users/amy@x.com/set_plan", plan="family")
        entries = list(self.db.store.get("admin_log", {}).values())
        self.assertEqual(entries[0]["action"], "set_plan")
        self.assertEqual(entries[0]["by"], "admin@x.com")
        self.assertEqual(entries[0]["target"], "amy@x.com")


if __name__ == "__main__":
    unittest.main()
