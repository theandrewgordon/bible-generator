"""Load and validate normalized Family Game Night content."""

from __future__ import annotations

import hashlib
import json
import random
import re
from copy import deepcopy
from functools import lru_cache
from pathlib import Path


CONTENT_PATH = Path(__file__).resolve().parents[1] / "content" / "family_game_night.json"
BIBLE_BEE_CONTENT_PATH = Path(__file__).resolve().parents[1] / "content" / "bible_bee_decks.json"
VALID_MODES = {"act", "draw", "clue", "guess"}
VALID_CATEGORIES = {
    "bible_stories", "jesus_miracles", "parables", "people",
    "worship_church", "everyday_faith",
}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_TESTAMENTS = {"OT", "NT", "general"}
VALID_FAMILIARITY = {"famous", "known", "discovery"}
PRODUCTION_STATUSES = {"published"}


class ContentValidationError(ValueError):
    """Raised when content cannot safely enter a production pool."""


class RoundBuildError(ValueError):
    """Recoverable setup error caused by a shallow filtered pool."""

    def __init__(self, message: str, diagnostics: dict | None = None):
        super().__init__(message)
        self.diagnostics = diagnostics or {}


def canonical_answer(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


@lru_cache(maxsize=1)
def load_family_game_content() -> dict:
    return json.loads(CONTENT_PATH.read_text(encoding="utf-8"))


def family_prompts(*, include_review: bool = False) -> list[dict]:
    records = deepcopy(load_family_game_content()["records"])
    if include_review:
        return records
    return [record for record in records if record.get("status") in PRODUCTION_STATUSES]


def legacy_family_prompts() -> list[dict]:
    """Compatibility projection for existing room payload and legacy routes."""
    return [
        {
            "id": record["id"],
            "answer": record["answer"],
            "modes": list(record["modes"]),
            "theme": "Expanded Library" if record.get("source_status") else (record.get("legacy_theme") or record["category_label"]),
            "difficulty": record["difficulty"],
            "instruction": next(iter(record.get("instructions", {}).values()), ""),
            "forbidden_words": list(record.get("forbidden_words") or []),
            "clues": list(record.get("progressive_clues") or []),
        }
        for record in family_prompts()
    ]


def free_sampler_ids() -> frozenset[str]:
    return frozenset(load_family_game_content().get("free_sampler_ids", []))


@lru_cache(maxsize=1)
def load_bible_bee_content() -> dict:
    return json.loads(BIBLE_BEE_CONTENT_PATH.read_text(encoding="utf-8"))


def _reference_parts(reference: str) -> tuple[str, int, int, int] | None:
    match = re.fullmatch(
        r"(.+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?",
        reference.strip(),
    )
    if not match:
        return None
    return match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(5) or match.group(3))


def validate_family_content(data: dict, *, enforce_depth: bool = False) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    records = data.get("records") if isinstance(data, dict) else None
    if not isinstance(records, list):
        return {"errors": ["root: records must be a list"], "warnings": [], "stats": {}}
    seen_ids: set[str] = set()
    for index, record in enumerate(records):
        prompt_id = str(record.get("id") or f"record[{index}]")
        prefix = f"{prompt_id}:"
        if not record.get("id") or record["id"] in seen_ids:
            errors.append(f"{prefix} duplicate or empty id")
        seen_ids.add(record.get("id"))
        if not str(record.get("answer") or "").strip():
            errors.append(f"{prefix} answer is empty")
        modes = record.get("modes") or []
        if not modes or set(modes) - VALID_MODES:
            errors.append(f"{prefix} invalid modes {modes!r}")
        if record.get("category") not in VALID_CATEGORIES:
            errors.append(f"{prefix} invalid category {record.get('category')!r}")
        if record.get("difficulty") not in VALID_DIFFICULTIES:
            errors.append(f"{prefix} invalid difficulty {record.get('difficulty')!r}")
        if record.get("testament") not in VALID_TESTAMENTS:
            errors.append(f"{prefix} invalid testament {record.get('testament')!r}")
        if record.get("familiarity") not in VALID_FAMILIARITY:
            errors.append(f"{prefix} invalid familiarity {record.get('familiarity')!r}")
        if not str(record.get("story_group") or "").strip():
            errors.append(f"{prefix} story_group is required")
        instructions = record.get("instructions") or {}
        for mode in modes:
            if not str(instructions.get(mode) or "").strip():
                errors.append(f"{prefix} missing instruction for {mode}")
        forbidden = [str(item).strip() for item in record.get("forbidden_words") or []]
        if "clue" in modes and not forbidden:
            errors.append(f"{prefix} clue mode requires forbidden_words")
        if len({word.casefold() for word in forbidden}) != len(forbidden):
            errors.append(f"{prefix} duplicate forbidden_words")
        if canonical_answer(record.get("answer", "")) in {canonical_answer(word) for word in forbidden}:
            errors.append(f"{prefix} forbidden word exactly equals answer")
        clues = [str(item).strip() for item in record.get("progressive_clues") or []]
        if "guess" in modes and len(clues) < 4:
            errors.append(f"{prefix} guess mode requires at least four progressive_clues")
        if len({clue.casefold() for clue in clues}) != len(clues):
            errors.append(f"{prefix} duplicate progressive_clues")
        reference = str(record.get("reference") or "").strip()
        book = record.get("book")
        testament = record.get("testament")
        if reference:
            parts = _reference_parts(reference)
            if not parts:
                errors.append(f"{prefix} invalid reference {reference!r}")
            elif book != parts[0]:
                errors.append(f"{prefix} reference book {parts[0]!r} does not match {book!r}")
            if testament == "general":
                errors.append(f"{prefix} referenced prompt cannot use general testament")
        elif book:
            errors.append(f"{prefix} book requires a reference")
        if record.get("status") not in {"published", "review", "retired"}:
            errors.append(f"{prefix} invalid status {record.get('status')!r}")

    published = [item for item in records if item.get("status") == "published"]
    free_ids = data.get("free_sampler_ids") or []
    missing_free = sorted(set(free_ids) - {item["id"] for item in published})
    if missing_free:
        errors.append(f"free_sampler_ids: unpublished or unknown ids: {', '.join(missing_free)}")
    free_records = [item for item in published if item["id"] in set(free_ids)]
    free_answers = {canonical_answer(item["answer"]) for item in free_records}
    mode_counts = {mode: sum(mode in item.get("modes", []) for item in free_records) for mode in VALID_MODES}
    if len(free_ids) < 32:
        errors.append(f"free_sampler_ids: requires 32 ids; found {len(free_ids)}")
    if len(free_answers) < 28:
        errors.append(f"free_sampler_ids: requires 28 unique answers; found {len(free_answers)}")
    for mode, count in mode_counts.items():
        if count < 8:
            errors.append(f"free_sampler_ids: {mode} requires 8 eligible prompts; found {count}")

    depth = {}
    for mode in sorted(VALID_MODES):
        eligible = [item for item in published if mode in item.get("modes", [])]
        answers = {canonical_answer(item["answer"]) for item in eligible}
        depth[mode] = {"records": len(eligible), "unique_answers": len(answers)}
        if len(answers) < 80:
            warnings.append(f"depth: {mode} has {len(answers)} unique answers; target is 80")
            if enforce_depth:
                errors.append(f"depth: {mode} requires 80 unique answers")
    return {
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "records": len(records),
            "published": len(published),
            "free_sampler_ids": len(free_ids),
            "free_unique_answers": len(free_answers),
            "free_mode_counts": mode_counts,
            "mode_depth": depth,
        },
    }


def assert_valid_production_content() -> dict:
    report = validate_family_content(load_family_game_content())
    if report["errors"]:
        raise ContentValidationError("; ".join(report["errors"]))
    return report


def validate_bible_bee_content(data: dict) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    decks = data.get("decks") if isinstance(data, dict) else None
    if not isinstance(decks, list):
        return {"errors": ["root: decks must be a list"], "warnings": [], "stats": {}}
    seen_decks: set[str] = set()
    global_memberships: dict[str, list[str]] = {}
    counts = {}
    for deck in decks:
        deck_id = str(deck.get("deck_id") or "")
        if not deck_id or deck_id in seen_decks:
            errors.append(f"{deck_id or 'deck'}: duplicate or empty deck_id")
        seen_decks.add(deck_id)
        seen_refs: set[str] = set()
        passages = deck.get("passages") or []
        for passage in passages:
            reference = str(passage.get("reference") or "").strip()
            prefix = f"{deck_id}/{reference or 'passage'}:"
            parts = _reference_parts(reference)
            if not parts:
                errors.append(f"{prefix} invalid reference")
                continue
            if passage.get("book") != parts[0]:
                errors.append(f"{prefix} book mismatch {passage.get('book')!r}")
            if passage.get("testament") not in {"OT", "NT"}:
                errors.append(f"{prefix} invalid testament {passage.get('testament')!r}")
            key = reference.casefold()
            if key in seen_refs:
                errors.append(f"{prefix} duplicate reference within deck")
            seen_refs.add(key)
            global_memberships.setdefault(key, []).append(deck_id)
            formats = set(passage.get("format_eligibility") or [])
            if not formats or formats - {"finish", "fill_blank", "reference", "oral"}:
                errors.append(f"{prefix} invalid format_eligibility")
            difficulties = passage.get("difficulty_by_format") or {}
            if formats - set(difficulties):
                errors.append(f"{prefix} missing difficulty_by_format values")
            if passage.get("status") not in {"published", "review", "retired"}:
                errors.append(f"{prefix} invalid status")
        counts[deck_id] = len(seen_refs)
        if len(seen_refs) < 20:
            warnings.append(f"depth: {deck_id} has only {len(seen_refs)} unique references")
    reused = {reference: deck_ids for reference, deck_ids in global_memberships.items() if len(deck_ids) > 1}
    return {
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "decks": len(decks),
            "memberships": sum(counts.values()),
            "unique_references": len(global_memberships),
            "deck_counts": counts,
            "cross_deck_duplicate_references": len(reused),
        },
    }


def strong_seed(*parts: object) -> int:
    material = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return int.from_bytes(hashlib.sha256(material).digest(), "big")


def _balanced_mode_order(modes: tuple[str, ...], count: int, rng: random.Random) -> list[str]:
    if len(modes) == 1:
        return [modes[0]] * count
    remaining = {mode: count // len(modes) for mode in modes}
    for mode in rng.sample(list(modes), count % len(modes)):
        remaining[mode] += 1
    order: list[str] = []
    while len(order) < count:
        choices = [mode for mode, left in remaining.items() if left and not (len(order) >= 2 and order[-1] == order[-2] == mode)]
        if not choices:
            choices = [mode for mode, left in remaining.items() if left]
        max_left = max(remaining[mode] for mode in choices)
        weighted = [mode for mode in choices if remaining[mode] >= max_left - 1]
        mode = rng.choice(weighted)
        order.append(mode)
        remaining[mode] -= 1
    return order


def build_family_rounds(
    code: str,
    count: int,
    *,
    categories: set[str],
    difficulty_values: set[str],
    game_mode: str,
    free_sampler: bool,
    recent_prompt_ids: set[str] | None = None,
) -> tuple[list[dict], dict]:
    records = family_prompts()
    sampler = free_sampler_ids()
    records = [
        item for item in records
        if item["category"] in categories
        and item["difficulty"] in difficulty_values
        and (not free_sampler or item["id"] in sampler)
    ]
    requested_modes = ("act", "draw", "clue", "guess") if game_mode == "mixed" else (game_mode,)
    eligible = [item for item in records if set(item["modes"]) & set(requested_modes)]
    unique_answers = {canonical_answer(item["answer"]) for item in eligible}
    diagnostics = {
        "eligible_pool_size": len(eligible),
        "unique_answer_capacity": len(unique_answers),
        "story_group_capacity": len({item["story_group"] for item in eligible}),
        "relaxations_used": [],
    }
    if len(unique_answers) < count:
        raise RoundBuildError(
            f"This selection has only {len(unique_answers)} unique answers for {count} rounds. Select more categories, another difficulty, or fewer rounds.",
            diagnostics,
        )
    rng = random.Random(strong_seed("family-game-night", code, count, game_mode, ",".join(sorted(categories)), ",".join(sorted(difficulty_values)), free_sampler))
    mode_order = _balanced_mode_order(requested_modes, count, rng)
    used_ids: set[str] = set()
    used_answers: set[str] = set()
    used_stories: set[str] = set()
    recent = recent_prompt_ids or set()
    rounds: list[dict] = []
    for index, mode in enumerate(mode_order):
        candidates = [item for item in records if mode in item["modes"] and item["id"] not in used_ids and canonical_answer(item["answer"]) not in used_answers]
        if not candidates:
            raise RoundBuildError(f"There are not enough unique {mode} answers for this game. Select more categories or another difficulty.", diagnostics)
        strict = [item for item in candidates if item["story_group"] not in used_stories and item["id"] not in recent]
        if not strict:
            strict = [item for item in candidates if item["story_group"] not in used_stories]
            if strict and "recent_history" not in diagnostics["relaxations_used"]:
                diagnostics["relaxations_used"].append("recent_history")
        if not strict:
            strict = candidates
            if "story_group" not in diagnostics["relaxations_used"]:
                diagnostics["relaxations_used"].append("story_group")
        category_counts = {category: sum(round_["category"] == category for round_ in rounds) for category in categories}
        testament_counts = {testament: sum(round_["testament"] == testament for round_ in rounds) for testament in ("OT", "NT", "general")}
        familiarity_counts = {value: sum(round_["familiarity"] == value for round_ in rounds) for value in VALID_FAMILIARITY}
        rng.shuffle(strict)
        strict.sort(key=lambda item: (category_counts[item["category"]], testament_counts[item["testament"]], familiarity_counts[item["familiarity"]]))
        prompt = strict[0]
        answer_key = canonical_answer(prompt["answer"])
        used_ids.add(prompt["id"])
        used_answers.add(answer_key)
        used_stories.add(prompt["story_group"])
        instruction = prompt["instructions"].get(mode, "")
        rounds.append({
            "id": f"{prompt['id']}-{index}", "prompt_id": prompt["id"], "answer": prompt["answer"],
            "mode": mode, "theme": prompt["category_label"], "category": prompt["category"],
            "testament": prompt["testament"], "familiarity": prompt["familiarity"],
            "instruction": instruction,
            "forbidden_words": prompt.get("forbidden_words", []) if mode == "clue" else [],
            "clues": prompt.get("progressive_clues", []) if mode == "guess" else [],
            "choices": [],
        })
    return rounds, diagnostics
