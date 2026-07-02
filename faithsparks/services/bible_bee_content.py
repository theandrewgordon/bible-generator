"""Deck metadata and deterministic question generation for Family Bible Bee."""

from __future__ import annotations

import json
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
    "oral_recitation": {
        "name": "Oral Recitation",
        "description": "Players recite aloud and the host awards full or partial credit.",
        "modes": ["oral"],
    },
}

DIFFICULTIES = {
    "little_sparks": {"name": "Little Sparks", "correct": 100, "participation": 25},
    "family": {"name": "Family", "correct": 100, "participation": 0},
    "challenge": {"name": "Challenge", "correct": 125, "participation": 0},
    "hard": {"name": "Hard", "correct": 175, "participation": 0},
    "expert": {"name": "Expert", "correct": 225, "participation": 0},
    "upramp": {"name": "Upramp", "correct": 100, "participation": 0},
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
    "words-of-jesus": {
        "id": "words-of-jesus",
        "title": "Words of Jesus",
        "description": "Remember Jesus’ invitations, commands, promises, and good news.",
        "age_range": "Ages 8+",
        "difficulty": "Easy / Medium",
        "theme": "Jesus’ Teaching",
        "source": "builtin",
        "passages": _refs(
            "Matthew 5:14", "Matthew 5:16", "Matthew 6:9-13", "Matthew 6:33",
            "Matthew 7:7", "Matthew 11:28-30", "Matthew 19:14", "Matthew 22:37-39",
            "Mark 10:27", "John 8:12", "John 10:10", "John 14:6",
        ),
    },
    "prayer-praise": {
        "id": "prayer-praise",
        "title": "Prayer & Praise",
        "description": "Joyful passages about worship, gratitude, prayer, and celebrating God.",
        "age_range": "All ages",
        "difficulty": "Easy / Medium",
        "theme": "Worship",
        "source": "builtin",
        "passages": _refs(
            "Psalm 34:1", "Psalm 63:3-4", "Psalm 95:1-2", "Psalm 100:1-5",
            "Psalm 103:1-2", "Psalm 118:24", "Psalm 145:3", "Psalm 150:6",
            "Philippians 4:6-7", "Colossians 4:2", "1 Thessalonians 5:16-18",
            "James 5:16",
        ),
    },
}


def translation_is_configured(version: str) -> bool:
    # Match the copyworksheet picker: supported translations stay selectable.
    # At load time we prefer an authoritative provider, then use the same
    # cached worksheet Scripture pipeline as the copyworksheet generator.
    return (version or "").lower() in TRANSLATIONS


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


def _copyworksheet_verse_text(reference: str, version: str) -> str | None:
    text = fetch_verse_text(reference, version)
    if text:
        return text
    try:
        from verse_helpers import request_verse_data

        payload = request_verse_data(reference, version)
        data = json.loads(payload) if payload else {}
        return str(data.get("fullVerse") or "").strip() or None
    except Exception:
        return None


def _parse_reference(reference: str) -> tuple[str, int | None, int | None, int | None]:
    match = re.match(r"(.+?)\s+(\d+):(\d+)(?:-(\d+))?$", reference)
    if not match:
        return reference, None, None, None
    return match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(4) or match.group(3))


def _keywords(text: str) -> list[str]:
    stop = {
        "about", "after", "again", "against", "also", "because", "before", "being",
        "came", "come", "does", "from", "have", "into", "just", "made", "make",
        "said", "says", "shall", "that", "their", "them", "there", "these", "they",
        "this", "those", "thou", "through", "unto", "upon", "very", "were", "what",
        "when", "where", "which", "while", "with", "would", "your",
    }
    words = re.findall(r"[A-Za-z']+", text)
    unique = []
    priority = {
        word: score
        for score, word in enumerate(
            reversed(
                [
                    "god", "lord", "jesus", "christ", "spirit", "father", "son",
                    "faith", "love", "grace", "truth", "trust", "hope", "peace",
                    "mercy", "wisdom", "righteousness", "salvation", "eternal",
                    "heart", "light", "word", "life", "world", "strength", "fear",
                ]
            ),
            start=100,
        )
    }
    ranked = sorted(
        enumerate(words),
        key=lambda item: (
            priority.get(item[1].strip("'").lower(), 0),
            min(len(item[1]), 10),
            -item[0],
        ),
        reverse=True,
    )
    for _position, word in ranked:
        clean = word.strip("'")
        meaningful_short_word = clean.lower() in priority
        if (
            (len(clean) >= 4 or meaningful_short_word)
            and clean.lower() not in stop
            and clean.lower() not in {item.lower() for item in unique}
        ):
            unique.append(clean)
        if len(unique) >= 6:
            break
    return unique


_BLANK_GROUPS = (
    ("God", "Lord", "Jesus", "Christ", "Spirit", "Father", "Son"),
    ("faith", "hope", "love", "grace", "truth", "mercy", "peace", "joy", "trust"),
    ("heart", "mind", "soul", "strength"),
    ("light", "word", "life", "world", "way"),
)


def _blank_distractors(blank: str, passages: list[dict]) -> list[str]:
    for group in _BLANK_GROUPS:
        if blank.lower() in {word.lower() for word in group}:
            return [word for word in group if word.lower() != blank.lower()]

    candidates = [
        keyword
        for passage in passages
        for keyword in passage.get("keywords", [])
        if keyword.lower() != blank.lower()
    ]
    return sorted(
        candidates,
        key=lambda word: (
            word[:1].isupper() != blank[:1].isupper(),
            abs(len(word) - len(blank)),
        ),
    )


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
        text = _copyworksheet_verse_text(reference, version)
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
    if len(passages) < min(needed, 4):
        raise ValueError(
            f"We could not load enough {TRANSLATIONS[version]['code']} passages for this game. Please try again."
        )
    return passages


def load_reference_passages(references: list[str], version: str) -> list[dict]:
    """Load AI-selected references only from FaithSparks' authoritative text source."""
    if version not in TRANSLATIONS:
        raise ValueError("Choose an available Bible version.")
    if not translation_is_configured(version):
        raise ValueError(f"{TRANSLATIONS[version]['code']} text access is not configured on this server yet.")
    passages = []
    for reference in references[:10]:
        text = _copyworksheet_verse_text(reference, version)
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
                "theme": ["one-off"],
                "difficulty": "custom",
                "keywords": keywords,
                "blanks": keywords[:3],
            }
        )
    if len(passages) < 4:
        raise ValueError(
            f"We could not load enough {TRANSLATIONS[version]['code']} passages for this one-off game."
        )
    return passages


def _split_finish(text: str) -> tuple[str, str]:
    words = text.split()
    if len(words) < 2:
        return text.rstrip(",;:") + "…", text
    if len(words) <= 5:
        split = max(1, len(words) // 2)
    else:
        split = max(3, min(len(words) - 2, len(words) // 2))
    return " ".join(words[:split]).rstrip(",;:") + "…", " ".join(words[split:])


def _choose_blank(passage: dict) -> str:
    candidates = passage.get("blanks") or _keywords(passage.get("text", ""))
    if candidates:
        return candidates[0]
    words = re.findall(r"[A-Za-z']+", passage.get("text", ""))
    return max(words, key=len) if words else ""


def _shuffle_choices(
    correct: str,
    distractors: list[str],
    rng: random.Random,
    choice_count: int = 4,
) -> tuple[list[str], int]:
    choices = [correct]
    for distractor in distractors:
        if distractor and distractor.lower() not in {choice.lower() for choice in choices}:
            choices.append(distractor)
        if len(choices) == choice_count:
            break
    rng.shuffle(choices)
    return choices, choices.index(correct)


_FINISH_WORD_ALTERNATIVES = {
    "always": ("often", "faithfully", "gladly"),
    "believe": ("remember", "follow", "consider"),
    "believes": ("remembers", "follows", "considers"),
    "born": ("called", "ready", "sent"),
    "day": ("hour", "season", "morning"),
    "evil": ("danger", "harm", "trouble"),
    "faith": ("hope", "grace", "peace"),
    "fear": ("worry", "doubt", "trouble"),
    "give": ("bring", "show", "send"),
    "gives": ("brings", "shows", "sends"),
    "good": ("right", "wise", "true"),
    "heart": ("mind", "soul", "strength"),
    "help": ("serve", "stand", "comfort"),
    "hope": ("peace", "joy", "courage"),
    "know": ("trust", "follow", "remember"),
    "knows": ("trusts", "follows", "remembers"),
    "life": ("hope", "peace", "joy"),
    "light": ("guide", "lamp", "hope"),
    "love": ("grace", "mercy", "peace"),
    "need": ("trouble", "sorrow", "hardship"),
    "path": ("way", "road", "course"),
    "peace": ("hope", "joy", "comfort"),
    "seek": ("follow", "trust", "remember"),
    "strength": ("wisdom", "courage", "hope"),
    "time": ("hour", "day", "season"),
    "trust": ("follow", "seek", "remember"),
    "truth": ("wisdom", "grace", "promise"),
    "way": ("path", "road", "course"),
    "word": ("truth", "promise", "wisdom"),
    "world": ("earth", "people", "nations"),
}


def _match_case(source: str, replacement: str) -> str:
    if source.isupper():
        return replacement.upper()
    if source[:1].isupper():
        return replacement.capitalize()
    return replacement


def _plausible_finish_variants(answer: str) -> list[str]:
    """Create grammatical near-misses by changing one same-kind content word."""
    variants = []
    for match in re.finditer(r"[A-Za-z']+", answer):
        alternatives = _FINISH_WORD_ALTERNATIVES.get(match.group(0).lower(), ())
        for replacement in alternatives:
            variant = (
                answer[:match.start()]
                + _match_case(match.group(0), replacement)
                + answer[match.end():]
            )
            if variant.casefold() != answer.casefold() and variant.casefold() not in {
                item.casefold() for item in variants
            }:
                variants.append(variant)
    return variants


def _finish_distractors(answer: str, passages: list[dict]) -> list[str]:
    """Prefer grammatical near-misses over visibly unrelated verse fragments."""
    answer_words = re.findall(r"[A-Za-z']+", answer)
    first_word = answer_words[0].casefold() if answer_words else ""
    endings = [_split_finish(item["text"])[1] for item in passages]
    matching_endings = sorted(
        (
            ending
            for ending in endings
            if re.findall(r"[A-Za-z']+", ending)
            and re.findall(r"[A-Za-z']+", ending)[0].casefold() == first_word
        ),
        key=lambda option: abs(len(option.split()) - len(answer.split())),
    )
    other_endings = sorted(
        (ending for ending in endings if ending not in matching_endings),
        key=lambda option: abs(len(option.split()) - len(answer.split())),
    )
    full_verses = sorted(
        (item["text"] for item in passages),
        key=lambda option: abs(len(option.split()) - len(answer.split())),
    )
    return _plausible_finish_variants(answer) + matching_endings + other_endings + full_verses


def _mode_for_round(style: str, index: int) -> str:
    config = GAME_STYLES.get(style, GAME_STYLES["classic_mix"])
    modes = config["modes"]
    return modes[index % len(modes)]


def build_questions(
    passages: list[dict],
    style: str,
    round_count: int,
    seed: str,
    choice_count: int = 4,
    difficulty: str = "family",
) -> list[dict]:
    rng = random.Random(seed)
    choice_count = choice_count if choice_count in {2, 4} else 4
    ordered = deepcopy(passages)
    if style == "younger_kids":
        ordered.sort(key=lambda passage: len(passage["text"].split()))
        ordered = ordered[:max(4, min(len(ordered), round_count))]
    rng.shuffle(ordered)
    questions = []

    for index in range(round_count):
        passage = ordered[index % len(ordered)]
        others = [item for item in ordered if item["id"] != passage["id"]]
        mode = _mode_for_round(style, index)
        round_choice_count = choice_count
        if difficulty in {"hard", "expert"}:
            round_choice_count = 4
        elif difficulty == "upramp":
            round_choice_count = 2 if index < max(1, round_count // 3) else 4

        if mode == "reference":
            choices, correct = _shuffle_choices(
                passage["reference"], [item["reference"] for item in others], rng, round_choice_count
            )
            prompt = passage["text"]
            label = "Reference Race"
        elif mode == "oral":
            prompt = f"{passage['reference']}\nRecite this passage aloud."
            choices, correct = [], None
            label = "Oral Recitation"
        elif mode == "fill_blank":
            blank_candidates = passage.get("blanks") or _keywords(passage["text"])
            blank = rng.choice(blank_candidates[:3]) if blank_candidates else _choose_blank(passage)
            if blank:
                prompt = re.sub(rf"\b{re.escape(blank)}\b", "______", passage["text"], count=1, flags=re.I)
                choices, correct = _shuffle_choices(
                    blank,
                    _blank_distractors(blank, others),
                    rng,
                    round_choice_count,
                )
                label = "Fill the Blank"
            else:
                prompt, answer = _split_finish(passage["text"])
                distractors = _finish_distractors(answer, others)
                choices, correct = _shuffle_choices(answer, distractors, rng, round_choice_count)
                label = "Finish the Verse"
        else:
            prompt, answer = _split_finish(passage["text"])
            distractors = _finish_distractors(answer, others)
            choices, correct = _shuffle_choices(answer, distractors, rng, round_choice_count)
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
