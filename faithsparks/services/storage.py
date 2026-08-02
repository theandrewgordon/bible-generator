# faithsparks/services/storage.py
import os
import logging
from datetime import timedelta

from .firestore import STORAGE_BUCKET, storage_client  # storage_client is now a callable

logger = logging.getLogger(__name__)


def _get_bucket():
    """Return a Bucket or None (lazy, safe)."""
    try:
        client = storage_client()
        if not client or not STORAGE_BUCKET:
            return None
        return client.bucket(STORAGE_BUCKET)
    except Exception:
        logger.exception("Could not initialize storage bucket %s", STORAGE_BUCKET or "(not configured)")
        return None


def upload_to_storage(local_path: str, dst_path: str) -> str | None:
    """
    Uploads a local file to GCS at dst_path.
    Returns None on success (keeps existing API), or None on failure as well.
    (If you want a success value later, we can return the gs:// path.)
    """
    bucket = _get_bucket()
    if not bucket:
        return None
    try:
        blob = bucket.blob(dst_path)
        blob.upload_from_filename(local_path)
        return None
    except Exception:
        logger.exception("Storage upload failed for %s", dst_path)
        return None


def upload_to_storage_checked(local_path: str, dst_path: str) -> bool:
    """Upload a file and report whether the object now exists."""
    bucket = _get_bucket()
    if not bucket:
        logger.error("Storage upload unavailable for %s: no configured bucket/client", dst_path)
        return False
    try:
        blob = bucket.blob(dst_path)
        blob.upload_from_filename(local_path)
        return bool(blob.exists())
    except Exception:
        logger.exception("Checked storage upload failed for %s", dst_path)
        return False


def signed_url_for_path(dst_path: str, minutes: int = 120) -> str | None:
    """Generate a V4 signed URL if the object exists; otherwise None."""
    bucket = _get_bucket()
    if not bucket:
        return None
    try:
        blob = bucket.blob(dst_path)
        if not blob.exists():
            return None
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=minutes),
            method="GET",
        )
    except Exception:
        return None


def blob_exists(dst_path: str) -> bool:
    """Return True if the given blob exists in the configured bucket."""
    bucket = _get_bucket()
    if not bucket:
        return False
    try:
        return bucket.blob(dst_path).exists()
    except Exception:
        return False


def download_from_storage(dst_path: str, local_path: str) -> bool:
    """Download dst_path from the bucket into local_path. Returns True on success."""
    bucket = _get_bucket()
    if not bucket:
        return False
    try:
        blob = bucket.blob(dst_path)
        if not blob.exists():
            return False
        local_dir = os.path.dirname(local_path)
        if local_dir:
            os.makedirs(local_dir, exist_ok=True)
        blob.download_to_filename(local_path)
        return True
    except Exception:
        return False
