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
