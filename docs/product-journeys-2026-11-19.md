# Website simplification, November 19, 2026

The approved review is implemented in the existing Flask site with shared React/Vite islands where interaction benefits from them.

| Goal | Result |
| --- | --- |
| Start a task directly | Homepage links directly to worksheets, family Scripture weeks, game setup, and Worship. Audience pages remain available. |
| Make names predictable | Browse Resources, My Library, and Gathering Builder consistently describe discovery, saved work, and preparation. |
| Explain access at the boundary | Branded Labs membership page preserves the destination; pricing distinguishes free access, Plus, and the one-time game unlock. |
| Return after sign-in or checkout | Header sign-in and worksheet membership links serialize current form choices; checkout keeps a validated local return destination. |
| Reuse adult preferences | Settings shares version, setting, age, writer level, cursive, and theme with existing tools. Explicit URL choices override only their own fields. |
| Finish downloads consistently | Shared React ready controls offer preview, repeat download, edit, and appropriate Library guidance. Pack results offer an owned PDF preview. |
| Explain game equipment first | Recommended setup asks which phones are available and preserves the choice when creating a room. Existing server limits still apply. |
| Guide service preparation | Worship shows Prepare → Review slides → Connect display & lead, with a next step based on service contents. Actual review and live checks remain authoritative. |
| Give learning one home | `/labs/learningadventure` groups Grammar, Math, Latin, and Geography. Existing URLs and storage keys remain compatible. Only a scoped subject identifier is saved for the return link. |
| Reuse menus and controls | Desktop and phone share one account-menu macro, product cards, settings controls, and themed action/status patterns. Closed phone navigation is inert and Escape returns focus. |

## Caching and architecture

- Normal pages remain server-rendered. React/Vite handles the learning return control and the shared downloadable-file result alongside existing page islands.
- Page entries keep one content-hashed React runtime. Download result and action/status components are shared chunks.
- The service worker reuses deploy-versioned/content-hashed public assets without another request. Unversioned assets revalidate, with a bounded cache of 96 assets.
- HTML is network-only. Private Labs assets, APIs, uploads, and no-store responses stay outside the static cache. Existing account-scoped learning storage and voice caches remain intact.
- Browser coverage includes the real header, settings, family builder, and learning hub at desktop and phone sizes, plus existing creation/Worship/live flows.

## Validation

- Full Python suite: 1,365 passed, including 17 subtests.
- Frontend unit checks: 40 passed; learning unit checks: 31 passed.
- Actual-shell and existing flow browser suite: 34 passed across desktop and phone.
- Learning browser checks: Geo narration and typed answers, Math operation mixing and answer modes, Grammar diagrams, Latin practice, canonical shared navigation, clipboard fallback, and phone layouts passed.
- Both production builds and whitespace checks passed.
