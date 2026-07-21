# Game content depth and replay-predictability audit

Audit date: 2026-07-21
Scope: Faith Sparks Family Game Night and Family Bible Bee
Production content or selection behavior changed during the original audit: **No**

> **Implementation update — 2026-07-21:** The baseline findings below describe the pre-change system. The replay-resistance work has now been implemented. Family Game Night content lives in `faithsparks/content/family_game_night.json`; all four modes have 80 unique eligible answers, the explicit free sampler has 32 IDs/32 unique answers, selection uses a SHA-256-derived deterministic seed with answer/story exclusions and balancing, and browser-session history avoids the last 100 prompt IDs when capacity permits. Bible Bee named decks now contain 40 references each, selection rejects duplicate/overlapping ranges, format order varies, content difficulty metadata influences passage choice, and recent references are avoided when possible. `scripts/validate_game_content.py` is the CI-ready structural/depth report. Supplied source records remain preserved under `faithsparks/content/candidates/` with their original review status and provenance.

Final implementation verification: the validator reports zero structural errors and zero depth warnings; the full repository suite passes 233 tests. Across 1,000 paid and 1,000 free Family Game Night seeds, every generated prompt sequence was distinct and every game preserved answer uniqueness. The property suite additionally checks 2,000 free seeds and 500 Bible Bee format-order seeds.

## Executive summary

Both products have enough mechanics for launch, but their content systems have very different depth risks.

- **Family Game Night is shallow at the answer/story level.** It contains 89 prompt records but only 77 normalized answers. Guess It has only five cards, only two of them easy. Twelve answers are exact duplicates across cards, and many additional cards revisit the same story using slightly different wording. The free sampler is described as 24 cards but resolves to 19 prompt IDs and 15 unique answers because multi-mode cards overlap.
- **Family Bible Bee is broad globally but shallow inside a named deck.** The 18 named decks contain 216 deck memberships representing 186 unique references. Every named deck contains exactly 12 passages. A 10-round game can avoid passage reuse, but 15- and 20-round games repeat three and eight passages respectively. The Random Questions deck can supply 20 unique passages.
- **Neither product remembers a host's recent content.** Replays merely change a seed. A family can receive content it just saw.
- **Family Game Night's seed is especially predictable.** It is the sum of four room-code character values, yielding only 161 possible seeds across 1,048,576 possible codes. Selection then walks each pool by a fixed `index * 7` step rather than shuffling. Whole-family mixed play has at most 161 distinct 20-round prompt sequences; Challenge has only 60 and the free sampler 120.
- **Bible Bee uses a stronger seeded shuffle**, but fixed named decks still reuse the same 12 references every game. UI difficulty primarily changes time, scoring, and number of choices; it does not select easier or harder passages.

The smallest safe improvement is to introduce normalized content metadata and a shared constrained deck builder before adding large quantities of content. Adding cards without story groups, references, and recent-use memory would increase volume but leave the experience clustered and predictable.

## Sources and methodology

Inspected:

- `faithsparks/views/act_it_out.py`
- `faithsparks/services/bible_bee_content.py`
- `faithsparks/views/bible_bee.py`
- `faithsparks/services/bible_bee_ai.py`
- `static/act_it_out.js`
- `static/bible_bee.js`
- Family Game Night and Bible Bee templates
- `tests/test_act_it_out.py`
- `tests/test_bible_bee.py`
- `tests/test_bible_bee_ai.py`

Counts were calculated directly from `PROMPTS` and `DECKS`. Answers were normalized by lowercasing and removing punctuation. Bible references were parsed with the production `_parse_reference` helper. Near-duplicate answers used token overlap and string similarity, followed by manual removal of obvious false positives. Generation behavior was evaluated across all 161 possible Family Game Night seed sums, weighted across all 1,048,576 four-character room codes.

“Substantial repeat” means roughly 25% or more of a new game's answers/passages have appeared in the family's recent games. Estimates assume reasonably random selection for comparison; the current deterministic algorithms can repeat sooner.

## 1. Faith Sparks Family Game Night

### Inventory

| Measure | Count |
|---|---:|
| Prompt records | 89 |
| Stable unique prompt IDs | 89 |
| Unique normalized answers | 77 |
| Exact duplicate-answer groups | 12 |
| Free-sampler prompt IDs | 19 |
| Free-sampler unique answers | 15 |
| Hard prompts | 2 |
| Prompts with Testament metadata | 0 |
| Prompts with Bible-book metadata | 0 |
| Prompts with references | 0 |
| Prompts with story groups | 0 |
| Prompts with familiarity metadata | 0 |
| Prompts with age-floor metadata | 0 |
| Prompts with sensitivity metadata | 0 |

The free sampler's `_free_prompt_ids()` requests the first six cards supporting each mode, but a card can support both Act It and Don't Say It. Set deduplication therefore produces 19 IDs, not the documented 24. All five Guess It cards enter the sampler because the complete bank itself contains only five.

### Mode depth

| Mode | Cards supporting mode | Unique answers | Easy | Medium | Hard |
|---|---:|---:|---:|---:|---:|
| Act It | 36 | 36 | 26 | 10 | 0 |
| Draw It | 48 | 46 | 28 | 18 | 2 |
| Don't Say It | 32 | 32 | 22 | 10 | 0 |
| Guess It | 5 | 5 | 2 | 3 | 0 |

The two hard cards are both Draw It cards (`Pentecost` and `The new heaven and new earth`). Challenge mode therefore does not provide genuinely hard Act It, Don't Say It, or Guess It content.

### Category depth

| Product category | All cards | Act | Draw | Don't Say It | Guess It |
|---|---:|---:|---:|---:|---:|
| Bible Stories | 25 | 8 | 12 | 6 | 5 |
| Jesus and His Miracles | 12 | 6 | 6 | 6 | 0 |
| Parables | 10 | 4 | 6 | 4 | 0 |
| People of the Bible | 12 | 6 | 6 | 6 | 0 |
| Worship and Church | 12 | 6 | 6 | 4 | 0 |
| Everyday Faith | 18 | 6 | 12 | 6 | 0 |

Guess It cannot honor category variety: every Guess It card maps to Bible Stories. Parables is the shallowest general category. Category totals overstate story diversity because the same answer or story can occur in multiple mode-specific cards.

### Difficulty-filtered unique capacity

The following values are `(cards, unique answers)` for all categories.

| Difficulty | Act | Draw | Don't Say It | Guess It |
|---|---:|---:|---:|---:|
| Younger Family | 26 / 26 | 28 / 28 | 22 / 22 | 2 / 2 |
| Whole Family | 36 / 36 | 46 / 46 | 32 / 32 | 5 / 5 |
| Challenge | 10 / 10 | 20 / 20 | 10 / 10 | 3 / 3 |

Single-mode 10/15/20-round feasibility:

- Act It: Younger and Whole Family can fill 20 without answer reuse. Challenge can fill 10, not 15 or 20.
- Draw It: all three difficulty filters can fill 20, although Challenge has exactly 20 unique answers and almost no margin for category restrictions.
- Don't Say It: Younger and Whole Family can fill 20. Challenge can fill 10, not 15 or 20.
- Guess It: no difficulty can fill even 10 without repetition.

Filtering to one or two categories makes these limits substantially worse. The current builder detects an empty mode pool but does not detect “pool exists but is too small for the requested round count.”

### Duplicate answers and repeated story clusters

Exact duplicate-answer groups:

1. Jonah and the big fish
2. Daniel in the lions' den
3. Moses parting the sea
4. The walls of Jericho falling
5. Jesus calming the storm
6. Jesus healing the blind man
7. Jesus raising Lazarus
8. The Good Samaritan
9. The Prodigal Son
10. The wise man building on the rock
11. Singing worship
12. Baptism

Material near-duplicate pairs include:

- Feeding the five thousand / Jesus feeding the five thousand
- David and Goliath / David facing Goliath
- Peter walking on water / Jesus walking on water
- The Prodigal Son / The Prodigal Son coming home
- The lost sheep / The lost sheep being found
- Moses parting the sea / Israel crossing the Red Sea

Repeated story clusters are broader than exact answers. At least 19 clusters contain two or more cards, including David and Goliath, Noah, Jonah, Daniel, the Red Sea, Jericho, calming the storm, feeding the five thousand, walking on water, healing the blind man, Lazarus, Good Samaritan, lost sheep, Prodigal Son, wise builder, mustard seed, worship singing, baptism, and communion. A future `story_group` field should make this count authoritative rather than heuristic.

### Testament, book, familiarity, and sensitivity balance

These cannot be counted defensibly from the current data. The prompt records contain no Testament, Bible book, reference, familiarity, or sensitivity fields. Titles imply that famous narratives dominate the story modes, but classifying them after the fact would be subjective. All five Guess It cards are extremely familiar subjects (David, Esther, Good Samaritan, Prodigal Son, Psalm 23), which materially contributes to predictability.

This missing metadata is itself a launch-content risk:

- Old/New Testament balance cannot be enforced or measured.
- Two prompts from the same narrative cannot be reliably separated.
- Famous stories cannot be intentionally mixed with less-common material.
- Age and sensitivity filters cannot be guaranteed.
- Editorial provenance and biblical reference checking are difficult.

### Current round construction

For Family Game Night, `_build_rounds`:

1. Filters independently by requested category, difficulty, mode, and free-sampler membership.
2. Cycles modes in the fixed order Act → Draw → Don't Say It → Guess It.
3. Computes `seed = sum(ord(character) for character in room_code)`.
4. Selects `mode_pool[(seed + index * 7) % len(mode_pool)]`.
5. Does not remove the selected card, answer, or story from other mode pools.
6. Does not consult previous games.

Consequences:

- A card can repeat within a game when the fixed step cycles through a small pool.
- Different cards with the same answer can appear in one game.
- Different cards from the same story can appear in one game.
- Mode order never varies in Mixed Game Night.
- Similar room-code character sums generate the same sequence.
- `index * 7` interacts badly with pool sizes sharing factors with seven or with short pools.
- Play Again changes the seed using the current timestamp, but still reduces the seed to a character sum and retains no exclusion history.

### Measured duplicate behavior

| Configuration | Rounds | Distinct generated sequences | Games containing an answer duplicate | Average unique answers |
|---|---:|---:|---:|---:|
| Free sampler mixed | 10 | 120 | 100% | 7.50 |
| Younger mixed | 10 | 161 | 100% | 6.42 |
| Younger mixed | 15 | 161 | 100% | 8.71 |
| Younger mixed | 20 | 161 | 100% | 10.27 |
| Whole Family mixed | 10 | 161 | 30.2% | 9.67 |
| Whole Family mixed | 15 | 161 | 88.2% | 13.75 |
| Whole Family mixed | 20 | 161 | 97.0% | 17.71 |
| Challenge mixed | 10 | 60 | 53.4% | 9.37 |
| Challenge mixed | 15 | 60 | 100% | 11.10 |
| Challenge mixed | 20 | 60 | 100% | 12.00 |

The free product offers 10 rounds but currently averages only 7–8 unique answers. This is the most visible content-depth defect.

### Estimated games before substantial repeats

- Free sampler: substantial repetition is present in the first game and unavoidable on the second; only 15 unique answers exist across the sampler.
- Guess It: repetition is immediate. A Whole Family 20-round mixed game uses all five Guess It cards; the next such game repeats the complete Guess It pool.
- Whole Family mixed: under ideal random selection from 77 answers, a 20-round game crosses the 25% prior-exposure threshold on the second game; 15-round games around the third; 10-round games around the fourth. The fixed algorithm and story clustering make recognition occur sooner.
- Challenge mixed: substantial repetition is present in the first 15- or 20-round game.

## 2. Family Bible Bee

### Inventory

| Measure | Count |
|---|---:|
| Named built-in decks | 18 |
| Deck memberships | 216 |
| Unique references | 186 |
| Passages per named deck | 12 |
| Exact references appearing in multiple decks | 27 |
| References appearing once | 159 |
| Overlapping-range near duplicates | 14 pairs |
| Runtime formats | 4 |
| UI game styles | 6 |
| Supported translations | 3 |

The Random Questions deck is a virtual union of the 186 unique references; it does not add content.

### Question formats and styles

| Format | Unique references capable of supporting it | Styles using it |
|---|---:|---|
| Finish the Verse | 186 | Classic Mix, Memory Practice, Younger Kids, Challenge |
| Reference Race | 186 | Classic Mix, Reference Race, Challenge |
| Fill the Blank | 186 | Classic Mix, Memory Practice, Younger Kids, Challenge |
| Oral Recitation | 186 | Oral Recitation |

Questions are generated at room creation from fetched Scripture text. The source bank therefore contains passages, not separately authored questions. Fill-the-blank may fall back to Finish the Verse when no usable blank is found. Difficulty does not change which references support a format.

### Deck difficulty and theme counts

Deck difficulty is a deck-level marketing label, not per-passage calibrated difficulty.

| Deck label | Decks | Memberships |
|---|---:|---:|
| Easy | 2 | 24 |
| Easy / Medium | 8 | 96 |
| Medium | 7 | 84 |
| Medium / Hard | 1 | 12 |

There are 17 theme labels. “Comfort” has two decks/24 memberships; every other theme has one deck/12 memberships. Categories are selected by choosing a deck. There is no multi-category filtering and no per-passage category metadata beyond the containing deck.

The runtime difficulty choices (`little_sparks`, `family`, `challenge`, `hard`, `expert`, `upramp`, `bible_bee_prep`) control points, timers, and two-versus-four choices. They do **not** filter passage difficulty. “Upramp” increases time pressure and points, not textual or biblical difficulty.

### Testament balance

| Basis | Old Testament | New Testament |
|---|---:|---:|
| Deck memberships | 79 (36.6%) | 137 (63.4%) |
| Unique references | 66 (35.5%) | 120 (64.5%) |

This is a strong New Testament skew. There is no balancing step during selection, so a game can skew more heavily depending on its deck.

### Bible-book depth

| Book | Unique refs | Memberships | Book | Unique refs | Memberships |
|---|---:|---:|---|---:|---:|
| Psalm | 35 | 44 | John | 18 | 21 |
| Matthew | 20 | 22 | Romans | 14 | 18 |
| Proverbs | 10 | 12 | Isaiah | 9 | 9 |
| Colossians | 8 | 8 | Luke | 7 | 7 |
| Ephesians | 6 | 8 | Philippians | 5 | 6 |
| 1 Peter | 5 | 6 | Galatians | 5 | 5 |
| James | 4 | 5 | Hebrews | 4 | 4 |
| Acts | 4 | 4 | 1 Corinthians | 4 | 4 |
| Micah | 3 | 4 | Mark | 3 | 3 |
| 2 Corinthians | 3 | 4 | Exodus | 3 | 3 |
| 1 John | 2 | 3 | 1 Thessalonians | 2 | 3 |
| Deuteronomy | 2 | 2 | Revelation | 2 | 2 |
| Genesis | 1 | 2 | Joshua | 1 | 1 |
| 2 Timothy | 1 | 1 | Titus | 1 | 1 |
| 2 Peter | 1 | 1 | Lamentations | 1 | 1 |
| 1 Timothy | 1 | 1 | Jeremiah | 1 | 1 |

Only 31 of the 66 Bible books appear. Psalm, Matthew, John, Romans, and Proverbs account for 97 of 186 unique references (52.2%). Entire narrative/history and prophetic sections have little or no representation.

### Duplicate and near-duplicate references

Three references appear in three decks:

- Proverbs 3:5-6
- Matthew 5:16
- Psalm 46:1

Twenty-four more references appear in two decks, including John 3:16, Psalm 23:1, Romans 3:23, Romans 6:23, Ephesians 2:8-9, James 1:5, 1 Peter 5:7, Genesis 1:1, John 1:14, John 14:6, Romans 5:8, 1 John 1:9, Ephesians 4:32, Micah 6:8, Psalm 100:1-5, and 1 Thessalonians 5:16-18.

Fourteen overlapping-range pairs can expose substantially the same text as different records:

- 1 Corinthians 13:1-8 / 1 Corinthians 13:4-7
- Colossians 3:12 / 3:12-14 / 3:13
- Isaiah 40:28 / 40:28-31 / 40:31
- John 13:34-35 / 13:35
- Matthew 11:28 / 11:28-30
- Matthew 5:14 / 5:14-16 / 5:16
- Psalm 100:1-5 / 100:4
- Psalm 119:11 / 119:9-11
- Psalm 23:1 / 23:1-4 / 23:4
- Romans 8:31-39 / 8:39

### Famous versus less-common passages

There is no familiarity field, so an authoritative familiar/less-common count is unavailable. Cross-deck frequency is a useful proxy: 27 references are deliberately reused, while 159 occur once. The highest-frequency items are familiar memory verses. The absence of familiarity metadata means Random Questions cannot intentionally avoid serving several famous verses together or guarantee discovery of less-common passages.

### Current selection and round construction

`load_passages` and `build_questions` behave as follows:

1. A named deck retains its source order and loads up to the requested number, but only 12 exist.
2. Random Questions shuffles the 186-reference union using `random.Random(room_code)` and loads the requested number.
3. Scripture text is fetched at room creation; missing fetches are skipped.
4. `build_questions` deep-copies and shuffles loaded passages with the room-code seed.
5. Younger Kids sorts by fetched word count before shuffling.
6. The selected format follows a fixed style cycle.
7. Round `index` uses `ordered[index % len(ordered)]`, explicitly cycling when rounds exceed loaded passages.
8. Play Again uses a timestamped seed but the same named-deck passage set.
9. No host-level recent-reference history is read or written.

### Can 10, 15, and 20 rounds avoid repetition?

| Source | 10 rounds | 15 rounds | 20 rounds |
|---|---|---|---|
| Any named 12-passage deck | Yes | No: 3 repeated passages | No: 8 repeated passages |
| Random Questions | Yes | Yes | Yes |
| AI one-off references | Usually yes up to returned pool | No if pool < 15; loader currently accepts at most 10 refs | No |

Even when references are unique, a mixed style can feel repetitive because the format order is fixed and related/overlapping passages are not clustered.

### Estimated games before substantial repeats

- Same named deck: the second game is entirely drawn from the same 12 references. It is immediately and substantially repetitive even with a new order.
- Random Questions, 10 rounds: under ideal independent sampling, around the seventh game reaches roughly 25% prior exposure in the next game.
- Random Questions, 15 rounds: around the fifth game.
- Random Questions, 20 rounds: around the fourth game.
- Actual repeat perception can arrive earlier because 14 overlapping ranges repeat text and familiar verses are prominent.

## Why the products feel predictable

Shared causes:

- No persisted recent-use history by host/account.
- No `story_group` or overlapping-passage exclusion.
- Fixed mode/format cycles reveal what type of round comes next.
- Category and difficulty labels are too coarse to diversify within a filtered pool.
- Familiarity is not modeled, so famous content can dominate by chance or curation.
- No explicit Testament or book balancing.

Family Game Night-specific causes:

- Very small Guess It pool.
- Only 77 answers and 2 hard cards.
- Only 161 seed values and deterministic modular stepping.
- Cards are selected independently per mode, allowing cross-mode answer/story reuse.
- Free sampler contains 15 unique answers and repeats inside its first 10-round game.

Bible Bee-specific causes:

- Every named deck is fixed at 12 references.
- Longer games intentionally cycle with modulo indexing.
- Difficulty changes mechanics rather than content.
- Half of unique references come from five books.
- A new seed changes order but not the content set for a named deck.

## Recommended normalized content schema

Use one stable schema for editorial metadata, with mode-specific fields optional. Bible Bee passage records can use the same core fields and attach generated-format eligibility.

```json
{
  "id": "stable-kebab-case-id",
  "answer": "Canonical answer or Scripture text",
  "modes": ["act", "draw", "clue", "guess"],
  "testament": "OT",
  "book": "Daniel",
  "reference": "Daniel 6:1-28",
  "story_group": "daniel-lions-den",
  "category": "bible_stories",
  "difficulty": "easy",
  "age_floor": 7,
  "familiarity": "famous",
  "instructions": {"act": "...", "draw": "..."},
  "forbidden_words": ["lions", "den", "Daniel"],
  "progressive_clues": ["...", "...", "...", "..."],
  "sensitivity_flags": ["threat_of_violence"],
  "status": "published",
  "editorial_version": 1
}
```

Rules:

- `id` never changes after publication.
- `answer` is canonical; alternate acceptable labels belong in `answer_aliases`.
- `story_group` joins all mode cards and related passages from one narrative/concept.
- Bible Bee should additionally store `verse_start`, `verse_end`, `translation_policy`, `format_eligibility`, and calibrated `difficulty_by_format`.
- `familiarity` should be an editorial enum such as `famous`, `known`, `discovery`, not inferred from usage.
- Sensitivity flags should describe content, not silently remove it; age/product policy decides filtering.

## Recommended replay-resistant deck builder

1. **Build eligible records** from entitlement, free-pool membership, mode, category, difficulty, age floor, and sensitivity policy. Signed-out players never run selection; the host's room stores the completed rounds.
2. **Normalize exclusions** by canonical answer, `story_group`, and overlapping Bible reference ranges.
3. **Read recent history** for the authenticated host: retain the last 5 games or 100 answer IDs/story groups, with a short TTL. Free users can use a signed, anonymous browser-history token or session-local recent IDs; absence of history must remain safe.
4. **Create round quotas** for mode, category, Testament, difficulty, familiarity, and book. Use largest-remainder allocation so quotas sum exactly to 10/15/20.
5. **Score candidates** rather than stepping an array. Strong penalties: answer already used, story group already used, recent host use. Softer penalties: overrepresented category/Testament/book/difficulty/familiarity.
6. **Select without replacement** using a cryptographic room seed only as a tie-breaker. Remove the chosen answer and story group from every mode pool.
7. **Vary mode order** while preventing long runs of one mode. Mixed games should meet quotas but not expose the same four-round cycle every time.
8. **Degrade in explicit stages** when filters are small:
   - relax recent-history avoidance;
   - relax book/familiarity balance;
   - relax story-group avoidance only for concept categories;
   - widen difficulty by one adjacent tier;
   - never repeat an exact answer within a game;
   - if exact-answer capacity is still insufficient, return a recoverable setup message rather than silently repeat.
9. **Persist only IDs and coarse history**, never player data, answers typed by children, or drawings. Room documents may contain the chosen round payload as today.
10. **Record diagnostics** such as eligible pool size and relaxations used so shallow filters are visible in aggregate without storing room secrets.

## Concrete content targets

These are production-depth targets, not a requirement for the first beta. Counts are mode eligibility counts; a well-authored record may support more than one mode.

### Family Game Night

| Mode | Current | Beta minimum | Replay-resistant target |
|---|---:|---:|---:|
| Act It | 36 | 80 | 160 |
| Draw It | 48 | 80 | 160 |
| Don't Say It | 32 | 80 | 160 |
| Guess It | 5 | 80 | 160 |

Additional targets:

- At least 400 unique canonical answers and 250 story groups across the product.
- At least 25 eligible cards per mode in every category.
- At least 40 cards per mode/difficulty tier, including true hard content outside Draw It.
- Testament target for biblically anchored records: 45% OT, 55% NT, with no 20-round game outside a 35/65 boundary unless filters force it.
- Familiarity target per game: roughly 40% famous, 40% known, 20% discovery.
- Free sampler: 32 genuinely distinct prompt IDs, at least 28 unique answers, at least 8 cards per mode, and no duplicate answer/story in its 10-round builder.

### Family Bible Bee

Target a canonical bank of at least 500 unique references, with authored/validated format variants as follows:

| Format | Easy | Family | Challenge | Hard | Expert | Total |
|---|---:|---:|---:|---:|---:|---:|
| Finish the Verse | 150 | 250 | 200 | 150 | 100 | 850 |
| Fill the Blank | 150 | 250 | 200 | 150 | 100 | 850 |
| Reference Race | 120 | 250 | 200 | 150 | 100 | 820 |
| Oral Recitation | 100 | 180 | 150 | 100 | 75 | 605 |

These are validated question-format eligibilities, not necessarily distinct references in every cell. Additional targets:

- Named decks: minimum 40 unique references; flagship decks 60.
- At least 60 references for each broad canonical division: Pentateuch, History, Wisdom/Poetry, Major Prophets, Minor Prophets, Gospels, Acts, Pauline Epistles, General Epistles/Revelation.
- Overall Testament target near 45% OT / 55% NT.
- No book above 15% of the global bank.
- Per-format difficulty must be calibrated from text length, vocabulary, reference obscurity, blank ambiguity, and recitation length—not only timers.

## Staged content-expansion plan

### Stage 0 — Normalize and validate without changing selection

- Move content into versioned data modules or JSON files.
- Add the complete schema and backfill IDs, canonical answers, references, story groups, Testament, book, age floor, familiarity, and sensitivity.
- Add a report-only validator; preserve current runtime selection.
- Editorially resolve the 12 exact Family Game Night duplicate answers and 14 Bible Bee overlap groups.

### Stage 1 — Fix minimum viable depth

- Expand Guess It first from 5 to 80.
- Bring Act It and Don't Say It to 80 each and ensure all modes have category/difficulty coverage.
- Expand each Bible Bee named deck from 12 to at least 40 without repeating overlapping ranges.
- Create real easy/family/challenge classifications per format.

### Stage 2 — Introduce the constrained builder

- Select without answer/story replacement.
- Balance modes, categories, Testaments, difficulties, and familiarity.
- Add graceful relaxation and setup diagnostics.
- Keep existing room/API payloads compatible.

### Stage 3 — Add recent-game memory

- Persist recent prompt/reference/story-group IDs for signed-in hosts.
- Use session-local or signed-cookie history for free/signed-out hosting if that flow is later allowed.
- Apply TTL and bounded lists; provide no player-level history.

### Stage 4 — Reach full replay targets

- Grow each Family Game Night mode to 160 eligible cards.
- Grow Bible Bee to 500 unique references and the format/difficulty targets above.
- Use aggregate selection diagnostics and beta feedback to prioritize thin categories rather than adding uniformly.

## Automated validation requirements

Content validation should fail CI for:

- duplicate or unstable IDs;
- duplicate canonical answers unless explicitly linked by an approved alias policy;
- missing mode-required fields (`forbidden_words`, progressive clues, instructions);
- invalid category, difficulty, Testament, book, reference, familiarity, or sensitivity enum;
- mismatched book/Testament/reference parsing;
- overlapping Bible ranges without the same `story_group`/overlap group;
- too few clues, repeated clues, forbidden words containing the answer, or clues revealing the answer too early;
- insufficient filtered capacity for 10/15/20 rounds;
- any generated game repeating an answer;
- story-group, mode, category, Testament, and difficulty quotas outside tolerance;
- recent-history exclusion not being honored when adequate content exists;
- unstable output for a fixed test seed;
- free users receiving paid IDs or joined players being subjected to selection/paywall logic;
- question choices with duplicate values, missing correct choices, malformed finish phrases, or ambiguous blanks.

Property tests should generate thousands of seeds and filter combinations. Snapshot reports should track pool sizes by mode/category/difficulty so a content edit cannot silently make a setup option shallow.

## Exact files likely to change in implementation

Existing files:

- `faithsparks/views/act_it_out.py` — remove inline content after migration; call the constrained builder; store recent IDs.
- `faithsparks/services/bible_bee_content.py` — normalized passage bank, difficulty calibration, overlap detection, balanced question building.
- `faithsparks/views/bible_bee.py` — recent-history integration and graceful setup errors.
- `faithsparks/services/users.py` or a focused new history service — bounded host content history.
- `tests/test_act_it_out.py`
- `tests/test_bible_bee.py`
- `tests/test_bible_bee_ai.py`

Recommended new files:

- `faithsparks/content/family_game_night.json`
- `faithsparks/content/bible_bee_passages.json`
- `faithsparks/services/game_content.py`
- `scripts/validate_game_content.py`
- `tests/test_game_content_validation.py`

No frontend or route rewrite is required. Existing room payloads can continue receiving fully materialized rounds/questions.

## Priority conclusions

1. Fix metadata and selection invariants before bulk authoring.
2. Expand Guess It immediately; five cards cannot support a paid replayable mode.
3. Make the free 10-round sampler genuinely non-repeating.
4. Raise Bible Bee named decks above the longest offered game length; 40 is the practical minimum.
5. Add host recent-game exclusions only after stable content IDs and story groups exist.
6. Treat difficulty as content metadata, not merely scoring/timing.
7. Use the constrained builder to make every added card improve variety rather than reinforce existing clusters.

## Validation run

The original repository had no standalone validator. This implementation adds `scripts/validate_game_content.py` and `tests/test_game_content_validation.py`; the historical baseline run below is retained for audit traceability.

```text
python -m pytest -q \
  tests/test_act_it_out.py \
  tests/test_bible_bee.py \
  tests/test_bible_bee_ai.py

139 passed in 4.35s
```

The tests ran in an isolated temporary environment because the repository's local `.venv` does not contain pytest or application dependencies. The pinned OpenAI/Pydantic dependency set does not build under the machine's Python 3.14, so the test environment used the current Python-3.14-compatible OpenAI transitive dependency versions. No repository or production dependency files were changed.
