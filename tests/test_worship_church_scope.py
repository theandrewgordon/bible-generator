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


if __name__ == "__main__":
    unittest.main()
