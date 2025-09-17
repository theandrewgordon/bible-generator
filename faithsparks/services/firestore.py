import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import storage


STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("STORAGE_BUCKET")

creds_str = os.getenv("FIREBASE_CREDS_JSON")
if creds_str:
    try:
        path = "/tmp/firebase-creds.json"
        with open(path, "w") as f:
            json.dump(json.loads(creds_str), f)
        firebase_admin.initialize_app(credentials.Certificate(path))
        db = firestore.client()
        try:
            storage_client = storage.Client.from_service_account_json(path) if STORAGE_BUCKET else None
        except Exception:
            storage_client = None
    except Exception:
        db = None  # type: ignore
        storage_client = None  # type: ignore
else:
    db = None  # type: ignore
    storage_client = None  # type: ignore

