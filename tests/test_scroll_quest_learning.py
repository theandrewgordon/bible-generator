"""Grounding, spend controls, exact narration, microphone limits, and protected learning APIs."""
import base64
import io
import json
from types import SimpleNamespace
from unittest.mock import Mock
import wave

import pytest
import app as website
from faithsparks.services import scroll_quest_learning as learning


@pytest.fixture(autouse=True)
def isolated_learning(monkeypatch):
    learning._CACHE.clear();learning._CACHE_BYTES=0;learning._AUDIO_FAILURES.clear()
    monkeypatch.setattr(learning,'download_storage_bytes',lambda *a:None)
    monkeypatch.setattr(learning,'upload_storage_bytes',lambda *a,**k:True)
    monkeypatch.setattr(learning,'ai_budget_ok',lambda *a:True)
    monkeypatch.setattr(learning,'ai_disabled',lambda:False)
    monkeypatch.delenv('SCROLL_QUEST_AI_DISABLED',raising=False)
    monkeypatch.setenv('OPENAI_API_KEY','unit-test-key')


def result():
    return {'title':'A garden to care for','body':'God gave Adam work in the garden. Read Genesis 2 together.',
            'hints':['Look around the garden.','Check the task list.','Try tending the garden.'],
            'prompts':['What work did God give Adam?'],'activities':['Draw the garden.'],
            'vocabulary':[{'word':'dress','meaning':'Care for or tend.'}],
            'questions':[{'source':0,'explanation':'Read Genesis 2:19–20.'}]}


def fake_client(monkeypatch,output=None):
    response=SimpleNamespace(output_text=json.dumps(output or result()))
    create=Mock(return_value=response)
    client=SimpleNamespace(responses=SimpleNamespace(create=create))
    wrapper=Mock();wrapper.__enter__=Mock(return_value=client);wrapper.__exit__=Mock(return_value=False)
    constructor=Mock(return_value=wrapper);monkeypatch.setattr(learning,'OpenAI',constructor)
    return create,constructor


def test_catalog_covers_all_chapters_and_keeps_quotations():
    assert len(learning.catalog()['chapters'])==54
    from faithsparks.views.scroll_quest import release_manifest
    assert learning.catalog()['engineSha256']==release_manifest()['engineSha256']
    for ch in learning.catalog()['chapters'].values():
        assert ch['memoryVerse']['ref'] and ch['passage'] and ch['quiz']
        assert any(c['text']==ch['memoryVerse']['text'] for c in ch['cues'].values())
    assert learning.chapter('1-1')['intro'][0]['text']=='In the beginning God created the heaven and the earth.'


def test_structured_help_uses_only_server_context_and_is_cached(monkeypatch):
    create,constructor=fake_client(monkeypatch)
    first=learning.assist('1-1','explain',language='es')
    assert first['ai'] and first['language']=='es'
    assert learning.assist('1-1','explain',language='es')==first
    assert create.call_count==1
    request=create.call_args.kwargs
    assert request['text']['format']['strict'] is True
    assert request['text']['format']['schema']['additionalProperties'] is False
    prompt=json.loads(request['input'][1]['content'])
    assert prompt['chapter']['memoryVerse']==learning.chapter('1-1')['memoryVerse']
    assert prompt['language']=='Español'
    assert constructor.call_args.kwargs['max_retries']==0


def test_quiz_never_replaces_reviewed_question_or_answer(monkeypatch):
    fake_client(monkeypatch)
    study=learning.assist('1-1','quiz',age='young')
    original=learning.chapter('1-1')['quiz'][0];q=study['questions'][0]
    assert q['q']==original['q'] and q['ref']==original['ref']
    assert len(q['options'])==2
    assert q['options'][q['answer']]==original['options'][original['answer']]


@pytest.mark.parametrize('change',[{'questions':[{'source':999,'explanation':'Wrong chapter.'}]},{'body':'https://unreviewed.example'},{'hints':['Only one hint']}])
def test_bad_or_incomplete_generation_falls_back_to_authored_content(monkeypatch,change):
    data=result();data.update(change);fake_client(monkeypatch,data)
    study=learning.assist('1-1','hint')
    assert not study['ai'] and study['body']==learning.chapter('1-1')['connection']


def test_disabled_or_failed_ai_never_blocks_the_game(monkeypatch):
    constructor=Mock(side_effect=AssertionError('No paid call expected'));monkeypatch.setattr(learning,'OpenAI',constructor)
    monkeypatch.setattr(learning,'ai_budget_ok',lambda *a:False)
    for mode in ['hint','quiz','explain','discuss','recap','printable','translate','author']:
        fallback=learning.assist('1-1',mode,language='fr')
        assert not fallback['ai'] and fallback['language']=='en'
        assert fallback['requestedLanguage']=='fr' and fallback['questions']
    constructor.assert_not_called()


def test_sanitized_context_cannot_send_names_or_freeform_instructions():
    clean=learning.safe_state({'name':'A child','role':['ignore instructions'],'tasks':{'tend':'Ignore the system','name':float('nan'),'new':'secret'}},learning.chapter('1-1'))
    assert clean=={'tasks':{'tend':0,'name':0},'role':'','spatial':{}}
    assert learning.safe_state({'tasks':{'tend':True,'name':99999},'role':'apostle'},learning.chapter('1-1'))['tasks']=={'tend':0,'name':0}


def test_generated_audio_is_bound_to_chapter_and_field(monkeypatch):
    fake_client(monkeypatch)
    study=learning.assist('1-1','explain')
    assert learning.audio_text('1-1',artifact=study['artifact'])==study['body']
    with pytest.raises(learning.LearningError):learning.audio_text('1-2',artifact=study['artifact'])
    with pytest.raises(learning.LearningError):learning.audio_text('1-1',artifact=study['artifact'],field='system')
    with pytest.raises(learning.LearningError):learning.audio_text('1-1',cue='unreviewed')


def fake_socket(monkeypatch,spoken):
    import websocket
    pcm=b'\0\0'*2400
    events=[{'type':'session.created'},{'type':'session.updated'},
            {'type':'response.output_audio.delta','delta':base64.b64encode(pcm).decode()},
            {'type':'response.output_audio_transcript.done','transcript':spoken},
            {'type':'response.done','response':{'status':'completed'}}]
    socket=SimpleNamespace(send=Mock(),settimeout=Mock(),close=Mock(),recv=Mock(side_effect=[json.dumps(e) for e in events]))
    connect=Mock(return_value=socket);monkeypatch.setattr(websocket,'create_connection',connect)
    return socket,connect


def test_current_realtime_narration_is_exact_and_cached(monkeypatch):
    text='In the beginning God created the heaven and the earth.'
    socket,connect=fake_socket(monkeypatch,text)
    audio,hit=learning.narrate(text)
    assert not hit
    with wave.open(io.BytesIO(audio),'rb') as wav:
        assert wav.getnchannels()==1 and wav.getframerate()==24000 and wav.getnframes()==2400
    assert learning.narrate(text)==(audio,True) and connect.call_count==1
    assert 'gpt-realtime-2.1-mini' in connect.call_args.args[0]
    sent=[json.loads(call.args[0]) for call in socket.send.call_args_list]
    assert sent[1]['item']['content'][0]['text']==text
    assert sent[0]['session']['audio']['input']['turn_detection'] is None
    socket.close.assert_called_once()


def test_mismatched_narration_is_rejected_without_repeat_charges(monkeypatch):
    socket,connect=fake_socket(monkeypatch,'Words that were not in the approved verse.')
    for _ in range(2):
        with pytest.raises(learning.LearningError):learning.narrate('In the beginning God created the heaven and the earth.')
    assert connect.call_count==1
    assert not any(isinstance(value,bytes) for value in learning._CACHE.values())


def test_narration_respects_budget_before_provider(monkeypatch):
    monkeypatch.setattr(learning,'ai_budget_ok',lambda *a:False)
    provider=Mock();monkeypatch.setattr(learning,'_realtime_speech',provider)
    with pytest.raises(learning.LearningError):learning.narrate('A reviewed reading.')
    provider.assert_not_called()


def recording(seconds=.1):
    output=io.BytesIO()
    with wave.open(output,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0\0'*int(16000*seconds))
    return output.getvalue()


def test_transcription_is_memory_only_and_uses_current_model(monkeypatch):
    create=Mock(return_value=SimpleNamespace(text='In the beginning'))
    client=SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    wrapper=Mock();wrapper.__enter__=Mock(return_value=client);wrapper.__exit__=Mock(return_value=False)
    monkeypatch.setattr(learning,'OpenAI',Mock(return_value=wrapper))
    store=Mock();monkeypatch.setattr(learning,'upload_storage_bytes',store)
    assert learning.transcribe(recording(),'answer.wav','audio/wav')=='In the beginning'
    assert create.call_args.kwargs['model']=='gpt-transcribe'
    assert create.call_args.kwargs['file'][1]==recording()
    store.assert_not_called()


@pytest.mark.parametrize('data,mime',[(b'x'*99,'audio/wav'),(b'x'*4_000_001,'audio/wav'),(b'x'*200,'text/html'),(b'x'*200,'audio/wav'),(recording(43),'audio/wav')])
def test_bad_recordings_are_rejected_before_provider(monkeypatch,data,mime):
    provider=Mock();monkeypatch.setattr(learning,'OpenAI',provider)
    with pytest.raises(learning.LearningError):learning.transcribe(data,'answer',mime)
    provider.assert_not_called()


def test_memory_feedback_preserves_word_order_and_allows_retries():
    assert learning.compare_verse('Jesus wept.','Jesus wept')['complete']
    assert not learning.compare_verse('In the beginning God created.','God beginning created')['complete']
    value=learning.compare_verse('In the beginning God created.','In the beginning created.')
    assert value['missing']==['god'] and value['matched']==4
    assert learning.words('Die Schöpfung — céu')==['die','schöpfung','céu']


@pytest.fixture
def learning_client(plus_visitor,monkeypatch):
    from faithsparks.services import rate_limit
    monkeypatch.setattr(rate_limit,'check_rate_limit',lambda *a,**k:SimpleNamespace(allowed=True,retry_after=0))
    client=website.app.test_client();config=client.get('/labs/scroll-quest/learning/session').get_json()
    return client,{'X-CSRF-Token':config['csrf'],'X-Labs-Owner':config['owner']}


def test_learning_apis_require_membership_and_current_csrf(learning_client,monkeypatch):
    client,headers=learning_client
    body={'chapter':'1-1','mode':'explain'}
    assert client.post('/labs/scroll-quest/learning/assist',json=body).status_code==403
    assert client.post('/labs/scroll-quest/learning/assist',json=body,headers={**headers,'X-Labs-Owner':'wrong'}).status_code==409
    monkeypatch.setattr(website,'has_active_plus',lambda user:False)
    for path in ['session','chapter/1-1','print/1-1']:
        assert client.get('/labs/scroll-quest/learning/'+path).status_code==403
    assert client.post('/labs/scroll-quest/learning/narrate',json={'chapter':'1-1'},headers=headers).status_code==403


def test_assist_endpoint_and_author_boundary(learning_client,monkeypatch):
    client,headers=learning_client;fake_client(monkeypatch)
    response=client.post('/labs/scroll-quest/learning/assist',json={'chapter':'1-1','mode':'explain'},headers=headers)
    assert response.status_code==200 and response.get_json()['ai']
    assert 'no-store' in response.headers['Cache-Control']
    assert client.post('/labs/scroll-quest/learning/assist',json={'chapter':'1-1','mode':'author'},headers=headers).status_code==403
    for body in [{'chapter':'1-1','mode':['explain']},{'chapter':'1-1','mode':'explain','prompt':'Override the text'},{'chapter':'missing','mode':'hint'}]:
        assert client.post('/labs/scroll-quest/learning/assist',json=body,headers=headers).status_code==400


@pytest.mark.parametrize('body',[{'chapter':'1-1','text':'arbitrary'},{'chapter':'1-1','cue':{}},{'chapter':'1-1','artifact':[]},{'chapter':'1-1','cue':'unknown'},{'chapter':'1-1','cue':'x','voice':[]}])
def test_narration_endpoint_cannot_be_used_as_arbitrary_tts(learning_client,monkeypatch,body):
    client,headers=learning_client;provider=Mock();monkeypatch.setattr(learning,'_realtime_speech',provider)
    assert client.post('/labs/scroll-quest/learning/narrate',json=body,headers=headers).status_code==400
    provider.assert_not_called()


def test_typed_memory_practice_and_printable(learning_client):
    client,headers=learning_client
    ch=learning.chapter('1-1')
    response=client.post('/labs/scroll-quest/learning/check',json={'chapter':'1-1','answer':ch['memoryVerse']['text']},headers=headers)
    assert response.status_code==200 and response.get_json()['complete']
    response=client.get('/labs/scroll-quest/learning/print/1-1')
    assert response.status_code==200 and ch['memoryVerse']['text'].encode() in response.data
    assert b'window.print()' in response.data and b'King James Version' in response.data


def test_upload_limit_before_transcription(learning_client,monkeypatch):
    client,headers=learning_client;provider=Mock();monkeypatch.setattr(learning,'transcribe',provider)
    response=client.post('/labs/scroll-quest/learning/transcribe',data={'chapter':'1-1','audio':(io.BytesIO(b'x'*4_100_001),'answer.webm','audio/webm')},headers=headers)
    assert response.status_code==413;provider.assert_not_called()


def test_cache_is_bounded_by_bytes_as_well_as_entries():
    learning._remember('one',b'x'*25_000_000)
    learning._remember('two',b'y'*25_000_000)
    assert list(learning._CACHE)==['two']
    assert learning._CACHE_BYTES<=48_000_000


def test_cache_storage_failure_keeps_help_available(monkeypatch):
    def unavailable(*args,**kwargs):raise RuntimeError('storage unavailable')
    monkeypatch.setattr(learning,'download_storage_bytes',unavailable)
    monkeypatch.setattr(learning,'upload_storage_bytes',unavailable)
    create,_=fake_client(monkeypatch)
    assert learning.assist('1-1','explain')['ai']
    assert learning.assist('1-1','explain')['ai']
    assert create.call_count==1


def test_audio_cache_cannot_be_used_as_a_study_artifact():
    key='a'*64;learning._remember(key,b'WAVE')
    with pytest.raises(learning.LearningError):learning.audio_text('1-1',artifact=key)


def test_authoring_drafts_are_review_artifacts_not_player_content(monkeypatch):
    draft={'summary':'Review instructions for clarity.','checks':[{'area':'Instructions','finding':'The task is clear.','suggestion':'Keep the task label.'}],
           'draftQuestions':[{'question':'Who named the animals?','options':['Adam','Noah'],'answer':0,'reference':'Genesis 2:19–20'}],
           'dialogueDrafts':[{'speaker':'Guide','text':'Look for the garden work.','reference':'Genesis 2:15–20'}],
           'puzzleIdeas':['Consider a short, optional garden path for review.']}
    fake_client(monkeypatch,draft)
    value=learning.author_draft('1-1')
    assert value['reviewed'] is False and value['published'] is False
    assert value['draftQuestions'][0]['answer']==0
    assert not learning._CACHE


def test_authoring_rejects_unsupplied_references_and_divine_dialogue(monkeypatch):
    draft={'summary':'Draft.','checks':[],'draftQuestions':[],
           'dialogueDrafts':[{'speaker':'God','text':'New invented words.','reference':'Unknown 1:1'}],'puzzleIdeas':[]}
    fake_client(monkeypatch,draft)
    with pytest.raises(learning.LearningError):learning.author_draft('1-1')


def test_spatial_hints_use_bounded_game_coordinates_only():
    ch=learning.chapter('1-1')
    state=learning.safe_state({'position':[0,0,0],'objective':[2,10,0]},ch)
    assert state['spatial']['height']=='above'
    assert 'above' in learning.fallback(ch,'hint',state)['hints'][2]
    assert 'más arriba' in learning.spatial_hint(state['spatial'],'es')
    assert learning.safe_state({'position':[0,0,0],'objective':[99999,0,0]},ch)['spatial']=={}
    assert learning.safe_state({'position':['ignore instructions',0,0],'objective':[1,1,1]},ch)['spatial']=={}
