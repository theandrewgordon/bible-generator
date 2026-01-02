import os
import random
import re
from datetime import datetime, timezone, timedelta
from typing import Dict

from flask import render_template, redirect, url_for, request, session, flash, send_file, jsonify
from flask_dance.contrib.google import google
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections, get_collection_meta
from faithsparks.services.storage import signed_url_for_path
from faithsparks.services.stripe_svc import stripe, STRIPE_SECRET_KEY
from faithsparks.services.usage import _get_user_plan, _get_usage, _quota_for_plan, _update_usage
from build_games import generate_match_game_pdf, generate_word_search_pdf, generate_crossword_pdf, MatchItem
from verse_helpers import (
    request_verse_data,
    request_verse_meaning,
    request_theme_label,
    request_crossword_clues,
    parse_and_clean_json,
)


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


def _match_render_options(game_type: str):
    game_type = (game_type or "match").strip().lower()
    if game_type == "match-meaning":
        return (
            "Draw a line to connect each Bible reference (left) to the correct meaning (right).",
            False,
        )
    return (
        "Draw a line to match each Bible reference (left) to the correct verse (right).",
        True,
    )


def _default_game_title(game_type: str) -> str:
    game_type = (game_type or "match").strip().lower()
    if game_type == "word-search":
        return "Word Search"
    if game_type == "crossword":
        return "Crossword"
    if game_type == "match-meaning":
        return "Match the Meaning"
    return "Match the Verse"


def _derive_theme_from_text(text: str) -> str:
    words = _extract_words(text or "", limit=5)
    return words[0].title() if words else ""


def _derive_theme_from_refs(refs: list[str]) -> str:
    if not refs:
        return ""
    book = (refs[0] or "").split()[0]
    return book.title() if book else ""


def _ai_theme_from_text(text: str) -> str:
    if not text:
        return ""
    try:
        content = request_theme_label(text, context_label="verse")
        data = parse_and_clean_json(content)
        return (data.get("theme") or "").strip()
    except Exception:
        return ""


def _ai_theme_from_words(words: list[str]) -> str:
    if not words:
        return ""
    try:
        sample = ", ".join(words[:12])
        content = request_theme_label(sample, context_label="word list")
        data = parse_and_clean_json(content)
        return (data.get("theme") or "").strip()
    except Exception:
        return ""


def _derive_theme(game_type: str, refs: list[str], verses: list[MatchItem], words: list[str]) -> str:
    if words:
        return _ai_theme_from_words(words) or (words[0] or "").title()
    if verses:
        return _ai_theme_from_text(verses[0].text) or _derive_theme_from_text(verses[0].text)
    return _derive_theme_from_refs(refs)


def _normalize_difficulty(raw: str) -> str:
    val = (raw or "standard").strip().lower()
    return val if val in ("simple", "standard") else "standard"


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
        game_type = c.get("gameType") or "match"
        games_list.append({
            "slug": slug,
            "title": c.get("title") or _default_game_title(game_type),
            "description": c.get("description", ""),
            "zipUrl": c.get("zipUrl"),
            "isFree": is_free,
            "isSubscriberOnly": is_sub_only,
            "priceId": c.get("priceId"),
            "gameType": game_type,
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
    if not meta.get("title"):
        meta["title"] = _default_game_title(meta.get("gameType") or "match")

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

    raw_title = (request.form.get("title") or "").strip()
    version = (request.form.get("version") or "esv").strip().lower()
    game_type = (request.form.get("gameType") or "match").strip().lower()
    if raw_title:
        title = raw_title
    else:
        title = _default_game_title(game_type)
    refs_raw = request.form.get("references") or ""
    theme = (request.form.get("theme") or "").strip()
    difficulty = _normalize_difficulty(request.form.get("difficulty") or "standard")
    game_items_raw = request.form.get("gameItems") or ""
    game_words_raw = request.form.get("gameWords") or ""

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

    game_words = [w.strip() for w in (game_words_raw or "").splitlines() if w.strip()]

    if not refs and not game_items and not game_words:
        flash("Add at least one reference or match item.", "warning")
        return redirect(url_for("games_create"))
    if game_type == "match-meaning" and not game_items and not refs:
        flash("Add references or match items for Match the Meaning.", "warning")
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
        if game_type == "word-search":
            words = _build_word_search_words_from_inputs(refs, version, game_words, difficulty)
            if not theme:
                theme = _derive_theme(game_type, refs, [], words)
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words."
            generate_word_search_pdf(
                title,
                words,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        elif game_type == "crossword":
            words = _build_word_search_words_from_inputs(refs, version, game_words, difficulty)
            if not theme:
                theme = _derive_theme(game_type, refs, [], words)
            subtitle = f"Theme: {theme}" if theme else None
            clues = _build_crossword_clues(words, theme)
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words."
            generate_crossword_pdf(
                title,
                words,
                clues,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        else:
            refs, verses, key = _build_match_game_from_inputs(
                refs,
                version,
                game_items,
                allow_fetch=True,
                use_meaning=game_type == "match-meaning",
                difficulty=difficulty,
            )
            if not refs:
                flash("Could not create this game yet.", "warning")
                return redirect(url_for("games_create"))
            directions_text, show_version = _match_render_options(game_type)
            if not theme:
                theme = _derive_theme(game_type, refs, verses, [])
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Difficulty: Simple uses shorter text. Standard uses full text."
            generate_match_game_pdf(
                title,
                refs,
                verses,
                key,
                pdf_path,
                directions_text=directions_text,
                show_version=show_version,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception:
        flash("Could not create this game yet.", "warning")
        return redirect(url_for("games_create"))


def games_words():
    if not google.authorized:
        return jsonify({"error": "signin"}), 401
    payload = request.get_json(silent=True) or {}
    refs_raw = payload.get("refs") or ""
    version = (payload.get("version") or "esv").strip().lower()
    difficulty = _normalize_difficulty(payload.get("difficulty") or "standard")
    refs = [r.strip() for r in re.split(r"[\n,]+", refs_raw) if r.strip()]
    if not refs:
        return jsonify({"words": []}), 200
    words = _build_word_search_words_from_inputs(refs, version, [], difficulty)
    return jsonify({"words": words}), 200


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
        game_type = (meta.get("gameType") or "match").strip().lower()
        title = meta.get("title") or _default_game_title(game_type)
        theme = (meta.get("theme") or "").strip()
        difficulty = _normalize_difficulty(meta.get("difficulty") or "standard")
        if game_type == "word-search":
            words = _build_word_search_words(meta, version, difficulty)
            if not theme:
                theme = _derive_theme(game_type, meta.get("verses") or [], [], words)
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words."
            generate_word_search_pdf(
                title,
                words,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        elif game_type == "crossword":
            words = _build_word_search_words(meta, version, difficulty)
            if not theme:
                theme = _derive_theme(game_type, meta.get("verses") or [], [], words)
            subtitle = f"Theme: {theme}" if theme else None
            clues = _build_crossword_clues(words, theme)
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words."
            generate_crossword_pdf(
                title,
                words,
                clues,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        else:
            refs, verses, key = _build_match_game_items(
                meta,
                version,
                allow_fetch=True,
                use_meaning=game_type == "match-meaning",
                difficulty=difficulty,
            )
            if not refs:
                return "Game not available", 404
            directions_text, show_version = _match_render_options(game_type)
            if not theme:
                theme = _derive_theme(game_type, refs, verses, [])
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Difficulty: Simple uses shorter text. Standard uses full text."
            generate_match_game_pdf(
                title,
                refs,
                verses,
                key,
                pdf_path,
                directions_text=directions_text,
                show_version=show_version,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception:
        return "Game not available", 404


def _build_match_game_items(
    meta,
    version: str,
    allow_fetch: bool = True,
    use_meaning: bool = False,
    difficulty: str = "standard",
):
    base_refs = list(meta.get("verses") or [])
    version = (version or meta.get("defaultVersion") or "esv").lower()
    refs = base_refs[:8]
    verses = []
    game_items = meta.get("gameItems") or []
    if game_items:
        refs = []
        for item in game_items[:8]:
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
        refs = base_refs[:8]
    if not allow_fetch:
        return [], [], []
    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full_verse = (data.get("fullVerse") or "").strip()
            if use_meaning:
                meaning = ""
                try:
                    if difficulty == "simple":
                        meaning_content = request_verse_meaning(ref, full_verse, version, min_words=4, max_words=6)
                    else:
                        meaning_content = request_verse_meaning(ref, full_verse, version)
                    meaning_data = parse_and_clean_json(meaning_content)
                    meaning = (meaning_data.get("meaning") or "").strip()
                except Exception:
                    meaning = ""
                text = meaning or "Meaning unavailable."
            else:
                if difficulty == "simple":
                    text = (data.get("traceableVerse") or full_verse or text).strip()
                else:
                    text = full_verse or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    rng = random.Random(meta.get("slug") or "")
    order = list(range(len(verses)))
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key


def _build_match_game_from_inputs(
    refs,
    version,
    game_items,
    allow_fetch: bool = True,
    use_meaning: bool = False,
    difficulty: str = "standard",
):
    refs = list(refs or [])[:8]
    version = (version or "esv").lower()
    verses = []
    if game_items:
        refs = []
        for item in game_items[:8]:
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
    if not allow_fetch:
        return [], [], []

    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full_verse = (data.get("fullVerse") or "").strip()
            if use_meaning:
                meaning = ""
                try:
                    if difficulty == "simple":
                        meaning_content = request_verse_meaning(ref, full_verse, version, min_words=4, max_words=6)
                    else:
                        meaning_content = request_verse_meaning(ref, full_verse, version)
                    meaning_data = parse_and_clean_json(meaning_content)
                    meaning = (meaning_data.get("meaning") or "").strip()
                except Exception:
                    meaning = ""
                text = meaning or "Meaning unavailable."
            else:
                if difficulty == "simple":
                    text = (data.get("traceableVerse") or full_verse or text).strip()
                else:
                    text = full_verse or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    order = list(range(len(verses)))
    rng = random.Random("custom-game")
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key


_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "your", "you", "from", "into",
    "will", "shall", "lord", "god", "his", "her", "him", "their", "they",
    "them", "are", "was", "were", "who", "whom", "what", "when", "where",
    "why", "how", "but", "not", "all", "any", "our", "out", "over", "under",
    "have", "has", "had", "let", "may", "can", "one", "two", "three", "four",
}


def _extract_words(text: str, limit: int = 12) -> list[str]:
    words = []
    for raw in re.findall(r"[A-Za-z]{4,}", text or ""):
        w = raw.lower()
        if w in _STOPWORDS:
            continue
        if w not in words:
            words.append(w)
        if len(words) >= limit:
            break
    return [w.upper() for w in words]


def _unique_words(words: list[str]) -> list[str]:
    seen = set()
    ordered = []
    for word in words:
        w = (word or "").strip().upper()
        if not w or w in seen:
            continue
        seen.add(w)
        ordered.append(w)
    return ordered


def _build_crossword_clues(words: list[str], theme: str | None) -> list[str]:
    if not words:
        return []
    try:
        content = request_crossword_clues(words, theme=theme)
        data = parse_and_clean_json(content)
        clues = []
        for item in (data.get("clues") or []):
            word = (item.get("word") or "").strip().upper()
            clue = (item.get("clue") or "").strip()
            if word and clue:
                clues.append((word, clue))
        if clues:
            clue_map = {w: c for w, c in clues}
            return [clue_map.get(w, "A Bible word") for w in words]
    except Exception:
        pass
    fallback = "A Bible word"
    return [fallback for _ in words]


def _build_word_search_words(meta, version: str, difficulty: str = "standard") -> list[str]:
    version = (version or meta.get("defaultVersion") or "esv").lower()
    game_words = [w.strip() for w in (meta.get("gameWords") or []) if w.strip()]
    limit = 8 if difficulty == "simple" else 12
    if game_words:
        return _unique_words([w.upper() for w in game_words])[:limit]

    refs = list(meta.get("verses") or [])[:6]
    words = []
    for ref in refs:
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full = (data.get("fullVerse") or "").strip()
            words.extend(_extract_words(full, limit=12))
        except Exception:
            pass
        if len(words) >= limit:
            break
    if not words:
        for ref in refs:
            book = ref.split()[0]
            if book and book.upper() not in words:
                words.append(book.upper())
            if len(words) >= 8:
                break
    return _unique_words(words)[:limit]


def _build_word_search_words_from_inputs(refs, version, game_words, difficulty: str = "standard"):
    limit = 8 if difficulty == "simple" else 12
    if game_words:
        return _unique_words([w.upper() for w in game_words])[:limit]
    refs = list(refs or [])[:6]
    version = (version or "esv").lower()
    words = []
    for ref in refs:
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full = (data.get("fullVerse") or "").strip()
            words.extend(_extract_words(full, limit=12))
        except Exception:
            pass
        if len(words) >= limit:
            break
    if words:
        return _unique_words(words)[:limit]
    return _unique_words([w.upper() for w in refs[:8]])[:limit]
