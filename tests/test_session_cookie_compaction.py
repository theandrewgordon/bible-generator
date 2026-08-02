import hashlib
import unittest

from flask import session

import app


class SessionCookieCompactionTests(unittest.TestCase):
    def test_compaction_preserves_auth_csrf_and_purchase_state(self):
        noisy_values = [hashlib.sha256(str(index).encode()).hexdigest() for index in range(200)]
        with app.app.test_request_context("/"):
            session["user_email"] = "member@example.com"
            session["user_info"] = {"email": "member@example.com", "name": "Member"}
            session[app.CSRF_SESSION_KEY] = "csrf-value"
            session["user_owned_packs"] = ["pack-one"]
            session["pending_worship_import"] = {"token": "keep-me"}
            session["family_game_night_recent_prompt_ids"] = noisy_values

            before, after, removed = app._compact_cookie_session()

            self.assertGreater(before, app._COOKIE_SESSION_SOFT_LIMIT)
            self.assertLess(after, before)
            self.assertIn("family_game_night_recent_prompt_ids", removed)
            self.assertEqual(session["user_email"], "member@example.com")
            self.assertEqual(session[app.CSRF_SESSION_KEY], "csrf-value")
            self.assertEqual(session["user_owned_packs"], ["pack-one"])
            self.assertEqual(session["pending_worship_import"], {"token": "keep-me"})


if __name__ == "__main__":
    unittest.main()
