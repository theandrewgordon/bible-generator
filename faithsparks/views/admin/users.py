from flask import render_template, request, redirect, url_for, flash
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.usage import _month_key


def plan_norm(p: str) -> str:
    p = (p or "free").lower()
    if p in ("plus_family", "family", "plus"):
        return "plus_family"
    if p in ("plus_classroom", "classroom", "school"):
        return "plus_classroom"
    return "free"


def plan_label(p: str) -> str:
    return {
        "plus_family": "Plus Family",
        "plus_classroom": "Plus Classroom",
        "free": "Free",
    }.get(plan_norm(p), p or "Free")


def admin_users():
    if not db:
        return "Firestore not configured", 500
    q = (request.args.get("q") or "").strip().lower()
    docs = db.collection("users").limit(200).stream()
    users = []
    for d in docs:
        u = d.to_dict() or {}
        u["id"] = d.id
        if q and q not in ((u.get("email", "") or d.id).lower()):
            continue
        users.append(u)
    users.sort(key=lambda u: (u.get("email") or u["id"]).lower())
    return render_template("admin_users.html", users=users, q=q, plan_label=plan_label)


def admin_users_set_plan(uid):
    if not db:
        return "Firestore not configured", 500
    plan = plan_norm(request.form.get("plan", "free"))
    db.collection("users").document(uid).set(
        {"plan": plan, "isPro": plan != "free", "updatedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    flash("Plan updated.", "success")
    return redirect(url_for("admin_users"))


def admin_users_reset_usage(uid):
    if not db:
        return "Firestore not configured", 500
    ref = db.collection("users").document(uid)
    snap = ref.get()
    user = snap.to_dict() if snap.exists else {}
    plan = plan_norm((user or {}).get("plan", "free"))
    mk = _month_key()
    if plan == "free":
        new_usage = {"lifetime": 0, "months": {mk: 0}}
    else:
        existing = (user or {}).get("usage") or {}
        lifetime = int((existing.get("lifetime") or 0))
        new_usage = {"lifetime": lifetime, "months": {mk: 0}}
    ref.set({"usage": new_usage, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    flash(f"Usage reset for {uid} ({plan_label(plan)})", "success")
    return redirect(url_for("admin_users"))

