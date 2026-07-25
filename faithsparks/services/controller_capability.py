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
HOST_COOKIE_SALT = "faithsparks-room-host-capability-v1"
INVITE_COOKIE_SALT = "faithsparks-controller-invite-v1"
MAX_AGE_SECONDS = 6 * 60 * 60
INVITE_MAX_AGE_SECONDS = 10 * 60


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


def _host_cookie_name(game: str, code: str) -> str:
    safe_game = "".join(character for character in game if character.isalnum() or character == "_")
    safe_code = "".join(character for character in code.upper() if character.isalnum())
    return f"faithsparks_{safe_game}_host_{safe_code}"


def read_room_host_capability(game: str, code: str) -> str | None:
    signed = request.cookies.get(_host_cookie_name(game, code))
    if not signed:
        return None
    serializer = URLSafeSerializer(current_app.secret_key, salt=HOST_COOKIE_SALT)
    try:
        value = serializer.loads(signed)
    except BadData:
        return None
    if not isinstance(value, dict):
        return None
    if value.get("game") != game or value.get("code") != code.upper():
        return None
    host_key = str(value.get("host_key") or "")
    return host_key or None


def set_room_host_capability(
    response: Any,
    *,
    game: str,
    code: str,
    host_key: str,
) -> None:
    serializer = URLSafeSerializer(current_app.secret_key, salt=HOST_COOKIE_SALT)
    signed = serializer.dumps(
        {"game": game, "code": code.upper(), "host_key": host_key}
    )
    response.set_cookie(
        _host_cookie_name(game, code),
        signed,
        max_age=MAX_AGE_SECONDS,
        secure=request.is_secure,
        httponly=True,
        samesite="Lax",
        path="/",
    )


def _invite_cookie_name(game: str, code: str, role: str) -> str:
    safe_game = "".join(character for character in game if character.isalnum() or character == "_")
    safe_code = "".join(character for character in code.upper() if character.isalnum())
    safe_role = "".join(character for character in role if character.isalnum() or character == "_")
    return f"faithsparks_{safe_game}_invite_{safe_code}_{safe_role}"


def read_controller_invite(game: str, code: str, role: str) -> str | None:
    signed = request.cookies.get(_invite_cookie_name(game, code, role))
    if not signed:
        return None
    serializer = URLSafeSerializer(current_app.secret_key, salt=INVITE_COOKIE_SALT)
    try:
        value = serializer.loads(signed)
    except BadData:
        return None
    if not isinstance(value, dict):
        return None
    if (
        value.get("game") != game
        or value.get("code") != code.upper()
        or value.get("role") != role
    ):
        return None
    token = str(value.get("token") or "")
    return token or None


def set_controller_invite(
    response: Any,
    *,
    game: str,
    code: str,
    role: str,
    token: str,
) -> None:
    serializer = URLSafeSerializer(current_app.secret_key, salt=INVITE_COOKIE_SALT)
    signed = serializer.dumps(
        {"game": game, "code": code.upper(), "role": role, "token": token}
    )
    response.set_cookie(
        _invite_cookie_name(game, code, role),
        signed,
        max_age=INVITE_MAX_AGE_SECONDS,
        secure=request.is_secure,
        httponly=True,
        samesite="Lax",
        path="/",
    )
