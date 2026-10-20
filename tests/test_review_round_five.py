import csv
from datetime import date, timedelta
from io import StringIO
from types import SimpleNamespace
from unittest import mock

import pytest

import app
from faithsparks.services import account_operations as operations, weekflow_calendar as calendar, weekflow_store as store
from faithsparks.views import weekflow
from fake_firestore import FakeFirestore
from test_weekflow_store import _FakeDatabase


@pytest.mark.parametrize("value", ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "  =1+1", "\t=1+1", "\ufeff =1+1"])
def test_csv_formula_metadata_is_exported_as_text(value):
    # Include real control characters, rather than just the printable escape.
    value = value.replace("\\t", "\t").replace("\\ufeff", "\ufeff")
    with app.app.test_request_context("/worship/licensing.csv"), mock.patch.object(
        app, "google", SimpleNamespace(authorized=True)
    ), mock.patch.object(app, "_worship_licensing_rows", return_value=[{"title": value}]):
        response = app.worship_licensing_csv()
    rows = list(csv.DictReader(StringIO(response.get_data(as_text=True))))
    assert rows[0]["title"] == "'" + value


def test_csv_preserves_normal_metadata_and_numeric_counts():
    assert app._spreadsheet_safe_cell("Amazing Grace") == "Amazing Grace"
    assert app._spreadsheet_safe_cell(3) == 3


def test_calendar_timeout_is_finite_and_failures_are_translated():
    calls = []
    def get(path, **kwargs):
        calls.append(kwargs)
        raise TimeoutError("provider stalled")
    with pytest.raises(calendar.WeekFlowCalendarProviderError, match="Calendar unavailable"):
        calendar._provider_request(SimpleNamespace(get=get), "get", "/calendar", "Calendar unavailable")
    assert calls[0]["timeout"] == (3.05, 10.0)


def test_backup_restore_rejects_other_device_edit(monkeypatch):
    db = _FakeDatabase()
    monkeypatch.setattr(store, "db", db)
    monkeypatch.setattr(store.firestore, "transactional", lambda fn: fn)
    state = store.default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    current = store.save_beta_state("parent@example.com", state)
    backup = store.export_weekflow_backup("parent@example.com")
    original_transaction = db.transaction

    def concurrent_edit():
        db.transaction = original_transaction
        other = {**current, "family": {**current["family"], "name": "Other device edit"}}
        store.save_beta_state("parent@example.com", other)
        return original_transaction()

    db.transaction = concurrent_edit
    with pytest.raises(store.WeekFlowRevisionConflict, match="Another device"):
        store.restore_weekflow_backup("parent@example.com", backup)
    after = store.load_beta_state("parent@example.com")
    assert after["family"]["name"] == "Other device edit"
    assert after["revision"] == 2


def test_rollover_retains_only_the_tier_history_limit(monkeypatch):
    db = _FakeDatabase()
    monkeypatch.setattr(store, "db", db)
    monkeypatch.setattr(store.firestore, "transactional", lambda fn: fn)
    monkeypatch.setattr(weekflow, "_signed_in_email", lambda: "parent@example.com")
    monkeypatch.setattr(weekflow, "_has_beta_access", lambda email: True)
    monkeypatch.setattr(weekflow, "_limit_error", lambda *args: None)
    monkeypatch.setattr(weekflow, "_weekflow_limits", lambda email: {"saved_weeks": 4})
    state = store.default_beta_state()
    state["scenario"]["week_start"] = "2026-08-31"
    current = store.save_beta_state("parent@example.com", state)
    for _ in range(6):
        monday = date.fromisoformat(current["scenario"]["week_start"]) + timedelta(days=7)
        with app.app.test_request_context("/labs/weekflow/rollover", method="POST", json={
            "state": current, "mode": "empty", "week_start": monday.isoformat(),
        }):
            current = weekflow.rollover().get_json()
    weeks = [entry for entry in db.documents.values() if entry.get("kind") == "week"]
    assert len(weeks) == 4
    assert min(item["weekStart"] for item in weeks) == "2026-09-21"


def test_crashed_generation_lease_expires_without_releasing_another_operation(monkeypatch):
    db = FakeFirestore()
    now = 1000.0
    monkeypatch.setattr(operations.time, "time", lambda: now)
    token = operations.begin_operation(db, "a@x.com", "generation")
    with pytest.raises(operations.AccountBusyError, match="still being prepared"):
        operations.begin_operation(db, "a@x.com", "deletion")
    now += operations.OPERATION_LEASE_SECONDS + 1
    deletion = operations.begin_operation(db, "a@x.com", "deletion")
    operations.end_operation(db, "a@x.com", token)
    with pytest.raises(operations.AccountBusyError, match="deletion is in progress"):
        operations.begin_operation(db, "a@x.com", "generation")
    operations.end_operation(db, "a@x.com", deletion)
    assert operations.begin_operation(db, "a@x.com", "generation")
