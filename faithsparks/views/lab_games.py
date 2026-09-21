import os
from pathlib import Path

from flask import Blueprint, render_template, redirect, request, session, send_file

bp = Blueprint("lab_games", __name__, url_prefix="/labs/games")

_GAME_DIR = Path(__file__).resolve().parents[1] / "content" / "lab_games"

_SHARED_ASSETS = {"odyssey-core.js", "odyssey-ui.css"}

LAB_GAMES = (
    {
        "slug": "whits-end",
        "game_id": "whits-end",
        "aliases": ("whits-end-ice-cream",),
        "name": "Whit's End Ice Cream Shop",
        "description": "Take customer orders at Whit's End, make ice cream, shakes, and sodas, and deliver each order to the right customer.",
        "maturity": "sandbox",
        "file": "whits-end-ice-cream.html",
        "available": True,
    },
    {
        "slug": "bernard-window-washing",
        "game_id": "bernard-window-washing",
        "aliases": (),
        "name": "Bernard's Window Washing",
        "description": "Wash Whit's End windows with the right cleaner and squeegee as new messes and tools unlock.",
        "maturity": "sandbox",
        "file": "bernard-window-washing.html",
        "available": True,
    },
    {
        "slug": "wooten-mail-route",
        "game_id": "wooten-mail-sorting",
        "aliases": ("mail-sorting",),
        "name": "Wooten's Mail Route",
        "description": "Sort Odyssey mail, then unlock delivery routes that rotate with sorting levels.",
        "maturity": "sandbox",
        "file": "wooten-mail-route.html",
        "available": True,
    },
    {
        "slug": "timothy-center-horse-racing",
        "game_id": "timothy-center-horse-racing",
        "aliases": (),
        "name": "Timothy Center Horse Racing",
        "description": "Choose a horse and race through increasingly challenging Timothy Center courses.",
        "maturity": "sandbox",
        "file": "timothy-center-horse-racing.html",
        "available": True,
    },
)


def _signed_in_email() -> str | None:
    return (session.get("user_email") or "").strip().casefold() or None


def _beta_allowlist() -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv("LAB_GAMES_BETA_EMAILS", "").split(",")
        if item.strip()
    }


def _has_beta_access(email: str | None) -> bool:
    allowlist = _beta_allowlist()
    return not allowlist or bool(email and email in allowlist)


def _access_denied():
    return (
        render_template(
            "lab_games.html",
            games=LAB_GAMES,
            signed_in=True,
            access_denied=True,
            noindex=True,
        ),
        403,
    )


def _require_access():
    email = _signed_in_email()
    if not email:
        return redirect(f"/login/google/start?next={request.path}")
    if not _has_beta_access(email):
        return _access_denied()
    return None


def _game_for_slug(slug: str) -> dict | None:
    for game in LAB_GAMES:
        if slug == game["slug"] or slug in game.get("aliases", ()):
            return game
    return None


@bp.get("")
@bp.get("/")
def index():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    return render_template(
        "lab_games.html",
        games=LAB_GAMES,
        signed_in=True,
        access_denied=False,
        noindex=True,
    )


@bp.get("/assets/<filename>")
def asset(filename: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    if filename not in _SHARED_ASSETS:
        return render_template("404.html"), 404

    asset_path = _GAME_DIR / filename
    if not asset_path.is_file():
        return render_template("404.html"), 404

    mimetype = "text/javascript" if filename.endswith(".js") else "text/css"
    response = send_file(asset_path, mimetype=mimetype)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response


@bp.get("/<slug>")
def play(slug: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    game = _game_for_slug(slug)
    if not game:
        return render_template("404.html"), 404

    game_path = _GAME_DIR / game["file"]
    if not game_path.is_file():
        return render_template("404.html"), 404

    response = send_file(game_path, mimetype="text/html")
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response
