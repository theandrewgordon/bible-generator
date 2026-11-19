"""Safe local return destinations for sign-in and checkout."""
from urllib.parse import urlsplit

def safe_return_path(value):
    value = (value or '').strip()
    if not value.startswith('/') or value.startswith('//') or len(value) > 2000:
        return ''
    if '\\' in value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        return ''
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return ''
    return value
