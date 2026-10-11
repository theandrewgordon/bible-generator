"""Browser smoke test for the Labs games (behavior, not source strings).

For each game: load it at iPad size with touch, create a player, start, tap
around randomly, and fail on any page error, failed request, or CDN request.

    pip install playwright && python -m playwright install chromium
    python scripts/games_smoke.py            # exits 1 on any failure

Runs the Flask app in-process with local storage only; never touches Firestore.
"""
from __future__ import annotations

import os
import random
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("OPENAI_API_KEY", "test-smoke")

import app as A  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402

GAMES = ("gordon-ice-cream-town", "gordon-window-washing", "gordon-mail-run", "gordon-family-stables", "same-brain")
PORT = int(os.getenv("GAMES_SMOKE_PORT", "5093"))


def main() -> int:
    A.db = None
    A.APP_ENV = "dev"

    @A.app.before_request
    def _signed_in():
        from flask import session
        session["user_email"] = "smoke@example.com"

    server = make_server("127.0.0.1", PORT, A.app, threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright

    failures: list[str] = []
    try:
        with sync_playwright() as p:
            launch = {"args": ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]}
            if os.getenv("CHROMIUM_PATH"):
                launch["executable_path"] = os.environ["CHROMIUM_PATH"]
            browser = p.chromium.launch(**launch)
            for game in GAMES:
                context = browser.new_context(viewport={"width": 1024, "height": 768}, is_mobile=True, has_touch=True)
                page = context.new_page()
                problems: list[str] = []
                page.on("pageerror", lambda e: problems.append(f"page error: {e}"))
                page.on("requestfailed", lambda r: problems.append(f"request failed: {r.url}"))
                page.route("**/cdn.jsdelivr.net/**", lambda r: (problems.append(f"CDN request: {r.request.url}"), r.abort()))
                page.goto(f"http://127.0.0.1:{PORT}/labs/games/{game}")
                page.wait_for_timeout(2500)
                new_player = page.locator("text=+ New Player >> visible=true")
                if new_player.count():
                    new_player.first.tap()
                    page.wait_for_timeout(300)
                    page.keyboard.type("Smoke")  # the name box must already have focus (iPad keyboard)
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(800)
                rng = random.Random(game)
                for _ in range(60):
                    page.touchscreen.tap(rng.randint(20, 1000), rng.randint(20, 740))
                    page.wait_for_timeout(100)
                page.wait_for_timeout(800)
                if game != "same-brain" and "Smoke" not in (page.evaluate("localStorage.getItem('tessas_games_platform_v1')") or ""):
                    problems.append("player was not created from the keyboard")
                status = "ok" if not problems else "FAIL"
                print(f"{status:4} {game}")
                failures.extend(f"{game}: {item}" for item in problems[:5])
                context.close()
            browser.close()
    finally:
        server.shutdown()
    for item in failures:
        print("  -", item)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
