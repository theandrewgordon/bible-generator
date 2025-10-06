# faithsparks/services/storage.py
from datetime import timedelta

from .firestore import STORAGE_BUCKET, storage_client  # storage_client is now a callable


def _get_bucket():
    """Return a Bucket or None (lazy, safe)."""
    try:
        client = storage_client()
        if not client or not STORAGE_BUCKET:
            return None
        return client.bucket(STORAGE_BUCKET)
    except Exception:
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
        return None


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
