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

    def test_live_requests_include_scope_and_direct_item_fallback(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn("fd.append('worship_scope', WORSHIP_SCOPE)", template)
        self.assertGreaterEqual(template.count("fd.append('song_order', ids.join(','))"), 2)
        self.assertGreaterEqual(template.count("fd.append('song_ids', id)"), 2)

    def test_mobile_link_refresh_is_debounced(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn("clearTimeout(mobileLinkTimer)", template)
        self.assertIn("setTimeout(refreshMobileShare, 180)", template)


if __name__ == "__main__":
    unittest.main()
