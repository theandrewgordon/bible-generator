"""Shared journeys preserve destinations, access boundaries, and learning URLs."""
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
import pytest
import app as website
from faithsparks.products import learning_adventures
from faithsparks.util.navigation import safe_return_path

@pytest.mark.parametrize('value', ['https://other.test/x', '//other.test', '/\\other.test', '/x\nLocation: bad', 'javascript:alert(1)', '/'+('x'*2001)])
def test_return_destination_rejects_external_or_malformed_paths(value):
    assert safe_return_path(value) == ''

def test_membership_keeps_full_local_return_destination():
    destination='/labs/learningadventure/math?round=5&level=starter'
    client=website.app.test_client()
    assert client.get('/plus',query_string={'next':destination}).status_code == 200
    with client.session_transaction() as session:
        assert session['product_return'] == destination
    assert safe_return_path(destination) == destination

def test_public_settings_and_family_pack_render_in_real_shell():
    client=website.app.test_client()
    page=client.get('/settings')
    assert page.status_code == 200 and b'tool-preferences' in page.data
    page=client.get('/lesson-pack?verse=Psalm+23&mode=family')
    assert page.status_code == 200
    assert b'A family Scripture week from one passage' in page.data
    assert b'"providedFields": ["verse", "mode"]' in page.data
    assert b'next=/lesson-pack?verse%3DPsalm%2B23%26mode%3Dfamily' in page.data

def test_learning_routes_keep_legacy_links_and_private_scope(monkeypatch):
    monkeypatch.setattr(website,'google',SimpleNamespace(authorized=True))
    monkeypatch.setattr(website,'is_admin_email',lambda email:False)
    monkeypatch.setattr(website,'get_user_doc',lambda email:{'plan':'family'})
    monkeypatch.setattr(website,'has_active_plus',lambda user:True)
    monkeypatch.setattr(website,'refresh_google_user',lambda:None,raising=False)
    # Keep real handlers and response protections; isolate the unrelated identity refresh.
    def login():
        from flask import session
        session['user_email']='journey@example.test'
        session['user_info']={'email':'journey@example.test'}
    monkeypatch.setitem(website.app.before_request_funcs, None, [login,website.require_labs_access])
    client=website.app.test_client()
    hub=client.get('/labs/learningadventure')
    assert hub.status_code == 200 and len(learning_adventures()) == 4
    assert 'no-store' in hub.headers['Cache-Control']
    assert 'faithsparks_labs_owner' in hub.headers['Set-Cookie']
    for product in learning_adventures():
        assert product['path'].encode() in hub.data
    for suffix,legacy in [('math','math-fact-adventure'),('grammar','grammar-grove'),('geo','geo-detectives')]:
        current=client.get('/labs/learningadventure/'+suffix)
        old=client.get('/labs/'+legacy)
        assert current.status_code == old.status_code == 200
        assert current.data == old.data
        assert 'no-store' in current.headers['Cache-Control']
    monkeypatch.setattr(website,'has_active_plus',lambda user:False)
    gate=client.get('/labs/learningadventure/math?round=5')
    assert gate.status_code == 403 and b'See Plus membership' in gate.data
    assert b'next=/labs/learningadventure/math?round%3D5' in gate.data
    assert 'no-store' in gate.headers['Cache-Control']
    assert client.get('/static/labs/learning/math/main.js').status_code == 403

@pytest.mark.parametrize('preview,disposition',[('', 'attachment'),('?preview=1','inline')])
def test_pack_preview_keeps_download_ownership_checks(monkeypatch,tmp_path,preview,disposition):
    from faithsparks.views import public
    pdf=tmp_path/'pack.pdf';pdf.write_bytes(b'%PDF-test')
    monkeypatch.setattr(public,'_is_signed_in',lambda:True)
    monkeypatch.setattr(public,'_owned_lesson_pack',lambda slug:{'slug':slug})
    monkeypatch.setattr(public,'_lesson_pack_local_paths',lambda slug:(pdf,tmp_path/'pack.zip'))
    response=website.app.test_client().get('/lesson-pack/download/test-pack'+preview)
    assert response.status_code == 200
    assert response.headers['Content-Disposition'].startswith(disposition)
    monkeypatch.setattr(public,'_owned_lesson_pack',lambda slug:None)
    assert website.app.test_client().get('/lesson-pack/download/test-pack'+preview).status_code == 404
