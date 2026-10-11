"""Regression tests for the 2026-10-11 Labs & Games audit fixes."""
import re
from pathlib import Path
from types import SimpleNamespace

from faithsparks.services import rate_limit
from faithsparks.services.sharded_counters import SHARDS, read_counts, shard_ref
from faithsparks.views import lab_games

ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / "faithsparks" / "content" / "lab_games"


def test_runtime_patch_layer_is_gone_and_fixes_live_in_the_files():
    source = (ROOT / "faithsparks" / "views" / "lab_games.py").read_text(encoding="utf-8")
    assert "_apply_runtime_game_patches" not in source
    ice = (GAME_DIR / "gordon-ice-cream-town.html").read_text(encoding="utf-8")
    assert "Use the scoop you already have" in ice
    assert "p.highestLevel=max(p.highestLevel||1,p.level);" in ice


def test_games_use_self_hosted_minified_engine_and_no_cdn():
    for path in GAME_DIR.glob("gordon-*.html"):
        html = path.read_text(encoding="utf-8")
        assert "cdn.jsdelivr.net" not in html, path.name
        assert re.search(r'<script src="/static/vendor/littlejs-1\.18\.19(-gordon)?\.min\.js"></script>', html), path.name
        assert "LittleJS Engine - MIT License" not in html, path.name  # engine is no longer inlined
        assert not re.search(r"^\s*debugShowErrors\(\);", html, re.M), path.name
    assert (ROOT / "static" / "vendor" / "littlejs-1.18.19.min.js").stat().st_size < 250_000
    assert (ROOT / "static" / "vendor" / "littlejs-1.18.19-gordon.min.js").stat().st_size < 250_000
    assert (GAME_DIR / "gordon-window-washing.html").stat().st_size < 250_000


def test_copywork_generator_uses_pinned_local_tagify():
    html = (ROOT / "templates" / "generate.html").read_text(encoding="utf-8")
    assert "cdn.jsdelivr.net/npm/@yaireo/tagify" not in html
    assert "vendor/tagify-4.39.0.min.js" in html
    assert (ROOT / "static" / "vendor" / "tagify-4.39.0.min.js").is_file()


def test_versioned_vendor_files_are_cached_immutably():
    import app as main_app
    response = main_app.app.test_client().get("/static/vendor/littlejs-1.18.19.min.js")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_name_dialog_focuses_inside_the_tap_for_ipad_keyboard():
    core = (GAME_DIR / "games-core.js").read_text(encoding="utf-8")
    assert "input.focus({preventScroll:true})" in core
    assert "if (!coarse) setTimeout(()=>{ input.focus(); input.select(); }, 0);" not in core


def test_roster_sync_carries_milestone_progress_and_merges_by_max():
    incoming = lab_games._sanitize_games_roster({"players": [{
        "id": "p1", "name": "Lily", "createdAt": "nope",
        "games": {
            "gordon-ice-cream-town": {"highestLevel": 4, "bestScore": 900, "currentScore": 55, "meta": {"resume": "x" * 9000}},
            "BAD ID!": {"highestLevel": 9},
            "gordon-mail-run": {"bestScore": float("inf")},
        },
    }]})
    player = incoming["players"][0]
    assert player["createdAt"] == 0
    assert player["games"] == {"gordon-ice-cream-town": {"bestScore": 900, "highestLevel": 4}}
    existing = {"players": [{"id": "p1", "name": "Lily", "games": {"gordon-ice-cream-town": {"highestLevel": 6, "bestScore": 100}}}]}
    merged = lab_games._merge_games_rosters(existing, incoming)
    assert merged["players"][0]["games"]["gordon-ice-cream-town"] == {"highestLevel": 6, "bestScore": 900}


def test_games_core_syncs_progress_without_live_score_churn():
    core = (GAME_DIR / "games-core.js").read_text(encoding="utf-8")
    assert "games:progressSummary(p)" in core
    assert "'currentScore'" not in core.split("const SYNCED_GAME_FIELDS=")[1].split("]")[0]
    assert "15000-(Date.now()-lastRosterSyncAt)" in core
    assert "mergeRemoteProgress(local,raw.games)" in core


class _Snap:
    def __init__(self, data): self.exists, self._data = data is not None, data
    def to_dict(self): return dict(self._data or {})


class _Store:
    def __init__(self): self.docs = {}
    def collection(self, name):
        store = self
        class _Col:
            def document(self, doc_id):
                return SimpleNamespace(
                    get=lambda: _Snap(store.docs.get(doc_id)),
                    set=lambda data, merge=False: store.docs.setdefault(doc_id, {}).update(data),
                    id=doc_id,
                )
        return _Col()


def test_sharded_counters_spread_writes_and_sum_back():
    store = _Store()
    store.docs["funnel"] = {"total": 5, "events": {"start": 5}}
    ids = {shard_ref(store, "funnel").id for _ in range(200)}
    assert len(ids) == SHARDS and all(i.startswith("funnel__shard") for i in ids)
    store.docs["funnel__shard3"] = {"total": 2, "events": {"start": 1, "finish": 1}, "updatedAt": "x"}
    assert read_counts(store, "funnel") == {"total": 7, "events": {"start": 6, "finish": 1}}


def test_local_only_limits_cap_same_brain_cost_endpoints(monkeypatch):
    rate_limit.reset_memory_limits()
    from flask import Flask
    app = Flask(__name__)
    app.secret_key = "test"
    with app.test_request_context("/"):
        from flask import session
        session["user_email"] = "kid@example.com"
        results = [lab_games._same_brain_user_limit("tts", 3) for _ in range(5)]
    assert results == [True, True, True, False, False]
    rate_limit.reset_memory_limits()


def test_metrics_are_admin_only_and_cached():
    source = (ROOT / "faithsparks" / "views" / "lab_games.py").read_text(encoding="utf-8")
    assert "_SAME_BRAIN_METRICS_CACHE_SECONDS = 600" in source
    assert 'order_by("updatedAt", direction="DESCENDING")' in source


def test_same_brain_couch_mode_is_local_and_inside_main_script():
    html = (GAME_DIR / "same-brain.html").read_text(encoding="utf-8")
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    assert len(scripts) == 1  # the couch module must share the main script's scope
    module = scripts[0][scripts[0].index("/* Couch Brain"):]
    assert 'id="couch-btn"' in html and 'id="screen-couch"' in html
    for forbidden in ("fetch(", "track(", "XMLHttpRequest", "sendBeacon"):
        assert forbidden not in module.split("window.SameBrainCouch")[0], forbidden
    assert "var MIN=2,MAX=4,ROUND=5" in module
