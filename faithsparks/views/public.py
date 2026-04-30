from flask import Blueprint, render_template, redirect, url_for, session, Response, request, flash, send_file
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day
from faithsparks.services.collections import get_collections
from faithsparks.services.lesson_pack import create_lesson_pack


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


@bp.route('/lesson-pack', methods=['GET', 'POST'])
def lesson_pack():
    if request.method == 'GET':
        return render_template(
            'lesson_pack.html',
            verse_prefill=(request.args.get('verse') or '').strip(),
            version_prefill=(request.args.get('version') or 'nlt').strip().lower(),
            age_prefill=(request.args.get('age') or '6-8').strip(),
            proverb_of_day=get_proverb_of_day(),
        )

    verse_input = (request.form.get('verse') or '').strip()
    version = (request.form.get('version') or 'nlt').strip().lower()
    age_bracket = (request.form.get('age_bracket') or '6-8').strip()
    use_cursive = (request.form.get('use_cursive') or '').lower() in {'1', 'true', 'yes', 'on'}
    if not verse_input:
        flash('Please enter a verse reference.', 'warning')
        return redirect(url_for('public.lesson_pack'))

    try:
        result = create_lesson_pack(
            user_email=session.get('user_email', 'anonymous'),
            verse_input=verse_input,
            version=version,
            age_bracket=age_bracket,
            use_cursive=use_cursive,
        )
    except Exception as exc:
        flash(str(exc), 'warning')
        return redirect(url_for('public.lesson_pack', verse=verse_input, version=version, age=age_bracket))

    return send_file(
        result['zip_path'],
        as_attachment=True,
        download_name=f"{result['slug']}.zip",
        mimetype='application/zip',
    )


@bp.route('/scripture-attribution')
def scripture_attribution():
    return render_template('scripture_attribution.html')


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
