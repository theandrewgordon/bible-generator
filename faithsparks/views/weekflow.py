from flask import Blueprint, jsonify, render_template, request

from faithsparks.services.weekflow_scheduler import demo_payload, generate_demo_schedule


bp = Blueprint("weekflow", __name__, url_prefix="/labs/weekflow")


@bp.get("")
@bp.get("/")
def index():
    return render_template("weekflow_lab.html", demo=demo_payload(), noindex=True)


@bp.post("/schedule")
def schedule():
    if not request.data:
        body = {}
    else:
        body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    mode = body.get("mode", "baseline")
    if not isinstance(mode, str) or mode not in {"baseline", "disrupted"}:
        return jsonify({"error": "Unknown scheduling mode."}), 400
    return jsonify(generate_demo_schedule(missed_tuesday=mode == "disrupted"))
