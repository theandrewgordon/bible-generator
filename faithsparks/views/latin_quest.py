"""Latin Quest Lab: fixed curriculum audio, no server-side learner answers."""
import hashlib
import hmac
import os
import secrets
import threading
from openai import OpenAI
from flask import Blueprint, Response, current_app, jsonify, render_template, request, session
from faithsparks.services import latin_quest as curriculum
from faithsparks.services.ai_budget import ai_budget_ok
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.storage import download_storage_bytes, upload_storage_bytes, _get_bucket
from faithsparks.util.request_utils import get_client_ip

bp = Blueprint('latin_quest', __name__, url_prefix='/labs/latin-quest')
_LOCKS = [threading.Lock() for _ in range(32)]

def reply(body, status=200, **headers):
    response = Response(body, mimetype='audio/mpeg') if isinstance(body, bytes) else jsonify(body)
    response.status_code = status
    response.headers.update({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
                             'X-Robots-Tag': 'noindex, nofollow', **headers})
    return response

@bp.get('')
def page():
    token = session.setdefault('_csrf_token', secrets.token_urlsafe(32))
    response = current_app.make_response(render_template('labs_latin_quest.html', noindex=True,
        latin_questions=curriculum.QUESTIONS, latin_study=curriculum.STUDY, latin_modes=curriculum.MODES, latin_csrf=token,
        latin_audio_version=curriculum.AUDIO_VERSION))
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    return response

@bp.post('/tts')
def tts():
    if request.content_length is None or request.content_length > 512:
        return reply({'error': 'invalid'}, 413)
    token, expected = request.headers.get('X-CSRF-Token', ''), session.get('_csrf_token', '')
    if request.headers.get('Sec-Fetch-Site') == 'cross-site' or not token or not expected or not hmac.compare_digest(token, expected):
        return reply({'error': 'csrf'}, 403)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or set(payload) != {'cue', 'voice', 'pronunciation'} or any(not isinstance(v, str) for v in payload.values()):
        return reply({'error': 'invalid'}, 400)
    cue, voice, pronunciation = payload['cue'], payload['voice'], payload['pronunciation']
    if cue not in curriculum.CUES or voice not in curriculum.VOICES or pronunciation not in curriculum.INSTRUCTIONS:
        return reply({'error': 'invalid'}, 400)
    ip = hmac.new(str(current_app.secret_key).encode(), get_client_ip().encode(), hashlib.sha256).hexdigest()
    limit = check_rate_limit('latin_audio_requests', ip, limit=100, window_seconds=60, fail_closed=True)
    if not limit.allowed:
        return reply({'error': 'rate_limited'}, 429, **{'Retry-After': str(limit.retry_after)})
    path = curriculum.cache_path(cue, voice, pronunciation)
    def cached():
        audio = download_storage_bytes(path)
        return reply(audio, **{'Cache-Control':'private, max-age=31536000, immutable', 'X-AI-Voice':'OpenAI', 'X-TTS-Cache':'HIT'}) if audio else None
    hit = cached()
    if hit is not None:
        return hit
    # Generation needs durable storage, rather than generating again on every restart.
    if not os.getenv('OPENAI_API_KEY') or _get_bucket() is None or os.getenv('LATIN_QUEST_TTS_DISABLED', '').lower() in {'1','true','yes','on'}:
        return reply({'error': 'audio_unavailable'}, 503)
    lock = _LOCKS[int(hashlib.sha256(path.encode()).hexdigest()[:8], 16) % len(_LOCKS)]
    if not lock.acquire(timeout=2):
        return reply({'error': 'audio_pending'}, 409, **{'Retry-After': '3'})
    try:
        hit = cached()
        if hit is not None:
            return hit
        # Shared limits also bound duplicate cold misses across processes/instances.
        for scope, key, maximum, window in [('latin_audio_generation', path.rsplit('/',1)[1], 1, 60),
            ('latin_audio_day', ip, 100, 86400), ('latin_audio_global', 'all', 500, 86400)]:
            result = check_rate_limit(scope, key, limit=maximum, window_seconds=window, fail_closed=True)
            if not result.allowed:
                return reply({'error': 'rate_limited'}, 429, **{'Retry-After': str(result.retry_after)})
        if not ai_budget_ok('latin_quest_tts', 3):
            return reply({'error': 'audio_unavailable'}, 503)
        try:
            with OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=20, max_retries=0) as client:
                audio = client.audio.speech.create(model=curriculum.MODEL, voice=voice,
                    input=curriculum.CUES[cue], instructions=curriculum.INSTRUCTIONS[pronunciation],
                    speed=curriculum.SPEED, response_format='mp3').read()
            if not audio or len(audio) > 2_000_000:
                return reply({'error': 'audio_unavailable'}, 503)
        except Exception:
            return reply({'error': 'audio_unavailable'}, 503)
        saved = upload_storage_bytes(audio, path, content_type='audio/mpeg')
        return reply(audio, **{'Cache-Control':'private, max-age=31536000, immutable',
            'X-AI-Voice':'OpenAI', 'X-TTS-Cache':'MISS' if saved else 'UNCACHED'})
    finally:
        lock.release()
