"""Deterministic family-logistics analysis for the WeekFlow experiment.

Calendar events say what happens. This module adds the household work around
them: responsible adults, travel buffers, recurring rules, and resource
conflicts. It deliberately suggests changes without silently applying them.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass

MAX_PEOPLE = 12
MAX_EVENTS = 40
MAX_RULES = 24
DAY_START = 15 * 60
DAY_END = 20 * 60


@dataclass(frozen=True)
class Reservation:
    resource_id: str
    event_id: str
    start_minute: int
    end_minute: int
    reason: str
    ride_group_id: str | None = None
    location_id: str | None = None


def default_logistics_scenario() -> dict[str, object]:
    """Return the fictional Tuesday used to prove the logistics concept."""

    return {
        "schema_version": 1,
        "day_label": "Tuesday",
        "people": [
            {"id": "dad", "name": "Dad", "role": "adult", "color": "#315f53"},
            {"id": "mom", "name": "Mom", "role": "adult", "color": "#d45e86"},
            {
                "id": "grandma",
                "name": "Grandma",
                "role": "adult",
                "color": "#a06d35",
                "household_member": False,
                "confirmed": True,
                "available_windows": [
                    {"start_minute": 15 * 60, "end_minute": 20 * 60}
                ],
            },
            {
                "id": "avery",
                "name": "Avery",
                "role": "child",
                "color": "#6657d9",
            },
            {
                "id": "maya",
                "name": "Maya",
                "role": "child",
                "color": "#168a80",
            },
            {
                "id": "lucy",
                "name": "Lucy",
                "role": "child",
                "color": "#4776c5",
            },
        ],
        "rules": [
            {
                "id": "football-driver",
                "series_id": "fall-football",
                "label": "Dad normally drives football",
                "adult_id": "dad",
                "fallback_adult_ids": ["grandma"],
                "travel_before": 20,
                "travel_after": 20,
            },
            {
                "id": "dance-driver",
                "series_id": "fall-dance",
                "label": "Mom normally drives dance",
                "adult_id": "mom",
                "fallback_adult_ids": ["grandma"],
                "travel_before": 15,
                "travel_after": 15,
            },
        ],
        "events": [
            {
                "id": "dad-appointment",
                "title": "Dad's appointment",
                "kind": "adult_commitment",
                "start_minute": 16 * 60,
                "end_minute": 17 * 60,
                "participant_ids": ["dad"],
                "requires_adult": False,
                "series_id": None,
                "assigned_adult_id": None,
                "travel_before": 25,
                "travel_after": 25,
                "fixed": True,
            },
            {
                "id": "football",
                "title": "Football practice",
                "kind": "child_activity",
                "start_minute": 17 * 60,
                "end_minute": 18 * 60 + 30,
                "participant_ids": ["avery", "maya"],
                "requires_adult": True,
                "series_id": "fall-football",
                "assigned_adult_id": None,
                "travel_before": None,
                "travel_after": None,
                "fixed": True,
            },
            {
                "id": "dance",
                "title": "Dance class",
                "kind": "child_activity",
                "start_minute": 17 * 60 + 30,
                "end_minute": 18 * 60 + 30,
                "participant_ids": ["lucy"],
                "requires_adult": True,
                "series_id": "fall-dance",
                "assigned_adult_id": None,
                "travel_before": None,
                "travel_after": None,
                "fixed": True,
            },
        ],
    }


def family_four_school_sports_scenario() -> dict[str, object]:
    """Return a two-parent, two-child day with school and sports handoffs."""

    return {
        "schema_version": 1,
        "day_label": "Monday",
        "people": [
            {"id": "dad", "name": "Dad", "role": "adult", "color": "#315f53"},
            {"id": "mom", "name": "Mom", "role": "adult", "color": "#d45e86"},
            {
                "id": "ethan",
                "name": "Ethan (13)",
                "role": "child",
                "color": "#6657d9",
            },
            {
                "id": "sophie",
                "name": "Sophie (9)",
                "role": "child",
                "color": "#168a80",
            },
        ],
        "rules": [
            {
                "id": "school-driver",
                "series_id": "school-week",
                "label": "Dad normally handles the school run",
                "adult_id": "dad",
                "fallback_adult_ids": ["mom"],
                "travel_before": 20,
                "travel_after": 20,
            },
            {
                "id": "football-driver",
                "series_id": "ethan-football",
                "label": "Dad normally drives football",
                "adult_id": "dad",
                "fallback_adult_ids": ["mom"],
                "travel_before": 25,
                "travel_after": 25,
            },
            {
                "id": "gymnastics-driver",
                "series_id": "sophie-gymnastics",
                "label": "Mom normally handles gymnastics",
                "adult_id": "mom",
                "fallback_adult_ids": ["dad"],
                "travel_before": 20,
                "travel_after": 20,
            },
        ],
        "events": [
            {
                "id": "dad-appointment",
                "title": "Dad's appointment",
                "kind": "adult_commitment",
                "start_minute": 15 * 60 + 30,
                "end_minute": 16 * 60 + 30,
                "participant_ids": ["dad"],
                "requires_adult": False,
                "series_id": None,
                "assigned_adult_id": None,
                "travel_before": 20,
                "travel_after": 20,
                "fixed": True,
            },
            {
                "id": "mom-client-call",
                "title": "Mom's client call",
                "kind": "adult_commitment",
                "start_minute": 15 * 60,
                "end_minute": 16 * 60,
                "participant_ids": ["mom"],
                "requires_adult": False,
                "series_id": None,
                "assigned_adult_id": None,
                "travel_before": 0,
                "travel_after": 0,
                "fixed": True,
            },
            {
                "id": "school",
                "title": "School day",
                "kind": "child_activity",
                "start_minute": 8 * 60,
                "end_minute": 15 * 60,
                "participant_ids": ["ethan", "sophie"],
                "requires_adult": True,
                "responsibility_mode": "transport",
                "series_id": "school-week",
                "assigned_adult_id": None,
                "dropoff_adult_id": None,
                "pickup_adult_id": None,
                "travel_before": None,
                "travel_after": None,
                "fixed": True,
            },
            {
                "id": "football",
                "title": "Football practice",
                "kind": "child_activity",
                "start_minute": 16 * 60 + 30,
                "end_minute": 18 * 60 + 30,
                "participant_ids": ["ethan"],
                "requires_adult": True,
                "responsibility_mode": "transport",
                "series_id": "ethan-football",
                "assigned_adult_id": None,
                "dropoff_adult_id": None,
                "pickup_adult_id": None,
                "travel_before": None,
                "travel_after": None,
                "fixed": True,
            },
            {
                "id": "gymnastics",
                "title": "Gymnastics",
                "kind": "child_activity",
                "start_minute": 17 * 60 + 30,
                "end_minute": 19 * 60,
                "participant_ids": ["sophie"],
                "requires_adult": True,
                "responsibility_mode": "throughout",
                "series_id": "sophie-gymnastics",
                "assigned_adult_id": None,
                "travel_before": None,
                "travel_after": None,
                "fixed": True,
            },
        ],
    }


def _safe_id(value: object, field: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 80
        or not all(character.isalnum() or character in "-_" for character in value)
    ):
        raise ValueError(f"{field} must be a safe identifier")
    return value


def _name(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 120:
        raise ValueError(f"{field} must be between 1 and 120 characters")
    return value.strip()


def _minute(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 1440:
        raise ValueError(f"{field} must be minutes within one day")
    return value


def _buffer(value: object, field: str, *, allow_none: bool = False) -> int | None:
    if allow_none and value is None:
        return None
    minute = _minute(value, field)
    if minute > 180:
        raise ValueError(f"{field} must not exceed 180 minutes")
    return minute


def normalize_logistics_scenario(
    scenario: dict[str, object] | None = None,
) -> dict[str, object]:
    """Validate a logistics scenario at the API boundary."""

    raw = deepcopy(default_logistics_scenario() if scenario is None else scenario)
    if not isinstance(raw, dict):
        raise TypeError("scenario must be a JSON object")
    people = raw.get("people")
    rules = raw.get("rules")
    events = raw.get("events")
    if not isinstance(people, list) or not 2 <= len(people) <= MAX_PEOPLE:
        raise ValueError(f"people must contain between 2 and {MAX_PEOPLE} people")
    if not isinstance(rules, list) or len(rules) > MAX_RULES:
        raise ValueError(f"rules must contain at most {MAX_RULES} items")
    if not isinstance(events, list) or not 1 <= len(events) <= MAX_EVENTS:
        raise ValueError(f"events must contain between 1 and {MAX_EVENTS} items")

    normalized_people: list[dict[str, object]] = []
    person_ids: set[str] = set()
    for person in people:
        if not isinstance(person, dict):
            raise TypeError("each person must be a JSON object")
        person_id = _safe_id(person.get("id"), "person.id")
        if person_id in person_ids:
            raise ValueError("person ids must be unique")
        role = person.get("role")
        if role not in {"adult", "child"}:
            raise ValueError("person.role must be adult or child")
        color = person.get("color", "#315f53")
        if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
            raise ValueError("person.color must use six-digit hex")
        try:
            int(color[1:], 16)
        except ValueError as exc:
            raise ValueError("person.color must use six-digit hex") from exc
        household_member = person.get("household_member", True)
        if not isinstance(household_member, bool):
            raise TypeError("person.household_member must be a boolean")
        confirmed = person.get("confirmed", household_member)
        if not isinstance(confirmed, bool):
            raise TypeError("person.confirmed must be a boolean")
        raw_windows = person.get("available_windows", [])
        if not isinstance(raw_windows, list) or len(raw_windows) > 14:
            raise ValueError("person.available_windows must contain at most 14 windows")
        available_windows = []
        for window in raw_windows:
            if not isinstance(window, dict):
                raise TypeError("each availability window must be a JSON object")
            window_start = _minute(
                window.get("start_minute"), "availability.start_minute"
            )
            window_end = _minute(
                window.get("end_minute"), "availability.end_minute"
            )
            if window_end <= window_start:
                raise ValueError("availability end must be later than its start")
            available_windows.append(
                {"start_minute": window_start, "end_minute": window_end}
            )
        person_ids.add(person_id)
        normalized_people.append(
            {
                "id": person_id,
                "name": _name(person.get("name"), "person.name"),
                "role": role,
                "color": color.lower(),
                "household_member": household_member,
                "confirmed": confirmed,
                "available_windows": available_windows,
            }
        )
    roles = {person["id"]: person["role"] for person in normalized_people}
    adult_ids = {person_id for person_id, role in roles.items() if role == "adult"}
    if not adult_ids:
        raise ValueError("at least one adult is required")

    normalized_rules: list[dict[str, object]] = []
    rule_ids: set[str] = set()
    series_ids: set[str] = set()
    for rule in rules:
        if not isinstance(rule, dict):
            raise TypeError("each rule must be a JSON object")
        rule_id = _safe_id(rule.get("id"), "rule.id")
        series_id = _safe_id(rule.get("series_id"), "rule.series_id")
        adult_id = rule.get("adult_id")
        fallbacks = rule.get("fallback_adult_ids", [])
        if rule_id in rule_ids or series_id in series_ids:
            raise ValueError("rule ids and series ids must be unique")
        if adult_id not in adult_ids:
            raise ValueError("rule.adult_id must identify an adult")
        dropoff_adult_id = rule.get("dropoff_adult_id")
        pickup_adult_id = rule.get("pickup_adult_id")
        if dropoff_adult_id is not None and dropoff_adult_id not in adult_ids:
            raise ValueError("rule.dropoff_adult_id must identify an adult")
        if pickup_adult_id is not None and pickup_adult_id not in adult_ids:
            raise ValueError("rule.pickup_adult_id must identify an adult")
        if not isinstance(fallbacks, list) or not all(
            fallback in adult_ids for fallback in fallbacks
        ):
            raise ValueError("fallback_adult_ids must identify adults")
        rule_ids.add(rule_id)
        series_ids.add(series_id)
        normalized_rules.append(
            {
                "id": rule_id,
                "series_id": series_id,
                "label": _name(rule.get("label"), "rule.label"),
                "adult_id": adult_id,
                "dropoff_adult_id": dropoff_adult_id,
                "pickup_adult_id": pickup_adult_id,
                "fallback_adult_ids": list(dict.fromkeys(fallbacks)),
                "travel_before": _buffer(rule.get("travel_before", 0), "rule.travel_before"),
                "travel_after": _buffer(rule.get("travel_after", 0), "rule.travel_after"),
            }
        )

    normalized_events: list[dict[str, object]] = []
    event_ids: set[str] = set()
    for event in events:
        if not isinstance(event, dict):
            raise TypeError("each event must be a JSON object")
        event_id = _safe_id(event.get("id"), "event.id")
        if event_id in event_ids:
            raise ValueError("event ids must be unique")
        kind = event.get("kind")
        if kind not in {"adult_commitment", "child_activity"}:
            raise ValueError("event.kind must be adult_commitment or child_activity")
        start = _minute(event.get("start_minute"), "event.start_minute")
        end = _minute(event.get("end_minute"), "event.end_minute")
        if end <= start:
            raise ValueError("event end must be later than its start")
        participants = event.get("participant_ids")
        if not isinstance(participants, list) or not participants or not all(
            participant in person_ids for participant in participants
        ):
            raise ValueError("event.participant_ids must identify known people")
        if kind == "adult_commitment" and not all(
            participant in adult_ids for participant in participants
        ):
            raise ValueError("adult commitments may only list adults")
        if kind == "child_activity" and not all(
            roles[participant] == "child" for participant in participants
        ):
            raise ValueError("child activities may only list children")
        requires_adult = event.get("requires_adult", kind == "child_activity")
        if not isinstance(requires_adult, bool):
            raise TypeError("event.requires_adult must be a boolean")
        responsibility_mode = event.get(
            "responsibility_mode", "throughout" if requires_adult else "none"
        )
        if responsibility_mode not in {"none", "transport", "throughout"}:
            raise ValueError(
                "event.responsibility_mode must be none, transport, or throughout"
            )
        if requires_adult != (responsibility_mode != "none"):
            raise ValueError(
                "event.requires_adult and responsibility_mode must agree"
            )
        if kind == "adult_commitment" and responsibility_mode != "none":
            raise ValueError("adult commitments cannot assign a supervising adult")
        series_id = event.get("series_id")
        if series_id is not None:
            series_id = _safe_id(series_id, "event.series_id")
        ride_group_id = event.get("ride_group_id")
        if ride_group_id is not None:
            ride_group_id = _safe_id(ride_group_id, "event.ride_group_id")
        location_id = event.get("location_id")
        if location_id is not None:
            location_id = _safe_id(location_id, "event.location_id")
        assigned_adult = event.get("assigned_adult_id")
        if assigned_adult is not None and assigned_adult not in adult_ids:
            raise ValueError("event.assigned_adult_id must identify an adult")
        dropoff_adult = event.get("dropoff_adult_id")
        pickup_adult = event.get("pickup_adult_id")
        if dropoff_adult is not None and dropoff_adult not in adult_ids:
            raise ValueError("event.dropoff_adult_id must identify an adult")
        if pickup_adult is not None and pickup_adult not in adult_ids:
            raise ValueError("event.pickup_adult_id must identify an adult")
        fixed = event.get("fixed", True)
        if not isinstance(fixed, bool):
            raise TypeError("event.fixed must be a boolean")
        event_ids.add(event_id)
        normalized_events.append(
            {
                "id": event_id,
                "title": _name(event.get("title"), "event.title"),
                "kind": kind,
                "start_minute": start,
                "end_minute": end,
                "participant_ids": list(dict.fromkeys(participants)),
                "requires_adult": requires_adult,
                "responsibility_mode": responsibility_mode,
                "series_id": series_id,
                "ride_group_id": ride_group_id,
                "location_id": location_id,
                "assigned_adult_id": assigned_adult,
                "dropoff_adult_id": dropoff_adult,
                "pickup_adult_id": pickup_adult,
                "travel_before": _buffer(
                    event.get("travel_before"),
                    "event.travel_before",
                    allow_none=True,
                ),
                "travel_after": _buffer(
                    event.get("travel_after"),
                    "event.travel_after",
                    allow_none=True,
                ),
                "fixed": fixed,
            }
        )

    day_label = raw.get("day_label", "Family day")
    return {
        "schema_version": 1,
        "day_label": _name(day_label, "day_label"),
        "people": normalized_people,
        "rules": normalized_rules,
        "events": normalized_events,
    }


def _fmt_time(minute: int) -> str:
    hour, minutes = divmod(minute, 60)
    return f"{hour % 12 or 12}:{minutes:02d} {'AM' if hour < 12 else 'PM'}"


def _availability_blocker(
    adult: dict[str, object], start_minute: int, end_minute: int
) -> tuple[str, str] | None:
    if not adult["confirmed"]:
        return "confirmation", "their help has not been confirmed"
    windows = adult["available_windows"]
    if windows and not any(
        window["start_minute"] <= start_minute
        and end_minute <= window["end_minute"]
        for window in windows
    ):
        return "availability", "they are not marked available for that whole window"
    if not adult["household_member"] and not windows:
        return "availability", "no availability window has been confirmed"
    return None


def analyze_family_logistics(
    scenario: dict[str, object] | None = None,
) -> dict[str, object]:
    """Resolve responsibility rules, then report conflicts and safe alternatives."""

    normalized = normalize_logistics_scenario(scenario)
    people = {person["id"]: person for person in normalized["people"]}
    adults = [
        person for person in normalized["people"] if person["role"] == "adult"
    ]
    rules = {rule["series_id"]: rule for rule in normalized["rules"]}
    reservations: list[Reservation] = []
    assignments: list[dict[str, object]] = []
    counted_rides: set[tuple[object, ...]] = set()

    for event in normalized["events"]:
        rule = rules.get(event["series_id"])
        default_adult_id = event["assigned_adult_id"] or (
            rule["adult_id"] if event["requires_adult"] and rule else None
        )
        travel_before = (
            event["travel_before"]
            if event["travel_before"] is not None
            else rule["travel_before"] if rule else 0
        )
        travel_after = (
            event["travel_after"]
            if event["travel_after"] is not None
            else rule["travel_after"] if rule else 0
        )
        responsibility_start = event["start_minute"] - travel_before
        responsibility_end = event["end_minute"] + travel_after
        if responsibility_start < 0 or responsibility_end > 24 * 60:
            raise ValueError("event travel must remain within the same day")
        responsibility_mode = event["responsibility_mode"]
        responsibilities: list[dict[str, object]] = []
        if responsibility_mode == "throughout":
            responsibilities.append(
                {
                    "kind": "throughout",
                    "adult_id": default_adult_id,
                    "start_minute": responsibility_start,
                    "end_minute": responsibility_end,
                }
            )
        elif responsibility_mode == "transport":
            dropoff_adult_id = (
                event["dropoff_adult_id"]
                or (rule["dropoff_adult_id"] if rule else None)
                or default_adult_id
            )
            pickup_adult_id = (
                event["pickup_adult_id"]
                or (rule["pickup_adult_id"] if rule else None)
                or default_adult_id
            )
            responsibilities.extend(
                [
                    {
                        "kind": "dropoff",
                        "adult_id": dropoff_adult_id,
                        "start_minute": responsibility_start,
                        "end_minute": event["start_minute"] + travel_after,
                    },
                    {
                        "kind": "pickup",
                        "adult_id": pickup_adult_id,
                        "start_minute": event["end_minute"] - travel_before,
                        "end_minute": responsibility_end,
                    },
                ]
            )
        for responsibility in responsibilities:
            configured_adult_id = responsibility["adult_id"]
            blocker = (
                _availability_blocker(
                    people[configured_adult_id],
                    responsibility["start_minute"],
                    responsibility["end_minute"],
                )
                if configured_adult_id
                else None
            )
            if blocker:
                blocker_kind, blocker_reason = blocker
                responsibility["configured_adult_id"] = configured_adult_id
                responsibility["availability_blocker"] = {
                    "kind": blocker_kind,
                    "reason": blocker_reason,
                }
                responsibility["adult_id"] = None
            responsibility["adult_name"] = (
                people[responsibility["adult_id"]]["name"]
                if responsibility["adult_id"]
                else None
            )
            responsibility["window"] = (
                f"{_fmt_time(responsibility['start_minute'])}–"
                f"{_fmt_time(responsibility['end_minute'])}"
            )
        has_occurrence_override = bool(
            event["assigned_adult_id"]
            or event["dropoff_adult_id"]
            or event["pickup_adult_id"]
        )
        source = (
            "occurrence"
            if has_occurrence_override
            else "series_rule" if any(item["adult_id"] for item in responsibilities)
            else "unassigned"
        )
        ride_key = (
            event["ride_group_id"],
            event["location_id"],
            event["start_minute"],
            event["end_minute"],
            travel_before,
            travel_after,
        )
        shared_ride_duplicate = bool(
            responsibility_mode == "transport"
            and event["ride_group_id"]
            and ride_key in counted_rides
        )
        if responsibility_mode == "transport" and event["ride_group_id"]:
            counted_rides.add(ride_key)
        assignment = {
            **event,
            "adult_id": default_adult_id,
            "adult_name": (
                people[default_adult_id]["name"] if default_adult_id else None
            ),
            "assignment_source": source,
            "rule_label": rule["label"] if rule else None,
            "travel_before": travel_before,
            "travel_after": travel_after,
            "invisible_travel_minutes": (
                0
                if shared_ride_duplicate
                else (travel_before + travel_after)
                * (2 if responsibility_mode == "transport" else 1)
            ),
            "shared_ride_duplicate": shared_ride_duplicate,
            "responsibility_start": responsibility_start,
            "responsibility_end": responsibility_end,
            "responsibility_window": (
                f"{_fmt_time(responsibility_start)}–{_fmt_time(responsibility_end)}"
            ),
            "responsibilities": responsibilities,
            "participant_names": [
                people[participant]["name"] for participant in event["participant_ids"]
            ],
        }
        assignments.append(assignment)

        for participant_id in event["participant_ids"]:
            reservations.append(
                Reservation(
                    participant_id,
                    event["id"],
                    responsibility_start,
                    responsibility_end,
                    "participant",
                    event["ride_group_id"],
                    event["location_id"],
                )
            )
        for responsibility in responsibilities:
            adult_id = responsibility["adult_id"]
            if adult_id and adult_id not in event["participant_ids"]:
                reservation = Reservation(
                    adult_id,
                    event["id"],
                    responsibility["start_minute"],
                    responsibility["end_minute"],
                    (
                        "responsible_adult"
                        if responsibility["kind"] == "throughout"
                        else responsibility["kind"]
                    ),
                    event["ride_group_id"],
                    event["location_id"],
                )
                duplicate_ride_reservation = bool(
                    reservation.ride_group_id
                    and reservation.location_id
                    and any(
                        existing.resource_id == reservation.resource_id
                        and existing.ride_group_id == reservation.ride_group_id
                        and existing.location_id == reservation.location_id
                        and existing.reason == reservation.reason
                        and existing.start_minute == reservation.start_minute
                        and existing.end_minute == reservation.end_minute
                        for existing in reservations
                    )
                )
                if not duplicate_ride_reservation:
                    reservations.append(reservation)

    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    issues: list[dict[str, object]] = []
    seen_pairs: set[tuple[str, ...]] = set()
    for index, left in enumerate(reservations):
        for right in reservations[index + 1 :]:
            if left.resource_id != right.resource_id or left.event_id == right.event_id:
                continue
            overlap = min(left.end_minute, right.end_minute) - max(
                left.start_minute, right.start_minute
            )
            if overlap <= 0:
                continue
            same_confirmed_ride = bool(
                people[left.resource_id]["role"] == "adult"
                and left.ride_group_id
                and left.ride_group_id == right.ride_group_id
                and left.location_id
                and left.location_id == right.location_id
                and left.reason == right.reason
                and left.start_minute == right.start_minute
                and left.end_minute == right.end_minute
            )
            if same_confirmed_ride:
                continue
            pair = tuple(sorted((left.event_id, right.event_id)))
            reasons_by_event = {
                left.event_id: left.reason,
                right.event_id: right.reason,
            }
            key = (
                left.resource_id,
                *pair,
                *(reasons_by_event[event_id] for event_id in pair),
            )
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            person = people[left.resource_id]
            issues.append(
                {
                    "kind": f"{person['role']}_conflict",
                    "resource_id": left.resource_id,
                    "resource_name": person["name"],
                    "event_ids": list(pair),
                    "event_titles": [assignments_by_id[item]["title"] for item in pair],
                    "responsibility_kinds": reasons_by_event,
                    "overlap_minutes": overlap,
                    "title": f"{person['name']} is needed in two places",
                    "body": (
                        f"{assignments_by_id[pair[0]]['title']} overlaps "
                        f"{assignments_by_id[pair[1]]['title']} by {overlap} minutes "
                        "after travel is included."
                    ),
                }
            )
    seen_unassigned: set[tuple[object, ...]] = set()
    for assignment in assignments:
        for responsibility in assignment["responsibilities"]:
            if responsibility["adult_id"]:
                continue
            shared_key = (
                assignment["ride_group_id"],
                assignment["location_id"],
                assignment["start_minute"],
                assignment["end_minute"],
                responsibility["kind"],
            )
            unassigned_key = (
                shared_key
                if assignment["ride_group_id"] and assignment["location_id"]
                else (assignment["id"], responsibility["kind"])
            )
            if unassigned_key in seen_unassigned:
                continue
            seen_unassigned.add(unassigned_key)
            label = (
                "responsible adult"
                if responsibility["kind"] == "throughout"
                else f"{responsibility['kind']} driver"
            )
            issues.append(
                {
                    "kind": "unassigned",
                    "resource_id": None,
                    "resource_name": None,
                    "event_ids": [assignment["id"]],
                    "event_titles": [assignment["title"]],
                    "responsibility_kinds": {
                        assignment["id"]: responsibility["kind"]
                    },
                    "overlap_minutes": 0,
                    "title": f"{assignment['title']} has no {label}",
                    "body": (
                        "The calendar event exists, but part of its transportation "
                        "or supervision is still unowned."
                    ),
                }
            )

    suggestions: list[dict[str, object]] = []
    suggested_responsibilities: set[tuple[str, str]] = set()
    for issue in issues:
        candidate_events = []
        if issue["kind"] in {"adult_conflict", "unassigned"}:
            candidate_events = [
                assignments_by_id[event_id]
                for event_id in issue["event_ids"]
                if assignments_by_id[event_id]["kind"] == "child_activity"
            ]
        for assignment in candidate_events:
            raw_kind = issue["responsibility_kinds"].get(assignment["id"])
            responsibility_kind = (
                "throughout" if raw_kind == "responsible_adult" else raw_kind
            )
            target = next(
                (
                    item
                    for item in assignment["responsibilities"]
                    if item["kind"] == responsibility_kind
                ),
                None,
            )
            if target is None:
                continue
            suggestion_key = (assignment["id"], responsibility_kind)
            if suggestion_key in suggested_responsibilities:
                continue
            rule = rules.get(assignment["series_id"])
            ordered_candidates = [
                *(rule["fallback_adult_ids"] if rule else []),
                *(adult["id"] for adult in adults),
            ]
            available_adults: list[str] = []
            blocked_alternatives: list[dict[str, str]] = []
            for adult_id in dict.fromkeys(ordered_candidates):
                if adult_id == target["adult_id"]:
                    continue
                blocker = _availability_blocker(
                    people[adult_id], target["start_minute"], target["end_minute"]
                )
                if blocker:
                    blocker_kind, reason = blocker
                    blocked_alternatives.append(
                        {
                            "adult_id": adult_id,
                            "adult_name": people[adult_id]["name"],
                            "blocker_kind": blocker_kind,
                            "reason": reason,
                        }
                    )
                    continue
                conflict = next(
                    (
                        reservation
                        for reservation in reservations
                        if reservation.resource_id == adult_id
                        and reservation.event_id != assignment["id"]
                        and reservation.start_minute < target["end_minute"]
                        and target["start_minute"] < reservation.end_minute
                    ),
                    None,
                )
                if conflict:
                    blocked_alternatives.append(
                        {
                            "adult_id": adult_id,
                            "adult_name": people[adult_id]["name"],
                            "blocked_by": assignments_by_id[conflict.event_id]["title"],
                        }
                    )
                else:
                    available_adults.append(adult_id)
            if available_adults:
                adult_id = available_adults[0]
                adult_name = people[adult_id]["name"]
                responsibility_label = (
                    ""
                    if responsibility_kind == "throughout"
                    else f" {responsibility_kind.replace('off', '-off')}"
                )
                blocked_text = (
                    " "
                    + " ".join(
                        (
                            f"{item['adult_name']} cannot cover because "
                            f"{item['reason']}."
                            if item.get("reason")
                            else f"{item['adult_name']} cannot cover because "
                            f"{item['blocked_by']} already occupies that window."
                        )
                        for item in blocked_alternatives
                    )
                    if blocked_alternatives
                    else ""
                )
                suggestion = {
                    "kind": "reassign",
                    "event_id": assignment["id"],
                    "adult_id": adult_id,
                    "title": (
                        f"Ask {adult_name} to handle {assignment['title']}"
                        f"{responsibility_label}"
                    ),
                    "body": (
                        f"{adult_name} is free for the full "
                        f"{target['window']} responsibility "
                        "window. Apply this once or remember it for the recurring "
                        f"series.{blocked_text}"
                    ),
                    "blocked_alternatives": blocked_alternatives,
                    "resolves_issue": issue["title"],
                }
                if responsibility_kind != "throughout":
                    suggestion["responsibility_kind"] = responsibility_kind
                suggestions.append(suggestion)
                suggested_responsibilities.add(suggestion_key)
            else:
                confirmation = next(
                    (
                        item
                        for item in blocked_alternatives
                        if item.get("blocker_kind") == "confirmation"
                    ),
                    None,
                )
                suggestion = {
                    "kind": "confirm_helper" if confirmation else "external_help",
                    "event_id": assignment["id"],
                    "adult_id": confirmation["adult_id"] if confirmation else None,
                    "title": (
                        f"Confirm {confirmation['adult_name']} before assigning "
                        f"{assignment['title']}"
                        if confirmation
                        else (
                            f"Find another adult for {assignment['title']} "
                            f"{responsibility_kind.replace('off', '-off')}"
                            if responsibility_kind != "throughout"
                            else f"Find another driver or move {assignment['title']}"
                        )
                    ),
                    "body": (
                        f"{confirmation['adult_name']} is saved as a possible "
                        "helper, but WeekFlow will not count that help until it is "
                        "confirmed."
                        if confirmation
                        else (
                            "Every saved adult is already occupied or unavailable "
                            f"for part of the {target['window']} responsibility window."
                        )
                    ),
                    "blocked_alternatives": blocked_alternatives,
                    "resolves_issue": issue["title"],
                }
                if responsibility_kind != "throughout":
                    suggestion["responsibility_kind"] = responsibility_kind
                suggestions.append(suggestion)
                suggested_responsibilities.add(suggestion_key)
        if not candidate_events:
            suggestions.append(
                {
                    "kind": "move_flexible",
                    "event_id": issue["event_ids"][0],
                    "adult_id": issue["resource_id"],
                    "title": f"Move one of {issue['resource_name']}'s commitments",
                    "body": "No responsibility reassignment can resolve two fixed adult commitments.",
                    "resolves_issue": issue["title"],
                }
            )

    timeline = {
        person["id"]: [
            {
                "event_id": reservation.event_id,
                "title": assignments_by_id[reservation.event_id]["title"],
                "start_minute": reservation.start_minute,
                "end_minute": reservation.end_minute,
                "start": _fmt_time(reservation.start_minute),
                "end": _fmt_time(reservation.end_minute),
                "reason": reservation.reason,
                "ride_group_id": reservation.ride_group_id,
                "location_id": reservation.location_id,
                "conflict": any(
                    issue["resource_id"] == person["id"]
                    and reservation.event_id in issue["event_ids"]
                    and issue.get("responsibility_kinds", {}).get(
                        reservation.event_id
                    )
                    == reservation.reason
                    for issue in issues
                ),
            }
            for reservation in sorted(
                reservations,
                key=lambda item: (item.start_minute, item.end_minute, item.event_id),
            )
            if reservation.resource_id == person["id"]
        ]
        for person in normalized["people"]
    }
    return {
        "scenario": normalized,
        "assignments": assignments,
        "issues": issues,
        "suggestions": suggestions,
        "timeline": timeline,
        "issue_count": len(issues),
        "unassigned_count": sum(issue["kind"] == "unassigned" for issue in issues),
        "status": "workable" if not issues else "needs_decision",
    }


def apply_responsibility_change(
    scenario: dict[str, object],
    *,
    event_id: str,
    adult_id: str,
    scope: str,
    responsibility_kind: str | None = None,
) -> dict[str, object]:
    """Apply an explicit occurrence or recurring-series responsibility change."""

    normalized = normalize_logistics_scenario(scenario)
    adults = {
        person["id"] for person in normalized["people"] if person["role"] == "adult"
    }
    if adult_id not in adults:
        raise ValueError("adult_id must identify an adult")
    if scope not in {"occurrence", "series"}:
        raise ValueError("scope must be occurrence or series")
    event = next(
        (item for item in normalized["events"] if item["id"] == event_id), None
    )
    if event is None:
        raise ValueError("event_id must identify an event")
    if event["kind"] != "child_activity":
        raise ValueError("responsibility changes apply only to child activities")
    if responsibility_kind not in {None, "dropoff", "pickup", "throughout"}:
        raise ValueError(
            "responsibility_kind must be dropoff, pickup, or throughout"
        )
    if responsibility_kind in {"dropoff", "pickup"} and event[
        "responsibility_mode"
    ] != "transport":
        raise ValueError("dropoff and pickup changes require a transport event")
    segment_field = (
        f"{responsibility_kind}_adult_id"
        if responsibility_kind in {"dropoff", "pickup"}
        else None
    )
    selected_adult = next(
        person for person in normalized["people"] if person["id"] == adult_id
    )
    current_assignment = next(
        item
        for item in analyze_family_logistics(normalized)["assignments"]
        if item["id"] == event_id
    )
    target_responsibilities = [
        responsibility
        for responsibility in current_assignment["responsibilities"]
        if responsibility_kind in {None, responsibility["kind"]}
    ]
    for responsibility in target_responsibilities:
        blocker = _availability_blocker(
            selected_adult,
            responsibility["start_minute"],
            responsibility["end_minute"],
        )
        if blocker:
            _, reason = blocker
            raise ValueError(
                f"{selected_adult['name']} cannot be assigned: {reason}."
            )
    affected_events = [event]
    if event["ride_group_id"] and event["location_id"]:
        affected_events = [
            item
            for item in normalized["events"]
            if item["kind"] == "child_activity"
            and item["ride_group_id"] == event["ride_group_id"]
            and item["location_id"] == event["location_id"]
            and item["start_minute"] == event["start_minute"]
            and item["end_minute"] == event["end_minute"]
            and item["responsibility_mode"] == event["responsibility_mode"]
        ]

    if scope == "occurrence":
        for affected in affected_events:
            if segment_field:
                affected[segment_field] = adult_id
            else:
                affected["assigned_adult_id"] = adult_id
    else:
        if any(not affected["series_id"] for affected in affected_events):
            raise ValueError("a one-time event has no recurring series to update")
        adult_name = next(
            person["name"]
            for person in normalized["people"]
            if person["id"] == adult_id
        )
        updated_series: set[str] = set()
        for affected in affected_events:
            if affected["series_id"] in updated_series:
                continue
            rule = next(
                (
                    item
                    for item in normalized["rules"]
                    if item["series_id"] == affected["series_id"]
                ),
                None,
            )
            if rule is None:
                raise ValueError("the recurring series has no responsibility rule")
            rule_field = segment_field or "adult_id"
            previous = rule.get(rule_field) or rule["adult_id"]
            rule[rule_field] = adult_id
            responsibility_label = (
                f" {responsibility_kind.replace('off', '-off')}"
                if segment_field
                else ""
            )
            rule["label"] = (
                f"{adult_name} normally handles {affected['title']}"
                f"{responsibility_label}"
            )[:120]
            rule["fallback_adult_ids"] = [
                item
                for item in dict.fromkeys([previous, *rule["fallback_adult_ids"]])
                if item != adult_id
            ]
            updated_series.add(affected["series_id"])
        for affected in affected_events:
            if segment_field:
                affected[segment_field] = None
            else:
                affected["assigned_adult_id"] = None
    return normalized
