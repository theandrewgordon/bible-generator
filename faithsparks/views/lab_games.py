import os

from flask import Blueprint, render_template, redirect, request, session

bp = Blueprint("lab_games", __name__, url_prefix="/labs/games")

LAB_GAMES = (
    {
        "slug": "whits-end",
        "name": "Whit's End",
        "description": "An interactive Odyssey-inspired prototype set around Whit's End.",
        "maturity": "sandbox",
        "available": False,
    },
    {
        "slug": "mail-sorting",
        "name": "Odyssey Mail Sorting",
        "description": "Sort and deliver mail around Odyssey as the levels progress.",
        "maturity": "sandbox",
        "available": False,
    },
    {
        "slug": "bernard-window-washing",
        "name": "Bernard's Window Washing",
        "description": "A level-based window-washing prototype with tool-selection challenges.",
        "maturity": "sandbox",
        "available": False,
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


@bp.get("")
@bp.get("/")
def index():
    email = _signed_in_email()
    return render_template(
        "lab_games.html",
        games=LAB_GAMES,
        signed_in=bool(email),
        access_denied=bool(email and not _has_beta_access(email)),
        noindex=True,
    )


@bp.get("/<slug>")
def play(slug: str):
    game = next((item for item in LAB_GAMES if item["slug"] == slug), None)
    if not game:
        return render_template("404.html"), 404

    email = _signed_in_email()
    if not email:
        return redirect(f"/login/google/start?next={request.path}")
    if not _has_beta_access(email):
        return render_template(
            "lab_games.html",
            games=LAB_GAMES,
            signed_in=True,
            access_denied=True,
            noindex=True,
        ), 403

    return render_template(
        "lab_game_detail.html",
        game=game,
        noindex=True,
    )
