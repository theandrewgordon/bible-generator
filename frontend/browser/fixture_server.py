"""Render real page templates with test data; never import the production app."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime
from jinja2 import ChoiceLoader, DictLoader, Environment, FileSystemLoader

ROOT = Path(__file__).resolve().parents[2]
BASE = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="fixture-token"><link rel="stylesheet" href="/static/theme.css">{% block head_extra %}{% endblock %}</head><body><main style="padding:24px;max-width:1200px;margin:auto">{% block content %}{% endblock %}</main>{% block extra_scripts %}{% endblock %}</body></html>'''

def render(destination):
    env = Environment(loader=ChoiceLoader([DictLoader({'base.html': BASE}), FileSystemLoader(ROOT / 'templates')]), autoescape=True)
    def url(endpoint, **kwargs):
        return '/static/' + kwargs['filename'] if endpoint == 'static' else '/__api/' + endpoint
    common = dict(url_for=url, csrf_token=lambda: 'fixture-token', static_v='browser-test')
    def page(name, template, **context):
        (destination / (name + '.html')).write_text(env.get_template(template).render(**common, **context), encoding='utf-8')
    song = dict(id='song1', title='Grace', type='song', artist='Fixture', version='WEB', key='C', parts={'verse1':['First line','Second line'],'chorus':['Grace and peace']}, arrangement=['verse1','chorus','verse1'], slide_breaks={'verse1':[1]}, validation={}, sources={}, review={}, last_used='')
    page('song', 'worship_edit.html', song=song, backgrounds=[])
    page('games', 'games_create.html', form_state={'game_type':'word-search','references':'John 3:16','game_words':'Faith\nGrace','difficulty':'standard'}, scripture_versions=[{'id':'web','code':'WEB'},{'id':'kjv','code':'KJV'}], match_topics=[], story_topics=[])
    page('history', 'history.html', history=[dict(verse=verse, filename=f'file{i}.pdf', version='WEB', timestamp=datetime(2026,1,1,12,i),favorite=False,cursive=False) for i,verse in enumerate(['John 3:16','Psalm 23','Romans 8','Luke 2','Acts 2','Psalm 1'])],email='fixture@example.test')
    page('worship', 'worship.html', songs=[song],library_songs_js=[song],setlists=[dict(id='other',name='Other service',date='2026-01-01',updated_at='v1',songs=['song1'],notes={},song_count=1)],worship_church={'id':'fixture','name':'Fixture church','role':'owner'},worship_churches=[],worship_church_members=[],session={},request={'path':'/worship'},legal_acceptance_current=True)
    page('upload','worship_presentation_import.html',presentation_capabilities={'pdf':True,'pptx':False},presentation_max_bytes=25*1024*1024)
    slides=[dict(kind='lyric',part_label='Verse 1',title='Grace',lines=['First lyric']),dict(kind='lyric',part_label='Chorus',title='Grace',lines=['Second lyric'])]
    page('follow','worship_live_follow.html',session_id='fixture',slides=slides,live=dict(name='Fixture service',current_index=0,blank=False,clear_words=False,revision=1,deck_revision=1))
    remote_slides=[dict(kind='lyric',id='song1',title='Grace',part='verse1' if i<2 else 'chorus',part_label='Verse 1' if i<2 else 'Chorus',lines=[f'Remote lyric {i+1}']) for i in range(4)]
    live=dict(name='Fixture service',current_index=0,blank=False,clear_words=False,revision=1,deck_revision=1)
    page('remote','worship_live_remote.html',session_id='fixture',slides=remote_slides,live=live,follow_url='/follow.html')
    page('setup','worship_live_setup.html',session_id='fixture',live=live,links={'view':'/follow.html','control':'/remote.html','stage':'/follow.html'},follow_url='/follow.html')
    (destination / 'static').symlink_to(ROOT / 'static', target_is_directory=True)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_POST(self):
        # Native submits cannot reach a real user account from this fixture server.
        self.send_error(405, 'Browser tests must intercept mutation requests')

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=5197)
    args=parser.parse_args()
    with TemporaryDirectory(prefix='faithsparks-browser-') as directory:
        render(Path(directory))
        server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=directory))
        try: server.serve_forever()
        except KeyboardInterrupt: pass
        finally: server.server_close()
