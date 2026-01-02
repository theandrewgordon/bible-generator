import os
import re
import json
import threading
import traceback
from zipfile import ZipFile
from datetime import datetime, timezone

from flask import (
    render_template,
    request,
    redirect,
    url_for,
    flash,
    jsonify,
)
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections, get_collection_meta, load_collections
from faithsparks.services.storage import upload_to_storage
from faithsparks.services.stripe_svc import stripe, STRIPE_SECRET_KEY
from faithsparks.util.slug import normalize_slug
from faithsparks.views.worksheets import extract_version_from_text
from verse_helpers import request_verse_data, parse_and_clean_json, save_json_to_file
from build_pdf import generate_pdf


def admin_seed_collections():
    if not db:
        return "Firestore not configured", 500
    email = request.environ.get("user_email") or None
    try:
        data = load_collections()
        batch = db.batch()
        order = 1
        for slug, verses in data.items():
            kind = "game" if slug in ("match-the-verse", "word-search-psalms") else "bundle"
            game_type = "match" if slug == "match-the-verse" else "word-search" if slug == "word-search-psalms" else ""
            ref = db.collection("collections").document(slug)
            batch.set(
                ref,
                {
                    "title": slug.replace("-", " ").title(),
                    "verses": verses,
                    "isPublic": True,
                    "order": order,
                    "defaultVersion": "esv",
                    "isFree": True if slug == "starter" else False,
                    "kind": kind,
                    "gameType": game_type,
                },
            )
            order += 1
        batch.commit()
        return "Seeded collections from collections.json", 200
    except Exception as e:
        traceback.print_exc()
        return f"Seed error: {e}", 500


def admin_collections():
    if not db:
        return "Firestore not configured", 500
    cols = get_collections(show_all=True)
    if stripe and STRIPE_SECRET_KEY:
        cache = {}
        for c in cols:
            pid = c.get("priceId")
            if not pid:
                continue
            if pid in cache:
                c["priceMeta"] = cache[pid]
                continue
            try:
                p = stripe.Price.retrieve(pid)
                meta = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
                c["priceMeta"] = meta
                cache[pid] = meta
            except Exception:
                c["priceMeta"] = None
    filt = (request.args.get("visibility") or "all").lower()
    if filt == "public":
        cols = [c for c in cols if c.get("isPublic", True)]
    elif filt == "private":
        cols = [c for c in cols if not c.get("isPublic", True)]
    return render_template("admin_collections.html", collections=cols, visibility=filt)


def admin_collections_new():
    if not db:
        return "Firestore not configured", 500
    if request.method == "POST":
        def _split_list(raw: str):
            parts = re.split(r"[\n,]+", raw or "")
            return [p.strip() for p in parts if p.strip()]
        def _parse_game_items(raw: str):
            items = []
            for line in (raw or "").splitlines():
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 2:
                    continue
                ref = parts[0]
                text = parts[1]
                version = parts[2] if len(parts) > 2 else ""
                items.append({
                    "reference": ref,
                    "text": text,
                    "version": version,
                })
            return items
        def _parse_game_words(raw: str):
            words = []
            for line in (raw or "").splitlines():
                word = line.strip()
                if word:
                    words.append(word)
            return words

        slug = (request.form.get("slug") or "").strip().lower()
        title = (request.form.get("title") or slug.replace("-", " ").title()).strip()
        is_public = request.form.get("isPublic") == "on"
        is_free = request.form.get("isFree") == "on"
        kind = (request.form.get("kind") or "bundle").strip().lower()
        default_version = (request.form.get("defaultVersion") or "").strip().lower() or None
        order = request.form.get("order")
        order_val = int(order) if order and order.isdigit() else None
        zip_url = (request.form.get("zipUrl") or "").strip() or None
        description = (request.form.get("description") or "").strip()
        is_sub_only = request.form.get("isSubscriberOnly") == "on"
        price_id = (request.form.get("priceId") or "").strip() or None
        age_range = (request.form.get("ageRange") or "").strip() or None
        skills = _split_list(request.form.get("skills") or "")
        use_cases = _split_list(request.form.get("useCases") or "")
        preview_images = _split_list(request.form.get("previewImages") or "")
        game_items = _parse_game_items(request.form.get("gameItems") or "")
        game_words = _parse_game_words(request.form.get("gameWords") or "")
        game_type = (request.form.get("gameType") or "").strip().lower()
        theme = (request.form.get("theme") or "").strip() or None
        difficulty = (request.form.get("difficulty") or "standard").strip().lower()
        verses_raw = request.form.get("verses") or ""
        parts = re.split(r"[\n,]+", verses_raw)
        verses = [p.strip() for p in parts if p.strip()]
        if not slug or not verses:
            flash("Slug and at least one verse are required", "error")
            return render_template("admin_collection_form.html", mode="new", data=request.form)
        data = {
            "title": title,
            "verses": verses,
            "isPublic": is_public,
            "isFree": is_free,
            "description": description,
            "isSubscriberOnly": is_sub_only,
            "priceId": price_id,
            "kind": kind,
            "ageRange": age_range,
            "skills": skills,
            "useCases": use_cases,
            "previewImages": preview_images,
            "gameItems": game_items,
            "gameWords": game_words,
            "gameType": game_type,
            "theme": theme,
            "difficulty": difficulty,
        }
        data["defaultVersion"] = default_version or "esv"
        if order_val is not None:
            data["order"] = order_val
        if zip_url:
            data["zipUrl"] = zip_url
        db.collection("collections").document(slug).set(data)
        flash("Item created", "success")
        return redirect(url_for("admin_collections"))
    return render_template("admin_collection_form.html", mode="new", data={})


def admin_collections_edit(slug):
    if not db:
        return "Firestore not configured", 500
    doc = db.collection("collections").document(slug).get()
    if not doc.exists:
        return "Not found", 404
    current = doc.to_dict()
    if request.method == "POST":
        def _split_list(raw: str):
            parts = re.split(r"[\n,]+", raw or "")
            return [p.strip() for p in parts if p.strip()]
        def _parse_game_items(raw: str):
            items = []
            for line in (raw or "").splitlines():
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 2:
                    continue
                ref = parts[0]
                text = parts[1]
                version = parts[2] if len(parts) > 2 else ""
                items.append({
                    "reference": ref,
                    "text": text,
                    "version": version,
                })
            return items
        def _parse_game_words(raw: str):
            words = []
            for line in (raw or "").splitlines():
                word = line.strip()
                if word:
                    words.append(word)
            return words

        title = (request.form.get("title") or "").strip() or current.get("title")
        is_public = request.form.get("isPublic") == "on"
        is_free = request.form.get("isFree") == "on"
        is_sub_only = request.form.get("isSubscriberOnly") == "on"
        kind = (request.form.get("kind") or current.get("kind") or "bundle").strip().lower()
        price_id = (request.form.get("priceId") or "").strip() or None
        age_range = (request.form.get("ageRange") or "").strip() or None
        skills = _split_list(request.form.get("skills") or "")
        use_cases = _split_list(request.form.get("useCases") or "")
        preview_images = _split_list(request.form.get("previewImages") or "")
        game_items = _parse_game_items(request.form.get("gameItems") or "")
        game_words = _parse_game_words(request.form.get("gameWords") or "")
        game_type = (request.form.get("gameType") or "").strip().lower()
        theme = (request.form.get("theme") or "").strip() or None
        difficulty = (request.form.get("difficulty") or "standard").strip().lower()
        if is_free:
            is_sub_only = False
            price_id = None
        data = {
            "title": title,
            "verses": current.get("verses", []),
            "isPublic": is_public,
            "isFree": is_free,
            "description": current.get("description", ""),
            "isSubscriberOnly": is_sub_only,
            "priceId": price_id,
            "kind": kind,
            "ageRange": age_range,
            "skills": skills,
            "useCases": use_cases,
            "previewImages": preview_images,
            "gameItems": game_items,
            "gameWords": game_words,
            "gameType": game_type,
            "theme": theme,
            "difficulty": difficulty,
        }
        db.collection("collections").document(slug).set(data, merge=True)
        flash("Item updated", "success")
        return redirect(url_for("admin_collections"))
    form_data = {
        "slug": slug,
        "title": current.get("title", ""),
        "isPublic": current.get("isPublic", True),
        "isFree": current.get("isFree", False),
        "isSubscriberOnly": current.get("isSubscriberOnly", False),
        "kind": current.get("kind", "bundle"),
        "priceId": current.get("priceId", ""),
        "defaultVersion": current.get("defaultVersion", ""),
        "order": current.get("order", ""),
        "zipUrl": current.get("zipUrl", ""),
        "description": current.get("description", ""),
        "verses": "\n".join(current.get("verses", [])),
        "ageRange": current.get("ageRange", ""),
        "skills": ", ".join(current.get("skills", []) or []),
        "useCases": ", ".join(current.get("useCases", []) or []),
        "previewImages": "\n".join(current.get("previewImages", []) or []),
        "gameItems": "\n".join([
            " | ".join([item.get("reference", ""), item.get("text", ""), item.get("version", "")]).strip(" |")
            for item in (current.get("gameItems") or [])
        ]),
        "gameWords": "\n".join(current.get("gameWords", []) or []),
        "gameType": current.get("gameType", ""),
        "theme": current.get("theme", ""),
        "difficulty": current.get("difficulty", ""),
    }
    return render_template("admin_collection_form.html", mode="edit", data=form_data)


def admin_collections_delete(slug):
    if not db:
        return "Firestore not configured", 500
    db.collection("collections").document(slug).delete()
    flash("Collection deleted", "success")
    return redirect(url_for("admin_collections"))


def admin_collections_move(slug):
    if not db:
        return "Firestore not configured", 500
    direction = request.form.get("dir", "up")
    items = get_collections(show_all=True)
    items.sort(key=lambda c: (int(c.get("order") or 9999), c.get("title", "")))
    idx = next((i for i, c in enumerate(items) if c["slug"] == slug), None)
    if idx is None:
        return redirect(url_for("admin_collections"))
    if direction == "up" and idx > 0:
        a, b = items[idx - 1], items[idx]
    elif direction == "down" and idx < len(items) - 1:
        a, b = items[idx], items[idx + 1]
    else:
        return redirect(url_for("admin_collections"))
    a_order = int(a.get("order") or (idx))
    b_order = int(b.get("order") or (idx + 1))
    try:
        db.collection("collections").document(a["slug"]).set({"order": b_order}, merge=True)
        db.collection("collections").document(b["slug"]).set({"order": a_order}, merge=True)
    except Exception:
        pass
    return redirect(url_for("admin_collections"))


def admin_collections_set_order(slug):
    if not db:
        return "Firestore not configured", 500
    order = request.form.get("order")
    try:
        val = int(order)
    except Exception:
        flash("Invalid order value", "error")
        return redirect(url_for("admin_collections"))
    try:
        db.collection("collections").document(slug).set({"order": val}, merge=True)
    except Exception:
        pass
    return redirect(url_for("admin_collections"))


def admin_prewarm_pack(slug):
    if not db:
        return "Firestore not configured", 500
    ref = db.collection("collections").document(slug)
    ref.set({"prewarm": {"status": "running", "startedAt": firestore.SERVER_TIMESTAMP}}, merge=True)

    def _job():
        try:
            meta = get_collection_meta(slug)
            if not meta:
                ref.set({"prewarm": {"status": "error", "error": "Not found", "finishedAt": firestore.SERVER_TIMESTAMP}}, merge=True)
                return
            verses = meta.get("verses", [])
            default_version = (meta.get("defaultVersion") or "esv").lower()
            use_cursive = False
            ref.set({"prewarm": {"status": "running", "total": len(verses), "done": 0, "startedAt": firestore.SERVER_TIMESTAMP}}, merge=True)
            generated_files = []
            done = 0
            for v in verses:
                try:
                    version, verse = extract_version_from_text(v, default_version)
                    input_slug = normalize_slug(verse)
                    version_up = version.upper()
                    pdf_path = f"output/{input_slug}_{version_up}.pdf"
                    cached = db.collection("verse_cache").document(f"{input_slug}_{version_up}").get()
                    if cached and cached.exists:
                        data = cached.to_dict().get("data", {})
                    else:
                        content = request_verse_data(verse, version)
                        if not content:
                            continue
                        data = parse_and_clean_json(content)
                        if not data or not data.get("fullVerse"):
                            continue
                        data.update({"version": version_up, "cursive": use_cursive})
                        db.collection("verse_cache").document(f"{input_slug}_{version_up}").set(
                            {
                                "verse": verse,
                                "version": version_up,
                                "slug": f"{input_slug}_{version_up}",
                                "data": data,
                                "timestamp": firestore.SERVER_TIMESTAMP,
                            }
                        )
                        save_json_to_file(data, f"output/{input_slug}_{version_up}.json")
                    if not os.path.exists(pdf_path):
                        generate_pdf(data, pdf_path, use_cursive=use_cursive)
                    if os.path.exists(pdf_path):
                        generated_files.append(pdf_path)
                finally:
                    done += 1
                    try:
                        ref.set({"prewarm": {"status": "running", "total": len(verses), "done": done}}, merge=True)
                    except Exception:
                        pass
            if not generated_files:
                ref.set({"prewarm": {"status": "error", "error": "No files generated", "finishedAt": firestore.SERVER_TIMESTAMP}}, merge=True)
                return
            zip_name = f"{slug}.zip"
            zip_path = os.path.join("output", "packs", zip_name)
            try:
                with ZipFile(zip_path, "w") as z:
                    for p in generated_files:
                        z.write(p, os.path.basename(p))
            except Exception as e:
                traceback.print_exc()
                ref.set({"prewarm": {"status": "error", "error": str(e), "finishedAt": firestore.SERVER_TIMESTAMP}}, merge=True)
                return
            # Build URL (prefer GCS via upload_to_storage; fallback to local serve)
            url = upload_to_storage(zip_path, f"packs/{zip_name}")
            if not url:
                try:
                    url = url_for("serve_pack", filename=zip_name, _external=True)
                except Exception:
                    url = None
            ref.set(
                {
                    "zipUrl": url,
                    "prewarm": {
                        "status": "done",
                        "finishedAt": firestore.SERVER_TIMESTAMP,
                        "done": len(generated_files),
                        "total": len(verses),
                    },
                },
                merge=True,
            )
        except Exception as e:
            traceback.print_exc()
            ref.set(
                {"prewarm": {"status": "error", "error": str(e), "finishedAt": firestore.SERVER_TIMESTAMP}},
                merge=True,
            )

    threading.Thread(target=_job, daemon=True).start()
    flash("Prewarm started. You can refresh this page to see progress.", "success")
    return redirect(url_for("browse_detail", slug=slug))


def admin_prewarm_status(slug):
    if not db:
        return ("Firestore not configured", 500)
    try:
        doc = db.collection("collections").document(slug).get()
        if not doc.exists:
            return jsonify({"error": "Not found"}), 404
        data = doc.to_dict() or {}
        pr = data.get("prewarm") or {}
        safe = {}
        for k, v in pr.items():
            try:
                json.dumps(v)
                safe[k] = v
            except Exception:
                try:
                    if hasattr(v, "isoformat"):
                        safe[k] = v.isoformat()  # type: ignore
                    else:
                        safe[k] = str(v)
                except Exception:
                    safe[k] = str(v)
        if data.get("zipUrl"):
            safe["zipUrl"] = data.get("zipUrl")
        return jsonify(safe), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
