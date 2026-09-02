import faithsparks.services.weekflow_scheduler as scheduler

from faithsparks.services.weekflow_scheduler import (
    DAYS,
    PARENT,
    Phase,
    STUDENT,
    TASKS,
    Task,
    generate_demo_schedule,
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


def test_disrupted_schedule_offers_capacity_valid_remedies(monkeypatch):
    result = generate_demo_schedule(missed_tuesday=True)
    tasks_by_id = {task.id: task for task in TASKS}
    move_option = next(
        item for item in result["recommendations"] if item["kind"] == "move"
    )
    extend_option = next(
        item for item in result["recommendations"] if item["kind"] == "extend"
    )

    moved_parent_minutes = sum(
        tasks_by_id[task_id].parent_minutes for task_id in move_option["task_ids"]
    )
    assert moved_parent_minutes == move_option["minutes_freed"]
    assert moved_parent_minutes >= result["metrics"]["parent_shortfall"]
    assert extend_option["minutes_added"] == result["metrics"]["parent_shortfall"]

    deferred_ids = set(move_option["task_ids"])
    monkeypatch.setattr(
        scheduler,
        "TASKS",
        tuple(task for task in TASKS if task.id not in deferred_ids),
    )
    remaining = generate_demo_schedule(missed_tuesday=True)
    assert remaining["scheduled_count"] == len(TASKS) - len(deferred_ids)
    assert remaining["unscheduled_count"] == 0
    assert not any(entry["late"] for entry in _all_entries(remaining))


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


def test_schedule_is_deterministic():
    assert generate_demo_schedule() == generate_demo_schedule()
    assert generate_demo_schedule(missed_tuesday=True) == generate_demo_schedule(
        missed_tuesday=True
    )
