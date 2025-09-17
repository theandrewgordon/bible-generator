import re


def normalize_slug(text: str) -> str:
    text = text.replace("⚠️", "")
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s:–—]+', '_', text)
    return text.strip('_').lower()

