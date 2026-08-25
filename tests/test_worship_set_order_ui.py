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

    def test_dynamic_video_items_link_to_video_editor(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn("song.type === 'video'", template)
        self.assertIn("'/worship/video/' + encodeURIComponent(id)", template)

    def test_mobile_set_panel_can_shrink_without_horizontal_overflow(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn(".ws-set-panel{position:sticky;top:1rem;align-self:start;min-width:0", template)
        self.assertIn(".ws-set-panel{position:static;order:-1;width:100%;min-width:0", template)
        self.assertIn("overflow-y:visible;box-sizing:border-box", template)
        self.assertIn(".set-item{align-items:flex-start;min-width:0", template)

    def test_scripture_tabs_and_dialogs_have_keyboard_support(self):
        template = (Path(__file__).parents[1] / "templates" / "worship.html").read_text(encoding="utf-8")

        self.assertIn('role="tablist"', template)
        self.assertIn('role="tabpanel"', template)
        self.assertIn("function trapDialogFocus", template)
        self.assertIn("event.key === 'Escape'", template)
        self.assertIn("openModalBackdrop(quickScriptureModal, quickScriptureReference, returnFocus)", template)

    def test_base_template_propagates_worship_scope_to_all_writes(self):
        template = (Path(__file__).parents[1] / "templates" / "base.html").read_text(encoding="utf-8")

        self.assertIn('name="worship-scope"', template)
        self.assertIn('init.headers.set("X-Worship-Scope", worshipScope)', template)
        self.assertIn('scopeInput.name = "worship_scope"', template)


if __name__ == "__main__":
    unittest.main()
