# Game content operations

This runbook covers Faith Sparks Family Game Night and Family Bible Bee content. It deliberately keeps full copyrighted ESV and NLT passage text out of Git.

## Source locations

- Published Family Game Night records: `faithsparks/content/family_game_night.json`
- Published Bible Bee deck additions and metadata: `faithsparks/content/bible_bee_decks.json`
- Unmodified supplier/source batches: `faithsparks/content/candidates/`
- Runtime loaders and selection: `faithsparks/services/game_content.py` and `faithsparks/services/bible_bee_content.py`
- Health analysis: `faithsparks/services/game_content_health.py`

`status: published` enters production pools. `status: review` remains out. `review_status: human_review` is allowed in production only for non-blocking judgment calls recorded in the editorial reports; objective structural/editorial errors still fail validation.

## Add or edit a Family Game Night prompt

1. Add a stable, never-reused ID to `family_game_night.json`.
2. Supply every normalized field and mode-specific instruction.
3. Use one canonical answer and reasonable aliases. Keep related scenes in the same `story_group`.
4. Give Guess It at least four progressive clues without writing the answer or an alias in a clue.
5. Give Don’t Say It 4–6 useful forbidden words where practical; never use the full answer as one entry.
6. Add sensitivity and ambiguity flags honestly. Use `review_status: human_review` for genuine judgment calls.
7. Add an ID to `free_sampler_ids` only by replacing another ID and preserving 32 unique answers, eight eligible cards per mode, category/Testament variety, and story diversity.

## Add a Bible Bee passage

Store only the canonical reference and metadata. Include book, Testament, division, deck, familiarity, format eligibility, format-specific difficulty, suitability, overlap group, review status, provenance, and editorial version. Do not paste ESV or NLT text into JSON, reports, docs, tests, or logs. Runtime text continues through the configured Scripture provider/cache pipeline.

Avoid exact or overlapping ranges inside one deck. A named deck should retain at least 40 unique references and at least 20 non-overlapping choices after an edit.

## Validate and regenerate reports

From the repository root, using the project Python environment:

```sh
python scripts/validate_game_content.py
python scripts/generate_game_content_reports.py --sampler-seeds 5000
python -m pytest -q tests/test_game_content_validation.py
```

The validator separates structural, objective editorial, depth, warning, and human-review results. Structural/editorial/depth findings block release. Warnings and human-review notes need a documented decision; only entries explicitly marked `launch_blocking: true` block launch.

Generated outputs:

- `reports/family_game_night_content_health.json`
- `reports/bible_bee_deck_health.json`
- `docs/family-game-night-editorial-review.md`
- `docs/bible-bee-editorial-review.md`

Reports contain aggregate metadata and references, never player data, room codes, drawings, answers typed by players, or full Scripture text.

## Selection and recent history

Both builders derive deterministic randomness from SHA-256 of the full room/configuration input. Family Game Night never relaxes canonical-answer uniqueness. Story and recent-history exclusions relax only when the filtered pool requires it. Bible Bee never cycles by modulo and removes overlapping ranges.

Recent history stores only bounded prompt IDs or Bible references in the server-side session: at most 100 items with a 30-day TTL. Corrupt, missing, or expired history becomes an empty list and cannot block room creation. Free selection filters the sampler before applying history, so history cannot expose paid IDs.

## Content-only pull request checklist

```sh
python scripts/validate_game_content.py
python scripts/generate_game_content_reports.py --sampler-seeds 5000
python -m pytest -q tests/test_game_content_validation.py tests/test_act_it_out.py tests/test_bible_bee.py tests/test_bible_bee_ai.py tests/test_admin_analytics.py
node --check static/act_it_out.js
node --check static/bible_bee.js
python -m pytest -q
git diff --check
```

Review the generated human-review queues and the complete diff for secrets, personal data, and copyrighted passage text.

## Rollback

For a bad content-only release, revert the specific content commit with `git revert <sha>`, run validation and the full suite, then push through the normal deployment workflow. Never reuse a retired stable ID. If one record is unsafe and an immediate full revert is undesirable, change it to `status: retired`, regenerate reports, validate, test, and commit that narrow change. Existing rooms remain safe because rounds/questions are materialized at creation.
