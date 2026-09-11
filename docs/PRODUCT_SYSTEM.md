# Faith Sparks product system

Faith Sparks helps families and small churches live their faith together—with
less prep, less friction, and more meaningful shared time.

The public information architecture is task-first:

- **Prepare** — Gathering Builder, Copywork, and the printable library.
- **Worship** — service planning, presenting, stage view, and export.
- **Play** — Family Game Night, Family Bible Bee, and printable games.
- **My Library** — owned and generated materials.
- **Labs** — experiments that are intentionally outside the core promise.

The default audience is **families and homeschool parents**, especially the
parent carrying planning and teaching. `/families` is the primary audience
entry. `/churches` gives house churches and small groups a tailored start
without creating a separate product or duplicating the task navigation.

`faithsparks/products.py` is the source of truth for navigation, product
ownership, public paths, and maturity. A product moves into the primary
experience only by changing its maturity and area there.

## Maturity contract

- **Core:** dependable and supported.
- **Beta:** useful now and being refined; breaking changes should be rare.
- **Experiment:** validates the idea and workflow; shape may change.
- **Sandbox:** small prototype; may change or disappear.

Labs pages are not indexed. Experimental visuals may have their own accent,
but every entry point identifies Faith Sparks and provides a route back to the
parent product.

Unrelated utilities are not listed in the registry or Labs. They may remain at
an unlinked, no-index direct URL, but they must not borrow Faith Sparks branding.

## Runtime lanes

Live worship and room games must remain responsive while PDFs, images, or slide
files are being generated. Production therefore runs multiple threaded workers
instead of a single blocking worker. Request duration is exposed through the
`Server-Timing` response header and requests over `SLOW_REQUEST_LOG_MS` are
logged for review. Build-only files are excluded from the production image.

Longer term, generation that routinely exceeds a normal request should move to
a durable job queue. Until then, do not lower worker/thread capacity or put
extra network calls on `/worship/live/*` polling and control paths.
