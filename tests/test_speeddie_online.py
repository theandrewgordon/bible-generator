import copy
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from speeddie.dev_server import make_app
from faithsparks.services.speeddie_rooms import SQLiteRooms, run_engine

ROOT=Path(__file__).resolve().parents[1]
@pytest.fixture
def env(tmp_path):
    app=make_app(str(tmp_path/'rooms.sqlite'));app.config.update(TESTING=True)
    client=app.test_client();csrf=client.get('/speeddie/api/config').json['csrf']
    state=json.loads(subprocess.check_output(['node','tests/speeddie_fixture.cjs'],cwd=ROOT))
    def post(path,data,token=None):
        return client.post('/speeddie/api'+path,json=data,headers={'X-CSRF-Token':csrf,**({'Authorization':'Bearer '+token} if token else {})})
    created=post('/rooms',{'state':state});assert created.status_code==201,created.json
    code=created.json['room']['code'];host=created.json['token']
    post('/rooms/'+code+'/lobby',{'action':'ready','players':[p['id'] for p in state['players']]},host)
    post('/rooms/'+code+'/lobby',{'action':'start'},host)
    return app,client,post,code,host,state

def get(client,code,token):return client.get('/speeddie/api/rooms/'+code,headers={'Authorization':'Bearer '+token})
def cmd(post,code,token,room,action,args=None,id='command-0001'):
    return post('/rooms/'+code+'/actions',{'revision':room['revision'],'id':id,'action':action,'args':args or {}},token)
def join(env):
    app,client,post,code,host,_=env
    guest=post('/rooms/'+code+'/join',{'name':'Mom'}).json
    r=post('/rooms/'+code+'/members',{'member':guest['room']['me']['id'],'seats':['p1']},host)
    assert r.status_code==200,r.json
    return guest['token']

def test_private_approval_and_hidden_decks(env):
    app,client,post,code,host,_=env
    assert get(client,code,'wrong').status_code==403
    guest=post('/rooms/'+code+'/join',{'name':'Mom'}).json
    assert 'state' not in guest['room']
    token=join(env);room=get(client,code,token).json['room']
    assert 'decks' not in room['state'] and 'undoStack' not in room['state']
    assert room['me']['seats']==['p1']
    assert all('token' not in m for m in room['members'])
    assert cmd(post,code,token,room,'roll').status_code==400
    assert get(client,code,host).json['room']['state']['roll'] is None

def test_turn_commands_idempotency_and_revision(env):
    _,client,post,code,host,_=env
    room=get(client,code,host).json['room'];payload={'revision':room['revision'],'id':'same-action','action':'roll','args':{}}
    first=post('/rooms/'+code+'/actions',payload,host);assert first.status_code==200
    again=post('/rooms/'+code+'/actions',payload,host);assert again.json['room']['state']==first.json['room']['state']
    payload['id']='other-action';assert post('/rooms/'+code+'/actions',payload,host).status_code==409

def test_simultaneous_actions_only_one_commits(env):
    app,client,post,code,host,_=env
    revision=get(client,code,host).json['room']['revision']
    def send(i):
        with app.test_client() as c:
            csrf=c.get('/speeddie/api/config').json['csrf']
            return c.post('/speeddie/api/rooms/'+code+'/actions',json={'revision':revision,'id':f'parallel-{i}','action':'roll','args':{}},headers={'X-CSRF-Token':csrf,'Authorization':'Bearer '+host}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(send,[1,2]))
    assert sorted(results)==[200,409]
    assert get(client,code,host).json['room']['revision']==revision+1

def test_host_reassigns_mixed_seats_and_revokes_old_device(env):
    _,client,post,code,host,_=env
    token=join(env);room=get(client,code,host).json['room'];assert room['me']['seats']==['p0','p2']
    host_id=room['me']['id']
    assigned=post('/rooms/'+code+'/members',{'member':host_id,'seats':['p1']},host)
    assert assigned.status_code==200
    assert sorted(assigned.json['room']['me']['seats'])==['p0','p1','p2']
    guest=get(client,code,token).json['room'];assert guest['me']['seats']==[]
    assert cmd(post,code,token,guest,'roll').status_code==400

def test_trade_requires_other_players_consent(env):
    _,client,post,code,host,_=env;guest=join(env)
    room=get(client,code,host).json['room'];proposal=cmd(post,code,host,room,'trade-propose',{'a':'p0','b':'p1','fromA':[],'fromB':[],'cashA':100,'cashB':0})
    assert proposal.status_code==200,proposal.json
    room=proposal.json['room'];assert cmd(post,code,host,room,'trade-accept',id='accept-by-host').status_code==400
    accepted=cmd(post,code,guest,room,'trade-accept',id='accept-by-mom');assert accepted.status_code==200
    assert [p['cash'] for p in accepted.json['room']['state']['players']][:2]==[2400,2600]

def test_auction_seat_and_insufficient_bid(env):
    app,client,post,code,host,_=env;guest=join(env)
    store=app.config['SPEEDDIE_ROOM_STORE']
    def land(room):room['state']['players'][0]['position']=1;room['state']['phase']='landed';return room
    store.change(code,land)
    room=get(client,code,host).json['room'];room=cmd(post,code,host,room,'auction-start',{'index':1}).json['room']
    assert cmd(post,code,guest,room,'auction-bid',{'amount':10},'wrong-bidder').status_code==400
    room=cmd(post,code,host,room,'auction-bid',{'amount':10},'first-bid').json['room']
    assert cmd(post,code,guest,room,'auction-bid',{'amount':9999},'too-expensive').status_code==400
    room=cmd(post,code,guest,room,'auction-pass',id='mom-passes').json['room']
    room=cmd(post,code,host,room,'auction-pass',id='dad-passes').json['room']
    assert room['state']['spaces'][1]['owner']=='p0' and room['state']['players'][0]['cash']==2490

def test_durable_reconnect_backup_close_and_expiry(env):
    app,client,post,code,host,_=env;guest=join(env)
    another=make_app(app.config['SPEEDDIE_ROOM_STORE'].path).test_client()
    assert get(another,code,guest).json['room']['me']['seats']==['p1']
    assert client.get('/speeddie/api/rooms/'+code+'/backup',headers={'Authorization':'Bearer '+guest}).status_code==403
    backup=client.get('/speeddie/api/rooms/'+code+'/backup',headers={'Authorization':'Bearer '+host});assert len(backup.json['state']['decks']['chance'])==16
    assert post('/rooms/'+code+'/close',{},guest).status_code==403
    room=post('/rooms/'+code+'/close',{},host).json['room'];assert room['closed']
    assert cmd(post,code,host,room,'roll').status_code==403
    app.config['SPEEDDIE_ROOM_STORE'].change(code,lambda r:dict(r,expires=time.time()-1))
    assert get(client,code,host).status_code==404

def test_csrf_origin_and_invalid_payloads(env):
    _,client,post,code,host,state=env
    assert client.post('/speeddie/api/rooms',json={'state':state}).status_code==403
    csrf=client.get('/speeddie/api/config').json['csrf']
    assert client.post('/speeddie/api/rooms',json={'state':state},headers={'X-CSRF-Token':csrf,'Origin':'https://other.example'}).status_code==403
    assert post('/rooms',{'state':{}}).status_code==400
    assert post('/rooms/ABCDEFGH/join',{'name':'Mom'}).status_code==404
    assert get(client,code,host).headers['Cache-Control']=='no-store'

def test_engine_never_accepts_client_state_or_randomness(env):
    _,client,post,code,host,state=env;room=get(client,code,host).json['room']
    result=cmd(post,code,host,room,'roll',{'state':dict(state,players=[]),'d1':99,'d2':99})
    assert result.status_code==200
    assert 1<=result.json['room']['state']['roll']['d1']<=6
    assert len(result.json['room']['state']['players'])==3

def test_lobby_profiles_readiness_permissions_and_start(env):
    app,client,post,old,host,state=env
    created=post('/rooms',{'state':state}).json;code=created['room']['code'];host=created['token']
    assert created['room']['lobby']
    assert cmd(post,code,host,created['room'],'roll').status_code==403
    guest=post('/rooms/'+code+'/join',{'name':'Mom phone'}).json;token=guest['token']
    path='/rooms/'+code+'/lobby'
    profile={'action':'profile','player':'p1','name':'Mama','color':'#123abc','token':'🐎'}
    assert post(path,profile,token).status_code==403
    post('/rooms/'+code+'/members',{'member':guest['room']['me']['id'],'seats':['p1']},host)
    assert post(path,dict(profile,player='p0'),token).status_code==403
    assert post(path,dict(profile,token='data:image/svg+xml;base64,'+'A'*40),token).status_code==400
    assert post(path,profile,token).json['room']['state']['players'][1]['name']=='Mama'
    post(path,{'action':'ready','players':['p1']},token)
    assert 'p1' not in post(path,profile,token).json['room']['ready']
    assert post(path,{'action':'start'},host).status_code==400
    added=post(path,dict(profile,action='add',name='Tessa Junior'),token).json['room']
    new_id=added['state']['players'][-1]['id'];assert new_id in added['me']['seats']
    post(path,{'action':'ready','players':['p1',new_id]},token)
    post(path,{'action':'ready','players':['p0','p2']},host)
    assert post(path,{'action':'start'},token).status_code==403
    assert not post(path,{'action':'start'},host).json['room']['lobby']
    assert post(path,profile,token).status_code==403
    assert get(client,code,token).json['room']['state']['players'][1]['token']=='🐎'

def test_lobby_eight_player_limit_and_seat_transfer_resets_ready(env):
    _,client,post,_,_,state=env
    result=post('/rooms',{'state':state}).json;code=result['room']['code'];host=result['token'];path='/rooms/'+code+'/lobby'
    for n in range(5):
        assert post(path,{'action':'add','name':f'Extra {n}','color':'#123456','token':'🐕'},host).status_code==200
    assert post(path,{'action':'add','name':'Ninth','color':'#123456','token':'🐕'},host).status_code==400
    post(path,{'action':'ready','players':['p0']},host)
    guest=post('/rooms/'+code+'/join',{'name':'Mom'}).json
    room=post('/rooms/'+code+'/members',{'member':guest['room']['me']['id'],'seats':['p0']},host).json['room']
    assert room['ready']==[]

def test_pause_reactions_and_bedtime_finish(env):
    app,client,post,code,host,state=env
    room=post('/rooms/'+code+'/family',{'action':'pause'},host).json['room']
    assert room['pausedAt']
    assert cmd(post,code,host,room,'roll').status_code==403
    assert post('/rooms/'+code+'/family',{'action':'resume'},host).json['room']['pausedAt'] is None
    assert post('/rooms/'+code+'/family',{'action':'reaction','emoji':'👏'},host).status_code==200
    assert post('/rooms/'+code+'/family',{'action':'reaction','emoji':'👏'},host).status_code==429
    created=post('/rooms',{'state':state}).json;code=created['room']['code'];host=created['token'];path='/rooms/'+code+'/lobby'
    assert post(path,{'action':'bedtime','minutes':1},host).status_code==400
    post(path,{'action':'ready','players':['p0','p1','p2']},host)
    assert post(path,{'action':'bedtime','minutes':30},host).json['room']['ready']==[]
    post(path,{'action':'ready','players':['p0','p1','p2']},host)
    started=post(path,{'action':'start'},host).json['room'];assert started['deadline']>time.time()+1700
    store=app.config['SPEEDDIE_ROOM_STORE']
    store.change(code,lambda r:dict(r,deadline=time.time()-10,pausedAt=time.time()-20))
    assert get(client,code,host).json['room']['result'] is None
    resumed=post('/rooms/'+code+'/family',{'action':'resume'},host).json['room'];assert resumed['deadline']>time.time()
    def expired(r):
        r['deadline']=time.time()-1;r['state']['players'][0]['cash']=3000;return r
    store.change(code,expired)
    result=get(client,code,host).json['room'];assert result['result']['winners']==['p0']
    assert cmd(post,code,host,result,'roll').status_code==403

def test_bedtime_scoring_and_safe_boundary():
    from faithsparks.services.speeddie_family import finish_due
    state=json.loads(subprocess.check_output(['node','tests/speeddie_fixture.cjs'],cwd=ROOT))
    state['spaces'][1].update(owner='p0',mortgaged=False,buildingCosts=[50,50])
    state['spaces'][3].update(owner='p0',mortgaged=True)
    state['players'][1]['cash']=2580
    room=dict(state=state,revision=1,deadline=1)
    state['players'][0]['consecutiveDoubles']=1
    assert 'result' not in finish_due(room,2)
    state['players'][0]['consecutiveDoubles']=0
    state['debts']=[{'from':'p0'}];assert 'result' not in finish_due(room,2)
    state['debts']=[];finish_due(room,2)
    assert room['result']['winners']==['p0','p1']
    assert room['result']['scores'][0]['score']==2580

def test_empty_setup_room_code_before_names_and_self_service_join(env):
    _,client,post,_,_,state=env
    created=post('/rooms',{'state':state,'draft':True});assert created.status_code==201,created.json
    code=created.json['room']['code'];host=created.json['token'];room=created.json['room']
    assert room['lobby'] and room['state']['players']==[] and not room['state']['started']
    path='/rooms/'+code+'/lobby'
    assert post(path,{'action':'start'},host).status_code==400
    guest=post('/rooms/'+code+'/join',{'name':'Tessa'}).json;token=guest['token']
    assert guest['room']['me']['status']=='approved' and guest['room']['me']['seats']==[]
    profile={'action':'add','name':'Tessa','token':'🐎','color':'#123456'}
    guest_room=post(path,profile,token).json['room'];guest_id=guest_room['me']['seats'][0]
    assert len(guest_room['state']['players'])==1 and not guest_room['state']['winnerId']
    assert post(path,{'action':'start'},host).status_code==400
    host_room=post(path,dict(profile,name='Dad'),host).json['room'];host_id=host_room['me']['seats'][0]
    settings={'action':'settings','name':'Family night','mode':'classic','activation':'after-go','parking':'official','leaveUnowned':False}
    assert post(path,settings,token).status_code==403
    post(path,{'action':'ready','players':[guest_id]},token)
    assert post(path,settings,host).json['room']['ready']==[]
    post(path,{'action':'ready','players':[guest_id]},token)
    post(path,{'action':'ready','players':[host_id]},host)
    started=post(path,{'action':'start'},host);assert started.status_code==200,started.json
    room=started.json['room'];assert room['state']['started'] and not room['lobby']
    assert room['state']['gameName']=='Family night'
    assert cmd(post,code,token,room,'roll').status_code==200
    late=post('/rooms/'+code+'/join',{'name':'Late device'}).json
    assert late['room']['me']['status']=='pending'
