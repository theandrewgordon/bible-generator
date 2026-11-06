"""Private printable card-set builder: access, editions, and PDF labeling."""

import io
import json

import pytest
from pypdf import PdfReader

import app as app_module
from app import CSRF_SESSION_KEY, app
from faithsparks.services import printable_products as products
from faithsparks.services.printable_pdf import LOGO_PATH, render_product_pdf
from faithsparks.services.printable_products import (
    export_errors,
    fill_empty_full_verses,
    load_advent_draft,
    reference_line,
)
from tests.fake_firestore import FakeFirestore


class _Google:
    """Signed in only when the test session already has an email."""

    @property
    def authorized(self):
        from flask import has_request_context, session
        return bool(has_request_context() and session.get("user_email"))

    def get(self, *_args, **_kwargs):
        raise AssertionError("printable builder tests should not call Google userinfo")


@pytest.fixture()
def client(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(products, "db", fake)
    monkeypatch.setattr(app_module, "google", _Google())
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    app.config.update(TESTING=True)
    test_client = app.test_client()
    return fake, test_client


def _sign_in(test_client, email):
    with test_client.session_transaction() as sess:
        sess.clear()
        sess.update({
            "user_email": email,
            "user_info": {"email": email},
            "user_owned_packs": ["-"],
            CSRF_SESSION_KEY: "t",
        })


def _card(product, reference):
    return next(card for card in product["cards"] if card["reference"] == reference)


def test_advent_draft_keeps_web_wording_and_excerpt_marks():
    product = load_advent_draft()
    assert product["translation"] == "web"
    assert len([card for card in product["cards"] if card["kind"] == "scripture"]) == 25
    assert len(product["cards"]) == 28
    luke = _card(product, "Luke 1:41")
    assert luke["partial"] is False
    assert luke["partial_note"] == ""
    assert "baby leaped" in luke["scripture_text"]
    matthew = _card(product, "Matthew 1:20")
    assert matthew["partial"] is True
    assert matthew["scripture_text"].startswith("...")
    assert matthew["scripture_text"].rstrip('"\u201d').endswith("...")
    assert "omitted words" in matthew["partial_note"]
    assert "Excerpt" in reference_line(matthew, "web")
    assert "Excerpt" not in reference_line(luke, "web")
    assert export_errors(product) == []
    assert product["listing"]["draft_price_text"] == "$5.99"
    assert "not a Faith Sparks checkout price" in product["listing"]["notes"].lower() or "Not a Faith Sparks" in product["listing"]["notes"]


def test_anonymous_and_non_admin_cannot_open_or_export(client):
    _fake, test_client = client
    anonymous = test_client.get("/admin/printables")
    assert anonymous.status_code == 302
    assert "/login" in anonymous.headers["Location"]

    _sign_in(test_client, "reader@example.com")
    forbidden = test_client.get("/admin/printables")
    assert forbidden.status_code == 403
    preview = test_client.get("/admin/printables/family-advent-scripture-cards/preview.pdf")
    assert preview.status_code == 403

    _sign_in(test_client, "admin@example.com")
    missing = test_client.get("/admin/printables/family-advent-scripture-cards/export.pdf")
    assert missing.status_code == 404


def test_public_site_does_not_list_drafts(client):
    _fake, test_client = client
    _sign_in(test_client, "admin@example.com")
    created = test_client.post("/admin/printables/new", data={"csrf_token": "t", "action": "load_advent"})
    assert created.status_code == 302
    with test_client.session_transaction() as sess:
        sess.clear()
    home = test_client.get("/")
    sitemap = test_client.get("/sitemap.xml")
    assert b"Family Advent Scripture Cards" not in home.data
    assert b"/admin/printables" not in sitemap.data
    assert test_client.get("/printables").status_code == 404
    assert test_client.get("/family-advent-scripture-cards").status_code == 404


def test_admin_round_trip_escapes_text_and_builds_labeled_pdf(client):
    _fake, test_client = client
    _sign_in(test_client, "admin@example.com")
    assert test_client.post("/admin/printables/new", data={"csrf_token": "t", "action": "load_advent"}).status_code == 302
    page = test_client.get("/admin/printables/family-advent-scripture-cards")
    html = page.get_data(as_text=True)
    assert page.status_code == 200
    assert "World English Bible" in html
    assert "&lt;script&gt;" not in html

    saved = test_client.post(
        "/admin/printables/family-advent-scripture-cards",
        data={
            "csrf_token": "t",
            "action": "save",
            "title": "Family Advent <script>",
            "subtitle": "25 days",
            "audience": "Families",
            "story_arc": "",
            "product_kind": "advent",
            "status": "draft",
            "instructions": "Print it.",
            "listing_title": "Draft listing",
            "listing_tags": "advent printable",
            "draft_price_text": "$5.99",
            "listing_description": "Unpublished.",
            "card-0-kind": "scripture",
            "card-0-number": "1",
            "card-0-label": "December 1",
            "card-0-title": "Promise <script>",
            "card-0-reference": "Genesis 3:15",
            "card-0-scripture_text": "I will put hostility between you and the woman.",
            "card-0-younger_prompt": "Who keeps promises?",
            "card-0-older_prompt": "Why a rescuer?",
            "card-0-prayer": "Thank you.",
            "card-0-activity": "",
            "card-0-scripture_source": "imported",
        },
    )
    assert saved.status_code == 302
    editor = test_client.get("/admin/printables/family-advent-scripture-cards").get_data(as_text=True)
    assert "Promise &lt;script&gt;" in editor
    assert "Promise <script>" not in editor

    exported = test_client.get("/admin/printables/family-advent-scripture-cards/export.json")
    body = json.loads(exported.data)
    assert body["translation"] == "web"
    assert body["title"] == "Family Advent <script>"
    pdf = test_client.get("/admin/printables/family-advent-scripture-cards/preview.pdf")
    assert pdf.status_code == 200
    assert pdf.mimetype == "application/pdf"
    assert pdf.headers["Cache-Control"] == "private, no-store"
    reader = PdfReader(io.BytesIO(pdf.data))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Genesis 3:15 (WEB)" in text
    assert "World English Bible" in text
    assert "New Living Translation" not in text
    assert "King James Version" not in text
    assert reader.pages[0].get("/Resources").get("/XObject")


def test_nlt_edition_does_not_reuse_web_wording_or_skip_its_notice(client, monkeypatch):
    _fake, test_client = client
    _sign_in(test_client, "admin@example.com")
    test_client.post("/admin/printables/new", data={"csrf_token": "t", "action": "load_advent"})
    created = test_client.post(
        "/admin/printables/family-advent-scripture-cards",
        data={
            "csrf_token": "t",
            "action": "create_edition",
            "edition_translation": "nlt",
            "edition_slug": "family-advent-scripture-cards-nlt",
        },
    )
    assert created.headers["Location"].endswith("/admin/printables/family-advent-scripture-cards-nlt")
    exported = json.loads(test_client.get("/admin/printables/family-advent-scripture-cards-nlt/export.json").data)
    assert exported["translation"] == "nlt"
    scripture = [card["scripture_text"] for card in exported["cards"] if card["kind"] == "scripture"]
    assert scripture
    assert all(text == "" for text in scripture)
    blocked = test_client.get("/admin/printables/family-advent-scripture-cards-nlt/preview.pdf")
    assert blocked.status_code == 400
    assert b"NLT" in blocked.data
    assert b"will not be substituted" in blocked.data or b"Another translation" in blocked.data

    calls = []

    def fetch(reference, version):
        calls.append((reference, version))
        if version != "nlt":
            raise AssertionError(version)
        return None

    monkeypatch.setattr(products, "fetch_verse_text", fetch)
    filled = test_client.post(
        "/admin/printables/family-advent-scripture-cards-nlt",
        data={"csrf_token": "t", "action": "fill_scripture"},
    )
    assert filled.status_code == 302
    after = json.loads(test_client.get("/admin/printables/family-advent-scripture-cards-nlt/export.json").data)
    assert all(not card["scripture_text"] for card in after["cards"] if card["kind"] == "scripture")
    assert calls
    assert {version for _ref, version in calls} == {"nlt"}
    assert not any(card["partial"] and (ref, "nlt") in [(c[0], c[1]) for c in calls] for card in after["cards"] for ref in [card["reference"]] if card["reference"] == "Matthew 1:20")

    pasted = next(card for card in after["cards"] if card["reference"] == "John 3:16")
    # Put one imported NLT string through the service, not by copying WEB.
    for card in after["cards"]:
        if card["kind"] != "scripture":
            continue
        if card["reference"] == "John 3:16":
            card["scripture_text"] = "PASTED NLT JOHN 3:16 ONLY"
            card["scripture_source"] = "imported"
            card["partial"] = False
            card["partial_note"] = ""
        elif not card["partial"]:
            card["kind"] = "blank"
            card["scripture_text"] = ""
            card["reference"] = ""
        else:
            card["kind"] = "blank"
            card["scripture_text"] = ""
            card["reference"] = ""
            card["partial"] = False
            card["partial_note"] = ""
    products.save_product(after, "admin@example.com")
    pdf = test_client.get("/admin/printables/family-advent-scripture-cards-nlt/preview.pdf")
    assert pdf.status_code == 200, pdf.get_data(as_text=True)
    text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(pdf.data)).pages)
    assert "PASTED NLT JOHN 3:16 ONLY" in text
    assert "John 3:16 (NLT)" in text
    assert "New Living Translation" in text
    assert "Tyndale" in text
    assert "World English Bible" not in text
    assert "I will put hostility" not in text
    assert pasted["scripture_text"] == "PASTED NLT JOHN 3:16 ONLY"


def test_kjv_fill_skips_excerpts_and_other_translations():
    product = load_advent_draft()
    product["translation"] = "kjv"
    for card in product["cards"]:
        if card["kind"] == "scripture" and not card["partial"]:
            card["scripture_text"] = ""
            card["scripture_source"] = ""
    calls = []

    def fetch(reference, version):
        calls.append((reference, version))
        assert version == "kjv"
        if reference == "Luke 1:41":
            return "KJV LUKE 1:41 TEXT"
        return None

    updated, notes = fill_empty_full_verses(product, fetch=fetch)
    luke = _card(updated, "Luke 1:41")
    matthew = _card(updated, "Matthew 1:20")
    assert luke["scripture_text"] == "KJV LUKE 1:41 TEXT"
    assert luke["scripture_source"] == "authoritative_fetch"
    assert matthew["scripture_text"].startswith("...")
    assert matthew["partial"] is True
    assert all(version == "kjv" for _ref, version in calls)
    assert "Matthew 1:20" not in {ref for ref, _version in calls}
    assert "Genesis 12:3b" not in {ref for ref, _version in calls}
    assert any("no KJV text" in note for note in notes)


def test_full_advent_pdf_uses_logo_and_does_not_overflow():
    assert LOGO_PATH.name == "faith_sparks_logo_512.png"
    assert LOGO_PATH.is_file()
    product = load_advent_draft()
    data, warnings = render_product_pdf(product)
    assert warnings == []
    assert data.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(data))
    assert len(reader.pages) == 10
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Matthew 1:20 (WEB) - Excerpt:" in text
    assert "omitted words" in text
    assert "...behold, an angel of the Lord" in text or "...behold, an angel of the Lord" in text.replace("\n", " ")
    assert "Luke 1:41 (WEB)" in text
    assert "World English Bible" in text
    assert "English Standard Version" not in text
    assert reader.pages[0]["/Resources"]["/XObject"]
    flat = text.replace("\n", " ")
    luke_at = flat.find("Luke 1:41 (WEB)")
    assert luke_at != -1
    assert "Excerpt" not in flat[max(0, luke_at - 40):luke_at]


def test_storage_upload_is_private_and_optional(client, monkeypatch, tmp_path):
    _fake, test_client = client
    _sign_in(test_client, "admin@example.com")
    test_client.post("/admin/printables/new", data={"csrf_token": "t", "action": "load_advent"})
    monkeypatch.setattr(
        "faithsparks.views.admin.printables.upload_storage_bytes",
        lambda data, path, content_type=None: False,
    )
    failed = test_client.post(
        "/admin/printables/family-advent-scripture-cards",
        data={"csrf_token": "t", "action": "store_pdf"},
    )
    assert failed.status_code == 302
    stored = {}

    def remember(data, path, content_type=None):
        stored["path"] = path
        stored["type"] = content_type
        stored["pdf"] = data.startswith(b"%PDF")
        return True

    monkeypatch.setattr("faithsparks.views.admin.printables.upload_storage_bytes", remember)
    saved = test_client.post(
        "/admin/printables/family-advent-scripture-cards",
        data={"csrf_token": "t", "action": "store_pdf"},
    )
    assert saved.status_code == 302
    assert stored["path"] == "printable-products/family-advent-scripture-cards/web.pdf"
    assert stored["pdf"] is True
    assert stored["type"] == "application/pdf"
    assert list(tmp_path.iterdir()) == []
