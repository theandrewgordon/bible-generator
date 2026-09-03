from flask import Flask

import faithsparks.views.weekflow as weekflow_view
from faithsparks.services.weekflow_store import (
    WeekFlowRevisionConflict,
    WeekFlowStorageUnavailable,
    default_beta_state,
)
from faithsparks.views.weekflow import bp


def _client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.secret_key = "weekflow-test"
    app.jinja_env.globals["csrf_token"] = lambda: "test-token"
    app.register_blueprint(bp)
    return app.test_client()


def test_lab_page_renders_demo_configuration():
    response = _client().get("/labs/weekflow")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "WeekFlow Scheduler Lab" in html
    assert 'content="noindex,nofollow"' in html
    assert 'csrfToken: "test-token"' in html
    assert 'scheduleUrl: "/labs/weekflow/schedule"' in html
    assert 'stateUrl: "/labs/weekflow/state"' in html
    assert 'feedbackUrl: "/labs/weekflow/feedback"' in html
    assert "Thursday co-op" in html
    assert "Commitments &amp; real life" in html
    assert "Add another event" in html
    assert "Daily availability" in html
    assert "Assignments &amp; progress" in html
    assert '"title": "Grandma comes"' in html


def test_schedule_endpoint_accepts_supported_modes_and_default():
    client = _client()

    empty_response = client.post("/labs/weekflow/schedule")
    assert empty_response.status_code == 200
    assert empty_response.get_json()["mode"] == "baseline"

    for body, expected_mode in (
        ({}, "baseline"),
        ({"mode": "baseline"}, "baseline"),
        ({"mode": "disrupted"}, "disrupted"),
    ):
        response = client.post("/labs/weekflow/schedule", json=body)
        assert response.status_code == 200
        assert response.get_json()["mode"] == expected_mode


def test_schedule_endpoint_applies_weekly_scenario_controls():
    response = _client().post(
        "/labs/weekflow/schedule",
        json={
            "mode": "baseline",
            "scenario": {
                "coop_monday": True,
                "coop_credit_subjects": ["Science", "History"],
                "extended_days": ["mon", "tue", "wed", "thu"],
                "disruptions": ["grandma_wednesday"],
                "completed_task_ids": ["tessa-algebra"],
                "allow_next_week": True,
            },
        },
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["mode"] == "disrupted"
    assert payload["completed_count"] == 3
    assert payload["scenario"]["disruptions"] == ["grandma_wednesday"]
    assert payload["days"][2]["events"][0]["id"] == "grandma_wednesday"


def test_schedule_endpoint_rejects_malformed_json_shapes_without_500():
    client = _client()

    for body in ([1], ["mode"], "baseline", 1, True):
        response = client.post("/labs/weekflow/schedule", json=body)
        assert response.status_code == 400
        assert response.get_json() == {
            "error": "Request body must be a JSON object."
        }

    for mode in (None, [], {}):
        response = client.post("/labs/weekflow/schedule", json={"mode": mode})
        assert response.status_code == 400
        assert response.get_json() == {"error": "Unknown scheduling mode."}

    for scenario in ([], "week", 1):
        response = client.post(
            "/labs/weekflow/schedule",
            json={"mode": "baseline", "scenario": scenario},
        )
        assert response.status_code == 400
        assert response.get_json() == {"error": "scenario must be a JSON object."}

    invalid_scenario = client.post(
        "/labs/weekflow/schedule",
        json={"scenario": {"disruptions": ["meteor"]}},
    )
    assert invalid_scenario.status_code == 400
    assert invalid_scenario.get_json() == {
        "error": "disruptions contains an unknown event"
    }

    malformed = client.post(
        "/labs/weekflow/schedule",
        data="{not-json",
        content_type="application/json",
    )
    assert malformed.status_code == 400
    assert malformed.get_json() == {"error": "Request body must be a JSON object."}

    null_body = client.post(
        "/labs/weekflow/schedule",
        data="null",
        content_type="application/json",
    )
    assert null_body.status_code == 400
    assert null_body.get_json() == {"error": "Request body must be a JSON object."}

    wrong_content_type = client.post(
        "/labs/weekflow/schedule",
        data='{"mode":"baseline"}',
        content_type="text/plain",
    )
    assert wrong_content_type.status_code == 400
    assert wrong_content_type.get_json() == {
        "error": "Request body must be a JSON object."
    }


def test_cloud_state_routes_require_an_adult_account():
    client = _client()

    for method in (client.get, client.put, client.delete):
        response = method("/labs/weekflow/state", json={} if method == client.put else None)
        assert response.status_code == 401
        assert "adult account" in response.get_json()["error"]


def test_signed_in_adult_can_load_save_and_delete_state(monkeypatch):
    client = _client()
    state = default_beta_state()
    saved = {**state, "revision": 1, "plan": {"scheduled_count": 15}}
    deleted = []
    monkeypatch.setattr(weekflow_view, "load_beta_state", lambda email: state)
    monkeypatch.setattr(weekflow_view, "save_beta_state", lambda email, body: saved)
    monkeypatch.setattr(weekflow_view, "delete_beta_state", deleted.append)
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "Parent@Example.com"

    loaded = client.get("/labs/weekflow/state")
    stored = client.put("/labs/weekflow/state", json=state)
    removed = client.delete("/labs/weekflow/state")

    assert loaded.status_code == 200
    assert loaded.get_json()["family"]["name"] == "Our homeschool"
    assert stored.status_code == 200
    assert stored.get_json()["revision"] == 1
    assert removed.get_json() == {"deleted": True}
    assert deleted == ["parent@example.com"]


def test_cloud_state_reports_conflicts_and_outages(monkeypatch):
    client = _client()
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "parent@example.com"
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )

    monkeypatch.setattr(
        weekflow_view,
        "save_beta_state",
        lambda *args: (_ for _ in ()).throw(WeekFlowRevisionConflict("newer plan")),
    )
    conflict = client.put("/labs/weekflow/state", json=default_beta_state())
    assert conflict.status_code == 409
    assert conflict.get_json()["conflict"] is True

    monkeypatch.setattr(
        weekflow_view,
        "load_beta_state",
        lambda *args: (_ for _ in ()).throw(WeekFlowStorageUnavailable("offline")),
    )
    unavailable = client.get("/labs/weekflow/state")
    assert unavailable.status_code == 503
    assert unavailable.get_json()["error"] == "offline"


def test_feedback_is_validated_rate_limited_and_saved_without_schedule_data(monkeypatch):
    client = _client()
    saved = []
    monkeypatch.setattr(
        weekflow_view,
        "record_beta_feedback",
        lambda email, payload: saved.append((email, payload)),
    )
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )

    response = client.post(
        "/labs/weekflow/feedback",
        json={"realistic": "mostly", "comment": "Move reading earlier", "contact": False},
    )

    assert response.get_json() == {"saved": True}
    assert saved == [
        (
            None,
            {"realistic": "mostly", "comment": "Move reading earlier", "contact": False},
        )
    ]
