import json
import re
from pathlib import Path

from firebase_admin import firestore
from flask import Blueprint, render_template, redirect, url_for, session, Response, request, flash, send_file, abort, current_app, g
from flask_dance.contrib.google import google
from faithsparks.util.proverb import get_proverb_of_day
from faithsparks.services.collections import get_collections
from faithsparks.services.lesson_pack import (
    LESSON_PACK_AGE_PROFILES,
    LESSON_PACK_MODES,
    LESSON_PACK_SESSION_MINUTES,
    available_lesson_pack_versions,
    create_lesson_pack,
)
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.firestore import db
from faithsparks.services.storage import signed_url_for_path
from faithsparks.util.request_utils import get_client_ip
from faithsparks.products import MATURITY, products_for


bp = Blueprint('public', __name__)
MAX_LESSON_PACK_VERSE_LEN = 120
MAX_LESSON_PACK_VERSION_LEN = 12
MAX_LESSON_PACK_AGE_LEN = 24


def _is_signed_in() -> bool:
    return bool(google.authorized and session.get("user_email"))


def _require_login(next_url: str | None = None):
    flash("Please sign in to use your lesson packs.", "warning")
    return redirect(url_for("google.login", next=next_url or request.url))


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
        if doc:
            return doc.to_dict()
        return {"slug": slug} if slug in session_owned else None
    except Exception as exc:
        try:
            current_app.logger.warning("[%s] lesson pack ownership check failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        return {"slug": slug} if slug in session_owned else None


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


def _lesson_pack_local_manifest(slug: str) -> dict:
    manifest_path = Path("output") / "lesson_packs" / slug / f"{slug}-manifest.json"
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _lesson_pack_result_details(owned: dict, slug: str) -> dict:
    manifest = _lesson_pack_local_manifest(slug)
    raw_components = owned.get("components") or manifest.get("components") or {}
    components = raw_components if isinstance(raw_components, dict) else {}
    normalized_components = {
        "worksheet": bool(components.get("worksheet", True)),
        "coloring": bool(components.get("coloring", False)),
        "word_search": bool(components.get("word_search", True)),
        "parent_guide": bool(components.get("parent_guide", True)),
        "combined_pdf": bool(components.get("combined_pdf", owned.get("pdf_storage_path"))),
    }
    warnings = owned.get("warnings") or manifest.get("warnings") or []
    if not isinstance(warnings, list):
        warnings = []
    pdf_path, _ = _lesson_pack_local_paths(slug)
    has_pdf = pdf_path.exists() or bool(owned.get("pdf_storage_path")) or normalized_components["combined_pdf"]
    lesson_mode = owned.get("lesson_mode") or manifest.get("lessonMode") or "house-church"
    session_minutes = owned.get("session_minutes") or manifest.get("sessionMinutes") or 40
    include_coloring = owned.get("include_coloring")
    if include_coloring is None:
        include_coloring = manifest.get("includeColoring", normalized_components["coloring"])
    scripture_verified = owned.get("scripture_verified")
    if scripture_verified is None:
        scripture_verified = manifest.get("scriptureVerified", False)
    return {
        "components": normalized_components,
        "status": owned.get("status") or manifest.get("status") or "ready",
        "warnings": [str(item) for item in warnings if str(item).strip()][:5],
        "download_format": "PDF" if has_pdf else "ZIP",
        "lesson_mode": lesson_mode if lesson_mode in LESSON_PACK_MODES else "house-church",
        "session_minutes": int(session_minutes) if str(session_minutes).isdigit() else 40,
        "include_coloring": bool(include_coloring),
        "scripture_verified": bool(scripture_verified),
        "mode_label": LESSON_PACK_MODES.get(lesson_mode, LESSON_PACK_MODES["house-church"])["short_label"],
    }


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


@bp.route('/copyright')
def copyright_policy():
    return render_template('copyright_policy.html')


@bp.route('/terms')
def terms():
    return render_template('terms.html')


@bp.route('/privacy')
def privacy():
    return render_template('privacy.html')


@bp.route('/start-here')
def start_here():
    return render_template(
        'start_here.html',
        proverb_of_day=get_proverb_of_day(),
        game_of_week=_get_game_of_week(),
    )


@bp.get('/prepare')
def prepare():
    return render_template('prepare.html', products=products_for('prepare'))


@bp.get('/play')
def play():
    return render_template('play.html', products=products_for('play'))


@bp.get('/labs')
def labs():
    return render_template(
        'labs.html',
        products=products_for('labs'),
        maturity_labels=MATURITY,
        noindex=True,
    )


@bp.route('/lesson-pack', methods=['GET', 'POST'])
def lesson_pack():
    if request.method == 'GET':
        available_versions = available_lesson_pack_versions()
        version_prefill = (request.args.get('version') or 'web').strip().lower()
        age_prefill = (request.args.get('age') or '6-8').strip()
        mode_prefill = (request.args.get('mode') or 'house-church').strip().lower()
        try:
            minutes_prefill = int(request.args.get('minutes') or 40)
        except (TypeError, ValueError):
            minutes_prefill = 40
        if version_prefill not in available_versions:
            version_prefill = 'web'
        if age_prefill not in LESSON_PACK_AGE_PROFILES:
            age_prefill = '6-8'
        if mode_prefill not in LESSON_PACK_MODES:
            mode_prefill = 'house-church'
        if minutes_prefill not in LESSON_PACK_SESSION_MINUTES:
            minutes_prefill = 40
        return render_template(
            'lesson_pack.html',
            verse_prefill=(request.args.get('verse') or '').strip(),
            version_prefill=version_prefill,
            age_prefill=age_prefill,
            cursive_prefill=(request.args.get('cursive') or '').strip().lower() in {'1', 'true', 'yes', 'on'},
            mode_prefill=mode_prefill,
            minutes_prefill=minutes_prefill,
            coloring_prefill=(request.args.get('coloring') or '').strip().lower() in {'1', 'true', 'yes', 'on'},
            lesson_pack_modes=LESSON_PACK_MODES,
            available_versions=available_versions,
            selection_from_url=any(key in request.args for key in ('verse', 'version', 'age', 'cursive', 'mode', 'minutes', 'coloring')),
            lesson_pack_signed_in=_is_signed_in(),
            proverb_of_day=get_proverb_of_day(),
            description="Build a low-prep, all-age house church gathering pack from one verified Bible passage.",
            og_description="A fast house church lesson pack with a gathering plan, worksheet, word search, and optional coloring page.",
        )

    verse_input = (request.form.get('verse') or '').strip()
    version = (request.form.get('version') or 'web').strip().lower()
    age_bracket = (request.form.get('age_bracket') or '6-8').strip()
    use_cursive = (request.form.get('use_cursive') or '').lower() in {'1', 'true', 'yes', 'on'}
    lesson_mode = (request.form.get('lesson_mode') or 'house-church').strip().lower()
    include_coloring = (request.form.get('include_coloring') or '').lower() in {'1', 'true', 'yes', 'on'}
    try:
        session_minutes = int(request.form.get('session_minutes') or 40)
    except (TypeError, ValueError):
        session_minutes = 40

    def builder_url(**overrides):
        values = {
            "verse": verse_input,
            "version": version,
            "age": age_bracket,
            "mode": lesson_mode,
            "minutes": session_minutes,
            "cursive": "1" if use_cursive else None,
            "coloring": "1" if include_coloring else None,
        }
        values.update(overrides)
        return url_for('public.lesson_pack', **values)
    if not verse_input:
        flash('Please enter a verse reference.', 'warning')
        return redirect(url_for('public.lesson_pack'))
    if (
        version not in available_lesson_pack_versions()
        or age_bracket not in LESSON_PACK_AGE_PROFILES
        or lesson_mode not in LESSON_PACK_MODES
        or session_minutes not in LESSON_PACK_SESSION_MINUTES
    ):
        flash("Choose one of the available formats, lengths, versions, and age ranges.", "warning")
        return redirect(builder_url(version='web', age='6-8', mode='house-church', minutes=40))
    if (
        _too_long(verse_input, MAX_LESSON_PACK_VERSE_LEN)
        or _too_long(version, MAX_LESSON_PACK_VERSION_LEN)
        or _too_long(age_bracket, MAX_LESSON_PACK_AGE_LEN)
    ):
        flash("Please shorten the lesson pack details and try again.", "warning")
        return redirect(url_for('public.lesson_pack'))
    if not _is_signed_in():
        next_url = builder_url()
        return _require_login(next_url)

    user_key = session.get("user_email") or get_client_ip()
    ip_key = get_client_ip()
    user_limit = check_rate_limit("lesson_pack:user", user_key, limit=6, window_seconds=60 * 60)
    ip_limit = check_rate_limit("lesson_pack:ip", ip_key, limit=18, window_seconds=60 * 60)
    if not user_limit.allowed or not ip_limit.allowed:
        flash("You've made several lesson packs recently. Please wait a bit before creating another.", "warning")
        return redirect(url_for('public.lesson_pack'))

    try:
        result = create_lesson_pack(
            user_email=session.get('user_email'),
            verse_input=verse_input,
            version=version,
            age_bracket=age_bracket,
            use_cursive=use_cursive,
            lesson_mode=lesson_mode,
            session_minutes=session_minutes,
            include_coloring=include_coloring,
        )
    except ValueError as exc:
        flash(str(exc) or "We couldn't build that lesson pack.", 'warning')
        return redirect(builder_url())
    except Exception as exc:
        try:
            current_app.logger.exception("[%s] lesson pack creation failed: %s", getattr(g, "req_id", ""), exc)
        except Exception:
            pass
        if "could not be saved reliably" in str(exc).lower():
            flash("Your pages were built, but we could not save them reliably. Please try again.", 'warning')
        else:
            flash("We couldn't create that lesson pack yet. Please check the verse and try again.", 'warning')
        return redirect(builder_url())

    _remember_lesson_pack_slug(result['slug'])
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
    manifest = _lesson_pack_local_manifest(slug)
    title = owned.get('title') or manifest.get('title') or slug.replace('-lesson-pack-', ': ').replace('-', ' ').title()
    details = _lesson_pack_result_details(owned, slug)
    return render_template(
        'lesson_pack_result.html',
        slug=slug,
        title=title,
        verse=owned.get('verse') or manifest.get('verse') or '',
        version=str(owned.get('version') or manifest.get('version') or 'web').lower(),
        age_bracket=owned.get('age_bracket') or manifest.get('ageBracket') or '6-8',
        use_cursive=bool(owned.get('use_cursive') if owned.get('use_cursive') is not None else manifest.get('useCursive')),
        noindex=True,
        **details,
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
    flash('That pack is no longer available. Build it again below.', 'warning')
    return redirect(url_for('public.lesson_pack'))


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
