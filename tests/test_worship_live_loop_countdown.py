from unittest import mock

import pytest

import app


def _deck():
    slides = [
        {"kind": "service", "type": "welcome", "lines": ["Welcome"]},
        {"kind": "service", "type": "announcement", "lines": ["Potluck"]},
        {"kind": "service", "type": "announcement", "lines": ["Baptism"]},
        {"kind": "divider", "title": "Song"},
        {"kind": "lyric", "lines": ["Verse"]},
        {"kind": "service", "type": "scripture", "lines": ["Reading"]},
    ]
    return {"slides": slides, "slide_count": len(slides), "current_index": 4, "revision": 3}


def test_loop_start_cycles_only_announcement_slides():
    with mock.patch.object(app.time, "time", return_value=1000.0):
        state = app._next_worship_live_state(_deck(), "loop_start", duration=8)
    assert state["loop_indices"] == [0, 1, 2]  # not the song, not Scripture
    assert state["loop_seconds"] == 8 and state["current_index"] == 0
    assert app._worship_loop_slide(state, now=1000.0) == 0
    assert app._worship_loop_slide(state, now=1009.0) == 1
    assert app._worship_loop_slide(state, now=1017.0) == 2
    assert app._worship_loop_slide(state, now=1025.0) == 0  # wraps around


def test_loop_needs_two_announcements():
    deck = _deck()
    deck["slides"] = deck["slides"][2:]
    with pytest.raises(ValueError, match="at least two"):
        app._next_worship_live_state(deck, "loop_start", duration=8)


def test_loop_seconds_are_clamped():
    assert app._next_worship_live_state(_deck(), "loop_start", duration=1)["loop_seconds"] == 3
    assert app._next_worship_live_state(_deck(), "loop_start", duration=999)["loop_seconds"] == 120


def test_next_takes_over_from_the_slide_people_see():
    with mock.patch.object(app.time, "time", return_value=1000.0):
        looping = app._next_worship_live_state(_deck(), "loop_start", duration=8)
    with mock.patch.object(app.time, "time", return_value=1010.0):  # loop showing slide 1
        after = app._next_worship_live_state(looping, "next")
    assert after["current_index"] == 2
    assert after["loop_seconds"] == 0 and after["loop_indices"] == []


def test_stop_loop_keeps_current_announcement():
    with mock.patch.object(app.time, "time", return_value=1000.0):
        looping = app._next_worship_live_state(_deck(), "loop_start", duration=8)
    with mock.patch.object(app.time, "time", return_value=1017.0):  # slide 2
        stopped = app._next_worship_live_state(looping, "loop_stop")
    assert stopped["current_index"] == 2 and stopped["loop_seconds"] == 0


def test_blank_does_not_stop_the_loop():
    looping = app._next_worship_live_state(_deck(), "loop_start", duration=8)
    blanked = app._next_worship_live_state(looping, "toggle_blank")
    assert blanked["blank"] is True and blanked["loop_seconds"] == 8


def test_audience_sees_timer_only_when_leader_shows_it():
    state = app._next_worship_live_state(_deck(), "timer_countdown", duration=300)
    assert "stage_timer_mode" not in app._public_worship_live_state(state)
    shown = app._next_worship_live_state(state, "toggle_audience_timer")
    public = app._public_worship_live_state(shown)
    assert public["audience_timer"] is True
    assert public["stage_timer_mode"] == "countdown" and public["stage_timer_duration"] == 300
    assert "stage_message" not in public  # private stage message never reaches the audience


def test_new_fields_are_persisted_and_loop_reads_slides():
    assert {"audience_timer", "loop_seconds", "loop_started_epoch", "loop_indices"} <= set(app._WORSHIP_LIVE_STATE_FIELDS)
    state = app._next_worship_live_state(_deck(), "loop_start", duration=8)
    written = app._worship_live_state_write(state)
    assert written["loop_indices"] == [0, 1, 2] and written["loop_seconds"] == 8


def test_screens_include_loop_and_countdown_hooks():
    from pathlib import Path
    root = Path(app.__file__).parent / "templates"
    presenter = (root / "worship_live_presenter.html").read_text()
    remote = (root / "worship_live_remote.html").read_text()
    assert 'id="wl-countdown"' in presenter and "applyExtras(data)" in presenter
    assert 'id="wr-loop"' in remote and 'id="wr-audience-timer"' in remote
    assert "loop_start" in remote and "toggle_audience_timer" in remote
    assert "loopIndices" in (root / "worship_live_stage.html").read_text()
    assert "followLoop" in (root / "worship_live_follow.html").read_text()
