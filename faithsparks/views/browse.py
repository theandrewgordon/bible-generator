import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict

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
    return os.getenv("PUBLIC_BROWSE", "0") in ("1", "true", "True", "yes", "on")


def _is_admin_email(email: str) -> bool:
    allow = os.getenv("ADMIN_EMAILS", "")
    if not allow:
        return False
    allowed = [e.strip().lower() for e in allow.split(",") if e.strip()]
    return (email or "").lower() in allowed


def browse():
    if not _is_public_browse_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))
    items = []
    if db and google.authorized:
        user_email = session.get("user_email")
        recent = (
            db.collection("worksheets")
            .where(filter=firestore.FieldFilter("email", "==", user_email))
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(24)
            .stream()
        )
        items = [doc.to_dict() for doc in recent]
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
            "zipUrl": c.get("zipUrl"),
            "isFree": c.get("isFree"),
            "isSubscriberOnly": c.get("isSubscriberOnly"),
            "priceId": c.get("priceId"),
            "searchText": c.get("searchText") or "",
        }
        for c in col_items
    ]
    if stripe and STRIPE_SECRET_KEY:
        seen: Dict[str, dict] = {}
        for c in collections:
            pid = c.get("priceId")
            if not pid:
                continue
            if pid in seen:
                c["priceMeta"] = seen[pid]
                continue
            try:
                p = stripe.Price.retrieve(pid)
                meta = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
                c["priceMeta"] = meta
                seen[pid] = meta
            except Exception:
                c["priceMeta"] = None
    top_packs = []
    top_packs_week = []
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
                        top_packs.append({"slug": slug, "title": meta.get("displayTitle") or meta["title"], "downloads": cnt, "zipUrl": meta.get("zipUrl"), "isFree": meta.get("isFree"), "count": meta.get("count") or len(meta.get("verses") or [])})
        except Exception:
            pass
        try:
            by_slug = {c["slug"]: c for c in collections}
            agg: Dict[str, int] = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                d = (today - timedelta(days=i)).strftime("%Y%m%d")
                dd = db.collection("analytics_daily").document(f"packs_{d}").get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for slug, n in data.items():
                        agg[slug] = agg.get(slug, 0) + int(n)
            sorted_slugs = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)
            for slug, cnt in sorted_slugs[:6]:
                meta = by_slug.get(slug)
                if meta:
                    top_packs_week.append({"slug": slug, "title": meta.get("displayTitle") or meta["title"], "downloads": cnt, "zipUrl": meta.get("zipUrl"), "isFree": meta.get("isFree"), "count": meta.get("count") or len(meta.get("verses") or [])})
        except Exception:
            pass
    purchases = {}
    if db and google.authorized:
        purchases = (get_user_doc(session.get("user_email")) or {}).get("purchases") or {}
    return render_template("browse.html", items=items, collections=collections, top_packs=top_packs, top_packs_week=top_packs_week, purchases=purchases)


def browse_detail(slug):
    if not _is_public_browse_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))
    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    if (meta.get("kind") or "bundle") == "game":
        return redirect(url_for("games_detail", slug=slug))
    can_download = False
    needs_purchase = False
    if google.authorized and db:
        email = session.get("user_email")
        try:
            ud = get_user_doc(email)
            if ud:
                if meta.get("isFree"):
                    can_download = True
                elif ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom")):
                    can_download = True
                elif (ud.get("purchases") or {}).get(slug):
                    can_download = True
                elif meta.get("priceId"):
                    needs_purchase = True
        except Exception:
            pass
    if meta.get("priceId") and stripe and STRIPE_SECRET_KEY:
        try:
            p = stripe.Price.retrieve(meta["priceId"])
            meta["priceMeta"] = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
        except Exception:
            meta["priceMeta"] = None
    return render_template("browse_detail.html", c=meta, can_download=can_download, needs_purchase=needs_purchase)


def serve_pack(filename):
    path = _safe_pack_path(filename)
    if not path:
        abort(404)
    if path.exists():
        return send_file(path, as_attachment=True, download_name=path.name, conditional=True)
    return ("", 404)


def dl_pack(slug):
    if not db:
        return "Firestore not configured", 500
    d = db.collection("collections").document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict()
    is_free = bool(meta.get("isFree"))
    if not is_free and not google.authorized:
        flash("Please sign in to download packs.", "warning")
        return redirect(url_for("google.login", next=request.url))
    # Any non-free pack requires entitlement — membership/ownership for
    # subscriber packs, or a purchase for a-la-carte (priceId) packs. Gating only
    # on isSubscriberOnly would let a paid a-la-carte pack be downloaded free.
    if (not is_free) and (meta.get("isSubscriberOnly") or meta.get("priceId")):
        allowed = False
        if google.authorized:
            email = session.get("user_email")
            try:
                ud = get_user_doc(email)
                if ud:
                    if ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom")):
                        allowed = True
                    purchases = ud.get("purchases") or {}
                    if purchases.get(slug):
                        allowed = True
            except Exception:
                pass
        if not allowed:
            if meta.get("priceId"):
                flash("This pack is included with Plus, or buy it a la carte.", "info")
                return redirect(url_for("browse_detail", slug=slug))
            flash("This pack is included with Plus.", "info")
            return redirect(url_for("plus_pricing"))
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
    return "Pack not available", 404
