"""Access, release integrity, nested assets, and account bootstrap for Scroll Quest."""
import hashlib
from types import SimpleNamespace

import pytest
import app as website
from faithsparks.views.scroll_quest import BUNDLE, release_manifest


@pytest.fixture
def client():
    return website.app.test_client()


def test_verified_release_is_complete():
    manifest = release_manifest()
    assert manifest['version'] == '0.2.1'
    assert manifest['edition'] == 'full' and manifest['levels'] == 54
    assert len(manifest['files']) == 425
    for item in manifest['files']:
        contents = (BUNDLE / item['file']).read_bytes()
        assert len(contents) == item['bytes'], item['file']
        assert hashlib.sha256(contents).hexdigest() == item['sha256'], item['file']
    assert hashlib.sha256((BUNDLE / 'engine.js').read_bytes()).hexdigest() == manifest['engineSha256']
    assert not (BUNDLE / 'desktop').exists() and not (BUNDLE / 'tests').exists()


@pytest.mark.parametrize('path', ['', '/play', '/account-storage.js', '/bundle/index.html', '/bundle/engine.js', '/bundle/sounds/music-w1.ogg'])
def test_signed_out_cannot_download_game(client, monkeypatch, path):
    monkeypatch.setattr(website, 'google', SimpleNamespace(authorized=False))
    response = client.get('/labs/scroll-quest' + path)
    assert response.status_code == 302
    assert '/login/google/start' in response.headers['Location']
    assert 'no-store' in response.headers['Cache-Control']


@pytest.mark.parametrize('path', ['', '/play', '/account-storage.js', '/bundle/index.html', '/bundle/engine.js', '/bundle/models/nature.js'])
def test_membership_protects_pages_and_assets(client, monkeypatch, plus_visitor, path):
    monkeypatch.setattr(website, 'has_active_plus', lambda user: False)
    response = client.get('/labs/scroll-quest' + path)
    assert response.status_code == 403
    assert b'See Plus membership' in response.data
    assert 'no-store' in response.headers['Cache-Control']


def test_listing_launch_and_private_headers(client, plus_visitor):
    assert b'href="/labs/scroll-quest"' in client.get('/labs').data
    landing = client.get('/labs/scroll-quest')
    assert b'54 chapters' in landing.data and b'0.2.1' in landing.data
    assert client.get_cookie('faithsparks_labs_owner') is not None
    play = client.get('/labs/scroll-quest/play')
    assert b'src="/labs/scroll-quest/bundle/index.html"' in play.data
    assert b'Back to Labs' in play.data
    for response in (landing, play, client.get('/labs/scroll-quest/account-storage.js')):
        assert response.status_code == 200
        assert response.headers['Cache-Control'] == 'private, no-store'
        assert 'noindex' in response.headers['X-Robots-Tag']
        assert response.headers['Referrer-Policy'] == 'no-referrer'


def test_all_chapters_bootstrap_storage_before_game_scripts(client, plus_visitor):
    pages = [item['file'] for item in release_manifest()['files'] if item['file'].endswith('.html')]
    assert len([p for p in pages if p.startswith('world-')]) == 54
    for filename in pages:
        response = client.get('/labs/scroll-quest/bundle/' + filename)
        assert response.status_code == 200, filename
        html = response.get_data(as_text=True)
        assert html.index('account-storage.js') < html.index('</script>'), filename
    script = client.get('/labs/scroll-quest/account-storage.js').get_data(as_text=True)
    assert '(function (localStorage)' in script
    assert "Object.defineProperty(window, 'localStorage'" in script
    assert 'checkOwner' in script


def test_nested_assets_and_audio_ranges(client, plus_visitor):
    model = client.get('/labs/scroll-quest/bundle/models/nature.js')
    assert model.status_code == 200
    assert model.data == (BUNDLE / 'models/nature.js').read_bytes()
    sound = client.get('/labs/scroll-quest/bundle/sounds/music-w1.ogg', headers={'Range': 'bytes=0-31'})
    assert sound.status_code == 206 and len(sound.data) == 32
    assert sound.headers['Content-Type'].startswith('audio/ogg')
    assert 'no-store' in sound.headers['Cache-Control']


@pytest.mark.parametrize('path', ['../app.py', 'desktop/main.cjs', 'tests/run.js', 'models/../../app.py', 'missing.js'])
def test_unlisted_paths_are_rejected(client, plus_visitor, path):
    assert client.get('/labs/scroll-quest/bundle/' + path).status_code == 404
