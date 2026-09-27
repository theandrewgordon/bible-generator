# Same Brain audit — September 27, 2026

Audited `main` at `f44ea84ad3f017bcc6ff70ff69355621ad21a753`.

## Did the expansion land?

Yes. Commit `65a9898d` added the large replay expansion; `c513cb0c`,
`405666d2`, and `f44ea84a` followed with cleanup and guards.
The earlier conversation stopped at `6285dba5`, before these commits.

Executing the bank produces 1,530 questions (up from 840, an 82% increase):
858 general questions plus 224 Kids, 224 Tween/Teen, and 224 Mixed Ages.
Everyone draws from the full 1,530. All IDs and normalized prompts are unique.
Inline JavaScript parses. Each question has 2–4 nonempty, distinct choices.
Effective Everyone pool sizes overlap: Friends 269, Family 398, Chaos 335,
Food 174, Travel 179, Couples 278, Work 125, Nostalgia 185, Would You Rather 328.

## Fixes in this audit

- Use every remaining unseen question before filling from least recently seen
  questions. Previously, fewer than five/ten unseen questions reset selection
  to the entire pool, permitting immediate repeats.
- Record questions when displayed, including abandoned, Group, and Together
  games. Previously only ordinary completed challenges/results wrote history.
- Correct legacy history migration when the audience-specific key is absent.
  Keep 300 IDs for Everyone and 140 per dedicated audience.
- Remove the fail-open fallback from an undersized child bank to adult questions.
- Carry audience through Group creation, storage, invitations and results.
  Older Group records without an audience retain the Everyone default.
- Escape custom answer labels and disable all answer buttons after a selection,
  preventing markup injection and multiple answers during the transition delay.
- Repair prompt/choice alignment or grammar in 79 questions. Examples: replace
  unrelated toppings with serving preferences; replace a pool offered on a flight
  with universally usable travel extras; make yes/no prompts match yes/no choices;
  simplify Mixed Ages task choices. Preserve all existing IDs and their order.
- Repair stale Same Brain assertions and the lightweight Flask test app's missing
  shared-template dependencies. Add executable bank/selection/rendering tests and
  explicitly provision Node in CI.

## Validation

- 102 Same Brain tests pass locally on Python 3.12.
- The Games Lab file has 140 passing tests and three pre-existing failures in
  shared menu ordering, Ice Cream, and Stables.
- The executable audit validates bank size/schema/unique prompts and IDs,
  audience filtering, daily stability, history migration/limits, exhausted-pool
  behavior, safe custom labels, and rapid taps.
- 39,600 simulated games exercise five- and ten-question selection across four
  audiences and 110 random/set/deck choices, with no immediately repeated IDs.
- Python compilation and whitespace checks pass.
- A local mobile-width Chrome smoke test checks page boot and question progression.

The original main CI run 36351526540 had 29 failures, 888 passes and one skip.
Do not treat that run as green or attribute every failure to the expansion.

## Still unfinished / limits

- Editorial diversity: the latest 690 entries come from 129 template/topic
  families. Exact uniqueness does not prove semantic variety or age relatability.
  Further expansion should add distinct authored choices and playtesting, not just
  swap nouns. This audit fixes identifiable mismatches, not every subjective issue.
- Themed decks are named views of broad pools. For example Pizza Night uses the
  Food pool, rather than a dedicated collection of pizza questions.
- Repeat history is local to the browser and audience, capped at 300/140. It is
  not cross-device or a guarantee to exhaust all 1,530 before repeating. Switching
  audience can repeat a question; daily replay intentionally stays fixed.
- Group is still served through authenticated Labs routes. This audit preserves
  that existing access model; it does not make Group links public.
- Live two-device Together/Group behavior, production storage, payments, TTS and
  deployment are not verified by these local tests.
- Shared-menu, Ice Cream, Stables and product-registry test expectations remain
  separate repository maintenance work. Fixes in this branch need merging and
  deployment before users receive them.
