import os

try:
    import stripe  # type: ignore
except Exception:
    stripe = None  # type: ignore


STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_PRICE_FAMILY = os.getenv('STRIPE_PRICE_FAMILY')
STRIPE_PRICE_CLASSROOM = os.getenv('STRIPE_PRICE_CLASSROOM')
STRIPE_PRICE_FAMILY_MONTHLY = os.getenv('STRIPE_PRICE_FAMILY_MONTHLY')
STRIPE_PRICE_FAMILY_ANNUAL = os.getenv('STRIPE_PRICE_FAMILY_ANNUAL')
STRIPE_PRICE_CLASSROOM_MONTHLY = os.getenv('STRIPE_PRICE_CLASSROOM_MONTHLY')
STRIPE_PRICE_CLASSROOM_ANNUAL = os.getenv('STRIPE_PRICE_CLASSROOM_ANNUAL')
STRIPE_PRICE_FAMILY_GAME_NIGHT = os.getenv('STRIPE_PRICE_FAMILY_GAME_NIGHT')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

if STRIPE_SECRET_KEY and stripe:
    try:
        stripe.api_key = STRIPE_SECRET_KEY
    except Exception:
        pass


def resolve_price_id(id_or_product: str) -> str:
    if not stripe:
        raise RuntimeError('Stripe SDK not available')
    pid = (id_or_product or '').strip()
    if not pid:
        raise ValueError('Missing price id')
    if pid.startswith('price_'):
        return pid
    if pid.startswith('prod_'):
        try:
            prod = stripe.Product.retrieve(pid, expand=['default_price'])
            dp = prod.get('default_price')
            if isinstance(dp, dict) and dp.get('id'):
                return dp['id']
            prices = stripe.Price.list(product=pid, active=True, limit=10)
            if prices and prices.data:
                recurring = [p for p in prices.data if p.get('recurring')]
                target = (recurring[0] if recurring else prices.data[0])
                return target.id
        except Exception:
            pass
        return pid
    return pid
