# AI Cost & Abuse Audit — 2026-10-14

**Scope:** every paid AI call in FaithSparks (OpenAI and Anthropic). For each: who can trigger it, how often, how big the input and output can get, what is cached, and what stops a runaway bill.

**Baseline:** `main` at `0729862`.

**How it was checked:** I read every call site and the route that reaches it: gating, rate limits, size caps, model, token caps, retries and caches. Dollar figures are rough, at list prices as I know them in mid-2026. **[verify]** them against the OpenAI and Anthropic pricing pages.

**The big picture:** most AI features are well fenced. They have per-user and per-IP rate limits, input caps, cheap models, and caches. Popular verses cost one AI call ever, and Scripture text comes from real sources, not the AI.

The risks are concentrated:
- **One feature runs on a frontier model with no output cap and no paywall.** That is Bible Bee custom games.
- **Two free features are expensive per call:** worship song import and lesson-pack images.
- **Nothing caps total spend.** Every limit is per account, and a Google account is free to make. A scripted abuser with 20 accounts gets 20× every limit, and nothing in the app notices.

## Status — fixes applied 2026-10-14

`tests/test_ai_cost_fixes.py` adds 7 tests. The 5 that touch changed code fail on the old code; the other 2 test the new budget module. The full suite passes.

| # | Status |
|---|---|
| 1 Bible Bee | Fixed: default model `gpt-4o-mini` (the `BIBLE_BEE_OPENAI_MODEL` env still overrides; reasoning options are sent only to reasoning models). `max_output_tokens` 2,500. Custom topics are **Plus-only**, with the box marked (Plus) and a link for free users; ready-made decks stay free. Custom games also have a 20/hr per-IP limit. Plans are cached by theme + age + rounds in `bible_bee_plan_cache`, so a repeat theme costs only the question review. |
| 2 Spend ceiling | Fixed in the app: `services/ai_budget.py`. Every paid call reserves units first: mini 1, transcription 3, gpt-4o or Sonnet 10, image 40. The daily total is kept in Firestore `ai_budget/<UTC date>`, with a per-feature breakdown. Past `AI_DAILY_BUDGET` (default **3,000 units**, roughly $3–12 a day) AI calls are refused with "AI features are resting for today". Cached worksheets, decks and the local song parser keep working. `AI_DISABLED=1` is the kill switch. Hitting the budget logs one error a day to the Render logs; the app has no email sender, so no alert email. **Your part:** the dashboard budgets. |
| 3 Song import | Fixed: the text sent to the AI is capped at **15,000** chars ("longer than one song"); a raw page paste can still be 60k because it's cleaned locally first. Limits are now 10/hr per user and 30/hr per IP. One client retry; the repair call has a 4,000-token cap and is budgeted. **Correction:** validation text never goes to the AI (it's checked locally), so it stays at 60k. **Model kept at gpt-4o / Sonnet on purpose.** The prompt's dedup and section rules are subtle, a worse parse costs an editor's time, and real volume is a few songs a week. The caps, limits and budget bound the cost. |
| 4 Lesson-pack images | **Your call:** still free, but now budgeted (40 units each), so they can't run away |
| 5 WeekFlow | Fixed, narrower than proposed: only **AI intake** fails closed in production. It's open to the beta list and admins; when the list is empty, admins only. The rest of WeekFlow is unchanged, so nobody loses their planner. Added a 40/hr per-IP limit, and intake and transcription are budgeted. |
| 6 Shared client | Fixed: `max_tokens` 1,200 on `call_openai` and `max_retries=1` on the shared client. Sermon highlights, Same Brain TTS and song import also use one retry and are budgeted. |

## Inventory

| Feature | Model | Who | Limit | Input cap | Output cap | Cache | Rough worst case per account per day |
|---|---|---|---|---|---|---|---|
| Worksheets, regenerate, lesson text (`call_openai`) | gpt-4o-mini | signed in, credits | 12/hr regen, plus credits | short prompt | none (JSON, small) | Firestore `verse_cache` | cents |
| Match games, theme labels, crossword clues | gpt-4o-mini | signed in | 12/hr user, 30/hr IP | short | none | partial | cents |
| Custom text and illustration moderation | omni-moderation | signed in | follows the feature | 600 chars | n/a | n/a | free |
| **Bible Bee custom game** | **gpt-5.5** (Claude Sonnet fallback) | **any signed-in user, no Plus** | 8/hr user, **no IP limit** | 120-char theme plus deck | **none on OpenAI** (2,500 on Claude) | **none** | **384 frontier calls; the largest unknown** |
| **Worship song import** | **gpt-4o** (or Claude Sonnet), plus a repair call | church editor (**anyone can create a church**) | 30/hr user, 60/hr IP | **60,000 chars** of lyrics | 4,000 | none | ~720 calls × ~$0.05–0.10 ≈ **$35–70** |
| **Lesson-pack coloring image** | gpt-image-1, plus gpt-4.1-mini prompt | signed in, **free** | 6/hr user, 18/hr IP, 20 s cooldown | verse | 1 image | per verse+age | ~144 images ≈ **$6–25** |
| Sermon highlights | gpt-4o-mini | church editor | follows the worship editor | `MAX_SERMON_NOTES_CHARS` | 700 | none | cents |
| WeekFlow intake (text, photo, voice) | gpt-4o-mini, gpt-4o-mini-transcribe | signed in; beta list **if set** | 20/hr user, no IP limit | 6,000 chars, 8 MB photo, 12 MB audio | 2,500 | none | ~$1–3 (mostly audio) |
| Same Brain voice (TTS) | gpt-4o-mini-tts | Plus | 40/hr | short | n/a | yes (built-in questions) | cents |

The song-link fetcher is SSRF-safe. It blocks private, loopback and link-local addresses on every redirect hop, and caps reads at 800 KB with a 10 s timeout.

---

## P1

### 1. Bible Bee custom games run on a frontier model, uncapped and free [verified in code]
`bible_bee_ai._ask_openai` defaults to `BIBLE_BEE_OPENAI_MODEL = "gpt-5.5"`.
- **No `max_output_tokens`.** Even with reasoning set to "low", the reply length is open-ended.
- **Two calls per game:** `create_one_off_plan` and `validate_questions`.
- **No Plus or credits gate.** Any signed-in account gets 8 games an hour, which is 384 frontier calls a day.
- **No IP limit and no cache.** The same theme ("Noah's Ark") is generated fresh every time.

This one feature can plausibly cost more than the rest of the app combined.

**Fix:**
- Default the model to gpt-4o-mini or gpt-4.1-mini. Question writing from a short theme doesn't need a frontier model; keep the env override for testing.
- Set `max_output_tokens` (~2,500, matching the Claude path).
- Make custom games Plus-only, or 1 credit each.
- Add an IP limit (~20/hr) next to the user limit.
- Cache plans by normalized theme + age group + round count (the fixed decks already need no AI).

### 2. No ceiling on total AI spend [verified in code]
Every limit is per account or per IP. Nothing counts AI calls across the whole app, and nothing turns AI off when something goes wrong. That covers a bug loop, a scraper, or one person with a pile of Google accounts. You'd find out from the invoice.

**Fix, in two layers:**
1. **Dashboard (you, 5 minutes, the real backstop):**
   - In OpenAI, put FaithSparks in its own **project** with a **monthly budget** and an email alert at 50% and 80%.
   - Do the same in Anthropic (Console → Limits).
   - Use a key scoped to that project.
2. **In the app (small):**
   - A single `ai_budget_ok(feature, weight)` check before every paid call. It keeps a Firestore counter per day (one doc, `Increment`). Weights are rough: mini text 1, gpt-4o 10, image 40.
   - Over `AI_DAILY_BUDGET` (env, in "units"), it refuses with a friendly "AI features are resting for today; try again tomorrow". Worksheets for cached verses keep working.
   - An `AI_DISABLED=1` env as a kill switch.
   - One email to you the first time the budget is hit each day.

---

## P2

3. **Worship song import is the priciest call per click [verified in code].**
   - gpt-4o with up to 60,000 characters of lyrics (~15k tokens in), up to 4,000 out, sometimes followed by a repair call.
   - Anyone can create a church and become its editor, so the route is open to any signed-in user.
   - A real song page is under 10,000 characters.

   **Fix:**
   - Cap each field at **15,000** chars. Lyrics are checked again after the link fetch (60k and 1,200 lines), so lowering both checks is enough.
   - Lower the limit to **10/hr** per user.
   - Try gpt-4o-mini or gpt-4.1-mini first and fall back to gpt-4o only if parsing fails validation.
   - Pasted pages can carry prompt-injection text. That's mitigated: output is JSON slides that an editor reviews before saving, so nothing more is needed.

4. **Lesson-pack images are free [verified in code].** gpt-image-1 is called for each new verse+age combination with coloring on. Limits are 6/hr per user and 18/hr per IP; the cache helps only for repeat verses.

   This is the same open decision as billing #15 and copywork #12: put lesson packs with coloring on Plus or credits, or keep them free under the budget from #2. Simplest: coloring is Plus-only, and the text-only pack stays free.

5. **The WeekFlow beta list is open when unset [verified in code].** `_has_beta_access` returns True when `WEEKFLOW_BETA_EMAILS` is empty, and it isn't in `render.yaml`. **[verify]** in the Render dashboard.

   If it's empty, any signed-in user gets 20 AI intakes an hour, each up to a 12 MB audio transcription plus a vision call. Cost per call is low, but:
   - **Fix:** fail closed in production (empty list → no access) until WeekFlow launches, then gate it by Plus.
   - Add an IP limit.

6. **`call_openai` has no `max_tokens` and the client has default retries.** The output is small JSON, so the risk is low, but a model glitch can run long, and each retry is billed. **Fix:** `max_tokens=1200` and `max_retries=1` on the shared client.

## P3
- **Model names are scattered** (env defaults in 6 files). Put them in one `ai_models.py` so a price change is a one-line switch.
- **No cost log.** Log `feature, model, input/output tokens` (from `response.usage`) to Firestore daily totals. It's the same counter as #2, so you can see which feature costs what.
- **Claude fallback:** Bible Bee and worship import retry on the other provider when one fails. That's fine; it just means both keys need a budget (#2).

## What's solid
- **Scripture is never AI-generated** (since the copywork fixes), and verse data is cached per verse and version. The most-used feature costs almost nothing at scale.
- **Rate limits** are Firestore-backed in production on every AI route, most with both user and IP limits.
- **Inputs are capped** everywhere, including song text fetched from a link (re-checked after the fetch).
- **Moderation** uses the free endpoint.
- **TTS** is Plus-only and cached.
- **SSRF:** the song-link fetcher is properly locked down.
- **Timeouts:** Bible Bee uses a 20 s timeout with no retries, so a slow provider doesn't stack up billed retries.

## Your checklist (dashboard, no code)
1. OpenAI → Projects → FaithSparks → **Limits → monthly budget**, with alert emails at 50% and 80%. Use this project's key on Render.
2. Anthropic Console → **Limits → spend limit**, the same way.
3. Render → Environment: check `WEEKFLOW_BETA_EMAILS` (set it, or leave it for fix #5 to close).
4. Decide #4: is coloring in lesson packs Plus-only or free?

## Suggested fix order
1. **#1** Bible Bee: cheaper model, output cap, Plus gate, IP limit, theme cache.
2. **#2** Daily AI budget counter plus kill switch (and your dashboard budgets).
3. **#3** Song import: 15k caps, mini-first model, 10/hr.
4. **#5, #6** WeekFlow fail-closed; `max_tokens` and retries on the shared client.
5. **#4** with the lesson-pack decision.
