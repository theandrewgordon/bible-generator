import json
import os

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from faithsparks.services.firestore import db, firebase_init_diagnostic
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.users import get_user_doc, has_active_plus
from faithsparks.services.weekflow_calendar import (
    WeekFlowCalendarProviderError,
    WeekFlowCalendarUnavailable,
    calendar_oauth_configured,
    disconnect_google_calendar,
    list_google_calendars,
    load_calendar_preferences,
    preview_google_week,
    save_calendar_preferences,
)
from faithsparks.services.weekflow_logistics import (
    analyze_family_logistics,
    apply_responsibility_change,
    apply_support_request_action,
    apply_vehicle_change,
    default_logistics_scenario,
    family_four_carpool_scenario,
    family_four_school_sports_scenario,
)
from faithsparks.services.weekflow_scheduler import (
    demo_payload,
    generate_demo_schedule,
)
from faithsparks.services.weekflow_store import (
    WeekFlowRevisionConflict,
    WeekFlowStorageUnavailable,
    create_rollover_state,
    delete_beta_state,
    delete_week_template,
    export_weekflow_backup,
    list_saved_weeks,
    list_week_templates,
    load_beta_state,
    load_saved_week,
    prune_week_history,
    record_beta_feedback,
    record_weekflow_event,
    save_beta_state,
    save_week_template,
)
from faithsparks.util.request_utils import get_client_ip

bp = Blueprint("weekflow", __name__, url_prefix="/labs/weekflow")


def _beta_allowlist() -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv("WEEKFLOW_BETA_EMAILS", "").split(",")
        if item.strip()
    }


def _has_beta_access(email: str | None) -> bool:
    allowlist = _beta_allowlist()
    return not allowlist or bool(email and email in allowlist)


def _weekflow_limits(email: str | None) -> dict[str, int | str | bool]:
    plus = bool(email and has_active_plus(get_user_doc(email)))
    return {
        "tier": "plus" if plus else "beta",
        "plus": plus,
        "students": 8 if plus else 4,
        "adults": 3 if plus else 2,
        "saved_weeks": 12 if plus else 4,
        "templates": 8 if plus else 2,
    }


@bp.get("")
@bp.get("/")
def index():
    return render_template(
        "weekflow_lab.html",
        demo=demo_payload(),
        noindex=True,
    )


@bp.get("/logistics")
def logistics():
    return render_template(
        "weekflow_logistics.html",
        scenario=default_logistics_scenario(),
        family_four_scenario=family_four_school_sports_scenario(),
        carpool_scenario=family_four_carpool_scenario(),
        noindex=True,
    )


@bp.post("/logistics/plan")
def logistics_plan():
    limit = check_rate_limit(
        "weekflow-logistics",
        _signed_in_email() or get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        response = jsonify({"error": "Too many family plans. Try again shortly."})
        response.status_code = 429
        response.headers["Retry-After"] = str(limit.retry_after)
        return response
    if request.content_length and request.content_length > 80_000:
        return jsonify({"error": "Family logistics request is too large."}), 413
    body = request.get_json(silent=True) if request.data else {}
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400
    scenario = body.get("scenario")
    change = body.get("change")
    if scenario is not None and not isinstance(scenario, dict):
        return jsonify({"error": "scenario must be a JSON object."}), 400
    if change is not None and not isinstance(change, dict):
        return jsonify({"error": "change must be a JSON object."}), 400
    try:
        if change is not None:
            scenario = scenario or default_logistics_scenario()
            change_kind = change.get("kind", "responsibility")
            if change_kind == "responsibility":
                scenario = apply_responsibility_change(
                    scenario,
                    event_id=change.get("event_id"),
                    adult_id=change.get("adult_id"),
                    scope=change.get("scope"),
                    responsibility_kind=change.get("responsibility_kind"),
                )
            elif change_kind == "vehicle":
                scenario = apply_vehicle_change(
                    scenario,
                    event_id=change.get("event_id"),
                    vehicle_id=change.get("vehicle_id"),
                    scope=change.get("scope"),
                )
            elif change_kind == "support_request":
                scenario = apply_support_request_action(
                    scenario,
                    request_id=change.get("request_id"),
                    action=change.get("action"),
                )
            else:
                raise ValueError("change.kind is invalid")
        return jsonify(analyze_family_logistics(scenario))
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


def _calendar_session():
    return getattr(g, "weekflow_calendar_google", None)


def _calendar_connect_url() -> str | None:
    if "weekflow_google_calendar.login" not in current_app.view_functions:
        return None
    return url_for("weekflow_google_calendar.login")


def _calendar_is_connected() -> bool:
    oauth = _calendar_session()
    return bool(oauth and oauth.authorized)


def _calendar_connection_required():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    if not calendar_oauth_configured():
        return jsonify(
            {"error": "Google Calendar connection is not configured yet."}
        ), 503
    try:
        if not _calendar_is_connected():
            return jsonify(
                {
                    "error": "Connect Google Calendar before choosing calendars.",
                    "connect_url": _calendar_connect_url(),
                }
            ), 401
    except WeekFlowCalendarUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return None


@bp.get("/calendar/status")
def calendar_status():
    email = _signed_in_email()
    configured = calendar_oauth_configured()
    if not email:
        return jsonify(
            {
                "signed_in": False,
                "configured": configured,
                "connected": False,
                "sign_in_url": "/login/google/start?next=/labs/weekflow/logistics",
                "connect_url": None,
                "preferences": {"calendar_ids": [], "detail_mode": "details"},
            }
        )
    connected = False
    preferences = {"calendar_ids": [], "detail_mode": "details"}
    if configured:
        try:
            connected = _calendar_is_connected()
            if connected:
                preferences = load_calendar_preferences(email)
        except WeekFlowCalendarUnavailable as exc:
            return jsonify({"error": str(exc)}), 503
    return jsonify(
        {
            "signed_in": True,
            "configured": configured,
            "connected": connected,
            "sign_in_url": None,
            "connect_url": _calendar_connect_url() if configured else None,
            "preferences": preferences,
        }
    )


@bp.get("/calendar/oauth-finish")
def calendar_oauth_finish():
    email = _signed_in_email()
    if not email:
        return redirect("/login/google/start?next=/labs/weekflow/logistics")
    try:
        if not _calendar_is_connected():
            return redirect(url_for("weekflow.logistics", calendar="not-connected"))
        response = _calendar_session().get("/oauth2/v2/userinfo")
        account = response.json() if response.ok else {}
        account_email = (
            str(account.get("email") or "").strip().casefold()
            if isinstance(account, dict)
            else ""
        )
        if not account_email or account_email != email:
            disconnect_google_calendar(email)
            return redirect(url_for("weekflow.logistics", calendar="wrong-account"))
    except (WeekFlowCalendarUnavailable, ValueError):
        return redirect(url_for("weekflow.logistics", calendar="connection-error"))
    except Exception:
        current_app.logger.warning(
            "WeekFlow Calendar account validation failed", exc_info=True
        )
        return redirect(url_for("weekflow.logistics", calendar="connection-error"))
    response = make_response(
        redirect(url_for("weekflow.logistics", calendar="connected"))
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.get("/calendar/calendars")
def calendars():
    if required := _calendar_connection_required():
        return required
    try:
        return jsonify({"calendars": list_google_calendars(_calendar_session())})
    except WeekFlowCalendarProviderError as exc:
        return jsonify({"error": str(exc)}), 502
    except WeekFlowCalendarUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@bp.post("/calendar/preview")
def calendar_preview():
    if required := _calendar_connection_required():
        return required
    email = _signed_in_email()
    limit = check_rate_limit(
        "weekflow-calendar-preview",
        email,
        limit=30,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        response = jsonify({"error": "Too many calendar previews. Try again shortly."})
        response.status_code = 429
        response.headers["Retry-After"] = str(limit.retry_after)
        return response
    if request.content_length and request.content_length > 24_000:
        return jsonify({"error": "Calendar preview request is too large."}), 413
    payload = request.get_json(silent=True)
    try:
        available = list_google_calendars(_calendar_session())
        preview = preview_google_week(
            _calendar_session(),
            available_calendars=available,
            payload=payload,
        )
        save_calendar_preferences(email, payload)
        record_weekflow_event(email, {"event": "calendar_imported"})
        return jsonify(preview)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowCalendarProviderError as exc:
        return jsonify({"error": str(exc)}), 502
    except WeekFlowCalendarUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@bp.post("/calendar/disconnect")
def calendar_disconnect():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    try:
        disconnect_google_calendar(email)
    except WeekFlowCalendarUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"disconnected": True})


@bp.post("/schedule")
def schedule():
    email = _signed_in_email()
    limit = check_rate_limit(
        "weekflow-schedule",
        email or get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        response = jsonify({"error": "Too many WeekFlow plans. Try again shortly."})
        response.status_code = 429
        response.headers["Retry-After"] = str(limit.retry_after)
        return response
    if request.content_length and request.content_length > 120_000:
        return jsonify({"error": "Schedule request is too large."}), 413
    if not request.data:
        body = {}
    else:
        body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    mode = body.get("mode", "baseline")
    if not isinstance(mode, str) or mode not in {"baseline", "disrupted"}:
        return jsonify({"error": "Unknown scheduling mode."}), 400
    scenario = body.get("scenario")
    if scenario is not None and not isinstance(scenario, dict):
        return jsonify({"error": "scenario must be a JSON object."}), 400
    try:
        result = generate_demo_schedule(
            missed_tuesday=mode == "disrupted",
            scenario=scenario,
        )
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


def _signed_in_email() -> str | None:
    email = session.get("user_email")
    return str(email).strip().casefold() if email else None


def _sign_in_required():
    return (
        jsonify(
            {
                "error": "Sign in with an adult account to use cloud saving.",
                "sign_in_url": "/login/google/start?next=/labs/weekflow",
            }
        ),
        401,
    )


def _beta_access_required():
    return jsonify({"error": "This account is not in the WeekFlow beta yet."}), 403


def _limit_error(email: str, payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None
    limits = _weekflow_limits(email)
    family = payload.get("family")
    scenario = payload.get("scenario")
    household = scenario.get("household") if isinstance(scenario, dict) else None
    students = (
        family.get("students")
        if isinstance(family, dict)
        else household.get("students") if isinstance(household, dict) else None
    )
    adults = (
        family.get("adults")
        if isinstance(family, dict)
        else household.get("adults") if isinstance(household, dict) else None
    )
    if isinstance(students, (dict, list)) and len(students) > int(limits["students"]):
        return f"Your {limits['tier']} plan supports up to {limits['students']} students."
    if isinstance(adults, (dict, list)) and len(adults) > int(limits["adults"]):
        return f"Your {limits['tier']} plan supports up to {limits['adults']} teaching adults."
    return None


@bp.get("/state")
def state():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        saved = load_beta_state(email)
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify(
        {**saved, "plan": generate_demo_schedule(scenario=saved["scenario"])}
    )


@bp.put("/state")
def save_state():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    limit = check_rate_limit(
        "weekflow-save",
        email,
        limit=60,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        response = jsonify({"error": "Too many WeekFlow saves. Try again shortly."})
        response.status_code = 429
        response.headers["Retry-After"] = str(limit.retry_after)
        return response
    if request.content_length and request.content_length > 120_000:
        return jsonify({"error": "WeekFlow state is too large."}), 413
    body = request.get_json(silent=True)
    if error := _limit_error(email, body):
        return jsonify({"error": error}), 403
    try:
        saved = save_beta_state(email, body)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowRevisionConflict as exc:
        return jsonify({"error": str(exc), "conflict": True}), 409
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    try:
        prune_week_history(email, keep=int(_weekflow_limits(email)["saved_weeks"]))
    except WeekFlowStorageUnavailable as exc:
        current_app.logger.warning("WeekFlow retention pruning failed: %s", exc)
    return jsonify(saved)


@bp.delete("/state")
def delete_state():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        delete_beta_state(email)
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"deleted": True})


@bp.post("/feedback")
def feedback():
    email = _signed_in_email()
    limit = check_rate_limit(
        "weekflow-feedback",
        email or request.remote_addr or "anonymous",
        limit=5,
        window_seconds=60 * 60,
    )
    if not limit.allowed:
        return jsonify({"error": "Feedback limit reached. Try again later."}), 429
    try:
        record_beta_feedback(email, request.get_json(silent=True))
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"saved": True})


@bp.get("/weeks")
def weeks():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        return jsonify(
            {
                "weeks": list_saved_weeks(
                    email, limit=int(_weekflow_limits(email)["saved_weeks"])
                )
            }
        )
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@bp.get("/weeks/<week_start>")
def saved_week(week_start: str):
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        return jsonify(load_saved_week(email, week_start))
    except KeyError:
        return jsonify({"error": "Saved week not found."}), 404
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@bp.post("/rollover")
def rollover():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    body = request.get_json(silent=True)
    if error := _limit_error(email, body):
        return jsonify({"error": error}), 403
    try:
        saved = create_rollover_state(email, body)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowRevisionConflict as exc:
        return jsonify({"error": str(exc), "conflict": True}), 409
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify(saved)


@bp.route("/templates", methods=["GET", "POST"])
def templates():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        if request.method == "GET":
            return jsonify({"templates": list_week_templates(email)})
        templates_now = list_week_templates(email)
        if len(templates_now) >= int(_weekflow_limits(email)["templates"]):
            return jsonify({"error": "Your current WeekFlow template limit is reached."}), 403
        body = request.get_json(silent=True)
        if error := _limit_error(email, body):
            return jsonify({"error": error}), 403
        return jsonify(save_week_template(email, body)), 201
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@bp.delete("/templates/<template_id>")
def delete_template(template_id: str):
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        delete_week_template(email, template_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"deleted": True})


@bp.get("/backup")
def backup():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
    if not _has_beta_access(email):
        return _beta_access_required()
    try:
        payload = export_weekflow_backup(email)
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    response = make_response(json.dumps(payload, ensure_ascii=False, indent=2))
    response.headers["Content-Type"] = "application/json; charset=utf-8"
    response.headers["Content-Disposition"] = (
        'attachment; filename="weekflow-backup.json"'
    )
    return response


@bp.post("/analytics")
def analytics():
    email = _signed_in_email()
    limit = check_rate_limit(
        "weekflow-analytics",
        email or get_client_ip(),
        limit=120,
        window_seconds=60 * 60,
    )
    if limit.allowed:
        try:
            record_weekflow_event(email, request.get_json(silent=True))
        except (TypeError, ValueError):
            pass
    return jsonify({"recorded": True})


@bp.get("/health")
def health():
    email = _signed_in_email()
    admins = {
        item.strip().casefold()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    }
    if not email or email not in admins:
        return jsonify({"error": "Not found."}), 404
    return jsonify(
        {
            "ok": bool(db),
            "firestore": firebase_init_diagnostic(),
            "beta_allowlist_enabled": bool(_beta_allowlist()),
            "limits": _weekflow_limits(email),
        }
    )
