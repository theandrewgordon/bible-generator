import unittest
import json
import os
import tempfile
import zipfile
from pathlib import Path
from unittest import mock

import app
from flask import Response
from werkzeug.exceptions import Forbidden
from faithsparks.views import billing
from faithsparks.views import worksheets
from faithsparks.util.request_utils import is_safe_artifact_url


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

    def test_bundle_paths_are_unique_and_contain_only_requested_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "first.pdf"
            second = Path(tmp) / "second.pdf"
            first.write_bytes(b"first")
            second.write_bytes(b"second")
            paths = [worksheets.update_zip_bundle([str(first), str(second)]) for _ in range(2)]
            try:
                self.assertNotEqual(paths[0], paths[1])
                with zipfile.ZipFile(paths[0]) as archive:
                    self.assertEqual(set(archive.namelist()), {"first.pdf", "second.pdf"})
            finally:
                for path in paths:
                    if path:
                        Path(path).unlink(missing_ok=True)

    def test_download_claim_requires_matching_unlocked_pack(self):
        with app.app.test_request_context("/downloads/claim", method="POST", data={"pack_id": "esv_print"}):
            app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
            app.session["user_email"] = "teacher@example.com"
            response = app.claim_pack()

        self.assertEqual(response.status_code, 302)

    def test_redemption_codes_come_from_environment(self):
        configured = json.dumps({"private-code": "esv_print"})
        with mock.patch.dict(os.environ, {"PACK_REDEMPTION_CODES_JSON": configured}, clear=False):
            self.assertEqual(app.get_pack_by_password("PRIVATE-CODE")["id"], "esv_print")
            self.assertIsNone(app.get_pack_by_password("sparks-esv-print"))

    def test_unconfigured_stripe_price_is_rejected(self):
        original_secret, original_stripe = billing.STRIPE_SECRET_KEY, billing.stripe
        billing.STRIPE_SECRET_KEY = "sk_test"
        billing.stripe = object()
        try:
            with app.app.test_request_context("/create_checkout_session", method="POST", data={"price_id": "price_other"}):
                app.session["user_email"] = "teacher@example.com"
                with mock.patch.object(billing, "resolve_price_id", return_value="price_other"):
                    response = billing.create_checkout_session()
        finally:
            billing.STRIPE_SECRET_KEY, billing.stripe = original_secret, original_stripe

        self.assertEqual(response, ("Invalid price", 400))

    def test_default_worship_library_is_read_only_for_non_admins(self):
        with mock.patch.object(app, "APP_ENV", "production"):
            with app.app.test_request_context("/worship/library/reset", method="POST", data={"confirmation": "DELETE"}):
                app.g.flask_dance_google = type("_FakeGoogle", (), {"authorized": True})()
                app.session["user_email"] = "teacher@example.com"
                app.session["worship_church_id"] = "default"
                with mock.patch.object(app, "is_admin_email", return_value=False):
                    with self.assertRaises(Forbidden):
                        app.worship_library_reset()

    def test_worship_invites_have_128_random_bits(self):
        code = app._make_worship_invite_code("Grace Church")
        self.assertEqual(len(code), 36)
        self.assertEqual(app._normalize_worship_invite_code(code), code)

    def test_security_headers_are_applied(self):
        with app.app.test_request_context("/"):
            response = app.add_correlation_headers(Response("ok"))
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "SAMEORIGIN")
        self.assertIn("frame-ancestors", response.headers["Content-Security-Policy"])

    def test_artifact_redirects_allow_only_app_and_google_storage(self):
        with app.app.test_request_context("/dl/pack/example", base_url="https://faithsparksprintables.com"):
            self.assertTrue(is_safe_artifact_url("https://storage.googleapis.com/bucket/file.zip"))
            self.assertTrue(is_safe_artifact_url("https://faithsparksprintables.com/packs/file.zip"))
            self.assertFalse(is_safe_artifact_url("https://evil.example/faith-sparks.zip"))
            self.assertFalse(is_safe_artifact_url("javascript:alert(1)"))

    def test_oversized_requests_are_rejected(self):
        client = app.app.test_client()
        original_limit = app.app.config["MAX_CONTENT_LENGTH"]
        app.app.config["MAX_CONTENT_LENGTH"] = 128
        try:
            with client.session_transaction() as sess:
                sess["_csrf_token"] = "known-token"
            response = client.post(
                "/downloads",
                data={"csrf_token": "known-token", "password": "x" * 512},
            )
        finally:
            app.app.config["MAX_CONTENT_LENGTH"] = original_limit
        self.assertEqual(response.status_code, 413)

    def test_primary_domain_redirect_preserves_post_method(self):
        with mock.patch.object(app, "APP_ENV", "production"), \
            mock.patch.object(app, "PRIMARY_DOMAIN", "faithsparksprintables.com"):
            with app.app.test_request_context(
                "/stripe/webhook", method="POST", base_url="https://alternate.example"
            ):
                response = app.force_primary_domain()
        self.assertEqual(response.status_code, 308)
        self.assertEqual(response.location, "https://faithsparksprintables.com/stripe/webhook")


if __name__ == "__main__":
    unittest.main()
