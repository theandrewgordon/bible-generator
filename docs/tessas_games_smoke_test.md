# Tessa's Games Manual Smoke Test

Use this after platform/game-shell changes and before considering a release stable.

## Devices

Run the matrix on:

- Mac desktop/laptop with mouse + physical keyboard
- iPad in landscape with touch + native software keyboard
- Optional: iPad portrait to verify graceful layout behavior

## Player identity

For each device:

1. Open `/labs/games`.
2. Create a new Games player using the native text input.
3. Verify spaces, Backspace, capitalization, and Enter/Done.
4. Confirm the player appears in the shared selector.
5. Select that player and open each of the four games.
6. Verify the selected Games player propagates automatically into every mini-game.
7. Use **Change Player** inside each game and confirm the same shared selector appears.
8. Verify 8-player maximum and 20-character name limit.
9. Verify duplicate names are rejected case-insensitively.
10. Verify Delete asks for confirmation and only hides/removes that game's progress rather than erasing the global identity unexpectedly.

## Games

Test all four:

- Gordon Ice Cream Town
- Gordon Window Washing
- Gordon Mail Run
- Gordon Family Stables

For each game:

1. Start a round.
2. Complete a round.
3. Verify the shared results UI appears.
4. Verify Games XP is awarded once.
5. Verify replay does not double-count the previous completion.
6. Verify next/continue advances sensibly.
7. Open the hamburger menu and test:
   - Resume / Continue
   - Restart Current Round
   - Change Player
   - Return to Game Library
   - Sound Effects
   - Music only where applicable
8. Background the browser, return, and confirm progress is preserved.
9. Reload the page and confirm resume behavior is sensible.
10. Return to `/labs/games` and confirm dashboard stats changed.

## iPad-specific

- Tap the real player-name field and confirm the native keyboard opens.
- Type letters, spaces, Backspace, and use Done/Enter.
- Verify touch controls do not scroll the page during gameplay.
- Verify overlays block gameplay underneath them.
- Verify safe-area spacing keeps the hamburger and buttons clear of screen edges.
- Verify all important tap targets are comfortable to hit.
- Rotate landscape/portrait and confirm overlays remain usable.

## Games home

On `/labs/games` verify:

- active player persists
- avatar can be changed
- Continue Recent Game goes to the correct game
- XP bar and Games Level update
- daily/weekly challenge progress updates
- achievements appear when earned
- Sound Effects and Music settings carry into games
- game progress cards show each game's stats
- Family Progress summarizes every Games player
- visual game thumbnails render correctly

## Regression paths

Specifically retest:

- Gordon Family Stables saved horse colors after reload
- Gordon Family Stables foal/stable unlocks
- Rowan finishing a window while still dragging the tool
- Casey Level 6 delivery-route unlock
- Gordon Ice Cream Town replay vs next-level result flow
