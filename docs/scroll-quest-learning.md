# Scroll Quest learning tools v1

This update adds optional learning alongside the verified Scroll Quest 0.2.1 browser release. Vendor files and their 425 manifest entries remain unchanged. `/labs/scroll-quest/play` provides a Learning together panel; served game HTML loads a small bridge for narration, pause/resume, task context and reviewed NPC conversation cues.

## Player features

1. **Narration:** Memory verses, story cards, closing verses, armor passages and reviewed dialogue have content-addressed reading cues. Existing game speaker buttons use the chosen voice; the panel also offers reading selection, replay, slower playback and automatic story reading. Warm narrator, calm guide and friendly companion are synthetic adult voices. Unknown dynamic text uses existing device speech. Audio stops on story changes, navigation and explicit Stop.
2. **Three-step hints:** A gentle nudge, clearer clue and current-task reminder use server-reviewed task labels and the current family role/counts. No helper can complete a task, award an item, change physics, or write adventure progress.
3. **Explanations and vocabulary:** Optional age-adjusted commentary explains the supplied chapter and unfamiliar words. It is labeled AI study help and shown separately from the exact Scripture.
4. **Memory practice:** Missing words, typed recitation and optional recorded recitation compare word order against the approved memory verse. Feedback allows retries and notes transcription uncertainty. No practice result measures faith or changes adventure scores.
5. **Character voices:** Opt-in narration gives reviewed fictional helper conversations a companion voice. Uncatalogued dynamic dialogue retains device speech. No invented divine speech or open-ended historical-character chatbot is introduced.
6. **Adaptive practice:** AI selects from the existing reviewed question bank and explains answers. Questions, answer options, correct answers and references remain canonical; younger-reader mode reduces distractors. Missed items are prioritized on the next practice, then leave that review list after a correct response. Optional recorded or typed answers are alternatives to buttons.
7. **Family discussion and recaps:** Brief story summaries, discussion questions and a separate browser-local practice summary support family review. The summary stores chapter visits/completion and practice counts, not names, recordings, transcripts, or assessments of faith.
8. **Printables:** A protected print view combines exact KJV memory copywork, the reviewed Bible connection, optional AI discussion/activity suggestions, ruled writing space and a drawing area. It supports browser Print / Save as PDF. The panel also deep-links to Faith Sparks copywork and coloring with the memory-verse reference prefilled.
9. **Languages:** Companion navigation and generated study help support English, Spanish, French, German and Portuguese. Original game screens, canonical quiz wording and KJV quotations remain English. Generated explanations are not presented as Bible translations. When generation is unavailable, the UI explicitly identifies the reviewed English fallback.
10. **Authoring and QA:** `scripts/scroll_quest_author.py` audits all 54 chapters without an API call. Optional draft mode proposes questions, fictional guide lines, clarity improvements and puzzle ideas as a JSON review artifact. Drafts are never published or placed into the player cache. The public helper API rejects authoring mode.

## Trusted content and API boundaries

`node scripts/scroll_quest_catalog.cjs` extracts metadata and fixed cues from the reviewed release without running level builds. It also extracts the engine’s armor passages and chapter bridges. `--check` makes CI reject a stale catalog; the catalog records the release engine SHA-256. Only reviewed source files should be processed by this maintainer tool.

Every new route is under `/labs/scroll-quest/learning/`; static companion assets use `/static/labs/scroll-quest/`. Existing sign-in and Plus/admin protection covers both. POSTs require the current CSRF token and opaque Labs-owner header, reject cross-site requests, limit input sizes, and apply per-owner request limits. AI calls also reserve the existing shared daily AI budget. No key is sent to the browser.

Study requests accept a chapter, predefined mode, reading level, supported language and sanitized task counts/role. They do not accept a freeform prompt, child name or conversation history. Responses use strict JSON Schema plus server validation. Canonical quiz content is always reconstructed from the trusted source bank. A narration request must identify a chapter cue or a generated artifact bound to that chapter; it cannot submit arbitrary text for paid speech.

The game iframe retains the existing account-scoped Storage adapter. The companion uses that same account prefix for preferences and practice counts. Requests and responses check the current owner; raw microphone results stay transient. The game’s adventure save format, backup flow and local multiplayer remain independent.

## Models, caching and limits

- Study/commentary and maintainer drafts default to `gpt-4o-mini` through Responses with strict structured outputs. `SCROLL_QUEST_TEXT_MODEL` can override the model.
- New narration uses server-side Realtime WebSockets with `gpt-realtime-2.1-mini`, configurable via `SCROLL_QUEST_SPEECH_MODEL`. It does not extend the legacy Speech endpoint used by other Labs. The implementation follows the current [speech guidance](https://developers.openai.com/api/docs/guides/text-to-speech) and [Realtime conversation protocol](https://developers.openai.com/api/docs/guides/realtime-conversations).
- Narration is PCM at 24 kHz, wrapped as WAV. Returned transcript words must match the approved input before audio is served or cached. A provider error or mismatch falls back to device speech; failed clips have a short cooldown to prevent repeated paid retries.
- Recorded practice uses `gpt-transcribe`, configurable via `SCROLL_QUEST_TRANSCRIBE_MODEL`, following the current [transcription workflow](https://developers.openai.com/api/docs/guides/speech-to-text). Browser recordings are converted locally to mono PCM WAV. The server validates/re-wraps PCM and permits at most 42 seconds (the UI stops at 40 seconds), 4 MB, 16-bit audio and a bounded sample rate. Only declared validated frames are sent to OpenAI. Compressed or malformed uploads cannot bypass the duration bound.
- Generation starts only after an explicit learning/reading action, or after the user enables automatic story/NPC reading. There is no campaign-wide pre-generation or frame-loop AI call.
- Reviewed narration and generated study help are cached by content, complete reviewed-catalog fingerprint, model/settings and version under `scroll_quest/learning/v1/` in the existing private storage bucket. A bounded in-process cache also works if object storage is temporarily unavailable: at most 192 entries and 48 MB. At most three cold narration generations run concurrently per process. Client object URLs are revoked when no longer needed.
- Budget weights are one unit for study/drafting, 12 for a new narration clip, and three for transcription. Units are the existing app’s rough spending weights, not dollar guarantees. Provider/project spending limits remain the financial backstop. Cache hits make no provider call.
- `SCROLL_QUEST_AI_DISABLED=1` disables new generation/transcription for this feature. The app-wide AI kill switch/budget is also respected. Reviewed English help, button/typed practice, device narration, printables and the adventure remain usable when AI is unavailable.

The UI labels AI-generated voices and commentary. Recordings require a deliberate Record click and microphone permission. Capture stops on Stop, panel close, page hide or visibility change; pending permission results are discarded if the panel closes. Faith Sparks does not persist recordings or recognized words. OpenAI processes microphone audio under the account’s provider data controls.

## Maintainer workflows

After importing a new reviewed browser ZIP:

```
python3 scripts/import_scroll_quest.py /path/to/scroll-quest-browser-VERSION.zip
node scripts/scroll_quest_catalog.cjs
node scripts/scroll_quest_catalog.cjs --check
python3 -m pytest -q tests/test_scroll_quest.py tests/test_scroll_quest_learning.py
node tests/scroll_quest_browser.cjs
node tests/scroll_quest_learning_browser.cjs
```

For content review:

```
python3 scripts/scroll_quest_author.py
python3 scripts/scroll_quest_author.py --draft 1-1 --output /tmp/eden-review.json
```

Draft mode uses the configured API/budget. A maintainer must review proposed facts, references, dialogue and puzzle feasibility before making a separate source-game change. It will refuse to save drafts into published content, static assets or templates. Structural audits do not certify theology or replace gameplay tests.

## Validation scope

Python tests cover source grounding, fixed quiz answers, fallback behavior, structured output validation, caches, budget checks, bounded microphone input, current narration protocol, transcript mismatch, artifact/chapter binding, CSRF/owner gates and authoring isolation. Browser checks exercise the actual game/learning panel, pause/resume, narration requests, three hints, multilingual help with unchanged KJV, typed/missing-word/recorded practice, adaptive questions, printables, recaps and narrow layouts. Provider calls and microphone streams are mocked in automated tests; these tests do not certify a production API key’s model permissions, a real voice recording’s recognition accuracy or sustained device performance.
