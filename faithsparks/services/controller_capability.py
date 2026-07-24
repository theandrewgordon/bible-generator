"""Small, signed controller capabilities that survive an oversized Flask session.

Controller invites are single-use.  Once one is claimed, keep the resulting
room-scoped capability in its own host-only cookie so a browser does not lose
control when its unrelated Flask session cookie is rejected for being too big.
"""

from __future__ import annotations

from typing import Any

from flask import current_app, request
from itsdangerous import BadData, URLSafeSerializer


COOKIE_NAME = "faithsparks_game_controller"
COOKIE_SALT = "faithsparks-controller-capability-v1"
MAX_AGE_SECONDS = 6 * 60 * 60


def _serializer() -> URLSafeSerializer:
    return URLSafeSerializer(current_app.secret_key, salt=COOKIE_SALT)


def read_controller_capability(game: str, code: str) -> dict[str, str] | None:
    signed = request.cookies.get(COOKIE_NAME)
    if not signed:
        return None
    try:
        value = _serializer().loads(signed)
    except BadData:
        return None
    if not isinstance(value, dict):
        return None
    if value.get("game") != game or value.get("code") != code.upper():
        return None
    capability = {
        key: str(value.get(key) or "")
        for key in ("role", "generation", "player_id")
    }
    if not capability["role"] or not capability["generation"]:
        return None
    return capability


def set_controller_capability(
    response: Any,
    *,
    game: str,
    code: str,
    role: str,
    generation: str,
    player_id: str | None = None,
) -> None:
    signed = _serializer().dumps(
        {
            "game": game,
            "code": code.upper(),
            "role": role,
            "generation": generation,
            "player_id": player_id or "",
        }
    )
    response.set_cookie(
        COOKIE_NAME,
        signed,
        max_age=MAX_AGE_SECONDS,
        secure=request.is_secure,
        httponly=True,
        samesite="Lax",
        path="/",
    )
