"""Canonical Faith Sparks product map.

Keep public navigation, maturity labels, and product ownership in one place so
experiments cannot quietly become top-level products without an explicit move.
"""

from __future__ import annotations


MISSION = (
    "Help families and small churches live their faith together—with less prep, "
    "less friction, and more meaningful shared time."
)

PRIMARY_NAVIGATION = (
    {"id": "prepare", "label": "Prepare", "path": "/prepare", "prefixes": ("/prepare", "/lesson-pack", "/generate", "/browse")},
    {"id": "worship", "label": "Worship", "path": "/worship", "prefixes": ("/worship",)},
    {"id": "play", "label": "Play", "path": "/play", "prefixes": ("/play", "/games", "/family-game-night", "/family-bible-bee", "/group-games", "/church-games")},
    {"id": "library", "label": "My Library", "path": "/prints", "prefixes": ("/prints",)},
    {"id": "labs", "label": "Labs", "path": "/labs", "prefixes": ("/labs", "/speeddie")},
)

PRODUCTS = (
    {
        "id": "gathering-builder", "name": "Gathering Builder", "area": "prepare",
        "maturity": "core", "path": "/lesson-pack", "accent": "teal",
        "description": "Turn one Bible passage into a ready-to-lead, all-age house-church gathering.",
    },
    {
        "id": "copywork", "name": "Copywork", "area": "prepare",
        "maturity": "core", "path": "/generate", "accent": "blue",
        "description": "Make a clean, age-aware Scripture worksheet in seconds.",
    },
    {
        "id": "bundles", "name": "Printable Library", "area": "prepare",
        "maturity": "core", "path": "/browse", "accent": "gold",
        "description": "Browse ready-to-print Bible activities and reusable bundles.",
    },
    {
        "id": "verse-of-the-week", "name": "Verse of the Week", "area": "prepare",
        "maturity": "core", "path": "/verse-of-the-week", "accent": "forest",
        "description": "Keep one passage visible with a simple weekly Scripture rhythm.",
    },
    {
        "id": "worship", "name": "Worship", "area": "worship",
        "maturity": "core", "path": "/worship", "accent": "purple",
        "description": "Build a service, present lyrics, share a stage view, and export when needed.",
    },
    {
        "id": "family-game-night", "name": "Family Game Night", "area": "play",
        "maturity": "core", "path": "/family-game-night", "accent": "gold",
        "description": "Low-prep, room-friendly play for families and small gatherings.",
    },
    {
        "id": "bible-bee", "name": "Family Bible Bee", "area": "play",
        "maturity": "core", "path": "/family-bible-bee", "accent": "blue",
        "description": "Host a friendly Scripture quiz with phones as controllers.",
    },
    {
        "id": "printable-games", "name": "Printable Games", "area": "play",
        "maturity": "core", "path": "/games", "accent": "teal",
        "description": "Print-and-play Bible games for the table, co-op, or church room.",
    },
    {
        "id": "weekflow", "name": "WeekFlow", "area": "labs",
        "maturity": "beta", "path": "/labs/weekflow", "accent": "forest",
        "description": "Explore a calmer shared rhythm for family schedules and weekly logistics.",
    },
    {
        "id": "coloring-studio", "name": "Coloring Studio", "area": "labs",
        "maturity": "experiment", "path": "/lesson-pack?coloring=1", "accent": "rose",
        "description": "Try optional generated coloring art inside a gathering pack.",
    },
    {
        "id": "speed-die", "name": "Speed Die", "area": "labs",
        "maturity": "sandbox", "path": "/speeddie", "accent": "purple",
        "description": "A tiny helper for fast, energetic group-game rounds.",
    },
)

MATURITY = {
    "core": "Dependable and supported",
    "beta": "Useful now; still being refined",
    "experiment": "Testing the idea and workflow",
    "sandbox": "Small prototype; may change or disappear",
}


def products_for(area: str) -> tuple[dict, ...]:
    return tuple(product for product in PRODUCTS if product["area"] == area)
