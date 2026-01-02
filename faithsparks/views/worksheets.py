import json
import os
import re
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

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
)
from firebase_admin import firestore

from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
    ai_validate_custom_text,
    normalize_reference_title,
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
    _update_usage,
    _get_free_slugs,
)
from faithsparks.services.collections import get_collection_meta
from faithsparks.util.slug import normalize_slug
from faithsparks.util.request_utils import get_request_payload, log_request_summary
from faithsparks.util.proverb import get_proverb_of_day


MAX_WORKSHEETS_PER_REQUEST = 30
OPENAI_BATCH_SIZE = 10


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


def update_zip_bundle(pdf_paths=None):
    from zipfile import ZipFile

    bundle_path = "output/worksheets_bundle.zip"

    if pdf_paths is None:
        pdf_paths = [
            os.path.join("output", f)
            for f in os.listdir("output")
            if f.endswith(".pdf")
        ]

    files = []
    for path in pdf_paths:
        if not path:
            continue
        abs_path = path if os.path.isabs(path) else os.path.abspath(path)
        if os.path.exists(abs_path) and abs_path not in files:
            files.append(abs_path)

    if len(files) < 2:
        try:
            if os.path.exists(bundle_path):
                os.remove(bundle_path)
        except Exception:
            pass
        return

    with ZipFile(bundle_path, "w") as zf:
        for file_path in files:
            zf.write(file_path, os.path.basename(file_path))


def generate():
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
            plan = _get_user_plan(email)
            m_limit, l_limit = _quota_for_plan(plan)
            used_life, used_m = _get_usage(email)

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
        selected_version = (payload.get("version") or "esv").strip().lower()
        custom_prompt = (payload.get("custom_prompt") or "").strip()

        cursive_raw = payload.get("cursive")
        use_cursive = False
        if isinstance(cursive_raw, bool):
            use_cursive = cursive_raw
        elif isinstance(cursive_raw, str):
            use_cursive = cursive_raw.lower() in {"on", "true", "1", "yes"}
        else:
            use_cursive = False
        user_email = session.get("user_email", "anonymous")

        tag_list = [v.strip() for v in re.split(r"[,;\n]+", verse_input) if v.strip()]
        is_custom = bool(custom_text)

        if not tag_list and not is_custom:
            flash("Please enter a verse or custom text to generate.", "warning")
            return redirect(url_for("generate"))

        items_to_generate = []
        for v in tag_list:
            version, verse = extract_version_from_text(v, selected_version)
            items_to_generate.append({
                "slug": normalize_slug(verse),
                "verse": verse,
                "version": version.upper(),
                "is_custom": False,
                "text": None,
            })

        if is_custom:
            ai_validate_custom_text(custom_text)
            title = custom_title or "Custom Text (User Submitted)"
            items_to_generate.append({
                "slug": normalize_slug(title),
                "verse": title,
                "version": "DIY",
                "is_custom": True,
                "text": custom_text,
            })

        daily = get_proverb_of_day()
        daily_ref = normalize_slug(daily.get("reference") or "")
        is_daily_proverb = False
        if not is_custom and len(tag_list) == 1:
            _, daily_input = extract_version_from_text(tag_list[0], selected_version)
            is_daily_proverb = normalize_slug(daily_input) == daily_ref

        generated_target = (len(tag_list) if tag_list else 0) + (1 if is_custom else 0)
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
                keep = allowed
                tag_list = tag_list[:keep]
                keep -= len(tag_list)
                if is_custom and keep <= 0:
                    is_custom = False

        items_to_generate = []
        for v in tag_list:
            version, verse = extract_version_from_text(v, selected_version)
            items_to_generate.append({
                "slug": normalize_slug(verse),
                "verse": verse,
                "version": version.upper(),
                "is_custom": False,
                "text": None,
            })

        if is_custom:
            ai_validate_custom_text(custom_text)
            title = custom_title or "Custom Text (User Submitted)"
            items_to_generate.append({
                "slug": normalize_slug(title),
                "verse": title,
                "version": "DIY",
                "is_custom": True,
                "text": custom_text,
            })

        total_requested = len(items_to_generate)
        if total_requested > MAX_WORKSHEETS_PER_REQUEST:
            flash(
                f"Processing a large batch ({total_requested}); generating the first {MAX_WORKSHEETS_PER_REQUEST} now.",
                "warning",
            )
            items_to_generate = items_to_generate[:MAX_WORKSHEETS_PER_REQUEST]

        success_count = 0
        free_skip_count = 0
        free_slugs = _get_free_slugs()
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
                suffix = "_cursive" if use_cursive else ""
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
                if db:
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
                            filename = doc.to_dict().get("filename")
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
                            context["data"] = data
                            context["skip"] = True
                            _record_existing(pdf_path)
                            continue
                    except Exception:
                        pass

                if is_custom:
                    context["data"] = {
                        "verse": verse,
                        "fullVerse": text,
                        "traceableVerse": text,
                        "handwritingLines": 3,
                        "reflectionQuestion": "Why is this meaningful to you?",
                        "imageIdea": custom_prompt or "An open Bible or prayer hands",
                        "version": "DIY",
                        "cursive": use_cursive,
                    }
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
                        data = parse_and_clean_json(content)
                        if not data:
                            ctx["error"] = f"Could not fetch verse for {ctx['verse']} ({ctx['version']})."
                            continue
                        ctx["data"] = data

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
                    if not data.get("version"):
                        data["version"] = ctx["version"]
                    data["cursive"] = use_cursive
                    if not data.get("fullVerse"):
                        flash(
                            f"AI response missing fullVerse for {ctx['verse']} ({ctx['version']}); skipping.",
                            "warning",
                        )
                        continue

                    save_json_to_file(data, ctx["json_path"])
                    generate_pdf(data, ctx["pdf_path"], use_cursive=use_cursive)
                except Exception as e:
                    traceback.print_exc()
                    flash(f"Could not build PDF for {ctx['verse']} ({ctx['version']}): {e}", "error")
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
                ctx["pdf_path"] = pdf_path
                _record_existing(pdf_path)

                if db:
                    db.collection("worksheets").add(
                        {
                            "email": user_email,
                            "verse": (data.get("verse") if not ctx["is_custom"] else ctx["verse"]),
                            "version": ctx["version"],
                            "filename": os.path.basename(pdf_path),
                            "timestamp": firestore.SERVER_TIMESTAMP,
                            "cursive": use_cursive,
                            "custom": ctx["is_custom"],
                            **({"text": ctx["text"], "imageIdea": custom_prompt} if ctx["is_custom"] else {}),
                        }
                    )

                success_count += 1

        if db and from_collection:
            try:
                db.collection("analytics").document("pack_generates").set({from_collection: firestore.Increment(1)}, merge=True)
            except Exception:
                pass

        update_zip_bundle(bundle_files)
        try:
            if not free_skip_count and not is_daily_proverb:
                _update_usage(user_email, success_count)
        except Exception:
            pass
        session["clear_storage"] = True

        if len(items_to_generate) == 1 and last_pdf and os.path.exists(last_pdf):
            flash("Worksheet generated successfully!", "success")
            return send_file(last_pdf, as_attachment=True, download_name=os.path.basename(last_pdf), conditional=True)
        elif len(items_to_generate) > 1:
            zip_path = "output/worksheets_bundle.zip"
            if os.path.exists(zip_path):
                flash("Bundle generated successfully!", "success")
                return send_file(zip_path, as_attachment=True, download_name=os.path.basename(zip_path), conditional=True)

        return "No worksheets were generated successfully", 500

    except Exception as e:
        traceback.print_exc()
        return f"Server error: {e}", 500


def delete_worksheet(filename):
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    try:
        docs = (
            db.collection("worksheets")
            .where(filter=firestore.FieldFilter("email", "==", user_email))
            .where(filter=firestore.FieldFilter("filename", "==", filename))
            .limit(1)
            .stream()
        )
        doc = next(docs, None)
        meta = doc.to_dict() if doc else {}
        if doc:
            doc.reference.delete()
        file_path = os.path.join("output", filename)
        if os.path.exists(file_path):
            os.remove(file_path)
        if meta.get("type") == "coloring":
            png_name = meta.get("imageFilename") or os.path.splitext(filename)[0] + ".png"
            png_path = os.path.join("worksheets", png_name)
            if os.path.exists(png_path):
                os.remove(png_path)
            thumb_path = os.path.join("output", "thumbs", os.path.splitext(filename)[0] + ".png")
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        flash("Worksheet deleted successfully.", "success")
    except Exception as e:
        traceback.print_exc()
        flash(f"Error deleting worksheet: {e}", "error")
    return redirect(url_for("history"))


def delete_bulk():
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    selected = request.form.getlist("selected_files")
    try:
        for filename in selected:
            docs = (
                db.collection("worksheets")
                .where(filter=firestore.FieldFilter("email", "==", user_email))
                .where(filter=firestore.FieldFilter("filename", "==", filename))
                .limit(1)
                .stream()
            )
            doc = next(docs, None)
            meta = doc.to_dict() if doc else {}
            if doc:
                doc.reference.delete()
            file_path = os.path.join("output", filename)
            if os.path.exists(file_path):
                os.remove(file_path)
            if meta.get("type") == "coloring":
                png_name = meta.get("imageFilename") or os.path.splitext(filename)[0] + ".png"
                png_path = os.path.join("worksheets", png_name)
                if os.path.exists(png_path):
                    os.remove(png_path)
                thumb_path = os.path.join("output", "thumbs", os.path.splitext(filename)[0] + ".png")
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
        flash("Selected worksheets deleted.", "success")
    except Exception as e:
        traceback.print_exc()
        flash(f"Error deleting worksheets: {e}", "error")
    return redirect(url_for("history"))


def history():
    if not db:
        return "Firestore not configured", 500
    user_email = session.get("user_email")
    try:
        docs = (
            db.collection("worksheets")
            .where(filter=firestore.FieldFilter("email", "==", user_email))
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .stream()
        )
        history_items = [doc.to_dict() | {"timestamp": doc.get("timestamp")} for doc in docs]
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
            purchases=purchases,
            email=user_email,
            proverb_of_day=get_proverb_of_day(),
        )
    except Exception as e:
        traceback.print_exc()
        return f"Error fetching history: {e}", 500


def download_file(filename):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        try:
            if db:
                base = os.path.splitext(filename)[0]
                db.collection("analytics").document("verses").set({base: firestore.Increment(1)}, merge=True)
                today = datetime.now(timezone.utc).strftime("%Y%m%d")
                db.collection("analytics_daily").document(f"verses_{today}").set({base: firestore.Increment(1)}, merge=True)
        except Exception:
            pass
        return send_file(file_path, as_attachment=True, download_name=os.path.basename(file_path), conditional=True)
    user_email = session.get("user_email")
    docs = (
        db.collection("worksheets")
        .where(filter=firestore.FieldFilter("email", "==", user_email))
        .where(filter=firestore.FieldFilter("filename", "==", filename))
        .limit(1)
        .stream()
    )
    doc = next(docs, None)
    if not doc:
        flash("⚠️ File missing and original data not found.", "error")
        return redirect(url_for("history"))
    return redirect(url_for("regenerate", filename=filename))


def thumb(filename):
    path = os.path.join("output", "thumbs", filename)
    no_gen = request.args.get("skip") in ("1", "true", "True", "yes")
    if os.path.exists(path):
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
    base = os.path.splitext(os.path.basename(filename))[0]
    pdf_name = base + ".pdf"
    if db:
        user_email = session.get("user_email")
        docs = (
            db.collection("worksheets")
            .where(filter=firestore.FieldFilter("email", "==", user_email))
            .where(filter=firestore.FieldFilter("filename", "==", pdf_name))
            .limit(1)
            .stream()
        )
        doc = next(docs, None)
        if doc:
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
    user_email = session.get("user_email")
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    docs = (
        db.collection("worksheets")
        .where(filter=firestore.FieldFilter("email", "==", user_email))
        .where(filter=firestore.FieldFilter("filename", "==", filename))
        .limit(1)
        .stream()
    )
    doc = next(docs, None)
    if not doc:
        flash(f"Original data not found for {filename}", "error")
        return redirect(url_for("history"))
    meta = doc.to_dict()
    if meta.get("type") == "coloring":
        flash("Coloring sheets cannot be regenerated yet. Check the coloring library on the Generate page.", "info")
        return redirect(url_for("generate") + "#coloring")
    verse = meta["verse"]
    version = meta["version"]
    use_cursive = meta.get("cursive", False)
    is_custom = meta.get("custom", False)
    original_text = meta.get("text", verse)
    custom_prompt = meta.get("imageIdea", "An open Bible or prayer hands")
    slug = normalize_slug(verse)
    pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"
    try:
        if is_custom:
            data = {
                "verse": verse,
                "fullVerse": original_text,
                "traceableVerse": original_text,
                "handwritingLines": 3,
                "reflectionQuestion": "Why is this meaningful to you?",
                "imageIdea": custom_prompt,
                "version": "DIY",
                "cursive": use_cursive,
                "disclaimer": "This content was submitted by the user and not verified as Scripture.",
            }
        else:
            content = request_verse_data(verse, version.lower())
            if not content:
                flash("Verse fetch failed during regeneration.", "error")
                return redirect(url_for("history"))
            data = parse_and_clean_json(content)
            data.update({"version": version.upper(), "cursive": use_cursive})
        generate_pdf(data, pdf_path, use_cursive=use_cursive)
        if os.path.exists(pdf_path):
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
            return f"PDF not created: {pdf_path}", 500
    except Exception as e:
        traceback.print_exc()
        return f"Regenerate error: {e}", 500


def toggle_favorite(filename):
    if not db:
        return ("Firestore not configured", 500)
    user_email = session.get("user_email")
    docs = (
        db.collection("worksheets")
        .where(filter=firestore.FieldFilter("email", "==", user_email))
        .where(filter=firestore.FieldFilter("filename", "==", filename))
        .limit(1)
        .stream()
    )
    doc = next(docs, None)
    if not doc:
        return redirect(url_for("history"))
    current = bool(doc.to_dict().get("favorite"))
    doc.reference.update({"favorite": not current})
    return redirect(url_for("history"))


def extract_version_from_text(text, fallback_version):
    norm_fallback = (fallback_version or "esv").lower().strip()
    fallback_version = "esv" if norm_fallback in ("", "auto") else norm_fallback
    m = re.search(r"\(([A-Za-z0-9]{2,12})\)\s*$", text.strip())
    if m:
        version = m.group(1).lower()
        verse = text[: m.start()].strip()
    else:
        version = fallback_version
        verse = text.strip()
    return version, normalize_reference_title(verse)
