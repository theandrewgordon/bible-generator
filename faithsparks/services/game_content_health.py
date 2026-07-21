"""Deterministic, privacy-safe editorial health reports for both game products."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from faithsparks.services.game_content import (
    VALID_CATEGORIES,
    VALID_MODES,
    build_family_rounds,
    canonical_answer,
    family_capacity_matrix,
    family_prompts,
    free_sampler_ids,
    load_bible_bee_content,
    load_family_game_content,
    validate_bible_bee_content,
    validate_family_content,
)


REPORT_ROOT = Path(__file__).resolve().parents[2] / "reports"
FGN_REPORT_PATH = REPORT_ROOT / "family_game_night_content_health.json"
BEE_REPORT_PATH = REPORT_ROOT / "bible_bee_deck_health.json"
REPORT_VERSION = 1


def _normalized_tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.casefold())


def _contains_phrase(text: str, phrase: str) -> bool:
    normalized_text = " ".join(_normalized_tokens(text))
    normalized_phrase = " ".join(_normalized_tokens(phrase))
    return bool(normalized_phrase and re.search(rf"\b{re.escape(normalized_phrase)}\b", normalized_text))


def _mode_quality(record: dict, mode: str) -> dict:
    instruction = str((record.get("instructions") or {}).get(mode) or "")
    answer = str(record.get("answer") or "")
    issues = []
    score = 100
    if _contains_phrase(instruction, answer):
        issues.append("instruction repeats the canonical answer")
        score -= 45
    if len(instruction.split()) < 5:
        issues.append("instruction has too little playable direction")
        score -= 25
    if mode == "act":
        physical = {"act", "walk", "lift", "carry", "build", "search", "open", "raise", "kneel", "run", "hold", "gather", "pour", "hide", "point", "march", "wash", "write", "sing", "pray", "share", "serve", "wait", "reach", "step", "look", "show", "draw"}
        if not physical.intersection(_normalized_tokens(instruction)):
            issues.append("acting direction lacks a clear physical action")
            score -= 25
    elif mode == "draw":
        visual = {"draw", "boat", "water", "person", "people", "animal", "star", "tree", "road", "house", "hands", "book", "bread", "fish", "light", "table", "mountain", "wall", "crown", "river", "jar", "basket", "fire", "cloud", "gate", "roof", "lamp", "pages"}
        if not visual.intersection(_normalized_tokens(instruction)):
            issues.append("drawing direction lacks a recognizable visual anchor")
            score -= 25
    elif mode == "clue":
        forbidden = record.get("forbidden_words") or []
        if len(forbidden) < 3:
            issues.append("fewer than three meaningful forbidden words")
            score -= 50
        elif len(forbidden) < 4:
            issues.append("only three forbidden words; editorial expansion recommended")
            score -= 10
    elif mode == "guess":
        clues = record.get("progressive_clues") or []
        if len(clues) < 4:
            issues.append("fewer than four progressive clues")
            score -= 60
        terms = [answer, *(record.get("answer_aliases") or [])]
        for index, clue in enumerate(clues):
            if any(_contains_phrase(clue, term) for term in terms):
                issues.append(f"clue {index + 1} repeats an accepted answer")
                score -= 45
    classification = "strong" if score >= 90 else "workable" if score >= 70 else "weak" if score >= 50 else "human_review_required"
    return {"score": max(0, score), "classification": classification, "issues": issues}


def _family_editorial_findings(records: list[dict]) -> tuple[list[dict], list[dict], dict]:
    objective = []
    human = []
    quality_counts = {mode: Counter() for mode in VALID_MODES}
    for record in records:
        prompt_id = record["id"]
        answer_terms = [record["answer"], *(record.get("answer_aliases") or [])]
        for mode in record["modes"]:
            quality = _mode_quality(record, mode)
            quality_counts[mode][quality["classification"]] += 1
            for issue in quality["issues"]:
                severity = "error" if "repeats" in issue or "fewer than" in issue else "warning"
                objective.append({"id": prompt_id, "mode": mode, "severity": severity, "concern": issue})
        if "guess" in record["modes"]:
            clues = record.get("progressive_clues") or []
            normalized = [" ".join(_normalized_tokens(clue)) for clue in clues]
            for left in range(len(normalized)):
                for right in range(left + 1, len(normalized)):
                    a, b = set(normalized[left].split()), set(normalized[right].split())
                    overlap = len(a & b) / max(1, len(a | b))
                    if overlap >= 0.8:
                        objective.append({"id": prompt_id, "mode": "guess", "severity": "warning", "concern": f"clues {left + 1} and {right + 1} are highly similar"})
            if clues and any(_contains_phrase(clues[0], alias) for alias in answer_terms):
                objective.append({"id": prompt_id, "mode": "guess", "severity": "error", "concern": "first clue leaks an accepted answer"})
        if record.get("review_status") == "human_review":
            human.append({
                "id": prompt_id,
                "current": record["answer"],
                "concern": "Family-play sensitivity needs a person to confirm age and wording.",
                "suggested_options": "Keep for Challenge, soften the direction, or remove the mode eligibility.",
                "reason": ", ".join(record.get("sensitivity_flags") or ["editorial judgment"]),
                "severity": "medium",
                "launch_blocking": False,
            })
    return objective, human, {mode: dict(counts) for mode, counts in quality_counts.items()}


def _sampler_simulation(seed_count: int) -> dict:
    records = {record["id"]: record for record in family_prompts()}
    prompt_frequency = Counter()
    modes = Counter()
    categories = Counter()
    testaments = Counter()
    difficulties = Counter()
    sequences = set()
    answer_repeats = story_repeats = paid_leaks = games_with_relaxation = 0
    sampler = free_sampler_ids()
    relaxation_counts = Counter()
    for index in range(seed_count):
        rounds, diagnostics = build_family_rounds(
            f"FREE-HEALTH-{index}", 10,
            categories=set(VALID_CATEGORIES), difficulty_values={"easy", "medium"},
            game_mode="mixed", free_sampler=True,
        )
        sequences.add(tuple(item["prompt_id"] for item in rounds))
        answers = [canonical_answer(item["answer"]) for item in rounds]
        stories = [records[item["prompt_id"]]["story_group"] for item in rounds]
        answer_repeats += len(answers) - len(set(answers))
        story_repeats += len(stories) - len(set(stories))
        paid_leaks += sum(item["prompt_id"] not in sampler for item in rounds)
        if diagnostics["relaxations_used"]:
            games_with_relaxation += 1
            relaxation_counts.update(diagnostics["relaxations_used"])
        for item in rounds:
            record = records[item["prompt_id"]]
            prompt_frequency[item["prompt_id"]] += 1
            modes[item["mode"]] += 1
            categories[record["category"]] += 1
            testaments[record["testament"]] += 1
            difficulties[record["difficulty"]] += 1
    frequencies = sorted(prompt_frequency.items(), key=lambda item: (-item[1], item[0]))
    return {
        "seeds": seed_count,
        "unique_sequences": len(sequences),
        "answer_repeats": answer_repeats,
        "story_group_repeats": story_repeats,
        "paid_content_leaks": paid_leaks,
        "mode_distribution": dict(modes),
        "category_distribution": dict(categories),
        "testament_distribution": dict(testaments),
        "difficulty_distribution": dict(difficulties),
        "most_frequent_prompts": frequencies[:10],
        "least_frequent_prompts": sorted(prompt_frequency.items(), key=lambda item: (item[1], item[0]))[:10],
        "relaxation_counts": dict(relaxation_counts),
        "games_requiring_relaxation": games_with_relaxation,
        "percent_requiring_relaxation": round(games_with_relaxation * 100 / max(1, seed_count), 2),
    }


def family_game_night_health(*, sampler_seeds: int = 5000) -> dict:
    data = load_family_game_content()
    validation = validate_family_content(data)
    records = family_prompts()
    objective, human, quality = _family_editorial_findings(records)
    counts = {
        "published_records": len(records),
        "unique_canonical_answers": len({canonical_answer(record["answer"]) for record in records}),
        "by_mode": {mode: len({canonical_answer(record["answer"]) for record in records if mode in record["modes"]}) for mode in sorted(VALID_MODES)},
        "by_category": dict(Counter(record["category"] for record in records)),
        "by_difficulty": dict(Counter(record["difficulty"] for record in records)),
        "by_testament": dict(Counter(record["testament"] for record in records)),
        "by_familiarity": dict(Counter(record["familiarity"] for record in records)),
        "by_age_floor": dict(Counter(str(record["age_floor"]) for record in records)),
        "sensitivity_flags": dict(Counter(flag for record in records for flag in record.get("sensitivity_flags", []))),
        "human_review": len(human),
        "editorial_version": max(int(record.get("editorial_version", 1)) for record in records),
    }
    capacity = family_capacity_matrix()
    return {
        "report_version": REPORT_VERSION,
        "generated_on": date.today().isoformat(),
        "source_hash": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        "validation": {
            "structural_errors": validation["errors"],
            "editorial_errors": [item for item in objective if item["severity"] == "error"],
            "depth_errors": [],
            "warnings": [item for item in objective if item["severity"] == "warning"],
            "human_review_notes": human,
        },
        "counts": counts,
        "mode_quality": quality,
        "free_sampler": {
            "ids": len(free_sampler_ids()),
            "unique_answers": len({canonical_answer(record["answer"]) for record in records if record["id"] in free_sampler_ids()}),
            **_sampler_simulation(sampler_seeds),
        },
        "capacity": {
            "combinations_checked": len(capacity),
            "supports_20": sum(value >= 20 for value in capacity.values()),
            "supports_15": sum(value >= 15 for value in capacity.values()),
            "supports_10": sum(value >= 10 for value in capacity.values()),
            "unavailable": sum(value == 0 for value in capacity.values()),
            "matrix": capacity,
        },
    }


def _reference_span(reference: str) -> tuple[str, int, int, int, int] | None:
    match = re.fullmatch(r"(.+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?", reference)
    if not match:
        return None
    chapter = int(match.group(2))
    return match.group(1), chapter, int(match.group(3)), int(match.group(4) or chapter), int(match.group(5) or match.group(3))


def bible_bee_health() -> dict:
    from faithsparks.services.bible_bee_content import DECKS, RANDOM_DECK_ID, references_overlap

    normalized = load_bible_bee_content()
    validation = validate_bible_bee_content(normalized)
    memberships = defaultdict(list)
    format_difficulty = {mode: Counter() for mode in ("finish", "fill_blank", "reference", "oral")}
    human_by_reference = {}
    deck_reports = {}
    testament_counts = Counter()
    division_counts = Counter()
    for deck_id, deck in DECKS.items():
        if deck_id == RANDOM_DECK_ID:
            continue
        passages = deck["passages"]
        references = [item["reference"] for item in passages]
        overlaps = []
        for left in range(len(passages)):
            for right in range(left + 1, len(passages)):
                if references_overlap(references[left], references[right]):
                    overlaps.append([references[left], references[right]])
        for passage in passages:
            memberships[passage["reference"].casefold()].append(deck_id)
            testament_counts[passage.get("testament") or "unknown"] += 1
            division_counts[passage.get("division") or "unknown"] += 1
            for mode, value in (passage.get("difficulty_by_format") or {}).items():
                if mode in format_difficulty:
                    format_difficulty[mode][value] += 1
            if passage.get("review_status") == "human_review":
                human_by_reference.setdefault(passage["reference"].casefold(), {
                    "reference": passage["reference"],
                    "concern": "Long or context-sensitive range needs human review for isolated game use.",
                    "suggested_options": "Keep for advanced formats, shorten at a natural boundary, or retain with context guidance.",
                    "reason": passage.get("ambiguity_risk", "context review"),
                    "severity": "medium",
                    "launch_blocking": False,
                })
        deck_reports[deck_id] = {
            "title": deck["title"],
            "total": len(passages),
            "unique": len(set(reference.casefold() for reference in references)),
            "testaments": dict(Counter(item.get("testament") or "unknown" for item in passages)),
            "books": dict(Counter(item.get("book") or "unknown" for item in passages)),
            "divisions": dict(Counter(item.get("division") or "unknown" for item in passages)),
            "familiarity": dict(Counter(item.get("familiarity") or "unknown" for item in passages)),
            "format_eligibility": dict(Counter(mode for item in passages for mode in item.get("format_eligibility", []))),
            "overlaps": overlaps,
            "supports_rounds": {str(count): len(passages) >= count and len(set(references)) >= count for count in (10, 15, 20)},
            "human_review": sum(item.get("review_status") == "human_review" for item in passages),
        }
    shared = {reference: decks for reference, decks in memberships.items() if len(decks) > 1}
    return {
        "report_version": REPORT_VERSION,
        "generated_on": date.today().isoformat(),
        "source_hash": hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest(),
        "validation": {
            "structural_errors": validation["errors"],
            "editorial_errors": [],
            "depth_errors": [],
            "warnings": [f"{reference} appears in {len(decks)} decks" for reference, decks in shared.items() if len(decks) >= 4],
            "human_review_notes": sorted(human_by_reference.values(), key=lambda item: item["reference"]),
        },
        "counts": {
            "named_decks": len(deck_reports),
            "memberships": sum(item["total"] for item in deck_reports.values()),
            "unique_references": len(memberships),
            "testaments": dict(testament_counts),
            "divisions": dict(division_counts),
            "difficulty_by_format": {mode: dict(values) for mode, values in format_difficulty.items()},
            "shared_references": len(shared),
            "human_review": len(human_by_reference),
        },
        "decks": deck_reports,
        "shared_references": shared,
    }


def load_precomputed_health() -> dict:
    try:
        return {
            "family_game_night": json.loads(FGN_REPORT_PATH.read_text(encoding="utf-8")),
            "bible_bee": json.loads(BEE_REPORT_PATH.read_text(encoding="utf-8")),
            "available": True,
        }
    except (OSError, ValueError, TypeError):
        return {"family_game_night": {}, "bible_bee": {}, "available": False}


def render_family_markdown(report: dict) -> str:
    counts, validation, sampler = report["counts"], report["validation"], report["free_sampler"]
    lines = [
        "# Family Game Night editorial review", "", f"Generated: {report['generated_on']}", "",
        "## Launch status", "",
        f"- Published records: {counts['published_records']}",
        f"- Unique canonical answers: {counts['unique_canonical_answers']}",
        f"- Objective editorial errors: {len(validation['editorial_errors'])}",
        f"- Human-review items: {len(validation['human_review_notes'])}",
        f"- Launch-blocking items: {sum(item['launch_blocking'] for item in validation['human_review_notes'])}", "",
        "## Mode depth", "", "| Mode | Unique answers |", "|---|---:|",
    ]
    lines.extend(f"| {mode} | {count} |" for mode, count in counts["by_mode"].items())
    lines += ["", "## Free sampler", "", f"- IDs / unique answers: {sampler['ids']} / {sampler['unique_answers']}", f"- Seeds: {sampler['seeds']}", f"- Unique sequences: {sampler['unique_sequences']}", f"- Answer repeats: {sampler['answer_repeats']}", f"- Story-group repeats: {sampler['story_group_repeats']}", f"- Paid leaks: {sampler['paid_content_leaks']}", f"- Games requiring relaxation: {sampler['percent_requiring_relaxation']}%", "", "## Human review queue", "", "| ID | Concern | Severity | Blocks launch |", "|---|---|---|---|" ]
    lines.extend(f"| {item['id']} | {item['concern']} ({item['reason']}) | {item['severity']} | {'Yes' if item['launch_blocking'] else 'No'} |" for item in validation["human_review_notes"])
    lines += ["", "Objective heuristics evaluate leakage and mode playability; a real family playtest is still required to judge fun and child-level difficulty.", ""]
    return "\n".join(lines)


def render_bible_markdown(report: dict) -> str:
    counts, validation = report["counts"], report["validation"]
    lines = ["# Family Bible Bee editorial review", "", f"Generated: {report['generated_on']}", "", "## Launch status", "", f"- Named decks: {counts['named_decks']}", f"- Passage memberships: {counts['memberships']}", f"- Globally unique references: {counts['unique_references']}", f"- Objective editorial errors: {len(validation['editorial_errors'])}", f"- Human-review references: {len(validation['human_review_notes'])}", "", "## Deck health", "", "| Deck | Passages | Unique | OT / NT | Overlaps | Human review | 20 rounds |", "|---|---:|---:|---:|---:|---:|---|" ]
    for deck_id, deck in report["decks"].items():
        lines.append(f"| {deck['title']} | {deck['total']} | {deck['unique']} | {deck['testaments'].get('OT', 0)} / {deck['testaments'].get('NT', 0)} | {len(deck['overlaps'])} | {deck['human_review']} | {'Yes' if deck['supports_rounds']['20'] else 'No'} |")
    lines += ["", "## Human review queue", "", "| Reference | Concern | Suggested options | Blocks launch |", "|---|---|---|---|" ]
    lines.extend(f"| {item['reference']} | {item['concern']} | {item['suggested_options']} | {'Yes' if item['launch_blocking'] else 'No'} |" for item in validation["human_review_notes"])
    lines += ["", "Reports contain references and aggregate metadata only; no full ESV or NLT text is stored.", ""]
    return "\n".join(lines)
