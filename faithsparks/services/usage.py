from datetime import datetime, timezone
from .firestore import db


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m')


def _get_user_plan(email: str) -> str:
    if not db or not email:
        return 'free'
    try:
        u = db.collection('users').document(email).get()
        if u.exists:
            d = u.to_dict() or {}
            exp = d.get('giftExpiresAt')
            try:
                if exp and hasattr(exp, 'timestamp'):
                    if datetime.now(timezone.utc) > exp:
                        db.collection('users').document(email).set({ 'plan': 'free', 'isPro': False, 'giftExpiresAt': None }, merge=True)
                        d['plan'] = 'free'
                        d['isPro'] = False
            except Exception:
                pass
            plan = d.get('plan')
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
        u = db.collection('users').document(email).get()
        if u.exists:
            d = u.to_dict() or {}
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
    FREE_MONTHLY_QUOTA = int(os.getenv('FREE_MONTHLY_QUOTA', '1'))
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
        u = db.collection('users').document(email).get()
        existing = u.to_dict() if u.exists else {}
        usage = existing.get('usage') or {}
        lifetime = int(usage.get('lifetime') or 0) + add
        months = usage.get('months') or {}
        mk = _month_key()
        monthly = int(months.get(mk) or 0) + add
        db.collection('users').document(email).set({'usage': {'lifetime': lifetime, 'months': {mk: monthly}}}, merge=True)
    except Exception:
        pass


def _get_free_slugs() -> set[str]:
    if not db:
        return set()
    try:
        doc = db.collection('config').document('app').get()
        if doc.exists:
            data = doc.to_dict() or {}
            slugs = data.get('freeSlugs') or []
            return set([str(s).strip().lower() for s in slugs if str(s).strip()])
    except Exception:
        pass
    return set()

