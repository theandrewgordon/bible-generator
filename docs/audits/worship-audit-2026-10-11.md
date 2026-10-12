# Worship Re-Audit — 2026-10-11

## Scope and method
- **Baseline:** `main` at `0e3f792`, after the full-audit and GUI fixes.
- **Setup:** the real app, signed in as an owner, with an in-memory Firestore stand-in, driven in Chromium on desktop (1366) and phone (390, touch). Each live screen ran in its own browser, standing in for separate devices.
- **Flows exercised:** first visit and tour; starter service; add and reorder on a phone; add a song by hand; import with AI turned off; review slides; PPTX build (rendered in LibreOffice); Go live; the remote, stage view and follow-along phones; blank and stage message; Wi-Fi drop on the remote; a second Go live; 250-song library load.
- **Checks:** axe WCAG 2 AA on 20 screens; sideways-scroll check on every page.

**Result:** the core is solid. There were 0 JavaScript errors and 0 server errors in any flow, and nothing scrolls sideways.
- The deck builds in 0.4s and renders cleanly.
- A remote tap reaches the main screen in 0.18–0.25s (0.8s on the first tap).
- Stage view and follow-along stay in sync.
- With AI turned off, import falls back to the local parser.

Three things matter before Sunday; the rest is polish.

## Status — fixes applied 2026-10-11

I re-ran the same browser flows afterwards. Every item below verified, and axe reports no violations on the presenter, follow-along or remote. Full suite: 991 passed; regression tests are in `tests/test_worship_reaudit_fixes.py`.

| # | Status |
|---|---|
| 1 Leader QR shown to the room | Fixed: only the follow-along code shows by default. Leader and stage codes sit behind **Show leader codes**. Q and the HUD Remote button always reopen with them hidden. The help guide is updated. |
| 2 Remote dead after a Wi-Fi blip | Fixed: shared `lockControls()` runs on reconnect. Verified: after going offline and back, 0 controls stay disabled, and Black screen works. |
| 3 CCLI credit line | Fixed: there's a "CCLI license #" field for the church owner under Manage church. Song edit now has CCLI song # and Copyright line fields. The title slide shows `Copyright line · CCLI Song # · CCLI License #` on the PPTX, the presenter and follow-along. "Public domain" is supported, and nothing is shown for songs without credits. |
| 4 Simple-mode nags | Fixed: Review shows no validation/approval warnings in Simple mode (6 → 0). Real warnings remain. |
| 5 "•••" menu | Fixed: chevron removed; bigger tap target on touch screens |
| 6 Quick Scripture | Fixed: Escape closes it. The mode buttons are a group with `aria-pressed`. |
| 7 Resources labels | Fixed: all fields labeled |
| 8 Follow-along contrast | Fixed: "Up next" and its label are now ≥ 4.5:1 |
| 9 Terms banner | Reworded as a notice; the Firestore check runs once per session, not on every page load |
| 10 Library payload | Fixed: the planner gets only the fields its JS reads (validation, sources and review history stay server-side) |
| 11 Projected details | Fixed: no key on projected title slides (stage view and the remote still show it). Section labels moved to PowerPoint presenter notes and hidden on the presenter. One font size per section. |
| Minor | "Add" buttons are named per song. Touch targets enlarged. The dev-only song store moved to `instance/worship-songs/`, so tracked `songs/` seed files are never modified. Pinch-zoom on the remote left as is (deliberate). |

---

## P1 — fix before Sunday

### 1. The leader-remote QR is shown to the whole room [verified]
- The presenter's setup screen shows three QR codes: Follow along, **Leader remote** and Stage view. That screen is what's on the projector when you open Go live.
- Pressing **Q** mid-service ("show follow-along code") brings back the same overlay, with all three codes.
- Anyone who scans the remote code (a curious kid, a visitor) can change slides, black the screen or end the session. No sign-in is needed.
- **Fix:**
  - Make Q show a follow-along-only overlay.
  - On the setup screen, show only the follow-along code by default. Keep "Copy remote" and "Copy stage view", and put the leader and stage QRs behind a "Show leader codes" button.

### 2. After a Wi-Fi blip, half the remote stays dead until reload [verified]
- I dropped the remote's network and tapped Next, then restored the network.
- The status returned to "Connected" and Next/Previous worked again.
- But **19 controls stayed disabled**: Black screen, Clear words, the slide jump list, stage message, timers, video, and End session. They came back only after a page reload.
- **Cause:** `setSending(false)` runs while `offlineLocked` is still true, so those buttons stay disabled. `connected(true)` re-enables navigation but never re-applies the `setSending` button state (`worship_live_remote.html`, ~line 204).
- **Fix (2 lines):**
  - Pull the disable loop into `lockControls()`.
  - Call it from both `setSending()` and `connected()`.
  - Add a browser test that goes offline, comes back, and checks that `#wr-blank` is enabled.

### 3. Copyright / CCLI line never reaches the slides [verified]
- Songs store `ccli_song_number` and `copyright_notice` (Add Song has both fields), and the licensing report uses them.
- But the PPTX, the presenter, and follow-along never show them. There is also no place to enter the church's CCLI **license** number.
- CCLI's streaming/display terms expect each song's first or last slide to carry title, writers, ©, and "CCLI License #". Without it, every deck needs hand-editing to be compliant.
- **Fix:**
  - Add a church-level "CCLI license #" setting.
  - Add a small credit line on each song's title slide (or last slide): `Writers · © notice · CCLI Song # · CCLI License #`.
  - Skip it for public-domain items.

---

## P2 — polish and cost

4. **Simple mode still shows every validation nag on Review.** Three items produced six warnings ("not validated against a second source", "no human approval"), including for the Scripture reading. In Simple mode the Go live preflight is already skipped (`worship_live_start`), but `worship_deck_review` ignores the mode. Hide those two warnings in Simple mode and keep the real ones (crowded slides, same background).

5. **The "•••" item menus are clipped and show a stray chevron** (desktop and phone). `.ws-menu>summary:after` adds "⌄" to the 32px "•••" button too, so it wraps and gets cut off at the row's edge. Fix: `.ws-item-menu>summary:after{content:none}`.

6. **Quick Scripture dialog** doesn't close with Escape (the tour does). Its mode tabs fail ARIA (`aria-required-children`): the buttons need `role="tab"`, or drop the `tablist` role.

7. **Song resources page:** the file upload and three selects (kind, key, …) have no labels (axe: critical).

8. **Follow-along "Up next"** fails contrast. The label is 2.65:1 and the text 4.23:1 on #050…, on the screen people read in a dim room. Lighten them to ≥4.5:1.

9. **The Terms banner says "required" but nothing requires it.** Build, Go live and imports all work without accepting. The banner shows on every visit until accepted, and each of those visits costs one Firestore read. Either enforce it on uploads/imports only (where liability is), or reword it as a one-time notice.

10. **/worship embeds every full song document.** `LIBRARY_SONGS = {{ songs|tojson }}` includes the lyrics, sources, validation and review history. The page JS uses only id, title, artist, version, key, type, validation status, and last_used. With 250 songs the page is about **740 KB**. Responses aren't compressed by Flask (check whether Render's edge compresses). Sending only those fields cuts this about 10×, which matters on church Wi-Fi and phones.

11. **Projected slide details:**
    - Title slides show "Key: D" to the congregation. The key belongs on stage view, which already shows it.
    - 12pt "VERSE 1"/"CHORUS" labels are projected; on light backgrounds they're nearly invisible and add noise.
    - Consecutive reading slides jump from 40pt to 48pt. Use one size per reading.

---

## P3 — minor
- **Library "Add" buttons** are all named "Add" for screen readers. Use `aria-label="Add {{ title }}"`.
- **Small tap targets on phones:** the Terms checkbox (13px), the service ↑/↓ buttons (about 24px), and the "•••" summaries.
- **Remote zoom:** the remote blocks pinch-zoom (`user-scalable=no`). That's a reasonable trade-off to prevent accidental zoom mid-service, so leave it.
- **Dev-only storage fallback:** with no Firestore credentials, it writes into the tracked `songs/` seed files, which creates git noise. Point it at `instance/worship-songs/`. Production refuses this fallback, so there is no prod impact.

## What's solid
- **Go live:** live in about 2.5s. Remote latency 0.2s. Stage view shows the clock, item x of y, key and next item. Follow-along is clean, with A−/A+ and keep-screen-on.
- **Wi-Fi drop:** the remote's offline banner appears and the remote resyncs to the right slide on reconnect. Only issue #2 remains.
- **Second Go live:** cleanly ends the previous session (old screens get 410).
- **Tour:** the first-visit tour opens once, takes focus, and closes on Escape.
- **Import:** with no AI key, it still produces a review page instead of failing.
- **PPTX:** valid 16:9, cropped backgrounds, per-line paragraphs, and 0.4s to build 9 slides (424 KB).

## Suggested order
1. #2 remote re-enable (2 lines + test)
2. #1 hide leader codes from the projector
3. #5, #6, #7, #8 (small CSS/markup)
4. #4 Simple-mode review
5. #3 CCLI credit line (needs the license # setting)
6. #10 trim library payload, #11 slide details, #9 terms decision
