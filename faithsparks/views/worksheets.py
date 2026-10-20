import json
import os
import re
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from flask import (
    Blueprint,
    render_template,
    request,
    send_file,
    redirect,
    url_for,
    session,
    flash,
    current_app,
    g,
    jsonify,
    abort,
    after_this_request,
)
from firebase_admin import firestore

from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
    moderate_text_block,
    VERIFIED_SOURCES,
    normalize_reference_title,
    normalize_verse_data,
    preserve_letter_suffix,
)
from build_pdf import generate_pdf
from PIL import Image, ImageDraw, ImageFont

from faithsparks.services.firestore import db
from faithsparks.services.storage import download_from_storage, upload_to_storage, signed_url_for_path
from faithsparks.services.usage import (
    _get_user_plan,
    _quota_for_plan,
    _get_usage,
    _reserve_usage,
    _refund_usage,
    _get_free_slugs,
)
from faithsparks.services.collections import get_collection_meta
from faithsparks.services.rate_limit import check_rate_limit
# Worksheets accept ESV/NLT through the checked-AI path when no key is set.
from faithsparks.services.scripture import copywork_translation_ids as available_translation_ids
from faithsparks.util.slug import normalize_slug
from faithsparks.util.request_utils import get_client_ip, get_request_payload, log_request_summary
from faithsparks.util.proverb import get_proverb_of_day


MAX_WORKSHEETS_PER_REQUEST = 30
OPENAI_BATCH_SIZE = 10
MAX_VERSE_INPUT_LEN = 1200
MAX_CUSTOM_TEXT_LEN = 600  # what fits on one worksheet page
MAX_CUSTOM_TITLE_LEN = 120
MAX_CUSTOM_PROMPT_LEN = 300
ANONYMOUS_SAMPLE_LIMIT = 1
LEARNER_LEVEL_LINES = {
    "beginner": 5,
    "growing": 3,
    "confident": 2,
}


def _safe_local_path(base_dir: str, filename: str, allowed_exts: set[str] | None = None) -> Path | None:
    if not filename:
        return None
    if allowed_exts and Path(filename).suffix.lower() not in allowed_exts:
        return None
    base = Path(base_dir).resolve()
    candidate = (base / filename).resolve()
    if candidate != base and base not in candidate.parents:
        return None
    return candidate


def _worksheet_doc_for_user(filename: str):
    if not db:
        return None
    user_email = session.get("user_email")
    if not user_email or not filename:
        return None
    docs = (
        db.collection("worksheets")
        .where(filter=firestore.FieldFilter("email", "==", user_email))
        .where(filter=firestore.FieldFilter("filename", "==", filename))
        .limit(1)
        .stream()
    )
    return next(docs, None)


def _delete_owned_worksheet_file(filename: str, meta: dict | None = None) -> None:
    """Remove a worksheet's files when nobody else uses them.

    Verse worksheets are shared by every family who made the same verse, so
    deleting one person's history entry must not delete the file. Custom
    worksheets and coloring pages belong to one family: remove them here and
    in cloud storage.
    """
    from faithsparks.services.storage import delete_storage_path
    meta = meta or {}
    private = _is_custom_filename(filename) or meta.get("type") == "coloring"
    if not private:
        return
    file_path = _safe_local_path("output", filename, {".pdf"})
    if file_path and file_path.exists():
        file_path.unlink()
    delete_storage_path(f"worksheets/{os.path.basename(filename)}")
    if meta.get("type") == "coloring":
        png_name = meta.get("imageFilename") or os.path.splitext(filename)[0] + ".png"
        png_path = _safe_local_path("worksheets", png_name, {".png"})
        if png_path and png_path.exists():
            png_path.unlink()
    thumb_name = os.path.splitext(os.path.basename(filename))[0] + ".png"
    thumb_path = _safe_local_path(os.path.join("output", "thumbs"), thumb_name, {".png"})
    if thumb_path and thumb_path.exists():
        thumb_path.unlink()
    delete_storage_path(f"thumbs/{thumb_name}")


def _custom_slug(owner_email: str | None) -> str:
    """custom-<owner hash>-<random>: private to one family, unique per worksheet."""
    import hashlib
    import uuid
    owner = hashlib.sha256((owner_email or "anonymous").strip().lower().encode("utf-8")).hexdigest()[:10]
    return f"custom-{owner}-{uuid.uuid4().hex[:10]}"


def _is_custom_filename(filename: str) -> bool:
    return os.path.basename(filename or "").startswith("custom-")


def _legacy_shared_custom(doc) -> bool:
    """Custom worksheets made before 2026-10-14 used shared file names, so the
    file on disk may now hold another family's text. Never serve those."""
    meta = doc.to_dict() or {}
    return bool(meta.get("custom")) and not _is_custom_filename(meta.get("filename") or "")


def _verse_text_verified(meta: dict, filename: str) -> bool:
    """True when a verse worksheet's PDF was built from verified Scripture.

    Before 2026-10-14 a worksheet could carry AI-written words (ESV/NLT with no
    key, or KJV/WEB during a bible-api outage). Its verse JSON sidecar records
    the source; anything unverified is rebuilt before it is served again.
    """
    if meta.get("custom") or meta.get("type") == "coloring":
        return True
    slug = normalize_slug(meta.get("verse") or "")
    version = meta.get("version") or ""
    json_path = f"output/{slug}_{version}.json"
    if not os.path.exists(json_path):
        download_from_storage(f"worksheets/{os.path.basename(json_path)}", json_path)
    try:
        with open(json_path, "r", encoding="utf-8") as sidecar:
            return (json.load(sidecar) or {}).get("verseSource") in VERIFIED_SOURCES
    except Exception:
        return False


def _chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


bp = Blueprint("worksheets", __name__)


def make_thumbnail(verse_ref: str, version: str, base_name: str):
    try:
        w, h = 560, 420
        img = Image.new("RGB", (w, h), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, w, 44], fill=(230, 242, 255))
        title = "Bible Copywork Worksheet"
        try:
            font_big = ImageFont.truetype("fonts/KGPrimaryDotsLined.ttf", 22)
            font_small = ImageFont.truetype("fonts/KGPrimaryDotsLined.ttf", 16)
        except Exception:
            font_big = ImageFont.load_default()
            font_small = ImageFont.load_default()
        draw.text((16, 12), title, fill=(27, 49, 94), font=font_big)
        ref_text = f"{verse_ref} ({version})"
        draw.text((16, 70), ref_text, fill=(20, 20, 20), font=font_big)
        y = 130
        for _ in range(6):
            draw.line([(16, y), (w - 16, y)], fill=(180, 180, 180), width=1)
            y += 40
        out = os.path.join("output", "thumbs", f"{base_name}.png")
        img.save(out, format="PNG")
        return out
    except Exception as e:
        print(f"⚠️ Thumbnail generation failed: {e}")
        return None


def update_zip_bundle(pdf_paths) -> str | None:
    """Zip these PDFs into a new per-request file (caller deletes it after sending).

    Every request used to write the same output/worksheets_bundle.zip, so two
    families generating at once could download each other's bundle.
    """
    import tempfile
    from zipfile import ZipFile

    files = []
    for path in pdf_paths or []:
        abs_path = os.path.abspath(path) if path else None
        if abs_path and os.path.exists(abs_path) and abs_path not in files:
            files.append(abs_path)
    if len(files) < 2:
        return None
    handle, bundle_path = tempfile.mkstemp(prefix="worksheets_", suffix=".zip")
    os.close(handle)
    with ZipFile(bundle_path, "w") as zf:
        for file_path in files:
            zf.write(file_path, os.path.basename(file_path))
    return bundle_path


def generate():
    reserved = 0
    reservation_month = None
    success_count = free_success_count = 0
    user_email = None
    try:
        if request.method == "GET":
            log_request_summary("worksheets.generate:get")
            clear_storage = session.pop("clear_storage", False)
            prefill = request.args.get("verse", "").strip()
            col = request.args.get("collection")
            default_version_override = None
            if not prefill and col:
                meta = get_collection_meta(col)
                if meta and meta.get("verses"):
                    prefill = ", ".join(meta["verses"]) 
                    default_version_override = meta.get("defaultVersion")
                    clear_storage = False
            email = session.get("user_email")
            anonymous_mode = not bool(email)
            plan = _get_user_plan(email)
            m_limit, l_limit = _quota_for_plan(plan)
            used_life, used_m = _get_usage(email)
            if anonymous_mode:
                used_life = used_m = max(0, int(session.get("anonymous_worksheet_count", 0) or 0))
                m_limit = l_limit = ANONYMOUS_SAMPLE_LIMIT

            def r(limit, used):
                return None if limit is None else max(0, int(limit) - int(used))

            remain_m = r(m_limit, used_m)
            pct = 0
            try:
                if m_limit is not None and int(m_limit) > 0:
                    pct = int(round((used_m / float(m_limit)) * 100))
            except Exception:
                pct = 0
            usage_info = {
                "plan": plan,
                "monthly_used": int(used_m),
                "monthly_limit": m_limit,
                "lifetime_used": int(used_life),
                "lifetime_limit": l_limit,
                "monthly_remaining": remain_m,
                "monthly_pct_used": pct,
            }
            return render_template(
                "generate.html",
                prefill_verse=prefill,
                clear_storage=clear_storage,
                default_version_override=default_version_override,
                collection_slug=col,
                usage_info=usage_info,
                proverb_of_day=get_proverb_of_day(),
                anonymous_mode=anonymous_mode,
            )

        payload, payload_mode = get_request_payload()
        log_request_summary(f"worksheets.generate:post mode={payload_mode}")

        if not payload:
            req_id = getattr(g, "req_id", "")
            current_app.logger.warning("[%s] empty request body", req_id)
            if request.is_json:
                return jsonify(error="Empty request body"), 400
            flash("Please enter a verse or custom text to generate.", "warning")
            return redirect(url_for("generate"))

        verse_input = (payload.get("verse") or "").strip()
        from_collection = (payload.get("collection_slug") or "").strip() or None
        custom_text = (payload.get("custom_text") or "").strip()
        custom_title = (payload.get("custom_title") or "").strip()
        selected_version = (payload.get("version") or "web").strip().lower()
        custom_prompt = (payload.get("custom_prompt") or "").strip()
        learner_level = (payload.get("learner_level") or "growing").strip().lower()
        if learner_level not in LEARNER_LEVEL_LINES:
            learner_level = "growing"
        if (
            len(verse_input) > MAX_VERSE_INPUT_LEN
            or len(custom_text) > MAX_CUSTOM_TEXT_LEN
            or len(custom_title) > MAX_CUSTOM_TITLE_LEN
            or len(custom_prompt) > MAX_CUSTOM_PROMPT_LEN
        ):
            msg = "Please shorten your worksheet request and try again."
            if request.is_json:
                return jsonify(error=msg), 400
            flash(msg, "warning")
            return redirect(url_for("generate"))

        cursive_raw = payload.get("cursive")
        use_cursive = False
        if isinstance(cursive_raw, bool):
            use_cursive = cursive_raw
        elif isinstance(cursive_raw, str):
            use_cursive = cursive_raw.lower() in {"on", "true", "1", "yes"}
        else:
            use_cursive = False
        user_email = (session.get("user_email") or "").strip().lower()
        anonymous_mode = not bool(user_email)
        if anonymous_mode and custom_text:
            msg = "Sign in to make worksheets from your own text. Your first Bible-reference worksheet does not require an account."
            if request.is_json:
                return jsonify(error=msg), 403
            flash(msg, "info")
            return redirect(url_for("generate"))
        tag_list = [v.strip() for v in re.split(r"[,;\n]+", verse_input) if v.strip()]
        verse_items = []
        for v in tag_list:
            version, verse = extract_version_from_text(v, selected_version)
            verse_items.append({
                "slug": normalize_slug(verse),
                "verse": verse,
                "version": version.upper(),
                "is_custom": False,
                "text": None,
            })

        if not verse_items and not custom_text:
            flash("Please enter a verse or custom text to generate.", "warning")
            return redirect(url_for("generate"))

        # Only translations we can load from a licensed or public-domain source.
        # (Anything else used to be written from the AI's memory.)
        allowed_versions = available_translation_ids()
        unsupported = sorted({item["version"] for item in verse_items if item["version"].lower() not in allowed_versions})
        if unsupported:
            offered = ", ".join(v.upper() for v in sorted(allowed_versions))
            msg = f"{', '.join(unsupported)} isn't available here. Choose one of: {offered}."
            if request.is_json:
                return jsonify(error=msg), 400
            flash(msg, "warning")
            return redirect(url_for("generate"))

        client_ip = get_client_ip()
        rate_identity = user_email or f"anonymous:{client_ip}"
        user_limit = check_rate_limit("worksheet_generate:user", rate_identity, limit=24, window_seconds=60 * 60)
        ip_limit = check_rate_limit("worksheet_generate:ip", client_ip, limit=60, window_seconds=60 * 60)
        if not user_limit.allowed or not ip_limit.allowed:
            msg = "You've made several worksheet requests recently. Please wait a bit before creating more."
            if request.is_json:
                return jsonify(error=msg), 429
            flash(msg, "warning")
            return redirect(url_for("generate"))

        custom_item = None
        if custom_text:
            moderation = moderate_text_block(f"{custom_title}\n{custom_text}")
            if moderation.get("flagged"):
                checked = not (moderation.get("categories") or {}).get("error")
                msg = (
                    "That text can't go on a children's worksheet. Please edit it and try again."
                    if checked else
                    "We couldn't check that text just now. Please try again in a moment."
                )
                if request.is_json:
                    return jsonify(error=msg), 400
                flash(msg, "warning")
                return redirect(url_for("generate"))
            title = custom_title or "Custom Text (User Submitted)"
            custom_item = {
                # Unique per family and per worksheet: custom text is private, so it
                # must never share a file name with anyone else's worksheet.
                "slug": _custom_slug(user_email),
                "verse": title,
                "version": "DIY",
                "is_custom": True,
                "text": custom_text,
            }

        if not verse_items and not custom_item:
            flash("Please enter a verse or custom text to generate.", "warning")
            return redirect(url_for("generate"))

        daily = get_proverb_of_day()
        daily_ref = normalize_slug(daily.get("reference") or "")
        is_daily_proverb = False
        if not custom_item and len(verse_items) == 1:
            is_daily_proverb = normalize_slug(verse_items[0]["verse"]) == daily_ref

        if anonymous_mode and not is_daily_proverb:
            anonymous_used = max(0, int(session.get("anonymous_worksheet_count", 0) or 0))
            if anonymous_used >= ANONYMOUS_SAMPLE_LIMIT:
                msg = "Your free sample is ready. Sign in to make more worksheets and keep them in My Prints."
                if request.is_json:
                    return jsonify(error=msg, sign_in=url_for("google.login", next=url_for("generate"))), 403
                flash(msg, "info")
                return redirect(url_for("google.login", next=url_for("generate")))
            if len(verse_items) > 1:
                verse_items = verse_items[:1]
                flash("The no-account sample creates one worksheet. Sign in to make a bundle.", "info")

        generated_target = len(verse_items) + (1 if custom_item else 0)
        user_plan = _get_user_plan(user_email)
        monthly_limit, lifetime_limit = _quota_for_plan(user_plan)
        used_lifetime, used_monthly = _get_usage(user_email)

        def _remaining(limit, used):
            return 10**9 if limit is None else max(0, int(limit) - int(used))

        if not is_daily_proverb:
            allowed = min(_remaining(monthly_limit, used_monthly), _remaining(lifetime_limit, used_lifetime))
            if allowed <= 0:
                flash("You've reached your monthly limit. Consider Plus for more.", "warning")
                return redirect(url_for("browse"))

            if generated_target > allowed:
                flash(f"Your plan allows {allowed} more this month; generating the first {allowed}.", "warning")
                kept = min(len(verse_items), allowed)
                verse_items = verse_items[:kept]
                if custom_item and allowed <= len(verse_items):
                    custom_item = None

        items_to_generate = verse_items + ([custom_item] if custom_item else [])

        total_requested = len(items_to_generate)
        if total_requested > MAX_WORKSHEETS_PER_REQUEST:
            flash(
                f"Processing a large batch ({total_requested}); generating the first {MAX_WORKSHEETS_PER_REQUEST} now.",
                "warning",
            )
            items_to_generate = items_to_generate[:MAX_WORKSHEETS_PER_REQUEST]

        success_count = 0
        free_success_count = 0  # free-library verses that were generated (not billed)
        free_skip_count = 0
        free_slugs = _get_free_slugs()
        if user_email and not is_daily_proverb:
            billable = [item for item in items_to_generate
                        if item.get("is_custom") or normalize_slug(item["verse"]) not in free_slugs]
            reserved, reservation_month = _reserve_usage(user_email, len(billable), user_plan)
            remaining = reserved
            selected = []
            for item in items_to_generate:
                is_free = not item.get("is_custom") and normalize_slug(item["verse"]) in free_slugs
                if is_free or remaining > 0:
                    selected.append(item)
                    if not is_free:
                        remaining -= 1
            items_to_generate = selected
            if not items_to_generate:
                flash("You've reached your monthly limit.", "warning")
                return redirect(url_for("browse"))
        last_pdf = None
        bundle_files: list[str] = []

        def _record_existing(path: str | None):
            nonlocal last_pdf
            if path and os.path.exists(path):
                if path not in bundle_files:
                    bundle_files.append(path)
                last_pdf = path

        for chunk in _chunked(items_to_generate, OPENAI_BATCH_SIZE):
            contexts = []
            need_fetch = []

            for item in chunk:
                verse = item["verse"]
                version = item["version"]
                is_custom = item["is_custom"]
                text = item.get("text")
                slug = item["slug"]
                level_suffix = "" if learner_level == "growing" else f"_{learner_level}"
                suffix = ("_cursive" if use_cursive else "") + level_suffix
                pdf_path = f"output/{slug}_{version}{suffix}.pdf"
                json_path = f"output/{slug}_{version}.json"

                context = {
                    "verse": verse,
                    "version": version,
                    "is_custom": is_custom,
                    "text": text,
                    "slug": slug,
                    "suffix": suffix,
                    "pdf_path": pdf_path,
                    "json_path": json_path,
                    "data": None,
                    "error": None,
                    "skip": False,
                }

                contexts.append(context)

                existing_path = None
                if db and user_email and not is_custom:
                    try:
                        existing_stream = (
                            db.collection("worksheets")
                            .where(filter=firestore.FieldFilter("email", "==", user_email))
                            .where(filter=firestore.FieldFilter("verse", "==", verse))
                            .where(filter=firestore.FieldFilter("version", "==", version))
                            .where(filter=firestore.FieldFilter("cursive", "==", use_cursive))
                            .limit(1)
                            .stream()
                        )
                        doc = next(existing_stream, None)
                        if doc:
                            existing_meta = doc.to_dict() or {}
                            stored_level = existing_meta.get("learnerLevel") or "growing"
                            filename = existing_meta.get("filename") if stored_level == learner_level else None
                            if filename:
                                existing_path = os.path.join("output", filename)
                                try:
                                    flash("Already generated — using your existing PDF.", "info")
                                except Exception:
                                    pass
                    except Exception:
                        existing_path = None

                if existing_path:
                    if not os.path.exists(existing_path):
                        download_from_storage(f"worksheets/{os.path.basename(existing_path)}", existing_path)
                    if os.path.exists(existing_path):
                        context["skip"] = True
                        _record_existing(existing_path)
                        continue

                if not is_custom and normalize_slug(verse) in free_slugs:
                    free_skip_count += 1

                if not os.path.exists(pdf_path):
                    download_from_storage(f"worksheets/{os.path.basename(pdf_path)}", pdf_path)

                if not os.path.exists(json_path):
                    download_from_storage(f"worksheets/{os.path.basename(json_path)}", json_path)

                if not is_custom and os.path.exists(pdf_path) and os.path.exists(json_path):
                    try:
                        with open(json_path, "r", encoding="utf-8") as cache_file:
                            data = json.load(cache_file)
                        if (data or {}).get("verseSource") not in VERIFIED_SOURCES:
                            raise ValueError("cached worksheet predates verified Scripture text")
                        context["data"] = data
                        context["skip"] = True
                        _record_existing(pdf_path)
                        continue
                    except Exception:
                        pass

                if is_custom:
                    context["data"] = normalize_verse_data(
                        {
                            "verse": verse,
                            "fullVerse": text,
                            "traceableVerse": text,
                            "handwritingLines": 3,
                            "reflectionQuestion": "Why is this meaningful to you?",
                            "imageIdea": custom_prompt or "An open Bible or prayer hands",
                            "version": "DIY",
                            "cursive": use_cursive,
                        },
                        verse,
                        "DIY",
                    )
                else:
                    need_fetch.append(context)

            if need_fetch:
                with ThreadPoolExecutor(max_workers=min(len(need_fetch), OPENAI_BATCH_SIZE)) as executor:
                    future_map = {
                        executor.submit(request_verse_data, ctx["verse"], ctx["version"].lower()): ctx
                        for ctx in need_fetch
                    }
                    for future in as_completed(future_map):
                        ctx = future_map[future]
                        try:
                            content = future.result()
                        except Exception as exc:
                            ctx["error"] = str(exc)
                            continue
                        data = parse_and_clean_json(content) if content else None
                        if not data:
                            ctx["error"] = (
                                f"We couldn't load {ctx['verse']} ({ctx['version']}) from a Bible source right now. "
                                "Please check the reference or try again in a few minutes."
                            )
                            continue
                        ctx["data"] = normalize_verse_data(data, ctx["verse"], ctx["version"])

            for ctx in contexts:
                if ctx.get("skip"):
                    continue

                data = ctx.get("data")
                if not data:
                    err = ctx.get("error") or f"Could not fetch verse for {ctx['verse']} ({ctx['version']})."
                    flash(err, "error")
                    continue

                try:
                    if not isinstance(data, dict):
                        raise ValueError("Invalid data from model")
                    if not data.get("verse"):
                        data["verse"] = ctx["verse"]
                    # Keep any letter suffix from the user input even if the model drops it.
                    data["verse"] = preserve_letter_suffix(ctx["verse"], data.get("verse"))
                    data = normalize_verse_data(data, ctx["verse"], ctx["version"])
                    data["cursive"] = use_cursive
                    data["handwritingLines"] = LEARNER_LEVEL_LINES[learner_level]
                    data["learnerLevel"] = learner_level
                    if not data.get("fullVerse"):
                        flash(
                            f"AI response missing fullVerse for {ctx['verse']} ({ctx['version']}); skipping.",
                            "warning",
                        )
                        continue

                    save_json_to_file(data, ctx["json_path"])
                    generate_pdf(data, ctx["pdf_path"], use_cursive=use_cursive)
                except Exception as e:
                    current_app.logger.exception(
                        "[%s] worksheet pdf build failed for %s (%s): %s",
                        getattr(g, "req_id", ""),
                        ctx["verse"],
                        ctx["version"],
                        e,
                    )
                    flash(f"Could not build PDF for {ctx['verse']} ({ctx['version']}). Please try again.", "error")
                    continue

                if not ctx["is_custom"]:
                    canonical_ref = preserve_letter_suffix(ctx["verse"], data.get("verse") or ctx["verse"])
                    data["verse"] = canonical_ref
                    canonical_slug = normalize_slug(canonical_ref)
                    desired_path = f"output/{canonical_slug}_{ctx['version']}{ctx['suffix']}.pdf"
                    if ctx["pdf_path"] != desired_path and os.path.exists(ctx["pdf_path"]):
                        os.replace(ctx["pdf_path"], desired_path)
                    pdf_path = desired_path
                    canonical_json = f"output/{canonical_slug}_{ctx['version']}.json"
                    if ctx["json_path"] != canonical_json and os.path.exists(ctx["json_path"]):
                        os.replace(ctx["json_path"], canonical_json)
                    ctx["json_path"] = canonical_json
                    thumb_base = os.path.splitext(os.path.basename(pdf_path))[0]
                    thumb_path = os.path.join("output", "thumbs", f"{thumb_base}.png")
                    if not os.path.exists(thumb_path):
                        make_thumbnail(canonical_ref, ctx["version"], thumb_base)
                else:
                    pdf_path = ctx["pdf_path"]
                    thumb_base = os.path.splitext(os.path.basename(pdf_path))[0]
                    thumb_path = os.path.join("output", "thumbs", f"{thumb_base}.png")
                    if not os.path.exists(thumb_path):
                        make_thumbnail(ctx["verse"], ctx["version"], thumb_base)

                upload_to_storage(pdf_path, f"worksheets/{os.path.basename(pdf_path)}")
                if not ctx["is_custom"] and os.path.exists(ctx["json_path"]):
                    upload_to_storage(ctx["json_path"], f"worksheets/{os.path.basename(ctx['json_path'])}")
                ctx["pdf_path"] = pdf_path
                _record_existing(pdf_path)

                if db and user_email:
                    db.collection("worksheets").add(
                        {
                            "email": user_email,
                            "verse": (data.get("verse") if not ctx["is_custom"] else ctx["verse"]),
                            "version": ctx["version"],
                            "filename": os.path.basename(pdf_path),
                            "timestamp": firestore.SERVER_TIMESTAMP,
                            "cursive": use_cursive,
                            "learnerLevel": learner_level,
                            "custom": ctx["is_custom"],
                            **({"text": ctx["text"], "imageIdea": custom_prompt} if ctx["is_custom"] else {}),
                        }
                    )

                success_count += 1
                if not ctx["is_custom"] and normalize_slug(ctx["verse"]) in free_slugs:
                    free_success_count += 1

        if db and from_collection:
            try:
                db.collection("analytics").document("pack_generates").set({from_collection: firestore.Increment(1)}, merge=True)
            except Exception:
                pass

        bundle_path = update_zip_bundle(bundle_files) if len(bundle_files) >= 2 else None
        try:
            current_app.logger.info(
                "worksheets.generate summary requested=%s success=%s skipped=%s free_skips=%s collection=%s",
                len(items_to_generate),
                success_count,
                len(items_to_generate) - success_count,
                free_skip_count,
                from_collection or "direct",
            )
        except Exception:
            pass
        delivered_count = len(bundle_files)
        if anonymous_mode and delivered_count and not is_daily_proverb:
            session["anonymous_worksheet_count"] = min(
                ANONYMOUS_SAMPLE_LIMIT,
                max(0, int(session.get("anonymous_worksheet_count", 0) or 0)) + delivered_count,
            )
        session["clear_storage"] = True

        if bundle_path:
            @after_this_request
            def _remove_bundle(response):
                try:
                    os.remove(bundle_path)
                except OSError:
                    pass
                return response

            flash("Bundle generated successfully!", "success")
            return send_file(bundle_path, as_attachment=True, download_name="worksheets_bundle.zip")
        if len(bundle_files) == 1 and os.path.exists(bundle_files[0]):
            # One worksheet (or only one of several succeeded): send it, don't error.
            flash("Worksheet generated successfully!", "success")
            return send_file(os.path.abspath(bundle_files[0]), as_attachment=True,
                             download_name=os.path.basename(bundle_files[0]), conditional=True)

        if request.is_json:
            return jsonify(error="No worksheets could be generated. Please try again."), 500
        flash("No worksheets could be generated. Please try again.", "error")
        return redirect(url_for("generate"))

    except Exception as e:
        current_app.logger.exception("[%s] worksheet generation failed: %s", getattr(g, "req_id", ""), e)
        if request.is_json:
            return jsonify(error="We couldn't generate that worksheet yet. Please try again."), 500
        flash("We couldn't generate that worksheet yet. Please try again.", "error")
        return redirect(url_for("generate"))
    finally:
        if reserved and reservation_month:
            unused = max(0, reserved - max(0, success_count - free_success_count))
            try:
                _refund_usage(user_email, unused, reservation_month)
            except Exception:
                current_app.logger.exception("Could not refund unused worksheet reservation")


def delete_worksheet(filename):
    if not db:
        return "Firestore not configured", 500
    try:
        doc = _worksheet_doc_for_user(filename)
        if not doc:
            flash("Worksheet not found.", "error")
            return redirect(url_for("prints"))
        meta = doc.to_dict() or {}
        doc.reference.delete()
        _delete_owned_worksheet_file(filename, meta)
        flash("Worksheet deleted successfully.", "success")
    except Exception as e:
        current_app.logger.exception("[%s] worksheet delete failed: %s", getattr(g, "req_id", ""), e)
        flash("Error deleting worksheet. Please try again.", "error")
    return redirect(url_for("prints"))


def delete_bulk():
    if not db:
        return "Firestore not configured", 500
    selected = request.form.getlist("selected_files")
    try:
        for filename in selected:
            doc = _worksheet_doc_for_user(filename)
            if not doc:
                continue
            meta = doc.to_dict() or {}
            doc.reference.delete()
            _delete_owned_worksheet_file(filename, meta)
        flash("Selected worksheets deleted.", "success")
    except Exception as e:
        current_app.logger.exception("[%s] bulk worksheet delete failed: %s", getattr(g, "req_id", ""), e)
        flash("Error deleting worksheets. Please try again.", "error")
    return redirect(url_for("prints"))


def history():
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    try:
        # Cap the most-recent window so heavy accounts don't pay hundreds of
        # Firestore reads + a giant DOM on every visit. Configurable via env.
        history_limit = int(os.getenv("WORKSHEET_HISTORY_LIMIT", "300"))
        docs = (
            db.collection("worksheets")
            .where(filter=firestore.FieldFilter("email", "==", user_email))
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(history_limit + 1)
            .stream()
        )
        history_items = [doc.to_dict() | {"timestamp": doc.get("timestamp")} for doc in docs]
        history_capped = len(history_items) > history_limit
        if history_capped:
            history_items = history_items[:history_limit]

        lesson_pack_items = []
        lesson_pack_limit = int(os.getenv("LESSON_PACK_HISTORY_LIMIT", "100"))
        try:
            pack_docs = (
                db.collection("lesson_packs")
                .where(filter=firestore.FieldFilter("email", "==", user_email))
                .order_by("timestamp", direction=firestore.Query.DESCENDING)
                .limit(lesson_pack_limit)
                .stream()
            )
        except Exception:
            pack_docs = (
                db.collection("lesson_packs")
                .where(filter=firestore.FieldFilter("email", "==", user_email))
                .limit(lesson_pack_limit)
                .stream()
            )
        for d in pack_docs:
            data = d.to_dict() or {}
            data["slug"] = data.get("slug") or d.id
            data["title"] = data.get("title") or d.id
            data["timestamp"] = data.get("timestamp")
            lesson_pack_items.append(data)

        purchases = []
        try:
            purchase_docs = (
                db.collection("users")
                .document(user_email)
                .collection("purchases")
                .order_by("created_at", direction=firestore.Query.DESCENDING)
                .stream()
            )
        except Exception:
            purchase_docs = (
                db.collection("users")
                .document(user_email)
                .collection("purchases")
                .stream()
            )
        for d in purchase_docs:
            data = d.to_dict() or {}
            data["pack_id"] = data.get("pack_id") or d.id
            data["created_at"] = data.get("created_at")
            purchases.append(data)
        return render_template(
            "history.html",
            history=history_items,
            history_capped=history_capped,
            history_limit=history_limit,
            lesson_packs=lesson_pack_items,
            purchases=purchases,
            email=user_email,
            proverb_of_day=get_proverb_of_day(),
        )
    except Exception as e:
        current_app.logger.exception("[%s] worksheet history failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't load your print history. Please try again.", "error")
        return redirect(url_for("generate"))


def download_file(filename):
    if not db:
        return "Firestore not configured", 500
    file_path = _safe_local_path("output", filename, {".pdf", ".zip"})
    if not file_path:
        abort(404)
    doc = _worksheet_doc_for_user(filename)
    if not doc:
        flash("⚠️ File missing and original data not found.", "error")
        return redirect(url_for("prints"))
    if _legacy_shared_custom(doc):
        flash("This older custom worksheet can't be downloaded safely. Please make it again from Generate.", "info")
        return redirect(url_for("generate"))
    if file_path.exists() and filename.lower().endswith(".pdf") and not _verse_text_verified(doc.to_dict() or {}, filename):
        return redirect(url_for("regenerate", filename=filename))
    if file_path.exists():
        try:
            base = os.path.splitext(filename)[0]
            db.collection("analytics").document("verses").set({base: firestore.Increment(1)}, merge=True)
            today = datetime.now(timezone.utc).strftime("%Y%m%d")
            db.collection("analytics_daily").document(f"verses_{today}").set({base: firestore.Increment(1)}, merge=True)
        except Exception:
            pass
        return send_file(file_path, as_attachment=True, download_name=file_path.name, conditional=True)
    return redirect(url_for("regenerate", filename=filename))


def thumb(filename):
    path = _safe_local_path(os.path.join("output", "thumbs"), filename, {".png"})
    if not path:
        abort(404)
    no_gen = request.args.get("skip") in ("1", "true", "True", "yes")
    base = os.path.splitext(os.path.basename(filename))[0]
    pdf_name = base + ".pdf"
    doc = _worksheet_doc_for_user(pdf_name)
    if not doc or _legacy_shared_custom(doc):
        return ("", 404)
    if path.exists():
        remote_url = signed_url_for_path(f"thumbs/{filename}")
        if remote_url:
            return redirect(remote_url)
        resp = send_file(path, conditional=True)
        try:
            resp.headers["Cache-Control"] = "public, max-age=86400"
        except Exception:
            pass
        return resp
    if no_gen:
        return ("", 404)
    meta = doc.to_dict()
    verse_ref = meta.get("verse", base)
    version = meta.get("version", "ESV")
    out = make_thumbnail(verse_ref, version, base)
    if out and os.path.exists(out):
        upload_to_storage(out, f"thumbs/{filename}")
        remote_url = signed_url_for_path(f"thumbs/{filename}")
        if remote_url:
            return redirect(remote_url)
        resp = send_file(out, conditional=True)
        try:
            resp.headers["Cache-Control"] = "public, max-age=86400"
        except Exception:
            pass
        return resp
    return ("", 404)


def regenerate(filename):
    if not db:
        return "Firestore not configured", 500
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    if not _safe_local_path("output", filename, {".pdf"}):
        abort(404)
    doc = _worksheet_doc_for_user(filename)
    if not doc:
        flash(f"Original data not found for {filename}", "error")
        return redirect(url_for("prints"))
    # Rebuilding is free, but it can call the verse API: cap it like generation.
    rate = check_rate_limit("worksheet_regenerate:user", session.get("user_email") or get_client_ip(),
                            limit=30, window_seconds=60 * 60)
    if not rate.allowed:
        flash("You've rebuilt several worksheets recently. Please wait a bit and try again.", "warning")
        return redirect(url_for("prints"))
    meta = doc.to_dict()
    if meta.get("type") == "coloring":
        flash("Coloring sheets cannot be regenerated yet. Check the coloring library on the Generate page.", "info")
        return redirect(url_for("generate") + "#coloring")
    verse = meta["verse"]
    version = meta["version"]
    use_cursive = meta.get("cursive", False)
    learner_level = meta.get("learnerLevel") or "growing"
    if learner_level not in LEARNER_LEVEL_LINES:
        learner_level = "growing"
    is_custom = meta.get("custom", False)
    original_text = meta.get("text", verse)
    custom_prompt = meta.get("imageIdea", "An open Bible or prayer hands")
    slug = normalize_slug(verse)
    level_suffix = "" if learner_level == "growing" else f"_{learner_level}"
    pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}{level_suffix}.pdf"
    if is_custom:
        # Custom worksheets rebuild into their own private file, never a shared name.
        own = _safe_local_path("output", meta.get("filename") or filename, {".pdf"})
        if not own or not _is_custom_filename(own.name):
            flash("Please make this custom worksheet again from the Generate page.", "info")
            return redirect(url_for("generate"))
        pdf_path = str(own)
    try:
        if is_custom:
            data = {
                "verse": verse,
                "fullVerse": original_text,
                "traceableVerse": original_text,
                "handwritingLines": LEARNER_LEVEL_LINES[learner_level],
                "reflectionQuestion": "Why is this meaningful to you?",
                "imageIdea": custom_prompt,
                "version": "DIY",
                "cursive": use_cursive,
                "disclaimer": "This content was submitted by the user and not verified as Scripture.",
            }
        else:
            # Reuse the stored verse data when we have it; only call the API if it's gone.
            data = None
            json_path = f"output/{slug}_{version}.json"
            if not os.path.exists(json_path):
                download_from_storage(f"worksheets/{os.path.basename(json_path)}", json_path)
            if os.path.exists(json_path):
                try:
                    with open(json_path, "r", encoding="utf-8") as cached:
                        data = json.load(cached)
                except Exception:
                    data = None
            if data and data.get("verseSource") not in VERIFIED_SOURCES:
                data = None  # older AI-written text: fetch verified text instead
            if not data:
                content = request_verse_data(verse, version.lower())
                if not content:
                    flash(f"We couldn't load {verse} ({version.upper()}) from a Bible source right now. Please try again later.", "error")
                    return redirect(url_for("prints"))
                data = parse_and_clean_json(content)
                save_json_to_file(data, json_path)
                upload_to_storage(json_path, f"worksheets/{os.path.basename(json_path)}")
            data.update({
                "version": version.upper(),
                "cursive": use_cursive,
                "handwritingLines": LEARNER_LEVEL_LINES[learner_level],
                "learnerLevel": learner_level,
            })
        generate_pdf(data, pdf_path, use_cursive=use_cursive)
        if os.path.exists(pdf_path):
            if not is_custom:
                upload_to_storage(pdf_path, f"worksheets/{os.path.basename(pdf_path)}")
            try:
                if db:
                    base = os.path.splitext(os.path.basename(pdf_path))[0]
                    db.collection("analytics").document("verses").set({base: firestore.Increment(1)}, merge=True)
                    today = datetime.now(timezone.utc).strftime("%Y%m%d")
                    db.collection("analytics_daily").document(f"verses_{today}").set({base: firestore.Increment(1)}, merge=True)
            except Exception:
                pass
            flash(f"Regenerated: {filename}", "success")
            return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
        else:
            current_app.logger.error("[%s] regenerate produced no PDF: %s", getattr(g, "req_id", ""), pdf_path)
            flash("We couldn't rebuild that worksheet yet. Please try again.", "error")
            return redirect(url_for("prints"))
    except Exception as e:
        current_app.logger.exception("[%s] regenerate failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't rebuild that worksheet yet. Please try again.", "error")
        return redirect(url_for("prints"))


def toggle_favorite(filename):
    if not db:
        return ("Firestore not configured", 500)
    doc = _worksheet_doc_for_user(filename)
    if not doc:
        return redirect(url_for("prints"))
    current = bool(doc.to_dict().get("favorite"))
    doc.reference.update({"favorite": not current})
    return redirect(url_for("prints"))


def extract_version_from_text(text, fallback_version):
    norm_fallback = (fallback_version or "nlt").lower().strip()
    fallback_version = "nlt" if norm_fallback in ("", "auto") else norm_fallback
    m = re.search(r"\(([A-Za-z0-9]{2,12})\)\s*$", text.strip())
    if m:
        version = m.group(1).lower()
        verse = text[: m.start()].strip()
    else:
        version = fallback_version
        verse = text.strip()
    return version, normalize_reference_title(verse)
