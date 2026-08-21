import unittest

import app


class WorshipPrivacyHeaderTests(unittest.TestCase):
    def test_all_worship_responses_are_private_and_not_indexed(self):
        with app.app.test_client() as client:
            response = client.get("/worship/mobile?token=invalidinvalidinvalid")

        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(response.headers["X-Robots-Tag"], "noindex, nofollow, noarchive, nosnippet")
        self.assertEqual(response.headers["Pragma"], "no-cache")
        self.assertEqual(response.headers["Expires"], "0")


if __name__ == "__main__":
    unittest.main()
