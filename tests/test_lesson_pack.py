import json
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest import mock

import pytest
from pypdf import PdfReader
from reportlab.pdfgen import canvas

import build_games
import build_pdf
from app import app as flask_app
from faithsparks.pdf_notices import append_scripture_notices_page
from faithsparks.services import illustrate, lesson_pack
from faithsparks.services.lesson_pack import (
    _build_parent_guide,
    _lesson_pack_age_profile,
    _lesson_pack_slug,
    _merge_pdf_files,
    _pick_pack_words,
    _write_parent_guide_pdf,
)
from faithsparks.views import public


def _minimal_pdf(path: Path, text: str = "Verified page") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path))
    pdf.drawString(72, 720, text)
    pdf.save()


def _install_pack_fakes(monkeypatch, tmp_path: Path, *, coloring: bool = True) -> dict:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(lesson_pack, "LESSON_PACK_OUTPUT_DIR", Path("lesson-packs"))
    monkeypatch.setattr(lesson_pack, "db", None)
    captured = {}

    def fake_worksheet(data, path, use_cursive=False):
        captured["worksheet"] = {"data": data, "use_cursive": use_cursive}
        _minimal_pdf(Path(path), "Worksheet")

    def fake_word_search(**kwargs):
        captured["word_search"] = kwargs
        _minimal_pdf(Path(kwargs["pdf_path"]), "Word search")

    def fake_coloring(**kwargs):
        captured["coloring"] = kwargs
        if not coloring:
            raise RuntimeError("image service unavailable")
        _minimal_pdf(Path("output/coloring.pdf"), "Coloring")
        Path("worksheets").mkdir(parents=True, exist_ok=True)
        Path("worksheets/coloring.png").write_bytes(b"png")
        return {"pdf_filename": "coloring.pdf", "png_filename": "coloring.png"}

    monkeypatch.setattr(build_pdf, "generate_pdf", fake_worksheet)
    monkeypatch.setattr(build_games, "generate_word_search_pdf", fake_word_search)
    monkeypatch.setattr(illustrate, "create_coloring_sheet", fake_coloring)
    return captured


def test_pick_pack_words_prefers_meaningful_terms():
    words = _pick_pack_words(
        "God's Love Lesson Pack",
        "For God so loved the world that he gave his one and only Son.",
        "This verse shows God's love and generous gift."
    )

    assert "LOVE" in words
    assert "GAVE" in words or "GOD" in words
    assert len(words) >= 6


def test_parent_guide_includes_key_pack_details():
    guide = _build_parent_guide(
        title="God's Love Lesson Pack",
        verse="John 3:16",
        version="nlt",
        meaning="God loved the world and gave Jesus.",
        age_bracket="6-8",
        theme_label="God's Love",
        words=["LOVE", "WORLD", "GIVE", "JESUS"],
    )

    assert "John 3:16" in guide
    assert "Worksheet focus: Ages 6-8" in guide
    assert "All-age gathering plan" in guide
    assert "Leader note" in guide
    assert "LOVE" in guide
    assert "Hands-on connection" in guide
    assert "Prayer prompt" in guide


def test_age_profiles_materially_change_printables():
    youngest = _lesson_pack_age_profile("3-5")
    oldest = _lesson_pack_age_profile("10+")

    assert youngest["handwriting_lines"] > oldest["handwriting_lines"]
    assert youngest["word_search_size"] < oldest["word_search_size"]
    assert youngest["word_search_directions"] == [(1, 0), (0, 1)]
    assert oldest["reflection"] != youngest["reflection"]


def test_coloring_blueprint_has_explicit_ten_plus_complexity():
    blueprint, _ = illustrate.build_scene_blueprint(
        {"sensitivity": {}},
        age_bracket="10+",
        user_symbols_only=True,
        allow_historical_props=False,
    )

    assert blueprint["composition"] == {"foreground_max": 6, "background_max": 3}


def test_variant_slug_is_unique_for_age_and_handwriting_style():
    values = {
        _lesson_pack_slug("Love Lesson Pack", "John 3:16", "web", age, cursive)
        for age in ("3-5", "6-8", "9-10", "10+")
        for cursive in (False, True)
    }

    assert len(values) == 8
    assert all(len(value) < 150 for value in values)
    assert any("ages-10-plus-cursive" in value for value in values)


def test_parent_guide_pdf_is_substantive_and_readable(tmp_path):
    output = tmp_path / "parent-guide.pdf"
    _write_parent_guide_pdf(
        output,
        title="Faithful Love Lesson Pack",
        verse="John 3:16",
        version="web",
        meaning="God shows faithful love by giving his Son.",
        age_bracket="9-10",
        theme_label="Faithful Love",
        words=["FAITHFUL", "LOVE", "WORLD", "GIVING", "TRUST"],
    )

    reader = PdfReader(str(output))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert reader.pages
    assert "All-age gathering plan" in text
    assert "Make room for every age" in text
    assert "Conversation starters" in text
    assert "Memory help" in text
    assert "Prayer prompt" in text


def test_complete_pack_has_verified_manifest_and_variant_settings(monkeypatch, tmp_path):
    captured = _install_pack_fakes(monkeypatch, tmp_path)
    profile = _lesson_pack_age_profile("3-5")

    result = lesson_pack._build_lesson_pack_artifacts(
        user_email="parent@example.com",
        normalized={
            "verse": "John 3:16", "version": "web", "title": "John 3:16",
            "fullVerse": "For God so loved the world.",
        },
        age_bracket="3-5",
        use_cursive=True,
        profile=profile,
        cache_key="john-3-16-web-3-5-cursive",
        include_coloring=True,
    )

    assert result["status"] == "complete"
    assert all(result["components"].values())
    assert "ages-3-5-cursive" in result["slug"]
    assert captured["worksheet"]["data"]["handwritingLines"] == 5
    assert captured["worksheet"]["use_cursive"] is True
    assert captured["word_search"]["size"] == 8
    assert captured["word_search"]["allowed_directions"] == [(1, 0), (0, 1)]

    manifest = json.loads(Path(result["manifest_json"]).read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == 3
    assert manifest["scriptureVerified"] is True
    assert manifest["components"]["coloring"] is True
    with zipfile.ZipFile(result["zip_path"]) as archive:
        names = archive.namelist()
    assert Path(result["manifest_json"]).name in names
    assert Path(result["combined_pdf"]).name in names


def test_partial_pack_is_truthful_when_coloring_fails(monkeypatch, tmp_path):
    _install_pack_fakes(monkeypatch, tmp_path, coloring=False)
    result = lesson_pack._build_lesson_pack_artifacts(
        user_email="parent@example.com",
        normalized={
            "verse": "Psalm 23:1", "version": "kjv", "title": "Psalm 23:1",
            "fullVerse": "The Lord is my shepherd; I shall not want.",
        },
        age_bracket="6-8",
        use_cursive=False,
        profile=_lesson_pack_age_profile("6-8"),
        cache_key="psalm-23-1-kjv-6-8-print",
        include_coloring=True,
    )

    assert result["status"] == "partial"
    assert result["components"]["coloring"] is False
    assert result["components"]["combined_pdf"] is True
    assert result["warnings"]
    manifest = json.loads(Path(result["manifest_json"]).read_text(encoding="utf-8"))
    assert manifest["status"] == "partial"
    assert not lesson_pack._cached_lesson_pack_has_artifact(result)


def test_quick_pack_skips_slow_coloring_but_is_complete(monkeypatch, tmp_path):
    captured = _install_pack_fakes(monkeypatch, tmp_path)
    result = lesson_pack._build_lesson_pack_artifacts(
        user_email="leader@example.com",
        normalized={
            "verse": "Acts 2:42", "version": "web", "title": "Acts 2:42",
            "fullVerse": "They continued steadfastly in the apostles' teaching and fellowship.",
        },
        age_bracket="6-8",
        use_cursive=False,
        profile=_lesson_pack_age_profile("6-8"),
        cache_key="quick-pack",
        lesson_mode="house-church",
        session_minutes=40,
        include_coloring=False,
    )

    assert result["status"] == "complete"
    assert result["components"]["coloring"] is False
    assert "coloring" not in captured
    assert result["include_coloring"] is False
    assert result["lesson_mode"] == "house-church"


def test_create_fails_closed_when_scripture_cannot_be_verified():
    with (
        mock.patch.object(lesson_pack, "fetch_verse_text", return_value=None),
        mock.patch.object(lesson_pack, "_build_lesson_pack_artifacts") as builder,
    ):
        with pytest.raises(ValueError, match="couldn’t load that passage"):
            lesson_pack.create_lesson_pack(
                user_email="leader@example.com", verse_input="John 3:16", version="web"
            )
    builder.assert_not_called()


def test_combined_pdf_has_one_consolidated_scripture_notice(tmp_path):
    sources = []
    for index in range(2):
        source = tmp_path / f"source-{index}.pdf"
        doc = canvas.Canvas(str(source))
        doc.drawString(72, 720, f"Printable {index + 1}")
        append_scripture_notices_page(doc, versions_used=["WEB"])
        doc.save()
        sources.append(source)

    output = tmp_path / "combined.pdf"
    assert _merge_pdf_files(output, sources, required_paths=sources, notice_versions=["WEB"])
    reader = PdfReader(str(output))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert text.count("Scripture Attribution & Permissions") == 1
    assert len(reader.pages) == 3


def test_cloud_pack_is_not_recorded_when_verified_upload_fails(monkeypatch, tmp_path):
    _install_pack_fakes(monkeypatch, tmp_path)
    monkeypatch.setattr(lesson_pack, "db", object())
    monkeypatch.setattr(lesson_pack, "_upload_pack_artifacts", lambda _items: False)
    record = mock.Mock()
    monkeypatch.setattr(lesson_pack, "_record_user_lesson_pack", record)

    with pytest.raises(RuntimeError, match="saved reliably"):
        lesson_pack._build_lesson_pack_artifacts(
            user_email="leader@example.com",
            normalized={
                "verse": "Acts 2:42", "version": "web", "title": "Acts 2:42",
                "fullVerse": "They continued steadfastly in the apostles' teaching and fellowship.",
            },
            age_bracket="6-8",
            use_cursive=False,
            profile=_lesson_pack_age_profile("6-8"),
            cache_key="upload-failure",
        )
    record.assert_not_called()


def test_merge_rejects_a_missing_required_pdf(tmp_path):
    worksheet = tmp_path / "worksheet.pdf"
    missing = tmp_path / "missing.pdf"
    _minimal_pdf(worksheet)

    assert not _merge_pdf_files(
        tmp_path / "combined.pdf", [worksheet, missing], required_paths=[worksheet, missing]
    )
    assert not (tmp_path / "combined.pdf").exists()


def test_create_rejects_unsupported_options_before_external_lookup():
    with mock.patch.object(lesson_pack, "fetch_verse_text") as lookup:
        with pytest.raises(ValueError, match="supported Bible version"):
            lesson_pack.create_lesson_pack(
                user_email="parent@example.com", verse_input="John 3:16", version="made-up"
            )
        with pytest.raises(ValueError, match="supported age range"):
            lesson_pack.create_lesson_pack(
                user_email="parent@example.com", verse_input="John 3:16", age_bracket="adult"
            )
    lookup.assert_not_called()


def test_only_configured_authoritative_versions_are_offered(monkeypatch):
    monkeypatch.delenv("ESV_API_KEY", raising=False)
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.delenv("API_BIBLE_IDS", raising=False)
    assert lesson_pack.available_lesson_pack_versions() == {"kjv", "web"}

    monkeypatch.setenv("ESV_API_KEY", "configured")
    monkeypatch.setenv("API_BIBLE_KEY", "configured")
    monkeypatch.setenv("API_BIBLE_IDS", "nlt:nlt-id")
    assert lesson_pack.available_lesson_pack_versions() == {"kjv", "web", "esv", "nlt"}


def test_ownership_falls_back_to_signed_session_when_database_fails():
    class BrokenDb:
        def collection(self, _name):
            raise RuntimeError("database unavailable")

    with flask_app.test_request_context("/lesson-pack/result/test-pack"):
        public.session["user_email"] = "parent@example.com"
        public.session["owned_lesson_pack_slugs"] = ["test-pack"]
        with mock.patch.object(public, "db", BrokenDb()):
            assert public._owned_lesson_pack("test-pack") == {"slug": "test-pack"}


def test_anonymous_build_preserves_choices_through_sign_in():
    client = flask_app.test_client()
    with client.session_transaction() as session:
        session["_csrf_token"] = "lesson-pack-csrf"
    with mock.patch.object(public, "_is_signed_in", return_value=False):
        response = client.post(
            "/lesson-pack",
            data={
                "csrf_token": "lesson-pack-csrf", "verse": "John 3:16", "version": "kjv",
                "age_bracket": "9-10", "use_cursive": "on",
            },
        )

    assert response.status_code == 302
    login_query = parse_qs(urlparse(response.location).query)
    next_url = login_query["next"][0]
    preserved = parse_qs(urlparse(next_url).query)
    assert preserved == {
        "verse": ["John 3:16"], "version": ["kjv"], "age": ["9-10"], "cursive": ["1"],
        "mode": ["house-church"], "minutes": ["40"],
    }


def test_result_details_use_manifest_not_zip_size(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    slug = "test-pack"
    pack_dir = Path("output/lesson_packs") / slug
    pack_dir.mkdir(parents=True)
    (pack_dir / f"{slug}-manifest.json").write_text(json.dumps({
        "status": "partial",
        "components": {"worksheet": True, "coloring": False, "word_search": True, "parent_guide": True},
        "warnings": ["Coloring unavailable"],
    }), encoding="utf-8")
    (pack_dir / f"{slug}.zip").write_bytes(b"x" * 100_000)

    details = public._lesson_pack_result_details({"slug": slug}, slug)
    assert details["status"] == "partial"
    assert details["components"]["coloring"] is False
    assert details["warnings"] == ["Coloring unavailable"]


@pytest.mark.parametrize(
    ("status", "coloring_ready", "format_name", "expected_copy"),
    [
        ("complete", True, "PDF", "Every requested piece passed its file checks."),
        ("partial", False, "ZIP", "Your core pack is ready."),
    ],
)
def test_result_page_reports_actual_pack_state(
    status, coloring_ready, format_name, expected_copy
):
    owned = {
        "slug": "john-3-16-pack",
        "title": "God's Love Lesson Pack",
        "verse": "John 3:16",
        "version": "KJV",
        "age_bracket": "9-10",
        "use_cursive": True,
    }
    details = {
        "status": status,
        "components": {
            "worksheet": True,
            "coloring": coloring_ready,
            "word_search": True,
            "parent_guide": True,
            "combined_pdf": format_name == "PDF",
        },
        "warnings": [] if coloring_ready else ["The coloring page could not be created this time."],
        "download_format": format_name,
        "lesson_mode": "house-church",
        "session_minutes": 40,
        "include_coloring": True,
        "scripture_verified": True,
        "mode_label": "House Church",
    }
    client = flask_app.test_client()
    with (
        mock.patch.object(public, "_is_signed_in", return_value=True),
        mock.patch.object(public, "_owned_lesson_pack", return_value=owned),
        mock.patch.object(public, "_lesson_pack_artifact_available", return_value=True),
        mock.patch.object(public, "_lesson_pack_result_details", return_value=details),
    ):
        response = client.get("/lesson-pack/result/john-3-16-pack")

    assert response.status_code == 200
    page = response.get_data(as_text=True)
    assert expected_copy in page
    assert f"Download pack ({format_name})" in page
    assert "age=9-10" in page
    assert "cursive=1" in page
    assert ("Unavailable in this build" in page) is (not coloring_ready)
    assert response.headers["Cache-Control"] == "private, no-store"
    assert "noindex" in response.headers["X-Robots-Tag"]
    assert '<meta name="robots" content="noindex,follow"' in page


def test_default_builder_is_house_church_first_and_quick():
    client = flask_app.test_client()
    with mock.patch.object(public, "_is_signed_in", return_value=False):
        response = client.get("/lesson-pack?verse=Acts+2%3A42")

    page = response.get_data(as_text=True)
    assert response.status_code == 200
    assert 'value="house-church" selected' in page
    assert 'value="40" selected' in page
    assert 'name="include_coloring" data-coloring-check  />' in page
    assert "Build quick gathering pack" not in page
    assert "Sign in to build" in page


def test_templates_have_progress_and_no_forced_download():
    root = Path(__file__).parents[1]
    builder = (root / "templates/lesson_pack.html").read_text(encoding="utf-8")
    result = (root / "templates/lesson_pack_result.html").read_text(encoding="utf-8")

    assert "lesson-pack-progress" in builder
    assert "Saving your choices for sign in" in builder
    assert "submit.disabled=true" in builder
    assert "window.setInterval" not in result
    assert "Download pack ({{ download_format }})" in result
