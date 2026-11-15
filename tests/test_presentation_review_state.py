"""Exercise presentation POST state handling without external service dependencies."""
import ast
import copy
import os
from pathlib import Path
import re
from types import SimpleNamespace
import unittest


class Form(dict):
    def getlist(self, key):
        value = self.get(key, [])
        return value if isinstance(value, list) else [value]


class PresentationReviewStateTests(unittest.TestCase):
    def run_post(self, action):
        # Execute the actual route body, substituting only its Flask/service boundary.
        tree = ast.parse((Path(__file__).parents[1] / "app.py").read_text())
        route = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "worship_presentation_edit")
        route.decorator_list = []
        module = ast.Module(body=[route], type_ignores=[])
        item = {"type": "presentation", "title": "Old", "presentation_slides": [{"id": "a"}, {"id": "b"}], "highlight_suggestions": [{"id": "old", "text": "Old point", "enabled": True}]}
        saved = []
        scope = {
            "request": SimpleNamespace(method="POST", form=Form(action=action, title="Sunday", sermon_notes="New notes", slide_order="b,a", visible_slides=["b"], enabled_highlights=["old"], highlight_text_old="Edited point", highlight_position="before")),
            "get_worship_song": lambda _: copy.deepcopy(item), "normalize_worship_song": copy.deepcopy,
            "_WORSHIP_PRESENTATION_TYPE": "presentation", "MAX_SERMON_NOTES_CHARS": 60000,
            "_worship_notes_highlight_api_key": lambda *_: "", "_boolish": bool,
            "suggest_sermon_highlights": lambda *args, **kwargs: ["New point"],
            "save_worship_song": lambda value: saved.append(copy.deepcopy(value)),
            "_worship_timestamp": lambda: "now", "session": {"user_email": "editor@example.test"},
            "flash": lambda *args: None, "redirect": lambda url: url, "url_for": lambda *args, **kwargs: "/review", "re": re, "os": os,
        }
        exec(compile(module, "presentation-review-route", "exec"), scope)
        scope["worship_presentation_edit"]("deck")
        return saved[0]

    def test_reanalysis_preserves_form_choices_and_requires_review_of_new_points(self):
        result = self.run_post("reanalyze")
        self.assertEqual([slide["id"] for slide in result["presentation_slides"]], ["b", "a"])
        self.assertEqual([slide["hidden"] for slide in result["presentation_slides"]], [False, True])
        self.assertEqual(result["title"], "Sunday")
        self.assertEqual(result["sermon_notes"], "New notes")
        self.assertEqual(result["highlight_position"], "before")
        self.assertEqual(result["highlight_suggestions"], [{"id": "highlight-1", "text": "New point", "enabled": False}])

    def test_normal_save_keeps_explicit_key_point_selection(self):
        result = self.run_post("save")
        self.assertEqual(result["highlight_suggestions"], [{"id": "old", "text": "Edited point", "enabled": True}])
        self.assertEqual([slide["id"] for slide in result["presentation_slides"]], ["b", "a"])


if __name__ == "__main__":
    unittest.main()
