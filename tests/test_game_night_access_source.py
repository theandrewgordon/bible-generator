from types import SimpleNamespace

import pytest

import app as app_module
from faithsparks.services.users import family_game_night_access_source, has_family_game_night_access
from faithsparks.views import act_it_out


@pytest.mark.parametrize("data, source", [
    ({"isPro": False, "plan": "free"}, "free"),
    ({"isPro": False, "plan": "family"}, "free"),
    ({"isPro": True}, "plus"),
    ({"isPro": False, "purchases": {"family_game_night": True}}, "purchase"),
    ({"isPro": True, "purchases": {"family_game_night": True}}, "purchase"),
])
def test_membership_and_one_time_ownership_have_distinct_access_sources(data, source):
    assert family_game_night_access_source(data) == source
    assert has_family_game_night_access(data) is (source != "free")


def test_former_member_sees_why_a_previous_checkout_still_unlocks_complete(monkeypatch):
    monkeypatch.setattr(app_module, "google", SimpleNamespace(authorized=True))
    monkeypatch.setattr(act_it_out, "get_user_doc", lambda email: {
        "isPro": False, "plan": "free", "purchases": {"family_game_night": True},
    })
    with app_module.app.test_client() as client:
        with client.session_transaction() as sess:
            sess["user_email"] = "former-member@example.com"
            sess["user_info"] = {"email": "former-member@example.com"}
            sess["user_owned_packs"] = ["-"]
        page = client.get("/family-game-night")
    assert page.status_code == 200
    assert b"previous one-time checkout" in page.data
    assert b"separate from Plus" in page.data
    assert b"You own it" in page.data
    assert b"Buy once for $19" not in page.data
