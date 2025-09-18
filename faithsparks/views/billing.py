import os
import traceback
from datetime import datetime, timezone
from typing import Optional, Tuple

from firebase_admin import firestore
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify

from faithsparks.services.firestore import db
from faithsparks.services.stripe_svc import (
    stripe,
    STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_PRICE_FAMILY,
    STRIPE_PRICE_CLASSROOM,
    STRIPE_PRICE_FAMILY_MONTHLY,
    STRIPE_PRICE_FAMILY_ANNUAL,
    STRIPE_PRICE_CLASSROOM_MONTHLY,
    STRIPE_PRICE_CLASSROOM_ANNUAL,
    STRIPE_WEBHOOK_SECRET,
    resolve_price_id,
)


def _parse_codes(env_var: str) -> set[str]:
    raw = os.getenv(env_var) or ""
    return {c.strip().lower() for c in raw.split(",") if c.strip()}


PLUS_MONTH_TRIAL_CODES = _parse_codes("PLUS_MONTH_TRIAL_CODES")
PLUS_YEAR_TRIAL_CODES = _parse_codes("PLUS_YEAR_TRIAL_CODES") or set()
PLUS_YEAR_TRIAL_CODES.update(_parse_codes("PLUS_TRIAL_CODES"))


def _trial_kind(token: str) -> Optional[str]:
    if not token:
        return None
    t = token.strip().lower()
    if t in PLUS_MONTH_TRIAL_CODES:
        return "month"
    if t in PLUS_YEAR_TRIAL_CODES:
        return "year"
    return None


def _price_kind_map() -> dict[str, Tuple[str, str]]:
    mapping: dict[str, Tuple[str, str]] = {}

    def _add(pid: Optional[str], plan: str, interval: str) -> None:
        if pid:
            mapping[pid.strip().lower()] = (plan, interval)

    _add(STRIPE_PRICE_FAMILY_MONTHLY, "family", "month")
    _add(STRIPE_PRICE_FAMILY_ANNUAL, "family", "year")
    _add(STRIPE_PRICE_CLASSROOM_MONTHLY, "classroom", "month")
    _add(STRIPE_PRICE_CLASSROOM_ANNUAL, "classroom", "year")

    return mapping


PRICE_KIND_MAP = _price_kind_map()


def _classify_price(price_id: str) -> Optional[Tuple[str, str]]:
    if not price_id:
        return None
    return PRICE_KIND_MAP.get(price_id.strip().lower())


def _trial_days_for(token: str, price_id: str) -> Optional[Tuple[int, str]]:
    kind = _trial_kind(token)
    if not kind:
        return None
    price_info = _classify_price(price_id)
    if not price_info:
        return None
    plan, interval = price_info
    if kind == "month" and interval == "month":
        return 30, kind
    if kind == "year" and interval == "year" and plan == "family":
        return 365, kind
    return None

bp = Blueprint("billing", __name__)


def plus_pricing():
    prices = {
        "family": {
            "monthly": STRIPE_PRICE_FAMILY_MONTHLY,
            "annual": STRIPE_PRICE_FAMILY_ANNUAL,
            "single": STRIPE_PRICE_FAMILY,
        },
        "classroom": {
            "monthly": STRIPE_PRICE_CLASSROOM_MONTHLY,
            "annual": STRIPE_PRICE_CLASSROOM_ANNUAL,
            "single": STRIPE_PRICE_CLASSROOM,
        },
    }
    meta = {"family": {}, "classroom": {}}

    def _price_meta(pid: Optional[str]):
        if not pid or not stripe:
            return None
        try:
            p = stripe.Price.retrieve(pid)
            return {
                "amount": (p.get("unit_amount") or 0) / 100.0,
                "currency": (p.get("currency") or "usd").upper(),
                "recurring": (p.get("recurring") or {}).get("interval"),
            }
        except Exception:
            return None

    try:
        fam_m = _price_meta(prices["family"].get("monthly"))
        fam_y = _price_meta(prices["family"].get("annual"))
        if fam_m:
            meta["family"]["monthly"] = fam_m
        if fam_y:
            meta["family"]["annual"] = fam_y
        if fam_m and fam_y and fam_m.get("amount"):
            m12 = fam_m["amount"] * 12.0
            save = max(0.0, 1.0 - (fam_y["amount"] / m12))
            meta["family"]["save_pct"] = round(save * 100)
        cls_m = _price_meta(prices["classroom"].get("monthly"))
        cls_y = _price_meta(prices["classroom"].get("annual"))
        if cls_m:
            meta["classroom"]["monthly"] = cls_m
        if cls_y:
            meta["classroom"]["annual"] = cls_y
        if cls_m and cls_y and cls_m.get("amount"):
            m12 = cls_m["amount"] * 12.0
            save = max(0.0, 1.0 - (cls_y["amount"] / m12))
            meta["classroom"]["save_pct"] = round(save * 100)
    except Exception:
        pass
    trial_code = (request.args.get("trial") or "").strip()
    trial_kind = _trial_kind(trial_code)
    trial_unlocked = bool(trial_kind)
    trial_error = bool(trial_code) and not trial_unlocked
    return render_template(
        "plus.html",
        prices=prices,
        meta=meta,
        promo_hint="SAVE25",
        trial_unlocked=trial_unlocked,
        trial_code=trial_code,
        trial_error=trial_error,
        trial_kind=trial_kind,
    )


def create_checkout_session():
    if not STRIPE_SECRET_KEY or not stripe:
        return "Stripe not configured", 500
    id_or_price = (request.form.get("price_id") or "").strip()
    trial_token = (request.form.get("trial_token") or "").strip()
    if not id_or_price:
        return "Missing price", 400
    price_id = resolve_price_id(id_or_price)
    user_email = session.get("user_email")
    trial_info = _trial_days_for(trial_token, price_id)
    trial_days = trial_kind = None
    if trial_info:
        trial_days, trial_kind = trial_info

    subscription_data = {"metadata": {"plan_price_id": price_id}}
    if trial_days is not None:
        subscription_data["trial_period_days"] = trial_days
        subscription_data["metadata"]["trial_days"] = str(trial_days)
        if trial_kind:
            subscription_data["metadata"]["trial_kind"] = trial_kind
        if trial_token:
            subscription_data["metadata"]["trial_code"] = trial_token
            subscription_data["metadata"]["source"] = f"invite:{trial_token.lower()}"
    session_metadata = {"email": user_email, "plan_price_id": price_id}
    if trial_days is not None:
        session_metadata["trial_days"] = str(trial_days)
        if trial_kind:
            session_metadata["trial_kind"] = trial_kind
        if trial_token:
            session_metadata["trial_code"] = trial_token
            session_metadata["source"] = f"invite:{trial_token.lower()}"
    try:
        chk = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=user_email,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=url_for("plus_success", _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=url_for("plus_pricing", _external=True),
            allow_promotion_codes=True,
            metadata=session_metadata,
            subscription_data=subscription_data,
        )
        return redirect(chk.url, code=303)
    except Exception as e:
        traceback.print_exc()
        return f"Stripe error: {e}", 500


def plus_success():
    return render_template("success.html")


def billing_portal():
    if not STRIPE_SECRET_KEY or not stripe:
        return "Stripe not configured", 500
    email = session.get("user_email")
    if not db or not email:
        return redirect(url_for("public.index"))
    try:
        u = db.collection("users").document(email).get()
        if not u.exists:
            flash("No subscription found for your account.", "warning")
            return redirect(url_for("plus_pricing"))
        cid = (u.to_dict() or {}).get("stripeCustomerId")
        if not cid:
            flash("No subscription found for your account.", "warning")
            return redirect(url_for("plus_pricing"))
        ps = stripe.billing_portal.Session.create(customer=cid, return_url=url_for("public.index", _external=True))
        return redirect(ps.url)
    except Exception as e:
        traceback.print_exc()
        flash(f"Billing portal error: {e}", "error")
        return redirect(url_for("plus_pricing"))


def stripe_webhook():
    if not STRIPE_WEBHOOK_SECRET or not stripe:
        return ("", 200)
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return (f"Webhook error: {e}", 400)

    et = event.get("type")
    obj = event.get("data", {}).get("object", {})
    try:
        if et == "checkout.session.completed":
            email = (obj.get("customer_details") or {}).get("email") or obj.get("customer_email") or (obj.get("metadata") or {}).get("email")
            subscription_id = obj.get("subscription")
            customer_id = obj.get("customer")
            price_id = (obj.get("metadata") or {}).get("plan_price_id")
            pack_slug = (obj.get("metadata") or {}).get("pack_slug")
            try:
                if subscription_id and STRIPE_SECRET_KEY:
                    sub = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
                    if sub and sub.get("items") and sub["items"]["data"]:
                        price_id = sub["items"]["data"][0]["price"]["id"]
            except Exception:
                pass
            renew_at = None
            period_end = sub.get("current_period_end") if sub else None
            if period_end:
                try:
                    renew_at = datetime.fromtimestamp(int(period_end), tz=timezone.utc)
                except Exception:
                    renew_at = None
            if db and email:
                if subscription_id:
                    plan = (
                        "family"
                        if price_id == STRIPE_PRICE_FAMILY
                        else "classroom"
                        if price_id == STRIPE_PRICE_CLASSROOM
                        else "plus"
                    )
                    update_data = {
                        "isPro": True,
                        "plan": plan,
                        "stripeCustomerId": customer_id,
                        "subscriptionId": subscription_id,
                        "priceId": price_id,
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }
                    if renew_at:
                        update_data["renewAt"] = renew_at
                    db.collection("users").document(email).set(update_data, merge=True)
                elif pack_slug:
                    db.collection("users").document(email).set(
                        {"purchases": {pack_slug: True}, "updatedAt": firestore.SERVER_TIMESTAMP},
                        merge=True,
                    )
        elif et == "customer.subscription.updated":
            sub = obj
            customer_id = sub.get("customer")
            renew_at = None
            period_end = sub.get("current_period_end")
            if period_end:
                try:
                    renew_at = datetime.fromtimestamp(int(period_end), tz=timezone.utc)
                except Exception:
                    renew_at = None
            price_id = None
            try:
                items = (sub.get("items") or {}).get("data") or []
                if items:
                    price_id = (items[0].get("price") or {}).get("id")
            except Exception:
                price_id = None
            if db and customer_id:
                try:
                    q = db.collection("users").where(filter=firestore.FieldFilter("stripeCustomerId", "==", customer_id)).limit(1).stream()
                    udoc = next(q, None)
                    if udoc:
                        update_data = {"updatedAt": firestore.SERVER_TIMESTAMP}
                        if renew_at:
                            update_data["renewAt"] = renew_at
                        if price_id:
                            update_data["priceId"] = price_id
                        if update_data:
                            udoc.reference.set(update_data, merge=True)
                except Exception:
                    pass
        elif et == "customer.subscription.deleted":
            sub = obj
            customer_id = sub.get("customer")
            if db and customer_id:
                try:
                    q = db.collection("users").where(filter=firestore.FieldFilter("stripeCustomerId", "==", customer_id)).limit(1).stream()
                    udoc = next(q, None)
                    if udoc:
                        udoc.reference.set(
                            {
                                "plan": "free",
                                "isPro": False,
                                "subscriptionId": None,
                                "priceId": firestore.DELETE_FIELD,
                                "renewAt": firestore.DELETE_FIELD,
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                            },
                            merge=True,
                        )
                except Exception:
                    pass
    except Exception:
        traceback.print_exc()
    return ("", 200)


def buy_pack(slug):
    if not stripe or not STRIPE_SECRET_KEY:
        return "Stripe not configured", 500
    if not db:
        return "Firestore not configured", 500
    d = db.collection("collections").document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict() or {}
    email = session.get("user_email")
    try:
        pur = db.collection("purchases").document(email).get().to_dict() if email and db else {}
        if pur and (pur.get("packs") or {}).get(slug):
            flash("You already own this pack. Download away! 🎉", "success")
            return redirect(url_for("browse_detail", slug=slug))
    except Exception:
        pass
    price_id = (meta.get("priceId") or os.getenv("STRIPE_DEFAULT_PACK_PRICE", "")).strip()
    if not price_id:
        flash("This pack is not available for one-time purchase.", "warning")
        return redirect(url_for("browse_detail", slug=slug))
    try:
        chk = stripe.checkout.Session.create(
            mode="payment",
            customer_email=email,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=url_for("buy_success", slug=slug, _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=url_for("browse_detail", slug=slug, _external=True),
            metadata={"email": email, "pack_slug": slug},
        )
        return redirect(chk.url, code=303)
    except Exception as e:
        traceback.print_exc()
        return f"Stripe error: {e}", 500


def buy_success(slug):
    flash("Purchase successful. You can now download this pack.", "success")
    return redirect(url_for("browse_detail", slug=slug))
