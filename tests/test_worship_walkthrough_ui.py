from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "templates" / "worship.html").read_text(encoding="utf-8")


def test_worship_builder_has_reopenable_four_step_quick_tour():
    assert 'id="worship-tour-btn"' in TEMPLATE
    assert 'id="worship-tour"' in TEMPLATE
    assert "WORSHIP_TOUR_SLIDES" in TEMPLATE
    assert "Quick tour · 1 of 4" in TEMPLATE
    assert "faithsparks:worship-quick-tour:v1" in TEMPLATE


def test_walkthrough_covers_core_service_workflow():
    for phrase in (
        "Start in the shared library",
        "Add, reorder, and leave notes",
        "Review every projected slide",
        "Go live, export, or share",
    ):
        assert phrase in TEMPLATE


def test_walkthrough_screenshots_exist_as_real_png_files():
    for number, name in (
        ("01", "plan"),
        ("02", "add"),
        ("03", "review"),
        ("04", "live"),
    ):
        path = ROOT / "static" / "tutorials" / f"worship-tour-{number}-{name}.png"
        assert path.is_file()
        assert path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
