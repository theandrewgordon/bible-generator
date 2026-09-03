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
    assert 'feedbackUrl: "/labs/weekflow/feedback"' in html
    assert "Build Family Schedule" in html
    assert "Shared resource timeline" in html
    assert "Tuesday Morning Fell Apart" in html
    assert "Avery" in html and "Maya" in html and "Lucy" in html
    assert "Thursday" in html and "CC / co-op day" in html
    assert "Saved weeks" not in html
    assert "Reusable templates" not in html
    assert "Approve week" not in html
    assert "Export calendar" not in html
    assert "Optimize" not in html


def test_logistics_lab_renders_the_family_handoff_experiment():
    response = _client().get("/labs/weekflow/logistics")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "Carry less of the family schedule in your head" in html
    assert "Dad’s appointment" in html
    assert "Football practice" in html
    assert "Dance class" in html
    assert 'planUrl: "/labs/weekflow/logistics/plan"' in html
    assert 'calendarStatusUrl: "/labs/weekflow/calendar/status"' in html
    assert "Availability only" in html
    assert "Previewed event content is not saved" in html
    assert "Simulate family of four · school + sports" in html
    assert "familyFourScenario:" in html
    assert 'content="noindex,nofollow"' in html


def test_logistics_endpoint_detects_and_resolves_the_driver_conflict(monkeypatch):
    client = _client()
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )

    baseline = client.post("/labs/weekflow/logistics/plan", json={})
    baseline_payload = baseline.get_json()
    fixed = client.post(
        "/labs/weekflow/logistics/plan",
        json={
            "scenario": baseline_payload["scenario"],
            "change": {
                "event_id": "football",
                "adult_id": "grandma",
                "scope": "occurrence",
            },
        },
    )

    assert baseline.status_code == 200
    assert baseline_payload["status"] == "needs_decision"
    assert baseline_payload["suggestions"][0]["adult_id"] == "grandma"
    assert fixed.status_code == 200
    assert fixed.get_json()["status"] == "workable"


def test_logistics_endpoint_rejects_bad_shapes_and_rate_limits(monkeypatch):
    client = _client()
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )

    assert client.post("/labs/weekflow/logistics/plan", json=[]).status_code == 400
    assert client.post(
        "/labs/weekflow/logistics/plan", json={"scenario": []}
    ).status_code == 400
    assert client.post(
        "/labs/weekflow/logistics/plan", json={"change": []}
    ).status_code == 400

    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": False, "retry_after": 19}
        )(),
    )
    limited = client.post("/labs/weekflow/logistics/plan", json={})
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "19"


def test_calendar_status_requires_adult_sign_in_before_optional_consent(
    monkeypatch,
):
    monkeypatch.setattr(weekflow_view, "calendar_oauth_configured", lambda: True)

    response = _client().get("/labs/weekflow/calendar/status")

    assert response.status_code == 200
    assert response.get_json() == {
        "signed_in": False,
        "configured": True,
        "connected": False,
        "sign_in_url": "/login/google/start?next=/labs/weekflow/logistics",
        "connect_url": None,
        "preferences": {"calendar_ids": [], "detail_mode": "details"},
    }


def test_connected_adult_can_select_and_preview_read_only_calendars(monkeypatch):
    client = _client()
    fake_oauth = type("OAuth", (), {"authorized": True})()
    calendars = [
        {
            "id": "family@example.com",
            "name": "Family",
            "primary": True,
            "access_role": "owner",
            "color": "#315f53",
        }
    ]
    saved = []
    analytics = []
    monkeypatch.setattr(weekflow_view, "calendar_oauth_configured", lambda: True)
    monkeypatch.setattr(weekflow_view, "_calendar_session", lambda: fake_oauth)
    monkeypatch.setattr(
        weekflow_view,
        "load_calendar_preferences",
        lambda email: {"calendar_ids": ["family@example.com"], "detail_mode": "details"},
    )
    monkeypatch.setattr(
        weekflow_view, "list_google_calendars", lambda oauth: calendars
    )
    monkeypatch.setattr(
        weekflow_view,
        "preview_google_week",
        lambda oauth, available_calendars, payload: {
            "week_start": payload["week_start"],
            "timezone": payload["timezone"],
            "detail_mode": payload["detail_mode"],
            "selected_calendars": calendars,
            "events": [],
            "event_count": 0,
            "source_owned": True,
            "persisted_event_content": False,
        },
    )
    monkeypatch.setattr(
        weekflow_view,
        "save_calendar_preferences",
        lambda email, payload: saved.append((email, payload)),
    )
    monkeypatch.setattr(
        weekflow_view,
        "record_weekflow_event",
        lambda email, payload: analytics.append((email, payload)),
    )
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "parent@example.com"

    status = client.get("/labs/weekflow/calendar/status")
    choices = client.get("/labs/weekflow/calendar/calendars")
    payload = {
        "calendar_ids": ["family@example.com"],
        "detail_mode": "details",
        "week_start": "2026-08-31",
        "timezone": "America/New_York",
    }
    preview = client.post("/labs/weekflow/calendar/preview", json=payload)

    assert status.get_json()["connected"] is True
    assert choices.get_json()["calendars"] == calendars
    assert preview.status_code == 200
    assert preview.get_json()["source_owned"] is True
    assert saved == [("parent@example.com", payload)]
    assert analytics == [
        ("parent@example.com", {"event": "calendar_imported"})
    ]


def test_calendar_routes_reject_unconnected_and_disconnect_cleanly(monkeypatch):
    client = _client()
    disconnected = []
    monkeypatch.setattr(weekflow_view, "calendar_oauth_configured", lambda: True)
    monkeypatch.setattr(
        weekflow_view,
        "_calendar_session",
        lambda: type("OAuth", (), {"authorized": False})(),
    )
    monkeypatch.setattr(
        weekflow_view,
        "disconnect_google_calendar",
        lambda email: disconnected.append(email),
    )
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "parent@example.com"

    unconnected = client.get("/labs/weekflow/calendar/calendars")
    removed = client.post("/labs/weekflow/calendar/disconnect", json={})

    assert unconnected.status_code == 401
    assert "Connect Google Calendar" in unconnected.get_json()["error"]
    assert removed.get_json() == {"disconnected": True}
    assert disconnected == ["parent@example.com"]


def test_calendar_oauth_rejects_a_different_google_account(monkeypatch):
    client = _client()
    disconnected = []

    class _OAuth:
        authorized = True

        def get(self, path):
            return type(
                "Response",
                (),
                {"ok": True, "json": lambda self: {"email": "other@example.com"}},
            )()

    monkeypatch.setattr(weekflow_view, "_calendar_session", lambda: _OAuth())
    monkeypatch.setattr(
        weekflow_view,
        "disconnect_google_calendar",
        lambda email: disconnected.append(email),
    )
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "parent@example.com"

    response = client.get("/labs/weekflow/calendar/oauth-finish")

    assert response.status_code == 302
    assert "calendar=wrong-account" in response.headers["Location"]
    assert disconnected == ["parent@example.com"]


def test_schedule_endpoint_accepts_supported_modes_and_default(monkeypatch):
    client = _client()

    # The request-shape tests exercise the scheduler, not the shared limiter.
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": True, "retry_after": 0}
        )(),
    )

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
    assert "grandma_wednesday" in {
        event["id"] for event in payload["days"][2]["events"]
    }


def test_schedule_endpoint_is_rate_limited(monkeypatch):
    monkeypatch.setattr(
        weekflow_view,
        "check_rate_limit",
        lambda *args, **kwargs: type(
            "Limit", (), {"allowed": False, "retry_after": 37}
        )(),
    )

    response = _client().post("/labs/weekflow/schedule", json={})

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "37"
    assert response.get_json() == {
        "error": "Too many WeekFlow plans. Try again shortly."
    }


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


def test_saved_weeks_templates_and_rollover_require_an_adult_account():
    client = _client()

    for method, path in (
        (client.get, "/labs/weekflow/weeks"),
        (client.get, "/labs/weekflow/weeks/2026-08-31"),
        (client.get, "/labs/weekflow/templates"),
        (client.post, "/labs/weekflow/templates"),
        (client.post, "/labs/weekflow/rollover"),
        (client.get, "/labs/weekflow/backup"),
    ):
        response = method(path, json={} if method == client.post else None)
        assert response.status_code == 401


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


def test_signed_in_beta_can_use_week_history_templates_and_rollover(monkeypatch):
    client = _client()
    state = default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    saved = {**state, "revision": 2, "plan": {"total_count": 1}}
    deleted = []
    monkeypatch.setattr(
        weekflow_view,
        "list_saved_weeks",
        lambda email, limit: [{"week_start": "2026-08-31", "approved": True}],
    )
    monkeypatch.setattr(weekflow_view, "load_saved_week", lambda *args: saved)
    monkeypatch.setattr(
        weekflow_view,
        "list_week_templates",
        lambda email: [{"id": "abc", "name": "Normal", "scenario": state["scenario"]}],
    )
    monkeypatch.setattr(
        weekflow_view,
        "save_week_template",
        lambda email, body: {"id": "new", **body},
    )
    monkeypatch.setattr(
        weekflow_view,
        "delete_week_template",
        lambda email, template_id: deleted.append((email, template_id)),
    )
    monkeypatch.setattr(weekflow_view, "create_rollover_state", lambda *args: saved)
    monkeypatch.setattr(weekflow_view, "get_user_doc", lambda email: {"isPro": True})
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "parent@example.com"

    assert client.get("/labs/weekflow/weeks").status_code == 200
    assert client.get("/labs/weekflow/weeks/2026-08-31").get_json()["revision"] == 2
    assert client.get("/labs/weekflow/templates").status_code == 200
    created = client.post(
        "/labs/weekflow/templates",
        json={"name": "Friday light", "scenario": state["scenario"]},
    )
    assert created.status_code == 201
    assert client.delete("/labs/weekflow/templates/abc").status_code == 200
    assert client.post("/labs/weekflow/rollover", json=state).status_code == 200
    assert deleted == [("parent@example.com", "abc")]


def test_beta_allowlist_and_subscription_limits_are_enforced(monkeypatch):
    client = _client()
    state = default_beta_state()
    monkeypatch.setenv("WEEKFLOW_BETA_EMAILS", "invited@example.com")
    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "waiting@example.com"

    assert client.get("/labs/weekflow/state").status_code == 403

    with client.session_transaction() as flask_session:
        flask_session["user_email"] = "invited@example.com"
    monkeypatch.setattr(weekflow_view, "get_user_doc", lambda email: {"isPro": False})
    state["family"]["students"]["fourth"] = {
        "name": "Fourth",
        "color": "#4776c5",
    }
    state["family"]["students"]["fifth"] = {
        "name": "Fifth",
        "color": "#2c7a4b",
    }

    response = client.put("/labs/weekflow/state", json=state)

    assert response.status_code == 403
    assert "up to 4 students" in response.get_json()["error"]
