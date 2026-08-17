import unittest

import app


class WorshipChurchScopeTests(unittest.TestCase):
    def test_current_worship_scope_uses_selected_church(self):
        with app.app.test_request_context("/worship"):
            app.session["worship_church_id"] = "Grace Church"

            self.assertEqual(app._current_worship_scope(), "grace-church")

    def test_worship_church_routes_exist(self):
        endpoints = {rule.endpoint for rule in app.app.url_map.iter_rules()}

        self.assertIn("worship_church_create", endpoints)
        self.assertIn("worship_church_join", endpoints)
        self.assertIn("worship_church_switch", endpoints)

    def test_default_scope_does_not_require_membership(self):
        original_db = app.db
        try:
            app.db = None
            with app.app.test_request_context("/worship/church/switch", method="POST", data={"church_id": "default"}):
                app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "leader@example.com"
                response = app.worship_church_switch()
                selected = app.session["worship_church_id"]
        finally:
            app.db = original_db

        self.assertEqual(response.status_code, 302)
        self.assertEqual(selected, "default")

    def test_default_worship_library_is_read_only_for_non_admins_in_production(self):
        original_env = app.APP_ENV
        original_db = app.db
        original_admin = app.is_admin_email
        try:
            app.APP_ENV = "production"
            app.db = None
            app.is_admin_email = lambda _email: False
            with app.app.test_request_context("/worship"):
                app.session["user_email"] = "member@example.com"
                self.assertEqual(app._current_worship_role(), "viewer")
                self.assertFalse(app._worship_can_edit())
        finally:
            app.APP_ENV = original_env
            app.db = original_db
            app.is_admin_email = original_admin

    def test_worship_invites_have_128_random_bits(self):
        code = app._make_worship_invite_code("Grace Church")

        self.assertTrue(code.startswith("GRAC"))
        self.assertRegex(code[4:], r"^[A-F0-9]{32}$")

    def test_removed_member_cannot_keep_stale_scope_in_session(self):
        class _UnavailableDb:
            def collection(self, _name):
                raise RuntimeError("unavailable")

        original_db = app.db
        original_access = app._user_can_access_worship_church
        try:
            app.db = _UnavailableDb()
            app._user_can_access_worship_church = lambda _church_id: False
            with app.app.test_request_context("/worship"):
                app.session["user_email"] = "removed@example.com"
                app.session["worship_church_id"] = "grace-church"
                self.assertEqual(app._current_worship_scope(), "default")
                self.assertNotIn("worship_church_id", app.session)
        finally:
            app.db = original_db
            app._user_can_access_worship_church = original_access


if __name__ == "__main__":
    unittest.main()
