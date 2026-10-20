import os


os.environ.setdefault("OPENAI_API_KEY", "test-key")


import functools
import pytest
from firebase_admin import firestore


@pytest.fixture(autouse=True)
def support_fake_transactions(monkeypatch):
    original = firestore.transactional

    def transactional(fn):
        real = original(fn)

        @functools.wraps(fn)
        def run(txn, *args, **kwargs):
            if type(txn).__name__ == "FakeTransaction":
                with txn.lock:
                    return fn(txn, *args, **kwargs)
            return real(txn, *args, **kwargs)
        return run

    monkeypatch.setattr(firestore, "transactional", transactional)
