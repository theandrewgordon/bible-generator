# firestore.py
import os, json, firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import storage

STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("STORAGE_BUCKET")

_db = None
_storage_client = None

def init_firebase():
    global _db, _storage_client
    if _db is not None:        # already inited
        return _db, _storage_client

    creds_str = os.getenv("FIREBASE_CREDS_JSON")
    if not creds_str:
        return None, None

    try:
        info = json.loads(creds_str)

        # Avoid double-init in dev/reloader
        if not firebase_admin._apps:
            cred = credentials.Certificate(info)  # no temp file
            firebase_admin.initialize_app(cred)

        _db = firestore.client()

        if STORAGE_BUCKET:
            # in-memory creds, no file system writes
            _storage_client = storage.Client.from_service_account_info(info)
        else:
            _storage_client = None

    except Exception:
        _db, _storage_client = None, None

    return _db, _storage_client

# Public accessors used elsewhere
def db():
    return init_firebase()[0]

def storage_client():
    return init_firebase()[1]
