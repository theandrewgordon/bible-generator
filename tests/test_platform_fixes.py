"""Platform/ops audit 2026-10-14: worker recycling, private packs, conversions, errors."""

import os
import runpy
import threading
import time
from pathlib import Path
from unittest import mock

import app
from faithsparks.services import error_reporting
from faithsparks.services import worship_presentations as wp

ROOT = Path(__file__).resolve().parents[1]
CSRF = "test-csrf-token"


def test_single_worker_is_never_recycled_mid_service():
    conf = runpy.run_path(str(ROOT / "gunicorn.conf.py"))
    assert conf["workers"] == 1 and conf["threads"] >= 16
    assert "max_requests" not in conf
    assert "max-requests" not in (ROOT / "Dockerfile").read_text()


def test_paid_packs_are_not_public_and_unlock_still_works():
    client = app.app.test_client()
    assert client.get("/static/bundles/30_Pack_MegaPack.zip").status_code == 404
    assert client.get("/downloads/file/mega_bundle").status_code == 302  # locked
    with client.session_transaction() as sess:
        sess["_csrf_token"] = CSRF
    client.post("/downloads", data={"password": "sparks-mega-bundle"}, headers={"X-CSRF-Token": CSRF})
    response = client.get("/downloads/file/mega_bundle")
    assert response.status_code == 200 and len(response.data) > 1_000_000


def test_pack_passwords_can_be_rotated_from_env():
    with mock.patch.dict(os.environ, {"PACK_PASSWORDS": "mega_bundle=New-Secret"}):
        assert app.get_pack_by_password("sparks-mega-bundle") is None
        assert app.get_pack_by_password(" new-secret ")["id"] == "mega_bundle"
        assert app.get_pack_by_password("sparks-esv-print")["id"] == "esv_print"


def test_presentation_conversions_run_one_at_a_time(tmp_path):
    running, peak = [0], [0]
    lock = threading.Lock()

    def slow(*args, **kwargs):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        time.sleep(0.2)
        with lock:
            running[0] -= 1
        return []

    with mock.patch.object(wp, "_render_presentation", side_effect=slow):
        threads = [threading.Thread(target=wp.render_presentation, args=("x.pdf", ".pdf", tmp_path)) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    assert peak[0] == 1


def test_friendly_500_page_and_error_reporting_off_without_dsn():
    with app.app.test_request_context("/somewhere"):
        body, status = app.handle_500(Exception("boom"))
    assert status == 500 and "Something went wrong" in body
    with mock.patch.dict(os.environ, {"SENTRY_DSN": ""}):
        assert error_reporting.init_error_reporting("test") is False
    event = {"request": {"cookies": {"session": "x"}, "data": "secret", "url": "/x"}, "user": {"email": "a@x.com"}}
    scrubbed = error_reporting._scrub(event, None)
    assert "user" not in scrubbed and "cookies" not in scrubbed["request"] and "data" not in scrubbed["request"]
