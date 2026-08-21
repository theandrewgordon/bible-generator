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
                worship_scripture_versions=[{"id": "web", "label": "WEB"}, {"id": "kjv", "label": "KJV"}],
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
        self.assertIn("Help & getting started", html)
        self.assertIn('aria-label="More actions for Abide"', html)
        self.assertIn('class="ws-del is-danger"', html)
        self.assertNotIn(">Not validated</span>", html)

    def test_help_hub_routes_people_to_the_four_primary_guides(self):
        with worship_app.app.test_request_context("/worship/getting-started"):
            html = render_template("worship_getting_started.html")

        self.assertIn("What would you like to do?", html)
        self.assertIn("Import a song", html)
        self.assertIn("Music and chord charts", html)
        self.assertIn("Build and run a Sunday service", html)
        self.assertIn("PowerPoint, PDF, and sermon notes", html)
        self.assertIn("Watch the Worship quick start", html)
        self.assertIn("/static/tutorials/worship-quick-start.mp4", html)
        self.assertIn("/static/tutorials/worship-quick-start.gif", html)
        self.assertIn("Which window goes on the projector?", html)
        self.assertIn("Do I have to save the service before going live?", html)
        self.assertIn("What if the remote disconnects?", html)

    def test_song_import_guide_explains_the_complete_import_flow(self):
        with worship_app.app.test_request_context("/worship/getting-started/song-import"):
            html = render_template("worship_song_import_getting_started.html")

        self.assertIn("Import a song from a webpage", html)
        self.assertIn("Ctrl + A", html)
        self.assertIn("Ctrl + V", html)
        self.assertIn("Import Song", html)
        self.assertIn("Confirm and Save Song", html)
        self.assertIn("does not provide lyric, chord-chart, or performance rights", html)
        self.assertIn("/worship/add#import-with-ai", html)

    def test_getting_started_route_is_registered(self):
        routes = {rule.rule for rule in worship_app.app.url_map.iter_rules()}
        self.assertIn("/worship/getting-started", routes)
        self.assertIn("/worship/getting-started/song-import", routes)
        self.assertIn("/worship/getting-started/music-chord-charts", routes)
        self.assertIn("/worship/getting-started/run-service", routes)
        self.assertIn("/worship/getting-started/presentations", routes)
        self.assertIn("/copyright", routes)

    def test_worship_forms_show_rights_acknowledgments(self):
        with worship_app.app.test_request_context("/worship/add"):
            html = render_template("worship_add.html", conflict_song=None, backgrounds=[])

        self.assertGreaterEqual(html.count('name="rights_confirmed"'), 3)
        self.assertIn("Faith Sparks does not grant lyric or chart rights", html)
        self.assertIn("permission from the photographer", html)

    def test_music_guide_explains_resources_transposition_and_packets(self):
        with worship_app.app.test_request_context("/worship/getting-started/music-chord-charts"):
            html = render_template("worship_music_getting_started.html")

        self.assertIn("Music resources and chord charts", html)
        self.assertIn("Music & chord charts", html)
        self.assertIn("Clean pasted webpage text automatically", html)
        self.assertIn("Ctrl + A, Ctrl + C, Ctrl + V", html)
        self.assertIn("Open / transpose", html)
        self.assertIn("Download PDF", html)
        self.assertIn("Musician packet", html)
        self.assertIn("does not scrape or republish provider libraries", html)

    def test_service_guide_distinguishes_presenter_remote_and_stage_view(self):
        with worship_app.app.test_request_context("/worship/getting-started/run-service"):
            html = render_template("worship_service_getting_started.html")

        self.assertIn("Build and run a Sunday service", html)
        self.assertIn("not required", html)
        self.assertIn("Checklist Complete — Build Deck", html)
        self.assertIn("Presenter", html)
        self.assertIn("Remote", html)
        self.assertIn("Stage View", html)
        self.assertIn("C clear words", html)
        self.assertIn("End session", html)

    def test_presentation_guide_explains_static_import_and_note_review(self):
        with worship_app.app.test_request_context("/worship/getting-started/presentations"):
            html = render_template("worship_presentation_getting_started.html")

        self.assertIn("Import PowerPoint, PDF, and sermon notes", html)
        self.assertIn("faithful static image", html)
        self.assertIn("Speaker notes", html)
        self.assertIn("private, local suggestions", html)
        self.assertIn("small usage charge", html)
        self.assertIn("never appear on screen automatically", html)
        self.assertIn("Save presentation", html)


if __name__ == "__main__":
    unittest.main()
