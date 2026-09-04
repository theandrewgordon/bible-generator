from copy import deepcopy

import pytest

from faithsparks.services.weekflow_logistics import (
    analyze_family_logistics,
    apply_responsibility_change,
    apply_support_request_action,
    apply_vehicle_change,
    default_logistics_scenario,
    family_four_carpool_scenario,
    family_four_school_sports_scenario,
    normalize_logistics_scenario,
)


def test_default_scenario_detects_the_invisible_driver_conflict():
    result = analyze_family_logistics()

    assert result["status"] == "needs_decision"
    assert result["issue_count"] == 1
    issue = result["issues"][0]
    assert issue["resource_id"] == "dad"
    assert set(issue["event_ids"]) == {"dad-appointment", "football"}
    assert issue["overlap_minutes"] == 45
    assert "after travel is included" in issue["body"]


def test_default_scenario_suggests_a_conflict_free_saved_backup():
    result = analyze_family_logistics()

    assert result["suggestions"] == [
        {
            "kind": "reassign",
            "event_id": "football",
            "adult_id": "grandma",
            "title": "Ask Grandma to handle Football practice",
            "body": (
                "Grandma is free for the full 4:40 PM–6:50 PM responsibility "
                "window. Apply this once or remember it for the recurring series. "
                "Mom cannot cover because Dance class already occupies that window."
            ),
            "blocked_alternatives": [
                {
                    "adult_id": "mom",
                    "adult_name": "Mom",
                    "blocked_by": "Dance class",
                }
            ],
            "resolves_issue": "Dad is needed in two places",
        }
    ]


def test_responsibility_windows_include_rule_travel_buffers():
    result = analyze_family_logistics()
    assignments = {item["id"]: item for item in result["assignments"]}

    assert assignments["football"]["responsibility_window"] == "4:40 PM–6:50 PM"
    assert assignments["football"]["adult_name"] == "Dad"
    assert assignments["football"]["assignment_source"] == "series_rule"
    assert assignments["dance"]["responsibility_window"] == "5:15 PM–6:45 PM"
    assert assignments["dance"]["adult_name"] == "Mom"


def test_one_occurrence_override_resolves_conflict_without_changing_rule():
    scenario = apply_responsibility_change(
        default_logistics_scenario(),
        event_id="football",
        adult_id="grandma",
        scope="occurrence",
    )
    result = analyze_family_logistics(scenario)
    football = next(item for item in result["assignments"] if item["id"] == "football")

    assert result["status"] == "workable"
    assert result["issues"] == []
    assert football["adult_name"] == "Grandma"
    assert football["assignment_source"] == "occurrence"
    assert next(rule for rule in scenario["rules"] if rule["series_id"] == "fall-football")["adult_id"] == "dad"


def test_series_update_is_remembered_and_previous_driver_becomes_fallback():
    scenario = apply_responsibility_change(
        default_logistics_scenario(),
        event_id="football",
        adult_id="grandma",
        scope="series",
    )
    rule = next(rule for rule in scenario["rules"] if rule["series_id"] == "fall-football")
    result = analyze_family_logistics(scenario)
    football = next(item for item in result["assignments"] if item["id"] == "football")

    assert rule["adult_id"] == "grandma"
    assert rule["fallback_adult_ids"] == ["dad"]
    assert football["adult_name"] == "Grandma"
    assert football["assignment_source"] == "series_rule"
    assert result["status"] == "workable"


def test_reassigning_football_to_mom_exposes_the_dance_conflict():
    scenario = apply_responsibility_change(
        default_logistics_scenario(),
        event_id="football",
        adult_id="mom",
        scope="occurrence",
    )
    result = analyze_family_logistics(scenario)

    assert result["status"] == "needs_decision"
    assert result["issues"][0]["resource_id"] == "mom"
    assert set(result["issues"][0]["event_ids"]) == {"dance", "football"}


def test_activity_without_a_rule_is_reported_as_unowned_work():
    scenario = default_logistics_scenario()
    scenario["rules"] = [
        rule for rule in scenario["rules"] if rule["series_id"] != "fall-football"
    ]
    result = analyze_family_logistics(scenario)

    assert result["unassigned_count"] == 1
    assert any(issue["kind"] == "unassigned" for issue in result["issues"])


def test_every_event_remains_accounted_for_in_assignments_and_timelines():
    result = analyze_family_logistics()
    event_ids = {event["id"] for event in result["scenario"]["events"]}

    assert {assignment["id"] for assignment in result["assignments"]} == event_ids
    assert {
        block["event_id"]
        for person_blocks in result["timeline"].values()
        for block in person_blocks
    } == event_ids


def test_logistics_analysis_is_deterministic():
    scenario = default_logistics_scenario()
    assert analyze_family_logistics(scenario) == analyze_family_logistics(
        deepcopy(scenario)
    )


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda scenario: scenario.update({"people": []}), "people"),
        (
            lambda scenario: scenario["events"][0].update({"end_minute": 1}),
            "later",
        ),
        (
            lambda scenario: scenario["rules"][0].update({"adult_id": "avery"}),
            "adult",
        ),
        (
            lambda scenario: scenario["events"][1].update(
                {"participant_ids": ["dad"]}
            ),
            "children",
        ),
    ],
)
def test_logistics_validation_rejects_invalid_scenarios(mutation, message):
    scenario = default_logistics_scenario()
    mutation(scenario)

    with pytest.raises((TypeError, ValueError), match=message):
        normalize_logistics_scenario(scenario)


def test_change_validation_rejects_unknown_targets_and_scope():
    scenario = default_logistics_scenario()

    with pytest.raises(ValueError, match="adult_id"):
        apply_responsibility_change(
            scenario, event_id="football", adult_id="coach", scope="occurrence"
        )
    with pytest.raises(ValueError, match="scope"):
        apply_responsibility_change(
            scenario, event_id="football", adult_id="mom", scope="forever"
        )
    with pytest.raises(ValueError, match="event_id"):
        apply_responsibility_change(
            scenario, event_id="missing", adult_id="mom", scope="occurrence"
        )


def test_family_of_four_school_and_sports_simulation_finds_real_handoffs():
    result = analyze_family_logistics(family_four_school_sports_scenario())

    assert result["status"] == "needs_decision"
    assert len(result["scenario"]["people"]) == 4
    assert {item["id"] for item in result["assignments"]} == {
        "dad-appointment",
        "mom-client-call",
        "school",
        "football",
        "gymnastics",
    }
    assert {
        (issue["event_ids"][1], issue["responsibility_kinds"][issue["event_ids"][1]])
        for issue in result["issues"]
    } == {("school", "pickup"), ("football", "dropoff")}
    suggestions = {
        (item["event_id"], item.get("responsibility_kind")): item
        for item in result["suggestions"]
    }
    assert suggestions[("school", "pickup")]["kind"] == "external_help"
    assert suggestions[("school", "pickup")]["title"].endswith("pickup")
    assert suggestions[("football", "dropoff")]["adult_id"] == "mom"
    assert sum(
        item["invisible_travel_minutes"] for item in result["assignments"]
    ) == 260


def test_school_transport_does_not_reserve_the_driver_for_the_school_day():
    result = analyze_family_logistics(family_four_school_sports_scenario())
    dad_school = [
        block for block in result["timeline"]["dad"] if block["event_id"] == "school"
    ]

    assert [(block["reason"], block["start"], block["end"]) for block in dad_school] == [
        ("dropoff", "7:40 AM", "8:20 AM"),
        ("pickup", "2:40 PM", "3:20 PM"),
    ]
    assert all(
        block["end_minute"] <= 9 * 60 or block["start_minute"] >= 14 * 60
        for block in dad_school
    )


def test_one_transport_leg_can_change_without_reassigning_the_other_leg():
    scenario = apply_responsibility_change(
        family_four_school_sports_scenario(),
        event_id="football",
        adult_id="mom",
        scope="occurrence",
        responsibility_kind="dropoff",
    )
    result = analyze_family_logistics(scenario)
    football = next(item for item in result["assignments"] if item["id"] == "football")
    responsibilities = {
        item["kind"]: item["adult_id"] for item in football["responsibilities"]
    }

    assert responsibilities == {"dropoff": "mom", "pickup": "dad"}
    assert not any(
        issue["resource_id"] == "dad" and "football" in issue["event_ids"]
        for issue in result["issues"]
    )
    assert any("school" in issue["event_ids"] for issue in result["issues"])


def test_child_double_booking_never_suggests_changing_only_the_driver():
    scenario = default_logistics_scenario()
    dance = next(event for event in scenario["events"] if event["id"] == "dance")
    dance["participant_ids"] = ["avery"]
    result = analyze_family_logistics(scenario)
    child_issue = next(
        issue for issue in result["issues"] if issue["resource_id"] == "avery"
    )
    child_suggestions = [
        item
        for item in result["suggestions"]
        if item["resolves_issue"] == child_issue["title"]
    ]

    assert child_suggestions
    assert all(item["kind"] == "move_flexible" for item in child_suggestions)


def test_separate_dropoff_and_pickup_conflicts_are_both_reported():
    scenario = family_four_school_sports_scenario()
    appointment = next(
        event for event in scenario["events"] if event["id"] == "dad-appointment"
    )
    appointment.update(
        {
            "start_minute": 16 * 60,
            "end_minute": 19 * 60,
            "travel_before": 0,
            "travel_after": 0,
        }
    )

    result = analyze_family_logistics(scenario)
    football_conflicts = [
        issue
        for issue in result["issues"]
        if set(issue["event_ids"]) == {"dad-appointment", "football"}
    ]

    assert {
        issue["responsibility_kinds"]["football"] for issue in football_conflicts
    } == {"dropoff", "pickup"}


def test_unconfirmed_helper_is_never_presented_as_a_workable_assignment():
    scenario = default_logistics_scenario()
    grandma = next(person for person in scenario["people"] if person["id"] == "grandma")
    grandma["confirmed"] = False

    result = analyze_family_logistics(scenario)
    suggestion = result["suggestions"][0]

    assert suggestion["kind"] == "confirm_helper"
    assert suggestion["adult_id"] == "grandma"
    assert "will not count that help until it is confirmed" in suggestion["body"]
    assert not any(item["kind"] == "reassign" for item in result["suggestions"])


def test_helper_must_cover_the_entire_responsibility_window():
    scenario = default_logistics_scenario()
    grandma = next(person for person in scenario["people"] if person["id"] == "grandma")
    grandma["available_windows"] = [
        {"start_minute": 18 * 60, "end_minute": 20 * 60}
    ]

    result = analyze_family_logistics(scenario)
    suggestion = result["suggestions"][0]

    assert suggestion["kind"] == "external_help"
    blocked_grandma = next(
        item
        for item in suggestion["blocked_alternatives"]
        if item["adult_id"] == "grandma"
    )
    assert blocked_grandma["blocker_kind"] == "availability"


def test_unconfirmed_helper_already_in_a_rule_is_not_counted_as_coverage():
    scenario = default_logistics_scenario()
    grandma = next(person for person in scenario["people"] if person["id"] == "grandma")
    grandma["confirmed"] = False
    football_rule = next(
        rule for rule in scenario["rules"] if rule["series_id"] == "fall-football"
    )
    football_rule["adult_id"] = "grandma"
    football_rule["fallback_adult_ids"] = ["dad"]

    result = analyze_family_logistics(scenario)
    football = next(item for item in result["assignments"] if item["id"] == "football")

    assert result["unassigned_count"] == 1
    assert football["responsibilities"][0]["adult_id"] is None
    assert football["responsibilities"][0]["configured_adult_id"] == "grandma"
    assert not any(
        block["event_id"] == "football" for block in result["timeline"]["grandma"]
    )


def test_manual_change_cannot_assign_an_unconfirmed_helper():
    scenario = default_logistics_scenario()
    grandma = next(person for person in scenario["people"] if person["id"] == "grandma")
    grandma["confirmed"] = False

    with pytest.raises(ValueError, match="cannot be assigned.*not been confirmed"):
        apply_responsibility_change(
            scenario,
            event_id="football",
            adult_id="grandma",
            scope="occurrence",
        )


def _split_school_into_shared_calendar_entries(scenario):
    school = next(event for event in scenario["events"] if event["id"] == "school")
    scenario["events"] = [
        event for event in scenario["events"] if event["id"] != "school"
    ]
    for child_id in ("ethan", "sophie"):
        child_school = deepcopy(school)
        child_school["id"] = f"school-{child_id}"
        child_school["participant_ids"] = [child_id]
        child_school["ride_group_id"] = "school-carpool"
        child_school["location_id"] = "school-campus"
        scenario["events"].append(child_school)
    return scenario


def test_shared_sibling_ride_is_one_driver_obligation_and_one_travel_cost():
    scenario = _split_school_into_shared_calendar_entries(
        family_four_school_sports_scenario()
    )

    result = analyze_family_logistics(scenario)
    school_pair = {"school-ethan", "school-sophie"}
    school_appointment_issues = [
        issue
        for issue in result["issues"]
        if "dad-appointment" in issue["event_ids"]
        and school_pair.intersection(issue["event_ids"])
    ]

    assert not any(set(issue["event_ids"]) == school_pair for issue in result["issues"])
    assert len(school_appointment_issues) == 1
    assert sum(
        item["invisible_travel_minutes"] for item in result["assignments"]
    ) == 260


def test_unassigned_shared_ride_has_one_alert_per_transport_leg():
    scenario = _split_school_into_shared_calendar_entries(
        family_four_school_sports_scenario()
    )
    scenario["rules"] = [
        rule for rule in scenario["rules"] if rule["series_id"] != "school-week"
    ]

    result = analyze_family_logistics(scenario)
    school_unassigned = [
        issue
        for issue in result["issues"]
        if issue["kind"] == "unassigned"
        and issue["event_ids"][0].startswith("school-")
    ]

    assert len(school_unassigned) == 2
    assert {
        next(iter(issue["responsibility_kinds"].values()))
        for issue in school_unassigned
    } == {"dropoff", "pickup"}


def test_changing_one_shared_ride_leg_changes_every_linked_calendar_entry():
    scenario = _split_school_into_shared_calendar_entries(
        family_four_school_sports_scenario()
    )

    changed = apply_responsibility_change(
        scenario,
        event_id="school-ethan",
        adult_id="mom",
        scope="occurrence",
        responsibility_kind="pickup",
    )
    result = analyze_family_logistics(changed)
    school_assignments = [
        item for item in result["assignments"] if item["id"].startswith("school-")
    ]

    assert len(school_assignments) == 2
    assert all(
        next(
            responsibility
            for responsibility in item["responsibilities"]
            if responsibility["kind"] == "pickup"
        )["adult_id"]
        == "mom"
        for item in school_assignments
    )


def test_family_routes_replace_generic_rule_buffers_and_include_traffic():
    result = analyze_family_logistics(family_four_school_sports_scenario())
    assignments = {item["id"]: item for item in result["assignments"]}

    assert result["routing"] == {
        "route_aware_events": 3,
        "traffic_aware_events": 3,
    }
    assert assignments["school"]["travel_source"] == "traffic_route"
    assert (assignments["school"]["travel_before"], assignments["school"]["travel_after"]) == (20, 20)
    assert (assignments["football"]["travel_before"], assignments["football"]["travel_after"]) == (25, 25)


def test_route_traffic_padding_only_applies_inside_its_peak_window():
    scenario = family_four_school_sports_scenario()
    for route in scenario["routes"]:
        route["peak_start_minute"] = 17 * 60
        route["peak_end_minute"] = 18 * 60

    result = analyze_family_logistics(scenario)
    school = next(item for item in result["assignments"] if item["id"] == "school")

    assert school["travel_before"] == 15
    assert school["travel_after"] == 15
    assert school["travel_source"] == "route"


def test_vehicle_capacity_problem_suggests_and_applies_a_safe_vehicle():
    scenario = family_four_school_sports_scenario()
    sedan = next(vehicle for vehicle in scenario["vehicles"] if vehicle["id"] == "family-sedan")
    sedan["passenger_capacity"] = 1
    sedan["car_seat_capacity"] = 1

    result = analyze_family_logistics(scenario)
    issue = next(
        issue
        for issue in result["issues"]
        if issue["kind"] == "vehicle_constraint" and issue["event_ids"] == ["school"]
    )
    suggestion = next(
        item
        for item in result["suggestions"]
        if item["resolves_issue"] == issue["title"]
    )

    assert issue["blocker_kind"] == "vehicle_capacity"
    assert suggestion["kind"] == "switch_vehicle"
    assert suggestion["vehicle_id"] == "family-suv"

    changed = apply_vehicle_change(
        scenario,
        event_id="school",
        vehicle_id="family-suv",
        scope="occurrence",
    )
    replanned = analyze_family_logistics(changed)
    assert not any(
        item["kind"] == "vehicle_constraint" and item["event_ids"] == ["school"]
        for item in replanned["issues"]
    )


def test_car_seat_shortage_is_detected_separately_from_passenger_capacity():
    scenario = family_four_school_sports_scenario()
    sedan = next(vehicle for vehicle in scenario["vehicles"] if vehicle["id"] == "family-sedan")
    sedan["car_seat_capacity"] = 0

    result = analyze_family_logistics(scenario)
    school_issue = next(
        issue
        for issue in result["issues"]
        if issue["kind"] == "vehicle_constraint" and issue["event_ids"] == ["school"]
    )

    assert school_issue["blocker_kind"] == "car_seat"
    assert "car-seat spots" in school_issue["body"]


def _add_carpool_parent(scenario, *, request_status="pending"):
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
    suv = next(vehicle for vehicle in scenario["vehicles"] if vehicle["id"] == "family-suv")
    suv["available_adult_ids"].append("jordan")
    school_rule = next(rule for rule in scenario["rules"] if rule["series_id"] == "school-week")
    school_rule["fallback_adult_ids"] = ["jordan", "mom"]
    scenario["support_requests"] = [
        {
            "id": "school-carpool-pickup",
            "kind": "carpool",
            "event_id": "school",
            "adult_id": "jordan",
            "responsibility_kind": "pickup",
            "status": request_status,
            "notification_status": "delivered" if request_status != "draft" else "draft",
        }
    ]
    return scenario


def test_pending_carpool_is_not_counted_until_the_other_parent_accepts():
    scenario = _add_carpool_parent(family_four_school_sports_scenario())

    waiting = analyze_family_logistics(scenario)
    suggestion = next(
        item
        for item in waiting["suggestions"]
        if item["event_id"] == "school"
    )
    assert suggestion["kind"] == "request_support"
    assert suggestion["adult_id"] == "jordan"
    assert "still pending" in suggestion["body"]

    accepted = apply_support_request_action(
        scenario,
        request_id="school-carpool-pickup",
        action="accept",
    )
    ready = analyze_family_logistics(accepted)
    carpool = next(
        item for item in ready["suggestions"] if item["event_id"] == "school"
    )
    assert carpool["kind"] == "reassign"
    assert carpool["adult_id"] == "jordan"


def test_visible_carpool_scenario_exercises_the_pending_response_path():
    result = analyze_family_logistics(family_four_carpool_scenario())
    suggestion = next(
        item for item in result["suggestions"] if item["event_id"] == "school"
    )

    assert suggestion["kind"] == "request_support"
    assert result["support_requests"][0]["status"] == "pending"
    assert result["support_requests"][0]["notification_status"] == "delivered"


def test_helper_notification_and_response_state_machine():
    scenario = _add_carpool_parent(
        family_four_school_sports_scenario(), request_status="draft"
    )

    queued = apply_support_request_action(
        scenario,
        request_id="school-carpool-pickup",
        action="send",
    )
    request = queued["support_requests"][0]
    assert (request["status"], request["notification_status"]) == ("pending", "queued")

    delivered = apply_support_request_action(
        queued,
        request_id="school-carpool-pickup",
        action="mark_delivered",
    )
    assert delivered["support_requests"][0]["notification_status"] == "delivered"

    declined = apply_support_request_action(
        delivered,
        request_id="school-carpool-pickup",
        action="decline",
    )
    assert declined["support_requests"][0]["status"] == "declined"
    with pytest.raises(ValueError, match="only a pending"):
        apply_support_request_action(
            declined,
            request_id="school-carpool-pickup",
            action="accept",
        )


def test_multiweek_fairness_prefers_the_less_loaded_available_parent():
    scenario = family_four_school_sports_scenario()
    scenario["rules"] = []
    scenario["events"] = [
        {
            "id": "library-club",
            "title": "Library club",
            "kind": "child_activity",
            "start_minute": 12 * 60,
            "end_minute": 13 * 60,
            "participant_ids": ["ethan"],
            "requires_adult": True,
            "responsibility_mode": "throughout",
            "series_id": None,
            "assigned_adult_id": None,
            "travel_before": 0,
            "travel_after": 0,
            "location_id": "school-campus",
            "fixed": True,
        }
    ]

    result = analyze_family_logistics(scenario)

    assert result["fairness"]["status"] == "balanced"
    assert result["suggestions"][0]["adult_id"] == "mom"
    assert result["suggestions"][0]["kind"] == "reassign"


def test_family_four_reports_four_week_load_and_next_handoff_advice():
    result = analyze_family_logistics(family_four_school_sports_scenario())

    assert result["fairness"]["status"] == "needs_balance"
    assert result["fairness"]["gap_minutes"] == 170
    assert "Prefer Mom" in result["fairness"]["recommendation"]
    assert result["vehicle_checks"] == 2


def test_route_vehicle_carpool_and_fairness_interactions_stay_consistent():
    for offset in range(120):
        request_status = "accepted" if offset % 2 else "pending"
        scenario = _add_carpool_parent(
            family_four_school_sports_scenario(), request_status=request_status
        )
        traffic = offset % 16
        for route in scenario["routes"]:
            route["traffic_minutes"] = traffic
        sedan = next(
            vehicle
            for vehicle in scenario["vehicles"]
            if vehicle["id"] == "family-sedan"
        )
        sedan["passenger_capacity"] = 1 if offset % 3 == 0 else 3

        result = analyze_family_logistics(scenario)
        school = next(
            item for item in result["assignments"] if item["id"] == "school"
        )
        school_vehicle_issues = [
            issue
            for issue in result["issues"]
            if issue["kind"] == "vehicle_constraint"
            and issue["event_ids"] == ["school"]
        ]
        school_suggestions = [
            item
            for item in result["suggestions"]
            if item["event_id"] == "school"
        ]

        assert school["travel_before"] == 15 + traffic
        assert bool(school_vehicle_issues) is (offset % 3 == 0)
        assert result["fairness"]["gap_minutes"] == abs(
            result["fairness"]["rows"][0]["total_minutes"]
            - result["fairness"]["rows"][1]["total_minutes"]
        )
        if request_status == "pending":
            assert not any(
                item["kind"] == "reassign" and item["adult_id"] == "jordan"
                for item in school_suggestions
            )
        if school_vehicle_issues:
            vehicle_suggestion = next(
                item for item in school_suggestions if item["kind"] == "switch_vehicle"
            )
            changed = apply_vehicle_change(
                scenario,
                event_id="school",
                vehicle_id=vehicle_suggestion["vehicle_id"],
                scope="occurrence",
            )
            assert not any(
                issue["kind"] == "vehicle_constraint"
                and issue["event_ids"] == ["school"]
                for issue in analyze_family_logistics(changed)["issues"]
            )


def test_hundreds_of_family_four_time_variations_preserve_core_invariants():
    for offset in range(240):
        scenario = family_four_school_sports_scenario()
        dad_appointment = scenario["events"][0]
        mom_call = scenario["events"][1]
        football = scenario["events"][3]
        dad_start = 14 * 60 + (offset * 7) % 150
        mom_start = 14 * 60 + (offset * 11) % 150
        football_start = 16 * 60 + (offset * 13) % 90
        dad_appointment["start_minute"] = dad_start
        dad_appointment["end_minute"] = dad_start + 60
        mom_call["start_minute"] = mom_start
        mom_call["end_minute"] = mom_start + 60
        football["start_minute"] = football_start
        football["end_minute"] = football_start + 120

        result = analyze_family_logistics(scenario)

        assert result == analyze_family_logistics(deepcopy(scenario))
        assert len(result["assignments"]) == len(scenario["events"])
        assert all(issue["overlap_minutes"] > 0 for issue in result["issues"])
        assert all(
            block["start_minute"] < block["end_minute"]
            for blocks in result["timeline"].values()
            for block in blocks
        )
