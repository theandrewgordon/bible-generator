from __future__ import annotations

import re
import time
from dataclasses import dataclass

from firebase_admin import firestore
from flask import current_app, g

from faithsparks.services.firestore import db


_MEMORY_BUCKETS: dict[str, tuple[int, float]] = {}


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


def _safe_token(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.:-]+", "-", str(value or "unknown"))[:180] or "unknown"


def check_rate_limit(scope: str, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
    """Fixed-window limiter. Firestore in production, process memory in local dev."""
    now = int(time.time())
    window_start = now - (now % int(window_seconds))
    retry_after = max(1, window_start + int(window_seconds) - now)
    doc_id = f"{_safe_token(scope)}:{_safe_token(key)}:{window_start}"

    if db:
        try:
            ref = db.collection("rate_limits").document(doc_id)
            snap = ref.get()
            count = int((snap.to_dict() or {}).get("count") or 0) if snap.exists else 0
            if count >= limit:
                return RateLimitResult(False, limit, 0, retry_after)
            ref.set(
                {
                    "scope": scope,
                    "key": key,
                    "windowStart": window_start,
                    "windowSeconds": int(window_seconds),
                    "count": firestore.Increment(1),
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            return RateLimitResult(True, limit, max(0, limit - count - 1), retry_after)
        except Exception as exc:
            try:
                current_app.logger.warning("[%s] Firestore rate limit fallback: %s", getattr(g, "req_id", ""), exc)
            except Exception:
                pass

    bucket_key = doc_id
    count, expires_at = _MEMORY_BUCKETS.get(bucket_key, (0, window_start + window_seconds))
    if time.time() >= expires_at:
        count = 0
        expires_at = window_start + window_seconds
    if count >= limit:
        return RateLimitResult(False, limit, 0, max(1, int(expires_at - time.time())))
    count += 1
    _MEMORY_BUCKETS[bucket_key] = (count, expires_at)
    return RateLimitResult(True, limit, max(0, limit - count), max(1, int(expires_at - time.time())))


def reset_memory_limits() -> None:
    _MEMORY_BUCKETS.clear()
