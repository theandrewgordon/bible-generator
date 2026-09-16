import pytest

from faithsparks.services import weekflow_store
from faithsparks.services.weekflow_logistics import default_logistics_scenario
from faithsparks.services.weekflow_store import (
    MAX_STATE_BYTES,
    WeekFlowRevisionConflict,
    create_rollover_state,
    default_beta_state,
    delete_beta_state,
    delete_logistics_state,
    export_weekflow_backup,
    list_saved_weeks,
    list_week_templates,
    load_beta_state,
    load_household_state,
    load_logistics_state,
    load_meals_state,
    load_medical_state,
    load_saved_week,
    load_today_state,
    load_travel_state,
    normalize_beta_state,
    record_beta_feedback,
    restore_weekflow_backup,
    save_beta_state,
    save_household_state,
    save_logistics_state,
    save_meals_state,
    save_medical_state,
    save_today_state,
    save_travel_state,
    save_week_template,
)


class _FakeSnapshot:
    def __init__(self, document_id, reference, data):
        self.id = document_id
        self.reference = reference
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class _FakeReference:
    def __init__(self, documents, document_id):
        self.documents = documents
        self.id = document_id

    def collection(self, _name):
        return _FakeCollection(self.documents)

    def get(self, transaction=None):
        del transaction
        return _FakeSnapshot(self.id, self, self.documents.get(self.id))

    def set(self, data, merge=False):
        del merge
        self.documents[self.id] = data

    def delete(self):
        self.documents.pop(self.id, None)


class _FakeCollection:
    def __init__(self, documents):
        self.documents = documents

    def document(self, document_id):
        return _FakeReference(self.documents, document_id)

    def stream(self):
        return [
            _FakeSnapshot(document_id, self.document(document_id), data)
            for document_id, data in list(self.documents.items())
        ]


class _FakeTransaction:
    def set(self, reference, data):
        reference.set(data)


class _FakeBatch:
    def __init__(self):
        self.operations = []

    def set(self, reference, data):
        self.operations.append(("set", reference, data))

    def delete(self, reference):
        self.operations.append(("delete", reference, None))

    def commit(self):
        for action, reference, data in self.operations:
            reference.set(data) if action == "set" else reference.delete()


class _FakeDatabase:
    def __init__(self):
        self.documents = {}

    def __bool__(self):
        return True

    def collection(self, _name):
        return _FakeCollection(self.documents)

    def transaction(self):
        return _FakeTransaction()

    def batch(self):
        return _FakeBatch()


def test_default_beta_state_is_valid_and_normalized():
    state = normalize_beta_state(default_beta_state())

    assert state["revision"] == 0
    assert state["approved"] is False
    assert state["family"]["timezone"] == "America/New_York"
    assert state["scenario"]["events"][0]["day_id"] == "thu"


def test_personalized_week_can_start_without_demo_assignments():
    state = default_beta_state()
    state["scenario"]["tasks"] = []
    state["scenario"]["completed_task_ids"] = []

    normalized = normalize_beta_state(state)
    plan = weekflow_store.generate_demo_schedule(scenario=normalized["scenario"])

    assert normalized["scenario"]["tasks"] == []
    assert plan["total_count"] == 0
    assert plan["scheduled_count"] == 0
    assert plan["completed_count"] == 0
    assert plan["feasibility"]["deadline_feasible"] is True


@pytest.mark.parametrize(
    "change, error",
    [
        (("revision", -1), "revision"),
        (("approved", "yes"), "approved"),
        (("family.timezone", "Mars/Olympus"), "timezone"),
        (("family.name", ""), "family.name"),
        (("family.parent_label", ""), "parent_label"),
        (("family.primary_adult_id", "missing-adult"), "primary_adult_id"),
        (("family.students.tessa.color", "red"), "colors"),
    ],
)
def test_beta_state_rejects_invalid_account_data(change, error):
    state = default_beta_state()
    path, value = change
    target = state
    parts = path.split(".")
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = value

    with pytest.raises((TypeError, ValueError), match=error):
        normalize_beta_state(state)


def test_beta_state_rejects_oversized_payload():
    state = default_beta_state()
    state["padding"] = "x" * (MAX_STATE_BYTES + 1)

    with pytest.raises(ValueError, match="too large"):
        normalize_beta_state(state)


def test_beta_state_accepts_additional_students_and_teaching_adults():
    state = default_beta_state()
    state["family"]["adults"]["jordan"] = {
        "name": "Jordan",
        "color": "#4776c5",
    }
    state["family"]["students"]["noah"] = {
        "name": "Noah",
        "color": "#2c7a4b",
    }
    for person_id in ("jordan", "noah"):
        state["scenario"]["availability_end"][person_id] = {
            day: 12 * 60 + 30 for day in ("mon", "tue", "wed", "thu", "fri")
        }

    normalized = normalize_beta_state(state)

    assert set(normalized["family"]["adults"]) == {"parent", "jordan"}
    assert set(normalized["family"]["students"]) == {
        "tessa",
        "diana",
        "elsie",
        "noah",
    }
    assert normalized["family"]["primary_adult_id"] == "parent"
    assert {person["id"] for person in normalized["scenario"]["household"]["adults"]} == {
        "parent",
        "jordan",
    }


def test_rollover_creates_next_dated_week_with_only_unfinished_work(monkeypatch):
    state = default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    state["scenario"]["events"].append(
        {
            "id": "visit",
            "title": "Visit",
            "detail": "One week only",
            "day_id": "tue",
            "start_minute": 9 * 60,
            "end_minute": 12 * 60,
            "affected": ["parent", "tessa", "diana", "elsie"],
            "kind": "disruption",
            "recurring": False,
            "credit_subjects": [],
        }
    )
    state["scenario"]["tasks"] = [
        {
            "id": "impossible",
            "title": "Impossible this week",
            "subject": "Stress",
            "student_ids": ["tessa"],
            "phases": [
                {"label": "Part one", "minutes": 211, "resource": "student"},
                {"label": "Part two", "minutes": 210, "resource": "student"},
            ],
            "due_day": 4,
            "priority": 3,
            "preferred_start": None,
        }
    ]
    captured = {}
    monkeypatch.setattr(
        weekflow_store,
        "save_beta_state",
        lambda email, payload: captured.update({"email": email, "state": payload})
        or payload,
    )

    result = create_rollover_state("parent@example.com", state)

    assert result["scenario"]["week_start"] == "2026-09-07"
    assert [task["id"] for task in result["scenario"]["tasks"]] == ["impossible"]
    assert [event["id"] for event in result["scenario"]["events"]] == ["coop"]
    assert result["approved"] is False
    assert captured["email"] == "parent@example.com"


@pytest.mark.parametrize(
    ("mode", "expected_ids"),
    [
        ("unfinished", ["still-open"]),
        ("reuse", ["finished", "still-open"]),
        ("empty", []),
    ],
)
def test_start_week_modes_prepare_the_requested_current_week(monkeypatch, mode, expected_ids):
    state = default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    state["scenario"]["tasks"] = [
        {**state["scenario"]["tasks"][0], "id": "finished"},
        {**state["scenario"]["tasks"][1], "id": "still-open"},
    ]
    state["scenario"]["completed_task_ids"] = ["finished"]
    state["scenario"]["events"].append(
        {**state["scenario"]["events"][0], "id": "one-time", "recurring": False}
    )
    monkeypatch.setattr(weekflow_store, "save_beta_state", lambda email, payload: payload)

    result = create_rollover_state(
        "parent@example.com",
        {
            "state": state,
            "mode": mode,
            "week_start": "2026-09-14",
        },
    )

    assert result["scenario"]["week_start"] == "2026-09-14"
    assert [task["id"] for task in result["scenario"]["tasks"]] == expected_ids
    assert result["scenario"]["completed_task_ids"] == []
    assert all(event["recurring"] for event in result["scenario"]["events"])


def test_start_week_rejects_a_non_monday_or_older_week(monkeypatch):
    state = default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    monkeypatch.setattr(weekflow_store, "save_beta_state", lambda email, payload: payload)

    with pytest.raises(ValueError, match="Monday"):
        create_rollover_state(
            "parent@example.com",
            {"state": state, "mode": "empty", "week_start": "2026-09-15"},
        )
    with pytest.raises(ValueError, match="after"):
        create_rollover_state(
            "parent@example.com",
            {"state": state, "mode": "empty", "week_start": "2026-08-24"},
        )


def test_start_week_can_date_an_older_configured_plan(monkeypatch):
    state = default_beta_state()
    assert state["scenario"]["week_start"] is None
    monkeypatch.setattr(weekflow_store, "save_beta_state", lambda email, payload: payload)

    result = create_rollover_state(
        "parent@example.com",
        {"state": state, "mode": "reuse", "week_start": "2026-09-14"},
    )

    assert result["scenario"]["week_start"] == "2026-09-14"
    assert result["scenario"]["completed_task_ids"] == []


def test_cloud_repository_round_trip_history_templates_backup_and_delete(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(weekflow_store.firestore, "transactional", lambda function: function)
    state = default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"

    saved = save_beta_state("Parent@Example.com", state)

    assert saved["revision"] == 1
    assert load_beta_state("parent@example.com")["revision"] == 1
    assert list_saved_weeks("parent@example.com")[0]["week_start"] == "2026-08-31"
    historical = load_saved_week("parent@example.com", "2026-08-31")
    assert historical["revision"] == 1
    with pytest.raises(WeekFlowRevisionConflict):
        save_beta_state("parent@example.com", state)

    template = save_week_template(
        "parent@example.com",
        {"name": "Normal week", "scenario": saved["scenario"]},
    )
    assert list_week_templates("parent@example.com")[0]["id"] == template["id"]
    backup = export_weekflow_backup("parent@example.com")
    assert backup["weeks"][0]["scenario"]["week_start"] == "2026-08-31"
    assert backup["templates"][0]["name"] == "Normal week"
    assert backup["today"]["items"] == []
    assert backup["household"]["routines"] == []
    assert backup["meals"]["meals"] == []
    assert backup["medical"]["items"] == []
    assert backup["travel"]["plans"] == []
    assert backup["logistics"]["scenario"] is None

    delete_beta_state("parent@example.com")
    assert database.documents == {}
    restored = restore_weekflow_backup("parent@example.com", backup)
    assert restored == {"restored": True, "revision": 1, "weeks": 1, "templates": 1}
    assert load_beta_state("parent@example.com")["family"]["name"] == "Our homeschool"
    assert list_saved_weeks("parent@example.com")[0]["week_start"] == "2026-08-31"
    assert list_week_templates("parent@example.com")[0]["name"] == "Normal week"
    delete_beta_state("parent@example.com")
    assert database.documents == {}


def test_backup_restore_validates_everything_before_changing_cloud_data(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    original = save_beta_state("parent@example.com", default_beta_state())
    backup = export_weekflow_backup("parent@example.com")
    backup["medical"]["items"] = "not a list"
    before = dict(database.documents)

    with pytest.raises(ValueError, match="items must be a list"):
        restore_weekflow_backup("parent@example.com", backup)

    assert database.documents == before
    assert load_beta_state("parent@example.com")["revision"] == original["revision"]


def test_backup_restore_requires_a_complete_export(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    save_beta_state("parent@example.com", default_beta_state())
    backup = export_weekflow_backup("parent@example.com")
    backup.pop("travel")

    with pytest.raises(ValueError, match="backup is missing: travel"):
        restore_weekflow_backup("parent@example.com", backup)


def test_family_member_with_source_responsibilities_cannot_be_removed(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    initial = default_beta_state()
    initial["family"]["students"]["noah"] = {
        "name": "Noah",
        "color": "#2c7a4b",
    }
    initial["scenario"]["availability_end"]["noah"] = {
        day: 12 * 60 + 30 for day in ("mon", "tue", "wed", "thu", "fri")
    }
    save_beta_state("parent@example.com", initial)
    state = load_beta_state("parent@example.com")
    today = load_today_state("parent@example.com", family=state["family"])
    today["items"] = [
        {
            "id": "library-books",
            "title": "Return library books",
            "area": "home",
            "assigned_person_id": "noah",
            "due_date": "2026-09-15",
            "priority": "normal",
            "status": "open",
            "created_at": "2026-09-15T12:00:00+00:00",
            "updated_at": "2026-09-15T12:00:00+00:00",
            "completed_at": None,
        }
    ]
    save_today_state("parent@example.com", today, family=state["family"])
    state["family"]["students"].pop("noah")
    state["scenario"]["availability_end"].pop("noah")
    for event in state["scenario"]["events"]:
        event["affected"] = [person_id for person_id in event["affected"] if person_id != "noah"]

    with pytest.raises(ValueError, match="Reassign this person"):
        save_beta_state("parent@example.com", state)

    assert "noah" in load_beta_state("parent@example.com")["family"]["students"]


def test_logistics_state_round_trip_is_validated_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    scenario = default_logistics_scenario()

    assert load_logistics_state("parent@example.com") == {
        "revision": 0,
        "scenario": None,
        "updated_at": None,
    }
    saved = save_logistics_state(
        "Parent@Example.com", {"revision": 0, "scenario": scenario}
    )

    assert saved["revision"] == 1
    assert load_logistics_state("parent@example.com")["scenario"]["day_label"] == (
        "Tuesday"
    )
    with pytest.raises(WeekFlowRevisionConflict):
        save_logistics_state(
            "parent@example.com", {"revision": 0, "scenario": scenario}
        )

    delete_logistics_state("parent@example.com")
    assert load_logistics_state("parent@example.com")["scenario"] is None


def test_today_state_round_trip_is_lightweight_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    family = default_beta_state()["family"]
    payload = {
        "revision": 0,
        "items": [
            {
                "id": "library-books",
                "title": "Return library books",
                "area": "homeschool",
                "assigned_person_id": "parent",
                "due_date": "2026-09-14",
                "priority": "high",
                "status": "open",
                "created_at": "2026-09-14T12:00:00+00:00",
                "updated_at": "2026-09-14T12:00:00+00:00",
                "completed_at": None,
            }
        ],
    }

    assert load_today_state("parent@example.com", family=family)["revision"] == 0
    saved = save_today_state("Parent@Example.com", payload, family=family)

    assert saved["revision"] == 1
    assert load_today_state("parent@example.com", family=family)["items"][0][
        "title"
    ] == "Return library books"
    with pytest.raises(WeekFlowRevisionConflict):
        save_today_state("parent@example.com", payload, family=family)


def test_household_state_round_trip_is_validated_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    family = default_beta_state()["family"]
    timestamp = "2026-09-14T12:00:00+00:00"
    payload = {
        "revision": 0,
        "routines": [
            {
                "id": "feed-dog",
                "title": "Feed the dog",
                "assigned_person_id": "diana",
                "days": ["mon", "wed", "fri"],
                "time_of_day": "morning",
                "category": "pets",
                "estimated_minutes": 10,
                "active": True,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        ],
        "completions": {"feed-dog:2026-09-14": timestamp},
    }

    assert load_household_state("parent@example.com", family=family)["revision"] == 0
    saved = save_household_state("Parent@Example.com", payload, family=family)

    assert saved["revision"] == 1
    loaded = load_household_state("parent@example.com", family=family)
    assert loaded["routines"][0]["title"] == "Feed the dog"
    assert loaded["completions"]["feed-dog:2026-09-14"] == timestamp
    with pytest.raises(WeekFlowRevisionConflict):
        save_household_state("parent@example.com", payload, family=family)


def test_meals_state_round_trip_is_validated_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    family = default_beta_state()["family"]
    timestamp = "2026-09-14T12:00:00+00:00"
    payload = {
        "revision": 0,
        "meals": [{"id": "tacos", "date": "2026-09-15", "slot": "dinner", "title": "Tacos", "lead_person_id": "parent", "note": None, "created_at": timestamp, "updated_at": timestamp}],
        "handoffs": [{"id": "shop-tacos", "title": "Buy taco ingredients", "kind": "shopping", "due_date": "2026-09-14", "time_of_day": "afternoon", "assigned_person_id": "diana", "meal_id": "tacos", "status": "open", "created_at": timestamp, "updated_at": timestamp, "completed_at": None}],
    }

    assert load_meals_state("parent@example.com", family=family)["revision"] == 0
    saved = save_meals_state("Parent@Example.com", payload, family=family)

    assert saved["revision"] == 1
    loaded = load_meals_state("parent@example.com", family=family)
    assert loaded["meals"][0]["title"] == "Tacos"
    assert loaded["handoffs"][0]["meal_id"] == "tacos"
    with pytest.raises(WeekFlowRevisionConflict):
        save_meals_state("parent@example.com", payload, family=family)


def test_travel_state_round_trip_is_validated_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(
        weekflow_store.firestore, "transactional", lambda function: function
    )
    family = default_beta_state()["family"]
    timestamp = "2026-09-15T12:00:00+00:00"
    payload = {
        "revision": 0,
        "plans": [{"id": "visit", "kind": "guests", "title": "The Martins visit", "start_date": "2026-10-01", "end_date": "2026-10-03", "location": None, "lead_person_id": "parent", "note": None, "created_at": timestamp, "updated_at": timestamp}],
        "handoffs": [{"id": "guest-room", "title": "Prepare guest room", "kind": "hosting", "due_date": "2026-09-30", "time_of_day": "afternoon", "assigned_person_id": "diana", "plan_id": "visit", "status": "open", "created_at": timestamp, "updated_at": timestamp, "completed_at": None}],
    }

    assert load_travel_state("parent@example.com", family=family)["revision"] == 0
    saved = save_travel_state("Parent@Example.com", payload, family=family)

    assert saved["revision"] == 1
    assert load_travel_state("parent@example.com", family=family)["plans"][0][
        "title"
    ] == "The Martins visit"
    with pytest.raises(WeekFlowRevisionConflict):
        save_travel_state("parent@example.com", payload, family=family)


def test_medical_state_round_trip_is_validated_and_revision_protected(monkeypatch):
    database = _FakeDatabase()
    monkeypatch.setattr(weekflow_store, "db", database)
    monkeypatch.setattr(weekflow_store.firestore, "transactional", lambda function: function)
    family = default_beta_state()["family"]
    timestamp = "2026-09-15T12:00:00+00:00"
    payload = {"revision": 0, "items": [{"id": "dentist", "title": "Dentist appointment", "kind": "appointment", "for_person_id": "diana", "assigned_person_id": "parent", "date": "2026-10-01", "time": "10:30", "provider": None, "location": None, "note": None, "status": "open", "created_at": timestamp, "updated_at": timestamp, "completed_at": None}]}
    assert load_medical_state("parent@example.com", family=family)["revision"] == 0
    saved = save_medical_state("Parent@Example.com", payload, family=family)
    assert saved["revision"] == 1
    assert load_medical_state("parent@example.com", family=family)["items"][0]["title"] == "Dentist appointment"
    with pytest.raises(WeekFlowRevisionConflict):
        save_medical_state("parent@example.com", payload, family=family)


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"realistic": "maybe", "comment": "", "contact": False},
        {"realistic": "yes", "comment": "x" * 1001, "contact": False},
        {"realistic": "no", "comment": "", "contact": "yes"},
    ],
)
def test_feedback_rejects_invalid_or_excessive_data(payload):
    with pytest.raises((TypeError, ValueError)):
        record_beta_feedback(None, payload)
