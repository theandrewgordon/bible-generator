# Faith Sparks Printables

Faith Sparks Printables is a Flask-based web application for generating Christian homeschool worksheets, coloring pages, and worship slide presentations.

## Storage and Stateless Persistence Policy

This application is designed to run in stateless, ephemeral cloud hosting environments (such as Render).

* **Production Environments:**
  * Must **not** rely on the local disk for durable application state.
  * Local JSON fallbacks for songs and setlists are completely disabled.
  * Local SQLite-based analytics database (`analytics.sqlite`) is completely disabled (writes are no-oped and reads return safe empty structures).
  * Standard client-side signed cookie sessions are used for stateless auth.
  * Cloud Firestore is the **single source of truth** for songs, setlists, and application configurations.
  * Imported worship presentation originals and rendered slide images are stored privately in Firebase/Google Cloud Storage. Configure `FIREBASE_STORAGE_BUCKET` (or `STORAGE_BUCKET`); production presentation imports intentionally do not fall back to Firestore blobs or ephemeral disk.
  * **Fail-Fast Safety:** In production (`APP_ENV=prod` or `APP_ENV=production`), the application will fail loudly at startup if required cloud configurations (such as `FIREBASE_CREDS_JSON` and `FLASK_SECRET_KEY`) are missing, preventing silent fallbacks to local files.

* **Development/Local Environments:**
  * Local file fallback is allowed by default in development (`APP_ENV=dev` or `APP_ENV=development`).
  * If local file storage is explicitly needed in production-like environments, it can be bypassed by setting `USE_LOCAL_STORAGE=true` in the environment.

## Local Development Setup

### Python Version Compatibility
Since the codebase uses Pydantic (which relies on Rust-compiled `pydantic_core` and `jiter` extensions), it is highly recommended to use **Python 3.12 or 3.13** for local development.
Using pre-release or development builds of **Python 3.14+** will fail to build local wheels because CPython 3.14 removes deprecated internal unicode APIs used by older compilation toolchains.

### Installation
1. Create a virtual environment using Python 3.12 or 3.13:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   flask run
   ```

### Worship Presentation Imports

The `/worship` presentation importer accepts `.pptx` and PDF files. It requires:

* LibreOffice Impress (`soffice`) for PPTX-to-PDF conversion.
* Poppler (`pdftoppm`) for static slide rendering.
* `OPENAI_API_KEY` for AI-assisted sermon-note highlights. A deterministic, notes-only fallback is used if AI analysis is disabled or unavailable.

Set `SOFFICE_BIN` or `PDFTOPPM_BIN` when those executables are not on `PATH`. The included Dockerfile installs both conversion tools and is used by `render.yaml`.

### Reading Quest lab audio

Paused: Reading Quest is hidden from Labs, and its page/audio endpoints are disabled.
The prototype is preserved in source. Remove its `hidden` flag in the product registry
only when ready to restore access after review.

`/labs/reading-quest` uses server-side `gpt-4o-mini-tts` (coral, slow delivery)
with the existing `OPENAI_API_KEY`. Only fixed curriculum cue IDs are accepted;
no child profile, names, answers, or arbitrary text are sent to OpenAI. The page
labels the voice as AI-generated. Phoneme pronunciations still need human review.

Audio responses use `private, no-store`. Only the current page's memory holds
repeat-playback audio; there is no audio upload, database, disk, localStorage,
IndexedDB, or service-worker cache. Leaving the page discards the audio. Do not
add durable audio caching until voice and pronunciation approval.

Paid requests require session CSRF, have a 256-byte body limit, and are capped
at 20/minute and 100/day per keyed IP digest plus 500/day globally. Shared
Firestore limiter errors fail closed. The existing app-wide `AI_DAILY_BUDGET`
reserves 3 units per request; `AI_DISABLED=1` or
`READING_QUEST_TTS_DISABLED=1` disables generation. The OpenAI timeout is 12s,
with retries disabled. Local development without Firestore uses process-memory
limits/budget; production requires shared Firestore for cross-worker caps.
Any unavailable generation or playback falls back to device speech for the
page session. No pronunciation approval or durable audio generation is implied
by shipping this prototype.

Validation: `python -m pytest tests/test_reading_quest_audio.py tests/test_product_system.py -q`
and `node tests/reading_quest_audio.cjs` (mocked provider/browser, no paid calls).

#### Expanded sample curriculum

The lab has three independently selectable eight-activity adventures (24 total):
Word Garden (short a/i CVC words), Sound Shore (sh/ch and short vowels), and
Review Castle (cumulative words and short sentence choices). Each starts with a
fixed teaching example and an adult prompt. Readers can undo tiles, replay
instructions, and revisit up to three missed activities once before completion.
Stars reward completion, including supported attempts; they are not mastery scores.

This is original practice content, not a validated intervention, diagnostic,
placement assessment, or reproduction of Nessy/Reading.com curricula. It assumes
prior instruction in the letter sounds used (including f, short o, and the name
Sam for later activities). Grown-ups should model any unfamiliar sounds. Sentence
choices are listening/reading practice, not a test of independent oral reading.
Progress, mistakes, and stars exist only in page memory and reset on reload;
selecting an adventure restarts that adventure. No learner data is submitted.
New AI teaching and phoneme cues require listening review before durable caching.

Isolated phonemes are currently modeled by the grown-up, not generated by TTS.
Do not encode phoneme demonstrations as comma-separated letter names: a speech
model can pronounce `s, a, t` as ess/ay/tee even when told to produce sounds.
The voice models whole words; adult prompts explicitly distinguish sounds from
letter names. Dedicated phoneme audio must be listening-reviewed before use.

### Latin Quest Lab

“Ask about a card” supports typed or spoken study questions about a word’s meaning,
part of speech, noun gender/declension/nominative/genitive, verb conjugation, and
principal parts. Answers come from fixed approved card facts; no free-form AI
answers or guessed vocabulary are used. Unclear or missing words are left for
the user to clarify. Browser microphone permission is required. During a quiz, use “Ask about this card”
or speak a follow-up such as “What gender is it?” through the answer microphone.
The question stays open; known help is marked as assisted practice, and an
unknown study question is not graded as a wrong quiz answer.

`/labs/latin-quest` offers 5/10/15/20/30/50/100-question or all-available-card Latin practice: Latin → English
(the default), English → Latin, noun declension/gender/case forms, verb
conjugations/principal parts, grammar cards, and mixed sessions. Vocabulary prompts
can announce part of speech and noun declension/gender or verb conjugation.
The bank comes only from the supplied 140 photographed cards in
`faithsparks/content/latin_quest/cards.json`; the additional unresolved card is
retained as provenance but never quizzed. The Quizlet verification list is not used.

One listed English meaning or a reviewed equivalent is sufficient. Answers are
checked in the browser; no learner answers or recordings are stored by the server
or sent to OpenAI. Conservative checking avoids fuzzy Latin matches. The teacher
can explicitly accept an equivalent using “My answer was also correct.” Practice
counts are shared within one browser profile and stored in localStorage. They do
not sync with Jarvis/Home Assistant or across devices. Review missed cards uses
the selected practice mode. Longer sessions stop at the number of distinct cards
in the chosen mode (up to 140 for mixed practice). Microphone input uses the browser's speech-recognition
service; typed input remains available when voice recognition is unsupported.

#### Reusable OpenAI audio

Only fixed server-owned cue IDs can request audio. `gpt-4o-mini-tts` uses the existing
`OPENAI_API_KEY`, with coral/marin voices and restored Classical pronunciation
instructions. Pronunciation is an AI approximation and needs teacher review.
The game uses Classical pronunciation only for CC practice; explicit consonant, diphthong, vowel-length, and stress instructions guide generation, but clips still require teacher listening review. Changing those instructions invalidates both browser and cloud audio caches.
Audio is labeled AI-generated. Cache identity includes model, voice, pronunciation,
instructions, speed and text. Generated MP3s persist in the existing private
Firebase/Google Cloud Storage bucket under `latin_quest/audio/v1/`, and are reused
across sessions and deploys. The browser also caches clips in Cache Storage when
available, falling back to page memory. It never substitutes a device voice.

Generation requires a configured durable bucket. A shared cache hit makes no paid
call and needs no API key. Cache misses require CSRF, a 512-byte fixed-schema body,
per-IP request limits, per-IP/global daily generation caps, a per-clip generation
throttle, and the app-wide AI budget. Striped process locks coalesce concurrent
cold misses on the current single-process deployment; the shared per-clip throttle
bounds duplicate calls across processes. Generation has a 20-second timeout and
no retries. Storage write failures return the generated clip marked `UNCACHED`;
client reuse and generation throttles still apply, but shared persistence is not
claimed. `LATIN_QUEST_TTS_DISABLED=1` or `AI_DISABLED=1` disables new generation;
saved clips remain playable. No broad pre-generation is performed at deployment.

Validation: `python -m pytest tests/test_latin_quest.py tests/test_product_system.py -q`
and `node tests/latin_quest_core.cjs` / `node tests/latin_quest_voice.cjs`. Tests mock OpenAI/storage; they verify cache
hits do not call OpenAI, cache variants, fixed-cue validation, cost/error boundaries,
accepted meanings, wrong meanings, five/ten-question selection, hints and review.
