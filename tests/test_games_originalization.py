from pathlib import Path
import re

import pytest
from flask import Flask
from jinja2 import ChoiceLoader, DictLoader
from faithsparks.views import lab_games

ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / 'faithsparks/content/lab_games'
TITLES = {
    'gordon-ice-cream-town': 'Gordon Ice Cream Town',
    'gordon-window-washing': 'Gordon Window Washing',
    'gordon-mail-run': 'Gordon Mail Run',
    'gordon-family-stables': 'Gordon Family Stables',
}

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(lab_games, 'db', None)
    app = Flask(__name__, template_folder=str(ROOT / 'templates'))
    app.secret_key = 'test'
    app.register_blueprint(lab_games.bp)
    # Isolate the game library from unrelated application-wide template globals.
    app.jinja_loader = ChoiceLoader([DictLoader({'base.html': '{% block head_extra %}{% endblock %}{% block content %}{% endblock %}'}), app.jinja_loader])
    client = app.test_client()
    with client.session_transaction() as state:
        state['user_email'] = 'test@example.com'
    return client

@pytest.mark.parametrize('slug,title', TITLES.items())
def test_original_games_and_assets_are_connected(client, slug, title):
    response = client.get('/labs/games/' + slug)
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert title in html
    assert html.index('games-save-migration.js') < html.index('games-core.js')
    for src in re.findall(r'(?:src|href)="(/labs/games/assets/[^\"]+)"', html):
        assert client.get(src).status_code == 200
    assert not re.search(r'odyssey|whittaker|wooton|wooten|bernard|timothy.?center|\bwhit\b', html, re.I)
    # Only the engine's tiny bitmap font may remain; character art is vector.
    assert all(len(data) < 5000 for data in re.findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)',html))


def test_library_links_only_to_current_titles(client):
    html = client.get('/labs/games').get_data(as_text=True)
    assert 'Tessa’s Games' in html
    for slug,title in TITLES.items():
        assert title in html
        assert '/labs/games/' + slug in html
    assert not re.search(r'odyssey|whittaker|wooton|wooten|bernard|timothy.?center|\bwhit\b',html,re.I)


def test_legacy_account_roster_can_be_read_without_changing_player_names(monkeypatch):
    class Snapshot:
        exists = True
        def to_dict(self):
            return {'odysseyRoster': {'players': [{'id':'p1','name':'Bernard'}], 'activePlayerId':'p1'}}
    class Database:
        def collection(self, _): return self
        def document(self, _): return self
        def get(self): return Snapshot()
    monkeypatch.setattr(lab_games, 'db', Database())
    roster = lab_games._load_games_roster('test@example.com')
    assert roster['players'][0]['name'] == 'Bernard'
