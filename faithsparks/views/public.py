from flask import Blueprint, render_template, redirect, url_for, session, Response
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day
from faithsparks.services.collections import get_collections


bp = Blueprint('public', __name__)


@bp.route('/')
def index():
    if google.authorized:
        nxt = session.pop("after_login_next", None)
        if nxt:
            return redirect(nxt)
    game_of_week = _get_game_of_week()
    return render_template(
        'index.html',
        user_info=session.get('user_info'),
        proverb_of_day=get_proverb_of_day(),
        game_of_week=game_of_week,
    )


@bp.route('/about')
def about():
    return render_template('about.html')


@bp.route('/start-here')
def start_here():
    return render_template(
        'start_here.html',
        proverb_of_day=get_proverb_of_day(),
        game_of_week=_get_game_of_week(),
    )


@bp.route('/healthz', methods=['GET', 'HEAD'])
def healthz():
    return Response("ok", 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    })


def _get_game_of_week():
    try:
        items = get_collections(show_all=False)
        games = [c for c in items if (c.get("kind") or "bundle") == "game"]
        games.sort(key=lambda c: (int(c.get("order") or 9999), c.get("title", "")))
        return games[0] if games else None
    except Exception:
        return None
