"""Serve the verified standalone Scroll Quest bundle under the shared Labs gate."""
from functools import lru_cache
import json
from pathlib import Path

from flask import Blueprint, abort, current_app, make_response, render_template, send_file, url_for

bp = Blueprint('scroll_quest', __name__, url_prefix='/labs/scroll-quest')
BUNDLE = Path(__file__).resolve().parents[1] / 'content' / 'scroll_quest'


@lru_cache(maxsize=1)
def release_manifest():
    return json.loads((BUNDLE / 'release-manifest.json').read_text(encoding='utf-8'))


@bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive, nosnippet'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@bp.get('')
@bp.get('/')
def index():
    return render_template('labs_scroll_quest.html', version=release_manifest()['version'], noindex=True)


@bp.get('/play')
def play():
    return render_template('labs_scroll_quest_play.html')


@bp.get('/account-storage.js')
def account_storage():
    # Capture native Storage lexically before replacing the iframe's localStorage.
    # The shared adapter then retains its account-change checks without recursing.
    runtime = (Path(current_app.static_folder) / 'js' / 'labs-storage-runtime.js').read_text(encoding='utf-8')
    script = r'''(function () {
'use strict';
let nativeStorage;
try { nativeStorage = window.localStorage; }
catch (_) { nativeStorage = {getItem(){return null;},setItem(){throw new Error('Storage is unavailable.');},removeItem(){throw new Error('Storage is unavailable.');}}; }
(function (localStorage) {
''' + runtime + r'''
})(nativeStorage);
const scoped = window.FaithSparksLabsStorage.labsStorage;
const owner = () => document.cookie.match(/(?:^|;\s*)faithsparks_labs_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
const initialOwner = owner();
const active = () => !!initialOwner && owner() === initialOwner;
// Require a matching owner on preview/local hosts too; never expose old-tab saves.
const guarded = {
  get length(){return active() ? scoped.length : 0;},
  key(index){return active() ? scoped.key(index) : null;},
  getItem(key){return active() ? scoped.getItem(key) : null;},
  setItem(key,value){if(!active())throw new Error('Account changed. Reload to continue.');scoped.setItem(key,value);},
  removeItem(key){if(!active())throw new Error('Account changed. Reload to continue.');scoped.removeItem(key);}
};
Object.defineProperty(window, 'localStorage', {configurable:true, value:guarded});
})();
'''
    return current_app.response_class(script, mimetype='text/javascript')


@bp.get('/bundle/<path:filename>')
def bundle_file(filename):
    allowed = {entry['file'] for entry in release_manifest()['files']} | {'release-manifest.json'}
    if filename not in allowed:
        abort(404)
    file = BUNDLE / filename
    if not file.is_file() or not file.resolve().is_relative_to(BUNDLE.resolve()):
        abort(404)
    if file.suffix == '.html':
        # Leave release files and their manifest hashes intact on disk. The only
        # response adaptation installs account-scoped storage before game scripts.
        bootstrap = '<script src="' + url_for('scroll_quest.account_storage') + '"></script>'
        html = file.read_text(encoding='utf-8')
        html=html.replace('<head>', '<head>' + bootstrap, 1)
        bridge='<script src="/static/labs/scroll-quest/bridge.js"></script>'
        html=html.replace('</body>',bridge+'</body>',1)
        response = make_response(html)
        response.mimetype = 'text/html'
        return response
    return send_file(file, conditional=True)


# Learning is optional and never changes tasks, saves, rewards, or the original release files.
def _learning_guard(limit=30):
    import hmac
    from flask import g, request, session, jsonify
    from faithsparks.services.rate_limit import check_rate_limit
    expected=session.get('_csrf_token','')
    token=request.headers.get('X-CSRF-Token','')
    if request.headers.get('Sec-Fetch-Site')=='cross-site' or not expected or not token or not hmac.compare_digest(str(expected),token):
        return jsonify(error='Please reopen Learning together and try again.'),403
    owner=getattr(g,'labs_owner',None)
    if not owner or not hmac.compare_digest(owner,request.headers.get('X-Labs-Owner','')):
        return jsonify(error='Your account changed. Reload the game to continue.'),409
    for scope,seconds,maximum in [('minute',60,limit),('day',86400,200)]:
        bucket='scroll_quest_learning_'+(request.endpoint.rsplit('.',1)[-1]+'_' if scope=='minute' else '')+scope
        result=check_rate_limit(bucket,owner,limit=maximum,window_seconds=seconds,fail_closed=True)
        if not result.allowed:
            response=jsonify(error='Take a short break, then try again. The game still works.')
            response.headers['Retry-After']=str(result.retry_after)
            return response,429
    return None


def _learning_payload(allowed):
    from flask import request
    from faithsparks.services.scroll_quest_learning import LearningError
    if request.content_length is None or request.content_length>12000:
        raise LearningError('That request is too large.')
    payload=request.get_json(silent=True)
    if not isinstance(payload,dict) or set(payload)-set(allowed):
        raise LearningError('Choose a learning option from the game.')
    if not isinstance(payload.get('chapter'),str):
        raise LearningError('Choose a chapter from the game.')
    return payload


@bp.get('/learning/session')
def learning_session():
    import secrets
    from flask import g, jsonify, session
    from faithsparks.services.scroll_quest_learning import catalog, LANGUAGES
    return jsonify(csrf=session.setdefault('_csrf_token',secrets.token_urlsafe(32)),owner=getattr(g,'labs_owner',''),
                   languages=LANGUAGES,chapters=[{'id':ch['id'],'title':ch['title']} for ch in catalog()['chapters'].values()],version=1)


@bp.get('/learning/chapter/<chapter_id>')
def learning_chapter(chapter_id):
    from flask import jsonify
    from faithsparks.services.scroll_quest_learning import chapter, LearningError
    try:return jsonify(chapter(chapter_id))
    except LearningError as exc:return jsonify(error=str(exc)),404


@bp.post('/learning/assist')
def learning_assist():
    from flask import jsonify
    from faithsparks.services.scroll_quest_learning import assist, LearningError
    denied=_learning_guard()
    if denied:return denied
    try:
        payload=_learning_payload({'chapter','mode','age','language','state'})
        if payload.get('mode')=='author':return jsonify(error='Authoring drafts are prepared with the maintainer tool.'),403
        if not all(isinstance(payload.get(k,default),str) for k,default in [('mode',''),('age','family'),('language','en')]):
            raise LearningError('Choose an available learning option.')
        return jsonify(assist(payload['chapter'],payload.get('mode'),payload.get('age','family'),payload.get('language','en'),payload.get('state')))
    except LearningError as exc:return jsonify(error=str(exc)),400


@bp.post('/learning/narrate')
def learning_narrate():
    from flask import jsonify
    from faithsparks.services.scroll_quest_learning import audio_text, narrate, LearningError
    denied=_learning_guard(50)
    if denied:return denied
    try:
        payload=_learning_payload({'chapter','cue','artifact','field','voice'})
        if any(not isinstance(value,str) for value in payload.values()):raise LearningError('Choose an available reading.')
        if bool(payload.get('cue'))==bool(payload.get('artifact')):raise LearningError('Choose one reading.')
        text=audio_text(payload['chapter'],payload.get('cue'),payload.get('artifact'),payload.get('field','body'))
        if payload.get('voice','narrator') not in {'narrator','guide','companion'}:raise LearningError('Choose an available voice.')
    except LearningError as exc:return jsonify(error=str(exc)),400
    try:
        data,hit=narrate(text,payload.get('voice','narrator'))
        response=current_app.response_class(data,mimetype='audio/wav')
        response.headers['X-AI-Voice']='OpenAI'
        response.headers['X-TTS-Cache']='HIT' if hit else 'MISS'
        return response
    except LearningError as exc:return jsonify(error=str(exc)),503


@bp.post('/learning/transcribe')
def learning_transcribe():
    from flask import jsonify, request
    from faithsparks.services.scroll_quest_learning import transcribe, chapter, LANGUAGES, LearningError
    denied=_learning_guard(8)
    if denied:return denied
    if request.content_length is None or request.content_length>4_100_000:
        return jsonify(error='Record a short answer of up to 40 seconds.'),413
    recording=request.files.get('audio')
    try:
        ch=request.form.get('chapter','');chapter(ch)
        language=request.form.get('language','en')
        if not recording or language not in LANGUAGES:raise LearningError('Choose a chapter and record a short answer.')
        raw=recording.stream.read(4_000_001)
        # The bytes live only in this request; no recording or transcript is saved.
        text=transcribe(raw,'answer.'+{'audio/webm':'webm','audio/mp4':'mp4','audio/ogg':'ogg','audio/wav':'wav'}.get(recording.mimetype,'wav'),recording.mimetype,language)
        return jsonify(text=text)
    except LearningError as exc:return jsonify(error=str(exc)),400


@bp.post('/learning/check')
def learning_check():
    from flask import jsonify
    from faithsparks.services.scroll_quest_learning import chapter, compare_verse, LearningError
    denied=_learning_guard(60)
    if denied:return denied
    try:
        payload=_learning_payload({'chapter','answer'})
        if not isinstance(payload.get('answer'),str) or len(payload['answer'])>1800:raise LearningError('Use a short answer.')
        ch=chapter(payload['chapter'])
        return jsonify(compare_verse(ch['memoryVerse']['text'],payload['answer']))
    except LearningError as exc:return jsonify(error=str(exc)),400


@bp.get('/learning/print/<chapter_id>')
def learning_print(chapter_id):
    from flask import request
    from faithsparks.services.scroll_quest_learning import chapter, catalog, _cached, fallback, safe_state, LearningError
    try:ch=chapter(chapter_id)
    except LearningError:abort(404)
    import re
    artifact=request.args.get('artifact','')
    value=_cached(artifact) if re.fullmatch(r'[a-f0-9]{64}',artifact) else None
    if not isinstance(value,dict) or value.get('_chapter')!=chapter_id or value.get('_engine')!=catalog()['engineSha256']:value=fallback(ch,'printable',safe_state({},ch))
    return render_template('scroll_quest_print.html',chapter=ch,study=value)
