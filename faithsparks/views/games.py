import os
import random
import re
from datetime import datetime, timezone, timedelta
from typing import Dict

from flask import render_template, redirect, url_for, request, session, flash, send_file
from flask_dance.contrib.google import google
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections, get_collection_meta
from faithsparks.services.storage import signed_url_for_path
from faithsparks.services.stripe_svc import stripe, STRIPE_SECRET_KEY
from faithsparks.services.usage import _get_user_plan, _get_usage, _quota_for_plan, _update_usage
from build_games import generate_match_game_pdf, MatchItem
from verse_helpers import request_verse_data, parse_and_clean_json


def _is_public_games_enabled() -> bool:
    return os.getenv("PUBLIC_GAMES", os.getenv("PUBLIC_BROWSE", "0")) in (
        "1",
        "true",
        "True",
        "yes",
        "on",
    )


def _is_admin_email(email: str) -> bool:
    allow = os.getenv("ADMIN_EMAILS", "")
    if not allow:
        return False
    allowed = [e.strip().lower() for e in allow.split(",") if e.strip()]
    return (email or "").lower() in allowed


def _usage_snapshot(email: str):
    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)

    def remain(limit, used):
        return None if limit is None else max(0, int(limit) - int(used))

    remain_m = remain(m_limit, used_m)
    return {
        "plan": plan,
        "monthly_used": int(used_m),
        "monthly_limit": m_limit,
        "lifetime_used": int(used_life),
        "lifetime_limit": l_limit,
        "monthly_remaining": remain_m,
    }


def games():
    if not _is_public_games_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))

    is_admin = _is_admin_email(session.get("user_email"))
    signed_in = bool(google.authorized)
    user_email = session.get("user_email") if signed_in else None

    col_items = get_collections(show_all=is_admin)
    col_items = [c for c in col_items if (c.get("kind") or "bundle") == "game"]
    col_items.sort(key=lambda c: (int(c.get("order") or 9999), c.get("title", "")))

    purchases = {}
    is_member = False
    if db and signed_in:
        try:
            u = db.collection("users").document(user_email).get()
            if u.exists:
                ud = u.to_dict() or {}
                is_member = ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom"))
                purchases = ud.get("purchases") or {}
        except Exception:
            purchases = {}

    games_list = []
    for c in col_items:
        slug = c.get("slug")
        is_free = bool(c.get("isFree"))
        is_sub_only = bool(c.get("isSubscriberOnly"))
        purchased = bool(purchases.get(slug))
        locked = is_sub_only and not is_member and not purchased
        can_download = signed_in and not locked
        games_list.append({
            "slug": slug,
            "title": c.get("title"),
            "description": c.get("description", ""),
            "zipUrl": c.get("zipUrl"),
            "isFree": is_free,
            "isSubscriberOnly": is_sub_only,
            "priceId": c.get("priceId"),
            "ageRange": c.get("ageRange"),
            "skills": c.get("skills") or [],
            "useCases": c.get("useCases") or [],
            "previewImages": c.get("previewImages") or [],
            "locked": locked,
            "can_download": can_download,
            "purchased": purchased,
        })

    if stripe and STRIPE_SECRET_KEY:
        seen: Dict[str, dict] = {}
        for g in games_list:
            pid = g.get("priceId")
            if not pid:
                continue
            if pid in seen:
                g["priceMeta"] = seen[pid]
                continue
            try:
                p = stripe.Price.retrieve(pid)
                meta = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
                g["priceMeta"] = meta
                seen[pid] = meta
            except Exception:
                g["priceMeta"] = None

    usage_info = _usage_snapshot(user_email) if signed_in else None

    return render_template(
        "games.html",
        games=games_list,
        signed_in=signed_in,
        usage_info=usage_info,
    )


def games_detail(slug):
    if not _is_public_games_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))

    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    if (meta.get("kind") or "bundle") != "game":
        return redirect(url_for("browse_detail", slug=slug))

    signed_in = bool(google.authorized)
    can_download = False
    needs_member = False

    if signed_in and db:
        email = session.get("user_email")
        try:
            u = db.collection("users").document(email).get()
            if u.exists:
                ud = u.to_dict() or {}
                is_member = ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom"))
                if meta.get("isSubscriberOnly") and not (is_member or (ud.get("purchases") or {}).get(slug)):
                    needs_member = True
                else:
                    can_download = True
        except Exception:
            pass

    if meta.get("priceId") and stripe and STRIPE_SECRET_KEY:
        try:
            p = stripe.Price.retrieve(meta["priceId"])
            meta["priceMeta"] = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
        except Exception:
            meta["priceMeta"] = None

    usage_info = _usage_snapshot(session.get("user_email")) if signed_in else None
    return render_template(
        "games_detail.html",
        c=meta,
        can_download=can_download,
        needs_member=needs_member,
        signed_in=signed_in,
        usage_info=usage_info,
    )


def games_create():
    if not google.authorized:
        flash("Please sign in to create a game.", "warning")
        return redirect(url_for("google.login", next=request.url))

    email = session.get("user_email")
    if request.method == "GET":
        usage_info = _usage_snapshot(email)
        return render_template("games_create.html", usage_info=usage_info)

    title = (request.form.get("title") or "Match the Verse").strip()
    version = (request.form.get("version") or "esv").strip().lower()
    refs_raw = request.form.get("references") or ""
    game_items_raw = request.form.get("gameItems") or ""

    refs = [r.strip() for r in re.split(r"[\n,]+", refs_raw) if r.strip()]
    game_items = []
    for line in (game_items_raw or "").splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        ref = parts[0]
        text = parts[1]
        v = parts[2] if len(parts) > 2 else ""
        game_items.append({"reference": ref, "text": text, "version": v})

    if not refs and not game_items:
        flash("Add at least one reference or match item.", "warning")
        return redirect(url_for("games_create"))

    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)
    if (m_limit is not None and used_m >= m_limit) or (l_limit is not None and used_life >= l_limit):
        flash("You’ve used all your credits for this month.", "warning")
        return redirect(url_for("games_create"))

    pdf_dir = os.path.join("output", "games")
    os.makedirs(pdf_dir, exist_ok=True)
    safe_title = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "match-the-verse"
    pdf_path = os.path.join(pdf_dir, f"custom-{safe_title}-{version}.pdf")

    try:
        refs, verses, key = _build_match_game_from_inputs(refs, version, game_items)
        generate_match_game_pdf(title, refs, verses, key, pdf_path)
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception:
        flash("Could not create this game yet.", "warning")
        return redirect(url_for("games_create"))


def dl_game(slug):
    if not db:
        return "Firestore not configured", 500
    d = db.collection("collections").document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict() or {}
    if (meta.get("kind") or "bundle") != "game":
        return "Not found", 404

    if not google.authorized:
        flash("Please sign in to download games.", "warning")
        return redirect(url_for("google.login", next=request.url))

    allowed = not bool(meta.get("isSubscriberOnly"))
    email = session.get("user_email")
    if db and email:
        try:
            u = db.collection("users").document(email).get()
            if u.exists:
                ud = u.to_dict() or {}
                if ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom")):
                    allowed = True
                purchases = ud.get("purchases") or {}
                if purchases.get(slug):
                    allowed = True
        except Exception:
            pass

    if meta.get("isSubscriberOnly") and not allowed:
        flash("This game is included with Membership.", "info")
        return redirect(url_for("games_detail", slug=slug))

    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)
    if (m_limit is not None and used_m >= m_limit) or (l_limit is not None and used_life >= l_limit):
        flash("You’ve used all your credits for this month.", "warning")
        return redirect(url_for("games_detail", slug=slug))

    try:
        db.collection("analytics").document("games").set({slug: firestore.Increment(1)}, merge=True)
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        db.collection("analytics_daily").document(f"games_{today}").set({slug: firestore.Increment(1)}, merge=True)
    except Exception:
        pass

    try:
        gcs_signed = signed_url_for_path(f"games/{slug}.zip", minutes=120)
        if gcs_signed:
            _update_usage(email, 1)
            return redirect(gcs_signed)
    except Exception:
        pass

    url = meta.get("zipUrl")
    if url:
        _update_usage(email, 1)
        return redirect(url)

    path = os.path.join("output", "games", f"{slug}.zip")
    if os.path.exists(path):
        _update_usage(email, 1)
        return send_file(path, as_attachment=True, download_name=os.path.basename(path), conditional=True)

    # Build a fresh PDF if no ZIP exists yet
    pdf_dir = os.path.join("output", "games")
    os.makedirs(pdf_dir, exist_ok=True)
    version = (request.args.get("version") or meta.get("defaultVersion") or "esv").lower()
    pdf_path = os.path.join(pdf_dir, f"{slug}-{version}.pdf")
    try:
        refs, verses, key = _build_match_game_items(meta, version)
        generate_match_game_pdf(
            meta.get("title") or "Match the Verse",
            refs,
            verses,
            key,
            pdf_path,
        )
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception:
        return "Game not available", 404


def _build_match_game_items(meta, version: str):
    base_refs = list(meta.get("verses") or [])
    version = (version or meta.get("defaultVersion") or "esv").lower()
    refs = base_refs[:6]
    verses = []
    game_items = meta.get("gameItems") or []
    if game_items:
        refs = []
        for item in game_items[:6]:
            ref = (item.get("reference") or "").strip()
            text = (item.get("text") or "").strip()
            v = (item.get("version") or version).strip().lower() or version
            if not ref or not text:
                continue
            refs.append(ref)
            verses.append(MatchItem(text=text, version=v))
        if refs:
            order = list(range(len(verses)))
            rng = random.Random(meta.get("slug") or "")
            rng.shuffle(order)
            shuffled = [verses[i] for i in order]
            answer_key = [order.index(i) + 1 for i in range(len(verses))]
            return refs, shuffled, answer_key
        refs = base_refs[:6]
    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            text = (data.get("fullVerse") or "").strip() or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    rng = random.Random(meta.get("slug") or "")
    order = list(range(len(verses)))
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key


def _build_match_game_from_inputs(refs, version, game_items):
    refs = list(refs or [])[:6]
    version = (version or "esv").lower()
    verses = []
    if game_items:
        refs = []
        for item in game_items[:6]:
            ref = (item.get("reference") or "").strip()
            text = (item.get("text") or "").strip()
            v = (item.get("version") or version).strip().lower() or version
            if not ref or not text:
                continue
            refs.append(ref)
            verses.append(MatchItem(text=text, version=v))
        if refs:
            order = list(range(len(verses)))
            rng = random.Random("custom-game")
            rng.shuffle(order)
            shuffled = [verses[i] for i in order]
            answer_key = [order.index(i) + 1 for i in range(len(verses))]
            return refs, shuffled, answer_key

    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            text = (data.get("fullVerse") or "").strip() or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    order = list(range(len(verses)))
    rng = random.Random("custom-game")
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key
