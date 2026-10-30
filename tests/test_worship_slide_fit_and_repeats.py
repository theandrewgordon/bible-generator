from pptx import Presentation

import app


def _song(arrangement):
    return app.normalize_worship_song({
        "id": "test-song",
        "title": "Test Song",
        "parts": {
            "verse1": ["Verse line one", "Verse line two"],
            "chorus": ["Chorus line one", "Chorus line two"],
        },
        "arrangement": arrangement,
    })


def test_live_chunks_collapse_adjacent_repeat_into_cue():
    chunks = list(app._iter_worship_lyric_chunks(_song(["verse1", "chorus", "chorus"])))
    assert [chunk["repeat_count"] for _, chunk in chunks] == [1, 2]


def test_pptx_emits_one_slide_per_sung_repeat_with_notes():
    prs = Presentation()
    added = app.add_worship_lyric_slides(prs, _song(["verse1", "chorus", "chorus"]))
    assert added == 3
    notes = [slide.notes_slide.notes_text_frame.text for slide in prs.slides]
    assert notes[0] == "VERSE 1"
    assert notes[1:] == ["CHORUS (1 OF 2)", "CHORUS (2 OF 2)"]


def test_width_uses_real_bold_metrics_wide_vs_narrow():
    # Same character count, very different printed width.
    assert app._lyric_width_units("WWWWWWWWWW") > 2.5 * app._lyric_width_units("iiiiiiiiii")


def test_short_lines_keep_preferred_size_long_caps_shrink():
    assert app._lyric_font_size_for_width(["Amazing grace"], 48) == 48
    long_caps = ["HOLY HOLY HOLY LORD GOD ALMIGHTY WHO WAS"]
    size = app._lyric_font_size_for_width(long_caps, 48)
    assert 32 <= size < 48
    # The chosen size actually fits the ~874pt text area.
    assert app._lyric_width_units(long_caps[0]) * size <= 874


def test_non_latin_text_falls_back_without_error():
    assert app._lyric_width_units("耶稣爱我") > 0


def test_blank_line_in_editor_text_becomes_slide_break():
    lines, breaks = app._part_text_to_lines_and_breaks("\nA\nB\n\n\nC\nD\n\n")
    assert lines == ["A", "B", "C", "D"]
    assert breaks == [2]


def test_normalize_keeps_only_valid_breaks_and_parts_stay_clean():
    song = app.normalize_worship_song({
        "title": "T",
        "parts": {"Chorus": ["A", "B", "C", "D"]},
        "slide_breaks": {"Chorus": [2, 0, 4, 99, "x", 2], "ghost": [1]},
    })
    assert song["parts"]["chorus"] == ["A", "B", "C", "D"]  # no blank lines stored in lyrics
    assert song["slide_breaks"] == {"chorus": [2]}


def test_manual_break_forces_new_slide_in_deck_and_live():
    song = app.normalize_worship_song({
        "title": "T",
        "parts": {"chorus": ["Line one", "Line two", "Line three", "Line four"]},
        "slide_breaks": {"chorus": [1]},
        "arrangement": ["chorus"],
    })
    chunks = [chunk["lines"] for _, chunk in app._iter_worship_lyric_chunks(song)]
    assert chunks == [["Line one"], ["Line two", "Line three", "Line four"]]


def test_song_without_breaks_is_unchanged():
    song = app.normalize_worship_song({
        "title": "T",
        "parts": {"chorus": ["Line one", "Line two", "Line three", "Line four"]},
        "arrangement": ["chorus"],
    })
    assert song["slide_breaks"] == {}
    chunks = [chunk["lines"] for _, chunk in app._iter_worship_lyric_chunks(song)]
    assert chunks == [["Line one", "Line two", "Line three", "Line four"]]


def test_video_times_accept_seconds_or_minutes():
    assert app._parse_video_seconds("90") == 90
    assert app._parse_video_seconds("1:30") == 90
    assert app._parse_video_seconds("1:02:03") == 3723
    assert app._parse_video_seconds("") == 0
    assert app._parse_video_seconds("abc") == 0
    assert app._parse_video_seconds("-5") == 0

