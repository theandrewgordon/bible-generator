from datetime import datetime, timezone
from .firestore import db
from .users import get_user_doc, gift_end_update, invalidate_user_doc


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m')


def _classroom_price_ids() -> set[str]:
    from .stripe_svc import STRIPE_PRICE_CLASSROOM, STRIPE_PRICE_CLASSROOM_ANNUAL, STRIPE_PRICE_CLASSROOM_MONTHLY
    return {p for p in (STRIPE_PRICE_CLASSROOM, STRIPE_PRICE_CLASSROOM_MONTHLY, STRIPE_PRICE_CLASSROOM_ANNUAL) if p}


def _get_user_plan(email: str) -> str:
    if not db or not email:
        return 'free'
    try:
        d = get_user_doc(email)  # request-scoped cached read
        if d:
            exp = d.get('giftExpiresAt')
            try:
                if exp and hasattr(exp, 'timestamp'):
                    if datetime.now(timezone.utc) > exp:
                        update = gift_end_update(d)
                        db.collection('users').document(email).set(update, merge=True)
                        # Mutate the cached doc in place so it stays consistent.
                        d.update(update)
            except Exception:
                pass
            plan = d.get('plan')
            if plan == 'plus' and d.get('isPro') and d.get('priceId') in _classroom_price_ids():
                # Subscribed before 2026-10-14, when every plan was stored as "plus".
                return 'classroom'
            if plan:
                return plan
            if d.get('isPro'):
                return 'family'
    except Exception:
        pass
    return 'free'


def _get_usage(email: str) -> tuple[int, int]:
    if not db or not email:
        return (0, 0)
    try:
        d = get_user_doc(email)  # request-scoped cached read
        if d:
            usage = d.get('usage') or {}
            lifetime = int(usage.get('lifetime') or 0)
            months = usage.get('months') or {}
            mk = _month_key()
            monthly = int(months.get(mk) or 0)
            return (lifetime, monthly)
    except Exception:
        pass
    return (0, 0)


def _quota_for_plan(plan: str) -> tuple[int | None, int | None]:
    import os
    FREE_LIFETIME_QUOTA = int(os.getenv('FREE_LIFETIME_QUOTA', '10'))
    FREE_MONTHLY_QUOTA = int(os.getenv('FREE_MONTHLY_QUOTA', '3'))
    FAMILY_MONTHLY_QUOTA = int(os.getenv('FAMILY_MONTHLY_QUOTA', '15'))
    CLASSROOM_MONTHLY_QUOTA = int(os.getenv('CLASSROOM_MONTHLY_QUOTA', '100'))

    plan = (plan or 'free').lower()
    if plan in ('classroom', 'school', 'plus_classroom'):
        return (CLASSROOM_MONTHLY_QUOTA, None)
    if plan in ('family', 'plus', 'plus_family'):
        return (FAMILY_MONTHLY_QUOTA, None)
    return (FREE_MONTHLY_QUOTA, FREE_LIFETIME_QUOTA)


def _update_usage(email: str, add: int) -> None:
    if not db or not email or add <= 0:
        return
    try:
        # Atomic server-side increments: parallel generations can't lose counts.
        from firebase_admin import firestore as _fs
        mk = _month_key()
        db.collection('users').document(email).set(
            {'usage': {'lifetime': _fs.Increment(add), 'months': {mk: _fs.Increment(add)}}}, merge=True
        )
        # Drop the cached doc so any later read in this request sees the new usage.
        invalidate_user_doc(email)
    except Exception:
        pass


_free_slugs_cache: tuple[float, set[str]] | None = None
_FREE_SLUGS_TTL = 60.0  # seconds


def _get_free_slugs() -> set[str]:
    if not db:
        return set()
    global _free_slugs_cache
    import time
    now = time.monotonic()
    if _free_slugs_cache is not None and (now - _free_slugs_cache[0]) < _FREE_SLUGS_TTL:
        return _free_slugs_cache[1]
    try:
        doc = db.collection('config').document('app').get()
        if doc.exists:
            data = doc.to_dict() or {}
            slugs = data.get('freeSlugs') or []
            result = set([str(s).strip().lower() for s in slugs if str(s).strip()])
            _free_slugs_cache = (now, result)
            return result
    except Exception:
        pass
    return set()



def _reserve_usage(email: str, requested: int, plan: str) -> tuple[int, str]:
    """Atomically charge up to the remaining allowance before generation starts."""
    if not db or not email:
        raise RuntimeError("Account storage unavailable")
    from firebase_admin import firestore
    month = _month_key()
    ref = db.collection("users").document(email)
    monthly_limit, lifetime_limit = _quota_for_plan(plan)

    @firestore.transactional
    def reserve(txn):
        data = ref.get(transaction=txn).to_dict() or {}
        usage = data.get("usage") or {}
        lifetime = int(usage.get("lifetime") or 0)
        monthly = int((usage.get("months") or {}).get(month) or 0)
        allowed = requested
        for limit, used in ((monthly_limit, monthly), (lifetime_limit, lifetime)):
            if limit is not None:
                allowed = min(allowed, max(0, limit - used))
        if allowed:
            txn.set(ref, {"usage": {
                "lifetime": firestore.Increment(allowed),
                "months": {month: firestore.Increment(allowed)},
            }}, merge=True)
        return allowed

    allowed = reserve(db.transaction())
    invalidate_user_doc(email)
    return allowed, month


def _refund_usage(email: str, unused: int, month: str) -> None:
    """Return unsuccessful reservations to the original billing month."""
    if unused > 0:
        from firebase_admin import firestore
        db.collection("users").document(email).set({"usage": {
            "lifetime": firestore.Increment(-unused),
            "months": {month: firestore.Increment(-unused)},
        }}, merge=True)
        invalidate_user_doc(email)
