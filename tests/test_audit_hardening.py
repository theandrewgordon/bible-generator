import unittest
from pathlib import Path
from unittest import mock

import app
from faithsparks.views import worksheets


class AuditHardeningTests(unittest.TestCase):
    def test_csrf_query_string_token_is_rejected(self):
        client = app.app.test_client()
        with client.session_transaction() as sess:
            sess["_csrf_token"] = "known-token"

        response = client.post("/downloads?csrf_token=known-token", data={"password": "sparks-esv-print"})

        self.assertEqual(response.status_code, 403)

    def test_delete_worksheet_route_is_post_only(self):
        rule = next(rule for rule in app.app.url_map.iter_rules() if rule.endpoint == "delete_worksheet")

        self.assertIn("POST", rule.methods)
        self.assertNotIn("GET", rule.methods)

    def test_non_admin_cannot_seed_collections(self):
        original_allow = app.os.environ.get("ADMIN_EMAILS")
        app.os.environ["ADMIN_EMAILS"] = "admin@example.com"
        try:
            with app.app.test_request_context("/admin/seed_collections"):
                app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "teacher@example.com"
                response = app.admin_seed_collections()
        finally:
            if original_allow is None:
                app.os.environ.pop("ADMIN_EMAILS", None)
            else:
                app.os.environ["ADMIN_EMAILS"] = original_allow

        self.assertEqual(response, ("Forbidden", 403))

    def test_safe_local_path_rejects_traversal(self):
        self.assertIsNone(worksheets._safe_local_path("output", "../secret.pdf", {".pdf"}))
        self.assertIsNone(worksheets._safe_local_path("output", "safe.txt", {".pdf"}))
        self.assertEqual(worksheets._safe_local_path("output", "safe.pdf", {".pdf"}).name, "safe.pdf")

    def test_download_does_not_serve_unowned_existing_file(self):
        fake_path = mock.Mock(spec=Path)
        fake_path.exists.return_value = True
        fake_path.name = "secret.pdf"
        original_db = worksheets.db
        try:
            worksheets.db = object()
            with app.app.test_request_context("/download/secret.pdf"):
                app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "owner@example.com"
                with mock.patch.object(worksheets, "_safe_local_path", return_value=fake_path), \
                    mock.patch.object(worksheets, "_worksheet_doc_for_user", return_value=None), \
                    mock.patch.object(worksheets, "send_file", side_effect=AssertionError("served unowned file")):
                    response = worksheets.download_file("secret.pdf")
        finally:
            worksheets.db = original_db

        self.assertEqual(response.status_code, 302)


if __name__ == "__main__":
    unittest.main()
