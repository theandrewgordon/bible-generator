from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Event, current_thread
from unittest import mock
import json
import zipfile

import pytest
import app
from fake_firestore import FakeFirestore
from faithsparks.services import weekflow_store as store, users
from faithsparks.views import billing
from faithsparks.views.admin import collections as bundles, gifts


def test_subscription_cancellation_cannot_overwrite_concurrent_activation(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(billing, "db", db)
    monkeypatch.setattr(billing, "_plan_for_price", lambda _: "family")
    ref = db.collection("users").document("a@example.com")
    ref.set({"subscriptionId":"old", "isPro":True, "plan":"family"})
    cancellation_read, activation_done = Event(), Event()
    # The real reference is used for writes; intercept reads only.
    original_get = ref.get
    def get(**kwargs):
        snapshot = original_get(**kwargs)
        if current_thread().name.endswith("_0"):
            cancellation_read.set()
            activation_done.wait(0.15)
        return snapshot
    monkeypatch.setattr(ref, "get", get)
    monkeypatch.setattr(billing, "_find_user_for_subscription", lambda *args:ref)
    def sync(old):
        if not old:
            assert cancellation_read.wait(2)
        with app.app.test_request_context("/"):
            billing._sync_subscription({"id":"old" if old else "new", "status":"canceled" if old else "active", "items":{"data":[]}})
        if not old:
            activation_done.set()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(sync, True)
        second = pool.submit(sync, False)
        first.result(); second.result()
    final = original_get().to_dict()
    assert final["subscriptionId"] == "new"
    assert final["isPro"] is True


@pytest.mark.parametrize("paid,gift,expected", [("family","classroom","classroom"),("classroom","family","classroom")])
def test_renewals_preserve_the_stronger_paid_or_gift_tier(monkeypatch, paid, gift, expected):
    db = FakeFirestore()
    monkeypatch.setattr(billing, "db", db)
    monkeypatch.setattr(billing, "_plan_for_price", lambda _:paid)
    ref = db.collection("users").document("a@example.com")
    ref.set({"subscriptionId":"paid", "plan":expected,"gifted":True,"giftPlan":gift,"giftExpiresAt":datetime.now(timezone.utc)+timedelta(days=10)})
    monkeypatch.setattr(billing, "_find_user_for_subscription", lambda *args:ref)
    with app.app.test_request_context("/"):
        billing._sync_subscription({"id":"paid","status":"active","items":{"data":[]}})
    data = ref.get().to_dict()
    assert data["plan"] == expected
    assert data["paidPlan"] == paid
    assert users.gift_end_update(data)["plan"] == paid
    with app.app.test_request_context("/"):
        billing._sync_subscription({"id":"paid","status":"canceled","items":{"data":[]}})
    assert ref.get().to_dict()["plan"] == gift


@pytest.mark.parametrize("source", ["today","household","meals","medical","travel"])
def test_source_saves_reject_an_outdated_family(monkeypatch, source):
    db = FakeFirestore()
    monkeypatch.setattr(store, "db", db)
    original = store.save_beta_state("a@example.com", store.default_beta_state())
    newer = deepcopy(original)
    newer["family"]["name"] = "Updated family"
    store.save_beta_state("a@example.com", newer)
    payload = getattr(store, f"default_{source}_state")()
    with pytest.raises(store.WeekFlowRevisionConflict, match="Family members changed"):
        getattr(store, f"save_{source}_state")("a@example.com", payload, family=original["family"])


@pytest.mark.parametrize("failure", ["generation","upload",None])
def test_bundle_publish_requires_every_worksheet_and_successful_upload(monkeypatch, tmp_path, failure):
    monkeypatch.chdir(tmp_path)
    db = FakeFirestore()
    monkeypatch.setattr(bundles, "db", db)
    ref = db.collection("collections").document("pack")
    ref.set({"zipUrl":"https://existing.test/pack.zip"})
    path = Path("output/packs/pack.zip")
    path.parent.mkdir(parents=True)
    path.write_bytes(b"previous bundle")
    jobs = []
    class Thread:
        def __init__(self, target, **kwargs): jobs.append(target)
        def start(self): pass
    monkeypatch.setattr(bundles.threading, "Thread", Thread)
    monkeypatch.setattr(bundles, "get_collection_meta", lambda _: {"verses":["John 3:16","John 3:17"],"defaultVersion":"kjv"})
    text = json.dumps({"fullVerse":"Real verse"})
    monkeypatch.setattr(bundles, "request_verse_data", mock.Mock(side_effect=[text, None if failure == "generation" else text]))
    monkeypatch.setattr(bundles, "normalize_verse_data", lambda data,*args:data)
    monkeypatch.setattr(bundles, "generate_pdf", lambda data,path,**kwargs:Path(path).write_bytes(b"pdf"))
    upload = mock.Mock(return_value=failure != "upload")
    monkeypatch.setattr(bundles, "upload_to_storage_checked", upload)
    with app.app.test_request_context("/"):
        bundles.admin_prewarm_pack("pack")
    jobs[0]()  # Background worker has no request context.
    result = ref.get().to_dict()
    if failure:
        assert result["prewarm"]["status"] == "error"
        assert result["zipUrl"] == "https://existing.test/pack.zip"
        assert path.read_bytes() == b"previous bundle"
        if failure == "generation": upload.assert_not_called()
    else:
        assert result["prewarm"]["status"] == "done"
        assert len(zipfile.ZipFile(path).namelist()) == 2
        assert result["zipUrl"].endswith("/packs/pack.zip")
    assert not list(path.parent.glob(".*.zip"))
