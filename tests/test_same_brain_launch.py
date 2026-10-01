"""Behavioral route tests with isolated storage; never connect to production."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from flask import Flask
import pytest
from faithsparks.views import public, lab_games

class Snapshot:
    def __init__(self, ref):
        self.id = ref.key[1]
        self.exists = ref.key in ref.store
        self.data = deepcopy(ref.store.get(ref.key, {}))
    def to_dict(self): return self.data

class Ref:
    def __init__(self, store, key): self.store, self.key = store, key
    def get(self, **kwargs): return Snapshot(self)
    def set(self, value, merge=False):
        def combine(target, source):
            for k, v in source.items():
                if isinstance(v, dict): combine(target.setdefault(k, {}), v)
                elif hasattr(v, 'value'): target[k] = target.get(k, 0) + v.value
                else: target[k] = deepcopy(v)
        if not merge: self.store[self.key] = {}
        combine(self.store.setdefault(self.key, {}), value)
    def create(self, value):
        assert self.key not in self.store
        self.set(value)
    def update(self, value): self.set(value, merge=True)

class Collection:
    def __init__(self, store, name): self.store, self.name = store, name
    def document(self, code): return Ref(self.store, (self.name, code))
    def limit(self, count): return self
    def stream(self): return [Snapshot(self.document(k[1])) for k in self.store if k[0] == self.name]

class Store:
    def __init__(self): self.rows = {}
    def collection(self, name): return Collection(self.rows, name)
    def transaction(self): return SimpleNamespace(update=lambda ref, data: ref.update(data), set=lambda ref,data,**kw: ref.set(data,**kw), create=lambda ref,data: ref.create(data))

@pytest.fixture
def game(monkeypatch):
    store = Store()
    monkeypatch.setattr(public, 'db', store)
    monkeypatch.setattr(lab_games, 'db', lambda: store)
    monkeypatch.setattr(public.firestore, 'transactional', lambda fn: fn)
    monkeypatch.setattr(lab_games.cloud_firestore, 'transactional', lambda fn: fn)
    monkeypatch.setattr(public, 'check_rate_limit', lambda *a, **k: SimpleNamespace(allowed=True))
    app = Flask(__name__)
    app.secret_key = 'isolated-test'
    app.register_blueprint(public.bp)
    app.register_blueprint(lab_games.bp)
    app.testing = True
    return app, store

def player(app):
    c = app.test_client()
    c.get('/same-brain')
    with c.session_transaction() as sess: token = sess['_csrf_token']
    return c, {'X-CSRF-Token': token}

QIDS = ['food', 'power', 'trip', 'animal', 'weather']

def test_together_private_sync_retries_expiry_and_third_player(game):
    app, store = game
    a, ah = player(app); b, bh = player(app); c, ch = player(app)
    created = a.post('/same-brain/together', headers=ah, json={'questionIds': QIDS, 'audience': 'kids'})
    assert created.status_code == 201
    code = created.json['code']; root = '/same-brain/together/' + code
    assert b.get(root).json['questionIds'] == QIDS
    assert b.get(root).json['audience'] == 'kids'
    def answer(client, headers, pid, answers):
        return client.post(root+'/answer', headers=headers, json={'name': pid, 'playerId': pid, 'answers': answers})
    first = answer(a, ah, 'player_one', [0]*5)
    assert first.json['ready'] is False and 'players' not in first.json
    assert b.get(root+'/result?playerId=player_two').status_code == 403
    assert answer(b, bh, 'player_two', [0,1,0,1,0]).json['score'] == 60
    result = a.get(root+'/result?playerId=player_one').json
    assert result == b.get(root+'/result?playerId=player_two').json
    assert answer(a, ah, 'player_one', [3]*5).json == result
    rematch_body={'playerId':'player_one','questionIds':list(reversed(QIDS))}
    next_code=a.post(root+'/rematch',headers=ah,json=rematch_body).json['code']
    assert b.post(root+'/rematch',headers=bh,json={**rematch_body,'playerId':'player_two'}).json['code']==next_code
    assert a.get(root+'/result?playerId=player_one').json['rematchCode']==next_code
    assert b.get('/same-brain/together/'+next_code).json['questionIds']==list(reversed(QIDS))
    assert c.post(root+'/rematch',headers=ch,json={**rematch_body,'playerId':'outsider'}).status_code==403
    assert answer(c, ch, 'player_three', [1]*5).status_code == 409
    assert answer(c, ch, 'bad_float', [0.5]*5).status_code == 400
    store.rows[(public.SAME_BRAIN_TOGETHER_COLLECTION, code)]['expiresAt'] = datetime.now(timezone.utc)-timedelta(days=1)
    assert a.get(root+'/result?playerId=player_one').status_code == 410
    assert answer(a, ah, 'player_one', [0]*5).status_code == 410

def test_public_group_participant_recovery_capacity_and_age(game):
    app, store = game
    host, headers = player(app)
    created = host.post('/same-brain/group', headers=headers, json={'name':'Host','questionIds':QIDS,'answers':[0]*5,'audience':'mixed'})
    assert created.status_code == 201
    code, key = created.json['code'], created.json['resultKey']; root='/same-brain/group/'+code
    assert host.get(root).json['audience'] == 'mixed'
    assert 'players' not in host.get(root).json
    assert host.get(root+'/results?key=wrong').status_code == 403
    for i in range(7):
        c, h = player(app); pkey=f'participant_key_{i:02d}'
        body={'name':f'P{i}','questionIds':QIDS,'answers':[i%4]*5,'playerKey':pkey}
        response=c.post(root+'/join',headers=h,json=body)
        assert response.status_code == 200
        assert len(c.post(root+'/join',headers=h,json=body).json['players']) == i+2
        assert c.get(root+'/results?key='+pkey).status_code == 200
    assert len(host.get(root+'/results?key='+key).json['players']) == 8
    assert c.post(root+'/join',headers=h,json={**body,'name':'Ninth','playerKey':'ninth_participant_key'}).status_code == 409
    store.rows[(lab_games.SAME_BRAIN_GROUP_COLLECTION,code)]['expiresAt']=datetime.now(timezone.utc)-timedelta(days=1)
    assert host.get(root+'/results?key='+key).status_code == 410
    assert c.post(root+'/join',headers=h,json=body).status_code == 410

def test_metrics_match_runs_and_labs_storage_is_callable(game):
    app, store = game; c, h = player(app)
    for run, events in [('finished',['home_view','return_visit','start','challenge_created','challenge_shared','creator_result_opened']),('unfinished',['home_view','start']),('friend',['challenge_opened','challenge_accepted','result_completed','response_submitted','rematch_requested'])]:
        for event in events:
            assert c.post('/same-brain/analytics',headers=h,json={'event':event,'runId':run}).status_code == 200
    with c.session_transaction() as sess: sess['user_email']='test@example.com'
    rates=c.get('/labs/games/same-brain/metrics?format=json').json['rates']
    assert rates['completionRate']['value'] == 50
    assert rates['returnRate']['value'] == 50
    for key in ['inviteCompletionRate','challengeAcceptanceRate','shareRate','creatorPayoffRate','rematchRate']:
        assert rates[key]['value'] == 100
    response=c.post('/labs/games/same-brain/analytics',headers=h,json={'event':'start','runId':'lab_run'})
    assert response.status_code == 200
    assert ('same_brain_lab_runs','lab_run') in store.rows

def test_tts_cache_keys_text_voice_and_custom_bypass(game, monkeypatch):
    app, store = game; c, h = player(app)
    with c.session_transaction() as sess: sess['user_email']='test@example.com'
    monkeypatch.setenv('OPENAI_API_KEY', 'test-not-a-key')
    monkeypatch.setattr(lab_games, '_same_brain_user_state', lambda email: {'plus':True})
    cache={}; calls=[]
    monkeypatch.setattr(lab_games, 'download_storage_bytes', lambda key: cache.get(key))
    monkeypatch.setattr(lab_games, 'upload_storage_bytes', lambda data,key,**kw: cache.__setitem__(key,data))
    def speak(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(read=lambda:b'fake-mp3')
    monkeypatch.setattr(lab_games, 'OpenAI', lambda **kw: SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speak))))
    payload={'text':'Pick one. A. Tea. B. Coffee.','voice':'marin','questionId':'food','cacheable':True}
    def post(p): return c.post('/labs/games/same-brain/tts',headers=h,json=p)
    assert post(payload).headers['X-TTS-Cache']=='MISS'
    assert post(payload).headers['X-TTS-Cache']=='HIT'
    assert len(calls)==1
    assert post({**payload,'voice':'cedar'}).headers['X-TTS-Cache']=='MISS'
    assert post({**payload,'text':'Changed text'}).headers['X-TTS-Cache']=='MISS'
    assert post({**payload,'questionId':'custom_1'}).headers['X-TTS-Cache']=='BYPASS'
    assert len(cache)==3
    monkeypatch.setattr(lab_games, '_same_brain_user_state', lambda email: {'plus':False})
    assert post(payload).status_code==403

def test_earned_avatar_unlocks_persist_and_rewards_are_idempotent(game,monkeypatch):
    app, store=game; c,h=player(app)
    with c.session_transaction() as sess: sess['user_email']='avatar@example.com'
    ref=store.collection('users').document('avatar@example.com')
    monkeypatch.setattr(lab_games,'get_user_doc',lambda email:ref.get().to_dict())
    for i in range(9):
        payload={'event':'complete','eventId':f'game-{i}'}
        response=c.post('/labs/games/same-brain/points',headers=h,json=payload)
        assert response.json['bits']==(i+1)*10
        assert c.post('/labs/games/same-brain/points',headers=h,json=payload).json['duplicate'] is True
    bought=c.post('/labs/games/same-brain/unlock',headers=h,json={'item':'avatar_owl'})
    assert bought.json['bits']==0 and 'avatar_owl' in bought.json['unlocks']
    assert c.post('/labs/games/same-brain/unlock',headers=h,json={'item':'avatar_owl'}).json['bits']==0
    assert c.post('/labs/games/same-brain/unlock',headers=h,json={'item':'avatar_fox'}).status_code==409
    assert c.post('/labs/games/same-brain/unlock',headers=h,json={'item':'avatar_rainbow'}).status_code==400
    assert 'avatar_owl' in c.get('/labs/games/same-brain/profile').json['unlocks']
