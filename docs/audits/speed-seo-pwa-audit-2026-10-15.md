# Speed, SEO & PWA Audit — 2026-10-15

**Scope:** page weight and load speed of the public pages; search-engine basics (indexing, sitemap, titles and descriptions, canonical, social previews, structured data); the installable app (manifest, service worker, offline).

**Baseline:** `main` at `411557f`.

**How it was checked:**
- **Page loads:** real headless Chromium at phone size (390×844, 2× pixels) through gunicorn with the production config, on 15 public pages. Recorded requests, bytes, server response time, LCP (when the main content shows) and layout shift.
- **SEO:** parsed every sitemap page's `<head>`.
- **PWA:** reviewed the manifest and service worker.

This workspace and your Mac's linked environment can't reach the live site, so the CDN and compression checks are **[verify]**, with a command below. Render compresses responses (gzip/Brotli) by default.

**The big picture:** the site is already fast. Most public pages are **50–250 KB in 3–5 requests**, the server answers in 10–90 ms, and main content shows in under 0.4 s locally. The findings are a few specific heavy spots and SEO gaps:
- a 2.4 MB image on every game page;
- the worksheet generator jumps while loading, and is hidden from Google;
- a sitemap entry that leads to a sign-in page;
- generic or duplicated descriptions.

## Status — fixes applied 2026-10-15

`tests/test_speed_fixes.py` adds 6 tests. The full suite passes (1,087). Re-measured in the browser after the fixes.

| # | Status |
|---|---|
| 1 Avatar sheet | Fixed: `avatar-sprite-600.jpg` is **83 KB** (was a 2.4 MB PNG). Same 3×3 layout, 200 px per avatar, cached 30 days. The old PNG is deleted. |
| 2 `/generate` hidden | Fixed: no longer `noindex`, and one description, set the same way as other pages |
| 3 `/generate` jump | Fixed: page CSS and the Tagify stylesheet moved into `<head>`. Layout shift **0.24 → 0.000** (phone) and **0.34 → 0.003** (desktop). |
| 4 Re-checked static files | Fixed: `?v=` equal to the deploy version → `max-age=31536000, immutable`. Hand-numbered `?v=7` files still revalidate, so a forgotten bump can't strand an old file. Unversioned images: 1 day. |
| 5 Sitemap | Fixed: `/games` removed. The `/browse/<slug>` collection pages added (game-type collections skipped, since they redirect). All 23 URLs open for a signed-out visitor (tested). Worship guides are **your call**. |
| 6 Descriptions | Fixed: one description and one canonical on every sitemap page (tested). Unique descriptions for Family Game Night, Plus, Verse of the Week, Start Here, Terms, Privacy and Copyright. `/same-brain` has a description and canonical. Home, Browse, the collection pages and Games no longer print duplicates. Home's social image is its own hero again. |
| 7 Service worker | Fixed: the cache name comes from the deploy version, so old copies clear on each deploy. Only CSS, JS and image files outside tutorials, stock images and worship media are cached, up to 60 entries. It still never caches pages. |
| P3 offline page | Fixed: a standalone `/offline` page with no user data on it, shown when a page can't load at all (verified with the browser offline) |
| P3 Verse of the Week | Fixed: a failed verse lookup isn't retried for 2 minutes, so an outage doesn't make every visitor wait for the timeout |
| P3 logo | Fixed: structured data points at the 512 px logo instead of the 900 KB one |
| P3 stock images, collection pictures, archive idea | Unchanged (**[verify]** whether `CopyworkStock` is used; content work) |

### Measured before the fixes (phone size, local)
| Page | Requests | KB | LCP | Layout shift |
|---|---|---|---|---|
| `/` | 4 | 240 | 260 ms | 0 |
| `/generate` | 5 | 171 | 184 ms | **0.24 (0.34 on desktop)** |
| `/browse` | 4 | 122 | 152 ms | 0 |
| `/family-game-night` | 4 | 63 | 192 ms | 0 |
| `/same-brain` | 3 | 255 (one HTML file) | 252 ms | 0 |
| `/verse-of-the-week` | 3 | 53 | 392 ms* | 0 |
| others (`/families`, `/churches`, `/play`, `/plus`, `/prepare`, `/start-here`, `/lesson-pack`) | 3–4 | 52–229 | 88–248 ms | 0 |

\*Waiting on bible-api.com; see #4.

---

## P1

### 1. A 2.4 MB image loads on every game page [verified]
`static/bible_bee_avatars/avatar-sprite.png` is a **1200×1200 PNG, 2.4 MB**. It holds the nine picture avatars, now the only avatars, and `bible_bee.css` loads it on every Bible Bee, Act It Out, Draw It and Family Game Night page, including the **join page kids open on their phones over church Wi-Fi**. Thirty phones joining is about 70 MB through one connection, before anyone plays.

**Fix:** re-encode at 600×600 (each avatar shows at most ~100 px) as WebP with a JPEG fallback, about 60–120 KB, and cache it long-term.

### 2. The worksheet generator is hidden from Google [verified]
`base.html` adds `noindex` to everything under `/generate`. That's the page people actually search for ("printable Bible copywork worksheets"), it works without signing in, and it already has its own title, description and social image. It also prints **two** description tags.

**Fix:** let `/generate` be indexed. Keep `noindex` on the genuinely private pages (`/prints`, `/download`, `/regenerate`, `/billing`, admin). Use one description tag.

## P2

3. **`/generate` jumps while loading [measured].** Layout shift is **0.24 on phones and 0.34 on desktop**; Google rates anything over 0.25 as poor. The page's 370 lines of CSS and the Tagify stylesheet sit at the **bottom** of the page, so the browser paints, then restyles and pushes the form down. It's not Tagify or fonts: with Tagify blocked the shift stays at 0.33, and the site uses system fonts.

   **Fix:** move that `<style>` and the Tagify `<link>` into the page's `<head>` block.

4. **Unchanged static files are re-checked on every page view [verified].** `theme.css?v=…`, `darkmode.js?v=…` and the page CSS carry a version in the URL but are sent `Cache-Control: no-cache`, so every navigation makes a round trip per file to ask "changed?" (304). On phones that's several extra trips per page. Only `/static/vendor/` files are cached long-term today.

   **Fix:** when the URL has the current `?v=`, send `public, max-age=31536000, immutable`. Cache unversioned images for a day.

5. **The sitemap includes a sign-in redirect and misses the product pages [verified].**
   - `/games` is in the sitemap but redirects to Google sign-in, so crawlers hit a login page.
   - The six collection pages (`/browse/advent`, `/browse/easter` …), which have structured data, aren't listed.
   - The church-facing `/worship/getting-started` pages also need sign-in, so search engines can't find any worship content. **Your call** whether those guides should be public.

   **Fix:** drop `/games` (or give it a public landing page) and add the `/browse/<slug>` pages.

6. **Descriptions [verified].**
   - **Generic:** 7 pages show the site-wide default description (Family Game Night, Plus, Verse of the Week, Start Here, Terms, Privacy, Copyright). Family Game Night and Plus are product pages.
   - **Doubled:** `/`, `/generate` and `/browse` each print **two** description tags.
   - **Missing:** `/same-brain` (public and indexed) has no description and no canonical link.

   **Fix:** pass a per-page `description` to the base template instead of adding a second tag.

7. **The service worker keeps everything forever [verified].** It caches every `/static/` file it fetches (game files, tutorial videos and GIFs, avatar sheets, each deploy's new `?v=` copies of CSS and JS) and only clears them when `CACHE_VERSION` is bumped by hand (it's still `v1.0.1`). On a family iPad that grows with every deploy.

   **Fix:** cache only a short list (site CSS and JS, icons, avatar sheet), cap the number of entries, and tie the cache name to the app's static version so old copies clear on each deploy.

## P3
- **Verse of the Week** waits on bible-api.com on every load if that service is failing (failures aren't cached; 6 s timeout). Cache a failed lookup for a few minutes.
- **Every collection uses the same picture** (`hero_john_316.png`) for its card, page and social preview. Real per-collection preview images would help clicks and sharing. That's content work.
- **No offline page:** with no connection, the installed app shows the browser's error page. A small offline page ("You're offline. Worksheets you downloaded are in your Files app.") is about 20 lines.
- **Large files that don't seem to be used:** `static/CopyworkStock/*.png` (about 18 MB, five files of 2.5–4 MB). They appear only as a fallback path for collection previews, and no local page loads them. **[verify]** whether a Firestore collection points at them; if not, delete them (smaller deploys). `faith_sparks_logo.png` (900 KB) is used only as the structured-data logo; the 512 px version (350 KB, or smaller) would do.
- **Idea, not a bug:** a Verse of the Week archive (one page per past verse) would build search pages week by week.

## What's solid
- **Light, fast pages:** 3–5 requests, no web fonts, server answers in 10–90 ms, and main content shows in under 0.4 s locally.
- **No layout shift** on 14 of the 15 pages measured.
- **Caching:** vendor libraries cached long-term (`immutable`), worship backgrounds for a week, and collection images lazy-loaded.
- **SEO basics:** every indexable page has a title, a single `<h1>`, a canonical URL (except `/same-brain`) and Open Graph and Twitter tags. Home, Browse, Lesson Pack and the collection pages have structured data.
- **Private pages:** admin, prints, downloads, billing and Live Worship are kept out of search (`noindex` and `robots.txt`).
- **Installable app:** a complete manifest (192 and 512 icons, maskable, theme colors) and an Apple touch icon. The service worker **never caches pages**, so nobody gets stale HTML or someone else's data.

## Your checklist
On your Mac's own Terminal (not through me):
```bash
for u in / /generate /static/theme.css /same-brain; do echo "== $u"; curl -sS -o /dev/null -D - -H "Accept-Encoding: br, gzip" "https://faithsparksprintables.com$u" | grep -iE "^HTTP|content-encoding|cache-control"; done
```
You want `content-encoding: br` (or `gzip`) on each. Then submit `https://faithsparksprintables.com/sitemap.xml` in Google Search Console if it isn't there yet.

## Suggested fix order
1. **#1** Shrink the avatar sheet (biggest real-world win).
2. **#2, #3** Index `/generate` and fix its layout shift (same template).
3. **#4** Long-term cache for versioned static files.
4. **#5, #6** Sitemap and descriptions.
5. **#7** Service worker cache limits.
6. **P3** items as wanted.
