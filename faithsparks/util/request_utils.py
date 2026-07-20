import json
import re
import ipaddress
from urllib.parse import urlparse
from typing import Any, Dict, Optional, Tuple

from flask import current_app, g, request, session


def _logger():
    try:
        return current_app.logger
    except Exception:
        return None


def _safe_req_id() -> str:
    return getattr(g, "req_id", "") or ""


def get_request_payload() -> Tuple[Dict[str, Any], str]:
    """Return request payload as a dict plus a hint of its origin."""
    if request.method == "GET":
        return {}, "none"

    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data, "json"

    if request.form:
        return {k: request.form.get(k) for k in request.form}, "form"

    raw = request.get_data(cache=True, as_text=True) or ""
    if raw:
        try:
            return json.loads(raw), "raw-json"
        except json.JSONDecodeError:
            pass
    return {}, "empty"


def log_request_summary(where: str) -> None:
    logger = _logger()
    if not logger:
        return

    req_id = _safe_req_id()
    user = session.get("user_email") or "anonymous"
    logger.info(
        "[%s] %s %s ct=%s len=%s user=%s ip=%s note=%s",
        req_id,
        request.method,
        request.path,
        request.headers.get("Content-Type"),
        request.headers.get("Content-Length"),
        user,
        get_client_ip(),
        where,
    )


def _first_public_ip(header_value: str) -> Optional[str]:
    if not header_value:
        return None
    candidates = [part.strip() for part in header_value.split(",") if part.strip()]
    for candidate in candidates:
        try:
            ip_obj = ipaddress.ip_address(candidate)
            if not (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved):
                return candidate
        except ValueError:
            continue
    return candidates[0] if candidates else None


def get_client_ip() -> str:
    ip = request.headers.get("CF-Connecting-IP")
    if ip:
        return ip
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        candidate = _first_public_ip(forwarded)
        if candidate:
            return candidate
    return request.remote_addr or "0.0.0.0"


def is_safe_artifact_url(value: str) -> bool:
    """Allow redirects only to this app or known Google Storage download hosts."""
    try:
        parsed = urlparse(str(value or "").strip())
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return False
        host = parsed.hostname.lower().rstrip(".")
        request_host = (request.host.split(":", 1)[0] or "").lower().rstrip(".")
        return host == request_host or host in {
            "storage.googleapis.com",
            "firebasestorage.googleapis.com",
        } or host.endswith(".storage.googleapis.com")
    except Exception:
        return False


def extract_json_candidate(blob: str):
    if not blob:
        return None
    blob = blob.strip()
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        pass

    match = re.search(r"(\{.*\}|\[.*\])", blob, re.S)
    if match:
        snippet = match.group(1)
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            return None
    return None


def log_ai_parse_failure(payload: str, reason: Optional[str] = None) -> None:
    logger = _logger()
    snippet = (payload or "")[:200]
    if logger:
        logger.error(
            "[%s] Bad JSON from AI. %s First200=%r",
            _safe_req_id(),
            f"reason={reason} " if reason else "",
            snippet,
        )
    else:
        suffix = f" reason={reason}" if reason else ""
        print(f"Bad JSON from AI{suffix} (first200={snippet!r})")


def log_ai_parse_recovery(note: str = "") -> None:
    logger = _logger()
    if logger:
        logger.info("[%s] Recovered JSON from AI fallback %s", _safe_req_id(), note)
    else:
        print(f"Recovered JSON from AI fallback {note}")
