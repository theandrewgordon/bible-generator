import re
import unicodedata


def normalize_slug(text: str, max_len: int = 80) -> str:
    s = (text or "").strip()

    # Normalize Unicode (NFKD) and strip accents/compat forms
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))

    # Lowercase
    s = s.lower()

    # Replace common dash-like chars and separators with underscore
    s = s.replace("—", "_").replace("–", "_").replace("·", "_").replace("•", "_")

    # Remove any remaining non word/space/hyphen/underscore
    s = re.sub(r"[^\w\s-]", "", s)

    # Collapse whitespace and separators to single underscore
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")

    # Enforce max length and non-empty fallback
    if max_len and len(s) > max_len:
        s = s[:max_len].rstrip("_")

    return s or "untitled"
