"""On-demand OpenAI reading for the learning Labs; clips are shared by content."""
import hashlib
import hmac
import os
import secrets
import threading
from flask import Response, current_app, jsonify, request, session
from openai import OpenAI
from faithsparks.services.ai_budget import ai_budget_ok
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.storage import download_storage_bytes, upload_storage_bytes, _get_bucket
from faithsparks.util.request_utils import get_client_ip

MODEL = 'gpt-4o-mini-tts'
VOICE = 'coral'
VERSION = 'v1'
INSTRUCTIONS = ('Read only the supplied educational text in a warm, clear American English voice. '
                'Speak calmly for children. Read mathematical symbols and missing boxes naturally. '
                'Do not solve questions, add answers, or add any commentary.')
BODYBEAT_CUES = frozenset({"Reach left", "Reach right", "Reach up", "Duck", "Freeze"})
_LOCKS = [threading.Lock() for _ in range(32)]

def reply(body, status=200, **headers):
    response = Response(body, mimetype='audio/mpeg') if isinstance(body, bytes) else jsonify(body)
    response.status_code = status
    response.headers.update({'Cache-Control': 'private, no-store',
                             'X-Content-Type-Options': 'nosniff', **headers})
    return response

def voice_session():
    return reply({'csrf': session.setdefault('_csrf_token', secrets.token_urlsafe(32)),
                  'version': VERSION})

def clip_path(text):
    digest = hashlib.sha256('\n'.join([VERSION, MODEL, VOICE, INSTRUCTIONS, text]).encode()).hexdigest()
    return f'learning_labs/audio/{VERSION}/{digest}.mp3'

def speak():
    if request.content_length is None or request.content_length > 12000:
        return reply({'error': 'invalid'}, 413)
    token, expected = request.headers.get('X-CSRF-Token', ''), session.get('_csrf_token', '')
    if request.headers.get('Sec-Fetch-Site') == 'cross-site' or not token or not expected or not hmac.compare_digest(token, expected):
        return reply({'error': 'csrf'}, 403)
    payload = request.get_json(silent=True)
    if (not isinstance(payload, dict) or set(payload) != {'game', 'text'} or
        payload['game'] not in ['geo', 'math', 'grammar', 'bodybeat'] or
        not isinstance(payload['text'], str) or not 1 <= len(payload['text'].strip()) <= 1800):
        return reply({'error': 'invalid'}, 400)
    text = ' '.join(payload['text'].split())
    if payload['game'] == 'bodybeat' and text not in BODYBEAT_CUES:
        return reply({'error': 'invalid'}, 400)
    ip = hmac.new(str(current_app.secret_key).encode(), get_client_ip().encode(), hashlib.sha256).hexdigest()
    limited = check_rate_limit('learning_voice_requests', ip, limit=200, window_seconds=60, fail_closed=True)
    if not limited.allowed:
        return reply({'error': 'rate_limited'}, 429, **{'Retry-After': str(limited.retry_after)})
    path = clip_path(text)
    def cached():
        audio = download_storage_bytes(path)
        return reply(audio, **{'Cache-Control': 'private, max-age=31536000, immutable',
                              'X-AI-Voice': 'OpenAI', 'X-TTS-Cache': 'HIT'}) if audio else None
    hit = cached()
    if hit is not None:
        return hit
    if not os.getenv('OPENAI_API_KEY') or _get_bucket() is None or os.getenv('LAB_VOICE_DISABLED', '').lower() in {'1', 'true', 'yes', 'on'}:
        return reply({'error': 'audio_unavailable'}, 503)
    lock = _LOCKS[int(hashlib.sha256(path.encode()).hexdigest()[:8], 16) % len(_LOCKS)]
    if not lock.acquire(timeout=2):
        return reply({'error': 'audio_pending'}, 409, **{'Retry-After': '3'})
    try:
        hit = cached()
        if hit is not None:
            return hit
        for scope, key, limit, window in [
            ('learning_voice_clip', path, 1, 60),
            ('learning_voice_day', ip, 150, 86400),
            ('learning_voice_global', 'all', 1000, 86400),
        ]:
            limited = check_rate_limit(scope, key, limit=limit, window_seconds=window, fail_closed=True)
            if not limited.allowed:
                return reply({'error': 'rate_limited'}, 429, **{'Retry-After': str(limited.retry_after)})
        if not ai_budget_ok('learning_labs_tts', 3):
            return reply({'error': 'audio_unavailable'}, 503)
        try:
            with OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=25, max_retries=0) as client:
                audio = client.audio.speech.create(model=MODEL, voice=VOICE, input=text,
                    instructions=INSTRUCTIONS, speed=0.9, response_format='mp3').read()
            if not audio or len(audio) > 2_000_000:
                return reply({'error': 'audio_unavailable'}, 503)
        except Exception:
            return reply({'error': 'audio_unavailable'}, 503)
        saved = upload_storage_bytes(audio, path, content_type='audio/mpeg')
        return reply(audio, **{'Cache-Control': 'private, max-age=31536000, immutable',
                              'X-AI-Voice': 'OpenAI', 'X-TTS-Cache': 'MISS' if saved else 'UNCACHED'})
    finally:
        lock.release()
