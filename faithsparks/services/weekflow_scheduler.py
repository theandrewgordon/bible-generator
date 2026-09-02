"""Deterministic resource scheduler for the WeekFlow Labs prototype.

The lab intentionally models a small, fixed family.  Assignments are made of
contiguous phases, and only the phases that need a parent reserve the shared
parent resource.  This lets a kickoff -> independent work -> review assignment
release the parent between its assisted phases.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, replace

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
    due_day: int = 2
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
        "mon",
        "Monday",
        9 * 60,
        16 * 60,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "tue",
        "Tuesday",
        9 * 60,
        16 * 60,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "wed",
        "Wednesday",
        9 * 60,
        16 * 60,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "thu",
        "Thursday",
        9 * 60,
        16 * 60,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
    Day(
        "fri",
        "Friday",
        9 * 60,
        16 * 60,
        parent_unavailable=((10 * 60 + 30, 11 * 60),),
        preferred_parent=((9 * 60 + 30, 10 * 60 + 30),),
    ),
)


MORNING_END = 12 * 60 + 30
EXTENDED_END = 16 * 60
DEFAULT_EXTENDED_DAYS = ("mon", "tue", "wed", "thu")
KNOWN_DISRUPTIONS = {
    "sick_monday",
    "grandma_wednesday",
    "parent_appointment_tuesday",
    "missed_nap_wednesday",
    "friday_off",
    "lost_tuesday",
}
COOP_CREDIT_SUBJECTS = {"Science", "History", "Fine Arts"}


def default_scenario() -> dict[str, object]:
    """Return the realistic weekly rhythm used by the interactive lab."""

    availability_end = {
        PARENT: {day.id: MORNING_END for day in DAYS},
        "tessa": {
            day.id: EXTENDED_END if day.id in DEFAULT_EXTENDED_DAYS else MORNING_END
            for day in DAYS
        },
        "diana": {day.id: MORNING_END for day in DAYS},
        "elsie": {day.id: MORNING_END for day in DAYS},
    }
    return {
        "coop_monday": True,
        "coop_credit_subjects": [],
        "extended_days": list(DEFAULT_EXTENDED_DAYS),
        "availability_end": availability_end,
        "disruptions": [],
        "completed_task_ids": [],
        "allow_next_week": True,
        "deadline_policy": "strict",
    }


def normalize_scenario(
    scenario: dict[str, object] | None = None,
    *,
    missed_tuesday: bool = False,
) -> dict[str, object]:
    """Validate and normalize user-facing planning controls."""

    supplied = scenario or {}
    normalized = default_scenario()
    if scenario:
        normalized.update(scenario)

    for field in ("coop_monday", "allow_next_week"):
        if not isinstance(normalized.get(field), bool):
            raise TypeError(f"{field} must be a boolean")

    deadline_policy = normalized.get("deadline_policy")
    if deadline_policy not in {"strict", "essentials", "balanced"}:
        raise ValueError("deadline_policy must be strict, essentials, or balanced")

    extended_days = normalized.get("extended_days", [])
    if not isinstance(extended_days, list) or not all(
        isinstance(day_id, str) and day_id in {day.id for day in DAYS}
        for day_id in extended_days
    ):
        raise ValueError("extended_days must contain valid weekday ids")
    normalized["extended_days"] = list(dict.fromkeys(extended_days))

    if "availability_end" not in supplied:
        availability_end = default_scenario()["availability_end"]
        availability_end["tessa"] = {
            day.id: EXTENDED_END if day.id in extended_days else MORNING_END
            for day in DAYS
        }
    else:
        availability_end = normalized.get("availability_end")
    resources = {PARENT, *STUDENTS}
    day_ids = {day.id for day in DAYS}
    if not isinstance(availability_end, dict) or set(availability_end) != resources:
        raise ValueError("availability_end must include parent and every student")
    for resource, day_values in availability_end.items():
        if not isinstance(day_values, dict) or set(day_values) != day_ids:
            raise ValueError(
                f"availability_end.{resource} must include every weekday"
            )
        if not all(
            isinstance(end, int)
            and not isinstance(end, bool)
            and (end == 0 or 9 * 60 <= end <= EXTENDED_END)
            for end in day_values.values()
        ):
            raise ValueError("availability end times must be off or between 9 AM and 4 PM")
    normalized["availability_end"] = {
        resource: dict(day_values)
        for resource, day_values in availability_end.items()
    }
    normalized["extended_days"] = [
        day.id
        for day in DAYS
        if normalized["availability_end"]["tessa"][day.id] > MORNING_END
    ]

    disruptions = normalized.get("disruptions", [])
    if not isinstance(disruptions, list) or not all(
        isinstance(item, str) and item in KNOWN_DISRUPTIONS for item in disruptions
    ):
        raise ValueError("disruptions contains an unknown event")
    disruptions = list(dict.fromkeys(disruptions))
    if missed_tuesday and "lost_tuesday" not in disruptions:
        disruptions.append("lost_tuesday")
    normalized["disruptions"] = disruptions

    completed = normalized.get("completed_task_ids", [])
    task_ids = {task.id for task in TASKS}
    if not isinstance(completed, list) or not all(
        isinstance(task_id, str) and task_id in task_ids for task_id in completed
    ):
        raise ValueError("completed_task_ids contains an unknown assignment")
    normalized["completed_task_ids"] = list(dict.fromkeys(completed))

    credits = normalized.get("coop_credit_subjects", [])
    if not isinstance(credits, list) or not all(
        isinstance(subject, str) and subject in COOP_CREDIT_SUBJECTS
        for subject in credits
    ):
        raise ValueError("coop_credit_subjects contains an unsupported subject")
    normalized["coop_credit_subjects"] = list(dict.fromkeys(credits))
    if not normalized["coop_monday"]:
        normalized["coop_credit_subjects"] = []

    return normalized


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


def _set_window(
    bits: list[bool], day: Day, start: int, end: int, *, available: bool
) -> None:
    left = max(0, start - day.start_minute)
    right = min(day.duration, end - day.start_minute)
    if right > left:
        bits[left:right] = [available] * (right - left)


def _build_availability(
    scenario: dict[str, object],
) -> tuple[dict[str, dict[str, list[bool]]], dict[str, list[dict[str, object]]]]:
    resources = [PARENT, *STUDENTS]
    availability = {
        resource: {day.id: [False] * day.duration for day in DAYS}
        for resource in resources
    }
    events = {day.id: [] for day in DAYS}
    availability_end = scenario["availability_end"]

    for day in DAYS:
        for resource in resources:
            end = availability_end[resource][day.id]
            if not end:
                continue
            _set_window(
                availability[resource][day.id],
                day,
                day.start_minute,
                end,
                available=True,
            )
        for start, end in day.parent_unavailable:
            _set_window(
                availability[PARENT][day.id],
                day,
                start,
                end,
                available=False,
            )

    def block(
        day_id: str,
        start: int,
        end: int,
        affected: Iterable[str],
        *,
        event_id: str,
        title: str,
        detail: str,
        kind: str,
    ) -> None:
        day = next(item for item in DAYS if item.id == day_id)
        affected_ids = list(affected)
        for resource in affected_ids:
            _set_window(
                availability[resource][day_id],
                day,
                start,
                end,
                available=False,
            )
        events[day_id].append(
            {
                "id": event_id,
                "title": title,
                "detail": detail,
                "kind": kind,
                "start": _fmt_time(start),
                "end": _fmt_time(end),
                "affected": affected_ids,
            }
        )

    if scenario["coop_monday"]:
        block(
            "mon",
            8 * 60 + 30,
            15 * 60 + 15,
            resources,
            event_id="coop_monday",
            title="CC / co-op day",
            detail="Includes travel and transition time; Tessa can resume independent work at 3:15 PM.",
            kind="commitment",
        )

    disruptions = set(scenario["disruptions"])
    if "sick_monday" in disruptions:
        block(
            "mon",
            9 * 60,
            16 * 60,
            resources,
            event_id="sick_monday",
            title="Family sick day",
            detail="No school capacity is assumed for the household.",
            kind="disruption",
        )
    if "grandma_wednesday" in disruptions:
        block(
            "wed",
            11 * 60 + 30,
            16 * 60,
            resources,
            event_id="grandma_wednesday",
            title="Grandma arrives",
            detail="The school day ends at 11:30 AM so the family can be present.",
            kind="disruption",
        )
    if "parent_appointment_tuesday" in disruptions:
        block(
            "tue",
            10 * 60,
            11 * 60 + 30,
            (PARENT,),
            event_id="parent_appointment_tuesday",
            title="Parent appointment",
            detail="Students may continue independent work while parent-led phases pause.",
            kind="disruption",
        )
    if "missed_nap_wednesday" in disruptions:
        block(
            "wed",
            9 * 60 + 30,
            10 * 60 + 30,
            (PARENT,),
            event_id="missed_nap_wednesday",
            title="Nap window lost",
            detail="The preferred one-on-one hour is unavailable to the parent.",
            kind="disruption",
        )
    if "friday_off" in disruptions:
        block(
            "fri",
            9 * 60,
            16 * 60,
            resources,
            event_id="friday_off",
            title="Friday off",
            detail="No catch-up work is placed on Friday.",
            kind="disruption",
        )
    if "lost_tuesday" in disruptions:
        block(
            "tue",
            9 * 60,
            16 * 60,
            resources,
            event_id="lost_tuesday",
            title="Tuesday lost",
            detail="The full school day is unavailable after an unexpected interruption.",
            kind="disruption",
        )

    return availability, events


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


def _capacity_metrics(
    tasks: tuple[Task, ...],
    availability: dict[str, dict[str, list[bool]]],
) -> dict[str, object]:
    due_day = max((task.due_day for task in tasks), default=2)
    due_days = DAYS[: due_day + 1]

    parent_capacity = sum(
        sum(availability[PARENT][day.id]) for day in due_days
    )
    student_capacity = {
        student_id: sum(
            sum(availability[student_id][day.id]) for day in due_days
        )
        for student_id in STUDENTS
    }

    parent_demand = sum(task.parent_minutes for task in tasks)
    student_demand = {
        student_id: sum(
            task.total_minutes for task in tasks if student_id in task.student_ids
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
    metrics: dict[str, object],
    late_entries: list[dict[str, object]],
    unscheduled: list[Task],
    scenario: dict[str, object],
) -> list[dict[str, object]]:
    shortfall = int(metrics["parent_shortfall"])
    if not shortfall and not late_entries and not unscheduled:
        return []

    late_names = [str(entry["title"]) for entry in late_entries]
    recommendations: list[dict[str, object]] = []
    if late_entries:
        recommendations.append(
            {
                "kind": "accept",
                "title": "Keep the conflict-free recovery plan",
                "body": (
                    f"Let {len(late_names)} assignment"
                    f"{'s' if len(late_names) != 1 else ''} move later this week: "
                    f"{', '.join(late_names)}. The displayed plan remains free of "
                    "student and parent conflicts."
                ),
                "task_ids": [str(entry["task_id"]) for entry in late_entries],
            }
        )

        moved_parent_minutes = sum(
            int(entry["parent_minutes"]) for entry in late_entries
        )
        recommendations.append(
            {
                "kind": "extend",
                "title": f"Restore at least {moved_parent_minutes} parent minutes",
                "body": (
                    f"The recovery plan moved {moved_parent_minutes} minutes of "
                    "parent-led work beyond the deadline after accounting for phase "
                    "sequencing. Add a usable teaching window, then re-run WeekFlow "
                    "before promising the original due date."
                ),
                "minutes_added": moved_parent_minutes,
                "task_ids": [],
            }
        )

    if unscheduled:
        if scenario["allow_next_week"]:
            title = "Roll unscheduled work into next week"
            body = (
                "No conflict-free slot remains for: "
                f"{', '.join(task.title for task in unscheduled)}. Preserve the "
                "work as an explicit rollover instead of silently dropping it."
            )
            kind = "rollover"
        else:
            title = "Add capacity or remove optional work"
            body = (
                "Rollover is disabled, and no conflict-free slot remains for: "
                f"{', '.join(task.title for task in unscheduled)}. Restore availability "
                "or explicitly remove work before accepting this plan."
            )
            kind = "capacity"
        recommendations.append(
            {
                "kind": kind,
                "title": title,
                "body": body,
                "task_ids": [task.id for task in unscheduled],
            }
        )

    return recommendations


def generate_demo_schedule(
    missed_tuesday: bool = False,
    scenario: dict[str, object] | None = None,
) -> dict[str, object]:
    """Generate the deterministic WeekFlow demo schedule."""

    normalized = normalize_scenario(scenario, missed_tuesday=missed_tuesday)
    availability, events = _build_availability(normalized)
    completed_ids = set(normalized["completed_task_ids"])
    credit_subjects = set(normalized["coop_credit_subjects"])
    credited_ids = {
        task.id
        for task in TASKS
        if normalized["coop_monday"] and task.subject in credit_subjects
    } - completed_ids
    satisfied_ids = completed_ids | credited_ids
    active_tasks = tuple(task for task in TASKS if task.id not in satisfied_ids)
    if normalized["deadline_policy"] == "essentials":
        active_tasks = tuple(
            replace(task, due_day=4) if task.priority < 4 else task
            for task in active_tasks
        )
    elif normalized["deadline_policy"] == "balanced":
        active_tasks = tuple(replace(task, due_day=4) for task in active_tasks)

    day_states: list[dict[str, object]] = []
    for day in DAYS:
        parent_available = availability[PARENT][day.id].copy()
        student_available = {
            student_id: availability[student_id][day.id].copy()
            for student_id in STUDENTS
        }
        missed = not any(parent_available) and not any(
            any(bits) for bits in student_available.values()
        )
        day_states.append(
            {
                "day": day,
                "missed": missed,
                "parent_available": parent_available,
                "parent_busy": [False] * day.duration,
                "student_busy": {
                    student_id: [not available for available in bits]
                    for student_id, bits in student_available.items()
                },
            }
        )

    entries: list[dict[str, object]] = []
    unscheduled: list[Task] = []

    for task in sorted(active_tasks, key=_task_order):
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
                    if phase.resource == PARENT and (
                        not all(state["parent_available"][left:right])
                        or not _is_free(
                            state["parent_busy"], left, right
                        )
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
    metrics = _capacity_metrics(active_tasks, availability)
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
                "title": (
                    f"{len(late_entries)} assignment"
                    f"{'s' if len(late_entries) != 1 else ''} moved past "
                    "their protected deadlines"
                ),
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
                "missed": bool(day_states[day_index]["missed"]),
                "events": events[day.id],
                "availability": {
                    "parent_minutes": sum(availability[PARENT][day.id]),
                    "students": {
                        student_id: sum(availability[student_id][day.id])
                        for student_id in STUDENTS
                    },
                },
                "entries": [entry for entry in entries if entry["day_index"] == day_index],
            }
        )

    completed_rows = [
        {
            "task_id": task.id,
            "title": task.title,
            "subject": task.subject,
            "student_names": [STUDENTS[item]["name"] for item in task.student_ids],
            "kind": "ahead" if task.id in completed_ids else "coop_credit",
            "detail": (
                "Already completed before this planning run."
                if task.id in completed_ids
                else "Satisfied by Monday's CC / co-op work."
            ),
        }
        for task in TASKS
        if task.id in satisfied_ids
    ]
    has_completed_work = bool(
        normalized["completed_task_ids"] or normalized["coop_credit_subjects"]
    )
    mode = (
        "disrupted"
        if normalized["disruptions"]
        else "adjusted" if has_completed_work else "baseline"
    )
    return {
        "mode": mode,
        "scenario": normalized,
        "days": day_rows,
        "metrics": metrics,
        "warnings": warnings,
        "recommendations": _build_recommendations(
            metrics, late_entries, unscheduled, normalized
        ),
        "explanations": _build_explanations(entries),
        "scheduled_count": len(entries),
        "unscheduled_count": len(unscheduled),
        "completed_count": len(completed_rows),
        "total_count": len(TASKS),
        "completed": completed_rows,
    }


def demo_payload() -> dict[str, object]:
    """Return human-readable constraints and assignments for the lab UI."""

    return {
        "default_scenario": default_scenario(),
        "availability_people": [
            {"id": PARENT, "name": "Parent"},
            *[
                {"id": student_id, "name": student["name"]}
                for student_id, student in STUDENTS.items()
            ],
        ],
        "availability_end_options": [
            {"value": 0, "label": "Off"},
            {"value": 12 * 60, "label": "12:00 PM"},
            {"value": MORNING_END, "label": "12:30 PM"},
            {"value": 14 * 60, "label": "2:00 PM"},
            {"value": EXTENDED_END, "label": "4:00 PM"},
        ],
        "coop_credit_subjects": sorted(COOP_CREDIT_SUBJECTS),
        "disruptions": [
            {
                "id": "sick_monday",
                "title": "Monday sick day",
                "detail": "Remove school capacity for the entire household.",
            },
            {
                "id": "grandma_wednesday",
                "title": "Grandma comes Wednesday",
                "detail": "End the family school day at 11:30 AM.",
            },
            {
                "id": "parent_appointment_tuesday",
                "title": "Parent appointment",
                "detail": "Pause parent-led work Tuesday from 10:00–11:30 AM.",
            },
            {
                "id": "missed_nap_wednesday",
                "title": "Nap window disappears",
                "detail": "Remove Wednesday's preferred one-on-one hour.",
            },
            {
                "id": "friday_off",
                "title": "Take Friday off",
                "detail": "Protect Friday from scheduled and catch-up work.",
            },
        ],
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
