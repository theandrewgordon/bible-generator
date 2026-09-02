from flask import Blueprint, jsonify, render_template, request

from faithsparks.services.weekflow_scheduler import demo_payload, generate_demo_schedule


bp = Blueprint("weekflow", __name__, url_prefix="/labs/weekflow")


@bp.get("")
@bp.get("/")
def index():
    return render_template("weekflow_lab.html", demo=demo_payload(), noindex=True)


@bp.post("/schedule")
def schedule():
    body = request.get_json(silent=True) or {}
    mode = body.get("mode", "baseline")
    if mode not in {"baseline", "disrupted"}:
        return jsonify({"error": "Unknown scheduling mode."}), 400
    return jsonify(generate_demo_schedule(missed_tuesday=mode == "disrupted"))
