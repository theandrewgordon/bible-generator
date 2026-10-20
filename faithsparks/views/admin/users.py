from datetime import datetime, timezone

from flask import render_template, request, redirect, url_for, flash, session
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
    collection = db.collection("users")
    if q:
        exact = collection.document(q).get() if "@" in q and "/" not in q and len(q) <= 320 else None
        docs = [exact] if exact is not None and exact.exists else collection.stream()
    else:
        docs = collection.limit(200).stream()
    users = []
    for d in docs:
        u = d.to_dict() or {}
        u["id"] = d.id
        renew_at = u.get("renewAt")
        if isinstance(renew_at, datetime):
            try:
                renew_iso = renew_at.astimezone(timezone.utc).isoformat()
                renew_display = renew_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
            except Exception:
                renew_iso = renew_at.isoformat()
                renew_display = renew_at.strftime("%Y-%m-%d")
        else:
            renew_iso = ""
            renew_display = None
        u["_renew_iso"] = renew_iso
        u["_renew_display"] = renew_display

        if q and q not in ((u.get("email", "") or d.id).lower()):
            continue
        users.append(u)
        if len(users) >= 200:
            break
    users.sort(key=lambda u: (u.get("email") or u["id"]).lower())
    return render_template("admin_users.html", users=users, q=q, plan_label=plan_label)


def _log_admin_action(action: str, target: str, details: dict) -> None:
    """Who changed whose account, and when (gifts already log the same way)."""
    from flask import session as _session
    try:
        db.collection("admin_log").add({
            "action": action,
            "target": target,
            "details": details,
            "by": _session.get("user_email"),
            "at": firestore.SERVER_TIMESTAMP,
        })
    except Exception:
        pass


def admin_users_set_plan(uid):
    if not db:
        return "Firestore not configured", 500
    plan = plan_norm(request.form.get("plan", "free"))
    db.collection("users").document(uid).set(
        {"plan": plan, "isPro": plan != "free", "updatedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    _log_admin_action("set_plan", uid, {"plan": plan})
    flash("Plan updated.", "success")
    return redirect(url_for("admin_users"))


def admin_users_delete(uid):
    """Delete an account on a family's request (the privacy policy promises this)."""
    from faithsparks.services.account_deletion import AccountDeletionError, delete_user_data

    email = (uid or "").strip().lower()
    if (request.form.get("confirm_email") or "").strip().lower() != email:
        flash("Type the account's email to confirm deletion.", "warning")
        return redirect(url_for("admin_users"))
    try:
        summary = delete_user_data(email, by=session.get("user_email") or "admin")
    except AccountDeletionError as exc:
        flash(str(exc), "error")
        return redirect(url_for("admin_users"))
    flash(f"Deleted {email}: {summary.get('worksheets', 0)} worksheets, {summary.get('lesson_packs', 0)} lesson packs.", "success")
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
    _log_admin_action("reset_usage", uid, {"plan": plan})
    flash(f"Usage reset for {uid} ({plan_label(plan)})", "success")
    return redirect(url_for("admin_users"))
