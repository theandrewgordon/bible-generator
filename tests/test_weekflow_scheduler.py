import faithsparks.services.weekflow_scheduler as scheduler
from faithsparks.services.weekflow_scheduler import (
    DAYS,
    PARENT,
    STUDENT,
    TASKS,
    Phase,
    Task,
    default_scenario,
    generate_demo_schedule,
    normalize_scenario,
)


def _all_entries(result):
    return [entry for day in result["days"] for entry in day["entries"]]


def _overlaps(left, right):
    return (
        left["day_id"] == right["day_id"]
        and left["start_minute"] < right["end_minute"]
        and right["start_minute"] < left["end_minute"]
    )


def test_demo_has_fifteen_assignments_and_expected_parent_demand():
    assert len(TASKS) == 15
    assert sum(task.parent_minutes for task in TASKS) == 235


def test_generated_schedule_never_double_books_parent():
    for missed_tuesday in (False, True):
        result = generate_demo_schedule(missed_tuesday=missed_tuesday)
        parent_phases = [
            phase
            for entry in _all_entries(result)
            for phase in entry["phases"]
            if phase["resource"] == PARENT
        ]

        for index, phase in enumerate(parent_phases):
            for other in parent_phases[index + 1 :]:
                assert not _overlaps(phase, other)


def test_generated_schedule_never_double_books_a_student():
    for missed_tuesday in (False, True):
        result = generate_demo_schedule(missed_tuesday=missed_tuesday)
        entries = _all_entries(result)

        for index, entry in enumerate(entries):
            for other in entries[index + 1 :]:
                if set(entry["student_ids"]) & set(other["student_ids"]):
                    assert not _overlaps(entry, other)


def test_every_phase_is_contiguous_in_bounds_and_respects_parent_blackouts():
    days_by_id = {day.id: day for day in DAYS}

    for missed_tuesday in (False, True):
        for entry in _all_entries(
            generate_demo_schedule(missed_tuesday=missed_tuesday)
        ):
            day = days_by_id[entry["day_id"]]
            assert day.start_minute <= entry["start_minute"]
            assert entry["end_minute"] <= day.end_minute

            cursor = entry["start_minute"]
            for phase in entry["phases"]:
                assert phase["start_minute"] == cursor
                assert phase["end_minute"] - phase["start_minute"] == phase["minutes"]
                if phase["resource"] == PARENT:
                    assert all(
                        phase["end_minute"] <= start
                        or end <= phase["start_minute"]
                        for start, end in day.parent_unavailable
                    )
                cursor = phase["end_minute"]
            assert cursor == entry["end_minute"]


def test_phased_assignment_releases_parent_during_independent_work():
    result = generate_demo_schedule()
    entries = _all_entries(result)
    writing = next(entry for entry in entries if entry["task_id"] == "tessa-writing")

    assert [phase["resource"] for phase in writing["phases"]] == [
        PARENT,
        STUDENT,
        PARENT,
    ]
    independent = writing["phases"][1]
    overlapping_parent_work = [
        phase
        for entry in entries
        if entry["task_id"] != writing["task_id"]
        for phase in entry["phases"]
        if phase["resource"] == PARENT and _overlaps(independent, phase)
    ]
    assert overlapping_parent_work


def test_group_lesson_uses_one_parent_block_for_all_students():
    result = generate_demo_schedule()
    science = next(
        entry for entry in _all_entries(result) if entry["task_id"] == "science"
    )

    assert science["student_ids"] == ["tessa", "diana", "elsie"]
    assert science["parent_minutes"] == 40
    assert len(science["phases"]) == 1


def test_missing_tuesday_creates_real_parent_capacity_shortfall():
    result = generate_demo_schedule(missed_tuesday=True)

    assert result["metrics"]["parent_demand"] == 235
    assert result["metrics"]["parent_capacity"] == 180
    assert result["metrics"]["parent_shortfall"] == 55
    assert all(
        student["shortfall"] == 0
        for student in result["metrics"]["students"].values()
    )
    assert result["warnings"][0]["kind"] == "parent"


def test_disrupted_schedule_offers_capacity_valid_remedies():
    result = generate_demo_schedule(missed_tuesday=True)
    entries = _all_entries(result)
    late_entries = [entry for entry in entries if entry["late"]]
    accept_option = next(
        item for item in result["recommendations"] if item["kind"] == "accept"
    )
    extend_option = next(
        item for item in result["recommendations"] if item["kind"] == "extend"
    )

    moved_parent_minutes = sum(entry["parent_minutes"] for entry in late_entries)
    assert accept_option["task_ids"] == [entry["task_id"] for entry in late_entries]
    assert extend_option["minutes_added"] == moved_parent_minutes
    assert moved_parent_minutes >= result["metrics"]["parent_shortfall"]


def test_baseline_needs_no_warning_or_remedy():
    result = generate_demo_schedule()

    assert result["warnings"] == []
    assert result["recommendations"] == []


def test_impossible_assignment_is_reported_instead_of_silently_dropped(monkeypatch):
    impossible = Task(
        "impossible",
        "Impossible Assignment",
        "Stress test",
        ("tessa",),
        (Phase("Oversized work", DAYS[0].duration + 1, STUDENT),),
    )
    monkeypatch.setattr(scheduler, "TASKS", (impossible,))

    result = generate_demo_schedule()

    assert result["scheduled_count"] == 0
    assert result["unscheduled_count"] == 1
    assert result["warnings"] == [
        {
            "kind": "unscheduled",
            "title": "1 assignment could not fit this week",
            "body": "Impossible Assignment",
        }
    ]

    no_rollover = generate_demo_schedule(scenario={"allow_next_week": False})
    assert no_rollover["recommendations"][0]["kind"] == "capacity"
    assert no_rollover["recommendations"][0]["title"] == (
        "Add capacity or remove optional work"
    )


def test_default_week_models_monday_coop_and_extended_teen_time():
    result = generate_demo_schedule()
    monday = result["days"][0]

    assert result["scenario"] == default_scenario()
    assert monday["events"][0]["id"] == "coop_monday"
    assert monday["availability"]["parent_minutes"] == 0
    assert monday["availability"]["students"]["tessa"] == 45
    assert monday["availability"]["students"]["diana"] == 0
    assert all(
        entry["student_ids"] == ["tessa"]
        and entry["parent_minutes"] == 0
        and entry["start_minute"] >= 15 * 60 + 15
        for entry in monday["entries"]
    )


def test_coop_subject_credit_satisfies_assignments_without_rescheduling_them():
    result = generate_demo_schedule(
        scenario={"coop_credit_subjects": ["Science", "History"]}
    )
    scheduled_ids = {entry["task_id"] for entry in _all_entries(result)}

    assert result["mode"] == "adjusted"
    assert result["completed_count"] == 2
    assert {item["task_id"] for item in result["completed"]} == {
        "science",
        "history",
    }
    assert all(item["kind"] == "coop_credit" for item in result["completed"])
    assert not {"science", "history"} & scheduled_ids
    assert result["metrics"]["parent_demand"] == 165


def test_work_completed_ahead_is_removed_and_takes_precedence_over_coop_credit():
    result = generate_demo_schedule(
        scenario={
            "coop_credit_subjects": ["Science"],
            "completed_task_ids": ["science", "tessa-algebra", "tessa-latin"],
        }
    )

    completed = {item["task_id"]: item for item in result["completed"]}
    assert result["completed_count"] == 3
    assert completed["science"]["kind"] == "ahead"
    assert completed["tessa-algebra"]["kind"] == "ahead"
    assert not {"science", "tessa-algebra", "tessa-latin"} & {
        entry["task_id"] for entry in _all_entries(result)
    }


def test_entire_week_can_be_marked_complete_ahead_of_time():
    result = generate_demo_schedule(
        scenario={"completed_task_ids": [task.id for task in TASKS]}
    )

    assert result["mode"] == "adjusted"
    assert result["scheduled_count"] == 0
    assert result["completed_count"] == len(TASKS)
    assert result["unscheduled_count"] == 0
    assert result["metrics"]["parent_demand"] == 0
    assert result["warnings"] == []


def test_per_person_daily_availability_changes_capacity_and_placement():
    scenario = default_scenario()
    scenario["availability_end"]["diana"]["tue"] = 0
    scenario["availability_end"]["parent"]["wed"] = 14 * 60
    scenario["availability_end"]["tessa"]["fri"] = 16 * 60

    result = generate_demo_schedule(scenario=scenario)

    assert result["scenario"]["availability_end"]["diana"]["tue"] == 0
    assert result["scenario"]["availability_end"]["parent"]["wed"] == 14 * 60
    assert result["days"][1]["availability"]["students"]["diana"] == 0
    assert result["days"][2]["availability"]["parent_minutes"] == 270
    assert result["days"][4]["availability"]["students"]["tessa"] == 420


def test_deadline_policy_distinguishes_hard_work_from_flexible_work():
    strict = generate_demo_schedule(
        missed_tuesday=True,
        scenario={"deadline_policy": "strict"},
    )
    essentials = generate_demo_schedule(
        missed_tuesday=True,
        scenario={"deadline_policy": "essentials"},
    )
    balanced = generate_demo_schedule(
        missed_tuesday=True,
        scenario={"deadline_policy": "balanced"},
    )
    tasks_by_id = {task.id: task for task in TASKS}
    essential_late = [entry for entry in _all_entries(essentials) if entry["late"]]

    assert len([entry for entry in _all_entries(strict) if entry["late"]]) == 5
    assert strict["metrics"]["parent_shortfall"] == 55
    assert essential_late
    assert all(tasks_by_id[entry["task_id"]].priority >= 4 for entry in essential_late)
    assert not any(entry["late"] for entry in _all_entries(balanced))
    assert balanced["metrics"]["due_label"] == "Friday"


def test_combined_life_events_are_layered_without_conflicts():
    scenario = {
        "disruptions": [
            "sick_monday",
            "grandma_wednesday",
            "parent_appointment_tuesday",
            "missed_nap_wednesday",
            "friday_off",
        ],
        "coop_credit_subjects": ["Science", "History"],
        "completed_task_ids": ["tessa-algebra"],
    }
    result = generate_demo_schedule(scenario=scenario)
    entries = _all_entries(result)

    assert result["mode"] == "disrupted"
    assert result["days"][0]["missed"] is True
    assert result["days"][4]["missed"] is True
    assert {event["id"] for day in result["days"] for event in day["events"]} >= {
        "coop_monday",
        "sick_monday",
        "grandma_wednesday",
        "parent_appointment_tuesday",
        "missed_nap_wednesday",
        "friday_off",
    }

    for index, entry in enumerate(entries):
        for other in entries[index + 1 :]:
            if set(entry["student_ids"]) & set(other["student_ids"]):
                assert not _overlaps(entry, other)


def test_scenario_validation_rejects_unknown_values():
    for scenario in (
        {"coop_monday": "yes"},
        {"allow_next_week": 1},
        {"deadline_policy": "eventually"},
        {"extended_days": ["someday"]},
        {"disruptions": ["meteor"]},
        {"completed_task_ids": ["not-a-task"]},
        {"coop_credit_subjects": ["Underwater Basket Weaving"]},
        {"availability_end": {}},
        {
            "availability_end": {
                **default_scenario()["availability_end"],
                "tessa": {
                    **default_scenario()["availability_end"]["tessa"],
                    "mon": 17 * 60,
                },
            }
        },
    ):
        try:
            normalize_scenario(scenario)
        except (TypeError, ValueError):
            pass
        else:
            raise AssertionError(f"Scenario should have failed validation: {scenario}")


def test_schedule_is_deterministic():
    assert generate_demo_schedule() == generate_demo_schedule()
    assert generate_demo_schedule(missed_tuesday=True) == generate_demo_schedule(
        missed_tuesday=True
    )
