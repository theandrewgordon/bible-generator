"""Coordinate long-running file generation with account deletion across workers."""
from functools import wraps
import hashlib
import time
import uuid

from firebase_admin import firestore

# Dead workers must not block deletion forever. This exceeds normal request limits.
OPERATION_LEASE_SECONDS = 30 * 60


class AccountBusyError(RuntimeError):
    pass


def _reference(client, email):
    key = hashlib.sha256(email.strip().lower().encode()).hexdigest()
    return client.collection("account_operations").document(key)


def begin_operation(client, email, kind):
    ref = _reference(client, email)
    token = uuid.uuid4().hex

    @firestore.transactional
    def claim(txn):
        now = time.time()
        data = ref.get(transaction=txn).to_dict() or {}
        active = {key: end for key, end in (data.get("active") or {}).items() if end > now}
        deletion = data.get("deletion") or {}
        if deletion.get("expires", 0) > now:
            raise AccountBusyError("Account deletion is in progress. Please try again shortly.")
        if kind == "deletion":
            if active:
                raise AccountBusyError(
                    "A printable is still being prepared. Please retry account deletion when it finishes."
                )
            deletion = {"token": token, "expires": now + OPERATION_LEASE_SECONDS}
        else:
            deletion = {}
            active[token] = now + OPERATION_LEASE_SECONDS
        txn.set(ref, {"active": active, "deletion": deletion})

    claim(client.transaction())
    return token


def end_operation(client, email, token):
    ref = _reference(client, email)

    @firestore.transactional
    def release(txn):
        data = ref.get(transaction=txn).to_dict() or {}
        active = dict(data.get("active") or {})
        active.pop(token, None)
        deletion = data.get("deletion") or {}
        if deletion.get("token") == token:
            deletion = {}
        txn.set(ref, {"active": active, "deletion": deletion})

    release(client.transaction())


def generation_guard(client_getter, *, methods=("POST",)):
    """Hold the account's generation lease through rendering and persistence."""
    def decorate(fn):
        @wraps(fn)
        def run(*args, **kwargs):
            from flask import current_app, flash, jsonify, redirect, request, session, url_for
            client = client_getter()
            email = session.get("user_email")
            if request.method not in methods or not email or not client:
                return fn(*args, **kwargs)
            try:
                token = begin_operation(client, email, "generation")
            except Exception as exc:
                current_app.logger.warning("Could not start generation safely: %s", exc)
                message = str(exc) if isinstance(exc, AccountBusyError) else "Account storage is unavailable. Please try again shortly."
                if request.is_json:
                    return jsonify(error=message), 503
                flash(message, "warning")
                return redirect(url_for("generate"))
            try:
                return fn(*args, **kwargs)
            finally:
                try:
                    end_operation(client, email, token)
                except Exception:
                    current_app.logger.exception("Could not release account generation lease")
        return run
    return decorate
