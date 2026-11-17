from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from flask import Flask
from faithsparks.services import lab_voice as voice

@pytest.fixture
def setup(monkeypatch):
    app = Flask(__name__)
    app.secret_key = 'voice-test'
    app.add_url_rule('/session', view_func=voice.voice_session)
    app.add_url_rule('/tts', view_func=voice.speak, methods=['POST'])
    store = {}
    monkeypatch.setattr(voice, 'download_storage_bytes', lambda p: store.get(p))
    def upload(audio, path, **kwargs):
        store[path] = audio
        return True
    monkeypatch.setattr(voice, 'upload_storage_bytes', upload)
    monkeypatch.setattr(voice, '_get_bucket', lambda: object())
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.delenv('LAB_VOICE_DISABLED', raising=False)
    monkeypatch.setattr(voice, 'check_rate_limit', Mock(return_value=SimpleNamespace(allowed=True, retry_after=1)))
    budget = Mock(return_value=True)
    monkeypatch.setattr(voice, 'ai_budget_ok', budget)
    speech = Mock(return_value=SimpleNamespace(read=lambda: b'fake-mp3'))
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speech))))
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(voice, 'OpenAI', factory)
    client = app.test_client()
    token = client.get('/session').json['csrf']
    return client, token, store, speech, budget

def post(setup, text='Clue 1. I am a sandy place beside water.', game='geo', **headers):
    client, token, *_ = setup
    return client.post('/tts', json={'game': game, 'text': text}, headers={'X-CSRF-Token': token, **headers})

def test_generated_once_then_durable_cache_without_api_key(setup, monkeypatch):
    first = post(setup)
    assert first.status_code == 200 and first.headers['X-TTS-Cache'] == 'MISS'
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    second = post(setup)
    assert second.status_code == 200 and second.headers['X-TTS-Cache'] == 'HIT'
    assert first.data == second.data == b'fake-mp3'
    setup[3].assert_called_once()
    setup[4].assert_called_once()

def test_normalized_text_reuses_clip_across_games(setup):
    assert post(setup, 'Read this.').status_code == 200
    assert post(setup, ' Read   this. ', game='grammar').headers['X-TTS-Cache'] == 'HIT'
    assert len(setup[2]) == 1

@pytest.mark.parametrize('text,game', [('', 'geo'), ('x'*1801, 'math'), (['answer'], 'geo'), ('question','unknown')])
def test_rejects_invalid_payload_without_paid_request(setup, text, game):
    assert post(setup, text, game).status_code == 400
    setup[3].assert_not_called()

def test_csrf_cross_site_and_disabled_generation(setup, monkeypatch):
    assert setup[0].post('/tts', json={'game':'geo','text':'Hello'}).status_code == 403
    assert post(setup, **{'Sec-Fetch-Site':'cross-site'}).status_code == 403
    monkeypatch.setenv('LAB_VOICE_DISABLED', 'true')
    assert post(setup).status_code == 503
    setup[3].assert_not_called()

def test_text_change_changes_key():
    assert voice.clip_path('one') != voice.clip_path('two')
