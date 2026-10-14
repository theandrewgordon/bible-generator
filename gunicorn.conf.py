"""Gunicorn settings for Render (one place; the Dockerfile just points here).

One worker process on purpose: Live Worship keeps its state in memory so
screens can poll 4x a second without Firestore reads. Do NOT add
max_requests: with a single worker, recycling it freezes every Live Worship
screen for seconds while the app reloads (measured 2026-10-14).
"""
import os

bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"
worker_class = "gthread"
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
# Slow work (song import, AI calls, PowerPoint conversion) holds a thread;
# enough threads keep Live Worship polls flowing alongside it.
threads = int(os.getenv("GUNICORN_THREADS", "16"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "240"))
graceful_timeout = 30
keepalive = 5
accesslog = None  # the app logs requests itself (request ids, slow requests)
