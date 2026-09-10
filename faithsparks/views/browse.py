import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from urllib.parse import urlparse

from flask import Blueprint, render_template, redirect, url_for, request, session, flash, send_file, abort
from flask_dance.contrib.google import google
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.users import get_user_doc
from faithsparks.services.collections import get_collections, get_collection_meta
from faithsparks.services.storage import signed_url_for_path
from faithsparks.services.stripe_svc import stripe, STRIPE_SECRET_KEY


bp = Blueprint("browse_views", __name__)
MEMBER_PLANS = {"family", "classroom", "plus", "plus_family", "plus_classroom"}
PRICE_CACHE_SECONDS = 10 * 60
_price_cache: dict[str, tuple[float, dict | None]] = {}
_price_cache_lock = threading.Lock()


def _safe_pack_path(filename: str):
    if not filename or Path(filename).suffix.lower() != ".zip":
        return None
    base = Path("output") / "packs"
    base_resolved = base.resolve()
    candidate = (base / filename).resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        return None
    return candidate


def _is_public_browse_enabled() -> bool:
    return os.getenv("PUBLIC_BROWSE", "1") in ("1", "true", "True", "yes", "on")


def _is_admin_email(email: str) -> bool:
    allow = os.getenv("ADMIN_EMAILS", "")
    if not allow:
        return False
    allowed = [e.strip().lower() for e in allow.split(",") if e.strip()]
    return (email or "").lower() in allowed


def _effective_price_id(meta: dict) -> str | None:
    price_id = str(meta.get("priceId") or "").strip()
    if not price_id:
        price_id = os.getenv("STRIPE_DEFAULT_PACK_PRICE", "").strip()
    return price_id or None


def _price_meta(price_id: str | None) -> dict | None:
    if not (price_id and stripe and STRIPE_SECRET_KEY):
        return None
    now = time.monotonic()
    with _price_cache_lock:
        cached = _price_cache.get(price_id)
        if cached and now - cached[0] < PRICE_CACHE_SECONDS:
            return cached[1]
    try:
        price = stripe.Price.retrieve(price_id)
        result = {
            "amount": (price.get("unit_amount") or 0) / 100.0,
            "currency": (price.get("currency") or "usd").upper(),
        }
    except Exception:
        result = None
    with _price_cache_lock:
        _price_cache[price_id] = (now, result)
    return result


def _bundle_has_download(meta: dict) -> bool:
    prewarm = meta.get("prewarm") if isinstance(meta.get("prewarm"), dict) else {}
    local_path = Path("output") / "packs" / f"{meta.get('slug', '')}.zip"
    return bool(meta.get("zipUrl") or prewarm.get("status") == "done" or local_path.exists())


def _bundle_access(meta: dict, user_doc: dict | None = None) -> dict:
    user_doc = user_doc if isinstance(user_doc, dict) else {}
    slug = str(meta.get("slug") or "")
    is_free = bool(meta.get("isFree"))
    is_member = bool(user_doc.get("isPro") or user_doc.get("plan") in MEMBER_PLANS)
    purchased = bool((user_doc.get("purchases") or {}).get(slug))
    entitled = bool(is_free or is_member or purchased)
    price_id = _effective_price_id(meta)
    return {
        "is_free": is_free,
        "is_member": is_member,
        "purchased": purchased,
        "entitled": entitled,
        "locked": not entitled,
        "price_id": price_id,
        "can_buy": bool(not entitled and price_id),
        "has_download": _bundle_has_download(meta),
        "can_download": bool(entitled and _bundle_has_download(meta)),
    }


def browse():
    if not _is_public_browse_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))
    user_doc = {}
    if db and google.authorized and session.get("user_email"):
        try:
            user_doc = get_user_doc(session.get("user_email")) or {}
        except Exception:
            user_doc = {}
    is_admin = _is_admin_email(session.get("user_email"))
    col_items = get_collections(show_all=is_admin)
    col_items = [c for c in col_items if (c.get("kind") or "bundle") == "bundle"]
    col_items.sort(key=lambda c: (int(c.get("order") or 9999), c.get("displayTitle") or c.get("title", "")))
    collections = [
        {
            "slug": c["slug"],
            "title": c.get("displayTitle") or c["title"],
            "displayTitle": c.get("displayTitle") or c["title"],
            "count": c.get("count") or len(c["verses"]),
            "sampleVerse": (c.get("verses") or [""])[0],
            "zipUrl": c.get("zipUrl"),
            "isFree": c.get("isFree"),
            "isSubscriberOnly": c.get("isSubscriberOnly"),
            "priceId": c.get("priceId"),
            "searchText": c.get("searchText") or "",
            "description": c.get("description") or "",
            "ageRange": c.get("ageRange") or "Ages 6-10",
            "skills": c.get("skills") or [],
            "useCases": c.get("useCases") or [],
            "previewImages": c.get("previewImages") or [],
            "prewarm": c.get("prewarm") or {},
            "access": _bundle_access(c, user_doc),
        }
        for c in col_items
    ]
    top_packs = []
    if db:
        try:
            doc = db.collection("analytics").document("packs").get()
            if doc.exists:
                counts = doc.to_dict() or {}
                by_slug = {c["slug"]: c for c in collections}
                sorted_slugs = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
                for slug, cnt in sorted_slugs[:6]:
                    meta = by_slug.get(slug)
                    if meta:
                        top_packs.append({
                            "slug": slug,
                            "title": meta.get("displayTitle") or meta["title"],
                            "downloads": cnt,
                            "zipUrl": meta.get("zipUrl"),
                            "isFree": meta.get("isFree"),
                            "count": meta.get("count") or len(meta.get("verses") or []),
                        })
        except Exception:
            pass
    return render_template(
        "browse.html",
        collections=collections,
        top_packs=top_packs,
    )


def browse_detail(slug):
    if not _is_public_browse_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))
    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    if (meta.get("kind") or "bundle") == "game":
        return redirect(url_for("games_detail", slug=slug))
    user_doc = {}
    if google.authorized and db:
        try:
            user_doc = get_user_doc(session.get("user_email")) or {}
        except Exception:
            user_doc = {}
    access = _bundle_access(meta, user_doc)
    price_meta = _price_meta(access["price_id"]) if access["can_buy"] else None
    return render_template(
        "browse_detail.html",
        c=meta,
        access=access,
        price_meta=price_meta,
    )


def serve_pack(filename):
    path = _safe_pack_path(filename)
    if not path:
        abort(404)
    if path.exists():
        return send_file(path, as_attachment=True, download_name=path.name, conditional=True)
    return ("", 404)


def dl_pack(slug):
    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    user_doc = {}
    if db and google.authorized and session.get("user_email"):
        try:
            user_doc = get_user_doc(session.get("user_email")) or {}
        except Exception:
            user_doc = {}
    access = _bundle_access(meta, user_doc)
    if access["locked"] and not (google.authorized and session.get("user_email")):
        flash("Please sign in to download packs.", "warning")
        return redirect(url_for("google.login", next=request.url))
    if access["locked"]:
        if access["can_buy"]:
            flash("This bundle is included with Plus, or available as a one-time purchase.", "info")
            return redirect(url_for("browse_detail", slug=slug))
        flash("This bundle is included with Plus.", "info")
        return redirect(url_for("plus_pricing"))
    if db:
        try:
            db.collection("analytics").document("packs").set({slug: firestore.Increment(1)}, merge=True)
            today = datetime.now(timezone.utc).strftime("%Y%m%d")
            db.collection("analytics_daily").document(f"packs_{today}").set({slug: firestore.Increment(1)}, merge=True)
        except Exception:
            pass
    url = meta.get("zipUrl")
    try:
        gcs_signed = signed_url_for_path(f"packs/{slug}.zip", minutes=120)
        if gcs_signed:
            return redirect(gcs_signed)
    except Exception:
        pass
    if url:
        parsed = urlparse(url)
        local_packs_path = parsed.path.startswith("/packs/") and (
            not parsed.netloc or parsed.netloc == urlparse(request.host_url).netloc
        )
        if not local_packs_path:
            return redirect(url)
    path = os.path.join("output", "packs", f"{slug}.zip")
    if os.path.exists(path):
        return send_file(path, as_attachment=True, download_name=os.path.basename(path), conditional=True)
    flash(
        "The prepared ZIP is temporarily unavailable. You can still use the verse list to make worksheets.",
        "warning",
    )
    return redirect(url_for("browse_detail", slug=slug))
