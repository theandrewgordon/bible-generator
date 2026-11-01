import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "templates" / "worship.html").read_text(encoding="utf-8")
TOUR_IMAGES = (
    "worship-tour-01-plan.png",
    "worship-tour-05-import.png",
    "worship-tour-06-check.png",
    "worship-tour-02-add.png",
    "worship-tour-03-review.png",
    "worship-tour-04-live.png",
)


def test_worship_builder_has_reopenable_six_step_quick_tour():
    assert 'id="worship-tour-btn"' in TEMPLATE
    assert 'id="worship-tour"' in TEMPLATE
    assert "WORSHIP_TOUR_SLIDES" in TEMPLATE
    assert "Quick tour · 1 of 6" in TEMPLATE
    assert "faithsparks:worship-quick-tour:v1" in TEMPLATE


def test_walkthrough_teaches_adding_a_song_from_scratch_through_going_live():
    for phrase in (
        "Start on Plan Worship",
        "Paste the lyrics",
        "Review the slides, then save",
        "Add items and put them in order",
        "Preview every slide",
        "Go live with three screens",
        "Save service",
    ):
        assert phrase in TEMPLATE


def test_walkthrough_screenshots_are_real_1280x720_pngs_in_tour_order():
    positions = [TEMPLATE.index(name) for name in TOUR_IMAGES[1:]]
    assert positions == sorted(positions)
    for name in TOUR_IMAGES:
        data = (ROOT / "static" / "tutorials" / name).read_bytes()
        assert data.startswith(b"\x89PNG\r\n\x1a\n")
        assert struct.unpack(">II", data[16:24]) == (1280, 720)
