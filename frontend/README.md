# Faith Sparks page enhancements

The bundle library (`/browse`) is the first React page enhancement. Flask still renders the cards, links, membership decisions, metadata, and navigation. React owns the search controls and controls visibility/order of those existing cards. If JavaScript fails, the complete library remains readable and its links work.

From this directory:

- `npm ci` installs locked dependencies (Node 22.22.2+, 24.15+, or 26+ required for the test tooling).
- `npm run build` updates `../static/dist/browse/`.
- `npm run watch` rebuilds while you edit; refresh the Flask page to see changes.
- `npm test` builds and checks filtering, URL parsing, and production-bundle integration against a simulated browser DOM.

Ship the generated JS and CSS with source changes: the existing Python deployment serves these files without requiring a frontend build step. They are page-specific and loaded only by `browse.html`. Flask's static version includes both generated assets for local cache invalidation; hosted deployments use their existing commit token.

Filters use `q`, `access`, and `sort` query parameters, preserve unrelated parameters, and restore on browser navigation. Replacing the current history entry avoids adding one browser-history entry per keystroke. The original server order is retained separately so Featured first always resets correctly.

Keep access enforcement in Flask. Visibility filters are only a browsing convenience, never authorization.

## Gathering builder

`/lesson-pack` uses a second enhancement (`src/gathering.jsx`). Run `npm run watch:gathering` while editing it. `npm run build` builds both pages independently.

The builder uses Passage → Printables → Review steps, retaining the actual server-rendered form fields and CSRF token. Its review summarizes settings and expected contents; it does not claim to preview the generated PDF or verify Scripture in the browser. Native form submission continues through the existing verification, sign-in, and generation routes. The full form remains usable without JavaScript.

Browser preferences are optional and guarded against storage failures. Explicit URL choices take precedence, and saved Bible versions cannot select disabled options. Submission is disabled while navigation starts and restored on a cached Back navigation. Tests exercise the built bundle, field preservation, validation, review, storage restrictions, URL precedence, and submission recovery.

CI installs the locked page dependencies, runs the production-bundle tests, and checks that rebuilding leaves the committed Browse and Gathering assets unchanged.

## Worksheet creator

`/generate` now uses `src/worksheet.jsx` for the React preview and download flow. The existing local Tagify editor, quick picks, server prefills, and native form fields remain in the template. `updatePreview()` publishes a snapshot on `#worksheet-preview` and emits `worksheet:change`; this bridge keeps React synchronized without duplicating Tagify or its version normalization. On submit, a capture listener commits unfinished reference input before React reads the snapshot.

The preview shows every selected reference and custom-text worksheet with Previous/Next controls. It is a layout preview, not a verified Scripture or generated illustration preview. Generation posts the real form (including its existing security and collection fields) to the unchanged Flask route. Only PDF/ZIP/binary responses are downloaded; HTML redirects, empty files, network errors, and server errors leave the inputs available for retry. Duplicate submissions are locked while a request is pending. Successful downloads emit `worksheet:created` for recent verses and the copywork rhythm. Browser storage is optional throughout the editor.

Use `npm run watch:worksheet` while editing. Unit tests cover response handling and filenames; production-bundle DOM tests cover preview navigation, validation, security fields, retry recovery, and duplicate submissions. CI checks the committed worksheet build along with Browse and Gathering.
