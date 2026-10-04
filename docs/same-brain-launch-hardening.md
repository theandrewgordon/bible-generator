# Same Brain launch hardening

This pass builds on main `d6a240e` in `codex/same-brain-launch-hardening`. Changes are saved in the repository; this report is not a production deployment certification.

## Completed changes

- **Rematches and codes:** verified the existing seven-character entry flow, including lowercase input. Together rematches now link to one successor room, so both players rejoin the same fresh five. Async rematches preserve the opponent and prior score. Generated documents use create-only writes to avoid overwriting an existing code.
- **Question quality:** reviewed generated question templates and answer patterns, corrected mismatched prompts and options, fixed awkward wording, and audited all materialized rows. Repetitive variants are retired from selection, with their IDs retained so old challenges still resolve. Retirement requires the same age-pool membership, identical answer labels, and at least 80% prompt token overlap; it is a conservative reproducible heuristic, not an exhaustive semantic-similarity model.
- **Replay and age pools:** Daily selection stays deterministic within the selected age pool and date. Custom questions cannot enter Daily or Fresh. Fresh/category/theme selection preserves unseen questions before cycling through least recently seen questions and varies answer patterns. Small category pools fall back to the selected age pool rather than adult questions. Work/couples category controls are unavailable in youth modes. Every displayed question enters recent history, including received challenges.
- **Start Together:** both players use the room's stored IDs; answers remain hidden until both finish. Repeated submissions are idempotent and cannot change revealed answers. Third players and expired rooms are rejected. Progress and waiting state survive refresh; failed saves expose a retry action.
- **Group Brain:** exposed the existing mode on the public page and provided public, CSRF-protected endpoints. Age selection travels with the group. Private participant keys enable refresh recovery and live result updates; repeated joins do not consume extra places. Eight-player limits and expiration are enforced. Result keys are not disclosed in invite/result payloads.
- **Speech:** narration cancellation now invalidates pending requests and stops audio/browser speech. A delayed older response cannot restart over newer narration. Cache tests cover matching text/voice, changed inputs, custom-question bypass, and Plus access without buying live speech.
- **Avatars:** repaired the database-provider calls used by points and unlocks. Verified earned unlock persistence, repeat-purchase/reward idempotency, and ownership-aware display. Expired Plus selection falls back to the default. Rainbow remains unavailable. Local selfie values are restricted to image data URLs. The existing public shop visibility policy is preserved.
- **Analytics:** repaired Labs writes and added named rate outputs for completion, acceptance, invite completion, chains, rematches, creator payoff, returns, and sharing. Creator payoff and reshares attach to the saved original run. Canceled native sharing does not count as a share. Session deduplication storage is bounded.
- **Sharing and navigation:** result sharing preserves the original challenge so the creator can see incoming results. Native share cancellation is respected; denied/unavailable sharing falls back to copying. The dedicated copy action copies directly. Public links and codes work without Labs sign-in. Home, answer-back, reload, and stale async responses have explicit handling; custom labels are escaped and rapid double answers are blocked.

## Bank counts

The current source contains **1,515 questions**, including **224 source questions in each dedicated Kids, Tween, and Mixed pool**. After retiring 572 repetitive variants, **943 questions are selectable**. No exact normalized duplicate prompts or schema/audit violations remain. The source expansion is present; these figures do not establish how many historical “doublings” occurred.

| Pool | Source | Selectable |
| --- | ---: | ---: |
| Everyone | 1,515 | 943 |
| Kids | 224 | 147 |
| Tween | 224 | 162 |
| Mixed | 224 | 149 |

| Category | Source | Selectable | Kids | Tween | Mixed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Friends | 269 | 178 | 18 | 22 | 23 |
| Family | 398 | 249 | 48 | 45 | 42 |
| Chaos | 320 | 215 | 41 | 48 | 43 |
| Food | 174 | 105 | 23 | 27 | 20 |
| Travel | 179 | 127 | 21 | 23 | 23 |
| Couples | 278 | 165 | 23 | 27 | 20 |
| Work | 125 | 68 | 0 | 0 | 0 |
| Nostalgia | 185 | 111 | 19 | 24 | 18 |
| Would You Rather | 313 | 208 | 41 | 48 | 43 |

Categories overlap. Youth counts under Couples come from shared tags (for example food); the Couples category itself is hidden in youth mode. Retired rows remain addressable for old links. `scripts/audit_same_brain.cjs` regenerates `docs/same-brain-bank-audit.json` from the actual game source.

## Verification

- Python suite: **932 passed, 6 subtests passed**. New isolated-storage tests cover Together privacy/synchronization/idempotency/expiration/rematch authorization, Group access and capacity, analytics rates, speech caching, and earned avatars. Existing stale source assertions and incomplete test-app configuration were brought in line with current main.
- Runtime JavaScript: **39,600 simulated games**, four age pools, 5/10-question rounds, categories/themes, deterministic Daily, no immediate repeats, least-recent fallback, history migration/limits, custom-question exclusion, retired-ID exclusion, rapid-answer protection, escaping, and avatar entitlement checks.
- Dedicated narration and sharing JavaScript tests exercise delayed-response races, stopping speech, native-share cancellation, clipboard fallback, and original challenge links.
- Playwright: Chromium and WebKit at phone 390×844, tablet 820×1180, desktop 1440×1000. Independent browser contexts exercise challenge codes, async rematches, answer-back, reload, Together agreement, and horizontal overflow. Desktop runs additionally exercise failed-submit retry, both players entering the same Together rematch, Group refresh recovery, and updates when a third player joins.
- CI runs the JavaScript runtime/narration/sharing checks and regenerates the bank audit alongside the Python suite.

### Reproduce

```sh
python -m pytest -q
node tests/same_brain_runtime.cjs
node tests/same_brain_narration.cjs
node tests/same_brain_sharing.cjs
node scripts/audit_same_brain.cjs
```

Browser checks need Playwright with Chromium and WebKit installed. Start `python tests/same_brain_preview.py` in a separate terminal, then run `node tests/same_brain_browser.cjs`. The preview uses in-memory test storage and never writes gameplay data to production.

## Remaining environment limits

- WebKit with responsive viewports is not a physical iPhone/iPad test. Native share sheets, Facebook/Messenger embedded-browser behavior, device audio interruptions, and cross-device local-storage differences still need checks on actual devices.
- Storage tests use an isolated Firestore-shaped fake. Production Firestore transaction contention, indexes/rules, live quotas, and deployed configuration were not exercised. Rematch linking uses a transaction; concurrency guarantees depend on the real service.
- Speech tests mock the paid provider and cache I/O. Live voice quality and deployed cache performance remain unmeasured.
- Metrics are run-based percentages over at most 500 stored public runs. `returnRate` means returning browser page visits divided by page visits, not a longitudinal unique-user retention cohort. Share success means the browser accepted sharing/copying, not verified recipient delivery. These definitions are also returned by the metrics endpoint.
- No deployment or production migration is included. No schema migration is needed for these additive fields; old Group participants without a saved private key cannot retroactively recover access on a new device.
