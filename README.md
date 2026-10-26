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
