from types import SimpleNamespace
from unittest import mock

import pytest

from app import app as flask_app
from faithsparks.services.collections import get_collection_meta
from faithsparks.views import billing, browse


class FakeSnapshot:
    def __init__(self, data=None, exists=True):
        self._data = data or {}
        self.exists = exists

    def to_dict(self):
        return dict(self._data)


class FakeDocument:
    def __init__(self, database, collection_name, document_id):
        self.database = database
        self.key = (collection_name, document_id)

    def get(self):
        data = self.database.records.get(self.key)
        return FakeSnapshot(data, exists=data is not None)

    def set(self, data, merge=False):
        self.database.set_calls.append((self.key, data, merge))
        current = dict(self.database.records.get(self.key) or {}) if merge else {}
        current.update(data)
        self.database.records[self.key] = current


class FakeCollection:
    def __init__(self, database, name):
        self.database = database
        self.name = name

    def document(self, document_id):
        return FakeDocument(self.database, self.name, document_id)


class FakeDatabase:
    def __init__(self, records=None):
        self.records = dict(records or {})
        self.set_calls = []

    def collection(self, name):
        return FakeCollection(self, name)


def _bundle_meta(**overrides):
    data = {
        "slug": "wisdom",
        "title": "Wisdom for Everyday Life",
        "description": "Practice verses about wise choices.",
        "verses": ["Proverbs 3:5-6", "James 1:5"],
        "isFree": False,
        "isSubscriberOnly": True,
        "priceId": "price_wisdom",
        "zipUrl": "https://downloads.example/wisdom.zip",
        "ageRange": "Ages 7-12",
        "skills": ["Copywork", "Wisdom"],
        "useCases": ["Family worship"],
        "previewImages": ["/static/hero_john_316.png"],
        "kind": "bundle",
    }
    data.update(overrides)
    return data


def test_fallback_starter_is_public_and_uses_a_real_printable_preview(monkeypatch):
    monkeypatch.setattr(browse, "db", None)
    meta = get_collection_meta("starter")

    assert meta["title"] == "Free Starter Bundle"
    assert meta["isFree"] is True
    assert meta["previewImages"] == ["/static/hero_john_316.png"]
    assert browse._bundle_access(meta)["entitled"] is True


def test_browse_cards_link_to_details_and_keep_free_sample_open(monkeypatch):
    monkeypatch.setattr(browse, "db", None)
    monkeypatch.setattr(browse, "get_collections", lambda show_all=False: [get_collection_meta("starter")])
    client = flask_app.test_client()

    response = client.get("/browse")
    page = response.get_data(as_text=True)

    assert response.status_code == 200
    assert 'href="/browse/starter"' in page
    assert 'href="/generate?v=Genesis+1:1+(ESV)"' in page
    assert "Try free" in page
    assert "Sample printable worksheet format" in page
    assert "/login/google/start?next=/generate?collection%3Dstarter" not in page


def test_purchased_bundle_detail_shows_use_and_download_actions(monkeypatch):
    meta = _bundle_meta()
    monkeypatch.setattr(browse, "db", object())
    monkeypatch.setattr(browse, "google", SimpleNamespace(authorized=True))
    monkeypatch.setattr(browse, "get_collection_meta", lambda _slug: meta)
    monkeypatch.setattr(
        browse,
        "get_user_doc",
        lambda _email: {"plan": "free", "purchases": {"wisdom": True}},
    )
    client = flask_app.test_client()
    with client.session_transaction() as user_session:
        user_session["user_email"] = "buyer@example.com"

    response = client.get("/browse/wisdom")
    page = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "You own this bundle." in page
    assert "Purchased" in page
    assert 'href="/generate?collection=wisdom"' in page
    assert 'href="/dl/pack/wisdom"' in page
    assert "Buy bundle" not in page


def test_locked_bundle_detail_shows_purchase_choices_not_use_access(monkeypatch):
    meta = _bundle_meta()
    monkeypatch.setattr(browse, "db", object())
    monkeypatch.setattr(browse, "google", SimpleNamespace(authorized=True))
    monkeypatch.setattr(browse, "get_collection_meta", lambda _slug: meta)
    monkeypatch.setattr(browse, "get_user_doc", lambda _email: {"plan": "free", "purchases": {}})
    monkeypatch.setattr(browse, "_price_meta", lambda _price_id: {"amount": 2.5, "currency": "USD"})
    client = flask_app.test_client()
    with client.session_transaction() as user_session:
        user_session["user_email"] = "visitor@example.com"

    response = client.get("/browse/wisdom")
    page = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "Sign in to buy" in page or "Buy $2.50" in page
    assert "Included with membership" in page
    assert 'href="/generate?collection=wisdom"' not in page
    assert 'href="/dl/pack/wisdom"' not in page


def test_free_download_can_use_storage_without_firestore(monkeypatch):
    monkeypatch.setattr(browse, "db", None)
    monkeypatch.setattr(
        browse,
        "get_collection_meta",
        lambda _slug: _bundle_meta(isFree=True, isSubscriberOnly=False, priceId=None),
    )
    monkeypatch.setattr(browse, "signed_url_for_path", lambda *_args, **_kwargs: "https://signed.example/wisdom.zip")
    client = flask_app.test_client()

    response = client.get("/dl/pack/wisdom")

    assert response.status_code == 302
    assert response.location == "https://signed.example/wisdom.zip"


def test_browse_listing_does_not_fetch_each_stripe_price(monkeypatch):
    retrieve = mock.Mock(return_value={"unit_amount": 250, "currency": "usd"})
    monkeypatch.setattr(browse, "stripe", SimpleNamespace(Price=SimpleNamespace(retrieve=retrieve)))
    monkeypatch.setattr(browse, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(browse, "db", None)
    monkeypatch.setattr(browse, "get_collections", lambda show_all=False: [_bundle_meta()])
    client = flask_app.test_client()

    assert client.get("/browse").status_code == 200
    retrieve.assert_not_called()


def test_bundle_checkout_records_the_exact_price_in_metadata(monkeypatch):
    checkout_create = mock.Mock(return_value=SimpleNamespace(url="https://checkout.example/wisdom"))
    database = FakeDatabase({
        ("collections", "wisdom"): _bundle_meta(),
        ("users", "buyer@example.com"): {"purchases": {}},
    })
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=checkout_create))),
    )
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/buy/pack/wisdom"):
        billing.session["user_email"] = "buyer@example.com"
        response = billing.buy_pack("wisdom")

    assert response.status_code == 303
    checkout = checkout_create.call_args.kwargs
    assert checkout["line_items"] == [{"price": "price_wisdom", "quantity": 1}]
    assert checkout["metadata"] == {
        "email": "buyer@example.com",
        "pack_slug": "wisdom",
        "price_id": "price_wisdom",
    }


@pytest.mark.parametrize("payment_status", ["unpaid", None])
def test_pack_webhook_does_not_grant_unpaid_checkout(monkeypatch, payment_status):
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_unpaid",
            "payment_status": payment_status,
            "customer_details": {"email": "buyer@example.com"},
            "metadata": {"pack_slug": "wisdom", "price_id": "price_wisdom"},
        }},
    }
    fake_stripe = SimpleNamespace(
        Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=event)),
        Subscription=SimpleNamespace(retrieve=mock.Mock()),
    )
    database = FakeDatabase({("collections", "wisdom"): _bundle_meta()})
    monkeypatch.setattr(billing, "stripe", fake_stripe)
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/stripe/webhook", method="POST", headers={"Stripe-Signature": "sig"}):
        response = billing.stripe_webhook()

    assert response[1] == 200
    assert not any(key == ("users", "buyer@example.com") for key, _data, _merge in database.set_calls)


def test_pack_webhook_grants_only_a_paid_known_bundle(monkeypatch):
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_paid",
            "payment_status": "paid",
            "customer": "cus_123",
            "customer_details": {"email": "buyer@example.com"},
            "metadata": {"pack_slug": "wisdom", "price_id": "price_wisdom"},
        }},
    }
    database = FakeDatabase({("collections", "wisdom"): _bundle_meta()})
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=event))),
    )
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/stripe/webhook", method="POST", headers={"Stripe-Signature": "sig"}):
        response = billing.stripe_webhook()

    assert response[1] == 200
    user_record = database.records[("users", "buyer@example.com")]
    assert user_record["purchases"]["wisdom"] is True
    assert user_record["purchaseDetails"]["wisdom"]["paymentStatus"] == "paid"


def test_pack_webhook_rejects_a_mismatched_price(monkeypatch):
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_wrong_price",
            "payment_status": "paid",
            "customer_details": {"email": "buyer@example.com"},
            "metadata": {"pack_slug": "wisdom", "price_id": "price_other"},
        }},
    }
    database = FakeDatabase({("collections", "wisdom"): _bundle_meta()})
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(Webhook=SimpleNamespace(construct_event=mock.Mock(return_value=event))),
    )
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/stripe/webhook", method="POST", headers={"Stripe-Signature": "sig"}):
        response = billing.stripe_webhook()

    assert response[1] == 200
    assert not any(key == ("users", "buyer@example.com") for key, _data, _merge in database.set_calls)


def test_pack_success_verifies_payment_identity_and_bundle_before_granting(monkeypatch):
    checkout = {
        "id": "cs_paid",
        "payment_status": "paid",
        "customer": "cus_123",
        "customer_details": {"email": "buyer@example.com"},
        "metadata": {
            "email": "buyer@example.com",
            "pack_slug": "wisdom",
            "price_id": "price_wisdom",
        },
        "line_items": {"data": [{
            "quantity": 1,
            "amount_total": 250,
            "currency": "usd",
            "price": {"id": "price_wisdom", "unit_amount": 250, "product": {"name": "Wisdom"}},
        }]},
    }
    database = FakeDatabase({("collections", "wisdom"): _bundle_meta()})
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(retrieve=mock.Mock(return_value=checkout)))),
    )
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/buy/success/wisdom?session_id=cs_paid"):
        billing.session["user_email"] = "buyer@example.com"
        response = billing.buy_success("wisdom")
        purchase_event_id = billing.session["fb_purchase"]["eventID"]

    assert response.status_code == 302
    assert database.records[("users", "buyer@example.com")]["purchases"]["wisdom"] is True
    assert purchase_event_id == "cs_paid"


def test_pack_success_never_claims_an_unverified_purchase(monkeypatch):
    checkout = {
        "payment_status": "unpaid",
        "customer_details": {"email": "buyer@example.com"},
        "metadata": {"pack_slug": "wisdom", "price_id": "price_wisdom"},
        "line_items": {"data": []},
    }
    database = FakeDatabase({("collections", "wisdom"): _bundle_meta()})
    monkeypatch.setattr(
        billing,
        "stripe",
        SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(retrieve=mock.Mock(return_value=checkout)))),
    )
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(billing, "db", database)

    with flask_app.test_request_context("/buy/success/wisdom?session_id=cs_unpaid"):
        billing.session["user_email"] = "buyer@example.com"
        response = billing.buy_success("wisdom")
        flashes = billing.session.get("_flashes") or []

    assert response.status_code == 302
    assert not any(key == ("users", "buyer@example.com") for key, _data, _merge in database.set_calls)
    assert any("still confirming" in message for _category, message in flashes)
