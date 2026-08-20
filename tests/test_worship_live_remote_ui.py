from pathlib import Path
import unittest


class WorshipLiveRemoteUiTests(unittest.TestCase):
    def setUp(self):
        self.template = (
            Path(__file__).parents[1] / "templates" / "worship_live_remote.html"
        ).read_text(encoding="utf-8")

    def test_repeat_chorus_uses_nearest_real_chorus_in_current_item(self):
        self.assertIn("/^chorus\\d*$/.test(partKey(slide))", self.template)
        self.assertIn(
            "for(var j=current;j>=0&&slides[j].id===itemId;j--)",
            self.template,
        )
        self.assertIn("return chorusStart(j)", self.template)
        self.assertIn(
            "for(var k=current+1;k<slides.length&&slides[k].id===itemId;k++)",
            self.template,
        )
        self.assertNotIn("part.indexOf('chorus')", self.template)

    def test_repeat_chorus_rewinds_to_first_slide_of_the_section(self):
        self.assertIn("function chorusStart(index)", self.template)
        self.assertIn("partKey(previous)!==key", self.template)
        self.assertIn("↩ Repeat chorus", self.template)

    def test_next_item_uses_item_boundary_instead_of_song_divider(self):
        self.assertIn("data-smart=\"next-item\"", self.template)
        self.assertIn("if(slides[i].id!==itemId)return i", self.template)
        self.assertIn("'Next: '+(slides[nextItemTarget].title||'item')", self.template)
        self.assertNotIn("kind==='divider')return i", self.template)

    def test_section_buttons_and_jump_history_are_available(self):
        self.assertIn("function sectionTargets()", self.template)
        self.assertIn("className='wr-section-btn'", self.template)
        self.assertIn("jumpHistory.push(current)", self.template)
        self.assertIn("↶ Undo jump", self.template)

    def test_remote_has_distinct_clear_words_and_stage_tools(self):
        self.assertIn('data-action="toggle_clear"', self.template)
        self.assertIn("Private stage message", self.template)
        self.assertIn("Start 5:00", self.template)
        self.assertIn("Start 1:00", self.template)
        self.assertIn("Start 10:00", self.template)
        self.assertIn("Start elapsed", self.template)

    def test_stage_message_enter_key_and_timer_overtime_are_supported(self):
        self.assertIn("event.key==='Enter'", self.template)
        self.assertIn("value<0?'Over ':'Remaining '", self.template)

    def test_remote_keeps_navigation_reachable_and_active_section_centered(self):
        self.assertIn("position:sticky", self.template)
        self.assertIn("activeButton.scrollIntoView", self.template)
        self.assertIn("Number(btn.dataset.duration)||300", self.template)


if __name__ == "__main__":
    unittest.main()
