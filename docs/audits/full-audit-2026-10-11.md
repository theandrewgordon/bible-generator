# FaithSparks Full Audit — 2026-10-11

Scope: whole repo at `f30b444`, with a deep pass on the worship slide builder (`/worship/build`, chunking, backgrounds, imports, Live Worship).

Baseline: **943 tests pass** (4m14s). Ruff (`F,B,S,E9`): no real defects beyond a few unused vars/imports. `pip-audit`: 128 advisories, nearly all `pypdf 5.9.0`, plus `flask 3.0.3`, `pillow 11.3.0`.

Every item tagged **[verified]** was reproduced (rendered deck, executed code, or confirmed in source). Items tagged **[verify]** depend on config I can't see (Render dashboard).

## Status — fixes applied 2026-10-11

| # | Status |
|---|---|
| 1 lyric paragraphs, 2 cover-crop images, 4 title sizing, 6 footer, 7 JPEG backgrounds (28 MB → 1.7 MB), 11 attribution chunking | Fixed |
| 5 whole-word split check (song-specific pair list removed), 8 build try/finally, 9 timeouts 90+90s, 10 pdftoppm `-scale-to 1920`, 12 one-field `last_used` update, 13 cache TTL 10s | Fixed |
| 14 polls/remote taps read state fields only (no `slides` payload), 15 live remote uses in-memory rate limit | Fixed |
| 3 `APP_ENV` in render.yaml + Render auto-detect, 16 `MAX_CONTENT_LENGTH` 30 MB + 413 handler, 17 lazy OpenAI client, 18 deps pinned/bumped (`pip-audit`: 0 known vulns), 19 SyntaxWarnings, 20 node_modules / flask_session removed | Fixed |
| 20 `.venv` in git history | Not done: needs history rewrite + force push; your call |
| 21 split `app.py` | Deferred: large refactor, separate PR |
| 22 seed lyrics | No change needed: seeding only runs for the default (your own) library, never other churches |

Regression tests: `tests/test_audit_2026_10_fixes.py` (13 tests). Full suite: 956 passed.

---

## P0 — fix before next Sunday

### 1. Multi-line lyric slides are malformed PPTX [verified]
`add_centered_textbox()` (app.py ~3265) does `run.text = "\n".join(lines)`. python-pptx 1.0 writes the raw LF *inside one `<a:t>`*. That isn't a valid OOXML line break. In LibreOffice every line except the last renders **left-aligned**; Google Slides/Keynote may collapse lines. This affects every lyric, divider subtitle, service, and attribution slide.

Fix (tested, renders correctly):
```python
for i, line in enumerate(str(text).split("\n")):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = line
    f = run.font; f.size = Pt(font_size); f.bold = bold; f.name = "Arial"; f.color.rgb = font_color
```
Add a test asserting no `\n` inside any `<a:t>` in a generated deck.

### 2. Images are stretched, not cropped [verified]
All 13 backgrounds are **1536×1024 (3:2)** and get placed at 13.333×7.5in (16:9). That's an 18.5% horizontal stretch. Uploaded service photos are worse: full layout stretches any aspect to 16:9, and split layout forces any photo into 7.0×7.5in. People in welcome photos will look distorted. The web/Live views use `object-fit: cover`, so the PPTX doesn't match what was reviewed.

Fix: one helper that center-crops with `ImageOps.fit(img, target_px)` (or sets `pic.crop_*`) before `add_picture`. Use it in `_apply_image_background` and the split layout.

### 3. Confirm `APP_ENV=production` is set on Render [verify]
`render.yaml` doesn't set `APP_ENV`, and it defaults to `"dev"`. If the dashboard doesn't set it either, production silently runs with:
- `secret_key = "dev-only-secret"` when `FLASK_SECRET_KEY` is missing. That makes every session, live, mobile, and musician token forgeable.
- `SESSION_COOKIE_SECURE=False`, ProxyFix off, and local-storage fallbacks enabled.

Fix: add `APP_ENV: production` to `render.yaml`, and make the app refuse to boot if `RENDER` is set while `APP_ENV != production`.

---

## P1 — slide builder correctness and robustness

4. **Long titles overlap the subtitle** [verified]. The divider title box is a fixed 1.65in at 60pt. A 3-line title runs over "Artist | Key". Shrink the title font by length (e.g. 60→48→40), or move the subtitle below the measured title rows.

5. **Lyric split heuristic uses substring, not word, matching** [verified]. `_line_continues_to_next()` uses `endswith(("or","in","to","so",…))`. As a result "Savior", "Creator", "again", "sin", "within", "Into" are all treated as "continues to next line", which pushes splits to odd places. Fix: `text.split()[-1] in {...}`. Also remove the song-specific hardcodes (`"cause you've got a lion"`, `"because i know"`). They are overfitted and will drift.

6. **Footer link is nearly invisible** [verified]. The 9pt hyperlink takes the theme hyperlink color (dark blue on dark backgrounds). Either drop the hyperlink and keep plain text in the chosen color, or remove the footer from lyric decks entirely. It's a distraction on a projector.

7. **Deck size: 28 MB of PNG backgrounds** [verified]. A 6-song auto-background set embeds about 12 MB, and the 1-song test deck was 4.3 MB. Converting backgrounds to 1920×1080 JPEG q85 brings the full set to about **1.8 MB total**. This one change fixes slow downloads, email attachments, and Google Slides import limits. It also fixes #2 if you crop to 16:9 during conversion.

8. **No cleanup on build failure** [verified]. `worship_build()` has no `try/finally`. A corrupt imported slide (`create_imported_presentation_slide` raises) leaks temp files and returns a bare 500. Wrap the build loop in `try/finally` for temp cleanup and flash a friendly error.

9. **Import timeouts exceed the worker timeout** [verified]. soffice (120s) + pdftoppm (150s) = 270s, which is more than `GUNICORN_TIMEOUT=240`. Gunicorn kills the worker mid-conversion, and the soffice child can be orphaned. Cap the conversions at about 90s + 90s.

10. **pdftoppm has no output-size cap** [verified]. A PDF with a giant MediaBox at `-r 144` rasterizes to gigapixels *before* PIL's thumbnail runs, which can exhaust memory or disk. Use `-scale-to 1920` instead of `-r 144`.

11. **Attribution slide can overflow**. All notices go into one 5in box at 20pt. With 4+ versions it spills. Chunk the notices or use 16pt.

12. **Building a deck rewrites every song** [verified]. `_touch_worship_songs_last_used()` does a full `get` + `set` of each song doc just to set `last_used`. It also invalidates the library cache, so the next page load re-reads the whole library. Use `ref.update({"last_used": date})` and skip invalidation (or patch the cache entry).

13. **Per-process cache with 2 workers**. `_worship_songs_cache` only invalidates in the worker that handled the edit. The other worker serves a stale library for up to 60s, which looks like "I saved and it didn't change." Fine to keep, but drop the TTL to ~10s, or store a `library_rev` in Firestore and compare it.

## P1 — Live Worship (cost and latency)

14. **Every poll reads the whole deck** [verified]. `/worship/live/state` calls `_get_worship_live_session()`, which fetches the full doc including `slides` (up to 750 KB). The presenter, stage, and remote each poll every 0.8–0.9s (0.18–0.25s when active). Three screens over a 90-minute service is about 15–18k reads, each shipping the full slide array.
    Fix: move `slides` to a sibling doc (`.../sessions/{id}/deck/current`) and read it only on page load or when `deck_revision` changes. The poll doc then stays at a few hundred bytes.

15. **Each remote tap = 2 Firestore transactions**. The control route runs a Firestore-backed rate limit (read+write) *and* the session transaction. That adds a full round trip of latency to "next slide." The capability token already authorizes the caller, so use an in-memory limiter for `worship:live-control`.

---

## P2 — app-wide

16. **No global upload cap**. `MAX_CONTENT_LENGTH` is never set. `csrf_protect()` reads `request.form` (parsing the whole multipart body to disk) *before* the per-route `content_length` checks run, and chunked uploads skip those checks entirely. Fix: `app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024`.

17. **App won't boot without `OPENAI_API_KEY`** [verified]. `verse_helpers.py` constructs `OpenAI()` at import, so rotating or removing the key takes the whole site down, including worship. Create the client lazily on first use.

18. **Dependencies**:
    - `pypdf 5.9.0` → ≥6.19 (many advisories; you parse untrusted PDFs).
    - `flask 3.0.3` → 3.1.3.
    - `pillow 11.3.0` → latest.
    - Pin `firebase-admin`, `stripe` (resolves to 16.x from `>=9`, a major API jump), `python-pptx`, and `gunicorn`. Unpinned prod deps make builds non-reproducible.

19. **SyntaxWarnings** in `faithsparks/views/lab_games.py` lines 370–395 (`\``). They will become errors in a future Python. Use raw strings or drop the backslashes.

20. **Repo hygiene**:
    - `node_modules/` (1,729 files, `openai` JS SDK) is committed and nothing imports it. Delete it along with `package.json`/`package-lock.json`.
    - `flask_session/` file is committed. Remove it and gitignore it.
    - `pack_*.pdf`, `test_chatgpt.py`, and `test_generate_one.py` sit at the root.
    - `.git` is 428 MB because a `.venv` was once committed. It's optional, but `git filter-repo --path .venv --invert-paths` would shrink clones a lot. History holds no secrets (checked for private keys and `sk-`/`sk_live_` keys).

21. **`app.py` is 10,049 lines / 143 routes**, and about 6,000 of them are worship. You've already started blueprints (`faithsparks/views/*`). Moving worship into `views/worship.py` + `services/worship_slides.py` would make the builder testable in isolation (the deck tests could import it without pulling in OpenAI and Firebase).

22. **Copyrighted lyrics in `songs/*.json`** (e.g. *Holy Forever*) get seeded into the default library. That's fine for your church under CCLI, but don't ship these as seed data for other churches. Replace them with public-domain hymns.

## What's solid (keep it)
- Live tokens live in the URL fragment, get exchanged for `HttpOnly; SameSite=Strict; path=/worship/live` cookies, and link-preview bots are blocked from the exchange.
- PPTX import validation: macro, external-link, and zip-bomb checks, `--safe-mode`, isolated LO profile.
- Background filenames are allowlisted (no path traversal). Templates use `tojson` with no unsafe `|safe`.
- Deck-review fingerprinting plus the preflight gate before going live.
- CSRF on all mutating routes, rate limits on AI and generation endpoints, and the Stripe webhook verifies its signature.

## Suggested order (smallest diff, biggest win)
1. #1 textbox paragraphs (≈10 lines) + regression test
2. #7 + #2: convert backgrounds to cropped 1920×1080 JPEG once, plus the crop helper for user photos
3. #3 `APP_ENV` in render.yaml + boot guard
4. #16 `MAX_CONTENT_LENGTH`, #17 lazy OpenAI client
5. #14 split the live deck doc out of the polled state doc
6. Dep bumps (#18), then the rest
