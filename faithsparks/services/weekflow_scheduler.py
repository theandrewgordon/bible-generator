"""Deterministic, inspectable household scheduler for WeekFlow.

Assignments are made of contiguous phases. Only assisted phases reserve their
selected teaching adult, so independent work releases that adult to help
another child before returning for review.
"""

from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import date, timedelta

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
            phase.minutes for phase in self.phases if phase.resource != STUDENT
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

ADULTS = {
    PARENT: {"name": "Parent", "color": "#d49a3a"},
}

MAX_STUDENTS = 8
MAX_ADULTS = 3


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
EVENT_KINDS = {"commitment", "disruption"}
MAX_WEEK_EVENTS = 40
MAX_WEEK_TASKS = 100


EVENT_PRESETS = (
    {
        "id": "coop",
        "title": "CC / co-op day",
        "detail": "Includes travel and transition time.",
        "day_id": "thu",
        "start_minute": 8 * 60 + 30,
        "end_minute": 15 * 60 + 15,
        "affected": [PARENT, *STUDENTS],
        "kind": "commitment",
        "recurring": True,
        "credit_subjects": [],
    },
    {
        "id": "grandma",
        "title": "Grandma comes",
        "detail": "Protect family time after Grandma arrives.",
        "day_id": "wed",
        "start_minute": 11 * 60 + 30,
        "end_minute": 16 * 60,
        "affected": [PARENT, *STUDENTS],
        "kind": "disruption",
        "recurring": False,
        "credit_subjects": [],
    },
    {
        "id": "parent-appointment",
        "title": "Parent appointment",
        "detail": "Students may continue independent work while parent-led phases pause.",
        "day_id": "tue",
        "start_minute": 10 * 60,
        "end_minute": 11 * 60 + 30,
        "affected": [PARENT],
        "kind": "disruption",
        "recurring": False,
        "credit_subjects": [],
    },
    {
        "id": "sick-day",
        "title": "Family sick day",
        "detail": "No school capacity is assumed for the household.",
        "day_id": "mon",
        "start_minute": 9 * 60,
        "end_minute": 16 * 60,
        "affected": [PARENT, *STUDENTS],
        "kind": "disruption",
        "recurring": False,
        "credit_subjects": [],
    },
    {
        "id": "day-off",
        "title": "Day off",
        "detail": "Protect the day from scheduled and catch-up work.",
        "day_id": "fri",
        "start_minute": 9 * 60,
        "end_minute": 16 * 60,
        "affected": [PARENT, *STUDENTS],
        "kind": "disruption",
        "recurring": False,
        "credit_subjects": [],
    },
)


def _default_household() -> dict[str, list[dict[str, str]]]:
    return {
        "adults": [{"id": adult_id, **adult} for adult_id, adult in ADULTS.items()],
        "students": [
            {"id": student_id, **student} for student_id, student in STUDENTS.items()
        ],
    }


def _normalize_people(
    raw_people: object,
    *,
    kind: str,
    maximum: int,
) -> list[dict[str, str]]:
    if not isinstance(raw_people, list) or not 1 <= len(raw_people) <= maximum:
        raise ValueError(f"household.{kind} must contain between 1 and {maximum} people")
    normalized: list[dict[str, str]] = []
    identifiers: set[str] = set()
    for raw_person in raw_people:
        if not isinstance(raw_person, dict):
            raise TypeError(f"each household {kind[:-1]} must be a JSON object")
        person_id = raw_person.get("id")
        name = raw_person.get("name")
        color = raw_person.get("color", "#315f53")
        if (
            not isinstance(person_id, str)
            or not person_id
            or len(person_id) > 60
            or person_id in identifiers
            or not all(character.isalnum() or character in "-_" for character in person_id)
        ):
            raise ValueError(f"household.{kind} ids must be unique safe identifiers")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
            raise ValueError(f"household.{kind} names must be between 1 and 60 characters")
        if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
            raise ValueError(f"household.{kind} colors must use six-digit hex values")
        try:
            int(color[1:], 16)
        except ValueError as exc:
            raise ValueError(
                f"household.{kind} colors must use six-digit hex values"
            ) from exc
        identifiers.add(person_id)
        normalized.append(
            {"id": person_id, "name": name.strip(), "color": color.lower()}
        )
    return normalized


def _normalize_household(raw_household: object) -> dict[str, list[dict[str, str]]]:
    if raw_household is None:
        return _default_household()
    if not isinstance(raw_household, dict):
        raise TypeError("household must be a JSON object")
    adults = _normalize_people(
        raw_household.get("adults"), kind="adults", maximum=MAX_ADULTS
    )
    students = _normalize_people(
        raw_household.get("students"), kind="students", maximum=MAX_STUDENTS
    )
    all_ids = [person["id"] for person in [*adults, *students]]
    if len(all_ids) != len(set(all_ids)):
        raise ValueError("household adult and student ids must not overlap")
    return {"adults": adults, "students": students}


def _event_preset(event_id: str) -> dict[str, object]:
    return deepcopy(next(event for event in EVENT_PRESETS if event["id"] == event_id))


def _task_payload(task: Task) -> dict[str, object]:
    return {
        "id": task.id,
        "title": task.title,
        "subject": task.subject,
        "student_ids": list(task.student_ids),
        "phases": [
            {
                "label": phase.label,
                "minutes": phase.minutes,
                "resource": phase.resource,
            }
            for phase in task.phases
        ],
        "due_day": task.due_day,
        "priority": task.priority,
        "preferred_start": list(task.preferred_start) if task.preferred_start else None,
    }


def _normalize_tasks(
    raw_tasks: object,
    *,
    student_ids: set[str] | None = None,
    adult_ids: set[str] | None = None,
) -> tuple[Task, ...]:
    valid_students = student_ids or set(STUDENTS)
    valid_adults = adult_ids or set(ADULTS)
    if not isinstance(raw_tasks, list) or not 1 <= len(raw_tasks) <= MAX_WEEK_TASKS:
        raise ValueError(f"tasks must contain between 1 and {MAX_WEEK_TASKS} assignments")
    task_ids: set[str] = set()
    tasks: list[Task] = []
    for index, raw_task in enumerate(raw_tasks):
        if not isinstance(raw_task, dict):
            raise TypeError("each task must be a JSON object")
        task_id = str(raw_task.get("id") or f"task-{index + 1}").strip()
        title = raw_task.get("title")
        subject = raw_task.get("subject")
        student_ids = raw_task.get("student_ids")
        raw_phases = raw_task.get("phases")
        due_day = raw_task.get("due_day", 2)
        priority = raw_task.get("priority", 3)
        preferred_start = raw_task.get("preferred_start")
        if (
            not task_id
            or len(task_id) > 80
            or task_id in task_ids
            or not all(character.isalnum() or character in "-_" for character in task_id)
        ):
            raise ValueError(
                "task ids must be unique letters, numbers, dashes, or underscores"
            )
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
            raise ValueError("task titles must be between 1 and 120 characters")
        if not isinstance(subject, str) or not subject.strip() or len(subject.strip()) > 60:
            raise ValueError("task subjects must be between 1 and 60 characters")
        if (
            not isinstance(student_ids, list)
            or not student_ids
            or not all(
                isinstance(student_id, str) and student_id in valid_students
                for student_id in student_ids
            )
        ):
            raise ValueError("task student_ids must contain known students")
        if not isinstance(raw_phases, list) or not 1 <= len(raw_phases) <= 8:
            raise ValueError("each task must contain between 1 and 8 phases")
        phases: list[Phase] = []
        for raw_phase in raw_phases:
            if not isinstance(raw_phase, dict):
                raise TypeError("each task phase must be a JSON object")
            label = raw_phase.get("label")
            minutes = raw_phase.get("minutes")
            resource = raw_phase.get("resource")
            if not isinstance(label, str) or not label.strip() or len(label.strip()) > 80:
                raise ValueError("phase labels must be between 1 and 80 characters")
            if (
                not isinstance(minutes, int)
                or isinstance(minutes, bool)
                or not 1 <= minutes <= 240
            ):
                raise ValueError("phase minutes must be between 1 and 240")
            if resource not in {*valid_adults, STUDENT}:
                raise ValueError("phase resource must be a known adult or student")
            phases.append(Phase(label.strip(), minutes, resource))
        if not isinstance(due_day, int) or isinstance(due_day, bool) or not 0 <= due_day < len(DAYS):
            raise ValueError("task due_day must identify Monday through Friday")
        if not isinstance(priority, int) or isinstance(priority, bool) or not 0 <= priority <= 5:
            raise ValueError("task priority must be between 0 and 5")
        if preferred_start is not None:
            if (
                not isinstance(preferred_start, (list, tuple))
                or len(preferred_start) != 2
                or not all(
                    isinstance(minute, int)
                    and not isinstance(minute, bool)
                    and 0 <= minute <= 24 * 60
                    for minute in preferred_start
                )
                or preferred_start[0] >= preferred_start[1]
            ):
                raise ValueError("task preferred_start must be an increasing time window")
            preferred_start = tuple(preferred_start)
        task_ids.add(task_id)
        tasks.append(
            Task(
                task_id,
                title.strip(),
                subject.strip(),
                tuple(dict.fromkeys(student_ids)),
                tuple(phases),
                due_day,
                priority,
                preferred_start,
            )
        )
    return tuple(tasks)


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
        "schema_version": 2,
        "household": _default_household(),
        "week_start": None,
        "events": [_event_preset("coop")],
        "tasks": [_task_payload(task) for task in TASKS],
        # Retained for clients created before the editable event model.
        "coop_monday": False,
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
    normalized = deepcopy(default_scenario())
    if scenario:
        normalized.update(scenario)

    household = _normalize_household(normalized.get("household"))
    normalized["household"] = household
    adult_id_list = [person["id"] for person in household["adults"]]
    student_id_list = [person["id"] for person in household["students"]]
    adult_ids = set(adult_id_list)
    student_ids = set(student_id_list)
    first_adult_id = household["adults"][0]["id"]
    extended_student_id = (
        "tessa" if "tessa" in student_ids else household["students"][0]["id"]
    )

    for field in ("coop_monday", "allow_next_week"):
        if not isinstance(normalized.get(field), bool):
            raise TypeError(f"{field} must be a boolean")

    week_start = normalized.get("week_start")
    if week_start is not None:
        if not isinstance(week_start, str):
            raise TypeError("week_start must be an ISO date")
        try:
            week_start_date = date.fromisoformat(week_start)
        except ValueError as exc:
            raise ValueError("week_start must be an ISO date") from exc
        if week_start_date.weekday() != 0:
            raise ValueError("week_start must be a Monday")
        normalized["week_start"] = week_start_date.isoformat()

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
        availability_end = {
            person_id: {day.id: MORNING_END for day in DAYS}
            for person_id in adult_ids | student_ids
        }
        availability_end[extended_student_id] = {
            day.id: EXTENDED_END if day.id in extended_days else MORNING_END
            for day in DAYS
        }
    else:
        availability_end = normalized.get("availability_end")
    resources = adult_ids | student_ids
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
        if normalized["availability_end"][extended_student_id][day.id] > MORNING_END
    ]

    disruptions = normalized.get("disruptions", [])
    if "events" in supplied:
        disruptions = []
    else:
        if not isinstance(disruptions, list) or not all(
            isinstance(item, str) and item in KNOWN_DISRUPTIONS
            for item in disruptions
        ):
            raise ValueError("disruptions contains an unknown event")
        disruptions = list(dict.fromkeys(disruptions))
        if missed_tuesday and "lost_tuesday" not in disruptions:
            disruptions.append("lost_tuesday")
    normalized["disruptions"] = disruptions

    tasks = _normalize_tasks(
        normalized.get("tasks"),
        student_ids=student_ids,
        adult_ids=adult_ids,
    )
    normalized["tasks"] = [_task_payload(task) for task in tasks]

    completed = normalized.get("completed_task_ids", [])
    task_ids = {task.id for task in tasks}
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

    if "events" in supplied:
        raw_events = deepcopy(normalized.get("events"))
    else:
        raw_events = deepcopy(default_scenario()["events"])
        for event in raw_events:
            event["affected"] = [*adult_id_list, *student_id_list]
        if "coop_monday" in supplied:
            raw_events = [event for event in raw_events if event["id"] != "coop"]
            if normalized["coop_monday"]:
                coop = _event_preset("coop")
                coop["day_id"] = "mon"
                coop["affected"] = [*adult_id_list, *student_id_list]
                coop["credit_subjects"] = normalized["coop_credit_subjects"]
                raw_events.append(coop)

        legacy_events = {
            "sick_monday": ("sick-day", "mon"),
            "grandma_wednesday": ("grandma", "wed"),
            "parent_appointment_tuesday": ("parent-appointment", "tue"),
            "friday_off": ("day-off", "fri"),
            "lost_tuesday": ("day-off", "tue"),
        }
        for legacy_id in disruptions:
            if legacy_id == "missed_nap_wednesday":
                raw_events.append(
                    {
                        **_event_preset("parent-appointment"),
                        "id": legacy_id,
                        "title": "Nap window lost",
                        "detail": "The preferred one-on-one hour is unavailable to the parent.",
                        "day_id": "wed",
                        "start_minute": 9 * 60 + 30,
                        "end_minute": 10 * 60 + 30,
                    }
                )
                continue
            preset_id, day_id = legacy_events[legacy_id]
            event = _event_preset(preset_id)
            event.update({"id": legacy_id, "day_id": day_id})
            event["affected"] = (
                [first_adult_id]
                if preset_id == "parent-appointment"
                else [*adult_id_list, *student_id_list]
            )
            if legacy_id == "lost_tuesday":
                event.update(
                    {
                        "title": "Tuesday lost",
                        "detail": "The full school day is unavailable after an unexpected interruption.",
                    }
                )
            raw_events.append(event)

    if not isinstance(raw_events, list) or len(raw_events) > MAX_WEEK_EVENTS:
        raise ValueError(f"events must be a list with at most {MAX_WEEK_EVENTS} items")

    if missed_tuesday and not any(
        isinstance(event, dict) and event.get("id") == "lost_tuesday"
        for event in raw_events
    ):
        lost_tuesday = _event_preset("day-off")
        lost_tuesday.update(
            {
                "id": "lost_tuesday",
                "title": "Tuesday lost",
                "detail": "The full school day is unavailable after an unexpected interruption.",
                "day_id": "tue",
            }
        )
        lost_tuesday["affected"] = [*adult_id_list, *student_id_list]
        raw_events.append(lost_tuesday)

    event_ids: set[str] = set()
    events: list[dict[str, object]] = []
    for index, raw_event in enumerate(raw_events):
        if not isinstance(raw_event, dict):
            raise TypeError("each event must be a JSON object")
        event_id = str(raw_event.get("id") or f"event-{index + 1}").strip()
        title = raw_event.get("title")
        detail = raw_event.get("detail", "")
        day_id = raw_event.get("day_id")
        start_minute = raw_event.get("start_minute")
        end_minute = raw_event.get("end_minute")
        affected = raw_event.get("affected")
        kind = raw_event.get("kind", "disruption")
        recurring = raw_event.get("recurring", False)
        event_credits = raw_event.get("credit_subjects", [])
        if (
            not event_id
            or len(event_id) > 80
            or event_id in event_ids
            or not all(character.isalnum() or character in "-_" for character in event_id)
        ):
            raise ValueError(
                "event ids must be unique letters, numbers, dashes, or underscores"
            )
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
            raise ValueError("event titles must be between 1 and 120 characters")
        if not isinstance(detail, str) or len(detail) > 300:
            raise ValueError("event details must be at most 300 characters")
        if day_id not in day_ids:
            raise ValueError("event day_id must be a valid weekday")
        if (
            not isinstance(start_minute, int)
            or isinstance(start_minute, bool)
            or not isinstance(end_minute, int)
            or isinstance(end_minute, bool)
            or not 0 <= start_minute < end_minute <= 24 * 60
        ):
            raise ValueError("event times must be increasing minutes within one day")
        if (
            not isinstance(affected, list)
            or not affected
            or not all(
                isinstance(item, str) and item in resources for item in affected
            )
        ):
            raise ValueError("event affected must contain known family resources")
        if kind not in EVENT_KINDS:
            raise ValueError("event kind must be commitment or disruption")
        if not isinstance(recurring, bool):
            raise TypeError("event recurring must be a boolean")
        if not isinstance(event_credits, list) or not all(
            isinstance(subject, str) and subject in COOP_CREDIT_SUBJECTS
            for subject in event_credits
        ):
            raise ValueError("event credit_subjects contains an unsupported subject")
        event_ids.add(event_id)
        events.append(
            {
                "id": event_id,
                "title": title.strip(),
                "detail": detail.strip(),
                "day_id": day_id,
                "start_minute": start_minute,
                "end_minute": end_minute,
                "affected": list(dict.fromkeys(affected)),
                "kind": kind,
                "recurring": recurring,
                "credit_subjects": list(dict.fromkeys(event_credits)),
            }
        )

    coop_event = next((event for event in events if event["id"] == "coop"), None)
    if coop_event and normalized["coop_credit_subjects"]:
        coop_event["credit_subjects"] = normalized["coop_credit_subjects"]
    normalized["events"] = events
    normalized["coop_monday"] = bool(coop_event and coop_event["day_id"] == "mon")
    normalized["coop_credit_subjects"] = list(
        dict.fromkeys(
            subject
            for event in events
            for subject in event["credit_subjects"]
        )
    )
    normalized["disruptions"] = [
        event["id"] for event in events if event["kind"] == "disruption"
    ]

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
    household = scenario["household"]
    adult_ids = [person["id"] for person in household["adults"]]
    student_ids = [person["id"] for person in household["students"]]
    resources = [*adult_ids, *student_ids]
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
        for adult_id in adult_ids:
            for start, end in day.parent_unavailable:
                _set_window(
                    availability[adult_id][day.id],
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
                "start_minute": start,
                "end_minute": end,
                "affected": affected_ids,
            }
        )

    for event in scenario["events"]:
        block(
            event["day_id"],
            event["start_minute"],
            event["end_minute"],
            event["affected"],
            event_id=event["id"],
            title=event["title"],
            detail=event["detail"],
            kind=event["kind"],
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
        if phase.resource != STUDENT and day.preferred_parent:
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
    household: dict[str, list[dict[str, str]]],
) -> dict[str, object]:
    due_day = max((task.due_day for task in tasks), default=2)
    due_days = DAYS[: due_day + 1]
    adults = household["adults"]
    students = household["students"]
    adult_capacity = {
        person["id"]: sum(sum(availability[person["id"]][day.id]) for day in due_days)
        for person in adults
    }
    adult_demand = {
        person["id"]: sum(
            phase.minutes
            for task in tasks
            for phase in task.phases
            if phase.resource == person["id"]
        )
        for person in adults
    }
    student_capacity = {
        person["id"]: sum(
            sum(availability[person["id"]][day.id]) for day in due_days
        )
        for person in students
    }

    student_demand = {
        person["id"]: sum(
            task.total_minutes for task in tasks if person["id"] in task.student_ids
        )
        for person in students
    }
    parent_demand = sum(adult_demand.values())
    parent_capacity = sum(adult_capacity.values())
    parent_shortfall = sum(
        max(0, adult_demand[person["id"]] - adult_capacity[person["id"]])
        for person in adults
    )
    return {
        "due_label": DAYS[due_day].label,
        "parent_demand": parent_demand,
        "parent_capacity": parent_capacity,
        "parent_shortfall": parent_shortfall,
        "adults": {
            person["id"]: {
                "name": person["name"],
                "demand": adult_demand[person["id"]],
                "capacity": adult_capacity[person["id"]],
                "shortfall": max(
                    0,
                    adult_demand[person["id"]] - adult_capacity[person["id"]],
                ),
            }
            for person in adults
        },
        "students": {
            person["id"]: {
                "name": person["name"],
                "demand": student_demand[person["id"]],
                "capacity": student_capacity[person["id"]],
                "shortfall": max(
                    0,
                    student_demand[person["id"]]
                    - student_capacity[person["id"]],
                ),
            }
            for person in students
        },
    }


def _build_explanations(
    entries: list[dict[str, object]],
    household: dict[str, list[dict[str, str]]],
) -> list[dict[str, str]]:
    explanations: list[dict[str, str]] = []
    parent_phases: list[dict[str, object]] = []
    adult_names = {person["id"]: person["name"] for person in household["adults"]}

    def phase_description(phase: dict[str, object]) -> str:
        if phase["resource"] == STUDENT:
            return "independent"
        return f"with {adult_names.get(str(phase['resource']), 'adult')}"

    for entry in entries:
        for phase in entry["phases"]:
            if phase["resource"] != STUDENT:
                parent_phases.append({**phase, "task_title": entry["title"]})

    for entry in entries:
        phases = entry["phases"]
        student_names = entry["student_names"]
        day_label = entry["day_label"]
        at = entry["start"]

        if len(entry["student_ids"]) > 1:
            body = (
                f"{entry['title']} starts {day_label} at {at} because all assigned "
                "students are free together; one adult-led block satisfies the "
                "instruction requirement for the whole family."
            )
        elif len(phases) > 1 and any(
            phase["resource"] == STUDENT for phase in phases
        ) and any(phase["resource"] != STUDENT for phase in phases):
            phase_text = " → ".join(
                f"{phase['minutes']} min {phase_description(phase)}"
                for phase in phases
            )
            body = (
                f"{student_names[0]}'s {entry['title']} is kept as one learning "
                f"sequence ({phase_text}). The independent phase releases the adult "
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
                    f"{overlaps[0]}, using student capacity while adult attention "
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
                f"double-booking {student_names[0]} or a teaching adult."
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
    household = normalized["household"]
    adults = household["adults"]
    students = household["students"]
    adult_ids = [person["id"] for person in adults]
    student_ids = [person["id"] for person in students]
    student_names = {person["id"]: person["name"] for person in students}
    tasks = _normalize_tasks(
        normalized["tasks"],
        student_ids=set(student_ids),
        adult_ids=set(adult_ids),
    )
    availability, events = _build_availability(normalized)
    completed_ids = set(normalized["completed_task_ids"])
    credit_sources = {
        subject: event["title"]
        for event in normalized["events"]
        for subject in event["credit_subjects"]
    }
    credit_subjects = set(credit_sources)
    credited_ids = {
        task.id
        for task in tasks
        if task.subject in credit_subjects
    } - completed_ids
    satisfied_ids = completed_ids | credited_ids
    active_tasks = tuple(task for task in tasks if task.id not in satisfied_ids)
    if normalized["deadline_policy"] == "essentials":
        active_tasks = tuple(
            replace(task, due_day=4) if task.priority < 4 else task
            for task in active_tasks
        )
    elif normalized["deadline_policy"] == "balanced":
        active_tasks = tuple(replace(task, due_day=4) for task in active_tasks)

    day_states: list[dict[str, object]] = []
    for day in DAYS:
        adult_available = {
            adult_id: availability[adult_id][day.id].copy()
            for adult_id in adult_ids
        }
        student_available = {
            student_id: availability[student_id][day.id].copy()
            for student_id in student_ids
        }
        missed = not any(any(bits) for bits in adult_available.values()) and not any(
            any(bits) for bits in student_available.values()
        )
        day_states.append(
            {
                "day": day,
                "missed": missed,
                "adult_available": adult_available,
                "adult_busy": {
                    adult_id: [False] * day.duration for adult_id in adult_ids
                },
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
                    if phase.resource != STUDENT and (
                        not all(state["adult_available"][phase.resource][left:right])
                        or not _is_free(
                            state["adult_busy"][phase.resource], left, right
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
            if phase.resource != STUDENT:
                _mark(state["adult_busy"][phase.resource], left, right)
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
                "student_names": [student_names[item] for item in task.student_ids],
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
    metrics = _capacity_metrics(active_tasks, availability, household)
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

    week_start_date = (
        date.fromisoformat(normalized["week_start"])
        if normalized.get("week_start")
        else None
    )
    day_rows = []
    for day_index, day in enumerate(DAYS):
        day_rows.append(
            {
                "id": day.id,
                "label": day.label,
                "date": (
                    (week_start_date + timedelta(days=day_index)).isoformat()
                    if week_start_date
                    else None
                ),
                "start": _fmt_time(day.start_minute),
                "end": _fmt_time(day.end_minute),
                "missed": bool(day_states[day_index]["missed"]),
                "events": events[day.id],
                "availability": {
                    "parent_minutes": sum(
                        sum(availability[adult_id][day.id])
                        for adult_id in adult_ids
                    ),
                    "adults": {
                        adult_id: sum(availability[adult_id][day.id])
                        for adult_id in adult_ids
                    },
                    "students": {
                        student_id: sum(availability[student_id][day.id])
                        for student_id in student_ids
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
            "student_ids": list(task.student_ids),
            "student_names": [student_names[item] for item in task.student_ids],
            "kind": "ahead" if task.id in completed_ids else "coop_credit",
            "detail": (
                "Already completed before this planning run."
                if task.id in completed_ids
                else f"Satisfied by {credit_sources[task.subject]}."
            ),
        }
        for task in tasks
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
    unscheduled_rows = [
        {
            "task_id": task.id,
            "title": task.title,
            "subject": task.subject,
            "student_ids": list(task.student_ids),
            "minutes": task.total_minutes,
        }
        for task in unscheduled
    ]
    return {
        "mode": mode,
        "scenario": normalized,
        "days": day_rows,
        "metrics": metrics,
        "warnings": warnings,
        "recommendations": _build_recommendations(
            metrics, late_entries, unscheduled, normalized
        ),
        "explanations": _build_explanations(entries, household),
        "scheduled_count": len(entries),
        "unscheduled_count": len(unscheduled),
        "unscheduled": unscheduled_rows,
        "rollover": unscheduled_rows if normalized["allow_next_week"] else [],
        "completed_count": len(completed_rows),
        "total_count": len(tasks),
        "completed": completed_rows,
    }


def demo_payload() -> dict[str, object]:
    """Return human-readable constraints and assignments for the lab UI."""

    return {
        "default_scenario": default_scenario(),
        "availability_people": [
            *[
                {"id": adult_id, "name": adult["name"]}
                for adult_id, adult in ADULTS.items()
            ],
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
        "event_presets": deepcopy(EVENT_PRESETS),
        "event_time_options": [
            {"value": minute, "label": _fmt_time(minute)}
            for minute in range(8 * 60, 16 * 60 + 1, 30)
        ],
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
        "adults": [
            {"id": adult_id, **adult} for adult_id, adult in ADULTS.items()
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
