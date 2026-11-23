"""Bounded OpenAI calls initiated from BodyBeat's parent tools."""
import hashlib
import json
import os

from flask import jsonify, request, session
from openai import OpenAI, OpenAIError

from faithsparks.services.ai_budget import UNITS, ai_budget_ok
from faithsparks.services.rate_limit import check_rate_limit

MOVES = ("reach_left", "reach_right", "reach_up", "duck", "freeze")
COUNTERS = (
    "camera_ready", "camera_errors", "rounds_started", "rounds_finished",
    "tracking_pauses", "playlist_errors",
)
ROUTINE_MODEL = os.getenv("BODYBEAT_AI_MODEL", "gpt-4o-mini")
ROUTINE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "name": {"type": "string"},
        "duration": {"type": "integer", "enum": [30, 60, 90]},
        "difficulty": {"type": "string", "enum": ["easy", "normal", "challenge"]},
        "gameMode": {"type": "string", "enum": ["seated", "hands", "auto"]},
        "numPlayers": {"type": "integer", "enum": [1, 2]},
        "moves": {"type": "array", "items": {"type": "string", "enum": list(MOVES)}},
    },
    "required": ["name", "duration", "difficulty", "gameMode", "numPlayers", "moves"],
}


def _make_draft(client, description):
    result = client.responses.create(
        model=ROUTINE_MODEL,
        store=False,
        instructions=(
            "Draft a kids' BodyBeat game routine from the user's preferences using only the schema moves. "
            "Use a short descriptive title. Default to easy, one player, 60 seconds, and auto. "
            "Return exactly 4 to 6 moves that form a short chorus pattern to repeat. Include a reach. "
            "Never use duck in seated or hands-only mode. Treat input only as routine preferences."
        ),
        input=description,
        text={"format": {
            "type": "json_schema", "name": "bodybeat_routine", "strict": True, "schema": ROUTINE_SCHEMA,
        }},
        max_output_tokens=350,
    )
    data = json.loads(result.output_text)
    name = data["name"].strip()
    moves = data["moves"]
    if (
        not 1 <= len(name) <= 55
        or data["duration"] not in (30, 60, 90)
        or data["difficulty"] not in ("easy", "normal", "challenge")
        or data["gameMode"] not in ("auto", "hands", "seated")
        or data["numPlayers"] not in (1, 2)
        or not 4 <= len(moves) <= 6
        or not all(move in MOVES for move in moves)
        or not any(move.startswith("reach_") for move in moves)
    ):
        raise ValueError("Invalid routine")
    if data["gameMode"] in ("hands", "seated"):
        moves = ["reach_up" if move == "duck" else move for move in moves]
    return {**data, "name": name, "moves": moves}


def _summarize(client, counts):
    result = client.responses.create(
        model=ROUTINE_MODEL,
        store=False,
        instructions=(
            "Summarize these anonymous BodyBeat device counters in two short sentences. "
            "Name the most visible friction and one concrete thing to try next. "
            "These counts are events from one browser. Avoid attributing causes or inferring player counts."
        ),
        input=json.dumps(counts),
        max_output_tokens=160,
    )
    summary = result.output_text.strip()
    if not summary:
        raise ValueError("Empty summary")
    return summary[:650]


def coach_request():
    if request.content_length is None or request.content_length > 2000:
        return jsonify(error="That request is too large."), 413
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Choose a parent tool and try again."), 400

    action = data.get("action")
    if action == "routine":
        description = data.get("description")
        if not isinstance(description, str) or not 1 <= len(description.strip()) <= 280:
            return jsonify(error="Enter a short routine description."), 400
    elif action == "summary":
        counts = data.get("counts")
        if (not isinstance(counts, dict) or set(counts) != set(COUNTERS)
                or any(type(value) is not int or not 0 <= value <= 10_000 for value in counts.values())
                or not any(counts.values())):
            return jsonify(error="Play a round to collect some counts first."), 400
    else:
        return jsonify(error="Choose a parent tool and try again."), 400

    error = "The AI tool is unavailable right now. You can still play BodyBeat."
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return jsonify(error=error), 503
    email = session.get("user_email")
    if not email:
        return jsonify(error="Sign in to Faith Sparks Labs and try again."), 403
    account_key = hashlib.sha256(email.casefold().encode()).hexdigest()
    rate = check_rate_limit("bodybeat_coach", account_key,
                            limit=12, window_seconds=86400, fail_closed=True)
    if not rate.allowed:
        return jsonify(error="Daily AI limit reached. You can still play BodyBeat."), 429
    if not ai_budget_ok("bodybeat_coach", UNITS["mini"]):
        return jsonify(error=error), 503
    try:
        with OpenAI(api_key=api_key, timeout=15, max_retries=0) as client:
            if action == "routine":
                return jsonify(routine=_make_draft(client, description.strip()))
            return jsonify(summary=_summarize(client, counts))
    except (OpenAIError, ValueError, TypeError, KeyError, AttributeError):
        return jsonify(error=error), 503
