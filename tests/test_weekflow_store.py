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
    load_logistics_state,
    load_saved_week,
    normalize_beta_state,
    record_beta_feedback,
    save_beta_state,
    save_logistics_state,
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


class _FakeDatabase:
    def __init__(self):
        self.documents = {}

    def __bool__(self):
        return True

    def collection(self, _name):
        return _FakeCollection(self.documents)

    def transaction(self):
        return _FakeTransaction()


def test_default_beta_state_is_valid_and_normalized():
    state = normalize_beta_state(default_beta_state())

    assert state["revision"] == 0
    assert state["approved"] is False
    assert state["family"]["timezone"] == "America/New_York"
    assert state["scenario"]["events"][0]["day_id"] == "thu"


@pytest.mark.parametrize(
    "change, error",
    [
        (("revision", -1), "revision"),
        (("approved", "yes"), "approved"),
        (("family.timezone", "Mars/Olympus"), "timezone"),
        (("family.name", ""), "family.name"),
        (("family.parent_label", ""), "parent_label"),
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

    delete_beta_state("parent@example.com")
    assert database.documents == {}


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
