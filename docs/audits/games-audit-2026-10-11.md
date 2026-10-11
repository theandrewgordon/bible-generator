# Labs & Games Audit — 2026-10-11

Scope: `/labs/games` (Gordon Ice Cream Town, Window Washing, Mail Run, Family Stables, Same Brain), `games-core.js`, the Labs server endpoints, plus a lighter pass on Speed Die online, Family Game Night and Bible Bee. Baseline is `main` at `930773a` (Ice Cream Town rolled back).

How it was checked:
- Every game was played in headless Chromium at iPad size with touch: load, create a player, start, then 60 random taps.
- I traced every runtime patch in `lab_games.py` against the current game files.
- I measured per-request Firestore reads and writes from the code.

**Result: 0 JavaScript errors across all five games.** The problems are cost, payload, fragility and device-local saves, not crashes.

## Status — fixes applied 2026-10-11

| # | Status |
|---|---|
| 1 Same Brain metrics | Fixed: admin-only (`ADMIN_EMAILS`), 10-minute cache (`?fresh=1` to bypass), newest-first sample |
| 2 Runtime patch layer | Fixed: patches written into the game files; ~1,200 lines of request-time patching deleted |
| 3 Payload/caching | Fixed: `/static/vendor/littlejs-1.18.19.min.js` (180 KB) for 3 games; Window Washing's modified engine extracted and minified (193 KB); vendor files cached immutably; `games-core.js`/`games-ui.css` revalidate (304) instead of re-downloading; `debugShowErrors()` removed so an error can never replace a game with a red debug screen |
| 4 Progress only on device | Fixed for milestone stats: best score, highest level, stars, completions and XP sync per player through the roster (merged by max, throttled to one save per 15 s). Mail Run's and Family Stables' own internal saves still live on the device |
| 5 Speed Die polling | Fixed: ETag/304 for unchanged rooms (verified: 34 of 59 polls were 304 in the two-device browser test); polling stops after 2 hidden minutes and resumes on return |
| 6 Same Brain limits | Fixed: points 60/h, TTS 40/h, analytics 300/h per user (in-memory); funnel counters sharded ×10; public analytics limiter moved off Firestore |
| 7 iPad name keyboard | Fixed: name box focused inside the tap |
| 8 FGN/Bible Bee polling | Unchanged (fine at family scale) |
| 9 Behavior tests | Added `scripts/games_smoke.py` (browser smoke test, all 5 games pass) and `tests/test_games_audit_fixes.py` |
| 10 Tagify | Fixed: self-hosted `tagify-4.39.0` (the version the CDN was serving) |

---

## P1 — fix soon

### 1. Same Brain metrics: open to everyone, costly per load, and sampling the wrong runs [verified]
`GET /labs/games/same-brain/metrics` only checks that someone is signed in. Any Google-signed-in user can read your funnel and business metrics.

Each hit makes about **800 Firestore reads** (2 counter docs + `limit(500)` runs + `limit(300)` question stats), with no caching. About 60 hits a day uses up the free read quota.

`limit(500)` has no `order_by`, so as data grows the dashboard computes rates from an arbitrary 500 old runs, not recent ones.

**Fix:** admin-only, cache the result for 10 minutes, and `order_by("updatedAt", DESCENDING)`.

### 2. The runtime patch layer is mostly dead weight and fragile [verified]
`_apply_runtime_game_patches` is about 1,200 lines of string find-and-replace that runs on every game load.
- **Ice Cream Town:** 21 of 24 patches match nothing. A further 75-line block (`replace_last` patches, lines ~346–421) can never run because an earlier `return html` comes first. I checked each one: the fixes are already in the restored file, so nothing is lost. But nobody would know the patches stopped applying, which is exactly what happened during the rollback.
- **Window Washing:** all 19 patches still apply, about 60 ms of CPU and two copies of a 760 KB string on every load.

**Fix:** write the patched output into the game files once, delete the patch function, and keep the tests (they already assert on the final HTML).

### 3. Every play re-downloads about 0.8–1.4 MB, including a debug game engine [verified]
- All four arcade games use the **debug build of LittleJS** (`littlejs.js`, 631 KB, full of `ASSERT`s). The minified build is 180 KB.
- Ice Cream Town, Mail Run and Family Stables load it from `cdn.jsdelivr.net` with no integrity hash. If jsdelivr has an outage or a bad push, three games break.
- Window Washing pastes the whole engine inline, so its HTML is 737 KB.
- Game HTML and `games-core.js` are sent `Cache-Control: no-store`, so nothing is cached between plays.

**Fix:** self-host `littlejs.min.js` under `/static` with a versioned URL and a long cache, and point all four games at it. Let `games-core.js` and `games-ui.css` cache the same way. Keep `no-store` only on the HTML, which then shrinks to roughly 30–150 KB.

### 4. Game progress lives only on the device [verified]
Player names sync to the account through `/labs/games/roster`. Levels, scores and resume state are only in `localStorage`, under keys like `tessasGames:gordon-window-washing:progress:<id>` and `caseyMailProfilesV1`. That has two consequences:
- Progress doesn't follow a child from the iPad to the laptop.
- Safari may clear script-written site data after about 7 days without a visit, so a kid who skips a week on the iPad can lose their levels.

**Fix:** extend the roster sync with a small per-player progress summary (level, best score, stars). Keep `localStorage` as the working copy and merge by "highest wins". Don't sync the 22 KB Window Washing resume snapshot.

---

## P2 — cost and abuse limits

5. **Speed Die online re-sends the whole game state on every poll.** Each device polls every 1.5 s (every 5 s even when the tab is hidden), and each poll returns the full room state. With custom token pictures that can be up to 850 KB. Four devices over two hours is about 19k reads and potentially gigabytes of transfer.
   - **Fix:** `GET /rooms/<code>?since=<revision>` returns `{unchanged:true}` when nothing moved. Stop polling after 2 minutes hidden and resume on `visibilitychange`.

6. **Same Brain write endpoints have no rate limits.**
   - `/same-brain/points` awards bits for any new `eventId`, so a script can mint unlimited cosmetics currency. Each call is also a Firestore transaction.
   - `/same-brain/tts` is Plus-only but unlimited: 500 characters per call, and custom questions bypass the audio cache, so OpenAI cost is uncapped.
   - `/same-brain/analytics` does about 3 writes per event into one hot counter doc (`analytics/same_brain_funnel`). Above roughly 1 write per second sustained, increments contend and are silently dropped.
   - **Fix:** add per-user limits with the in-memory limiter (`local_only=True`), e.g. 60 points and 40 TTS calls per hour. Shard the funnel counter (N docs, pick one at random) or count only run-level events.

7. **On iPad, "New Player" doesn't open the keyboard.** The name box is focused inside `setTimeout(..., 0)`, and iOS only opens the keyboard for focus that happens directly inside the tap. In emulation focus stayed on the button, so typing went nowhere. Kids have to tap the box first.
   - **Fix:** call `input.focus()` synchronously right after the dialog is added to the page (`games-core.js`, around line 529).

8. **Family Game Night and Bible Bee** poll every 3 s per device. That's fine at family scale; the `since=` approach from #5 applies when it matters.

---

## P3 — maintainability

9. **The tests pin implementation strings rather than behavior.** For example, `assert "vec2(1.55,1.42)" in html`. That's why the rollback meant rewriting tests. Prefer engine-level node tests (like `tests/ice_cream_orders.test.cjs`) plus one browser smoke test per game: load, create player, start, random taps, assert no errors. The script used for this audit does exactly that and could become `tests/games_smoke.browser.cjs`.

10. **Outside games but found here:** `templates/generate.html` (the copywork generator) loads `https://cdn.jsdelivr.net/npm/@yaireo/tagify` with **no version**. A new major release of that library could break the main generate page without warning. Pin the version and add an integrity hash.

11. **Leave the legacy storage keys alone** (`tessas_games_*`, `caseyMailProfilesV1`, `windowWashSave_*`). Renaming them would orphan existing saves.

---

## What's solid
- No runtime errors in any game under touch emulation and random input.
- The roster endpoint sanitizes input, merges by id or name, caps at 8 players and checks CSRF.
- Every Same Brain write checks CSRF. Points and unlocks use transactions with idempotent event ids.
- The Speed Die engine runs outside the Firestore transaction, with optimistic revision checks and action receipts. The design is good; the only problem is how much each poll sends.
- Labs pages send `noindex` and `no-referrer`, and require sign-in plus an optional beta allowlist.

## Suggested order
1. #1 metrics lockdown (small)
2. #3 self-host minified LittleJS + caching (small, big speed win)
3. #2 write patches into the files and delete the patch layer (medium, removes ~1,200 lines)
4. #6 rate limits (small)
5. #7 iPad focus (tiny)
6. #4 progress sync (medium)
7. #5 Speed Die `since=` (small)
