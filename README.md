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
