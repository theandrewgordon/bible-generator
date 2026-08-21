#!/usr/bin/env python3
"""Read-only production smoke check for the public Worship/legal surface."""

from __future__ import annotations

import argparse
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(base: str, path: str, *, follow: bool = True):
    opener = build_opener() if follow else build_opener(NoRedirect())
    request = Request(urljoin(base.rstrip("/") + "/", path.lstrip("/")), headers={"User-Agent": "FaithSparks-Smoke/1.0"})
    try:
        return opener.open(request, timeout=15)
    except HTTPError as exc:
        return exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", nargs="?", default="https://faithsparksprintables.com")
    args = parser.parse_args()
    failures: list[str] = []
    try:
        for path, marker in (
            ("/", "Faith Sparks"),
            ("/terms", "Terms of Use"),
            ("/privacy", "Privacy Policy"),
            ("/copyright", "Copyright"),
        ):
            response = fetch(args.base_url, path)
            body = response.read().decode("utf-8", "replace")
            if response.status != 200 or marker not in body:
                failures.append(f"{path}: expected 200 and {marker!r}, got {response.status}")
            if not response.headers.get("X-Content-Type-Options"):
                failures.append(f"{path}: missing X-Content-Type-Options")
        worship = fetch(args.base_url, "/worship", follow=False)
        if worship.status not in (301, 302, 303, 307, 308):
            failures.append(f"/worship: expected signed-out redirect, got {worship.status}")
    except (OSError, URLError) as exc:
        failures.append(f"request failed: {exc}")
    if failures:
        print("Worship smoke check FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"Worship smoke check passed: {args.base_url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
