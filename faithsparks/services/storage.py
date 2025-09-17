from datetime import timedelta
from .firestore import storage_client, STORAGE_BUCKET


def upload_to_storage(local_path: str, dst_path: str) -> str | None:
    if not storage_client or not STORAGE_BUCKET:
        return None
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(dst_path)
        blob.upload_from_filename(local_path)
        return None
    except Exception:
        return None


def signed_url_for_path(dst_path: str, minutes: int = 120) -> str | None:
    if not storage_client or not STORAGE_BUCKET:
        return None
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(dst_path)
        if not blob.exists():
            return None
        url = blob.generate_signed_url(version="v4", expiration=timedelta(minutes=minutes), method="GET")
        return url
    except Exception:
        return None

