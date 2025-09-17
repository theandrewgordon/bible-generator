from flask import Blueprint, render_template, redirect, url_for, session, Response
from flask_dance.contrib.google import google


bp = Blueprint('public', __name__)


@bp.route('/')
def index():
    if google.authorized:
        nxt = session.pop("after_login_next", None)
        if nxt:
            return redirect(nxt)
    return render_template('index.html', user_info=session.get('user_info'))


@bp.route('/about')
def about():
    return render_template('about.html')


@bp.route('/healthz', methods=['GET', 'HEAD'])
def healthz():
    return Response("ok", 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    })

