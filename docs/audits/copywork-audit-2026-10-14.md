# Copywork Generator Audit — 2026-10-14

**Scope:**
- The core worksheet product: `/generate` (`views/worksheets.py`), verse sourcing (`verse_helpers.py`, `services/scripture.py`) and the PDF builder (`build_pdf.py`).
- Bundles, `/prints` (downloads and delete), `/regenerate`.
- The coloring and lesson-pack paths that reuse it.

**Baseline:** `main` at `8995b8b`.

**How it was checked:**
- I read the code end to end.
- I generated real worksheets and rendered them, covering short and long verses, all three learner levels, cursive, and custom text with `&`/`<` and long text.
- I ran two-family simulations against the real app with an in-memory Firestore and the AI stubbed.

Items marked **[verified]** were reproduced; **[verify]** needs your API keys.

**The big picture:** PDF building is fast (about 30 ms each) and the authoritative-scripture design is right. The serious problems are elsewhere:
- **Shared file names** let one family's custom worksheet or bundle reach another family.
- **The scripture safety net is fail-open**: when no licensed source answers, the AI writes the verse.
- **Every worksheet prints on two pages.**

## Status — fixes applied 2026-10-14

I re-ran the same two-family and translation simulations against the real app; both now behave correctly. `tests/test_copywork_audit_fixes.py` adds 12 tests, all failing on the old code. The full suite passes.

| # | Status |
|---|---|
| 1 Shared custom files | Fixed: custom worksheets get a private name (`custom-<family hash>-<random>`) and rebuild into it. Custom worksheets made before today point at shared names, so they are **not served**; people are asked to make them again. |
| 2 Shared bundle | Fixed: each bundle is a new temp file, deleted after sending |
| 3 AI-written Scripture | Fixed, fail closed: only translations with a real source are accepted (NIV/MSG get a friendly "choose one of …"). No source answering means "try again", not AI text. Half-verse ("a"/"b") references are cut from the real verse. Cached worksheets are reused only if their text was verified. bible-api.com gets one retry on 429. |
| 4 Safety check ignored | Fixed: custom text and title go through the free moderation endpoint and flagged text is blocked. The unused paid check was removed. |
| 5 Two pages | Fixed: always one page. The ESV/NLT notice is small print in the footer; KJV/WEB/custom have none. |
| 6 Long custom text | Fixed: tracing is at most 26 exact words, and custom text is capped at 600 characters (also in the form) |
| 7 Partial bundle | Fixed: if only one worksheet succeeds, it's sent |
| 8 Beginner coloring sliver | Fixed: copy text, trace size, then writing lines step down until coloring has at least 1.75 in |
| 9 Small copy text | Fixed: 12 pt when it fits (down to 10 pt for long passages) |
| 10 NLT verse numbers | Fixed in code (verse-number spans are dropped before tags are stripped). **[verify]** once with your API.Bible key. |
| 11 Delete | Fixed: shared verse files are kept; custom and coloring files are removed locally and from cloud storage |
| 12 Lesson-pack images | **Your call:** unchanged, same decision as billing #15 |
| P3 | Removed `test_chatgpt.py` and `generate_all_worksheets.py` |
| Also | `send_file` now uses absolute paths, so a single worksheet downloads correctly even when the working directory isn't the app folder (found by the new tests) |

**Note:** worksheets whose text came from the AI before today stay in storage, but are rebuilt from a real source the next time anyone generates that verse.

---

## P0 — one family can receive another family's content

### 1. Custom worksheets share one file per title [verified]
A custom worksheet is saved as `output/<slug of title>_DIY.pdf`, and also uploaded to storage under the same name. The default title is "Custom Text (User Submitted)", so **every family's untitled custom worksheet is the same file**. The same goes for any two families who pick the same title ("Memory verse", "Our family verse").
- *Simulated:* Alice made a custom sheet ("Alice loves Ruby and Sam. Our address is 12 Oak St."), then Bob made his. Both history entries point to `custom_text_user_submitted_DIY.pdf`, and **Alice's worksheet now contains Bob's text**. Bob's download would have served Alice's address.
- Thumbnails share the name too, and are cached publicly for a day.

**Fix:** give custom worksheets a per-owner unique name (owner hash plus random ID). Verse worksheets can keep sharing, because their content is identical for everyone.

### 2. Every bundle is the same file [verified in code]
Multi-verse requests write `output/worksheets_bundle.zip`, one path for all users, then send it. With 8 threads in one process (since the latency change), two families generating bundles at the same moment can receive each other's ZIP, including custom pages.

**Fix:** build each bundle in a per-request temp file and delete it after sending.

---

## P1 — accuracy, paper and broken results

### 3. When no licensed source answers, the AI writes the verse [verified]
`request_verse_data` asks the AI for the whole worksheet. It then swaps in real text only if `fetch_verse_text` finds a source; if not, **the AI's wording is printed as Scripture**. That happens for:
- **Any translation typed in parentheses:** "John 3:16 (NIV)", "(MSG)", "(NASB)". The version is never checked against the ones you're licensed for. *Simulated:* NIV and MSG worksheets were produced with AI-written text.
- **Letter-suffix references** ("Romans 8:28a"), which skip the API entirely.
- **Any outage of bible-api.com**, a free service with no uptime guarantee and rate limits. KJV and WEB silently fall back to AI text.

The attribution page then says "Quotations are shown verbatim", which is false in all three cases. Reproducing NIV and similar translations from an AI's memory is also a licensing problem.

**Fix:**
- Accept only the translations in `available_translation_ids()`.
- When no authoritative text comes back, **fail closed**: "We couldn't load that verse right now. Please try again."
- For a/b references, fetch the real verse, then keep the AI's split only if it's a verbatim run of the real text (`derive_traceable` already does that check).

### 4. The custom-text safety check is ignored [verified in code]
`ai_validate_custom_text(custom_text)` makes a paid AI call, and its result is thrown away. Anything typed is printed on a children's worksheet.

**Fix:** use the free `moderations` endpoint (already used by coloring) and block flagged text. Don't require "scripture-like": families legitimately write their own lines.

### 5. Every worksheet prints on two pages [verified]
`append_scripture_notices_page` adds a nearly empty "Scripture Attribution & Permissions" page to every PDF. That includes public-domain KJV/WEB, which need no notice, and custom text. Families print double the paper, and a 10-verse bundle is 20 sheets.

**Fix:** a one-line notice in the page-1 footer, only for licensed translations (ESV/NLT). Drop it for public-domain and custom pages.

### 6. Long custom text runs off the page [verified]
Custom text can be up to 2,500 characters. The whole text is traced, with no 26-word excerpt like verses get. The trace box runs past the footer, and "Write it yourself", "Think about this" and coloring end up off the page.

**Fix:**
- Trace a ≤26-word excerpt, as verses do.
- Shrink the copy box text for long passages.
- Cap custom text at what fits on one page (about 600 characters), with a friendly message.

### 7. A partly failed bundle returns an error, but charges [verified in code]
If 2+ worksheets are requested and only 1 succeeds:
- The ZIP is skipped (it needs 2 files).
- The request answers **500 "No worksheets were generated successfully"**, even though the PDF exists and a credit was charged.

**Fix:** send the single PDF.

---

## P2

8. **The beginner level squeezes coloring to a sliver [verified].** Five handwriting lines plus a long verse leave the coloring box about half an inch tall. **Fix:** scale the trace font or line count to fit, or reserve a minimum coloring height.

9. **The "Copy this verse" text is about 10 pt Helvetica**, small for early readers copying from it. Consider 12–14 pt, which matters most at the beginner level.

10. **NLT through API.Bible [verify with your key].** The code calls the *search* endpoint and strips HTML tags. API.Bible content marks verse numbers as `<span class="v">16</span>`, so stripping tags likely leaves the numbers inline ("16 For God so loved…"). Search can also return a near match rather than the exact passage. **Fix:** the passages endpoint with `content-type=text&include-verse-numbers=false`.

11. **Delete isn't complete.**
    - Deleting a worksheet removes the local file even when it's a verse PDF other families share. Their next download triggers a rebuild.
    - It never deletes the cloud copy, so a deleted custom worksheet (family text) stays in storage.

    **Fix:** don't remove shared verse files, and do delete the owner's custom file from storage.

12. **Lesson packs with coloring call the image model (gpt-image-1) for free**, up to 6 per hour per user. Each new verse and age combination is a paid image. This is the cost side of billing item #15; decide whether lesson packs go on credits or Plus.

## P3
- Letter size only. A4 printers scale it, which is fine; offer A4 only if overseas families ask.
- `test_chatgpt.py` and `generate_all_worksheets.py` at the repo root are stale scripts using old paths. Remove them or move them to `scripts/`.

## What's solid
- **Authoritative text:** used whenever a source is configured, cached in Firestore per verse and version. Older AI-text cache entries are upgraded lazily.
- **`derive_traceable`:** only accepts an AI excerpt that is a verbatim run of the real verse.
- **PDF build:** about 30 ms each, 74 KB. Letter size with safe margins. Special characters (`&`, `<`, curly quotes) render correctly.
- **Limits:** rate limits per user and IP, request length caps, and a 30-worksheet batch cap.
- **Download, delete and thumbnails:** safe path checks and an ownership check.
- **Verse cache:** a popular verse costs one AI call ever, not one per family.

## Suggested fix order
1. **#1 and #2:** unique custom file names and per-request bundles (privacy).
2. **#3:** fail closed on scripture; translation allowlist.
3. **#5:** one-page worksheets.
4. **#4, #6, #7:** moderation, long-text fit, partial bundles.
5. **#8–#11**, then **#12** with the billing decision.
