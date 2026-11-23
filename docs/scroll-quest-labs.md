# Scroll Quest in Faith Sparks Labs

Scroll Quest is a Beta Labs product at `/labs/scroll-quest`. Its play page opens the unmodified standalone full-edition release in a same-origin iframe, with a persistent route back to Labs. The browser bundle contains eight worlds and 54 chapters. Keyboard/gamepad play and existing tablet touch controls are retained; phone/WebSocket controllers remain disabled by the release metadata.

## Release ownership and updates

The game source, desktop wrapper, gameplay tests, and build tools remain separately maintained in the Scroll Quest project. This repository contains only its verified browser distribution in `faithsparks/content/scroll_quest`. The Docker image already includes that private content directory; no additional Node build or external hosting service is needed.

To replace the game with a reviewed full browser release:

```
python3 scripts/import_scroll_quest.py /path/to/scroll-quest-browser-VERSION.zip
python3 -m pytest -q tests/test_scroll_quest.py tests/test_product_system.py tests/test_product_journeys.py
node tests/scroll_quest_browser.cjs
```

The importer validates every manifest hash and byte count, the engine fingerprint, chapter count, archive contents and paths before replacing the deployed bundle. It records upstream provenance in `docs/scroll-quest-release.json`. Keep the vendor bundle byte-for-byte intact; do not copy the source ZIP, dependencies, or desktop executables into the website.

## Access and saves

All landing, play, bootstrap, HTML, model, script, and audio URLs use `/labs/scroll-quest/`, so the existing global Labs sign-in and Plus/admin access gate applies to every file. Files must also appear in the release manifest; there is no arbitrary file-server path or public static copy. Private/no-store, no-referrer, and noindex response protections remain in place, including for byte-range audio responses. Existing Labs service-worker exclusions remain applicable. No gate or site-wide cache policy was weakened for this game.

The only adaptation to HTML responses injects `/labs/scroll-quest/account-storage.js` before any game scripts. This captures native Storage lexically, installs the existing shared Labs account-storage runtime, then exposes its scoped adapter as the iframe's localStorage. The surrounding website window is unaffected. Game progress, backups, and settings therefore use the same opaque account-owner prefix and stale-tab handling as other Labs. No original unscoped progress is automatically imported into an account. Users can import/export a compatible backup from the game's Family settings.

Saves remain local to the browser and Faith Sparks account. There is no cloud progress sync, automatic desktop-save transfer, or integration with the Games Lab player roster. The play shell explains device-local saves; the landing page also explains keyboard/gamepad use, touch beta status, initial asset loading, and backup transfer.

## Verification

Python tests cover the release manifest, all 54 chapter responses, bootstrap ordering, protected nested assets, signed-out and nonmember requests, path rejection, and audio range handling. The browser check uses the actual Flask Labs gate on a loopback-only test server. It renders representative chapters, checks soft-shadow textures, switches account cookies with an old game still open, verifies save isolation/restoration and membership revocation, and checks the narrow-screen shell. The fixture server is never enabled by the production app.

The upstream 0.2.1 game passed 8,280 automated checks before this integration. Website-specific checks are separate from that game suite. Test the deployed page under a real member account after rollout; a Git push alone does not prove the live hosting service has deployed the new commit.
