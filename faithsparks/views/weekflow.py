from flask import Blueprint, jsonify, render_template, request, session

from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.services.weekflow_scheduler import (
    demo_payload,
    generate_demo_schedule,
)
from faithsparks.services.weekflow_store import (
    WeekFlowRevisionConflict,
    WeekFlowStorageUnavailable,
    delete_beta_state,
    load_beta_state,
    record_beta_feedback,
    save_beta_state,
)
from faithsparks.util.request_utils import get_client_ip

bp = Blueprint("weekflow", __name__, url_prefix="/labs/weekflow")


@bp.get("")
@bp.get("/")
def index():
    return render_template(
        "weekflow_lab.html",
        demo=demo_payload(),
        noindex=True,
        weekflow_user=session.get("user_email"),
    )


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


@bp.get("/state")
def state():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
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
    try:
        saved = save_beta_state(email, body)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except WeekFlowRevisionConflict as exc:
        return jsonify({"error": str(exc), "conflict": True}), 409
    except WeekFlowStorageUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify(saved)


@bp.delete("/state")
def delete_state():
    email = _signed_in_email()
    if not email:
        return _sign_in_required()
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
