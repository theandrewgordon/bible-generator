"""Deterministic resource scheduler for the WeekFlow Labs prototype.

The lab intentionally models a small, fixed family.  Assignments are made of
contiguous phases, and only the phases that need a parent reserve the shared
parent resource.  This lets a kickoff -> independent work -> review assignment
release the parent between its assisted phases.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


PARENT = "parent"
STUDENT = "student"


@dataclass(frozen=True)
class Phase:
    label: str
    minutes: int
    resource: str


@dataclass(frozen=True)
class Task:
    id: str
    title: str
    subject: str
    student_ids: tuple[str, ...]
    phases: tuple[Phase, ...]
    due_day: int = 1
    priority: int = 0
    preferred_start: tuple[int, int] | None = None

    @property
    def total_minutes(self) -> int:
        return sum(phase.minutes for phase in self.phases)

    @property
    def parent_minutes(self) -> int:
        return sum(
            phase.minutes for phase in self.phases if phase.resource == PARENT
        )


@dataclass(frozen=True)
class Day:
    id: str
    label: str
    start_minute: int
    end_minute: int
    parent_unavailable: tuple[tuple[int, int], ...] = ()
    preferred_parent: tuple[tuple[int, int], ...] = ()

    @property
    def duration(self) -> int:
        return self.end_minute - self.start_minute


STUDENTS = {
    "tessa": {"name": "Tessa", "color": "#6657d9"},
    "diana": {"name": "Diana", "color": "#d45e86"},
    "elsie": {"name": "Elsie", "color": "#168a80"},
}


DAYS = (
    Day(
        "tue",
        "Tuesday",
        9 * 60,
        12 * 60 + 30,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "wed",
        "Wednesday",
        9 * 60,
        12 * 60 + 30,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "thu",
        "Thursday",
        9 * 60,
        12 * 60 + 30,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "fri",
        "Friday",
        9 * 60,
        12 * 60 + 30,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
)


TASKS = (
    Task(
        "science",
        "Plant Cells Lab",
        "Science",
        ("tessa", "diana", "elsie"),
        (Phase("Group instruction", 40, PARENT),),
        priority=4,
        preferred_start=(11 * 60, 12 * 60 + 30),
    ),
    Task(
        "history",
        "Revolution Timeline",
        "History",
        ("tessa", "diana", "elsie"),
        (Phase("Family lesson", 30, PARENT),),
        priority=3,
    ),
    Task(
        "tessa-writing",
        "Argument Paragraph",
        "Writing",
        ("tessa",),
        (
            Phase("Plan with Mom", 15, PARENT),
            Phase("Draft independently", 30, STUDENT),
            Phase("Review with Mom", 5, PARENT),
        ),
        priority=4,
    ),
    Task(
        "diana-math",
        "Fractions Practice",
        "Math",
        ("diana",),
        (
            Phase("Kickoff with Mom", 8, PARENT),
            Phase("Practice independently", 22, STUDENT),
            Phase("Check with Mom", 5, PARENT),
        ),
        priority=5,
    ),
    Task(
        "diana-reading",
        "Read and Narrate",
        "Reading",
        ("diana",),
        (
            Phase("Read aloud with Mom", 15, PARENT),
            Phase("Finish independently", 15, STUDENT),
        ),
        priority=3,
    ),
    Task(
        "diana-spelling",
        "Spelling Pattern",
        "Spelling",
        ("diana",),
        (
            Phase("Teach pattern", 15, PARENT),
            Phase("Independent check", 5, STUDENT),
        ),
        priority=2,
    ),
    Task(
        "diana-grammar",
        "Diagram Sentences",
        "Grammar",
        ("diana",),
        (Phase("Direct instruction", 20, PARENT),),
        priority=4,
    ),
    Task(
        "elsie-reading",
        "Beginning Reader",
        "Reading",
        ("elsie",),
        (Phase("One-on-one reading", 25, PARENT),),
        priority=5,
    ),
    Task(
        "elsie-math",
        "Number Bonds",
        "Math",
        ("elsie",),
        (Phase("One-on-one math", 20, PARENT),),
        priority=4,
    ),
    Task(
        "elsie-phonics",
        "Short Vowels",
        "Phonics",
        ("elsie",),
        (Phase("Guided phonics", 22, PARENT),),
        priority=4,
    ),
    Task(
        "elsie-picture-books",
        "Picture Book Read-Aloud",
        "Literature",
        ("elsie",),
        (Phase("Read aloud together", 15, PARENT),),
        priority=2,
    ),
    Task(
        "tessa-latin",
        "Latin Vocabulary",
        "Latin",
        ("tessa",),
        (Phase("Independent practice", 35, STUDENT),),
        priority=3,
    ),
    Task(
        "tessa-research",
        "Research Notes",
        "Research",
        ("tessa",),
        (Phase("Independent research", 30, STUDENT),),
        priority=2,
    ),
    Task(
        "tessa-algebra",
        "Algebra Practice",
        "Math",
        ("tessa",),
        (Phase("Independent practice", 25, STUDENT),),
        priority=3,
    ),
    Task(
        "elsie-handwriting",
        "Letter Practice",
        "Handwriting",
        ("elsie",),
        (Phase("Independent practice", 15, STUDENT),),
        priority=2,
    ),
)


def _fmt_time(minute: int) -> str:
    hour, mins = divmod(minute, 60)
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{mins:02d} {suffix}"


def _overlap_minutes(
    start: int, end: int, windows: Iterable[tuple[int, int]]
) -> int:
    return sum(max(0, min(end, right) - max(start, left)) for left, right in windows)


def _is_free(bits: list[bool], start: int, end: int) -> bool:
    return not any(bits[start:end])


def _mark(bits: list[bool], start: int, end: int) -> None:
    bits[start:end] = [True] * (end - start)


def _task_order(task: Task) -> tuple[int, int, int, int, str]:
    return (
        task.due_day,
        -len(task.student_ids),
        -task.parent_minutes,
        -task.priority,
        task.id,
    )


def _candidate_cost(
    task: Task,
    day_index: int,
    start_minute: int,
    day: Day,
    student_busy: dict[str, list[bool]],
) -> int:
    lateness = max(0, day_index - task.due_day)
    cost = lateness * 1_000_000 + day_index * 20_000
    cost += start_minute - day.start_minute

    if task.preferred_start:
        preferred_left, preferred_right = task.preferred_start
        if start_minute < preferred_left:
            cost += (preferred_left - start_minute) * 12
        elif start_minute > preferred_right:
            cost += (start_minute - preferred_right) * 12

    cursor = start_minute
    for phase in task.phases:
        phase_end = cursor + phase.minutes
        if phase.resource == PARENT and day.preferred_parent:
            preferred = _overlap_minutes(cursor, phase_end, day.preferred_parent)
            cost += (phase.minutes - preferred) * 7

        # Prefer household concurrency: another child doing useful work while
        # this phase runs makes the family day shorter without adding conflict.
        for student_id, bits in student_busy.items():
            if student_id not in task.student_ids:
                offset_start = cursor - day.start_minute
                offset_end = phase_end - day.start_minute
                cost -= sum(bits[offset_start:offset_end])
        cursor = phase_end
    return cost


def _capacity_metrics(missed_tuesday: bool) -> dict[str, object]:
    due_day = max(task.due_day for task in TASKS)
    due_days = DAYS[: due_day + 1]

    parent_capacity = 0
    student_capacity = {student_id: 0 for student_id in STUDENTS}
    for day_index, day in enumerate(due_days):
        if missed_tuesday and day_index == 0:
            continue
        unavailable = sum(end - start for start, end in day.parent_unavailable)
        parent_capacity += day.duration - unavailable
        for student_id in student_capacity:
            student_capacity[student_id] += day.duration

    parent_demand = sum(task.parent_minutes for task in TASKS)
    student_demand = {
        student_id: sum(
            task.total_minutes for task in TASKS if student_id in task.student_ids
        )
        for student_id in STUDENTS
    }
    return {
        "due_label": DAYS[due_day].label,
        "parent_demand": parent_demand,
        "parent_capacity": parent_capacity,
        "parent_shortfall": max(0, parent_demand - parent_capacity),
        "students": {
            student_id: {
                "name": STUDENTS[student_id]["name"],
                "demand": demand,
                "capacity": student_capacity[student_id],
                "shortfall": max(0, demand - student_capacity[student_id]),
            }
            for student_id, demand in student_demand.items()
        },
    }


def _build_explanations(entries: list[dict[str, object]]) -> list[dict[str, str]]:
    explanations: list[dict[str, str]] = []
    parent_phases: list[dict[str, object]] = []
    for entry in entries:
        for phase in entry["phases"]:
            if phase["resource"] == PARENT:
                parent_phases.append({**phase, "task_title": entry["title"]})

    for entry in entries:
        phases = entry["phases"]
        student_names = entry["student_names"]
        day_label = entry["day_label"]
        at = entry["start"]

        if len(entry["student_ids"]) > 1:
            body = (
                f"{entry['title']} starts {day_label} at {at} because all three "
                "students are free together; one parent-led block satisfies the "
                "instruction requirement for the whole family."
            )
        elif len(phases) > 1 and any(
            phase["resource"] == STUDENT for phase in phases
        ) and any(phase["resource"] == PARENT for phase in phases):
            phase_text = " → ".join(
                f"{phase['minutes']} min {'with Mom' if phase['resource'] == PARENT else 'independent'}"
                for phase in phases
            )
            body = (
                f"{student_names[0]}'s {entry['title']} is kept as one learning "
                f"sequence ({phase_text}). The independent phase releases Mom "
                "to teach another child before returning for the next assisted phase."
            )
        elif all(phase["resource"] == STUDENT for phase in phases):
            overlaps = []
            for parent_phase in parent_phases:
                if parent_phase["day_id"] != entry["day_id"]:
                    continue
                if parent_phase["start_minute"] < entry["end_minute"] and entry[
                    "start_minute"
                ] < parent_phase["end_minute"]:
                    overlaps.append(str(parent_phase["task_title"]))
            if overlaps:
                body = (
                    f"{student_names[0]}'s independent {entry['title']} overlaps "
                    f"{overlaps[0]}, using student capacity while Mom's attention "
                    "is committed elsewhere."
                )
            else:
                body = (
                    f"{student_names[0]}'s {entry['title']} needs no parent "
                    "attention, so it fills otherwise unused student time."
                )
        else:
            body = (
                f"{entry['title']} uses an open parent-attention window without "
                f"double-booking {student_names[0]} or Mom."
            )

        explanations.append(
            {
                "title": f"{day_label}, {at} · {entry['title']}",
                "body": body,
            }
        )
    return explanations


def _build_recommendations(
    metrics: dict[str, object], late_entries: list[dict[str, object]]
) -> list[dict[str, object]]:
    shortfall = int(metrics["parent_shortfall"])
    if not shortfall:
        return []

    late_names = [str(entry["title"]) for entry in late_entries]
    return [
        {
            "kind": "accept",
            "title": "Keep the conflict-free recovery plan",
            "body": (
                f"Let {len(late_names)} assignments move to Thursday: "
                f"{', '.join(late_names)}. Nothing is double-booked, and all "
                "fifteen assignments still fit this week."
            ),
            "task_ids": [str(entry["task_id"]) for entry in late_entries],
        },
        {
            "kind": "move",
            "title": "Move three selected lessons past Wednesday",
            "body": (
                "Move Plant Cells Lab (40 parent minutes), Fractions Practice "
                "(13 parent minutes), and Spelling Pattern (15 parent minutes) "
                "to Thursday. The scheduler verifies that the remaining thirteen "
                "assignments then fit by Wednesday without conflicts."
            ),
            "minutes_freed": 68,
            "task_ids": ["science", "diana-math", "diana-spelling"],
        },
        {
            "kind": "extend",
            "title": f"Add {shortfall} minutes of teaching availability",
            "body": (
                f"Extending Wednesday's parent availability by {shortfall} "
                "minutes closes the raw attention-capacity gap. WeekFlow would "
                "then re-run the phase placement before promising the deadline."
            ),
            "minutes_added": shortfall,
            "task_ids": [],
        },
    ]


def generate_demo_schedule(missed_tuesday: bool = False) -> dict[str, object]:
    """Generate the deterministic WeekFlow demo schedule."""

    day_states: list[dict[str, object]] = []
    for day_index, day in enumerate(DAYS):
        missed = missed_tuesday and day_index == 0
        parent_available = [not missed] * day.duration
        for start, end in day.parent_unavailable:
            left = max(0, start - day.start_minute)
            right = min(day.duration, end - day.start_minute)
            parent_available[left:right] = [False] * max(0, right - left)
        day_states.append(
            {
                "day": day,
                "missed": missed,
                "parent_available": parent_available,
                "parent_busy": [False] * day.duration,
                "student_busy": {
                    student_id: [missed] * day.duration for student_id in STUDENTS
                },
            }
        )

    entries: list[dict[str, object]] = []
    unscheduled: list[Task] = []

    for task in sorted(TASKS, key=_task_order):
        candidates: list[tuple[int, int, int]] = []
        for day_index, state in enumerate(day_states):
            if state["missed"]:
                continue
            day: Day = state["day"]
            latest_start = day.end_minute - task.total_minutes
            for start_minute in range(day.start_minute, latest_start + 1):
                cursor = start_minute
                valid = True
                for phase in task.phases:
                    phase_end = cursor + phase.minutes
                    left = cursor - day.start_minute
                    right = phase_end - day.start_minute
                    for student_id in task.student_ids:
                        if not _is_free(state["student_busy"][student_id], left, right):
                            valid = False
                            break
                    if not valid:
                        break
                    if phase.resource == PARENT:
                        if not all(state["parent_available"][left:right]) or not _is_free(
                            state["parent_busy"], left, right
                        ):
                            valid = False
                            break
                    cursor = phase_end
                if valid:
                    candidates.append(
                        (
                            _candidate_cost(
                                task,
                                day_index,
                                start_minute,
                                day,
                                state["student_busy"],
                            ),
                            day_index,
                            start_minute,
                        )
                    )

        if not candidates:
            unscheduled.append(task)
            continue

        _, day_index, start_minute = min(candidates)
        state = day_states[day_index]
        day = state["day"]
        cursor = start_minute
        phase_rows = []
        for phase in task.phases:
            phase_end = cursor + phase.minutes
            left = cursor - day.start_minute
            right = phase_end - day.start_minute
            for student_id in task.student_ids:
                _mark(state["student_busy"][student_id], left, right)
            if phase.resource == PARENT:
                _mark(state["parent_busy"], left, right)
            phase_rows.append(
                {
                    "label": phase.label,
                    "minutes": phase.minutes,
                    "resource": phase.resource,
                    "start": _fmt_time(cursor),
                    "end": _fmt_time(phase_end),
                    "start_minute": cursor,
                    "end_minute": phase_end,
                    "day_id": day.id,
                }
            )
            cursor = phase_end

        entries.append(
            {
                "task_id": task.id,
                "title": task.title,
                "subject": task.subject,
                "student_ids": list(task.student_ids),
                "student_names": [STUDENTS[item]["name"] for item in task.student_ids],
                "start": _fmt_time(start_minute),
                "end": _fmt_time(cursor),
                "start_minute": start_minute,
                "end_minute": cursor,
                "duration": task.total_minutes,
                "parent_minutes": task.parent_minutes,
                "day_id": day.id,
                "day_label": day.label,
                "day_index": day_index,
                "late": day_index > task.due_day,
                "phases": phase_rows,
            }
        )

    entries.sort(key=lambda item: (item["day_index"], item["start_minute"], item["title"]))
    metrics = _capacity_metrics(missed_tuesday)
    late_entries = [entry for entry in entries if entry["late"]]

    warnings = []
    if metrics["parent_shortfall"]:
        warnings.append(
            {
                "kind": "parent",
                "title": f"Parent-attention shortfall: {metrics['parent_shortfall']} minutes",
                "body": (
                    f"The children have enough individual time before {metrics['due_label']} ends, "
                    f"but the work needs {metrics['parent_demand']} minutes of direct parent attention "
                    f"and only {metrics['parent_capacity']} minutes remain. Lower-priority assisted "
                    "work is moved later instead of creating an invalid schedule."
                ),
            }
        )
    if late_entries:
        warnings.append(
            {
                "kind": "late",
                "title": f"{len(late_entries)} assignment{'s' if len(late_entries) != 1 else ''} moved past Wednesday",
                "body": ", ".join(str(entry["title"]) for entry in late_entries),
            }
        )
    if unscheduled:
        warnings.append(
            {
                "kind": "unscheduled",
                "title": (
                    f"{len(unscheduled)} assignment"
                    f"{'s' if len(unscheduled) != 1 else ''} could not fit this week"
                ),
                "body": ", ".join(task.title for task in unscheduled),
            }
        )

    day_rows = []
    for day_index, day in enumerate(DAYS):
        day_rows.append(
            {
                "id": day.id,
                "label": day.label,
                "start": _fmt_time(day.start_minute),
                "end": _fmt_time(day.end_minute),
                "missed": missed_tuesday and day_index == 0,
                "entries": [entry for entry in entries if entry["day_index"] == day_index],
            }
        )

    return {
        "mode": "disrupted" if missed_tuesday else "baseline",
        "days": day_rows,
        "metrics": metrics,
        "warnings": warnings,
        "recommendations": _build_recommendations(metrics, late_entries),
        "explanations": _build_explanations(entries),
        "scheduled_count": len(entries),
        "unscheduled_count": len(unscheduled),
    }


def demo_payload() -> dict[str, object]:
    """Return human-readable constraints and assignments for the lab UI."""

    return {
        "students": [
            {"id": student_id, **student} for student_id, student in STUDENTS.items()
        ],
        "days": [
            {
                "id": day.id,
                "label": day.label,
                "start": _fmt_time(day.start_minute),
                "end": _fmt_time(day.end_minute),
                "parent_unavailable": [
                    f"{_fmt_time(start)}–{_fmt_time(end)}"
                    for start, end in day.parent_unavailable
                ],
                "preferred_parent": [
                    f"{_fmt_time(start)}–{_fmt_time(end)}"
                    for start, end in day.preferred_parent
                ],
            }
            for day in DAYS
        ],
        "tasks": [
            {
                "id": task.id,
                "title": task.title,
                "subject": task.subject,
                "student_names": [STUDENTS[item]["name"] for item in task.student_ids],
                "minutes": task.total_minutes,
                "parent_minutes": task.parent_minutes,
                "phases": [
                    {
                        "label": phase.label,
                        "minutes": phase.minutes,
                        "resource": phase.resource,
                    }
                    for phase in task.phases
                ],
            }
            for task in TASKS
        ],
    }
