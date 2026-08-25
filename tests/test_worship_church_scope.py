import unittest
from unittest.mock import patch

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

    def test_stale_scope_guard_accepts_header_and_rejects_mismatch(self):
        with app.app.test_request_context(
            "/worship/set/save",
            method="POST",
            headers={"X-Worship-Scope": "first-church"},
        ):
            with patch.object(app, "_current_worship_scope", return_value="second-church"):
                response, status = app._worship_scope_changed_response()

        self.assertEqual(status, 409)
        self.assertFalse(response.get_json()["ok"])

    def test_church_creation_uses_unique_id_and_atomic_batch(self):
        class _Ref:
            def __init__(self, path):
                self.path = path

            def collection(self, name):
                return _Collection(f"{self.path}/{name}")

        class _Collection:
            def __init__(self, path):
                self.path = path

            def document(self, document_id):
                return _Ref(f"{self.path}/{document_id}")

        class _Batch:
            def __init__(self):
                self.operations = []
                self.committed = False

            def create(self, ref, data):
                self.operations.append(("create", ref.path, data))

            def set(self, ref, data, merge=False):
                self.operations.append(("set", ref.path, data, merge))

            def commit(self):
                self.committed = True

        class _Db:
            def __init__(self):
                self.writes = _Batch()

            def collection(self, name):
                return _Collection(name)

            def batch(self):
                return self.writes

        fake_db = _Db()
        original_db = app.db
        try:
            app.db = fake_db
            with app.app.test_request_context(
                "/worship/church/create",
                method="POST",
                data={"church_name": "Grace Church"},
            ):
                app.session["user_email"] = "owner@example.com"
                with patch.object(app, "_invalidate_worship_cache"):
                    response = app.worship_church_create.__wrapped__()
                selected = app.session["worship_church_id"]
        finally:
            app.db = original_db

        self.assertEqual(response.status_code, 302)
        self.assertRegex(selected, r"^grace-church-[0-9a-f]{12}$")
        self.assertTrue(fake_db.writes.committed)
        self.assertEqual([op[0] for op in fake_db.writes.operations], ["create", "set", "set"])
        self.assertEqual(fake_db.writes.operations[0][1], f"worship_churches/{selected}")
        self.assertEqual(fake_db.writes.operations[1][1], f"worship_churches/{selected}/members/owner@example.com")
        self.assertEqual(fake_db.writes.operations[2][1], "users/owner@example.com")


if __name__ == "__main__":
    unittest.main()
