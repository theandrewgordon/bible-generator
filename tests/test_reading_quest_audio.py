from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from flask import Flask
from faithsparks.views import public
from faithsparks.services import ai_budget, rate_limit
from faithsparks.services.reading_quest_audio import CUES


@pytest.fixture
def audio(monkeypatch):
    app = Flask(__name__, template_folder='../../templates')
    app.secret_key = 'test-secret'
    app.register_blueprint(public.bp)
    client = app.test_client()
    with client.session_transaction() as session:
        session['_csrf_token'] = 'token'
    limit = Mock(return_value=SimpleNamespace(allowed=True, retry_after=60))
    budget = Mock(return_value=True)
    monkeypatch.setattr(public, 'check_rate_limit', limit)
    monkeypatch.setattr(ai_budget, 'ai_budget_ok', budget)
    speech = Mock(return_value=SimpleNamespace(read=lambda: b'audio-bytes'))
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speech))))
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr('openai.OpenAI', factory)
    return client, limit, budget, factory, speech


def post(audio, body=None, **kwargs):
    return audio[0].post('/labs/reading-quest/tts', json=body if body is not None else {'cue': '0-say'}, headers={'X-CSRF-Token': 'token', **kwargs})


def test_fixed_server_audio_and_no_persistence(audio):
    response = post(audio)
    assert response.status_code == 200 and response.data == b'audio-bytes'
    assert response.headers['Cache-Control'] == 'private, no-store'
    assert response.mimetype == 'audio/mpeg'
    args = audio[4].call_args.kwargs
    assert args['input'] == CUES['0-say']
    assert args['model'] == 'gpt-4o-mini-tts' and args['voice'] == 'coral'
    assert audio[3].call_args.kwargs['max_retries'] == 0
    assert len(audio[1].call_args_list) == 3
    assert all(c.kwargs['fail_closed'] for c in audio[1].call_args_list)
    assert '127.0.0.1' not in str(audio[1].call_args_list)
    audio[2].assert_called_once_with('reading_quest_tts', 3)


@pytest.mark.parametrize('body', [[], 'text', {'cue': []}, {'cue': 'unknown'}, {'text': 'Child name'}, {'cue': '0-say', 'voice': 'evil'}, {'cue': '0-say', 'name': 'child'}])
def test_rejects_arbitrary_input(audio, body):
    assert post(audio, body).status_code == 400
    audio[3].assert_not_called()


def test_csrf_size_and_cross_site(audio):
    assert audio[0].post('/labs/reading-quest/tts', json={'cue':'welcome'}).status_code == 403
    assert post(audio, **{'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    assert post(audio, {'cue': 'a'*300}).status_code == 413
    audio[3].assert_not_called()


def test_limit_budget_and_failure_fallback(audio, monkeypatch):
    audio[1].return_value.allowed = False
    response = post(audio)
    assert response.status_code == 429 and response.headers['Retry-After'] == '60'
    audio[1].return_value.allowed = True
    audio[2].return_value = False
    assert post(audio).status_code == 503
    audio[3].assert_not_called()
    audio[2].return_value = True
    audio[4].side_effect = RuntimeError('secret upstream detail')
    response = post(audio)
    assert response.status_code == 503 and b'secret' not in response.data
    monkeypatch.setenv('READING_QUEST_TTS_DISABLED', '1')
    assert post(audio).status_code == 503


def test_limiter_fails_closed_on_storage_error(monkeypatch):
    monkeypatch.setattr(rate_limit, 'db', SimpleNamespace(collection=Mock(side_effect=RuntimeError('offline'))))
    assert not rate_limit.check_rate_limit('rq', 'all', limit=1, window_seconds=60, fail_closed=True).allowed


def test_expanded_curriculum_is_solvable_and_audio_is_allowlisted():
    from collections import Counter
    from faithsparks.services.reading_quest_audio import TASKS
    assert Counter(t['world'] for t in TASKS) == {0: 8, 1: 8, 2: 8}
    assert {t['mode'] for t in TASKS} == {'listen', 'build', 'sort', 'sentence'}
    for index, task in enumerate(TASKS):
        assert CUES[f'{index}-say'] == task['say']
        assert CUES[f'{index}-help'] == task['help']
        if task['mode'] == 'build':
            # Each physical tile may be used once; every word must be buildable.
            tiles = Counter(task['tiles'])
            def build(prefix, available):
                if prefix == task['answer']:
                    return True
                for tile, count in available.items():
                    if count and task['answer'].startswith(prefix + tile):
                        rest = available.copy(); rest[tile] -= 1
                        if build(prefix + tile, rest):
                            return True
                return False
            assert build('', tiles)
        else:
            assert task['choices'].count(task['answer']) == 1
            assert len(set(task['choices'])) == len(task['choices'])
        assert len(task['say']) < 500 and len(task['help']) < 500
    for world in range(3):
        first = next((i,t) for i,t in enumerate(TASKS) if t['world'] == world)
        assert CUES[f'{first[0]}-intro'] == first[1]['intro']
        assert first[1]['adult']


def test_blending_demo_does_not_ask_tts_to_read_letter_lists_as_sounds():
    from faithsparks.services.reading_quest_audio import TASKS
    assert 'Listen to the word: sat.' in TASKS[0]['intro']
    assert 'grown-up' in TASKS[0]['intro']
    for text in CUES.values():
        assert 's, a, t' not in text
        assert not text.startswith(('Start with s,', 'Use sh,', 'Use ch,', 'Use p,'))
