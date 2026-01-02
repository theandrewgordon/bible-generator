from flask import Blueprint, render_template, redirect, url_for, session, Response
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day


bp = Blueprint('public', __name__)


@bp.route('/')
def index():
    if google.authorized:
        nxt = session.pop("after_login_next", None)
        if nxt:
            return redirect(nxt)
    return render_template(
        'index.html',
        user_info=session.get('user_info'),
        proverb_of_day=get_proverb_of_day(),
    )


@bp.route('/about')
def about():
    return render_template('about.html')


@bp.route('/start-here')
def start_here():
    return render_template('start_here.html', proverb_of_day=get_proverb_of_day())


@bp.route('/healthz', methods=['GET', 'HEAD'])
def healthz():
    return Response("ok", 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    })
