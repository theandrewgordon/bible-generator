# Faith Sparks page enhancements

The bundle library (`/browse`) is the first React page enhancement. Flask still renders the cards, links, membership decisions, metadata, and navigation. React owns the search controls and controls visibility/order of those existing cards. If JavaScript fails, the complete library remains readable and its links work.

From this directory:

- `npm ci` installs locked dependencies (Node 22.22.2+, 24.15+, or 26+ required for the test tooling).
- `npm run build` updates all page entries and their shared React runtime under `../static/dist/`.
- `npm run watch` rebuilds while you edit; refresh the Flask page to see changes.
- `npm test` builds and checks filtering, URL parsing, and production-bundle integration against a simulated browser DOM.

Ship the generated JS and CSS with source changes: the existing Python deployment serves these files without requiring a frontend build step. Page entries load only on their corresponding templates; all entries import the same content-hashed React runtime. Flask's static version includes both generated assets for local cache invalidation; hosted deployments use their existing commit token.

Filters use `q`, `access`, and `sort` query parameters, preserve unrelated parameters, and restore on browser navigation. Replacing the current history entry avoids adding one browser-history entry per keystroke. The original server order is retained separately so Featured first always resets correctly.

Keep access enforcement in Flask. Visibility filters are only a browsing convenience, never authorization.

## Gathering builder

`/lesson-pack` uses a second enhancement (`src/gathering.jsx`). Run `npm run watch:gathering` while editing it. `npm run build` builds all page entries together.

The builder uses Passage → Printables → Review steps, retaining the actual server-rendered form fields and CSRF token. Its review summarizes settings and expected contents; it does not claim to preview the generated PDF or verify Scripture in the browser. Native form submission continues through the existing verification, sign-in, and generation routes. The full form remains usable without JavaScript.

Browser preferences are optional and guarded against storage failures. Explicit URL choices take precedence, and saved Bible versions cannot select disabled options. Submission is disabled while navigation starts and restored on a cached Back navigation. Tests exercise the built bundle, field preservation, validation, review, storage restrictions, URL precedence, and submission recovery.

CI installs the locked page dependencies, runs the production-bundle tests, and checks that rebuilding leaves all committed page assets unchanged.

## Worksheet creator

`/generate` now uses `src/worksheet.jsx` for the React preview and download flow. The existing local Tagify editor, quick picks, server prefills, and native form fields remain in the template. `updatePreview()` publishes a snapshot on `#worksheet-preview` and emits `worksheet:change`; this bridge keeps React synchronized without duplicating Tagify or its version normalization. On submit, a capture listener commits unfinished reference input before React reads the snapshot.

The preview shows every selected reference and custom-text worksheet with Previous/Next controls. It is a layout preview, not a verified Scripture or generated illustration preview. Generation posts the real form (including its existing security and collection fields) to the unchanged Flask route. Only PDF/ZIP/binary responses are downloaded; HTML redirects, empty files, network errors, and server errors leave the inputs available for retry. Duplicate submissions are locked while a request is pending. Successful downloads emit `worksheet:created` for recent verses and the copywork rhythm. Browser storage is optional throughout the editor.

Use `npm run watch:worksheet` while editing. Unit tests cover response handling and filenames; production-bundle DOM tests cover preview navigation, validation, security fields, retry recovery, and duplicate submissions. CI checks the committed worksheet build along with Browse and Gathering.

## My Prints and game creation

`/history` enhances its existing filter/card view with React bulk selection. Filtering emits `history:filtered`; React clears hidden selections, keeps the count in sync, and renders an explicit review containing the worksheet names. The native bulk submit is allowed only when the current visible selection exactly matches that review. Individual delete actions keep their existing confirmation and routes. This removes the discrepancy between visible confirmation counts and hidden checked fields. Favorite updates now check the HTTP status before updating the page, and optional storage cannot prevent history initialization.

The game creation page uses `games.jsx` for topic suggestions, safe text word chips, explicit review, and asynchronous word building. The existing server-rendered settings and real form fields remain authoritative for submission. Changing references, translation, difficulty, game type, or words revokes approval and cancels outstanding requests; a revision check also discards late results when cancellation is ignored. Receiving suggestions never checks the review box. Form submission checks the current fields and approval even if the button is enabled externally. Matching games retain their separate field behavior, and native game downloads retain the existing timed duplicate-submit recovery.

The build and CI include both pages. Production-bundle regression tests exercise filtered delete payloads, changed review selections, direct-submit gating, stale requests, explicit approval, and text-safe word rendering.


## Shared runtime and Worship saves

Vite builds Browse, Gathering, Worksheet, History, Games, and Worship together. Stable entry/CSS paths keep the Flask templates simple; each entry imports the same `shared/react-runtime-[hash].js`. Flask caches that content-hashed file immutably. Deploy all of `static/dist` together. The separate learning Labs build is unchanged. Every watch alias now rebuilds the complete page graph.

Worship keeps the existing editor and modal. Its adapter dispatches `worship:save` with a fixed FormData snapshot, a content fingerprint reader, and a service-context reader. The React save controller owns pending status, duplicate prevention, error recovery, and visible feedback. A successful response only marks unchanged content saved; newer edits remain dirty. Loading or copying another service advances the context so an older response cannot replace its identity or timestamp. Renaming a service no longer clears local content edits. Regression tests exercise the save controller and the production page modules; the DOM harness resolves their actual shared imports before evaluation.

## Shared song editor and deck review

`worship_add.html` (manual mode) and `worship_edit.html` both use `song-editor.jsx`. The templates supply a JSON configuration with the existing preview endpoint, CSRF token, and saved song. The editor submits the same `part_name`, `part_lines`, and `arrangement` fields. Stable part identities retain repeated arrangement entries when a section is renamed. Drag/drop and labelled earlier/later buttons reorder arrangements. Saved manual slide breaks remain blank lines in the textareas. Duplicate names and names containing commas are rejected before submit so the existing form encoding cannot silently overwrite sections.

Each section's preview has an independent request lifecycle. Editing, clearing, or removing it invalidates the old response and cancels the request; a revision check protects against servers that ignore cancellation. Preview failures preserve editable lyrics. Import modes, licensing confirmation, validation, and human-review actions keep their existing routes.

`deck-review.jsx` enhances the existing server-rendered slides with previous/next navigation, a next-crowded-slide action, a crowded-only filter, and scoped Left/Right/Home/End shortcuts. Filtering is a viewing aid and leaves the server's findings, review fingerprint, scope, and approval/build actions intact. It does not declare issues resolved or auto-approve slides. All new entries use the same shared React runtime and CI build checks.

## Presentation review and import

`presentation-review.jsx` enhances the native slide cards with drag/drop plus labelled Move earlier/later buttons. The live summary counts shown/hidden slides, explicitly selected nonempty key points, and the total projected slides. Reset order restores the order at page load without changing visibility. All slide IDs, notes, edited key points, CSRF fields, and save/reanalyze submit actions remain native form fields. The presentation route now applies current ordering and visibility before refreshing key-point suggestions; new suggestions still start unchecked.

`presentation-upload.jsx` validates the selected extension, nonempty size, the server's 25 MiB limit, and available PDF/PowerPoint converters before native submission. The server still validates file contents and slide count. Its status reports waiting for upload/conversion without inventing a percentage. Pending submissions are locked against duplicates; `pageshow` resets the lock and re-reads any file retained by the browser, preserving the remaining native form. AI analysis remains explicitly opt-in. Both entries use the shared runtime and existing CI asset checks.

Regression checks cover the production modules, multipart-form state, capability/size boundaries, and cached Back recovery. `python3 -m unittest discover -s tests -p test_presentation_review_state.py` independently exercises the actual review route's POST logic with external boundaries substituted, covering normal save and reanalysis state preservation.
