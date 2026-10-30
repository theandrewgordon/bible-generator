from unittest import mock

import app


def setup_function(_):
    app._clear_all_worship_caches()


def test_cache_ttl_is_long_only_for_single_worker(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    assert app._worship_cache_ttl() == 300.0
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    assert app._worship_cache_ttl() == 10.0
    monkeypatch.delenv("WEB_CONCURRENCY")
    assert app._worship_cache_ttl() == 10.0


def test_cached_value_is_reused_and_is_a_copy(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    loader = mock.Mock(return_value=[{"id": "a"}])
    first = app._worship_cached("setlists", "gsjcc", loader)
    first[0]["id"] = "mutated"
    second = app._worship_cached("setlists", "gsjcc", loader)
    assert loader.call_count == 1
    assert second == [{"id": "a"}]


def test_worship_post_clears_caches_but_live_taps_do_not(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    loader = mock.Mock(return_value=["x"])
    app._worship_cached("setlists", "gsjcc", loader)
    client = app.app.test_client()

    client.post("/worship/live/control/abcdefghijklmnopqrstuv", json={"action": "next"})
    app._worship_cached("setlists", "gsjcc", loader)
    assert loader.call_count == 1  # live tap kept the cache

    client.post("/worship/setlist/delete", data={})
    app._worship_cached("setlists", "gsjcc", loader)
    assert loader.call_count == 2  # any worship write clears it


def test_members_owner_check_runs_before_cache(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.setattr(app, "db", object())
    monkeypatch.setattr(app, "_current_worship_scope", lambda: "gsjcc")
    monkeypatch.setattr(app, "_worship_church_members_uncached", lambda: [{"email": "a@x.org", "role": "owner"}])
    monkeypatch.setattr(app, "_worship_can_edit", lambda owner_only=False: True)
    assert app._worship_church_members() == [{"email": "a@x.org", "role": "owner"}]
    monkeypatch.setattr(app, "_worship_can_edit", lambda owner_only=False: False)
    assert app._worship_church_members() == []  # non-owner never sees the cached list
