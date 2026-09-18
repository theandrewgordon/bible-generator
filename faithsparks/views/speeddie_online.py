"""Private room API. Cookie CSRF + per-device bearer credentials; no public state."""
import copy
import os
import re
import secrets
import shutil
import time
from flask import Blueprint, current_app, jsonify, request, session
from faithsparks.services.speeddie_rooms import (
    RoomError, SQLiteRooms, FirestoreRooms, live, member, public_room, run_engine, token_hash,
)

def create_blueprint(csrf_token=None):
    bp = Blueprint("speeddie_online", __name__, url_prefix="/speeddie/api")
    def csrf():
        if csrf_token:
            return csrf_token()
        if not session.get("_csrf_token"):
            session["_csrf_token"] = secrets.token_urlsafe(32)
        return session["_csrf_token"]
    def store():
        configured = current_app.config.get("SPEEDDIE_ROOM_STORE")
        if configured:
            return configured
        return FirestoreRooms()
    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise RoomError("Send a JSON object.")
        return data
    def token():
        value = request.headers.get("Authorization", "")
        if not value.startswith("Bearer ") or len(value) > 200:
            raise RoomError("Rejoin this room on your device.",403)
        return value[7:]
    def code_ok(code):
        if not re.fullmatch(r"[A-Z2-9]{8}", code):
            raise RoomError("Enter the eight-character room code.")
    def limit(scope, maximum):
        key = "rate-" + token_hash(f"{scope}:{request.remote_addr}:{int(time.time())//3600}")
        def bump(value):
            value = value or {"count":0, "expires":time.time()+7200}
            if value["count"] >= maximum:
                raise RoomError("Too many requests. Please try again later.",429)
            value["count"] += 1
            return value
        store().change(key,bump)
    @bp.before_request
    def protect():
        if request.content_length and request.content_length > 900_000:
            raise RoomError("Request is too large.",413)
        if request.method == "POST":
            origin=request.headers.get("Origin")
            if origin and origin.rstrip('/') != request.host_url.rstrip('/'):
                raise RoomError("Use this site's game page.",403)
            if not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""),csrf()):
                raise RoomError("Reload the game connection and retry.",403)
    @bp.after_request
    def private(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Vary"] = "Authorization, Cookie"
        return response
    @bp.errorhandler(RoomError)
    def failure(error):
        return jsonify(error=str(error)),error.status
    @bp.errorhandler(Exception)
    def unavailable(error):
        current_app.logger.exception("Speed Die room request failed")
        return jsonify(error="Online service is unavailable. Your saved game is unchanged. Retry shortly."),503
    @bp.get('/config')
    def config():
        csrf_value=csrf()
        try:
            store()
            available=bool(shutil.which(os.getenv('SPEEDDIE_NODE_BIN','node')))
        except RoomError:
            available=False
        return jsonify(available=available,csrf=csrf_value)
    @bp.post('/rooms')
    def create():
        limit('create',20)
        data=body()
        if not isinstance(data.get('state'),dict):
            raise RoomError('Choose a game to host.')
        state=run_engine(data['state'],operation='create')
        credential=secrets.token_urlsafe(32)
        code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        host=dict(id=secrets.token_hex(8),name='Host device',host=True,status='approved',seats=[p['id'] for p in state['players'] if not p['bankrupt']])
        room=dict(code=code,revision=1,state=state,members={token_hash(credential):host},receipts=[],expires=time.time()+7*86400,closed=False,
                  lobby=state.get('phase')=='ready' and all(p['position']==0 for p in state['players']) and not (state.get('history') or state.get('ledger') or state.get('roll')),ready=[])
        def insert(existing):
            if existing:
                raise RoomError('Please try creating the room again.',409)
            return room
        store().change(code,insert)
        return jsonify(token=credential,room=public_room(room,credential)),201
    @bp.post('/rooms/<code>/join')
    def join(code):
        code_ok(code);limit('join',60);data=body()
        name=data.get('name','')
        if not isinstance(name,str) or not 1<=len(name.strip())<=24:
            raise RoomError('Enter your name (up to 24 characters).')
        credential=secrets.token_urlsafe(32)
        person=dict(id=secrets.token_hex(8),name=name.strip(),host=False,status='pending',seats=[])
        def request_join(room):
            live(room)
            if room.get('closed'):
                raise RoomError('The host closed this room.',410)
            if len(room['members'])>=24:
                raise RoomError('This room has reached its device limit.')
            room['members'][token_hash(credential)]=person;room['revision']+=1
            return room
        room=store().change(code,request_join)
        return jsonify(token=credential,room=public_room(room,credential)),201
    @bp.get('/rooms/<code>')
    def get(code):
        code_ok(code);return jsonify(room=public_room(store().get(code),token()))
    @bp.post('/rooms/<code>/members')
    def assign(code):
        code_ok(code);auth=token();data=body()
        def update(room):
            host=member(room,auth)
            if not host['host'] or room.get('closed'):
                raise RoomError('Only the host can assign seats in an open room.',403)
            target=next((m for m in room['members'].values() if m['id']==data.get('member')),None)
            ids=data.get('seats',[])
            valid=[p['id'] for p in room['state']['players'] if not p['bankrupt']]
            if not target or not isinstance(ids,list) or len(set(ids))!=len(ids) or any(i not in valid for i in ids):
                raise RoomError('Choose valid player seats.')
            # Seats released by a device return to the host; all approved transfers
            # are explicit host decisions, and old devices lose permission immediately.
            host['seats']=list(set(host['seats']+target['seats']))
            for m in room['members'].values():
                m['seats']=[i for i in m['seats'] if i not in ids]
            target['seats']=ids;target['status']='approved' if ids or target['host'] else 'rejected'
            host['seats']=[i for i in valid if not any(i in m['seats'] for m in room['members'].values() if not m['host'] and m['status']=='approved')]
            room['ready']=[]
            room['revision']+=1
            return room
        room=store().change(code,update)
        return jsonify(room=public_room(room,auth))
    @bp.post('/rooms/<code>/lobby')
    def lobby(code):
        code_ok(code);auth=token();data=body()
        def update(room):
            who=member(room,auth)
            if who['status']!='approved' or room.get('closed') or not room.get('lobby'):
                raise RoomError('The lobby is not available to this device.',403)
            action=data.get('action');players=room['state']['players']
            if action=='start':
                if not who['host']:
                    raise RoomError('Only the host can start the game.',403)
                if not all(p['id'] in room.get('ready',[]) for p in players):
                    raise RoomError('Every player needs to be ready first.')
                room['lobby']=False
            elif action=='ready':
                ids=data.get('players',[])
                if not isinstance(ids,list) or not ids or any(i not in who['seats'] for i in ids):
                    raise RoomError('Choose your own players.')
                room['ready']=list(set(room.get('ready',[])+ids))
            elif action in ('profile','add'):
                if action=='add':
                    if len(players)>=8:
                        raise RoomError('A game supports up to eight players.')
                    player=dict(id=secrets.token_hex(16),name='',token='',color='#397bb5',
                        cash=room['state']['rules']['startingCash'],bankrupt=False,position=0,
                        passedGo=room['state']['activation']=='immediate',inJail=False,
                        jailAttempts=0,consecutiveDoubles=0)
                else:
                    player=next((p for p in players if p['id']==data.get('player')),None)
                    if not player or player['id'] not in who['seats']:
                        raise RoomError('You can edit only your own players.',403)
                name=data.get('name');color=data.get('color');picture=data.get('token')
                if not isinstance(name,str) or not 1<=len(name.strip())<=24:
                    raise RoomError('Enter a player name (up to 24 characters).')
                if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color):
                    raise RoomError('Choose a player color.')
                if not isinstance(picture,str) or not (len(picture)<20 or len(picture)<60000 and re.fullmatch(r'data:image/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+',picture)):
                    raise RoomError('Choose a token or a smaller token picture.')
                player.update(name=name.strip(),color=color,token=picture)
                if action=='add':
                    players.append(player);who['seats'].append(player['id'])
                room['ready']=[i for i in room.get('ready',[]) if i!=player['id']]
            else:
                raise RoomError('Unknown lobby action.')
            room['revision']+=1
            return room
        room=store().change(code,update)
        return jsonify(room=public_room(room,auth))
    @bp.post('/rooms/<code>/actions')
    def action(code):
        code_ok(code);auth=token();data=body();room=live(store().get(code));who=member(room,auth)
        key=data.get('id','')
        if not isinstance(key,str) or not re.fullmatch(r'[\w-]{8,100}',key):
            raise RoomError('Action ID is missing.')
        receipt=who['id']+':'+key
        if receipt in room['receipts']:
            return jsonify(room=public_room(room,auth))
        if who['status']!='approved' or room.get('closed') or room.get('lobby'):
            raise RoomError('This device cannot act in this room.',403)
        if type(data.get('revision')) is not int or data['revision']!=room['revision']:
            raise RoomError('The game changed. Refresh and choose your action again.',409)
        if not isinstance(data.get('action'),str) or not isinstance(data.get('args',{}),dict):
            raise RoomError('Invalid action.')
        next_state=run_engine(room['state'],action=data['action'],args=data.get('args',{}),seats=who['seats'])
        def commit(latest):
            actor=member(latest,auth)
            if receipt in latest['receipts']:
                return latest
            if latest.get('closed') or latest['revision']!=data['revision'] or actor['seats']!=who['seats']:
                raise RoomError('The game changed. Refresh and choose your action again.',409)
            latest['state']=next_state;latest['revision']+=1
            latest['receipts']=(latest['receipts']+[receipt])[-200:]
            latest['expires']=time.time()+7*86400
            return latest
        room=store().change(code,commit)
        return jsonify(room=public_room(room,auth))
    @bp.get('/rooms/<code>/backup')
    def backup(code):
        code_ok(code);room=live(store().get(code));who=member(room,token())
        if not who['host']:
            raise RoomError('Only the host can download the full backup.',403)
        return jsonify(state=room['state'])
    @bp.post('/rooms/<code>/close')
    def close(code):
        code_ok(code);auth=token()
        def update(room):
            if not member(room,auth)['host']:
                raise RoomError('Only the host can close a room.',403)
            room['closed']=True;room['revision']+=1;return room
        room=store().change(code,update)
        return jsonify(room=public_room(room,auth))
    return bp
