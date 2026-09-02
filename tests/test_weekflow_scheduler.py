from faithsparks.services.weekflow_scheduler import (
    PARENT,
    STUDENT,
    TASKS,
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
    result = generate_demo_schedule()
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
    result = generate_demo_schedule()
    entries = _all_entries(result)

    for index, entry in enumerate(entries):
        for other in entries[index + 1 :]:
            if set(entry["student_ids"]) & set(other["student_ids"]):
                assert not _overlaps(entry, other)


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
    tasks_by_id = {task.id: task for task in TASKS}
    move_option = next(
        item for item in result["recommendations"] if item["kind"] == "move"
    )
    extend_option = next(
        item for item in result["recommendations"] if item["kind"] == "extend"
    )

    assert sum(
        tasks_by_id[task_id].parent_minutes for task_id in move_option["task_ids"]
    ) == result["metrics"]["parent_shortfall"]
    assert extend_option["minutes_added"] == result["metrics"]["parent_shortfall"]


def test_baseline_needs_no_warning_or_remedy():
    result = generate_demo_schedule()

    assert result["warnings"] == []
    assert result["recommendations"] == []


def test_schedule_is_deterministic():
    assert generate_demo_schedule() == generate_demo_schedule()
    assert generate_demo_schedule(missed_tuesday=True) == generate_demo_schedule(
        missed_tuesday=True
    )
