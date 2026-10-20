"""Delete everything FaithSparks holds about one account.

Used by "Delete my account" and by the admin user page. Order matters:

1. Stripe first. Deleting the Stripe customer cancels any subscription, so a
   deleted family is never billed again. If Stripe can't be reached, nothing
   else is deleted and the caller shows an error.
2. Registered steps (worship churches live in app.py and register here).
3. Worksheets (and their private files), lesson packs, Same Brain links.
4. The users/<email> document and every subcollection under it (WeekFlow,
   purchases, game roster, ...).
5. Records kept for disputes and audit (gifts, admin log) keep a hash of the
   email instead of the email.

Game rooms, rate limits and sign-in tokens expire on their own (Firestore TTL).
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Callable

from firebase_admin import firestore

from faithsparks.services.firestore import db

log = logging.getLogger(__name__)

_STEPS: list[tuple[str, Callable[[str], int]]] = []


class AccountDeletionError(RuntimeError):
    pass


def register_step(name: str, fn: Callable[[str], int]) -> None:
    """Add a deletion step for data owned by another module. fn(email) -> count."""
    if name not in {existing for existing, _ in _STEPS}:
        _STEPS.append((name, fn))


def email_hash(email: str) -> str:
    return hashlib.sha256((email or "").strip().lower().encode("utf-8")).hexdigest()


def _where(collection: str, field: str, value):
    return db.collection(collection).where(filter=firestore.FieldFilter(field, "==", value)).stream()


def _delete_tree(ref) -> None:
    """Delete a document and all of its subcollections."""
    recursive = getattr(db, "recursive_delete", None)
    if callable(recursive):
        recursive(ref)
        return
    collections = getattr(ref, "collections", None)
    for sub in (collections() if callable(collections) else []):
        for doc in sub.stream():
            _delete_tree(doc.reference)
    ref.delete()


def _cancel_stripe(user: dict, email: str = "") -> bool:
    customer_id = str(user.get("stripeCustomerId") or "").strip()
    if not os.getenv("STRIPE_SECRET_KEY"):
        if customer_id or user.get("subscriptionId"):
            raise AccountDeletionError("Billing is unavailable; subscription cancellation cannot be verified.")
        return False
    import stripe

    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    customers = {customer_id} if customer_id else set()
    if email:
        customers.update(c["id"] for c in stripe.Customer.list(email=email, limit=100).auto_paging_iter())
    if user.get("subscriptionId"):
        subscription = stripe.Subscription.retrieve(user["subscriptionId"])
        if subscription.get("customer"):
            customers.add(subscription["customer"])
    for cid in sorted(customers):
        try:
            stripe.Customer.delete(cid)
        except stripe.error.InvalidRequestError as exc:
            if getattr(exc, "code", None) != "resource_missing":
                raise
    return bool(customers)


def delete_user_data(email: str, *, by: str = "self") -> dict[str, int]:
    """Remove one account's data. Raises AccountDeletionError and stops early if Stripe fails."""
    email = (email or "").strip().lower()
    if not db or not email:
        raise AccountDeletionError("Account storage is unavailable right now.")
    user_ref = db.collection("users").document(email)
    snap = user_ref.get()
    user = (snap.to_dict() or {}) if snap.exists else {}
    summary: dict[str, int] = {}

    try:
        summary["stripe"] = int(_cancel_stripe(user, email))
    except Exception as exc:
        log.error("account deletion: Stripe cancel failed for %s", email_hash(email)[:12], exc_info=True)
        raise AccountDeletionError("We couldn't cancel the subscription, so nothing was deleted. Please try again.") from exc

    for name, step in _STEPS:
        try:
            summary[name] = int(step(email) or 0)
        except Exception:
            log.warning("account deletion step %s failed", name, exc_info=True)
            summary[name] = -1

    from faithsparks.views.worksheets import _delete_owned_worksheet_file

    count = 0
    for doc in _where("worksheets", "email", email):
        meta = doc.to_dict() or {}
        try:
            _delete_owned_worksheet_file(meta.get("filename") or "", meta)
        except Exception:
            log.warning("account deletion: file cleanup failed", exc_info=True)
        doc.reference.delete()
        count += 1
    summary["worksheets"] = count

    summary["lesson_packs"] = 0
    for doc in _where("lesson_packs", "email", email):
        doc.reference.delete()
        summary["lesson_packs"] += 1

    summary["same_brain_links"] = 0
    for collection in ("same_brain_challenges", "same_brain_together"):
        for doc in _where(collection, "ownerId", email_hash(email)):
            doc.reference.delete()
            summary["same_brain_links"] += 1

    summary["helper_requests"] = 0
    for doc in _where("weekflow_support_requests", "ownerEmail", email):
        doc.reference.delete()
        summary["helper_requests"] += 1

    try:
        from faithsparks.services.weekflow_calendar import _revoke_at_google

        summary["calendar_revoked"] = int(_revoke_at_google(email))
    except Exception:
        summary["calendar_revoked"] = 0

    db.collection("referrals").document(email).delete()
    for doc in _where("weekflow_feedback", "contactEmail", email):
        doc.reference.set({"contactEmail": None, "contactRequested": False}, merge=True)
    hashed = "deleted:" + email_hash(email)[:16]
    for doc in _where("gifts", "email", email):
        doc.reference.set({"email": hashed}, merge=True)
    for doc in _where("admin_log", "target", email):
        doc.reference.set({"target": hashed}, merge=True)

    _delete_tree(user_ref)
    summary["account"] = 1

    db.collection("admin_log").add({
        "action": "delete_account", "target": hashed, "by": by if by != email else "self",
        "details": summary, "at": firestore.SERVER_TIMESTAMP,
    })
    return summary
