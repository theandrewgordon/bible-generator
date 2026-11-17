from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pytest
from flask import Flask
from faithsparks.services import latin_quest as cards
from faithsparks.views import latin_quest as view

@pytest.fixture
def client(monkeypatch):
    app = Flask(__name__)
    app.secret_key = 'latin-test'
    app.register_blueprint(view.bp)
    c = app.test_client()
    with c.session_transaction() as s:
        s['_csrf_token'] = 'test-token'
    store = {}
    monkeypatch.setattr(view, 'download_storage_bytes', lambda path: store.get(path))
    def upload(audio, path, **kwargs):
        store[path] = audio
        return True
    monkeypatch.setattr(view, 'upload_storage_bytes', upload)
    monkeypatch.setattr(view, '_get_bucket', lambda: object())
    limits = Mock(return_value=SimpleNamespace(allowed=True, retry_after=30))
    budget = Mock(return_value=True)
    monkeypatch.setattr(view, 'check_rate_limit', limits)
    monkeypatch.setattr(view, 'ai_budget_ok', budget)
    speech = Mock(return_value=SimpleNamespace(read=lambda: b'mp3-clip'))
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speech))))
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(view, 'OpenAI', factory)
    return c, store, limits, budget, factory, speech

def post(client, body=None, **headers):
    return client[0].post('/labs/latin-quest/tts', json=body or {'cue':'fs-n-042:meaning:details','voice':'coral','pronunciation':'classical'}, headers={'X-CSRF-Token':'test-token', **headers})

def test_independent_source_and_practice_variations():
    assert sum(len(cards.SOURCE[k]) for k in ['nouns_and_pronouns','verbs','conjunctions','grammar']) == 191
    assert len(cards.SOURCE['unresolved']) == 0
    assert len([q for q in cards.QUESTIONS if q['mode']=='meaning']) == 155
    assert len([q for q in cards.QUESTIONS if q['mode']=='reverse']) == 155
    assert len([q for q in cards.QUESTIONS if q['mode']=='grammar']) == 36
    assert len({q['id'] for q in cards.QUESTIONS}) == len(cards.QUESTIONS)
    assert not any('unresolved' in q['id'] for q in cards.QUESTIONS)
    assert 'second declension. neuter' in cards.CUES['fs-n-042:meaning:details']
    assert cards.CUES['fs-n-017:meaning:details'].startswith('Noun. first declension. masculine.')
    assert cards.CUES['fs-v-017:meaning:details'].startswith('Verb. first conjugation.')
    # Answers are not leaked by announcing grammatical details in recall modes.
    assert cards.QUESTION_MAP['fs-n-042:nouns-gender']['details'] == ''
    assert 'teneō' in cards.QUESTION_MAP['fs-v-023:reverse']['answers']
    assert cards.QUESTION_MAP['fs-g-029:grammar']['preserveVowelLength'] is True
    assert 'score-140' in cards.CUES and 'count-140' in cards.CUES
    assert next(e for e in cards.STUDY if e['word']=='terra' and e['fact']=='gender')['answer']=='feminine'

def test_voice_is_generated_once_then_reused_without_paid_call(client, monkeypatch):
    first = post(client)
    assert first.status_code == 200 and first.headers['X-TTS-Cache'] == 'MISS'
    assert len(client[1]) == 1
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    second = post(client)
    assert second.status_code == 200 and second.headers['X-TTS-Cache'] == 'HIT'
    assert first.data == second.data == b'mp3-clip'
    client[4].assert_called_once()
    client[3].assert_called_once_with('latin_quest_tts', 3)
    assert client[4].call_args.kwargs['max_retries'] == 0
    assert client[5].call_args.kwargs['input'] == cards.CUES['fs-n-042:meaning:details']
    assert 'immutable' in second.headers['Cache-Control']

def test_cache_key_covers_voice_pronunciation_and_content(client):
    paths={cards.cache_path('welcome',voice,p) for voice in cards.VOICES for p in cards.INSTRUCTIONS}
    assert len(paths)==2
    assert cards.cache_path('correct','coral','classical') != cards.cache_path('welcome','coral','classical')
    post(client)
    assert post(client,{'cue':'fs-n-042:meaning:details','voice':'marin','pronunciation':'classical'}).status_code == 200
    assert client[4].call_count == 2

@pytest.mark.parametrize('payload', [[], 'answer', {'cue':[]}, {'cue':'unknown','voice':'coral','pronunciation':'classical'}, {'cue':'welcome','voice':'fake','pronunciation':'church'}, {'text':'private answer','cue':'welcome','voice':'coral','pronunciation':'classical'}])
def test_only_fixed_server_cues_are_admitted(client, payload):
    r=client[0].post('/labs/latin-quest/tts',json=payload,headers={'X-CSRF-Token':'test-token'})
    assert r.status_code == 400
    client[4].assert_not_called()

def test_csrf_size_and_paid_failure_boundaries(client, monkeypatch):
    assert client[0].post('/labs/latin-quest/tts',json={'cue':'welcome'}).status_code==403
    assert post(client, **{'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert post(client, {'cue':'x'*600,'voice':'coral','pronunciation':'classical'}).status_code==413
    client[2].return_value.allowed=False
    assert post(client).status_code==429
    client[2].return_value.allowed=True
    client[3].return_value=False
    assert post(client).status_code==503
    client[4].assert_not_called()
    client[3].return_value=True
    monkeypatch.setattr(view,'_get_bucket',lambda:None)
    assert post(client).status_code==503
    client[4].assert_not_called()

def test_failures_do_not_expose_provider_details(client, monkeypatch):
    client[5].side_effect=RuntimeError('secret provider detail')
    r=post(client)
    assert r.status_code==503 and b'secret' not in r.data
    client[5].side_effect=None
    monkeypatch.setattr(view,'upload_storage_bytes',lambda *a,**kw:False)
    r=post(client)
    assert r.status_code==200 and r.headers['X-TTS-Cache']=='UNCACHED'

def test_latin_lab_is_discoverable_and_noindexed():
    from app import app
    app.config.update(TESTING=True)
    with app.test_client() as c:
        assert b'/labs/latin-quest' in c.get('/labs').data
        response=c.get('/labs/latin-quest')
        assert response.status_code==200
        assert b'Latin Quest' in response.data and b'Hands-free' in response.data
        assert response.headers['Cache-Control']=='private, no-store'
        assert response.headers['X-Robots-Tag']=='noindex, nofollow'
        assert b'unresolved-001' not in response.data
        assert b'/labs/latin-quest' not in c.get('/sitemap.xml').data


def test_only_classical_pronunciation_is_supported(client):
    assert set(cards.INSTRUCTIONS) == {'classical'}
    response = post(client, {'cue':'welcome', 'voice':'coral', 'pronunciation':'church'})
    assert response.status_code == 400
    client[4].assert_not_called()
    old = cards.cache_path('welcome', 'coral', 'classical')
    with patch.dict(cards.INSTRUCTIONS, {'classical': 'changed pronunciation guidance'}):
        assert cards.cache_path('welcome', 'coral', 'classical') != old


def test_choice_audio_is_fixed_card_text_and_cached(client):
    q = next(q for q in cards.QUESTIONS if q['mode'] == 'reverse')
    cue = 'option:' + q['id']
    assert cards.CUES[cue] == q['answers'][0]
    payload = {'cue': cue, 'voice': 'coral', 'pronunciation': 'classical'}
    assert post(client, payload).status_code == 200
    assert post(client, payload).headers['X-TTS-Cache'] == 'HIT'
    client[4].assert_called_once()
    assert client[5].call_args.kwargs['input'] == q['answers'][0]
    for q in cards.QUESTIONS:
        if q['mode'] in {'meaning', 'reverse'}:
            assert cards.CUES['option:' + q['id']] == q['answers'][0]


def test_option_audio_keeps_english_and_latin_distinct():
    assert 'English meaning' in cards.speech_instructions('option:fs-n-042:meaning', 'classical')
    assert 'isolated Latin word' in cards.speech_instructions('option:fs-n-042:reverse', 'classical')
    assert cards.speech_instructions('welcome', 'classical') == cards.INSTRUCTIONS['classical']


def test_full_approved_decks_follow_student_flow(tmp_path):
    import json
    import os
    import shutil
    import subprocess
    node = shutil.which('node')
    if not node:
        pytest.skip('Node is required for browser-script integration checks')
    bank = tmp_path / 'approved-bank.json'
    bank.write_text(json.dumps(cards.QUESTIONS))
    env = {**os.environ, 'LATIN_QUEST_BANK': str(bank)}
    result = subprocess.run([node, 'tests/latin_quest_voice.cjs'], cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count('Full approved-deck playthrough:') == 12


def test_page_uses_content_versioned_scripts():
    from app import app
    with app.test_client() as client:
        response = client.get('/labs/latin-quest')
    assert response.status_code == 200
    page = response.get_data(as_text=True)
    assert 'type="module" src="/static/labs/learning/latin/main-' in page
    assert 'latin-quest.js?v=' not in page
    assert 'id="lq-resume"' in page
    assert 'id="lq-reset-accept"' in page


def test_memory_links_are_sourced_help_not_answers():
    assert len(cards.MEMORY_LINKS) == 6
    for cid, memory in cards.MEMORY_LINKS.items():
        assert any(q['card'] == cid for q in cards.QUESTIONS)
        assert memory['source'].startswith('https://')
        assert cards.CUES['memory:' + cid] == memory['text']
    eye = next(q for q in cards.QUESTIONS if q['id'] == 'fs-n-028:meaning')
    assert 'ocular' not in eye['answers']


def test_both_flashcard_directions_use_only_card_material():
    qs = [q for q in cards.QUESTIONS if q['mode'] in {'meaning', 'reverse'}]
    assert len(qs) == 310
    for q in qs:
        assert cards.CUES['flash:' + q['id'] + ':front'] == q['flash_front']
        assert cards.CUES['flash:' + q['id'] + ':back'] == q['flash_back']
    latin = next(q for q in qs if q['id'] == 'fs-n-028:meaning')
    english = next(q for q in qs if q['id'] == 'fs-n-028:reverse')
    assert latin['flash_front'] == english['flash_back'] == 'oculus, oculī'
    assert latin['flash_back'] == english['flash_front'] == 'eye'
    assert 'English meaning' in cards.speech_instructions('flash:fs-n-028:meaning:back', 'classical')
    assert 'isolated Latin' in cards.speech_instructions('flash:fs-n-028:reverse:back', 'classical')


def test_public_curriculum_is_independent_and_uses_new_identifiers():
    assert cards.SOURCE['version'] == '2026-11-16-original-1'
    assert cards.CARD_COUNT == 191
    assert all(q['card'].startswith('fs-') for q in cards.QUESTIONS)
    assert len({q['prompt'] for q in cards.QUESTIONS}) == len(cards.QUESTIONS)
    assert 'Classical Conversations' not in str(cards.INSTRUCTIONS)
    assert cards.SOURCE['provenance']['fact_references']


def test_long_and_short_infinitive_questions_preserve_vowel_length(tmp_path):
    import json, subprocess
    qs=[cards.QUESTION_MAP['fs-g-029:grammar'],cards.QUESTION_MAP['fs-g-030:grammar']]
    program="const assert=require('assert/strict');const core=require('./static/js/latin-quest-core.js');const [long,short]=JSON.parse(process.argv[1]);assert(core.matches(long,'ēre'));assert(!core.matches(long,'ere'));assert(core.matches(long,'long ere'));assert(core.matches(short,'ere'));assert(!core.matches(short,'ēre'));"
    result=subprocess.run(['node','-e',program,json.dumps(qs)],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
    assert result.returncode == 0, result.stdout+result.stderr
