import re

import pytest

from faithsparks.services import bible_bee_content, game_content, game_content_health


ALL_CATEGORIES = set(game_content.VALID_CATEGORIES)


def _family(code, count=20, *, free=False, mode="mixed", difficulties=None, categories=None):
    return game_content.build_family_rounds(
        code,
        count,
        categories=categories or ALL_CATEGORIES,
        difficulty_values=difficulties or {"easy", "medium", "hard"},
        game_mode=mode,
        free_sampler=free,
    )


def test_normalized_content_has_no_structural_errors_and_meets_beta_depth():
    family = game_content.validate_family_content(game_content.load_family_game_content())
    bee = game_content.validate_bible_bee_content(game_content.load_bible_bee_content())

    assert family["errors"] == []
    assert bee["errors"] == []
    assert family["stats"]["free_sampler_ids"] >= 32
    assert family["stats"]["free_unique_answers"] >= 28
    assert all(value["unique_answers"] >= 80 for value in family["stats"]["mode_depth"].values())
    assert set(bee["stats"]["deck_counts"].values()) == {28}


def test_content_health_has_no_blocking_findings_or_copyrighted_passage_text():
    family = game_content_health.family_game_night_health(sampler_seeds=100)
    bee = game_content_health.bible_bee_health()
    for report in (family, bee):
        assert report["validation"]["structural_errors"] == []
        assert report["validation"]["editorial_errors"] == []
        assert report["validation"]["depth_errors"] == []
        assert "answer_text" not in str(report)
    assert family["free_sampler"]["paid_content_leaks"] == 0
    assert family["free_sampler"]["answer_repeats"] == 0


def test_family_builder_is_stable_unique_and_story_diverse():
    first, diagnostics = _family("R6PY")
    second, _ = _family("R6PY")

    assert first == second
    assert len({item["prompt_id"] for item in first}) == 20
    assert len({game_content.canonical_answer(item["answer"]) for item in first}) == 20
    prompt_by_id = {item["id"]: item for item in game_content.family_prompts()}
    assert len({prompt_by_id[item["prompt_id"]]["story_group"] for item in first}) == 20
    assert "story_group" not in diagnostics["relaxations_used"]


def test_family_mixed_mode_order_is_varied_and_never_has_three_in_a_row():
    sequences = set()
    for index in range(1000):
        rounds, _ = _family(f"ROOM-{index}", count=20)
        modes = tuple(item["mode"] for item in rounds)
        sequences.add(modes)
        assert all(not (modes[position] == modes[position + 1] == modes[position + 2]) for position in range(18))
    assert len(sequences) > 900


def test_free_sampler_is_isolated_and_repetition_free_across_five_thousand_seeds():
    sampler = game_content.free_sampler_ids()
    sequences = set()
    for index in range(5000):
        rounds, _ = _family(f"FREE-{index}", count=10, free=True, difficulties={"easy", "medium"})
        assert {item["prompt_id"] for item in rounds} <= sampler
        assert len({game_content.canonical_answer(item["answer"]) for item in rounds}) == 10
        sequences.add(tuple(item["prompt_id"] for item in rounds))
    assert len(sequences) > 4950


def test_paid_mixed_games_are_unique_across_ten_thousand_seeds():
    sequences = set()
    for index in range(10000):
        rounds, _ = _family(f"PAID-{index}", count=20)
        assert len({item["prompt_id"] for item in rounds}) == 20
        assert len({game_content.canonical_answer(item["answer"]) for item in rounds}) == 20
        modes = [item["mode"] for item in rounds]
        assert all(not (modes[position] == modes[position + 1] == modes[position + 2]) for position in range(18))
        sequences.add(tuple(item["prompt_id"] for item in rounds))
    assert len(sequences) > 9950


def test_family_builder_returns_helpful_error_for_shallow_filter():
    with pytest.raises(game_content.RoundBuildError, match="unique answers") as exc:
        _family("SHALLOW", count=100, mode="guess", categories={"parables"}, difficulties={"hard"})
    assert exc.value.diagnostics["unique_answer_capacity"] < 100


def _passages(count=20):
    return [
        {
            "id": f"passage-{index}",
            "reference": f"Psalm {index + 1}:1",
            "text": f"The Lord gives wisdom and hope number {index} to every faithful heart.",
            "keywords": ["wisdom", "hope", "heart"],
            "blanks": ["wisdom", "hope"],
        }
        for index in range(count)
    ]


def test_bible_bee_questions_are_stable_unique_and_format_order_varies():
    passages = _passages()
    first = bible_bee_content.build_questions(passages, "classic_mix", 20, "ABCD")
    second = bible_bee_content.build_questions(passages, "classic_mix", 20, "ABCD")
    assert first == second
    assert len({item["passage_id"] for item in first}) == 20

    sequences = set()
    for index in range(5000):
        questions = bible_bee_content.build_questions(passages, "classic_mix", 20, f"BEE-{index}")
        modes = tuple(item["mode"] for item in questions)
        sequences.add(modes)
        assert all(not (modes[position] == modes[position + 1] == modes[position + 2]) for position in range(18))
    assert len(sequences) > 4900


def test_bible_bee_refuses_modulo_repeats_and_overlapping_ranges():
    with pytest.raises(ValueError, match="only 12 unique"):
        bible_bee_content.build_questions(_passages(12), "classic_mix", 15, "SHALLOW")

    overlapping = _passages(20)
    overlapping[-1] = {
        **overlapping[-1],
        "id": "overlap",
        "reference": "Psalm 1:1-3",
    }
    with pytest.raises(ValueError, match="non-overlapping passages"):
        bible_bee_content.build_questions(overlapping, "classic_mix", 20, "OVERLAP")


def test_every_named_bible_bee_deck_reaches_forty_unique_references():
    for deck_id, deck in bible_bee_content.DECKS.items():
        if deck_id == bible_bee_content.RANDOM_DECK_ID:
            continue
        references = [item["reference"].casefold() for item in deck["passages"]]
        assert len(references) == 40, deck_id
        assert len(set(references)) == 40, deck_id


def test_recent_history_is_bounded_expires_and_tolerates_corruption():
    now = 2_000_000.0
    assert game_content.read_recent_history(None, now=now) == []
    assert game_content.read_recent_history("not-a-list", now=now) == []
    assert game_content.read_recent_history({"items": ["safe-id"], "updated_at": "bad"}, now=now) == []
    expired = {"items": ["old-id"], "updated_at": now - game_content.HISTORY_TTL_SECONDS - 1}
    assert game_content.read_recent_history(expired, now=now) == []

    history = game_content.updated_recent_history(None, [f"prompt-{index}" for index in range(150)], now=now)
    assert len(history["items"]) == game_content.HISTORY_LIMIT
    assert history["items"][0] == "prompt-50"
    assert game_content.read_recent_history(history, now=now) == history["items"]


def test_recent_family_history_changes_output_without_breaking_stability_or_uniqueness():
    baseline, _ = _family("HISTORY", count=20)
    recent = {item["prompt_id"] for item in baseline}
    replay, diagnostics = game_content.build_family_rounds(
        "HISTORY", 20, categories=ALL_CATEGORIES,
        difficulty_values={"easy", "medium", "hard"}, game_mode="mixed",
        free_sampler=False, recent_prompt_ids=recent,
    )
    replay_again, _ = game_content.build_family_rounds(
        "HISTORY", 20, categories=ALL_CATEGORIES,
        difficulty_values={"easy", "medium", "hard"}, game_mode="mixed",
        free_sampler=False, recent_prompt_ids=recent,
    )
    assert replay == replay_again
    assert not ({item["prompt_id"] for item in replay} & recent)
    assert len({game_content.canonical_answer(item["answer"]) for item in replay}) == 20
    assert diagnostics["relaxations_used"] == []


def test_bible_bee_content_difficulty_changes_selected_passage_preference():
    passages = _passages(20)
    for index, passage in enumerate(passages):
        tier = "easy" if index < 10 else "expert"
        passage["difficulty_by_format"] = {mode: tier for mode in ("finish", "fill_blank", "reference", "oral")}
        passage["format_eligibility"] = ["finish", "fill_blank", "reference", "oral"]
    easy = bible_bee_content.build_questions(passages, "classic_mix", 10, "DIFFICULTY", difficulty="little_sparks")
    expert = bible_bee_content.build_questions(passages, "classic_mix", 10, "DIFFICULTY", difficulty="expert")
    assert {item["content_difficulty"] for item in easy} == {"easy"}
    assert {item["content_difficulty"] for item in expert} == {"expert"}


@pytest.mark.parametrize("translation", ["KJV", "ESV", "NLT"])
def test_translation_shaped_synthetic_questions_have_one_valid_answer(translation):
    passages = _passages(20)
    for passage in passages:
        passage["version"] = translation
    for style in bible_bee_content.GAME_STYLES:
        questions = bible_bee_content.build_questions(passages, style, 10, f"{translation}-{style}")
        assert len({item["passage_id"] for item in questions}) == 10
        for question in questions:
            if question["mode"] == "oral":
                assert question["choices"] == [] and question["correct"] is None
            else:
                assert len(question["choices"]) == len({choice.casefold() for choice in question["choices"]})
                assert question["choices"].count(question["choices"][question["correct"]]) == 1
