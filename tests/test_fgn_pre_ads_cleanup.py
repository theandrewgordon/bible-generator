"""Buyer-facing cleanup before advertising Family Game Night Complete."""

from types import SimpleNamespace

import app as app_module
from app import app
from faithsparks.views import billing


def test_checkout_login_return_opens_offer_without_starting_payment(monkeypatch):
    from unittest.mock import Mock

    start_checkout = Mock()
    monkeypatch.setattr(billing, "buy_family_game_night", start_checkout)
    with app.test_client() as client:
        response = client.get("/family-game-night/checkout")
        assert response.status_code == 302
        assert response.headers["Location"].endswith("/family-game-night#complete-game")
        offer = client.get(response.headers["Location"])
        assert offer.status_code == 200
        assert b"Buy once for $19" in offer.data or b"checkout is temporarily unavailable" in offer.data
    start_checkout.assert_not_called()


def test_public_pages_show_free_try_and_nineteen_dollar_complete():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        pages = {
            "/": client.get("/"),
            "/families": client.get("/families"),
            "/churches": client.get("/churches"),
            "/play": client.get("/play"),
        }

    for path, response in pages.items():
        assert response.status_code == 200, path
        assert b"Free try" in response.data, path
        assert b"$19" in response.data, path
        assert b"Play free" in response.data, path
        assert b"Unlock Complete" in response.data, path
        assert b'href="/family-game-night"' in response.data, path
        assert b'href="/family-game-night#complete-game"' in response.data, path


def test_library_alias_matches_my_library():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        response = client.get("/library")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/prints")


def test_plus_hides_public_promo_codes_and_shows_configured_prices(monkeypatch):
    prices = {
        "price_fam_m": {"amount": 3.0, "currency": "USD", "recurring": "month"},
        "price_fam_y": {"amount": 28.80, "currency": "USD", "recurring": "year"},
        "price_cls_m": {"amount": 10.0, "currency": "USD", "recurring": "month"},
        "price_cls_y": {"amount": 96.0, "currency": "USD", "recurring": "year"},
    }
    monkeypatch.setattr(billing, "STRIPE_PRICE_FAMILY_MONTHLY", "price_fam_m")
    monkeypatch.setattr(billing, "STRIPE_PRICE_FAMILY_ANNUAL", "price_fam_y")
    monkeypatch.setattr(billing, "STRIPE_PRICE_CLASSROOM_MONTHLY", "price_cls_m")
    monkeypatch.setattr(billing, "STRIPE_PRICE_CLASSROOM_ANNUAL", "price_cls_y")
    monkeypatch.setattr(billing, "STRIPE_PRICE_FAMILY", None)
    monkeypatch.setattr(billing, "STRIPE_PRICE_CLASSROOM", None)
    monkeypatch.setattr(billing, "_cached_price_meta", lambda pid: prices.get(pid))

    app.config.update(TESTING=True)
    with app.test_client() as client:
        anonymous = client.get("/plus")
        monkeypatch.setattr(app_module, "google", SimpleNamespace(authorized=True))
        with client.session_transaction() as sess:
            sess["user_email"] = "buyer@example.com"
            sess["user_info"] = {"email": "buyer@example.com"}
            sess["user_owned_packs"] = ["-"]
            sess["promo"] = "PRIVATE25"
        signed_in = client.get("/plus")

    anonymous_html = anonymous.get_data(as_text=True)
    signed_in_html = signed_in.get_data(as_text=True)
    for html in (anonymous_html, signed_in_html):
        assert "FreeSparkMonth" not in html
        assert "SAVE25FOREVER" not in html
        assert "25% off for life" not in html
        assert "$3/mo" in html
        assert "$28.80/yr" in html
        assert "$10/mo" in html
        assert "$96/yr" in html
        assert "$19 one-time" in html
        assert "do not include a discount" in html
    assert 'name="promo" value="PRIVATE25"' in signed_in_html
    assert signed_in_html.count('name="promo" value="PRIVATE25"') == 4
    assert "Your discount code will be applied at checkout" in signed_in_html
