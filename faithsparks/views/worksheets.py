import os
import re
import traceback
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
)
from firebase_admin import firestore

from verse_helpers import (
    request_verse_data,
    parse_and_clean_json,
    save_json_to_file,
    ai_validate_custom_text,
)
from build_pdf import generate_pdf
from PIL import Image, ImageDraw, ImageFont

from faithsparks.services.firestore import db, storage_client, STORAGE_BUCKET
from faithsparks.services.storage import upload_to_storage
from faithsparks.services.usage import (
    _get_user_plan,
    _quota_for_plan,
    _get_usage,
    _update_usage,
    _get_free_slugs,
)
from faithsparks.services.collections import get_collection_meta
from faithsparks.util.slug import normalize_slug


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


def update_zip_bundle():
    from zipfile import ZipFile

    with ZipFile("output/worksheets_bundle.zip", "w") as zf:
        for file in os.listdir("output"):
            if file.endswith(".pdf"):
                zf.write(os.path.join("output", file), file)


def generate():
    try:
        if request.method == "GET":
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

        verse_input = request.form.get("verse", "").strip()
        from_collection = (request.form.get("collection_slug") or "").strip() or None
        custom_text = request.form.get("custom_text", "").strip()
        custom_title = request.form.get("custom_title", "").strip()
        selected_version = request.form.get("version", "esv").strip().lower()
        use_cursive = request.form.get("cursive") == "on"
        custom_prompt = request.form.get("custom_prompt", "").strip()
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

        generated_target = (len(tag_list) if tag_list else 0) + (1 if is_custom else 0)
        user_plan = _get_user_plan(user_email)
        monthly_limit, lifetime_limit = _quota_for_plan(user_plan)
        used_lifetime, used_monthly = _get_usage(user_email)

        def _remaining(limit, used):
            return 10**9 if limit is None else max(0, int(limit) - int(used))

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

        success_count = 0
        free_skip_count = 0
        free_slugs = _get_free_slugs()
        last_pdf = None
        for item in items_to_generate:
            verse = item["verse"]
            version = item["version"]
            is_custom = item["is_custom"]
            text = item.get("text")
            slug = item["slug"]
            pdf_path = f"output/{slug}_{version}{'_cursive' if use_cursive else ''}.pdf"

            if not is_custom and verse and version:
                if normalize_slug(verse) in free_slugs:
                    free_skip_count += 1

            if is_custom:
                data = {
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
                content = request_verse_data(verse, version.lower())
                if not content:
                    flash(f"Could not fetch verse for {verse} ({version}).", "error")
                    continue
                data = parse_and_clean_json(content)
                data.update({"version": version, "cursive": use_cursive})
                save_json_to_file(data, f"output/{slug}_{version}.json")

            try:
                if not isinstance(data, dict):
                    raise ValueError("Invalid data from model")
                if not data.get("verse"):
                    data["verse"] = verse
                if not data.get("version"):
                    data["version"] = version
                if not data.get("fullVerse"):
                    flash(f"AI response missing fullVerse for {verse} ({version}); skipping.", "warning")
                    continue
                generate_pdf(data, pdf_path, use_cursive=use_cursive)
            except Exception as e:
                traceback.print_exc()
                flash(f"Could not build PDF for {verse} ({version}): {e}", "error")
                continue

            if not is_custom:
                canonical_ref = data.get("verse") or verse
                canonical_slug = normalize_slug(canonical_ref)
                desired_path = f"output/{canonical_slug}_{version}{'_cursive' if use_cursive else ''}.pdf"
                if pdf_path != desired_path and os.path.exists(pdf_path):
                    os.replace(pdf_path, desired_path)
                pdf_path = desired_path
                make_thumbnail(canonical_ref, version, os.path.splitext(os.path.basename(pdf_path))[0])
            else:
                make_thumbnail(verse, version, os.path.splitext(os.path.basename(pdf_path))[0])

            if db:
                db.collection("worksheets").add(
                    {
                        "email": user_email,
                        "verse": (data.get("verse") if not is_custom else verse),
                        "version": version,
                        "filename": os.path.basename(pdf_path),
                        "timestamp": firestore.SERVER_TIMESTAMP,
                        "cursive": use_cursive,
                        "custom": is_custom,
                        **({"text": text, "imageIdea": custom_prompt} if is_custom else {}),
                    }
                )

            last_pdf = pdf_path
            success_count += 1

        if db and from_collection:
            try:
                db.collection("analytics").document("pack_generates").set({from_collection: firestore.Increment(1)}, merge=True)
            except Exception:
                pass

        update_zip_bundle()
        try:
            if not free_skip_count:
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
        if doc:
            doc.reference.delete()
        file_path = os.path.join("output", filename)
        if os.path.exists(file_path):
            os.remove(file_path)
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
            if doc:
                doc.reference.delete()
            file_path = os.path.join("output", filename)
            if os.path.exists(file_path):
                os.remove(file_path)
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
        return render_template("history.html", history=history_items, email=user_email)
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
        if storage_client and STORAGE_BUCKET:
            try:
                bucket = storage_client.bucket(STORAGE_BUCKET)
                blob = bucket.blob(f"thumbs/{filename}")
                if blob.exists():
                    blob.make_public()
                    return redirect(blob.public_url)
            except Exception:
                pass
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
                if storage_client and STORAGE_BUCKET:
                    try:
                        bucket = storage_client.bucket(STORAGE_BUCKET)
                        blob = bucket.blob(f"thumbs/{filename}")
                        if blob.exists():
                            blob.make_public()
                            return redirect(blob.public_url)
                    except Exception:
                        pass
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
    fallback_version = "esv" if fallback_version.lower() == "auto" else fallback_version.lower()
    m = re.search(r"\((\w{2,6})\)$", text.strip())
    if m:
        version = m.group(1).lower()
        verse = text[: m.start()].strip()
    else:
        version = fallback_version
        verse = text.strip()
    return version, verse.title()

