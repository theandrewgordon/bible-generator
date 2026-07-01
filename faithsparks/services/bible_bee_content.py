"""Deck metadata and deterministic question generation for Family Bible Bee."""

from __future__ import annotations

import os
import random
import re
from copy import deepcopy

from faithsparks.services.scripture import fetch_verse_text


TRANSLATIONS = {
    "kjv": {"code": "KJV", "name": "King James Version"},
    "esv": {"code": "ESV", "name": "English Standard Version"},
    "nlt": {"code": "NLT", "name": "New Living Translation"},
}

GAME_STYLES = {
    "classic_mix": {
        "name": "Classic Mix",
        "description": "A lively mix of memory and reference questions.",
        "modes": ["finish", "reference", "fill_blank"],
    },
    "memory_practice": {
        "name": "Memory Practice",
        "description": "Finish verses and fill in important missing words.",
        "modes": ["finish", "fill_blank"],
    },
    "reference_race": {
        "name": "Reference Race",
        "description": "Every round matches Scripture to its reference.",
        "modes": ["reference"],
    },
    "younger_kids": {
        "name": "Younger Kids",
        "description": "Shorter prompts, friendly choices, and participation points.",
        "modes": ["finish", "fill_blank"],
    },
    "challenge": {
        "name": "Challenge Mode",
        "description": "References and fill-in-the-blank questions with stronger scoring.",
        "modes": ["reference", "fill_blank", "finish"],
    },
}

DIFFICULTIES = {
    "little_sparks": {"name": "Little Sparks", "correct": 100, "participation": 25},
    "family": {"name": "Family", "correct": 100, "participation": 0},
    "challenge": {"name": "Challenge", "correct": 125, "participation": 0},
    "bible_bee_prep": {"name": "Bible Bee Prep", "correct": 150, "participation": 0},
}


def _refs(*items):
    return [{"reference": item} for item in items]


DECKS = {
    "family-favorites": {
        "id": "family-favorites",
        "title": "Family Favorites",
        "description": "Beloved passages many Christian families already know.",
        "age_range": "All ages",
        "difficulty": "Easy",
        "theme": "Classic Memory",
        "source": "builtin",
        "passages": _refs(
            "John 3:16", "Psalm 23:1", "Psalm 119:105", "Proverbs 3:5-6",
            "Romans 3:23", "Romans 6:23", "Philippians 4:13", "Ephesians 2:8-9",
            "Matthew 5:16", "James 1:5", "1 Peter 5:7", "Hebrews 11:1",
        ),
    },
    "courage-trust": {
        "id": "courage-trust",
        "title": "Courage & Trust",
        "description": "Verses for fear, anxiety, courage, peace, and trusting God.",
        "age_range": "Ages 8–14",
        "difficulty": "Easy / Medium",
        "theme": "Courage",
        "source": "builtin",
        "passages": _refs(
            "Joshua 1:9", "Psalm 27:1", "Psalm 34:4", "Psalm 46:1",
            "Psalm 56:3", "Proverbs 3:5-6", "Isaiah 26:3", "Isaiah 41:10",
            "John 14:27", "Romans 8:28", "2 Timothy 1:7", "1 Peter 5:7",
        ),
    },
    "gospel-foundations": {
        "id": "gospel-foundations",
        "title": "Gospel Foundations",
        "description": "Creation, sin, grace, salvation, Christ, and faith.",
        "age_range": "Ages 9+",
        "difficulty": "Medium",
        "theme": "Gospel",
        "source": "builtin",
        "passages": _refs(
            "Genesis 1:1", "John 1:1", "John 1:14", "John 3:16",
            "John 14:6", "Romans 3:23", "Romans 5:8", "Romans 6:23",
            "Romans 10:9-10", "Ephesians 2:8-9", "Titus 3:5", "1 John 1:9",
        ),
    },
    "wisdom-obedience": {
        "id": "wisdom-obedience",
        "title": "Wisdom & Obedience",
        "description": "Listening well, obeying God, and making wise choices.",
        "age_range": "Ages 8–14",
        "difficulty": "Medium",
        "theme": "Wisdom",
        "source": "builtin",
        "passages": _refs(
            "Proverbs 1:7", "Proverbs 3:5-6", "Proverbs 4:23", "Proverbs 9:10",
            "Proverbs 15:1", "Proverbs 16:3", "Proverbs 16:9", "Proverbs 17:17",
            "Proverbs 18:10", "Proverbs 22:6", "James 1:5", "James 1:22",
        ),
    },
    "fruit-spirit": {
        "id": "fruit-spirit",
        "title": "Fruit of the Spirit",
        "description": "Love, kindness, patience, gentleness, and self-control.",
        "age_range": "Ages 7–14",
        "difficulty": "Easy / Medium",
        "theme": "Character",
        "source": "builtin",
        "passages": _refs(
            "Galatians 5:22-23", "John 13:34-35", "1 Corinthians 13:4-7",
            "Ephesians 4:32", "Colossians 3:12-14", "Philippians 2:3-4",
            "1 Thessalonians 5:15", "James 1:19", "1 Peter 3:8-9",
            "2 Peter 1:5-8", "Micah 6:8", "Romans 12:10",
        ),
    },
    "psalms-comfort": {
        "id": "psalms-comfort",
        "title": "Psalms of Comfort",
        "description": "Peace, refuge, prayer, worship, and God’s faithful care.",
        "age_range": "All ages",
        "difficulty": "Medium",
        "theme": "Comfort",
        "source": "builtin",
        "passages": _refs(
            "Psalm 19:14", "Psalm 23:1-4", "Psalm 27:1", "Psalm 34:8",
            "Psalm 46:1", "Psalm 51:10", "Psalm 55:22", "Psalm 91:1-2",
            "Psalm 100:1-5", "Psalm 103:1-2", "Psalm 119:11", "Psalm 121:1-2",
        ),
    },
}


def translation_is_configured(version: str) -> bool:
    version = (version or "").lower()
    if version == "kjv":
        return True
    if version == "esv":
        ids = os.getenv("API_BIBLE_IDS", "").lower()
        direct_access = bool(os.getenv("ESV_API_KEY", "").strip())
        api_bible_access = bool(
            os.getenv("API_BIBLE_KEY", "").strip()
            and re.search(r"(?:^|,)\s*esv\s*:", ids)
        )
        return direct_access or api_bible_access
    if version == "nlt":
        ids = os.getenv("API_BIBLE_IDS", "").lower()
        return bool(os.getenv("API_BIBLE_KEY", "").strip() and re.search(r"(?:^|,)\s*nlt\s*:", ids))
    return False


def translation_options() -> list[dict]:
    return [
        {**metadata, "id": version, "available": translation_is_configured(version)}
        for version, metadata in TRANSLATIONS.items()
    ]


def deck_options() -> list[dict]:
    return [
        {
            **{key: value for key, value in deck.items() if key != "passages"},
            "passage_count": len(deck["passages"]),
        }
        for deck in DECKS.values()
    ]


def _parse_reference(reference: str) -> tuple[str, int | None, int | None, int | None]:
    match = re.match(r"(.+?)\s+(\d+):(\d+)(?:-(\d+))?$", reference)
    if not match:
        return reference, None, None, None
    return match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(4) or match.group(3))


def _keywords(text: str) -> list[str]:
    stop = {
        "about", "after", "again", "against", "also", "because", "before", "being",
        "from", "have", "into", "shall", "that", "their", "them", "there", "these",
        "they", "this", "thou", "through", "unto", "upon", "were", "which", "with",
        "would", "your",
    }
    words = re.findall(r"[A-Za-z']+", text)
    unique = []
    for word in sorted(words, key=len, reverse=True):
        clean = word.strip("'")
        if len(clean) >= 4 and clean.lower() not in stop and clean.lower() not in {item.lower() for item in unique}:
            unique.append(clean)
        if len(unique) >= 6:
            break
    return unique


def load_passages(deck_id: str, version: str, needed: int) -> list[dict]:
    deck = DECKS.get(deck_id)
    if not deck:
        raise ValueError("Choose an available verse deck.")
    if version not in TRANSLATIONS:
        raise ValueError("Choose an available Bible version.")
    if not translation_is_configured(version):
        raise ValueError(f"{TRANSLATIONS[version]['code']} text access is not configured on this server yet.")

    passages = []
    for seed in deck["passages"]:
        reference = seed["reference"]
        text = fetch_verse_text(reference, version)
        if not text:
            continue
        book, chapter, verse_start, verse_end = _parse_reference(reference)
        keywords = _keywords(text)
        passages.append(
            {
                "id": re.sub(r"[^a-z0-9]+", "-", f"{reference}-{version}".lower()).strip("-"),
                "reference": reference,
                "version": TRANSLATIONS[version]["code"],
                "text": text,
                "book": book,
                "chapter": chapter,
                "verse_start": verse_start,
                "verse_end": verse_end,
                "theme": [deck["theme"].lower()],
                "difficulty": deck["difficulty"].lower(),
                "keywords": keywords,
                "blanks": keywords[:3],
            }
        )
        if len(passages) >= max(needed, 4):
            break
    if len(passages) < min(needed, 3):
        raise ValueError(
            f"We could not load enough {TRANSLATIONS[version]['code']} passages for this game. Please try again."
        )
    return passages


def _split_finish(text: str) -> tuple[str, str]:
    words = text.split()
    split = max(3, min(len(words) - 2, len(words) // 2))
    return " ".join(words[:split]).rstrip(",;:") + "…", " ".join(words[split:])


def _shuffle_choices(correct: str, distractors: list[str], rng: random.Random) -> tuple[list[str], int]:
    choices = [correct]
    for distractor in distractors:
        if distractor and distractor.lower() not in {choice.lower() for choice in choices}:
            choices.append(distractor)
        if len(choices) == 4:
            break
    rng.shuffle(choices)
    return choices, choices.index(correct)


def _mode_for_round(style: str, index: int) -> str:
    config = GAME_STYLES.get(style, GAME_STYLES["classic_mix"])
    modes = config["modes"]
    return modes[index % len(modes)]


def build_questions(passages: list[dict], style: str, round_count: int, seed: str) -> list[dict]:
    rng = random.Random(seed)
    ordered = deepcopy(passages)
    rng.shuffle(ordered)
    questions = []

    for index in range(round_count):
        passage = ordered[index % len(ordered)]
        others = [item for item in ordered if item["id"] != passage["id"]]
        mode = _mode_for_round(style, index)

        if mode == "reference":
            choices, correct = _shuffle_choices(
                passage["reference"], [item["reference"] for item in others], rng
            )
            prompt = passage["text"]
            label = "Reference Race"
        elif mode == "fill_blank":
            blank = (passage["blanks"] or _keywords(passage["text"]))[0]
            prompt = re.sub(rf"\b{re.escape(blank)}\b", "______", passage["text"], count=1, flags=re.I)
            choices, correct = _shuffle_choices(
                blank,
                [keyword for item in others for keyword in item["keywords"][:1]],
                rng,
            )
            label = "Fill the Blank"
        else:
            prompt, answer = _split_finish(passage["text"])
            distractors = [_split_finish(item["text"])[1] for item in others]
            choices, correct = _shuffle_choices(answer, distractors, rng)
            label = "Finish the Verse"

        questions.append(
            {
                "id": f"{passage['id']}-{mode}-{index}",
                "passage_id": passage["id"],
                "mode": mode,
                "label": label,
                "prompt": prompt,
                "choices": choices,
                "correct": correct,
                "reference": passage["reference"],
                "answer_text": passage["text"],
            }
        )
    return questions
