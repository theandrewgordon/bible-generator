"""Optional AI planning and quality review for Family Bible Bee games."""

from __future__ import annotations

import json
import os
import re
from copy import deepcopy


PROVIDERS = {
    "openai": {"name": "OpenAI", "key": "OPENAI_API_KEY"},
    "claude": {"name": "Claude", "key": "ANTHROPIC_API_KEY"},
}


def _timeout_seconds() -> float:
    try:
        value = float(os.getenv("BIBLE_BEE_AI_TIMEOUT_SECONDS", "20"))
    except ValueError:
        value = 20
    return max(5, min(value, 45))


class BibleBeeAIError(ValueError):
    """A friendly error raised when an AI game cannot be prepared safely."""


def _provider_order(preferred: str | None = None) -> list[str]:
    configured = [
        item.strip().lower()
        for item in os.getenv("BIBLE_BEE_PROVIDER_ORDER", "openai,claude").split(",")
        if item.strip().lower() in PROVIDERS
    ]
    if preferred in configured:
        configured.remove(preferred)
        configured.insert(0, preferred)
    return [provider for provider in configured if os.getenv(PROVIDERS[provider]["key"])]


def _json_from_text(text: str) -> dict:
    clean = (text or "").strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.I)
        clean = re.sub(r"\s*```$", "", clean)
    try:
        result = json.loads(clean)
    except (TypeError, json.JSONDecodeError) as exc:
        raise BibleBeeAIError("The AI returned an unreadable game plan. Please try again.") from exc
    if not isinstance(result, dict):
        raise BibleBeeAIError("The AI returned an incomplete game plan. Please try again.")
    return result


def _ask_openai(system: str, prompt: str) -> dict:
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        timeout=_timeout_seconds(),
        max_retries=0,
    )
    response = client.responses.create(
        model=os.getenv("BIBLE_BEE_OPENAI_MODEL", "gpt-5.5"),
        reasoning={"effort": "low"},
        text={"verbosity": "low"},
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return _json_from_text(response.output_text)


def _ask_claude(system: str, prompt: str) -> dict:
    import anthropic

    client = anthropic.Anthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        timeout=_timeout_seconds(),
        max_retries=0,
    )
    response = client.messages.create(
        model=os.getenv("BIBLE_BEE_CLAUDE_MODEL", "claude-sonnet-4-6"),
        max_tokens=2500,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
    return _json_from_text(text)


def _ask(provider: str, system: str, prompt: str) -> dict:
    config = PROVIDERS.get(provider)
    if not config:
        raise BibleBeeAIError("The custom game service is not configured correctly.")
    if not os.getenv(config["key"]):
        raise BibleBeeAIError("The custom game service is not configured on this server yet.")
    try:
        return _ask_openai(system, prompt) if provider == "openai" else _ask_claude(system, prompt)
    except BibleBeeAIError:
        raise
    except Exception as exc:
        raise BibleBeeAIError("The custom game could not be prepared right now. Please try again.") from exc


def _ask_available(system: str, prompt: str, preferred: str | None = None) -> tuple[dict, str]:
    providers = _provider_order(preferred)
    if not providers:
        raise BibleBeeAIError("Custom themed games are not configured on this server yet.")
    for provider in providers:
        try:
            return _ask(provider, system, prompt), provider
        except BibleBeeAIError:
            continue
    raise BibleBeeAIError("The custom game could not be prepared right now. Please try again.")


def create_one_off_plan(theme: str, age_group: str, round_count: int) -> dict:
    theme = " ".join((theme or "").split())[:120]
    if len(theme) < 3:
        raise BibleBeeAIError("Describe a theme for the one-off game.")
    system = (
        "You plan warm, doctrinally responsible Christian family Scripture-memory games. "
        "Return JSON only. Never quote, paraphrase, or invent Bible text. Select established "
        "canonical Bible references only. Avoid graphic or frightening passages for children."
    )
    prompt = json.dumps(
        {
            "task": "Create a one-off Family Bible Bee reference plan.",
            "theme": theme,
            "age_group": age_group,
            "reference_count": max(4, round_count),
            "success_criteria": [
                "References clearly fit the requested theme.",
                "Use a mix of Old and New Testament when naturally appropriate.",
                "Keep verse ranges short enough for family memory practice.",
                "Return exactly: title, description, references.",
                "references must be an array of strings such as John 3:16 or Psalm 23:1-3.",
            ],
        }
    )
    plan, provider = _ask_available(system, prompt)
    references = []
    for reference in plan.get("references", []):
        reference = " ".join(str(reference).split())
        if re.fullmatch(r"[1-3]?\s?[A-Za-z][A-Za-z ]+\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?", reference):
            if reference.casefold() not in {item.casefold() for item in references}:
                references.append(reference)
    required_references = max(4, min(round_count, 10))
    if len(references) < required_references:
        raise BibleBeeAIError("The AI did not return enough usable Bible references. Please try again.")
    return {
        "title": " ".join(str(plan.get("title") or theme).split())[:60],
        "description": " ".join(str(plan.get("description") or "").split())[:180],
        "references": references[:required_references],
        "_provider": provider,
    }


def validate_questions(
    questions: list[dict],
    preferred_provider: str | None = None,
) -> tuple[list[dict], dict]:
    """Ask AI to improve distractors; never permit it to alter authoritative answers."""
    reviewable = [
        {
            "id": question["id"],
            "label": question["label"],
            "prompt": question["prompt"],
            "choices": question["choices"],
            "correct_answer": (
                question["choices"][question["correct"]]
                if question.get("correct") is not None and question.get("choices")
                else None
            ),
        }
        for question in questions
        if question.get("choices")
    ]
    if not reviewable:
        return questions, {"provider": preferred_provider, "reviewed": 0, "improved": 0}
    system = (
        "You quality-check a respectful Christian family Bible game. Return JSON only. "
        "Do not change prompts or correct answers. Improve only wrong answer choices. Wrong choices "
        "must be grammatical, plausible, similar in length and style, and unambiguously incorrect. "
        "Do not add jokes, fake quotations presented as Scripture, or theological claims."
    )
    result, provider = _ask_available(
        system,
        json.dumps(
            {
                "task": "Validate and, where needed, repair multiple-choice alternatives.",
                "questions": reviewable,
                "output": {
                    "questions": [
                        {
                            "id": "unchanged question id",
                            "choices": ["same number of choices, including exact correct_answer"],
                        }
                    ]
                },
            }
        ),
        preferred=preferred_provider,
    )
    suggestions = {
        str(item.get("id")): item.get("choices")
        for item in result.get("questions", [])
        if isinstance(item, dict) and isinstance(item.get("choices"), list)
    }
    validated = deepcopy(questions)
    improved = 0
    for question in validated:
        choices = suggestions.get(question["id"])
        if not choices or len(choices) != len(question.get("choices", [])):
            continue
        choices = [" ".join(str(choice).split())[:240] for choice in choices]
        correct_answer = question["choices"][question["correct"]]
        if (
            choices.count(correct_answer) != 1
            or len({choice.casefold() for choice in choices}) != len(choices)
            or any(not choice for choice in choices)
        ):
            continue
        if choices != question["choices"]:
            question["choices"] = choices
            question["correct"] = choices.index(correct_answer)
            improved += 1
    return validated, {"provider": provider, "reviewed": len(reviewable), "improved": improved}
