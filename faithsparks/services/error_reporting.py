"""Error alerts via Sentry, on only when SENTRY_DSN is set.

Privacy: no personal data (emails, IPs, cookies), no request bodies, no
performance tracing. Sentry gets the exception, the stack trace and the URL
path, which is enough to fix a broken checkout or webhook.
"""
from __future__ import annotations

import os


def _scrub(event, _hint):
    request = event.get("request") or {}
    for key in ("cookies", "data", "headers", "env", "query_string"):
        request.pop(key, None)
    event.pop("user", None)
    return event


def init_error_reporting(app_env: str) -> bool:
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment=app_env,
        integrations=[FlaskIntegration()],
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
        before_send=_scrub,
    )
    return True
