"""Request-scoped cache for the per-user Firestore document.

Several places in a single request need the same `users/{email}` document
(navbar `is_pro`, the usage chip, the browse/detail views, ...). Without a
cache that is one Firestore read per call site. This caches the doc on Flask's
request-scoped `g` so the document is fetched at most once per request.

Write paths (usage updates, plan changes) live in `usage.py`/billing and do
their own fresh reads, so they are unaffected by this read cache.
"""
from flask import g, has_request_context

from .firestore import db


def get_user_doc(email: str | None, *, force: bool = False) -> dict:
    """Return the `users/{email}` document as a dict (empty if missing).

    Cached for the duration of the request unless ``force`` is set.
    """
    if not db or not email:
        return {}
    cache = None
    if has_request_context():
        cache = getattr(g, "_user_doc_cache", None)
        if cache is None:
            cache = g._user_doc_cache = {}
        if not force and email in cache:
            return cache[email]
    try:
        snap = db.collection("users").document(email).get()
        data = (snap.to_dict() or {}) if snap.exists else {}
    except Exception:
        data = {}
    if cache is not None:
        cache[email] = data
    return data


def invalidate_user_doc(email: str | None = None) -> None:
    """Drop the cached user doc (default: all) for the current request."""
    if not has_request_context():
        return
    cache = getattr(g, "_user_doc_cache", None)
    if cache is None:
        return
    if email is None:
        g._user_doc_cache = {}
    else:
        cache.pop(email, None)
