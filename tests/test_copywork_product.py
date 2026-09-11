from app import app
from faithsparks.views.worksheets import LEARNER_LEVEL_LINES


CSRF = "copywork-test-csrf"


def _prime(client, **values):
    with client.session_transaction() as session:
        session["_csrf_token"] = CSRF
        session.update(values)


def test_generate_page_allows_a_no_account_sample():
    client = app.test_client()

    page = client.get("/generate")

    assert page.status_code == 200
    assert b"Your first worksheet is free" in page.data
    assert b'name="learner_level"' in page.data
    assert b"This week\xe2\x80\x99s copywork rhythm" in page.data
    assert b"Structural preview" in page.data


def test_generate_page_keeps_translation_picker_customer_facing():
    client = app.test_client()

    page = client.get("/generate")

    assert page.status_code == 200
    assert b"Copywork text path" not in page.data
    assert b"live text source not configured" not in page.data
    assert b"Your Bible text will appear" in page.data


def test_anonymous_custom_text_requires_sign_in_before_processing():
    client = app.test_client()
    _prime(client)

    response = client.post(
        "/generate",
        json={"custom_text": "A private family prayer"},
        headers={"X-CSRF-Token": CSRF},
    )

    assert response.status_code == 403
    assert "Sign in to make worksheets from your own text" in response.get_json()["error"]


def test_anonymous_sample_limit_is_enforced_before_generation():
    client = app.test_client()
    _prime(client, anonymous_worksheet_count=1)

    response = client.post(
        "/generate",
        json={"verse": "John 3:16", "version": "web"},
        headers={"X-CSRF-Token": CSRF},
    )

    assert response.status_code == 403
    assert response.get_json()["sign_in"].startswith("/login/google")


def test_writer_levels_have_distinct_pdf_line_counts():
    assert LEARNER_LEVEL_LINES == {"beginner": 5, "growing": 3, "confident": 2}
