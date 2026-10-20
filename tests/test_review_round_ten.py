from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest
import app
from fake_firestore import FakeFirestore
from faithsparks.services import illustrate, ai_budget
from faithsparks.util.request_utils import get_client_ip
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import Flask, request


def test_simultaneous_church_creation_reserves_distinct_workspaces(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(app, "db", db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(lambda email: app._create_worship_church("Same Church", email)[0], ["one@example.com", "two@example.com"]))
    assert len(set(ids)) == 2
    for church_id, email in zip(ids, ["one@example.com", "two@example.com"]):
        church = db.collection(app._WORSHIP_CHURCH_COLLECTION).document(church_id)
        assert church.get().to_dict()["created_by"] == email
        assert [doc.id for doc in church.collection("members").stream()] == [email]


def test_duplicate_consolidation_preserves_setlist_positions_and_notes(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(app, "db", db)
    monkeypatch.setattr(app, "_is_local_storage_allowed", lambda: False)
    collection = db.collection("setlists")
    other = db.collection("other_church_setlists")
    monkeypatch.setattr(app, "_worship_setlist_refs_for_read", lambda:[collection])
    data = {"songs":["intro","old","best"], "notes":{"old":"Quiet ending", "best":"Capo 2", "intro":"Welcome"}}
    collection.document("sunday").set(data)
    other.document("sunday").set(data)
    app._replace_song_in_worship_setlists("old", "best")
    saved = collection.document("sunday").get().to_dict()
    assert saved["songs"] == ["intro","best","best"]
    assert saved["notes"] == {"best":"Capo 2\nQuiet ending", "intro":"Welcome"}
    assert other.document("sunday").get().to_dict() == data
    app._replace_song_in_worship_setlists("old", "best")
    assert collection.document("sunday").get().to_dict() == saved


def test_client_ip_ignores_raw_forwarding_headers():
    with app.app.test_request_context("/", headers={"CF-Connecting-IP":"8.8.8.8", "X-Forwarded-For":"1.1.1.1"}, environ_base={"REMOTE_ADDR":"203.0.113.9"}):
        assert get_client_ip() == "203.0.113.9"


def test_client_ip_uses_only_the_configured_proxy_hop():
    site = Flask(__name__)
    site.wsgi_app = ProxyFix(site.wsgi_app, x_for=1)
    site.add_url_rule("/", view_func=get_client_ip)
    response = site.test_client().get("/", headers={"CF-Connecting-IP":"8.8.8.8", "X-Forwarded-For":"1.1.1.1, 203.0.113.9"})
    assert response.text == "203.0.113.9"


@pytest.mark.parametrize("available", [False, True])
def test_coloring_cache_requires_real_files(monkeypatch, tmp_path, available):
    monkeypatch.chdir(tmp_path)
    db = FakeFirestore()
    monkeypatch.setattr(illustrate, "db", db)
    monkeypatch.setattr(illustrate, "CACHE_COLLECTION", "coloring_cache")
    db.collection("coloring_cache").document("key").set({"pdf_filename":"page.pdf", "png_filename":"page.png"})
    def download(storage, local):
        if available:
            Path(local).write_bytes(b"file")
        return available
    monkeypatch.setattr(illustrate, "download_from_storage", download)
    result = illustrate._fetch_cached_sheet("key")
    assert bool(result) == available
    if available:
        assert Path("output/page.pdf").is_file()
        assert Path("worksheets/page.png").is_file()


def test_coloring_cache_keys_separate_owners_and_rendered_titles():
    params = dict(references=["John 3:16"], custom_text="", age_bracket="6-8", include_reference=True, symbols_only=True, historical_props=False)
    first = illustrate._build_cache_key(**params, user_email="one@example.com", title_override="First")
    assert first != illustrate._build_cache_key(**params, user_email="two@example.com", title_override="First")
    assert first != illustrate._build_cache_key(**params, user_email="one@example.com", title_override="Second")


def test_coloring_owner_write_failure_does_not_report_success_or_cache(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    db = FakeFirestore()
    db.fail_collections.add("worksheets")
    monkeypatch.setattr(illustrate, "db", db)
    monkeypatch.setattr(illustrate, "moderate_text_block", lambda text: {})
    monkeypatch.setattr(illustrate, "_fetch_cached_sheet", lambda key: None)
    monkeypatch.setattr(ai_budget, "ai_budget_ok", lambda *args: True)
    monkeypatch.setattr(illustrate, "_summarize_context", lambda *args: {"summary":"River"})
    monkeypatch.setattr(illustrate, "get_openai_client", lambda: SimpleNamespace())
    monkeypatch.setattr(illustrate, "_enforce_rate_limit", lambda email: None)
    monkeypatch.setattr(illustrate, "_generate_image_with_retry", lambda *args, **kwargs: SimpleNamespace(data=[SimpleNamespace(b64_json="image")]))
    monkeypatch.setattr(illustrate, "_save_png", lambda b64,path:Path(path).write_bytes(b"png"))
    monkeypatch.setattr(illustrate, "_brand_coloring_image", lambda path: None)
    monkeypatch.setattr(illustrate, "_make_thumbnail", lambda *args: None)
    monkeypatch.setattr(illustrate, "build_coloring_pdf", lambda path,**kwargs:Path(path).write_bytes(b"pdf"))
    monkeypatch.setattr(illustrate, "upload_to_storage_checked", lambda *args: True)
    cache = mock.Mock()
    monkeypatch.setattr(illustrate, "_store_cached_sheet", cache)
    with pytest.raises(RuntimeError, match="save your coloring page to your library"):
        illustrate.create_coloring_sheet(user_email="a@example.com", verse_input="", custom_text="A gentle river", title_override="Page", age_bracket="6-8", include_reference=False, symbols_only=True, historical_props=False)
    cache.assert_not_called()
