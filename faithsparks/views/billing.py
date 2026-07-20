import os
import traceback
from datetime import datetime, timezone
from typing import Optional, Tuple

from firebase_admin import firestore
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app, g

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

def _find_promotion_code_id(code_str: Optional[str]) -> Optional[str]:
    if not code_str or not stripe:
        return None
    try:
        res = stripe.PromotionCode.list(code=code_str.strip(), active=True, limit=1)
        return res.data[0].id if res.data else None
    except Exception:
        traceback.print_exc()
        return None

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
    _add(STRIPE_PRICE_FAMILY, "family", "legacy")
    _add(STRIPE_PRICE_CLASSROOM, "classroom", "legacy")

    return mapping


PRICE_KIND_MAP = _price_kind_map()


def _classify_price(price_id: str) -> Optional[Tuple[str, str]]:
    if not price_id:
        return None
    return PRICE_KIND_MAP.get(price_id.strip().lower())


def _plan_display_label(plan: Optional[str], interval: Optional[str]) -> str:
    base_map = {
        "family": "Faith Sparks Plus Family",
        "classroom": "Faith Sparks Plus Classroom",
    }
    interval_map = {"month": "Monthly", "year": "Annual"}
    base = base_map.get(plan or "", "Faith Sparks Plus")
    if interval:
        pretty_interval = interval_map.get(interval, interval.title())
        return f"{base} ({pretty_interval})"
    return base


def _trial_days_for(token: str, price_id: str) -> Optional[Tuple[int, str]]:
    kind = _trial_kind(token)
    if not kind:
        return None
    price_info = _classify_price(price_id)
    if not price_info:
        return None
    plan, interval = price_info
    if kind == "month":
        return 30, kind
    if kind == "year" and interval == "year" and plan == "family":
        return 365, kind
    return None

bp = Blueprint("billing", __name__)


REFERRAL_INVITE_CODE = "freesparkmonth"
REFERRAL_TARGET_COUNT = 3


def _increment_metric(metric: str, key: Optional[str] = None) -> None:
    if not db or not metric:
        return
    key_val = (key or "unknown").strip().lower() or "unknown"
    try:
        bucket = db.collection("analytics").document(metric)
        bucket.set({"total": firestore.Increment(1), "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        bucket.collection("by_key").document(key_val).set(
            {
                "key": key_val,
                "count": firestore.Increment(1),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        traceback.print_exc()


def _record_referral_completion(referrer_email: Optional[str], redeemer_email: Optional[str]) -> None:
    """Track successful redemptions and grant rewards when thresholds are hit."""
    if not db or not referrer_email or not redeemer_email:
        return
    referrer_email = referrer_email.strip().lower()
    redeemer_email = redeemer_email.strip().lower()
    if not referrer_email or not redeemer_email or referrer_email == redeemer_email:
        return

    referral_doc = db.collection("referrals").document(referrer_email)
    transaction = db.transaction()

    @firestore.transactional
    def _txn(txn):
        snapshot = referral_doc.get(transaction=txn)
        data = snapshot.to_dict() or {}
        redeemers: list[str] = list(data.get("redeemers") or [])
        if redeemer_email in redeemers:
            return len(redeemers), bool(data.get("rewardGranted"))
        redeemers.append(redeemer_email)
        update_payload = {
            "referrer": referrer_email,
            "redeemers": redeemers,
            "count": len(redeemers),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        txn.set(referral_doc, update_payload, merge=True)
        return len(redeemers), bool(data.get("rewardGranted"))

    try:
        count, reward_granted = _txn(transaction)
    except Exception:
        traceback.print_exc()
        return

    if count >= REFERRAL_TARGET_COUNT and not reward_granted:
        if _grant_referral_reward(referrer_email):
            try:
                referral_doc.set(
                    {
                        "rewardGranted": True,
                        "rewardGrantedAt": firestore.SERVER_TIMESTAMP,
                        "count": count,
                    },
                    merge=True,
                )
            except Exception:
                traceback.print_exc()


def _grant_referral_reward(referrer_email: str) -> bool:
    """Apply a one-time 100% coupon to the referrer's next invoice."""
    if not stripe or not STRIPE_SECRET_KEY or not db:
        return False
    try:
        user_doc = db.collection("users").document(referrer_email).get()
    except Exception:
        traceback.print_exc()
        return False
    if not user_doc or not user_doc.exists:
        return False
    info = user_doc.to_dict() or {}
    subscription_id = (info.get("subscriptionId") or "").strip()
    customer_id = (info.get("stripeCustomerId") or "").strip()
    if not subscription_id and not customer_id:
        return False

    coupon_id = (os.getenv("STRIPE_REFERRAL_COUPON_ID") or "").strip()
    coupon_created = False
    try:
        if not coupon_id:
            coupon = stripe.Coupon.create(
                duration="once",
                percent_off=100,
                name="Referral Bonus FreeSparkMonth",
            )
            coupon_id = coupon.get("id") or ""
            coupon_created = True
    except Exception:
        traceback.print_exc()
        return False

    if not coupon_id:
        return False

    try:
        if subscription_id:
            stripe.Subscription.modify(subscription_id, coupon=coupon_id)
        elif customer_id:
            stripe.Customer.modify(customer_id, coupon=coupon_id)
    except Exception:
        traceback.print_exc()
        if coupon_created:
            try:
                stripe.Coupon.delete(coupon_id)
            except Exception:
                pass
        return False
    return True


def plus_pricing():
    # Capture share link parameters and persist for checkout + analytics.
    incoming_params = {}
    param_map = {
        "invite": "invite",
        "promo": "promo",
        "plan": "plan",
        "interval": "interval",
        "utm": "utm",
        "ref": "referrer",
    }
    for key, session_key in param_map.items():
        raw_val = request.args.get(key)
        cleaned = (raw_val or "").strip()
        if cleaned:
            if session_key == "referrer":
                session[session_key] = cleaned.lower()
            else:
                session[session_key] = cleaned
            incoming_params[key] = cleaned

    if incoming_params.get("utm"):
        utm_val = incoming_params["utm"].strip().lower()
        if utm_val:
            _increment_metric("plus_clicks", utm_val)

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
    trial_code = (request.args.get("trial") or incoming_params.get("invite") or session.get("invite") or "").strip()
    trial_kind = _trial_kind(trial_code)
    trial_unlocked = bool(trial_kind)
    trial_error = bool(trial_code) and not trial_unlocked
    return render_template(
        "plus.html",
        prices=prices,
        meta=meta,
        promo_hint="SAVE25FOREVER",
        trial_unlocked=trial_unlocked,
        trial_code=trial_code,
        trial_error=trial_error,
        trial_kind=trial_kind,
        invite_code=session.get("invite"),
        promo_code=session.get("promo"),
        selected_plan=session.get("plan"),
        selected_interval=session.get("interval"),
        utm_tag=session.get("utm"),
        referrer=session.get("referrer"),
    )


def create_checkout_session():
    if not STRIPE_SECRET_KEY or not stripe:
        return "Stripe not configured", 500
    id_or_price = (request.form.get("price_id") or "").strip()
    trial_token = (request.form.get("trial_token") or "").strip()
    if not id_or_price:
        return "Missing price", 400
    price_id = resolve_price_id(id_or_price)
    price_kind = _classify_price(price_id)
    if not price_kind:
        current_app.logger.warning("Rejected checkout for unconfigured Stripe price %r", price_id)
        return "Invalid price", 400
    user_email = session.get("user_email")
    trial_info = _trial_days_for(trial_token, price_id)
    trial_days = trial_kind = None
    if trial_info:
        trial_days, trial_kind = trial_info
        required_kind = trial_kind
        price_kind = _classify_price(price_id)
        if required_kind != "month":
            if not price_kind or price_kind[1] != required_kind:
                flash(f"Your invite applies to the {required_kind} plan. Please select the matching plan.", "warning")
                return redirect(url_for("plus_pricing"))

    subscription_data = {"metadata": {"plan_price_id": price_id}}
    share_attrs = {
        "invite_code": session.get("invite"),
        "promo_code": session.get("promo"),
        "preferred_plan": session.get("plan"),
        "preferred_interval": session.get("interval"),
        "utm": session.get("utm"),
        "referrer": session.get("referrer"),
    }
    for meta_key, meta_val in share_attrs.items():
        if meta_val:
            subscription_data["metadata"][meta_key] = str(meta_val)
    if trial_days is not None:
        subscription_data["trial_period_days"] = trial_days
        subscription_data["metadata"]["trial_days"] = str(trial_days)
        if trial_kind:
            subscription_data["metadata"]["trial_kind"] = trial_kind
        if trial_token:
            subscription_data["metadata"]["trial_code"] = trial_token
            subscription_data["metadata"]["source"] = f"invite:{trial_token.lower()}"

    session_metadata = {"email": user_email, "plan_price_id": price_id}
    for meta_key, meta_val in share_attrs.items():
        if meta_val:
            session_metadata[meta_key] = str(meta_val)
    if trial_days is not None:
        session_metadata["trial_days"] = str(trial_days)
        if trial_kind:
            session_metadata["trial_kind"] = trial_kind
        if trial_token:
            session_metadata["trial_code"] = trial_token
            session_metadata["source"] = f"invite:{trial_token.lower()}"

    promo_str = (session.get("promo") or request.form.get("promo") or "").strip()
    promo_id = _find_promotion_code_id(promo_str) if promo_str else None

    create_kwargs = {
        "mode": "subscription",
        "customer_email": user_email,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": url_for("plus_success", _external=True) + "?session_id={CHECKOUT_SESSION_ID}",
        "cancel_url": url_for("plus_pricing", _external=True),
        "metadata": session_metadata,
        "subscription_data": subscription_data,
    }
    if promo_id:
        create_kwargs["discounts"] = [{"promotion_code": promo_id}]
    else:
        create_kwargs["allow_promotion_codes"] = True

    try:
        chk = stripe.checkout.Session.create(**create_kwargs)
        return redirect(chk.url, code=303)
    except Exception as e:
        current_app.logger.exception("[%s] Stripe checkout session failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't start checkout yet. Please try again.", "error")
        return redirect(url_for("plus_pricing"))


def plus_success():
    plan_context = {
        "title": "Faith Sparks Plus",
        "amount": None,
        "currency": "USD",
        "interval": None,
        "trial": False,
        "trial_days": None,
        "plan_key": None,
    }
    session_id = (request.args.get("session_id") or "").strip()
    if session_id and stripe and STRIPE_SECRET_KEY:
        try:
            checkout = stripe.checkout.Session.retrieve(
                session_id,
                expand=["line_items.data.price.product"],
            )
            metadata = checkout.get("metadata") or {}
            line_items = (checkout.get("line_items") or {}).get("data") or []
            line = line_items[0] if line_items else None
            price_obj = (line.get("price") or {}) if line else {}
            price_id = price_obj.get("id") or metadata.get("plan_price_id")
            amount_total = line.get("amount_total") if line and line.get("amount_total") is not None else checkout.get("amount_total")
            currency = (
                (line.get("currency") if line else checkout.get("currency")) or "USD"
            ).upper()
            unit_amount = price_obj.get("unit_amount")
            quantity = line.get("quantity") if line and line.get("quantity") else 1
            plan_key = interval_key = None
            if price_id:
                classified = _classify_price(price_id)
                if classified:
                    plan_key, interval_key = classified
            product = price_obj.get("product")
            nickname = price_obj.get("nickname")
            plan_title = None
            if isinstance(product, dict):
                plan_title = product.get("name")
            if not plan_title and nickname:
                plan_title = nickname
            plan_title = plan_title or _plan_display_label(plan_key, interval_key)

            value_amount = round(((amount_total or 0) / 100.0), 2)
            trial_days_raw = metadata.get("trial_days")
            try:
                trial_days = int(trial_days_raw)
            except (TypeError, ValueError):
                trial_days = None

            plan_context.update(
                {
                    "title": plan_title,
                    "amount": value_amount,
                    "currency": currency,
                    "interval": interval_key,
                    "trial": value_amount == 0.0,
                    "trial_days": trial_days,
                    "plan_key": plan_key,
                }
            )

            params = {
                "value": value_amount,
                "currency": currency,
                "content_name": plan_title,
                "num_items": quantity,
            }
            if plan_key:
                params["subscription_plan"] = plan_key
            if interval_key:
                params["subscription_interval"] = interval_key
            if trial_days is not None:
                params["trial_days"] = trial_days
            contents = []
            if price_id:
                params["content_ids"] = [price_id]
                params["content_type"] = "product"
                item = {"id": price_id, "quantity": quantity}
                if unit_amount is not None:
                    item["item_price"] = round(unit_amount / 100.0, 2)
                contents.append(item)
            if contents:
                params["contents"] = contents
            events = ["Purchase", "Subscribe"]
            if plan_context["trial"]:
                events.append("StartTrial")
            session["fb_purchase"] = {
                "params": params,
                "events": events,
                "eventID": session_id,
            }
        except Exception:
            traceback.print_exc()
    return render_template("plus_success.html", plan=plan_context)


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
        current_app.logger.exception("[%s] billing portal error: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't open the billing portal yet. Please try again in a moment.", "error")
        return redirect(url_for("plus_pricing"))


def stripe_webhook():
    if not STRIPE_WEBHOOK_SECRET or not stripe:
        current_app.logger.error("Stripe webhook received while webhook processing is not configured")
        return ("Stripe webhook is not configured", 503)
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return (f"Webhook error: {e}", 400)
    if not db:
        current_app.logger.error("Stripe webhook cannot run because Firestore is unavailable")
        return ("Billing persistence is unavailable", 503)

    et = event.get("type")
    obj = event.get("data", {}).get("object", {})
    try:
        event_id = str(event.get("id") or "").strip()
        event_ref = db.collection("stripe_webhook_events").document(event_id) if db and event_id else None
        if event_ref and event_ref.get().exists:
            return ("", 200)
        if et == "checkout.session.completed":
            checkout_meta = obj.get("metadata") or {}
            email = (obj.get("customer_details") or {}).get("email") or obj.get("customer_email") or checkout_meta.get("email")
            subscription_id = obj.get("subscription")
            customer_id = obj.get("customer")
            price_id = checkout_meta.get("plan_price_id")
            pack_slug = checkout_meta.get("pack_slug")
            sub = None
            try:
                if subscription_id and STRIPE_SECRET_KEY:
                    sub = stripe.Subscription.retrieve(
                        subscription_id,
                        expand=["items.data.price", "discount.promotion_code"],
                    )
                    if sub and sub.get("items") and sub["items"]["data"]:
                        price_id = sub["items"]["data"][0]["price"]["id"]
            except Exception:
                sub = None
            subscription_meta = (sub.get("metadata") or {}) if sub else {}

            def _pick(*vals):
                for val in vals:
                    if isinstance(val, str):
                        stripped = val.strip()
                        if stripped:
                            return stripped
                return None

            share_details = {
                "invite_code": _pick(subscription_meta.get("invite_code"), checkout_meta.get("invite_code")),
                "promo_code": _pick(subscription_meta.get("promo_code"), checkout_meta.get("promo_code")),
                "preferred_plan": _pick(subscription_meta.get("preferred_plan"), checkout_meta.get("preferred_plan")),
                "preferred_interval": _pick(subscription_meta.get("preferred_interval"), checkout_meta.get("preferred_interval")),
                "utm": _pick(subscription_meta.get("utm"), checkout_meta.get("utm")),
                "source": _pick(subscription_meta.get("source"), checkout_meta.get("source")),
                "referrer": _pick(subscription_meta.get("referrer"), checkout_meta.get("referrer")),
            }

            renew_at = None
            period_end = sub.get("current_period_end") if sub else None
            if period_end:
                try:
                    renew_at = datetime.fromtimestamp(int(period_end), tz=timezone.utc)
                except Exception:
                    renew_at = None
            if db and email:
                if subscription_id:
                    price_kind = _classify_price(price_id)
                    if not price_kind:
                        raise ValueError(f"Refusing entitlement for unconfigured Stripe price {price_id!r}")
                    plan = price_kind[0]
                    update_data = {
                        "isPro": True,
                        "plan": plan,
                        "stripeCustomerId": customer_id,
                        "subscriptionId": subscription_id,
                        "priceId": price_id,
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                        "trialStartedAt": firestore.SERVER_TIMESTAMP,
                    }
                    disc = (sub or {}).get("discount") or {}
                    promo_code_obj = disc.get("promotion_code") or {}
                    coupon_obj = disc.get("coupon") or {}
                    if coupon_obj.get("id"):
                        update_data["couponId"] = coupon_obj["id"]
                    if promo_code_obj.get("id"):
                        update_data["promotionCodeId"] = promo_code_obj["id"]
                        update_data["hasLifetimeDiscount"] = True
                    if renew_at:
                        update_data["renewAt"] = renew_at
                    field_map = {
                        "utm": "utm",
                        "invite_code": "inviteCode",
                        "promo_code": "promoCode",
                        "preferred_plan": "preferredPlan",
                        "preferred_interval": "preferredInterval",
                        "source": "source",
                        "referrer": "referredBy",
                    }
                    for share_key, target_field in field_map.items():
                        val = share_details.get(share_key)
                        if val:
                            update_data[target_field] = val
                    db.collection("users").document(email).set(update_data, merge=True)
                    session_id = obj.get("id")
                    utm_source = share_details.get("utm") or share_details.get("source")
                    if session_id and db:
                        sessions_ref = db.collection("analytics").document("trial_starts").collection("sessions").document(session_id)
                        try:
                            if not sessions_ref.get().exists:
                                sessions_ref.set(
                                    {
                                        "sessionId": session_id,
                                        "utm": (utm_source or "unknown").strip().lower() or "unknown",
                                        "createdAt": firestore.SERVER_TIMESTAMP,
                                    }
                                )
                                _increment_metric("trial_starts", utm_source)
                        except Exception:
                            traceback.print_exc()
                            _increment_metric("trial_starts", utm_source)
                    else:
                        _increment_metric("trial_starts", utm_source)
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
                except Exception as exc:
                    raise RuntimeError("Could not update subscription state") from exc
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
                except Exception as exc:
                    raise RuntimeError("Could not revoke deleted subscription") from exc
        elif et == "invoice.payment_succeeded":
            invoice = obj
            subscription_id = invoice.get("subscription")
            billing_reason = invoice.get("billing_reason")
            amount_paid = invoice.get("amount_paid") or 0
            if not db or not subscription_id or billing_reason != "subscription_cycle" or amount_paid <= 0:
                return ("", 200)
            try:
                q = db.collection("users").where(filter=firestore.FieldFilter("subscriptionId", "==", subscription_id)).limit(1).stream()
                user_doc = next(q, None)
            except Exception:
                traceback.print_exc()
                user_doc = None
            if user_doc:
                data = user_doc.to_dict() or {}
                if not data.get("firstConversionAt"):
                    utm_val = (data.get("utm") or data.get("source") or "").strip()
                    try:
                        user_doc.reference.set(
                            {
                                "firstConversionAt": firestore.SERVER_TIMESTAMP,
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                            },
                            merge=True,
                        )
                    except Exception:
                        traceback.print_exc()
                    _increment_metric("trial_conversions", utm_val)

                try:
                    referrer_email = (data.get("referredBy") or "").strip().lower()
                    invite_code = (data.get("inviteCode") or "").strip().lower()
                    redeemer_email = (user_doc.id or "").strip().lower()
                    if referrer_email and invite_code == REFERRAL_INVITE_CODE and redeemer_email:
                        _record_referral_completion(referrer_email, redeemer_email)
                except Exception:
                    traceback.print_exc()
        if event_ref:
            event_ref.set(
                {
                    "eventId": event_id,
                    "type": et,
                    "processedAt": firestore.SERVER_TIMESTAMP,
                }
            )
    except Exception:
        current_app.logger.exception("Stripe webhook processing failed for event %s", event.get("id"))
        return ("Webhook processing failed", 500)
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
        user_doc = db.collection("users").document(email).get() if email and db else None
        user_data = user_doc.to_dict() if user_doc and user_doc.exists else {}
        if (user_data.get("purchases") or {}).get(slug):
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
        current_app.logger.exception("[%s] Stripe pack checkout failed: %s", getattr(g, "req_id", ""), e)
        flash("We couldn't start checkout yet. Please try again.", "error")
        return redirect(url_for("browse_detail", slug=slug))


def buy_success(slug):
    session_id = (request.args.get("session_id") or "").strip()
    if session_id and stripe and STRIPE_SECRET_KEY:
        try:
            checkout = stripe.checkout.Session.retrieve(
                session_id,
                expand=["line_items.data.price.product"],
            )
            line_items = (checkout.get("line_items") or {}).get("data") or []
            line = line_items[0] if line_items else None
            price_obj = (line.get("price") or {}) if line else {}
            price_id = price_obj.get("id")
            unit_amount = price_obj.get("unit_amount")
            quantity = line.get("quantity") if line and line.get("quantity") else 1
            amount_total = line.get("amount_total") if line and line.get("amount_total") is not None else checkout.get("amount_total")
            currency = (
                (line.get("currency") if line else checkout.get("currency")) or "USD"
            ).upper()
            product_name = None
            product = price_obj.get("product")
            if isinstance(product, dict):
                product_name = product.get("name")
            value_amount = round(((amount_total or 0) / 100.0), 2)
            params = {
                "value": value_amount,
                "currency": currency,
                "num_items": quantity,
                "content_category": "Pack",
            }
            if price_id:
                params["content_ids"] = [price_id]
                params["content_type"] = "product"
            contents = []
            if price_id:
                item = {"id": price_id, "quantity": quantity}
                if unit_amount is not None:
                    item["item_price"] = round(unit_amount / 100.0, 2)
                contents.append(item)
            if contents:
                params["contents"] = contents
            pack_title = None
            if db:
                try:
                    doc = db.collection("collections").document(slug).get()
                    if doc.exists:
                        pack_title = (doc.to_dict() or {}).get("title")
                except Exception:
                    pack_title = None
            params["content_name"] = product_name or pack_title or slug.replace("-", " ").title()
            session["fb_purchase"] = {
                "params": params,
                "events": ["Purchase"],
                "eventID": session_id,
            }
        except Exception:
            traceback.print_exc()
    flash("Purchase successful. You can now download this pack.", "success")
    return redirect(url_for("browse_detail", slug=slug))
