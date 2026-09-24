# Game originalization audit — 2026-09-24

Implemented in the local FaithSparks repository. Not deployed.

## Titles, routes, and files

| Previous identity | Current title | Canonical route under `/labs/games/` and HTML basename |
| --- | --- | --- |
| Whit's End Ice Cream Shop | Gordon Ice Cream Town | `gordon-ice-cream-town` |
| Bernard's Window Washing | Gordon Window Washing | `gordon-window-washing` |
| Wooten's Mail Route | Gordon Mail Run | `gordon-mail-run` |
| Timothy Center Horse Racing | Gordon Family Stables | `gordon-family-stables` |

All four HTML files were renamed. The old branded routes are no longer registered; old bookmarks must be updated. The neutral `mail-sorting` alias remains. Game IDs match the new canonical slugs.

The shared collection is now **Tessa's Games**. `odyssey-core.js` and `odyssey-ui.css` became `games-core.js` and `games-ui.css`. Updated the shared JavaScript API, bootstrap globals, DOM IDs/classes, event names, roster helpers, progress identifiers, achievement/challenge text, library cards, titles, accessibility labels, signage, comments, game-specific functions, and runtime patch matching strings together. `docs/tessas_odyssey_smoke_test.md` became `docs/tessas_games_smoke_test.md`.

## Characters and recipients

- Shopkeeper Whit: Morgan; Whittaker family: Gordon.
- Window cleaner Bernard: Rowan, including the signature cleaner identity.
- Courier Wooton/Wooten: Casey.
- Stable course/foal names using Timothy: Meadow; farm/location signage: Gordon Family Stables.

Ice cream customer replacements (including matching party groups and earlier game data):

| Old | New | Old | New |
| --- | --- | --- | --- |
| Connie | Maya | Jules | Nina |
| Wooton | Casey | Jason | Leo |
| Penny | Ada | Olivia | Iris |
| Suzu | Mika | Cooper | Ellis |
| Morrie | Arlo | Zoe | Lila |
| Jay | Finn | Sophie | Hazel |
| Trey | Theo | Kayla | Rhea |
| Bridget | Mae | Wyatt | Owen |
| Ron | Hugo | Carla | Alma |
| Wilson | Felix | | |

Mail families, in the original index order: Perkins → Brook, Parker → Reed, Whittaker → Gordon, Kendall → Fern, Calhoun → Vale, Bassett → Lake, Smouse → Moss, Rathbone → Finch, Washington → Stone. Preserving ordering keeps existing delivery/sorting saves valid.

## Artwork and mechanics

Replaced **21 embedded PNG character portraits**: the window cleaner, courier, shopkeeper, and 18 ice cream customers. Replacement artwork is original inline SVG, with skin, hair and clothing color variations. Removed obsolete character-specific guest and shopkeeper renderers. The small engine bitmap font is retained.

Changed the shop's explicitly reference-based pink wallpaper, checkerboard floor, red seating, and teal counter to sunny walls, warm floor tiles, plum seating, and wood-colored counters. Updated the small shopkeeper atlas icon. Resized long canvas titles to fit the existing signs. Generic horses, icons, kitchen equipment, and neighborhood buildings remain.

No scoring, difficulty, recipes, order counts, controls, collision regions, timers, course geometry, or unlock rules were intentionally changed. Cosmetic character rendering and identifier changes are the only changes inside gameplay code.

## Save compatibility and deliberate remaining references

`games-save-migration.js` runs before game scripts and library initialization. It copies legacy local/session storage into new namespaces, remaps game identifiers and saved ice cream customer names, preserves cleaner layers and session deduplication, and leaves original keys as backups. Existing new-format saves take precedence. Player-entered names and horse names remain untouched. Storage restrictions do not block startup.

The server reads `gamesRoster`, falling back to `odysseyRoster` for existing accounts; future writes use `gamesRoster`. Old spellings deliberately remain only in this compatibility path, the migration file, regression test fixtures, and this audit's historical mappings. Old browser-storage keys and old server roster fields are not deleted.

Whole-repository searches covered Odyssey, Whit/Whittaker, Wooton/Wooten, Bernard, Timothy Center, and discovered customer/family names. Additional scans included Walton, Bassett, Meltsner, Blackgaard, Novacom, Imagination Station, Barclay, and references to official artwork. Unrelated words such as `white`, `whitespace`, and biblical references to Timothy were preserved. Dependencies and Git history were not rewritten.

**Active-game manual art replacement: none identified after this pass.**

**Local backup exception:** the ignored, untracked root `Archive.zip` contains the six retired game/shared-asset files, including original embedded portraits. It is explicitly excluded by `.dockerignore` and was not rewritten or deleted. Do not reuse or publish those copies; replace them with the current files if that archive is ever distributed. Git history also retains previous artwork, as expected.

## Changed supporting files

- `faithsparks/views/lab_games.py`: catalog, routes/IDs, runtime patch markers, shared asset allowlist, roster bootstrap and compatibility read.
- `templates/lab_games.html`: collection UI, links, progress dashboard, shared styling/scripts, and migration loading.
- `faithsparks/content/lab_games/same-brain.html` and `faithsparks/views/public.py`: coordinated shared bootstrap-global naming only.
- `tests/test_lab_games.py`: expectations and names updated to the new identities.
- New `tests/test_games_originalization.py` and `tests/games_save_migration.test.cjs`: route/assets/artwork/roster and executable save migration checks.

## Verification

- New originalization tests: **6 passed**.
- Executable JavaScript migration tests: **2 passed**; cover game progress, saved party/customer names, window cleaner layers, stable/horse data, settings, session deduplication, unchanged player names, legacy backups, repeat runs, malformed data, and denied storage.
- Existing `tests/test_lab_games.py`: **98 passed, 22 failed**. The untouched HEAD checkout independently produces the same **98 passed, 22 failed**. No additional failures from this change. Existing failures include missing application globals in the library test harness, stale game assertions, and unrelated Same Brain tests.
- JavaScript syntax: **21 script blocks passed**, covering all four HTML games and shared core/migration scripts.
- Browser smoke: all four canonical routes return 200; shared player creation/selection works; all four reach their game/start/horse-selection screens without JavaScript page errors. Visually inspected original character rendering and signage at 1280×900. This is not a full playthrough or physical-iPad test.
- `git diff --check` passed.

Test dependencies were installed into an isolated temporary environment; repository dependency files were not changed.
