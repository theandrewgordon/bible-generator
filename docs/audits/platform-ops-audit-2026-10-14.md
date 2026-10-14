# Platform & Ops Audit — 2026-10-14

**Scope:** Docker image and Render config, gunicorn workers, threads and timeouts, health checks and deploys, CI, error reporting, backups, secrets and repo hygiene, dependencies, disk and memory use.

**Baseline:** `main` at `48b92d2`.

**How it was checked:**
- **Config and code:** read `render.yaml`, `Dockerfile`, `Procfile`, `.dockerignore` and the CI workflow.
- **Gunicorn:** ran it with the production flags and timed requests.
- **Dependencies:** `pip-audit` on `requirements.txt`.
- **Secrets:** scanned **all 1,101 commits** for secret patterns.
- **GitHub:** checked the repo's visibility and recent CI runs.

**[verify]** marks dashboard settings I can't see.

**The big picture:** the basics are good.
- Dependencies are pinned, with no known vulnerabilities.
- No secrets anywhere in git history.
- CI runs the full Python and Node test suites on every push, and is green.
- Production refuses to boot without a secret key.
- Requests have IDs and slow requests are logged.

There are three real problems:
- The worker restarts itself every ~1,000 requests, which freezes Live Worship mid-service.
- **The paid packs can be downloaded for free.**
- No backups **[verify]**.

---

## P1

### 1. The only worker restarts every ~1,000 requests, freezing Live Worship [measured]
Gunicorn runs with `--max-requests 1000` and **one** worker (`WEB_CONCURRENCY=1`, required for Live Worship's in-memory state). When the count is reached, the worker exits and a new one boots, importing the whole app. Nothing answers in between.

**Live Worship traffic adds up fast:**
- presenter and stage screens poll 4 times a second;
- the remote polls too;
- every congregation phone polls every 1.5 s.

With two screens and 30 phones that's about 30 requests a second, so **a restart every ~35 seconds through the whole service**. Each one freezes every screen and clears the in-memory state, which reloads from Firestore.

**Measured locally** (`/health`, 450 requests):

| Setting | Restarts | Worst request |
|---|---|---|
| `--max-requests 100` | 4 | **1.49 s** |
| no `--max-requests` | 0 | **0.03 s** |

Render's smaller CPU will be slower than this machine.

**Fix:** drop `--max-requests`. It guards against slow memory leaks, and Render already restarts on out-of-memory. If memory ever creeps, restart nightly instead.

### 2. Anyone can download the paid packs [verified]
- **The files are public.** The four 30-worksheet packs and the Mega Bundle are in `static/bundles/`, and Flask serves everything in `static/`. `GET /static/bundles/30_Pack_MegaPack.zip` returns **200 and the full 3.4 MB file** without a password.
- **The passwords are public.** The unlock passwords are hardcoded in `app.py` (`PACKS = {"sparks-mega-bundle": …}`), and the **repo is public on GitHub**, so anyone can read them.

**Fix:**
- Move the files out of `static/` into a private folder served only by the unlock route.
- Read the passwords from an env var.
- **Your call:** rotate the passwords. The current ones are public, but buyers may have them in their purchase instructions. People who already claimed a pack keep access through their account either way.

### 3. Backups probably don't exist [verify]
Firestore holds every account, church library, WeekFlow plan and purchase. Nothing in the repo or docs sets up backups. A bad deploy, a mistaken bulk edit or a misused delete (the app now has "Delete account") would be permanent.

**Fix, 5 minutes, about $0–1 a month at this size:**
- **Firestore:** daily scheduled backups, 14-day retention.
- **Storage:** confirm **soft delete** is on for the bucket (7 days is the default on newer buckets).

## P2

4. **The GitHub repo is public.** Beyond #2, anyone can read the audit reports (a map of what was weak), the WeekFlow demo IDs (audit chunk 6) and every internal detail. Nothing requires it to be public: Render and GitHub Actions both work with private repos, and Actions includes 2,000 free minutes a month. **Fix:** Settings → Change visibility → Private.

5. **Nobody hears about errors.** There's no error reporting. A 500 is a line in the Render logs that nobody reads, so a broken checkout or webhook could go unnoticed for days. **Fix:** Sentry's free plan (5k errors a month): `sentry-sdk[flask]`, switched on by `SENTRY_DSN`, with personal data off.

6. **Deploys aren't health-checked or gated [verify].**
   - `render.yaml` has no `healthCheckPath`, so Render switches traffic to a new deploy without checking it boots.
   - CI runs on every push, but Render deploys the same push in parallel; a commit that fails tests still goes live.

   **Fix:** `healthCheckPath: /health`, and in Render → Settings → Auto-Deploy, choose "After CI checks pass".

7. **PowerPoint imports can run out of memory [verify plan RAM].** Each import starts LibreOffice, roughly 200–300 MB, with no limit on how many run at once. Two church editors importing on a Sunday morning, on a 512 MB instance, means an out-of-memory restart. That's the same freeze as #1. **Fix:** one conversion at a time; the next waits.

8. **Slow work shares 8 threads with Live Worship.** Song import (up to ~60 s), PowerPoint conversion (up to 180 s), AI calls and image generation all hold a thread. With 8 busy, every screen's poll waits. **Fix:** 16 threads, which is cheap in a threaded worker, plus #7.

9. **Coloring images probably time out [verify in logs].** `ILLUSTRATE_IMAGE_TIMEOUT` defaults to **12 s** with one attempt, but gpt-image-1 usually takes 15–40 s per image, so lesson-pack coloring likely fails unless prod overrides it. Search the Render logs for "Illustrate image attempt". **Fix:** default 60 s.

## P3
- **No `500.html`**, so a server error shows the bare text "Server error". Add a friendly page with a way back.
- **Stale files:**
  - `app.json` (old Heroku config, Python 3.10);
  - `Procfile` (not used with the Docker runtime; it duplicates the Dockerfile command);
  - an empty `flask_session/` session file;
  - the `flask-session` package (sessions are cookies; it's unused).
- **The container runs as root.** That's low risk on Render, and a non-root user is a 2-line change.
- **Collection-group index:** `collection_group("members").where(email)` needs a collection-group index. It's only a fallback, since `worshipChurchIds` is the main list, but without the index it silently finds nothing.
- **Old `.venv` in history:** a past commit included a `.venv` (library files only, no secrets). It just makes clones bigger; leave it.

## What's solid
- **Dependencies:** pinned; `pip-audit` finds no known vulnerabilities.
- **Secrets:** none in 1,101 commits. Credentials are only in Render env (`sync: false`).
- **CI:** compile check, Node game tests, the Same Brain audit and the full pytest suite on every push. The last five runs passed.
- **Production guards:** no boot without `FLASK_SECRET_KEY`, and `RENDER` forces `APP_ENV=production`.
- **Logs:** request IDs, slow-request logging (≥1.5 s) and friendly 404/413 pages.
- **Disk:** generated files are cleaned after 7 days, and Storage is the source of truth, so Render's temporary disk is fine.
- **LibreOffice:** a private profile per conversion, and timeouts (90 s + 90 s) below gunicorn's 240 s.
- **Uploads:** capped at 30 MB.
- **Docker image:** tests, docs and local data are excluded through `.dockerignore`.

## Your checklist
1. **GitHub:** Settings → General → Danger Zone → Change visibility → **Private**.
2. **Backups** (Cloud Shell, or anywhere `gcloud` is signed in to the Firebase project):
   ```bash
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
   gcloud storage buckets describe gs://YOUR-BUCKET --format="value(soft_delete_policy)"
   ```
3. **Render:**
   - Settings → Auto-Deploy → **After CI checks pass**.
   - Check the instance RAM.
   - Add `SENTRY_DSN` after making a free Sentry project (Flask).
4. **Pack passwords:** decide whether to rotate them. If you do, set `PACK_PASSWORDS` in Render as `sparks-esv-print=NEWPASS,...` and update your sales listing instructions.
