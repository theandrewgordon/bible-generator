from datetime import datetime, timedelta, timezone

from flask import render_template

from faithsparks.services import analytics as analytics_svc
from faithsparks.services.collections import get_collections
from faithsparks.services.firestore import db
from faithsparks.services.game_content_health import load_precomputed_health


def _document_data(client, document_name):
    snapshot = client.collection("analytics").document(document_name).get()
    return (snapshot.to_dict() or {}) if snapshot.exists else {}


def _conversion(numerator, denominator):
    return round((int(numerator or 0) * 100) / int(denominator)) if int(denominator or 0) else None


def admin_analytics():
    col_items = get_collections(show_all=True)
    by_slug = {c["slug"]: c for c in col_items}
    top_packs = []
    top_packs_week = []
    top_verses = []
    top_verses_week = []
    traffic = {"series": [], "total_visitors": 0, "total_logins": 0}
    recent_hits = []
    family_game_night = {
        "sales_page_view": 0,
        "play_free_click": 0,
        "unlock_click": 0,
        "setup_view": 0,
        "room_created": 0,
        "first_player_joined": 0,
        "game_started": 0,
        "game_finished": 0,
        "checkout_started": 0,
        "checkout_canceled": 0,
        "checkout_fulfilled": 0,
    }
    family_feedback = {
        "total": 0,
        "average_enjoyment": None,
        "play_again": {"yes": 0, "maybe": 0, "no": 0},
        "favorite_modes": {"act": 0, "draw": 0, "clue": 0, "guess": 0, "mixed": 0},
        "recent_comments": [],
    }
    weekflow = {
        "page_view": 0,
        "onboarding_complete": 0,
        "plan_generated": 0,
        "plan_approved": 0,
        "rollover_created": 0,
        "template_saved": 0,
        "calendar_imported": 0,
        "calendar_exported": 0,
        "logistics_plan_generated": 0,
        "route_refresh": 0,
        "support_request_sent": 0,
        "support_request_responded": 0,
    }
    weekflow_feedback = {
        "total": 0,
        "realistic": {"yes": 0, "mostly": 0, "no": 0},
        "contact_requested": 0,
        "recent_comments": [],
    }
    try:
        content_health = load_precomputed_health()
    except Exception:
        content_health = {"family_game_night": {}, "bible_bee": {}, "available": False}
    try:
        traffic = analytics_svc.daily_overview()
        recent_hits = analytics_svc.recent_visits()
    except Exception:
        traffic = {"series": [], "total_visitors": 0, "total_logins": 0}
        recent_hits = []
    if db:
        try:
            funnel = _document_data(db, "family_game_night_funnel")
            funnel_events = funnel.get("events") or {}
            family_game_night.update(
                {
                    "sales_page_view": int(funnel_events.get("sales_page_view", 0)),
                    "play_free_click": int(funnel_events.get("play_free_click", 0)),
                    "unlock_click": int(funnel_events.get("unlock_click", 0)),
                    "setup_view": int(funnel_events.get("setup_view", 0)),
                    "room_created": int(funnel_events.get("room_created", 0)),
                    "first_player_joined": int(funnel_events.get("first_player_joined", 0)),
                    "game_started": int(funnel_events.get("game_started", 0)),
                    "game_finished": int(funnel_events.get("game_finished", 0)),
                    "checkout_started": int(
                        _document_data(db, "family_game_night_checkout_started").get("total", 0)
                    ),
                    "checkout_canceled": int(
                        _document_data(db, "family_game_night_checkout_canceled").get("total", 0)
                    ),
                    "checkout_fulfilled": int(
                        _document_data(db, "family_game_night_checkout_fulfilled").get("total", 0)
                    ),
                }
            )
        except Exception:
            pass
        try:
            feedback = _document_data(db, "family_game_night_feedback")
            total = int(feedback.get("total", 0))
            family_feedback.update(
                {
                    "total": total,
                    "average_enjoyment": round(float(feedback.get("ratingSum", 0)) / total, 1) if total else None,
                    "play_again": {
                        key: int((feedback.get("playAgain") or {}).get(key, 0))
                        for key in ("yes", "maybe", "no")
                    },
                    "favorite_modes": {
                        key: int((feedback.get("favoriteMode") or {}).get(key, 0))
                        for key in ("act", "draw", "clue", "guess", "mixed")
                    },
                }
            )
            snapshots = (
                db.collection("family_game_night_feedback")
                .order_by("createdAt", direction="DESCENDING")
                .limit(25)
                .stream()
            )
            family_feedback["recent_comments"] = [
                data
                for snapshot in snapshots
                if (data := (snapshot.to_dict() or {})).get("comment")
            ][:10]
        except Exception:
            pass
        try:
            weekflow_events = (
                _document_data(db, "weekflow_funnel").get("events") or {}
            )
            weekflow.update(
                {key: int(weekflow_events.get(key, 0)) for key in weekflow}
            )
            feedback = _document_data(db, "weekflow_feedback")
            weekflow_feedback.update(
                {
                    "total": int(feedback.get("total", 0)),
                    "realistic": {
                        key: int((feedback.get("realistic") or {}).get(key, 0))
                        for key in ("yes", "mostly", "no")
                    },
                    "contact_requested": int(feedback.get("contactRequested", 0)),
                }
            )
            snapshots = (
                db.collection("weekflow_feedback")
                .order_by("createdAt", direction="DESCENDING")
                .limit(25)
                .stream()
            )
            weekflow_feedback["recent_comments"] = [
                data
                for snapshot in snapshots
                if (data := (snapshot.to_dict() or {})).get("comment")
            ][:10]
        except Exception:
            pass
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
        family_game_night=family_game_night,
        family_game_night_conversions={
            "play_free": _conversion(family_game_night["play_free_click"], family_game_night["sales_page_view"]),
            "room_create": _conversion(family_game_night["room_created"], family_game_night["play_free_click"]),
            "game_start": _conversion(family_game_night["game_started"], family_game_night["room_created"]),
            "game_finish": _conversion(family_game_night["game_finished"], family_game_night["game_started"]),
            "unlock": _conversion(family_game_night["unlock_click"], family_game_night["sales_page_view"]),
            "checkout": _conversion(family_game_night["checkout_started"], family_game_night["unlock_click"]),
            "purchase": _conversion(family_game_night["checkout_fulfilled"], family_game_night["checkout_started"]),
        },
        family_feedback=family_feedback,
        weekflow=weekflow,
        weekflow_conversions={
            "onboarded": _conversion(weekflow["onboarding_complete"], weekflow["page_view"]),
            "generated": _conversion(weekflow["plan_generated"], weekflow["onboarding_complete"]),
            "approved": _conversion(weekflow["plan_approved"], weekflow["plan_generated"]),
        },
        weekflow_feedback=weekflow_feedback,
        content_health=content_health,
    )
