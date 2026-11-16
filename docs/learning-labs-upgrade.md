# FaithSparks learning games — November 15, 2026

## Plan and design

Bring all three games together in FaithSparks Labs, retaining existing URLs, curriculum, and local progress. Use one React/Vite toolchain and shared navigation, with three related identities:

| Game | Theme | Main improvements |
| --- | --- | --- |
| Geo Detectives! | The Field Atlas — coastal blue, brass, watercolor landscapes | Finish the React game with 125 original cases and 55 comparisons; automatic 3/2/1 clue scoring, alternating teams, comparison judging, Undo, save/resume, trail filters and corrected comparison diagrams. |
| Math Fact Adventure | The Discovery Journal — sage, gold, scenic watercolor | Retain five fluency stages and adaptive review; add optional typed answers, a session progress bar, clearer practice flow, and repair saved hint/reveal/graded state. |
| Latin Quest | The Word Notebook — plum, parchment, typography | Use an independent 191-card collection and existing audio, recall, choice, flashcard, weekly deck and review logic; simplify the initial settings and integrate the shared React navigation and production build. |

Execution: recover the current repository and art → preserve curriculum and progress contracts → implement themes and interactions → build static bundles → test rules, arithmetic, complete sessions and responsive layouts → commit and push the verified release → verify the live deployment.

## Architecture and build

Source: `frontend/learning-labs/`. Install with `npm ci --prefix frontend/learning-labs`; test with `npm test --prefix frontend/learning-labs`; build with `npm run build --prefix frontend/learning-labs`.

Geo is a React app with a pure scoring reducer and data separate from UI. Math and Latin retain their tested controllers, with React providing shared navigation; Vite builds their controllers and assets. This is an incremental migration, not a rewrite of their learning engines. Future UI work can move into React components without replacing progress or card formats.

Build output is committed under `static/labs/learning/`. The build updates the existing Math/Geo HTML entry files and Latin template asset references, so Flask deployment needs no Node runtime. Asset names include content hashes. Original artwork is extracted into reusable, cacheable files. The offline Math HTML embeds its dependencies and remains downloadable.

Existing routes stay `/labs/geo-detectives`, `/labs/math-fact-adventure`, `/labs/math-fact-rally` (alias), and `/labs/latin-quest`. Existing Labs catalog registrations remain in place. Math retains `mathFactRally.v2`; Latin retains per-player progress keys; its independent collection uses new card IDs and a separate weekly-selection key so older local records are kept without reassignment. Geo uses a new expedition save because automatic scoring has different semantics from the previous manual tally.

## Validation

- Production build for all three entries.
- Pure Geo tests: expanded reviewed data bank, scoring once per case, turn changes, exact Undo, bounded history, filter/shuffle preservation, invalid save handling.
- Math arithmetic contract: 12,000 generated facts, 600 focused selections across all operations and stages.
- Existing Latin core and voice tests, plus Flask route/curriculum tests.
- Browser playthroughs at 1360, 820 and 390 pixels in Chromium and WebKit: Geo scoring/clues/Undo/compare, five typed Math facts, saved hinted/revealed/graded Math resume, five Latin recall answers, flashcard pause/resume, no horizontal overflow or page exceptions.

Browser tests: start Flask, then `LABS_BASE_URL=http://127.0.0.1:5174 node tests/learning_labs_browser.cjs`. Use `LABS_WEBKIT=1` for WebKit and `LABS_BROWSER_PATH` if using an installed browser executable. Audio requests are deliberately stubbed in these UI tests; existing fixed-cue voice tests verify the audio request/cache behavior without spending API credits.

## Boundaries

Saved learning progress is browser-local; cross-device sync is not added. Math's offline download is separate from hosted-page caching. Latin still needs the existing server for new voice clips; visible practice works when audio is unavailable. Geography diagrams illustrate distinctions rather than claiming every original watercolor is a precise scientific diagram.

## Shared practice improvements — November 15

The second release shares React components for QuickStart, SessionStatus, LearningSummary and PracticeOptions. An adapter lets the Math and Latin controllers use those components without rewriting their curriculum engines. Results use the same three categories: On my own, With help, Worth reviewing. All three games have answer Undo and a current learner indicator.

- Geo now starts at a learner chooser and a five-question session. Two-team play, trail, comparison mode and longer sessions live in Practice options. Completed sessions finish with a journal. Review draws only from that learner’s missed or assisted discoveries; an independent answer clears the case from their review queue. Scores reset per session; cumulative learning history remains. Undo restores cumulative records as well as session scores. Old expedition saves still open without removing their existing fields.
- Math offers verbal, typed and three-choice answers. Choice progress has its own key suffix and stays separate from recall in review and journal analysis. Actual recorded weak facts are used for focused review before generating additional practice. One learner can be selected from the configured roster without discarding the other learners’ settings. Stable answer choices and graded state survive reload. The offline download still works without network requests.
- Latin adds a shared five-question button and per-player saved practice preferences. Detailed setup stays under Practice options. Answer Undo works across question navigation and from results, restores the prior progress record and preserves whether help was used. Voice behavior, fixed curriculum, flashcards, per-player weekly decks and existing progress formats remain in place.

Validation covers per-learner review isolation, clearing mastered review cases, team alternation, five-question completion, hint classification, Undo from results, separate Math choice records, resumed choice sessions, Latin preference switching and saved preferences, and flashcard pause/resume. Browser checks run through the actual Flask application at desktop, tablet and phone sizes in Chromium and WebKit. These are shared UI and practice patterns; learner data stays separate by subject.

## Geo visual direction restored

The original attached illustrated Geo Detectives reference remains the visual guide: fox mascot, scroll title, colorful team flags, pinned parchment clues, green choice buttons, red wax-seal reveal, and watercolor landscapes. Geo now adds illustrated Quest / Compare / Explore again entry cards and its own invitation copy. The shared practice components accept subject-specific headings and introductory copy, so shared behavior supports each game's distinct visual identity. Existing progress, review, Undo, and five-question sessions remain intact.

For the independent-content replacement, sources, and public-history limitation, see [shareable-learning-release.md](content/shareable-learning-release.md).
