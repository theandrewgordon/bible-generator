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
                items.append({
                    'slug': d.id,
                    'title': data.get('title') or d.id.replace('-', ' ').title(),
                    'verses': data.get('verses') or [],
                    'defaultVersion': data.get('defaultVersion'),
                    'zipUrl': data.get('zipUrl'),
                    'description': data.get('description', ''),
                    'isFree': data.get('isFree', False),
                    'isSubscriberOnly': data.get('isSubscriberOnly', False),
                    'priceId': data.get('priceId'),
                    'prewarm': pr,
                    'lastBuilt': _fmt_dt(pr.get('finishedAt')) if isinstance(pr, dict) else None,
                    'order': int(data.get('order') or 9999),
                })
            if items:
                return items
        except Exception:
            pass
    items = []
    for slug, verses in (COLLECTIONS or {}).items():
        items.append({
            'slug': slug,
            'title': slug.replace('-', ' ').title(),
            'verses': verses,
            'defaultVersion': None,
            'zipUrl': None,
            'description': '',
            'isFree': False,
            'isSubscriberOnly': False,
            'priceId': None,
            'prewarm': None,
            'lastBuilt': None,
            'order': 9999,
        })
    return items


def get_collection_meta(slug: str):
    if db:
        try:
            d = db.collection('collections').document(slug).get()
            if d.exists:
                data = d.to_dict()
                return {
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
                }
        except Exception:
            pass
    verses = (COLLECTIONS or {}).get(slug)
    if verses is None:
        return None
    return {
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
    }


def get_collection_verses(slug: str):
    meta = get_collection_meta(slug)
    return meta['verses'] if meta else []

