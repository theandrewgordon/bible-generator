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
MAX_LOCATIONS = 24
MAX_ROUTES = 80
MAX_VEHICLES = 8
MAX_SUPPORT_REQUESTS = 40
MAX_HISTORY_ROWS = 80
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
                "contact_method": "sms",
                "notification_opt_in": True,
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
        "support_requests": [
            {
                "id": "grandma-football-help",
                "kind": "helper",
                "event_id": "football",
                "adult_id": "grandma",
                "responsibility_kind": "throughout",
                "status": "accepted",
                "notification_status": "delivered",
            }
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
            {
                "id": "dad",
                "name": "Dad",
                "role": "adult",
                "color": "#315f53",
                "default_vehicle_id": "family-sedan",
            },
            {
                "id": "mom",
                "name": "Mom",
                "role": "adult",
                "color": "#d45e86",
                "default_vehicle_id": "family-suv",
            },
            {
                "id": "ethan",
                "name": "Ethan (13)",
                "role": "child",
                "color": "#6657d9",
                "requires_car_seat": False,
            },
            {
                "id": "sophie",
                "name": "Sophie (9)",
                "role": "child",
                "color": "#168a80",
                "requires_car_seat": True,
            },
        ],
        "home_location_id": "home",
        "locations": [
            {"id": "home", "name": "Home"},
            {"id": "school-campus", "name": "School campus"},
            {"id": "clinic", "name": "Clinic"},
            {"id": "football-field", "name": "Football field"},
            {"id": "gym", "name": "Gymnastics center"},
        ],
        "routes": [
            {"from_location_id": "home", "to_location_id": "school-campus", "base_minutes": 15, "traffic_minutes": 5},
            {"from_location_id": "school-campus", "to_location_id": "home", "base_minutes": 15, "traffic_minutes": 5},
            {"from_location_id": "home", "to_location_id": "clinic", "base_minutes": 15, "traffic_minutes": 5},
            {"from_location_id": "clinic", "to_location_id": "home", "base_minutes": 15, "traffic_minutes": 5},
            {"from_location_id": "home", "to_location_id": "football-field", "base_minutes": 20, "traffic_minutes": 5},
            {"from_location_id": "football-field", "to_location_id": "home", "base_minutes": 20, "traffic_minutes": 5},
            {"from_location_id": "home", "to_location_id": "gym", "base_minutes": 15, "traffic_minutes": 5},
            {"from_location_id": "gym", "to_location_id": "home", "base_minutes": 15, "traffic_minutes": 5},
        ],
        "vehicles": [
            {
                "id": "family-sedan",
                "name": "Family sedan",
                "passenger_capacity": 3,
                "car_seat_capacity": 1,
                "available_adult_ids": ["dad"],
            },
            {
                "id": "family-suv",
                "name": "Family SUV",
                "passenger_capacity": 5,
                "car_seat_capacity": 2,
                "available_adult_ids": ["mom", "dad"],
            },
        ],
        "responsibility_history": [
            {"week_label": "Aug 10", "adult_id": "dad", "minutes": 185, "handoffs": 5},
            {"week_label": "Aug 10", "adult_id": "mom", "minutes": 135, "handoffs": 4},
            {"week_label": "Aug 17", "adult_id": "dad", "minutes": 210, "handoffs": 6},
            {"week_label": "Aug 17", "adult_id": "mom", "minutes": 150, "handoffs": 4},
            {"week_label": "Aug 24", "adult_id": "dad", "minutes": 170, "handoffs": 5},
            {"week_label": "Aug 24", "adult_id": "mom", "minutes": 160, "handoffs": 5},
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
                "vehicle_id": "family-sedan",
            },
            {
                "id": "football-driver",
                "series_id": "ethan-football",
                "label": "Dad normally drives football",
                "adult_id": "dad",
                "fallback_adult_ids": ["mom"],
                "travel_before": 25,
                "travel_after": 25,
                "vehicle_id": "family-sedan",
            },
            {
                "id": "gymnastics-driver",
                "series_id": "sophie-gymnastics",
                "label": "Mom normally handles gymnastics",
                "adult_id": "mom",
                "fallback_adult_ids": ["dad"],
                "travel_before": 20,
                "travel_after": 20,
                "vehicle_id": "family-suv",
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
                "location_id": "clinic",
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
                "location_id": "home",
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
                "location_id": "school-campus",
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
                "location_id": "football-field",
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
                "location_id": "gym",
                "fixed": True,
            },
        ],
    }


def family_four_carpool_scenario() -> dict[str, object]:
    """Return the family-of-four day with a pending outside carpool response."""

    scenario = family_four_school_sports_scenario()
    scenario["people"].append(
        {
            "id": "jordan",
            "name": "Jordan (carpool parent)",
            "role": "adult",
            "color": "#8a5b32",
            "household_member": False,
            "confirmed": True,
            "available_windows": [
                {"start_minute": 14 * 60, "end_minute": 16 * 60}
            ],
            "default_vehicle_id": "family-suv",
            "contact_method": "sms",
            "notification_opt_in": True,
        }
    )
    suv = next(
        vehicle
        for vehicle in scenario["vehicles"]
        if vehicle["id"] == "family-suv"
    )
    suv["available_adult_ids"].append("jordan")
    school_rule = next(
        rule for rule in scenario["rules"] if rule["series_id"] == "school-week"
    )
    school_rule["fallback_adult_ids"] = ["jordan", "mom"]
    scenario["support_requests"] = [
        {
            "id": "school-carpool-pickup",
            "kind": "carpool",
            "event_id": "school",
            "adult_id": "jordan",
            "responsibility_kind": "pickup",
            "status": "pending",
            "notification_status": "delivered",
        }
    ]
    return scenario


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
    locations = raw.get("locations", [])
    routes = raw.get("routes", [])
    vehicles = raw.get("vehicles", [])
    support_requests = raw.get("support_requests", [])
    responsibility_history = raw.get("responsibility_history", [])
    if not isinstance(people, list) or not 2 <= len(people) <= MAX_PEOPLE:
        raise ValueError(f"people must contain between 2 and {MAX_PEOPLE} people")
    if not isinstance(rules, list) or len(rules) > MAX_RULES:
        raise ValueError(f"rules must contain at most {MAX_RULES} items")
    if not isinstance(events, list) or not 1 <= len(events) <= MAX_EVENTS:
        raise ValueError(f"events must contain between 1 and {MAX_EVENTS} items")
    if not isinstance(locations, list) or len(locations) > MAX_LOCATIONS:
        raise ValueError(f"locations must contain at most {MAX_LOCATIONS} items")
    if not isinstance(routes, list) or len(routes) > MAX_ROUTES:
        raise ValueError(f"routes must contain at most {MAX_ROUTES} items")
    if not isinstance(vehicles, list) or len(vehicles) > MAX_VEHICLES:
        raise ValueError(f"vehicles must contain at most {MAX_VEHICLES} items")
    if (
        not isinstance(support_requests, list)
        or len(support_requests) > MAX_SUPPORT_REQUESTS
    ):
        raise ValueError(
            f"support_requests must contain at most {MAX_SUPPORT_REQUESTS} items"
        )
    if (
        not isinstance(responsibility_history, list)
        or len(responsibility_history) > MAX_HISTORY_ROWS
    ):
        raise ValueError(
            f"responsibility_history must contain at most {MAX_HISTORY_ROWS} items"
        )

    normalized_locations: list[dict[str, object]] = []
    location_ids: set[str] = set()
    for location in locations:
        if not isinstance(location, dict):
            raise TypeError("each location must be a JSON object")
        location_id = _safe_id(location.get("id"), "location.id")
        if location_id in location_ids:
            raise ValueError("location ids must be unique")
        location_ids.add(location_id)
        address = location.get("address")
        if address is not None:
            if (
                not isinstance(address, str)
                or not address.strip()
                or len(address.strip()) > 300
            ):
                raise ValueError(
                    "location.address must be between 1 and 300 characters"
                )
            address = address.strip()
        latitude = location.get("latitude")
        longitude = location.get("longitude")
        if (latitude is None) != (longitude is None):
            raise ValueError("location coordinates must include latitude and longitude")
        if latitude is not None and (
            not isinstance(latitude, (int, float))
            or isinstance(latitude, bool)
            or not -90 <= latitude <= 90
            or not isinstance(longitude, (int, float))
            or isinstance(longitude, bool)
            or not -180 <= longitude <= 180
        ):
            raise ValueError("location coordinates are invalid")
        normalized_locations.append(
            {
                "id": location_id,
                "name": _name(location.get("name"), "location.name"),
                "address": address,
                "latitude": latitude,
                "longitude": longitude,
            }
        )
    home_location_id = raw.get("home_location_id")
    if home_location_id is not None:
        home_location_id = _safe_id(home_location_id, "home_location_id")
        if home_location_id not in location_ids:
            raise ValueError("home_location_id must identify a location")

    normalized_routes: list[dict[str, object]] = []
    seen_routes: set[tuple[str, str]] = set()
    for route in routes:
        if not isinstance(route, dict):
            raise TypeError("each route must be a JSON object")
        from_id = _safe_id(route.get("from_location_id"), "route.from_location_id")
        to_id = _safe_id(route.get("to_location_id"), "route.to_location_id")
        if from_id not in location_ids or to_id not in location_ids:
            raise ValueError("route locations must identify known locations")
        if from_id == to_id or (from_id, to_id) in seen_routes:
            raise ValueError("routes must be unique and connect different locations")
        seen_routes.add((from_id, to_id))
        peak_start = route.get("peak_start_minute")
        peak_end = route.get("peak_end_minute")
        if (peak_start is None) != (peak_end is None):
            raise ValueError("route peak start and end must be provided together")
        if peak_start is not None:
            peak_start = _minute(peak_start, "route.peak_start_minute")
            peak_end = _minute(peak_end, "route.peak_end_minute")
            if peak_end <= peak_start:
                raise ValueError("route peak end must be later than its start")
        normalized_routes.append(
            {
                "from_location_id": from_id,
                "to_location_id": to_id,
                "base_minutes": _buffer(
                    route.get("base_minutes", 0), "route.base_minutes"
                ),
                "traffic_minutes": _buffer(
                    route.get("traffic_minutes", 0), "route.traffic_minutes"
                ),
                "peak_start_minute": peak_start,
                "peak_end_minute": peak_end,
                "distance_meters": route.get("distance_meters"),
                "provider": route.get("provider"),
                "refreshed_at": route.get("refreshed_at"),
                "expires_at": route.get("expires_at"),
            }
        )
        if normalized_routes[-1]["distance_meters"] is not None and (
            not isinstance(normalized_routes[-1]["distance_meters"], int)
            or normalized_routes[-1]["distance_meters"] < 0
        ):
            raise ValueError("route.distance_meters must be nonnegative")
        for metadata_field in ("provider", "refreshed_at", "expires_at"):
            metadata_value = normalized_routes[-1][metadata_field]
            if metadata_value is not None and (
                not isinstance(metadata_value, str) or len(metadata_value) > 120
            ):
                raise ValueError(f"route.{metadata_field} is invalid")

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
        requires_car_seat = person.get("requires_car_seat", False)
        if not isinstance(requires_car_seat, bool):
            raise TypeError("person.requires_car_seat must be a boolean")
        if role == "adult" and requires_car_seat:
            raise ValueError("adults cannot require a car seat")
        default_vehicle_id = person.get("default_vehicle_id")
        if default_vehicle_id is not None:
            default_vehicle_id = _safe_id(
                default_vehicle_id, "person.default_vehicle_id"
            )
        contact_method = person.get("contact_method")
        if contact_method not in {None, "email", "sms"}:
            raise ValueError("person.contact_method must be email or sms")
        notification_opt_in = person.get("notification_opt_in", False)
        if not isinstance(notification_opt_in, bool):
            raise TypeError("person.notification_opt_in must be a boolean")
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
                "requires_car_seat": requires_car_seat,
                "default_vehicle_id": default_vehicle_id,
                "contact_method": contact_method,
                "notification_opt_in": notification_opt_in,
            }
        )
    roles = {person["id"]: person["role"] for person in normalized_people}
    adult_ids = {person_id for person_id, role in roles.items() if role == "adult"}
    if not adult_ids:
        raise ValueError("at least one adult is required")

    normalized_vehicles: list[dict[str, object]] = []
    vehicle_ids: set[str] = set()
    for vehicle in vehicles:
        if not isinstance(vehicle, dict):
            raise TypeError("each vehicle must be a JSON object")
        vehicle_id = _safe_id(vehicle.get("id"), "vehicle.id")
        if vehicle_id in vehicle_ids:
            raise ValueError("vehicle ids must be unique")
        passenger_capacity = vehicle.get("passenger_capacity")
        car_seat_capacity = vehicle.get("car_seat_capacity", 0)
        if (
            not isinstance(passenger_capacity, int)
            or isinstance(passenger_capacity, bool)
            or not 1 <= passenger_capacity <= 12
        ):
            raise ValueError("vehicle.passenger_capacity must be between 1 and 12")
        if (
            not isinstance(car_seat_capacity, int)
            or isinstance(car_seat_capacity, bool)
            or not 0 <= car_seat_capacity <= passenger_capacity
        ):
            raise ValueError("vehicle.car_seat_capacity must fit its passengers")
        available_adults = vehicle.get("available_adult_ids", [])
        if not isinstance(available_adults, list) or not all(
            adult_id in adult_ids for adult_id in available_adults
        ):
            raise ValueError("vehicle.available_adult_ids must identify adults")
        vehicle_ids.add(vehicle_id)
        normalized_vehicles.append(
            {
                "id": vehicle_id,
                "name": _name(vehicle.get("name"), "vehicle.name"),
                "passenger_capacity": passenger_capacity,
                "car_seat_capacity": car_seat_capacity,
                "available_adult_ids": list(dict.fromkeys(available_adults)),
            }
        )
    for person in normalized_people:
        if (
            person["default_vehicle_id"] is not None
            and person["default_vehicle_id"] not in vehicle_ids
        ):
            raise ValueError("person.default_vehicle_id must identify a vehicle")

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
        vehicle_id = rule.get("vehicle_id")
        if vehicle_id is not None and vehicle_id not in vehicle_ids:
            raise ValueError("rule.vehicle_id must identify a vehicle")
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
                "vehicle_id": vehicle_id,
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
            if location_id not in location_ids:
                raise ValueError("event.location_id must identify a location")
        vehicle_id = event.get("vehicle_id")
        if vehicle_id is not None and vehicle_id not in vehicle_ids:
            raise ValueError("event.vehicle_id must identify a vehicle")
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
                "vehicle_id": vehicle_id,
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

    normalized_support_requests: list[dict[str, object]] = []
    support_request_ids: set[str] = set()
    normalized_event_ids = {event["id"] for event in normalized_events}
    for support_request in support_requests:
        if not isinstance(support_request, dict):
            raise TypeError("each support request must be a JSON object")
        request_id = _safe_id(support_request.get("id"), "support_request.id")
        if request_id in support_request_ids:
            raise ValueError("support request ids must be unique")
        event_id = support_request.get("event_id")
        adult_id = support_request.get("adult_id")
        if event_id not in normalized_event_ids:
            raise ValueError("support_request.event_id must identify an event")
        if adult_id not in adult_ids:
            raise ValueError("support_request.adult_id must identify an adult")
        request_kind = support_request.get("kind", "helper")
        if request_kind not in {"helper", "carpool"}:
            raise ValueError("support_request.kind must be helper or carpool")
        responsibility_kind = support_request.get("responsibility_kind", "throughout")
        if responsibility_kind not in {"dropoff", "pickup", "throughout"}:
            raise ValueError("support request responsibility kind is invalid")
        request_status = support_request.get("status", "draft")
        if request_status not in {"draft", "pending", "accepted", "declined"}:
            raise ValueError("support request status is invalid")
        notification_status = support_request.get("notification_status", "draft")
        if notification_status not in {
            "draft",
            "queued",
            "sent",
            "delivered",
            "failed",
        }:
            raise ValueError("support request notification status is invalid")
        support_request_ids.add(request_id)
        normalized_support_requests.append(
            {
                "id": request_id,
                "kind": request_kind,
                "event_id": event_id,
                "adult_id": adult_id,
                "responsibility_kind": responsibility_kind,
                "status": request_status,
                "notification_status": notification_status,
            }
        )

    normalized_history: list[dict[str, object]] = []
    for history in responsibility_history:
        if not isinstance(history, dict):
            raise TypeError("each responsibility history row must be a JSON object")
        adult_id = history.get("adult_id")
        if adult_id not in adult_ids:
            raise ValueError("responsibility_history.adult_id must identify an adult")
        minutes = history.get("minutes", 0)
        handoffs = history.get("handoffs", 0)
        if (
            not isinstance(minutes, int)
            or isinstance(minutes, bool)
            or not 0 <= minutes <= 10_080
        ):
            raise ValueError("responsibility history minutes are invalid")
        if (
            not isinstance(handoffs, int)
            or isinstance(handoffs, bool)
            or not 0 <= handoffs <= 100
        ):
            raise ValueError("responsibility history handoffs are invalid")
        normalized_history.append(
            {
                "week_label": _name(history.get("week_label"), "history.week_label"),
                "adult_id": adult_id,
                "minutes": minutes,
                "handoffs": handoffs,
            }
        )

    day_label = raw.get("day_label", "Family day")
    return {
        "schema_version": 1,
        "day_label": _name(day_label, "day_label"),
        "people": normalized_people,
        "home_location_id": home_location_id,
        "locations": normalized_locations,
        "routes": normalized_routes,
        "vehicles": normalized_vehicles,
        "rules": normalized_rules,
        "events": normalized_events,
        "support_requests": normalized_support_requests,
        "responsibility_history": normalized_history,
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


def _support_blocker(
    adult: dict[str, object],
    event_id: str,
    responsibility_kind: str,
    support_requests: list[dict[str, object]],
) -> tuple[str, str] | None:
    if adult["household_member"]:
        return None
    matching = next(
        (
            item
            for item in support_requests
            if item["event_id"] == event_id
            and item["adult_id"] == adult["id"]
            and item["responsibility_kind"] == responsibility_kind
        ),
        None,
    )
    if matching is None:
        return "request", "no specific help request has been sent"
    if matching["status"] == "draft":
        return "request", "the help request is still a draft"
    if matching["status"] == "pending":
        return "response", "their response is still pending"
    if matching["status"] == "declined":
        return "declined", "they declined this request"
    return None


def _route_minutes(
    scenario: dict[str, object],
    from_location_id: str | None,
    to_location_id: str | None,
    at_minute: int,
) -> tuple[int | None, str | None]:
    if not from_location_id or not to_location_id:
        return None, None
    if from_location_id == to_location_id:
        return 0, "same_location"
    route = next(
        (
            item
            for item in scenario["routes"]
            if item["from_location_id"] == from_location_id
            and item["to_location_id"] == to_location_id
        ),
        None,
    )
    if route is None:
        return None, None
    in_peak = (
        route["peak_start_minute"] is None
        or route["peak_start_minute"] <= at_minute < route["peak_end_minute"]
    )
    traffic = route["traffic_minutes"] if in_peak else 0
    source = "traffic_route" if traffic else "route"
    return route["base_minutes"] + traffic, source


def _resolved_travel(
    scenario: dict[str, object],
    event: dict[str, object],
    rule: dict[str, object] | None,
) -> tuple[int, int, str]:
    event_before = event["travel_before"]
    event_after = event["travel_after"]
    route_before, before_source = _route_minutes(
        scenario,
        scenario["home_location_id"],
        event["location_id"],
        event["start_minute"],
    )
    route_after, after_source = _route_minutes(
        scenario,
        event["location_id"],
        scenario["home_location_id"],
        event["end_minute"],
    )
    rule_before = rule["travel_before"] if rule else 0
    rule_after = rule["travel_after"] if rule else 0
    travel_before = (
        event_before
        if event_before is not None
        else route_before if route_before is not None else rule_before
    )
    travel_after = (
        event_after
        if event_after is not None
        else route_after if route_after is not None else rule_after
    )
    if event_before is not None or event_after is not None:
        source = "event_buffer"
    elif before_source or after_source:
        source = (
            "traffic_route"
            if "traffic_route" in {before_source, after_source}
            else "route"
        )
    elif rule:
        source = "saved_rule"
    else:
        source = "none"
    return travel_before, travel_after, source


def _vehicle_for(
    scenario: dict[str, object],
    event: dict[str, object],
    rule: dict[str, object] | None,
    adult_id: str | None,
) -> dict[str, object] | None:
    if not scenario["vehicles"] or not adult_id:
        return None
    people = {person["id"]: person for person in scenario["people"]}
    vehicle_id = (
        event["vehicle_id"]
        or people[adult_id]["default_vehicle_id"]
        or (rule["vehicle_id"] if rule else None)
    )
    return next(
        (vehicle for vehicle in scenario["vehicles"] if vehicle["id"] == vehicle_id),
        None,
    )


def _vehicle_blocker(
    scenario: dict[str, object],
    event: dict[str, object],
    vehicle: dict[str, object] | None,
    adult_id: str,
) -> tuple[str, str] | None:
    if not scenario["vehicles"]:
        return None
    if vehicle is None:
        return "vehicle", "no vehicle is assigned"
    available_adults = vehicle["available_adult_ids"]
    if available_adults and adult_id not in available_adults:
        return "vehicle_access", f"{vehicle['name']} is not available to them"
    passengers = len(event["participant_ids"])
    if passengers > vehicle["passenger_capacity"]:
        return "vehicle_capacity", (
            f"{vehicle['name']} has room for {vehicle['passenger_capacity']} passengers"
        )
    people = {person["id"]: person for person in scenario["people"]}
    car_seats = sum(
        bool(people[participant_id]["requires_car_seat"])
        for participant_id in event["participant_ids"]
    )
    if car_seats > vehicle["car_seat_capacity"]:
        return "car_seat", (
            f"{vehicle['name']} has {vehicle['car_seat_capacity']} car-seat spots"
        )
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
        travel_before, travel_after, travel_source = _resolved_travel(
            normalized, event, rule
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
            if configured_adult_id and blocker is None:
                blocker = _support_blocker(
                    people[configured_adult_id],
                    event["id"],
                    responsibility["kind"],
                    normalized["support_requests"],
                )
            vehicle = _vehicle_for(normalized, event, rule, configured_adult_id)
            vehicle_blocker = (
                _vehicle_blocker(normalized, event, vehicle, configured_adult_id)
                if configured_adult_id and responsibility_mode == "transport"
                else None
            )
            responsibility["vehicle_id"] = vehicle["id"] if vehicle else None
            responsibility["vehicle_name"] = vehicle["name"] if vehicle else None
            if vehicle_blocker:
                blocker_kind, blocker_reason = vehicle_blocker
                responsibility["vehicle_blocker"] = {
                    "kind": blocker_kind,
                    "reason": blocker_reason,
                }
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
            "travel_source": travel_source,
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
    fairness_load = {adult["id"]: 0 for adult in adults if adult["household_member"]}
    for history in normalized["responsibility_history"]:
        if history["adult_id"] in fairness_load:
            fairness_load[history["adult_id"]] += history["minutes"]
    for reservation in reservations:
        if reservation.resource_id in fairness_load and reservation.reason != "participant":
            fairness_load[reservation.resource_id] += (
                reservation.end_minute - reservation.start_minute
            )
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
    seen_vehicle_issues: set[tuple[object, ...]] = set()
    for assignment in assignments:
        for responsibility in assignment["responsibilities"]:
            vehicle_blocker = responsibility.get("vehicle_blocker")
            if not vehicle_blocker:
                continue
            shared_vehicle_key = (
                assignment["ride_group_id"] or assignment["id"],
                assignment["location_id"],
                assignment["start_minute"],
                assignment["end_minute"],
                responsibility["kind"],
                responsibility["adult_id"],
            )
            if shared_vehicle_key in seen_vehicle_issues:
                continue
            seen_vehicle_issues.add(shared_vehicle_key)
            issues.append(
                {
                    "kind": "vehicle_constraint",
                    "resource_id": responsibility["adult_id"],
                    "resource_name": responsibility["adult_name"],
                    "event_ids": [assignment["id"]],
                    "event_titles": [assignment["title"]],
                    "responsibility_kinds": {
                        assignment["id"]: responsibility["kind"]
                    },
                    "overlap_minutes": 0,
                    "vehicle_id": responsibility["vehicle_id"],
                    "blocker_kind": vehicle_blocker["kind"],
                    "title": f"{assignment['title']} needs a different vehicle",
                    "body": (
                        f"{vehicle_blocker['reason']} for "
                        f"{responsibility['kind'].replace('off', '-off')}."
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
        if issue["kind"] == "vehicle_constraint":
            assignment = assignments_by_id[issue["event_ids"][0]]
            adult_id = issue["resource_id"]
            alternatives = [
                vehicle
                for vehicle in normalized["vehicles"]
                if vehicle["id"] != issue["vehicle_id"]
                and _vehicle_blocker(normalized, assignment, vehicle, adult_id) is None
            ]
            if alternatives:
                vehicle = alternatives[0]
                suggestions.append(
                    {
                        "kind": "switch_vehicle",
                        "event_id": assignment["id"],
                        "adult_id": adult_id,
                        "vehicle_id": vehicle["id"],
                        "responsibility_kind": issue["responsibility_kinds"][
                            assignment["id"]
                        ],
                        "title": f"Use {vehicle['name']} for {assignment['title']}",
                        "body": (
                            f"{vehicle['name']} fits all passengers and required "
                            "car seats, and the assigned driver can use it."
                        ),
                        "resolves_issue": issue["title"],
                    }
                )
            else:
                suggestions.append(
                    {
                        "kind": "vehicle_decision",
                        "event_id": assignment["id"],
                        "adult_id": adult_id,
                        "title": f"Find a suitable vehicle for {assignment['title']}",
                        "body": (
                            "No saved vehicle fits the passengers, car seats, and "
                            "driver access for this ride."
                        ),
                        "resolves_issue": issue["title"],
                    }
                )
            continue
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
                if blocker is None:
                    blocker = _support_blocker(
                        people[adult_id],
                        assignment["id"],
                        responsibility_kind,
                        normalized["support_requests"],
                    )
                if blocker is None and assignment["responsibility_mode"] == "transport":
                    candidate_vehicle = _vehicle_for(
                        normalized, assignment, rule, adult_id
                    )
                    blocker = _vehicle_blocker(
                        normalized, assignment, candidate_vehicle, adult_id
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
                household_candidates = [
                    candidate
                    for candidate in available_adults
                    if people[candidate]["household_member"]
                ]
                adult_id = (
                    min(
                        household_candidates,
                        key=lambda candidate: fairness_load.get(candidate, 0),
                    )
                    if household_candidates
                    else available_adults[0]
                )
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
                support_wait = next(
                    (
                        item
                        for item in blocked_alternatives
                        if item.get("blocker_kind") in {"request", "response"}
                    ),
                    None,
                )
                decision_kind = (
                    "confirm_helper"
                    if confirmation
                    else "request_support" if support_wait else "external_help"
                )
                suggestion = {
                    "kind": decision_kind,
                    "event_id": assignment["id"],
                    "adult_id": (
                        confirmation["adult_id"]
                        if confirmation
                        else support_wait["adult_id"] if support_wait else None
                    ),
                    "title": (
                        f"Confirm {confirmation['adult_name']} before assigning "
                        f"{assignment['title']}"
                        if confirmation
                        else (
                            f"Request {support_wait['adult_name']}'s help with "
                            f"{assignment['title']}"
                            if support_wait
                            else (
                                f"Find another adult for {assignment['title']} "
                                f"{responsibility_kind.replace('off', '-off')}"
                                if responsibility_kind != "throughout"
                                else f"Find another driver or move {assignment['title']}"
                            )
                        )
                    ),
                    "body": (
                        f"{confirmation['adult_name']} is saved as a possible "
                        "helper, but WeekFlow will not count that help until it is "
                        "confirmed."
                        if confirmation
                        else (
                            f"{support_wait['adult_name']} is available, but "
                            f"{support_wait['reason']}. WeekFlow will not count the "
                            "handoff until they accept."
                            if support_wait
                            else (
                                "Every saved adult is already occupied or unavailable "
                                f"for part of the {target['window']} responsibility window."
                            )
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
    household_adults = [adult for adult in adults if adult["household_member"]]
    history_minutes = {adult["id"]: 0 for adult in household_adults}
    history_handoffs = {adult["id"]: 0 for adult in household_adults}
    current_minutes = {adult["id"]: 0 for adult in household_adults}
    current_handoffs = {adult["id"]: 0 for adult in household_adults}
    for history in normalized["responsibility_history"]:
        if history["adult_id"] in history_minutes:
            history_minutes[history["adult_id"]] += history["minutes"]
            history_handoffs[history["adult_id"]] += history["handoffs"]
    for reservation in reservations:
        if reservation.resource_id in current_minutes and reservation.reason != "participant":
            current_minutes[reservation.resource_id] += (
                reservation.end_minute - reservation.start_minute
            )
            current_handoffs[reservation.resource_id] += 1
    fairness_rows = [
        {
            "adult_id": adult["id"],
            "adult_name": adult["name"],
            "history_minutes": history_minutes[adult["id"]],
            "current_minutes": current_minutes[adult["id"]],
            "total_minutes": history_minutes[adult["id"]]
            + current_minutes[adult["id"]],
            "handoffs": history_handoffs[adult["id"]]
            + current_handoffs[adult["id"]],
        }
        for adult in household_adults
    ]
    fairness_totals = [row["total_minutes"] for row in fairness_rows]
    fairness_gap = max(fairness_totals) - min(fairness_totals) if fairness_totals else 0
    most_loaded = (
        max(fairness_rows, key=lambda row: row["total_minutes"])
        if fairness_rows
        else None
    )
    least_loaded = (
        min(fairness_rows, key=lambda row: row["total_minutes"])
        if fairness_rows
        else None
    )
    fairness = {
        "status": "needs_balance" if fairness_gap > 120 else "balanced",
        "gap_minutes": fairness_gap,
        "rows": fairness_rows,
        "recommendation": (
            f"Prefer {least_loaded['adult_name']} for the next flexible handoff; "
            f"{most_loaded['adult_name']} has carried {fairness_gap} more minutes."
            if fairness_gap > 120 and most_loaded and least_loaded
            else "The recent household logistics load is within two hours."
        ),
    }
    support_summary = [
        {
            **request,
            "adult_name": people[request["adult_id"]]["name"],
            "event_title": assignments_by_id[request["event_id"]]["title"],
        }
        for request in normalized["support_requests"]
    ]
    return {
        "scenario": normalized,
        "assignments": assignments,
        "issues": issues,
        "suggestions": suggestions,
        "timeline": timeline,
        "routing": {
            "route_aware_events": sum(
                assignment["travel_source"] in {"route", "traffic_route"}
                for assignment in assignments
            ),
            "traffic_aware_events": sum(
                assignment["travel_source"] == "traffic_route"
                for assignment in assignments
            ),
        },
        "vehicle_checks": sum(
            assignment["responsibility_mode"] == "transport"
            and bool(normalized["vehicles"])
            and not assignment["shared_ride_duplicate"]
            for assignment in assignments
        ),
        "support_requests": support_summary,
        "fairness": fairness,
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
    rule = next(
        (
            item
            for item in normalized["rules"]
            if item["series_id"] == event["series_id"]
        ),
        None,
    )
    for responsibility in target_responsibilities:
        blocker = _availability_blocker(
            selected_adult,
            responsibility["start_minute"],
            responsibility["end_minute"],
        )
        if blocker is None:
            blocker = _support_blocker(
                selected_adult,
                event_id,
                responsibility["kind"],
                normalized["support_requests"],
            )
        if blocker is None and event["responsibility_mode"] == "transport":
            blocker = _vehicle_blocker(
                normalized,
                event,
                _vehicle_for(normalized, event, rule, adult_id),
                adult_id,
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


def apply_vehicle_change(
    scenario: dict[str, object],
    *,
    event_id: str,
    vehicle_id: str,
    scope: str,
) -> dict[str, object]:
    """Apply a validated vehicle override to one ride or its recurring rule."""

    normalized = normalize_logistics_scenario(scenario)
    if scope not in {"occurrence", "series"}:
        raise ValueError("scope must be occurrence or series")
    event = next(
        (item for item in normalized["events"] if item["id"] == event_id), None
    )
    vehicle = next(
        (item for item in normalized["vehicles"] if item["id"] == vehicle_id), None
    )
    if event is None:
        raise ValueError("event_id must identify an event")
    if vehicle is None:
        raise ValueError("vehicle_id must identify a vehicle")
    if event["responsibility_mode"] != "transport":
        raise ValueError("vehicle changes require a transport event")
    assignment = next(
        item
        for item in analyze_family_logistics(normalized)["assignments"]
        if item["id"] == event_id
    )
    adult_ids = {
        responsibility["adult_id"]
        for responsibility in assignment["responsibilities"]
        if responsibility["adult_id"]
    }
    for adult_id in adult_ids:
        blocker = _vehicle_blocker(normalized, event, vehicle, adult_id)
        if blocker:
            _, reason = blocker
            raise ValueError(f"{vehicle['name']} cannot be assigned: {reason}.")

    affected_events = [event]
    if event["ride_group_id"] and event["location_id"]:
        affected_events = [
            item
            for item in normalized["events"]
            if item["ride_group_id"] == event["ride_group_id"]
            and item["location_id"] == event["location_id"]
            and item["start_minute"] == event["start_minute"]
            and item["end_minute"] == event["end_minute"]
        ]
    if scope == "occurrence":
        for affected in affected_events:
            affected["vehicle_id"] = vehicle_id
    else:
        if any(not affected["series_id"] for affected in affected_events):
            raise ValueError("a one-time event has no recurring series to update")
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
            rule["vehicle_id"] = vehicle_id
            updated_series.add(affected["series_id"])
        for affected in affected_events:
            affected["vehicle_id"] = None
    return normalized


def apply_support_request_action(
    scenario: dict[str, object],
    *,
    request_id: str,
    action: str,
) -> dict[str, object]:
    """Advance a helper or carpool request through its explicit state machine."""

    normalized = normalize_logistics_scenario(scenario)
    support_request = next(
        (
            item
            for item in normalized["support_requests"]
            if item["id"] == request_id
        ),
        None,
    )
    if support_request is None:
        raise ValueError("request_id must identify a support request")
    adult = next(
        person
        for person in normalized["people"]
        if person["id"] == support_request["adult_id"]
    )
    if action == "send":
        if support_request["status"] != "draft":
            raise ValueError("only a draft support request can be sent")
        if not adult["notification_opt_in"] or not adult["contact_method"]:
            raise ValueError("the helper must opt in to a notification channel")
        support_request["status"] = "pending"
        support_request["notification_status"] = "queued"
    elif action == "mark_delivered":
        if support_request["notification_status"] not in {"queued", "sent"}:
            raise ValueError("only a queued or sent notification can be delivered")
        support_request["notification_status"] = "delivered"
    elif action in {"accept", "decline"}:
        if support_request["status"] != "pending":
            raise ValueError("only a pending support request can receive a response")
        support_request["status"] = "accepted" if action == "accept" else "declined"
    else:
        raise ValueError("support request action is invalid")
    return normalized
