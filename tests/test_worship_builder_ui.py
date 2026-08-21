import unittest

from flask import render_template

import app as worship_app


class WorshipBuilderUiTests(unittest.TestCase):
    def _render_builder(self):
        song = {
            "id": "abide",
            "title": "Abide",
            "artist": "Aaron Williams",
            "key": "E",
            "type": "song",
            "version": "",
            "parts": {"verse1": ["For my waking breath"]},
            "arrangement": ["verse1"],
            "validation": {"status": "needs_review"},
            "review": {},
            "last_used": "",
        }
        church = {
            "id": "grace",
            "name": "Grace Church",
            "role": "owner",
            "invite_code": "GRACE123",
        }
        with worship_app.app.test_request_context("/worship"):
            return render_template(
                "worship.html",
                songs=[song],
                setlists=[],
                worship_church=church,
                worship_churches=[],
                active_worship_live=None,
            )

    def test_builder_presents_the_primary_sunday_workflow_first(self):
        html = self._render_builder()

        self.assertIn("Plan Worship", html)
        self.assertIn("Add and arrange", html)
        self.assertIn("Review the slides", html)
        self.assertIn("Go live or export", html)
        self.assertIn('id="build-btn"', html)
        self.assertIn(">Review slides</button>", html)
        self.assertIn('id="start-live-btn"', html)
        self.assertIn(">Go live</button>", html)

    def test_secondary_controls_use_progressive_disclosure(self):
        html = self._render_builder()

        self.assertIn("Library tools", html)
        self.assertIn("Saved services", html)
        self.assertIn("Save, share & export", html)
        self.assertIn('aria-label="More actions for Abide"', html)
        self.assertIn('class="ws-del is-danger"', html)
        self.assertNotIn(">Not validated</span>", html)


if __name__ == "__main__":
    unittest.main()
