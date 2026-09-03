from copy import deepcopy

import pytest

from faithsparks.services.weekflow_logistics import (
    analyze_family_logistics,
    apply_responsibility_change,
    default_logistics_scenario,
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
