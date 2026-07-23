import time

import pytest
from google.api_core import exceptions as google_exceptions

from app import app
from faithsparks.views import act_it_out, bible_bee


class QuotaLimitedRoomRef:
    def get(self, **_kwargs):
        raise google_exceptions.ResourceExhausted("test quota")

    def set(self, *_args, **_kwargs):
        raise google_exceptions.ResourceExhausted("test quota")


@pytest.fixture(params=[act_it_out, bible_bee])
def room_module(request, monkeypatch):
    module = request.param
    module._local_rooms.clear()
    module._room_cache_loaded_at.clear()
    monkeypatch.setattr(module, "_room_ref", lambda _code: QuotaLimitedRoomRef())
    yield module
    module._local_rooms.clear()
    module._room_cache_loaded_at.clear()


def _active_room():
    now = time.time()
    return {
        "phase": "lobby",
        "updated_at": now,
        "expires_at": now + 3600,
    }


def test_fresh_room_cache_avoids_firestore_read(room_module):
    room_module._cache_room("ABCD", _active_room())

    assert room_module._get_room("ABCD")["phase"] == "lobby"


def test_stale_room_cache_survives_firestore_quota_error(room_module):
    room_module._cache_room("ABCD", _active_room())
    room_module._room_cache_loaded_at["ABCD"] = 0

    with app.app_context():
        assert room_module._get_room("ABCD")["phase"] == "lobby"


def test_room_write_remains_available_during_firestore_quota_error(room_module):
    room = _active_room()

    with app.app_context():
        room_module._set_room("ABCD", room)

    assert room_module._local_rooms["ABCD"]["phase"] == "lobby"


@pytest.mark.parametrize(
    ("module", "path"),
    [
        (act_it_out, "/api/group-games/act-it-out/rooms/ABCD"),
        (bible_bee, "/api/family-bible-bee/rooms/ABCD"),
    ],
)
def test_uncached_room_returns_retryable_service_response(monkeypatch, module, path):
    module._local_rooms.clear()
    module._room_cache_loaded_at.clear()
    monkeypatch.setattr(module, "_room_ref", lambda _code: QuotaLimitedRoomRef())

    response = app.test_client().get(path)

    assert response.status_code == 503
    assert response.headers["Retry-After"] == "5"
    assert "retry shortly" in response.get_json()["error"].lower()
