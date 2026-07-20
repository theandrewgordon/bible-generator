import re
from pathlib import Path

from firebase_admin import firestore
from flask import Blueprint, render_template, redirect, url_for, session, Response, request, flash, send_file, abort, current_app, g
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day
from faithsparks.services.collections import get_collections
from faithsparks.services.lesson_pack import create_lesson_pack
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.firestore import db
from faithsparks.services.storage import signed_url_for_path
from faithsparks.services.usage import _get_user_plan, _get_usage, _quota_for_plan, _update_usage
from faithsparks.util.request_utils import get_client_ip


bp = Blueprint('public', __name__)
MAX_LESSON_PACK_VERSE_LEN = 120
MAX_LESSON_PACK_VERSION_LEN = 12
MAX_LESSON_PACK_AGE_LEN = 24


def _is_signed_in() -> bool:
    return bool(google.authorized and session.get("user_email"))


def _require_login():
    flash("Please sign in to use your lesson packs.", "warning")
    return redirect(url_for("google.login", next=request.url))


def _valid_lesson_pack_slug(slug: str) -> bool:
    return bool(re.fullmatch(r'[a-z0-9\-]+', slug or ""))


def _owned_lesson_pack(slug: str) -> dict | None:
    session_owned = set(session.get("owned_lesson_pack_slugs") or [])
    if not (_valid_lesson_pack_slug(slug) and db and session.get("user_email")):
        return {"slug": slug} if slug in session_owned else None
    email = session["user_email"]
    try:
        docs = (
            db.collection("lesson_packs")
            .where(filter=firestore.FieldFilter("email", "==", email))
            .where(filter=firestore.FieldFilter("slug", "==", slug))
            .limit(1)
            .stream()
        )
        doc = next(docs, None)
        return doc.to_dict() if doc else None
    except Exception as exc:
        try:
            current_app.logger.warning("[%s] lesson pack ownership check failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        return None


def _remember_lesson_pack_slug(slug: str) -> None:
    if not _valid_lesson_pack_slug(slug):
        return
    owned = set(session.get("owned_lesson_pack_slugs") or [])
    owned.add(slug)
    session["owned_lesson_pack_slugs"] = sorted(owned)[-25:]


def _too_long(value: str, max_len: int) -> bool:
    return len(value or "") > max_len


def _lesson_pack_storage_paths(owned: dict, slug: str) -> tuple[str | None, str | None]:
    pdf_storage_path = owned.get("pdf_storage_path") or f"lesson_packs/{slug}/{slug}.pdf"
    zip_storage_path = owned.get("zip_storage_path") or f"lesson_packs/{slug}/{slug}.zip"
    return pdf_storage_path, zip_storage_path


def _lesson_pack_local_paths(slug: str) -> tuple[Path, Path]:
    pack_dir = Path('output') / 'lesson_packs' / slug
    return pack_dir / f'{slug}.pdf', pack_dir / f'{slug}.zip'


def _lesson_pack_artifact_available(owned: dict, slug: str) -> bool:
    pdf_path, zip_path = _lesson_pack_local_paths(slug)
    if pdf_path.exists() or zip_path.exists():
        return True
    pdf_storage_path, zip_storage_path = _lesson_pack_storage_paths(owned, slug)
    return bool(
        (pdf_storage_path and signed_url_for_path(pdf_storage_path, minutes=10))
        or (zip_storage_path and signed_url_for_path(zip_storage_path, minutes=10))
    )


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
            version_prefill=(request.args.get('version') or 'web').strip().lower(),
            age_prefill=(request.args.get('age') or '6-8').strip(),
            proverb_of_day=get_proverb_of_day(),
        )

    if not _is_signed_in():
        return _require_login()

    verse_input = (request.form.get('verse') or '').strip()
    version = (request.form.get('version') or 'web').strip().lower()
    age_bracket = (request.form.get('age_bracket') or '6-8').strip()
    use_cursive = (request.form.get('use_cursive') or '').lower() in {'1', 'true', 'yes', 'on'}
    if not verse_input:
        flash('Please enter a verse reference.', 'warning')
        return redirect(url_for('public.lesson_pack'))
    if (
        _too_long(verse_input, MAX_LESSON_PACK_VERSE_LEN)
        or _too_long(version, MAX_LESSON_PACK_VERSION_LEN)
        or _too_long(age_bracket, MAX_LESSON_PACK_AGE_LEN)
    ):
        flash("Please shorten the lesson pack details and try again.", "warning")
        return redirect(url_for('public.lesson_pack'))

    user_key = session.get("user_email") or get_client_ip()
    ip_key = get_client_ip()
    user_limit = check_rate_limit("lesson_pack:user", user_key, limit=6, window_seconds=60 * 60)
    ip_limit = check_rate_limit("lesson_pack:ip", ip_key, limit=18, window_seconds=60 * 60)
    if not user_limit.allowed or not ip_limit.allowed:
        flash("You've made several lesson packs recently. Please wait a bit before creating another.", "warning")
        return redirect(url_for('public.lesson_pack'))

    user_email = session.get('user_email')
    plan = _get_user_plan(user_email)
    monthly_limit, lifetime_limit = _quota_for_plan(plan)
    used_lifetime, used_monthly = _get_usage(user_email)
    if (
        (monthly_limit is not None and used_monthly >= monthly_limit)
        or (lifetime_limit is not None and used_lifetime >= lifetime_limit)
    ):
        flash("You’ve used all your credits for this month.", "warning")
        return redirect(url_for('public.lesson_pack'))

    try:
        result = create_lesson_pack(
            user_email=user_email,
            verse_input=verse_input,
            version=version,
            age_bracket=age_bracket,
            use_cursive=use_cursive,
        )
    except Exception as exc:
        try:
            current_app.logger.exception("[%s] lesson pack creation failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        flash("We couldn't create that lesson pack yet. Please check the verse and try again.", 'warning')
        return redirect(url_for('public.lesson_pack', verse=verse_input, version=version, age=age_bracket))

    _remember_lesson_pack_slug(result['slug'])
    _update_usage(user_email, 1)
    return redirect(url_for('public.lesson_pack_result', slug=result['slug']))


@bp.route('/lesson-pack/result/<slug>')
def lesson_pack_result(slug):
    if not _is_signed_in():
        return _require_login()
    # Sanitize slug: only allow safe filesystem characters.
    if not _valid_lesson_pack_slug(slug):
        abort(404)
    owned = _owned_lesson_pack(slug)
    if not owned:
        abort(404)
    if not _lesson_pack_artifact_available(owned, slug):
        flash('That pack is no longer available. Build a new one below.', 'warning')
        return redirect(url_for('public.lesson_pack'))
    _, zip_path = _lesson_pack_local_paths(slug)
    title = owned.get('title') or slug.replace('-lesson-pack-', ': ').replace('-', ' ').title()
    return render_template(
        'lesson_pack_result.html',
        slug=slug,
        title=title,
        has_coloring=(zip_path.exists() and zip_path.stat().st_size > 50_000),  # rough proxy
    )


@bp.route('/lesson-pack/download/<slug>')
def lesson_pack_download(slug):
    if not _is_signed_in():
        return _require_login()
    if not _valid_lesson_pack_slug(slug):
        abort(404)
    owned = _owned_lesson_pack(slug)
    if not owned:
        abort(404)
    pdf_path, zip_path = _lesson_pack_local_paths(slug)
    if pdf_path.exists():
        return send_file(
            pdf_path,
            as_attachment=True,
            download_name=f'{slug}.pdf',
            mimetype='application/pdf',
        )
    if zip_path.exists():
        return send_file(
            zip_path,
            as_attachment=True,
            download_name=f'{slug}.zip',
            mimetype='application/zip',
        )
    pdf_storage_path, zip_storage_path = _lesson_pack_storage_paths(owned, slug)
    signed_pdf = signed_url_for_path(pdf_storage_path) if pdf_storage_path else None
    if signed_pdf:
        return redirect(signed_pdf)
    signed_zip = signed_url_for_path(zip_storage_path) if zip_storage_path else None
    if signed_zip:
        return redirect(signed_zip)
    abort(404)


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
