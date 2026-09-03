#!/usr/bin/env python3
"""Read-only WeekFlow production smoke check with optional authenticated probes."""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.request


def request_json(
    opener,
    url: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    cookie: str | None = None,
    csrf_token: str | None = None,
) -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with opener.open(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {"error": str(exc)}
        return exc.code, payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", help="Deployment origin, for example https://example.com")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    cookie = os.getenv("WEEKFLOW_SMOKE_COOKIE")
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    page_request = urllib.request.Request(
        f"{base}/labs/weekflow",
        headers={"Cookie": cookie} if cookie else {},
    )
    try:
        with opener.open(page_request, timeout=20) as response:
            page = response.read().decode()
    except (OSError, urllib.error.URLError) as exc:
        print(f"FAIL WeekFlow page: {exc}", file=sys.stderr)
        return 1
    csrf_match = re.search(
        r'<meta\s+name="csrf-token"\s+content="([^"]+)"',
        page,
    )
    if not csrf_match:
        print("FAIL WeekFlow page: CSRF token not found", file=sys.stderr)
        return 1
    csrf_token = csrf_match.group(1)
    print("PASS WeekFlow page and CSRF bootstrap")

    status, plan = request_json(
        opener,
        f"{base}/labs/weekflow/schedule",
        method="POST",
        payload={"mode": "baseline"},
        cookie=cookie,
        csrf_token=csrf_token,
    )
    if status != 200 or plan.get("total_count") != 15:
        print(f"FAIL scheduler: HTTP {status} {plan}", file=sys.stderr)
        return 1
    print("PASS public scheduler: 15 default assignments accounted for")

    if not cookie:
        print("SKIP authenticated storage/health: set WEEKFLOW_SMOKE_COOKIE")
        return 0

    status, state = request_json(
        opener, f"{base}/labs/weekflow/state", cookie=cookie
    )
    if status != 200 or "revision" not in state:
        print(f"FAIL authenticated state: HTTP {status} {state}", file=sys.stderr)
        return 1
    print(f"PASS authenticated storage read: revision {state['revision']}")

    status, health = request_json(
        opener, f"{base}/labs/weekflow/health", cookie=cookie
    )
    if status == 200:
        if not health.get("ok"):
            print(f"FAIL admin health: {health}", file=sys.stderr)
            return 1
        print("PASS admin health: Firestore is ready")
    else:
        print("SKIP admin health: smoke account is not an administrator")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
