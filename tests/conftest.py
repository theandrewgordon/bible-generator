import os


os.environ.setdefault("OPENAI_API_KEY", "test-key")


import functools
import pytest
from firebase_admin import firestore


@pytest.fixture(autouse=True)
def support_fake_transactions(monkeypatch):
    original = firestore.transactional

    def transactional(fn):
        real = original(fn)

        @functools.wraps(fn)
        def run(txn, *args, **kwargs):
            if type(txn).__name__ == "FakeTransaction":
                with txn.lock:
                    return fn(txn, *args, **kwargs)
            return real(txn, *args, **kwargs)
        return run

    monkeypatch.setattr(firestore, "transactional", transactional)

@pytest.fixture
def plus_visitor(monkeypatch):
    """Opt-in member identity for full-app page tests; keep the real Labs gate."""
    from types import SimpleNamespace
    from flask import g, session
    import app as website

    def member_identity():
        g.flask_dance_google = SimpleNamespace(authorized=True)
        session.update(user_email='member@example.test', user_info={'email':'member@example.test'}, _csrf_token='page-test-token')

    monkeypatch.setattr(website,'google',SimpleNamespace(authorized=True))
    monkeypatch.setattr(website,'get_user_doc',lambda email:{'plan':'family','isPro':True})
    monkeypatch.setattr(website,'has_active_plus',lambda user:True)
    monkeypatch.setitem(website.app.before_request_funcs,None,[member_identity]+[
        fn for fn in website.app.before_request_funcs[None] if fn.__name__ != 'load_user_info'
    ])
