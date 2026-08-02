from pathlib import Path
import unittest


class WorshipSetOrderUiTests(unittest.TestCase):
    def test_dynamic_set_items_are_draggable_and_have_button_fallbacks(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn("li.draggable = true", template)
        self.assertIn("className = 'set-move-up'", template)
        self.assertIn("className = 'set-move-down'", template)
        self.assertIn("function moveSetItem(id, direction)", template)

    def test_reordering_resynchronizes_all_order_consumers(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn("orderInput.value = ids.join(',')", template)
        self.assertIn("lyricOrderInput.value = ids.join(',')", template)
        self.assertIn("document.getElementById('build-form').addEventListener('submit', syncOrder)", template)
        self.assertIn("document.getElementById('lyric-sheet-form').addEventListener('submit', syncOrder)", template)


if __name__ == "__main__":
    unittest.main()
