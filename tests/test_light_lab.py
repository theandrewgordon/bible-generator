"""Light Lab stays admin-only and preserves a private, CSRF-protected memory log."""
import json
import os
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask import Flask

from faithsparks.views import public


class FakeStateDoc:
    def __init__(self):
        self.value = None

    def get(self):
        return SimpleNamespace(exists=self.value is not None, to_dict=lambda: self.value)

    def set(self, data, merge=True):
        self.value = data


class FakeStore:
    def __init__(self):
        self.doc = FakeStateDoc()

    def collection(self, _name):
        return self

    def document(self, _name):
        return self

    def get(self):
        return self.doc.get()

    def set(self, data, merge=True):
        self.doc.set(data, merge=merge)


@pytest.fixture
def client(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    app = Flask(__name__, template_folder=str(root / "templates"))
    app.secret_key = "light-lab-test"
    app.jinja_env.globals["csrf_token"] = lambda: "csrf-test"
    app.register_blueprint(public.bp)
    monkeypatch.setattr(public, "google", SimpleNamespace(authorized=True))
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.test")
    store = FakeStore()
    monkeypatch.setattr(public, "db", lambda: store)
    return app.test_client()


def as_user(client, email):
    with client.session_transaction() as s:
        s["user_email"] = email
        s["_csrf_token"] = "csrf-test"


def test_private_page_and_api_reject_unprivileged_users(client):
    assert client.get("/labs/light-lab").status_code == 404
    assert client.get("/labs/light-lab/state").status_code == 404
    as_user(client, "viewer@example.test")
    assert client.get("/labs/light-lab").status_code == 404
    assert client.get("/labs/light-lab/state").status_code == 404
    assert client.post("/labs/light-lab/state", json={"state": {}}, headers={"X-CSRF-Token": "csrf-test"}).status_code == 404


def test_admin_can_see_private_game_with_noindex_and_inline_assets(client):
    as_user(client, "admin@example.test")
    response = client.get("/labs/light-lab")
    assert response.status_code == 200
    assert b"Light Lab" in response.data
    assert b"Professor Atlas" in response.data
    assert b"Dr. Lumi" in response.data
    assert b"Fourteen" in response.data
    assert b"noindex" in response.data
    assert response.headers["Cache-Control"] == "private, no-store"
    assert "noindex" in response.headers["X-Robots-Tag"]


def test_csrf_required_and_account_log_roundtrips(client):
    as_user(client, "admin@example.test")
    state = {
        "goal": 12,
        "verses": [{"id": "v1", "reference": "Test 1:1", "text": "A parent enters this example verse."}],
        "players": [{"id": "p1", "name": "Explorer"}],
        "progress": {"p1": {"v1": {"attempts": 1, "correct": 1, "mastered": False, "history": []}}},
    }
    uri = "/labs/light-lab/state"
    assert client.post(uri, json={"state": state}).status_code == 403
    assert client.post(uri, json={"state": state}, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    bad = {**state, "verses": [{"id": "v1", "reference": "X", "text": ""}]}
    assert client.post(uri, json={"state": bad}, headers={"X-CSRF-Token": "csrf-test"}).status_code == 400
    result = client.post(uri, json={"state": state}, headers={"X-CSRF-Token": "csrf-test"})
    assert result.status_code == 200
    assert result.json["ok"] is True
    loaded = client.get(uri)
    assert loaded.status_code == 200
    assert loaded.json["state"] == state


@pytest.mark.skipif(not shutil.which("node"), reason="Node is not installed")
def test_bundled_javascript_syntax():
    path = Path(__file__).resolve().parents[1] / "templates" / "labs_light_lab_js.html"
    check = subprocess.run(["node", "--check"], input=path.read_text(), capture_output=True, text=True, timeout=15)
    assert check.returncode == 0, check.stderr
