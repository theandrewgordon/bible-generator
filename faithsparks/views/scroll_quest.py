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
''' + runtime + '''
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
        response = make_response(html.replace('<head>', '<head>' + bootstrap, 1))
        response.mimetype = 'text/html'
        return response
    return send_file(file, conditional=True)
