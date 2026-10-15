"""Speed/SEO/PWA audit 2026-10-15: small avatars, indexable generator, one tag each, caching, offline."""

import os
import re
from html.parser import HTMLParser
from pathlib import Path
from unittest import mock

import pytest

import app as app_module
from faithsparks.services import scripture

ROOT = Path(__file__).resolve().parents[1]
client = app_module.app.test_client()


class _Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.links = [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        (self.meta if tag == "meta" else self.links if tag == "link" else []).append(attrs)


def _head(path):
    response = client.get(path)
    parser = _Head()
    parser.feed(response.get_data(as_text=True))
    return response, parser


def _sitemap_paths():
    xml = client.get("/sitemap.xml").get_data(as_text=True)
    return [re.sub(r"https?://[^/]+", "", u) for u in re.findall(r"<loc>([^<]+)</loc>", xml)]


def test_avatar_sheet_is_small():
    sheet = ROOT / "static/bible_bee_avatars/avatar-sprite-600.jpg"
    assert sheet.stat().st_size < 150_000
    assert not (ROOT / "static/bible_bee_avatars/avatar-sprite.png").exists()
    assert "avatar-sprite-600.jpg" in (ROOT / "static/bible_bee.css").read_text()


def test_generator_is_indexable_with_css_in_head():
    response, head = _head("/generate")
    html = response.get_data(as_text=True)
    assert not [m for m in head.meta if m.get("name") == "robots" and "noindex" in m.get("content", "")]
    assert html.index("Page-local polish") < html.index("</head>")  # page CSS before first paint


def test_sitemap_pages_open_and_have_one_unique_description_and_canonical():
    paths = _sitemap_paths()
    assert "/games" not in paths and any(p.startswith("/browse/") for p in paths)
    default = "Scripture-centered tools that help families and small churches"
    seen = {}
    for path in paths:
        response, head = _head(path)
        assert response.status_code == 200, path
        descriptions = [m["content"] for m in head.meta if m.get("name") == "description"]
        canonicals = [l for l in head.links if l.get("rel") == "canonical"]
        assert len(descriptions) == 1 and len(canonicals) == 1, path
        seen.setdefault(descriptions[0], []).append(path)
    for path in ("/family-game-night", "/plus", "/verse-of-the-week", "/privacy"):
        _, head = _head(path)
        assert not [m for m in head.meta if m.get("name") == "description" and m["content"].startswith(default)], path


def test_versioned_static_files_are_cached_for_a_year():
    v = app_module.STATIC_VERSION
    assert "immutable" in client.get(f"/static/theme.css?v={v}").headers["Cache-Control"]
    assert "immutable" not in (client.get("/static/weekflow_schedule.js?v=7").headers.get("Cache-Control") or "")
    assert "max-age=86400" in client.get("/static/hero_john_316.png").headers["Cache-Control"]


def test_service_worker_is_tied_to_the_deploy_and_offline_page_has_no_user_data():
    sw = client.get("/service-worker.js").get_data(as_text=True)
    assert app_module.STATIC_VERSION in sw and "__STATIC_VERSION__" not in sw
    assert "MAX_ENTRIES" in sw and "caches.match(OFFLINE_URL)" in sw
    signed_in = app_module.app.test_client()
    with signed_in.session_transaction() as sess:
        sess.update({"user_email": "mom@x.com", "user_info": {"email": "mom@x.com"}})
    page = signed_in.get("/offline").get_data(as_text=True)
    assert "You're offline" in page and "mom@x.com" not in page and "csrf" not in page


def test_failed_scripture_lookup_is_not_retried_immediately(monkeypatch):
    monkeypatch.setattr(scripture, "_cache", {})
    monkeypatch.setattr(scripture, "_recent_misses", {})
    calls = []
    monkeypatch.setattr(scripture, "_fetch_bible_api", lambda ref, version: calls.append(1) or None)
    assert scripture.fetch_verse_text("John 3:16", "kjv") is None
    assert scripture.fetch_verse_text("John 3:16", "kjv") is None
    assert len(calls) == 1
