from datetime import datetime, timezone, timedelta
from flask import render_template
from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections
from faithsparks.services import analytics as analytics_svc


def admin_analytics():
    col_items = get_collections(show_all=True)
    by_slug = {c["slug"]: c for c in col_items}
    top_packs = []
    top_packs_week = []
    top_verses = []
    top_verses_week = []
    traffic = {"series": [], "total_visitors": 0, "total_logins": 0}
    recent_hits = []
    try:
        traffic = analytics_svc.daily_overview()
        recent_hits = analytics_svc.recent_visits()
    except Exception:
        traffic = {"series": [], "total_visitors": 0, "total_logins": 0}
        recent_hits = []
    if db:
        try:
            doc = db.collection("analytics").document("packs").get()
            if doc.exists:
                counts = doc.to_dict() or {}
                for slug, cnt in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                    top_packs.append({"slug": slug, "title": by_slug.get(slug, {"title": slug}).get("title"), "downloads": cnt})
        except Exception:
            pass
        try:
            agg = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                d = (today - timedelta(days=i)).strftime("%Y%m%d")
                dd = db.collection("analytics_daily").document(f"packs_{d}").get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for slug, n in data.items():
                        agg[slug] = agg.get(slug, 0) + int(n)
            for slug, cnt in sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                top_packs_week.append({"slug": slug, "title": by_slug.get(slug, {"title": slug}).get("title"), "downloads": cnt})
        except Exception:
            pass
        try:
            d = db.collection("analytics").document("verses").get()
            if d.exists:
                data = d.to_dict() or {}
                for k, v in sorted(data.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                    top_verses.append({"key": k, "count": v})
        except Exception:
            pass
        try:
            agg = {}
            today = datetime.now(timezone.utc).date()
            for i in range(7):
                dkey = (today - timedelta(days=i)).strftime("%Y%m%d")
                dd = db.collection("analytics_daily").document(f"verses_{dkey}").get()
                if dd.exists:
                    data = dd.to_dict() or {}
                    for key, n in data.items():
                        agg[key] = agg.get(key, 0) + int(n)
            for k, v in sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:10]:
                top_verses_week.append({"key": k, "count": v})
        except Exception:
            pass
    return render_template(
        "admin_analytics.html",
        top_packs=top_packs,
        top_packs_week=top_packs_week,
        top_verses=top_verses,
        top_verses_week=top_verses_week,
        traffic=traffic,
        recent_hits=recent_hits,
    )
