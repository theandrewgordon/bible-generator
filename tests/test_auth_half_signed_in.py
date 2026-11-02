from types import SimpleNamespace

import pytest
from flask import g, session

import app


class _FakeGoogle:
    authorized = True

    def __init__(self, status):
        self.status = status

    def get(self, _path):
        return SimpleNamespace(ok=self.status == 200, status_code=self.status, json=lambda: {})


@pytest.mark.parametrize("status, dropped", [(401, True), (403, True), (503, False)])
def test_rejected_token_signs_out_cleanly_but_outage_does_not(monkeypatch, status, dropped):
    deleted = []
    monkeypatch.setattr(app.google_signin_token_storage, "delete", lambda bp: deleted.append(bp))
    with app.app.test_request_context("/worship"):
        g.flask_dance_google = _FakeGoogle(status)
        session["_google_signin_token_ref"] = "handle"
        app.load_user_info()
        assert "user_email" not in session
        assert bool(deleted) is dropped


def test_expired_token_error_signs_out(monkeypatch):
    class TokenExpiredError(Exception):
        pass

    class _Expired(_FakeGoogle):
        def get(self, _path):
            raise TokenExpiredError()

    deleted = []
    monkeypatch.setattr(app.google_signin_token_storage, "delete", lambda bp: deleted.append(bp))
    with app.app.test_request_context("/worship"):
        g.flask_dance_google = _Expired(200)
        app.load_user_info()
        assert deleted
