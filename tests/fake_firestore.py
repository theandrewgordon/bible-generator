"""Tiny in-memory Firestore for billing tests (documents, merge, sentinels, where)."""

from datetime import datetime, timezone
import threading
import uuid

from firebase_admin import firestore


def _apply(target: dict, data: dict, merge: bool) -> dict:
    out = dict(target) if merge else {}
    for key, value in data.items():
        if value is firestore.DELETE_FIELD:
            out.pop(key, None)
        elif value is firestore.SERVER_TIMESTAMP:
            out[key] = datetime.now(timezone.utc)
        elif type(value).__name__ == "Increment":
            out[key] = (out.get(key) or 0) + value.value
        elif isinstance(value, dict) and merge and isinstance(out.get(key), dict):
            out[key] = _apply(out[key], value, True)
        elif isinstance(value, dict):
            out[key] = _apply({}, value, True)
        else:
            out[key] = value
    return out


class Snap:
    def __init__(self, ref, data):
        self.reference, self.id, self._data = ref, ref.id, data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class Doc:
    def __init__(self, store, path, doc_id):
        self.store, self.path, self.id = store, path, doc_id

    def get(self, *args, **kwargs):
        return Snap(self, self.store.setdefault(self.path, {}).get(self.id))

    def set(self, data, merge=False):
        coll = self.store.setdefault(self.path, {})
        coll[self.id] = _apply(coll.get(self.id) or {}, data, merge)

    def delete(self):
        self.store.setdefault(self.path, {}).pop(self.id, None)

    def collection(self, name):
        return Coll(self.store, f"{self.path}/{self.id}/{name}")

    def collections(self):
        prefix = f"{self.path}/{self.id}/"
        names = {key[len(prefix):] for key in self.store if key.startswith(prefix) and "/" not in key[len(prefix):]}
        return [Coll(self.store, prefix + name) for name in sorted(names)]


class Query:
    def __init__(self, coll, filters, limit=None):
        self.coll, self.filters, self._limit = coll, filters, limit

    def where(self, filter=None):
        return Query(self.coll, self.filters + [filter], self._limit)

    def limit(self, n):
        return Query(self.coll, self.filters, n)

    def stream(self):
        out = []
        for doc_id, data in self.coll.store.get(self.coll.path, {}).items():
            if all(f.op_string == "==" and data.get(f.field_path) == f.value for f in self.filters):
                out.append(Snap(Doc(self.coll.store, self.coll.path, doc_id), data))
        return iter(out[: self._limit] if self._limit else out)


class Coll:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def document(self, doc_id=None):
        return Doc(self.store, self.path, doc_id or uuid.uuid4().hex)

    def where(self, filter=None):
        return Query(self, [filter])

    def stream(self):
        return Query(self, []).stream()

    def limit(self, n):
        return Query(self, [], n)

    def add(self, data):
        self.document(f"auto{len(self.store.get(self.path, {}))}").set(data)


class FakeFirestore:
    def __init__(self):
        self._transaction_lock = threading.RLock()
        self.store: dict = {}
        self.fail_collections: set[str] = set()

    def collection(self, name):
        if name in self.fail_collections:
            raise RuntimeError("Firestore unavailable")
        return Coll(self.store, name)

    def user(self, email):
        return self.store.get("users", {}).get(email) or {}


class FakeTransaction:
    def __init__(self, db):
        self.lock = db._transaction_lock

    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)


def _transaction(self):
    return FakeTransaction(self)


FakeFirestore.transaction = _transaction
