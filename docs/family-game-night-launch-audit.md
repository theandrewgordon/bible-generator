# Faith Sparks Family Game Night launch audit

Audit date: 2026-07-20
Branch: `feature/family-game-night-launch`

## Executive summary

The game engine is considerably closer to launch than the original checklist suggests. Room creation, four-character joins, host/display/player views, teams and individual scoring, Act It, Draw It, clue cards, Guess It clues, reconnect-oriented polling, room expiry, drawing validation, host controls, and final results already exist. Recent commits also hardened event play, stale-player handling, duplicate actions, replay, and host card skipping.

The current product is **not yet purchasable as Faith Sparks Family Game Night**. The largest launch gap is not gameplay: it is the missing unified product/configuration model and the missing stable one-time entitlement. The public presentation still treats Act It Out and Draw It as separate games, setup defaults differ from the proposed offer, there is no canonical `/family-game-night` sales page, and existing Stripe purchase fulfillment applies to subscriptions and content packs rather than this game.

Smallest safe launch path:

1. Preserve all current room and API URLs as compatibility aliases.
2. Add one canonical Family Game Night entry/setup page backed by the existing room engine.
3. Add explicit setup fields for play style, length, mode mix, difficulty, and categories, with strict server-side validation.
4. Add one stable `family_game_night` entitlement fulfilled by Stripe webhook and restored from Firestore.
5. Gate host configuration only; never gate joining or play.
6. Instrument the create → join → finish → checkout → fulfilled funnel before private beta.

## Implementation progress

Completed on `feature/family-game-night-launch`:

- Moved Family Game Night prompts into a versioned normalized JSON bank with canonical answer, story group, Testament/book/reference, age, familiarity, sensitivity, status, and per-mode fields.
- Expanded Act It, Draw It, Don't Say It, and Guess It to 80 unique eligible answers each.
- Replaced the 161-outcome character-sum selector with SHA-256-derived deterministic selection without prompt or canonical-answer replacement.
- Added story-group avoidance, category/Testament/familiarity balancing, varied mixed-mode order, and a two-consecutive-mode limit.
- Replaced the accidental 19-ID free sampler with an explicit 32-ID/32-answer sampler and server-side isolation.
- Added bounded browser-session recent-prompt memory and graceful relaxation when a filtered pool is small.
- Expanded all 18 Family Bible Bee named decks from 12 to 40 references and removed silent modulo passage cycling.
- Added overlap-aware Bible Bee selection, varied format ordering, format-specific content difficulty preference, and recent-reference avoidance.
- Added a standalone content validator plus property-style replay tests over thousands of deterministic seeds.
- Added objective editorial/clue/playability checks, a bounded human-review queue, and committed content-health reports.
- Added setup capacity guidance that disables unsupported round lengths before submission while preserving server-side recoverable errors.
- Added a 30-day TTL and corruption-safe parsing to the bounded recent-content history.

- Added the canonical, indexable `/family-game-night` product page.
- Added a dedicated `/family-game-night/play` parent-friendly setup flow.
- Added strict server-side validation for play style, length, mode, difficulty, and categories.
- Added deterministic mixed rounds containing Act It, Draw It, Don’t Say It, and Guess It.
- Added a stable 24-prompt free sampler, 10-round enforcement, and six-player free-room cap.
- Added full-library configuration for entitled hosts while keeping joined players ungated.
- Added one-time Stripe checkout and webhook fulfillment for `family_game_night` ownership.
- Unified visible in-room mode names and Family Game Night room branding.
- Added an admin launch-funnel dashboard for create, join, start, finish, checkout, cancel, and fulfillment totals.
- Completed the first-party funnel with session-deduplicated sales-page/setup views and progressively enhanced Play Free/Unlock CTA events.
- Added an optional anonymous post-game beta survey and admin summary for enjoyment, favorite mode, play-again intent, and quotation consent.
- Verified the public and setup pages at 320 px with no horizontal overflow or browser errors.

### Launch analytics and beta feedback

The aggregate funnel document at `analytics/family_game_night_funnel` counts sales-page views, Play Free clicks, Unlock clicks, setup views, room creation, first join, start, and finish. Checkout start/cancel/fulfillment retain their existing aggregate analytics documents. Page views are counted once per browser session, obvious bot user agents are skipped, CTA beacons are CSRF protected and rate limited, and analytics failures never block navigation.

Feedback responses are written to `family_game_night_feedback` with `enjoyment` (1–5), `favoriteMode`, `playAgain`, optional text up to 500 characters, anonymous-quotation consent, team mode, round count, game mix, and a server timestamp. The response does not contain a room code, player identity, email, prompt, answer, drawing, score, child name, or age. Only a joined player or the host of a finished Family Game Night may submit, and the browser session is limited to one response for that completed room.

Admin analytics displays the complete funnel and safe-denominator conversions plus an aggregate feedback summary and recent comments. Jinja escaping is explicit for submitted comments, and quotation approval is displayed beside each comment.

## Architecture and file map

- `app.py`: Flask application, blueprint registration, OAuth/session hydration, lightweight CSRF middleware, legacy billing route adapters, and global application configuration.
- `faithsparks/views/act_it_out.py`: game prompts, room persistence helpers, round builder, scoring/state machine, all Act It Out and Draw It routes, authorization, join/profile flows, drawing and host actions.
- `templates/group_games.html`: group-game hub; currently presents Bible Bee, Act It Out, and Draw It as separate cards.
- `templates/act_it_out_home.html`: signed-in host setup, recent rooms, how-to content, and code-based join form.
- `templates/act_it_out_join.html`: no-account player join/profile entry.
- `templates/act_it_out_room.html`: shared host, display, and player shell.
- `static/act_it_out.js`: state polling, role-specific rendering, timer, host actions, reconnect heartbeat, drawing/guess interactions, and lobby/game/results UI.
- `static/act_it_out.css` plus `static/bible_bee.css`: setup, room, mobile, and game component styling.
- `faithsparks/services/firestore.py`: production Firestore client. The game uses Firestore when available and a process-local, lock-protected dictionary otherwise.
- `faithsparks/views/billing.py` and `faithsparks/services/stripe_svc.py`: Stripe checkout, webhook, subscriptions, and one-time content-pack purchase infrastructure.
- `faithsparks/services/users.py`: user profile/plan helpers.
- `tests/test_act_it_out.py`: primary game integration and state-machine coverage.
- `tests/test_audit_plan_hardening.py`: shared security/billing hardening tests.

## Exact current route map

Canonical group-game pages:

- `GET /group-games` — game hub
- `GET /group-games/act-it-out` — Act/clue/Guess setup
- `POST /group-games/act-it-out/create` — create Act/clue/Guess room
- `GET /group-games/draw-it` — Draw setup
- `POST /group-games/draw-it/create` — create Draw room
- `GET /group-games/{act-it-out|draw-it}/host/<code>` — authenticated host
- `GET /group-games/{act-it-out|draw-it}/display/<code>` — public shared display
- `GET|POST /group-games/{act-it-out|draw-it}/join/<code>` — public player join
- `GET /group-games/{act-it-out|draw-it}/play/<code>` — joined player view
- `GET /group-games/{act-it-out|draw-it}/room/<code>/qr` — room join QR
- `GET /group-games/{act-it-out|draw-it}/room/<code>/avatar/<player_id>` — validated avatar image
- `POST /group-games/{act-it-out|draw-it}/rooms/<code>/delete` — creator/admin room deletion

State and control API:

- `GET /api/group-games/{act-it-out|draw-it}/rooms/<code>`
- `POST .../profile`, `.../start`, `.../correct`, `.../pass`, `.../clue`, `.../next`, `.../skip`, `.../end`, `.../play-again`, `.../heartbeat`, `.../drawing`
- `POST /api/group-games/{act-it-out|draw-it}/rooms/<code>/guess`
- `POST .../teams/rebalance`
- `POST .../players/<player_id>/team`, `.../away`, `.../remove`
- `POST .../close`

Legacy `/church-games` and `/api/church-games/act-it-out/...` aliases remain active. They should remain intact through launch.

## Current data and persistence model

A room document is stored under `act_it_out_rooms/<CODE>` in Firestore when the client is configured. Without Firestore, the same dictionary is stored in process memory under a re-entrant lock. Firestore writes use a transaction for room mutations; local mutations deep-copy under the lock. This is appropriate for the present scale, but multi-process local-memory deployment would split rooms between workers and must not be used in production.

Important fields include host email, timestamps/expiry, phase, game type, theme, team configuration, round count and generated rounds, active player/team, players and scores, round results, timer/deadline, drawing data, guesses, and final state. Active rooms expire after six hours; finished rooms after 30 minutes.

The host is authorized through the signed-in email and a recent-room session list. Players receive a room-scoped random player ID in the Flask session. Displays require only a valid code. Public room state omits the answer; the secret prompt is added only for the host and, except in Guess It, the active player.

## Prompt and mode model

Prompts are loaded from `faithsparks/content/family_game_night.json` by `faithsparks/services/game_content.py`. Each prompt has a stable ID, canonical answer/aliases, modes, Testament, book/reference, story group, category, difficulty, age floor, familiarity, per-mode instructions, forbidden words, progressive clues, sensitivity flags, publication status, and editorial version. Existing room payloads continue to use the compatible `act`, `clue`, `guess`, and `draw` fields.

Room creation currently accepts a single theme and a game type (`act_it_out` or `draw_it`). `Mix It Up` for Act It excludes drawing; Draw It always produces drawing rounds. Difficulty exists on prompts but is not accepted or filtered in room setup. The launch-plan category names do not map one-to-one to the existing Act and Draw theme sets. A canonical category mapping must be introduced instead of trusting labels posted by the browser.

## Authentication by role

- Host/setup/control: Google sign-in required; control endpoints also verify host ownership.
- Player join and play: no account required; room-scoped session identity required after joining.
- Display: no account required and deliberately public to anyone with the room code.
- Buyer/entitlement restore: no Family Game Night entitlement exists yet. A purchase must be associated with a stable authenticated user before checkout or by a secure claim/restore flow.

## Current configuration

- Play style: individual by default; optional teams.
- Length: 10 rounds by default; 10, 15, or 20 accepted.
- Mix: separate Act It Out and Draw It entry pages. Act setup mixes act/clue/guess by prompt; Draw setup is drawing-only.
- Difficulty: stored on prompts but not configurable.
- Categories: one theme per room, not multi-select.
- Timer: fixed at 45 seconds.
- Capacity: 12 individual or 40 team players.

## Existing test coverage

`tests/test_act_it_out.py` already exercises the hub and aliases, setup pages, theme-specific round generation, room creation, joins, QR/display, deletion authorization, expiry, avatars/profile editing, team assignment/rebalancing, player removal/away handling, host authorization, round start and state visibility, clue/Guess behavior, scoring and duplicate-action resistance, drawing validation/guesses/completion, stale connections, skip/end/replay, and final outcomes. CSRF is enforced globally by `app.py`; shared hardening tests cover CSRF behavior and Stripe error disclosure.

The suite could not initially run because the repository's `.venv` is malformed (it contains no conventional `python` or `pytest` entry point). This is a developer-environment defect, not an application failure. A clean temporary Python 3.12 environment is used for this audit.

Coverage still needed for the launch model:

- repeat webhook delivery and returning-customer integration tests against a Firestore emulator or Stripe test mode;
- paid host/free participant behavior;
- an unassisted multi-device production playtest and real beta-family behavior.

## Confirmed strengths

- Existing state machine is compact and can support the launch without a rewrite.
- Mutations are transaction/lock protected, reducing duplicate scoring races.
- Host controls are authorization checked.
- Secret answers are role-filtered server-side rather than merely hidden in the UI.
- Drawing/avatar MIME, base64, decoded size, and image validation are present.
- Players need no account and room joins are mobile-oriented.
- Refresh/reconnect, heartbeats, stale players, replay, manual close, and automatic expiry exist.
- CSRF middleware covers mutating routes, with explicit webhook/OAuth exemptions.
- Current routes have compatibility aliases, making a new product wrapper low risk.

## Static-inspection defects and inconsistencies

1. The proposed product does not exist as one route or one configuration. Draw It is a separate room type, while act/clue/guess are bundled under Act It Out.
2. Visible branding is still Act It Out/Draw It/Group Games, not Family Game Night.
3. Setup defaults are individual, 10 rounds, and one theme; the launch brief specifies teams, 15 rounds, whole-family difficulty, all categories, and mixed four-mode play.
4. Invalid theme and round values are silently replaced with defaults. Launch setup should return a recoverable validation error so malformed requests are observable and testable.
5. Category labels differ between Act and Draw prompt collections (`People Moments` vs `People & Places`, and others). A product-level category taxonomy is required.
6. Difficulty is present but unused. There are only `easy` and `medium` prompt values, so “Challenge” currently has no true hard prompt pool.
7. Resolved: Family Game Night now selects without prompt/answer replacement, avoids story clusters when possible, and balances/varies mixed modes.
8. There is no Family Game Night entitlement, price ID, checkout return, success state, or free/paid gating.
9. The setup and game pages are `noindex`; a dedicated indexable sales page is missing.
10. The game hub copy explicitly teaches customers that Act It Out and Draw It are separate products.

## Security and abuse risks

- Four-character room codes are intentionally low-friction; create/join rate limits and short TTLs reduce but do not eliminate enumeration. Do not expose secrets or personal data through display state.
- Display endpoints are public by design. The display must continue receiving only public state.
- Uploaded images are validated and size-limited, but data URLs live inside the room document. Monitor Firestore document size; sustained canvases can approach service limits.
- Local memory is safe only for one process. Production must have Firestore configured and working before launch.
- Host identity depends on an authenticated email. One-time checkout should require host authentication and webhook fulfillment must derive entitlement identity from trusted checkout metadata/customer details, not a client redirect.
- Webhooks must remain the source of truth. The success page may confirm but must not grant access by itself.
- Joining and all play endpoints must remain ungated for participants; otherwise a paid-host room can dead-end.

## Existing purchase and entitlement options

The billing system already supports Stripe Checkout, verified webhooks, Stripe customer IDs, subscription plan fields, and one-time pack purchases stored on a user as `purchases.<pack_slug> = true`. That pack mechanism is the closest reusable pattern.

Recommended implementation:

- Stable entitlement key: `family_game_night`.
- Stable checkout metadata: `entitlement_id=family_game_night`, authenticated `email`, and launch source metadata.
- Environment-backed one-time price ID, separate from subscription price IDs.
- Fulfill idempotently from `checkout.session.completed` into an explicit `entitlements.family_game_night` record (or the existing purchases map if migration cost is more important than semantics).
- Read entitlement on every setup render/create attempt using the normal user document, not the Stripe session.
- Gate only advanced room creation fields. A paid host's players never need entitlement checks.
- Make the free sampler playable without payment information.

## Prioritized implementation plan

### P0 — launch blockers

- Add canonical Family Game Night setup/landing route and product branding while retaining all old URLs.
- Implement and test a deterministic four-mode room configuration with strict server validation.
- Define the free sampler exactly, including which prompts are free, and enforce limits server-side.
- Implement stable one-time Stripe entitlement, webhook fulfillment, idempotency, and automatic restore.
- Verify production Firestore use, Stripe secrets/price/webhook, OAuth callbacks, CSRF, and error logging.
- Run an unassisted multi-device family playtest and fix only blockers/security issues.

### P1 — launch requirements

- Build the indexable sales page with free/complete comparison, founding-price deadline, FAQ, and checkout CTA.
- Add first-host onboarding, TV/display instructions, QR/typed URL, reconnect help, and support contact.
- Add funnel analytics before beta: landing CTA, setup viewed, room created, first player joined, game started, game finished, checkout started, checkout fulfilled/canceled.
- Test at 320 px, current iPhone Safari/Android Chrome, and common 16:9 displays.
- Conduct five unassisted beta sessions; launch only after four create and four finish successfully.
- Add a documented rollback procedure and a support-response playbook.

### P2 — after revenue validation

- Expand and editorially review prompt inventory, especially true challenge prompts.
- Add decorative animation, expansion packs, advanced administration, and deeper account settings.
- Consider richer room-code protection only if observed abuse warrants added friction.

## Improvements to the original 14-day plan

The original plan has the right outcome and discipline, but execution should change in five ways:

1. **Make the offer contract Day 1.** Freeze entitlement ID, free limits, price ID strategy, launch deadline/timezone, refund/support policy, and category/difficulty semantics before implementing UI.
2. **Move purchase plumbing ahead of sales/media work.** Entitlement is the highest-risk unknown and should be proven in Stripe test mode before screenshots or launch copy are finalized.
3. **Instrument before beta.** Beta families' recollections are useful, but create/join/start/finish funnel events provide objective evidence.
4. **Use one canonical acceptance test.** A fresh signed-in host creates the default free room, three signed-out players join, the display opens, all four modes appear, the game finishes, a test purchase unlocks paid setup, and a fresh session restores access.
5. **Separate human-only work from repository work.** Device playtests, family recruiting, video, outreach, and a real production purchase require an owner and scheduled time; they cannot be validated by automated repository work.

## Files inspected

`app.py`, `README.md`, `render.yaml`, `requirements.txt`, `requirements-dev.txt`, `faithsparks/views/act_it_out.py`, `faithsparks/views/billing.py`, `faithsparks/services/firestore.py`, `faithsparks/services/stripe_svc.py`, `faithsparks/services/users.py`, `templates/group_games.html`, `templates/act_it_out_home.html`, `templates/act_it_out_join.html`, `templates/act_it_out_room.html`, `templates/games.html`, `templates/games_detail.html`, `static/act_it_out.js`, `static/act_it_out.css`, `static/bible_bee.css`, `tests/test_act_it_out.py`, and `tests/test_audit_plan_hardening.py`.
