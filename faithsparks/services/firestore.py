# firestore.py
import json
import logging
import os
import threading

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud import storage

STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("STORAGE_BUCKET")

_db = None
_storage_client = None
_initialized = False
_initialized_pid = None
_last_init_error = None
_init_lock = threading.Lock()

logger = logging.getLogger(__name__)


def validate_firebase_credentials() -> None:
    """Validate configured credentials without creating a fork-sensitive client."""
    creds_str = os.getenv("FIREBASE_CREDS_JSON")
    if not creds_str:
        raise ValueError("FIREBASE_CREDS_JSON is not configured")
    info = json.loads(creds_str)
    credentials.Certificate(info)


def init_firebase():
    global _db, _storage_client, _initialized, _initialized_pid, _last_init_error
    current_pid = os.getpid()
    if _initialized and _initialized_pid == current_pid:
        return _db, _storage_client

    with _init_lock:
        if _initialized and _initialized_pid == current_pid:
            return _db, _storage_client

        # Never reuse clients inherited from a Gunicorn parent or another
        # process. Firestore/gRPC channels must be constructed in this worker.
        if _initialized_pid is not None and _initialized_pid != current_pid:
            _db = None
            _storage_client = None
            _initialized = False
            _initialized_pid = None

        creds_str = os.getenv("FIREBASE_CREDS_JSON")
        if not creds_str:
            _last_init_error = "FIREBASE_CREDS_JSON is missing in this process"
            return None, None

        try:
            info = json.loads(creds_str)

            # Avoid double-init in dev/reloader.
            if not firebase_admin._apps:
                cred = credentials.Certificate(info)  # no temp file
                firebase_admin.initialize_app(cred)

            _db = firestore.client()
            _initialized_pid = current_pid
            _last_init_error = None
            logger.info("Firestore client initialized in worker pid=%s", os.getpid())
        except Exception as exc:
            _db = None
            _initialized_pid = None
            _last_init_error = f"{type(exc).__name__}: {exc}"
            logger.exception("Firebase credentials or Firestore client initialization failed")
            return None, None

        # Storage is optional and must not take a working Firestore client down.
        if STORAGE_BUCKET:
            try:
                _storage_client = storage.Client.from_service_account_info(info)
            except Exception:
                _storage_client = None
                logger.exception("Firebase Storage client initialization failed")
        else:
            _storage_client = None

        _initialized = True
        return _db, _storage_client


def firebase_init_diagnostic() -> str:
    return _last_init_error or "no initialized client"


class _FirestoreAccessor:
    """Lazy proxy so callers can use `db` like a client or call it."""

    def __call__(self):
        return init_firebase()[0]

    def __bool__(self):
        # Some third-party client objects implement their own truthiness. The
        # availability question is only whether initialization returned a client.
        return self() is not None

    def __getattr__(self, name):
        client = self()
        if client is None:
            raise AttributeError("Firestore not configured")
        return getattr(client, name)


class _StorageAccessor:
    """Lazy proxy so callers can use `storage_client` as callable or object."""

    def __call__(self):
        return init_firebase()[1]

    def __bool__(self):
        return self() is not None

    def __getattr__(self, name):
        client = self()
        if client is None:
            raise AttributeError("Storage client not configured")
        return getattr(client, name)


# Public accessors used elsewhere
db = _FirestoreAccessor()
storage_client = _StorageAccessor()
