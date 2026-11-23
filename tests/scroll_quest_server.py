"""Loopback-only browser fixture. Never imported or enabled by the production app."""
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from werkzeug.serving import make_server

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('OPENAI_API_KEY', 'test-key')
os.environ['SCROLL_QUEST_AI_DISABLED']='1'
import app as website
from flask import g, request, session

website.app.config.update(TESTING=True, SECRET_KEY='scroll-quest-browser-test')
website.google = SimpleNamespace(authorized=True)
website.get_user_doc = lambda email: {'plan': 'family'}
website.has_active_plus = lambda user: request.cookies.get('sq_test_access', 'plus') == 'plus'


def identity():
    email = request.cookies.get('sq_test_account', 'first@example.test')
    website.google.authorized = email != 'signed-out'
    g.flask_dance_google = website.google
    session.update(user_email=email, user_info={'email': email})


if __name__ == '__main__':
    website.app.before_request_funcs[None] = [identity, website.require_labs_access]
    server = make_server('127.0.0.1', 0, website.app, threaded=True)
    print('SCROLL_QUEST_URL=http://127.0.0.1:' + str(server.server_port), flush=True)
    server.serve_forever()
