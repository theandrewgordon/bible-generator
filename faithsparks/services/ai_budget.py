"""App-wide daily AI spend ceiling and kill switch.

Every paid AI call asks ``ai_budget_ok(feature, units)`` first. Units are a
rough cost weight (a small gpt-4o-mini call is 1). When the day's total would
pass ``AI_DAILY_BUDGET`` the call is refused, so a bug loop or an abuser with
many accounts can't run up the bill. ``AI_DISABLED=1`` turns all AI off.

The real backstop is still the monthly budget in the OpenAI/Anthropic
dashboards; this keeps the app from reaching it.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone

from firebase_admin import firestore

from faithsparks.services.firestore import db

log = logging.getLogger(__name__)

# Rough cost weights. 1 unit ~= one small gpt-4o-mini call.
UNITS = {
    "mini": 1,
    "transcribe": 3,
    "gpt4o": 10,
    "image": 40,
}
DEFAULT_DAILY_BUDGET = 3000
COLLECTION = "ai_budget"
BUSY_MESSAGE = "AI features are resting for today. Please try again tomorrow."

_memory: dict[str, int] = {}
_alerted: set[str] = set()
_lock = threading.Lock()


class AIBudgetExceeded(RuntimeError):
    pass


def ai_disabled() -> bool:
    return os.getenv("AI_DISABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def daily_budget() -> int:
    try:
        return max(0, int(os.getenv("AI_DAILY_BUDGET", DEFAULT_DAILY_BUDGET)))
    except ValueError:
        return DEFAULT_DAILY_BUDGET


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def ai_budget_ok(feature: str, units: int = 1) -> bool:
    """Reserve ``units`` for one AI call. False means don't make the call."""
    if ai_disabled():
        return False
    day = _today()
    budget = daily_budget()
    if not isinstance(units, int) or units <= 0:
        return False
    if db:
        try:
            ref = db.collection(COLLECTION).document(day)

            @firestore.transactional
            def reserve(txn):
                snap = ref.get(transaction=txn)
                used = int((snap.to_dict() or {}).get("units") or 0)
                if used + units > budget:
                    return False
                txn.set(ref, {
                    "units": firestore.Increment(units),
                    "calls": firestore.Increment(1),
                    "features": {feature: firestore.Increment(units)},
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                }, merge=True)
                return True

            return reserve(db.transaction())
        except Exception:
            log.exception("AI budget reservation failed; refusing paid call")
            return False
    with _lock:
        if _memory.get(day, 0) + units > budget:
            return False
        _memory[day] = _memory.get(day, 0) + units
        return True


def require_ai_budget(feature: str, units: int = 1) -> None:
    if not ai_budget_ok(feature, units):
        raise AIBudgetExceeded(BUSY_MESSAGE)
