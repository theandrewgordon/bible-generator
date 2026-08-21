import unittest

import app
from faithsparks.pdf_notices import scripture_notice_texts


class LegalAndAttributionTests(unittest.TestCase):
    def test_public_legal_pages_are_available(self):
        client = app.app.test_client()
        for path, phrase in (("/terms", "Your content and permissions"), ("/privacy", "Information we handle")):
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(phrase.encode(), response.data)

    def test_scripture_notice_texts_only_returns_supported_versions(self):
        notices = scripture_notice_texts(["NIV", "web", "ESV", "WEB"])
        self.assertEqual([code for code, _ in notices], ["WEB", "ESV"])
        self.assertIn("World English Bible", notices[0][1])
        self.assertIn("Crossway", notices[1][1])

    def test_default_church_workspace_cannot_be_deleted(self):
        with self.assertRaisesRegex(ValueError, "default library"):
            app._delete_worship_church_workspace("default")


if __name__ == "__main__":
    unittest.main()
