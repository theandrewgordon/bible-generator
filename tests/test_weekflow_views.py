from flask import Flask

from faithsparks.views.weekflow import bp


def _client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
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
    assert "CC / co-op Monday" in html
    assert "Daily availability" in html
    assert "Already worked ahead" in html
    assert "Grandma comes Wednesday" in html


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
