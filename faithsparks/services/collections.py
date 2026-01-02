import json
from .firestore import db


def load_collections() -> dict:
    try:
        with open('collections.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {
            "back-to-school": ["Proverbs 22:6", "Colossians 3:23", "Psalm 119:105"],
            "memory-verses": ["John 3:16", "Romans 8:28", "Philippians 4:13"],
            "psalms": ["Psalm 23:1", "Psalm 100:4", "Psalm 1:1"],
            "advent": ["Isaiah 9:6", "Micah 5:2", "Luke 2:11"],
            "easter": ["John 11:25", "Luke 24:6", "1 Corinthians 15:3-4"],
        }


COLLECTIONS = load_collections()

_BUNDLE_DEFAULTS = {
    "starter": {
        "ageRange": "Ages 6-10",
        "skills": ["Copywork", "Handwriting", "Scripture memory"],
        "useCases": ["Morning basket", "Quiet time", "Family worship"],
        "previewImages": ["Copywork1.png", "Copywork2.png"],
    },
    "psalms": {
        "ageRange": "Ages 6-12",
        "skills": ["Copywork", "Reflection", "Handwriting"],
        "useCases": ["Quiet time", "Morning basket", "Memory work"],
        "previewImages": ["Copywork3.png", "Copywork4.png"],
    },
    "advent": {
        "ageRange": "Ages 5-11",
        "skills": ["Copywork", "Seasonal devotions", "Handwriting"],
        "useCases": ["Advent", "Morning basket", "Family worship"],
        "previewImages": ["Copywork4.png", "Copywork5.png"],
    },
    "easter": {
        "ageRange": "Ages 5-11",
        "skills": ["Copywork", "Reflection", "Handwriting"],
        "useCases": ["Easter week", "Sunday school", "Family worship"],
        "previewImages": ["Copywork2.png", "Copywork5.png"],
    },
    "back-to-school": {
        "ageRange": "Ages 6-12",
        "skills": ["Copywork", "Character", "Handwriting"],
        "useCases": ["Back to school", "Morning basket", "Co-op"],
        "previewImages": ["Copywork2.png", "Copywork3.png"],
    },
    "memory-verses": {
        "ageRange": "Ages 6-12",
        "skills": ["Scripture memory", "Copywork", "Handwriting"],
        "useCases": ["Memory work", "Quiet time", "Morning basket"],
        "previewImages": ["Copywork1.png", "Copywork4.png"],
    },
}

_GAME_DEFAULTS = {
    "match-the-verse": {
        "ageRange": "Ages 6-12",
        "skills": ["Bible knowledge", "Reading", "Matching"],
        "useCases": ["Morning basket", "Family night", "Co-op"],
        "previewImages": ["Copywork2.png", "Copywork3.png"],
    },
    "word-search-psalms": {
        "ageRange": "Ages 6-12",
        "skills": ["Bible knowledge", "Word recognition", "Focus"],
        "useCases": ["Morning basket", "Quiet time", "Co-op"],
        "previewImages": ["Copywork1.png", "Copywork4.png"],
    },
}

_GAME_SLUGS = {"match-the-verse", "word-search-psalms"}
_GAME_TITLES = {
    "match-the-verse": "Match the Verse",
    "word-search-psalms": "Psalms Word Search",
}
_GAME_TYPES = {"match-the-verse": "match", "word-search-psalms": "word-search"}


def _apply_bundle_defaults(meta: dict) -> dict:
    slug = meta.get("slug")
    defaults = _BUNDLE_DEFAULTS.get(slug, {})
    if (meta.get("kind") or "bundle") != "bundle":
        default_title = slug.replace("-", " ").title() if slug else ""
        if _GAME_TITLES.get(slug) and (not meta.get("title") or meta.get("title") == default_title):
            meta["title"] = _GAME_TITLES[slug]
        if not meta.get("gameType") and _GAME_TYPES.get(slug):
            meta["gameType"] = _GAME_TYPES[slug]
        defaults = _GAME_DEFAULTS.get(slug, {})
        if not meta.get("ageRange") and defaults.get("ageRange"):
            meta["ageRange"] = defaults["ageRange"]
        if not meta.get("skills") and defaults.get("skills"):
            meta["skills"] = list(defaults["skills"])
        if not meta.get("useCases") and defaults.get("useCases"):
            meta["useCases"] = list(defaults["useCases"])
        if not meta.get("previewImages") and defaults.get("previewImages"):
            meta["previewImages"] = list(defaults["previewImages"])
        meta["previewImages"] = _normalize_preview_images(meta.get("previewImages") or [])
        return meta
    if not meta.get("ageRange") and defaults.get("ageRange"):
        meta["ageRange"] = defaults["ageRange"]
    if not meta.get("skills") and defaults.get("skills"):
        meta["skills"] = list(defaults["skills"])
    if not meta.get("useCases") and defaults.get("useCases"):
        meta["useCases"] = list(defaults["useCases"])
    if not meta.get("previewImages") and defaults.get("previewImages"):
        meta["previewImages"] = list(defaults["previewImages"])
    meta["previewImages"] = _normalize_preview_images(meta.get("previewImages") or [])
    return meta


def _normalize_preview_images(items: list[str]) -> list[str]:
    normalized = []
    for img in items or []:
        if not img:
            continue
        normalized.append(
            img
            if img.startswith(("http://", "https://", "/static/"))
            else f"/static/CopyworkStock/{img}"
        )
    return normalized


def _fmt_dt(ts):
    try:
        return ts.strftime('%Y-%m-%d %H:%M') if ts else None
    except Exception:
        try:
            return str(ts)
        except Exception:
            return None


def get_collections(show_all: bool = False):
    if db:
        try:
            if show_all:
                docs = db.collection('collections').stream()
            else:
                from firebase_admin import firestore as _fs
                docs = db.collection('collections').where(filter=_fs.FieldFilter('isPublic', '==', True)).stream()
            items = []
            for d in docs:
                data = d.to_dict()
                pr = data.get('prewarm') or {}
                items.append(_apply_bundle_defaults({
                    'slug': d.id,
                    'title': data.get('title') or d.id.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description', ''),
                    'isFree': data.get('isFree', False),
                    'isSubscriberOnly': data.get('isSubscriberOnly', False),
                    'priceId': data.get('priceId'),
                    'kind': (data.get('kind') or 'bundle').strip().lower(),
                    'ageRange': data.get('ageRange'),
                    'skills': data.get('skills') or [],
                    'useCases': data.get('useCases') or [],
                    'previewImages': data.get('previewImages') or [],
                    'gameItems': data.get('gameItems') or [],
                    'gameWords': data.get('gameWords') or [],
                    'gameType': (data.get('gameType') or '').strip().lower(),
                    'theme': data.get('theme') or '',
                    'difficulty': data.get('difficulty') or '',
                    'prewarm': pr,
                    'lastBuilt': _fmt_dt(pr.get('finishedAt')) if isinstance(pr, dict) else None,
                    'order': int(data.get('order') or 9999),
                }))
            if items:
                return items
        except Exception:
            pass
    items = []
    for slug, verses in (COLLECTIONS or {}).items():
        kind = "game" if slug in _GAME_SLUGS else "bundle"
        items.append(_apply_bundle_defaults({
            'slug': slug,
            'title': slug.replace('-', ' ').title(),
            'verses': verses,
            'defaultVersion': None,
            'zipUrl': None,
            'description': '',
            'isFree': False,
            'isSubscriberOnly': False,
            'priceId': None,
            'kind': kind,
            'ageRange': None,
            'skills': [],
            'useCases': [],
            'previewImages': [],
            'gameItems': [],
            'gameWords': [],
            'gameType': '',
            'theme': '',
            'difficulty': '',
            'prewarm': None,
            'lastBuilt': None,
            'order': 9999,
        }))
    return items


def get_collection_meta(slug: str):
    if db:
        try:
            d = db.collection('collections').document(slug).get()
            if d.exists:
                data = d.to_dict()
                return _apply_bundle_defaults({
                    'slug': slug,
                    'title': data.get('title') or slug.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description', ''),
                    'isSubscriberOnly': data.get('isSubscriberOnly', False),
                    'priceId': data.get('priceId'),
                    'prewarm': data.get('prewarm'),
                    'isFree': data.get('isFree', False),
                    'kind': (data.get('kind') or 'bundle').strip().lower(),
                    'ageRange': data.get('ageRange'),
                    'skills': data.get('skills') or [],
                    'useCases': data.get('useCases') or [],
                    'previewImages': data.get('previewImages') or [],
                    'gameItems': data.get('gameItems') or [],
                    'gameWords': data.get('gameWords') or [],
                    'gameType': (data.get('gameType') or '').strip().lower(),
                    'theme': data.get('theme') or '',
                    'difficulty': data.get('difficulty') or '',
                })
        except Exception:
            pass
    verses = (COLLECTIONS or {}).get(slug)
    if verses is None:
        return None
    kind = "game" if slug in _GAME_SLUGS else "bundle"
    return _apply_bundle_defaults({
        'slug': slug,
        'title': slug.replace('-', ' ').title(),
        'verses': verses,
        'defaultVersion': None,
        'zipUrl': None,
        'description': '',
        'prewarm': None,
        'isFree': False,
        'isSubscriberOnly': False,
        'priceId': None,
        'kind': kind,
        'ageRange': None,
        'skills': [],
        'useCases': [],
        'previewImages': [],
        'gameItems': [],
        'gameWords': [],
        'gameType': '',
        'theme': '',
        'difficulty': '',
    })


def get_collection_verses(slug: str):
    meta = get_collection_meta(slug)
    return meta['verses'] if meta else []
