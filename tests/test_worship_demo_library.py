import json
from pathlib import Path

import app
from tests.fake_firestore import FakeFirestore

ROOT = Path(__file__).resolve().parents[1]


def _ids(ref):
    return sorted(doc.id for doc in ref.stream())


def _run_sync(monkeypatch, store, scope="default"):
    monkeypatch.setattr(app, "db", store)
    monkeypatch.setattr(app, "_current_worship_scope", lambda: scope)
    monkeypatch.setattr(app, "_worship_seeded", False)
    app._seed_worship_from_files()


def test_demo_library_replaces_retired_items_and_spares_churches(monkeypatch):
    store = FakeFirestore()
    monkeypatch.setattr(app, "db", store)
    monkeypatch.setattr(app, "_current_worship_scope", lambda: "default")
    current, legacy = app._worship_songs_ref(), app._legacy_worship_songs_ref()
    for song_id in app._WORSHIP_RETIRED_DEMO_IDS:
        current.document(song_id).set({"id": song_id, "title": song_id})
        legacy.document(song_id).set({"id": song_id, "title": song_id})
    church = app._worship_songs_ref_for_scope("gsjcc")
    church.document("holy-forever").set({"id": "holy-forever", "title": "Holy Forever"})

    _run_sync(monkeypatch, store)

    demo_ids = sorted(Path(name).stem for name in app._WORSHIP_DEMO_SONG_FILES)
    assert _ids(current) == demo_ids
    assert _ids(legacy) == []
    assert _ids(church) == ["holy-forever"]  # a church's own library is never touched


def test_demo_sync_is_idempotent(monkeypatch):
    store = FakeFirestore()
    _run_sync(monkeypatch, store)
    calls = []
    original = app._invalidate_worship_cache
    monkeypatch.setattr(app, "_invalidate_worship_cache", lambda scope=None: calls.append(scope) or original(scope))
    _run_sync(monkeypatch, store)
    assert calls == []  # nothing changed the second time


def test_demo_sync_skips_church_libraries(monkeypatch):
    store = FakeFirestore()
    _run_sync(monkeypatch, store, scope="gsjcc")
    assert _ids(app._worship_songs_ref_for_scope("default")) == []


def test_demo_files_are_public_domain_and_valid():
    for name in app._WORSHIP_DEMO_SONG_FILES:
        data = json.loads((ROOT / "songs" / name).read_text(encoding="utf-8"))
        assert data["copyright_notice"] == "Public domain"
        song = app.normalize_worship_song(data)
        assert song["parts"] and song["arrangement"]
        if song["type"] == "scripture":
            assert song["version"] in {"KJV", "WEB"}
