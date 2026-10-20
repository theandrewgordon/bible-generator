from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock

import pytest
import app
from faithsparks.views import billing, games
from fake_firestore import FakeFirestore


def test_pack_checkout_retries_use_identical_stripe_parameters(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(billing, "db", db)
    def claim(_):
        with app.app.test_request_context("/"):
            return billing._pack_checkout_parameters("a@example.com", "pack", "price1")
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(claim, range(2)))
    assert first == second
    assert first["expires_at"] > datetime.now(timezone.utc).timestamp()
    with app.app.test_request_context("/"):
        assert billing._pack_checkout_parameters("a@example.com", "pack", "price_changed") == first
        assert billing._pack_checkout_parameters("other@example.com", "pack", "price1") != first
    ref = db.collection("users").document("a@example.com").collection("pack_checkouts").document("pack")
    ref.set({"expires_at": 0}, merge=True)
    with app.app.test_request_context("/"):
        assert billing._pack_checkout_parameters("a@example.com", "pack", "price1")["idempotency_key"] != first["idempotency_key"]


@pytest.mark.parametrize("same_game", [True, False])
def test_game_downloads_charge_atomically(monkeypatch, same_game):
    db = FakeFirestore()
    monkeypatch.setattr(games, "db", db)
    monkeypatch.setattr(games, "_quota_for_plan", lambda _: (1, 1))
    def charge(index):
        try:
            games._charge_game_download("a@example.com", "same" if same_game else str(index), "free")
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(charge, range(2)))
    assert sum(results) == (2 if same_game else 1)
    user = db.collection("users").document("a@example.com").get().to_dict()
    assert user["usage"]["lifetime"] == 1
    assert len(user["gameDownloads"]) == 1


@pytest.mark.parametrize("custom", [True, False])
@pytest.mark.parametrize("failure", ["provider", "empty", "meaning"])
def test_match_games_fail_instead_of_rendering_placeholder(monkeypatch, custom, failure):
    monkeypatch.setattr(games, "request_verse_data", mock.Mock(
        side_effect=RuntimeError("offline") if failure == "provider" else None,
        return_value='{"fullVerse": ""}' if failure == "empty" else '{"fullVerse": "Real verse"}',
    ))
    monkeypatch.setattr(games, "request_verse_meaning", lambda *args, **kwargs: '{}')
    with pytest.raises(ValueError, match="Scripture"):
        if custom:
            games._build_match_game_from_inputs(["John 3:16"], "kjv", [], use_meaning=failure == "meaning")
        else:
            games._build_match_game_items({"verses": ["John 3:16"]}, "kjv", use_meaning=failure == "meaning")
