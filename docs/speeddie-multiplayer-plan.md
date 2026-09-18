# Shared family games

Implemented modes:
- Pass & play: local offline game on one device.
- Own devices: host creates a private room; guests enter its eight-character code.
- Mixed: the host assigns Mom to her phone and keeps Tessa and Dad on the tablet.

Fresh online games open a pre-game lobby. After host approval and seat assignment,
each device can edit its own players' names, colors, emoji tokens or uploaded
pictures. A shared device can add more players, up to eight total. Profile edits
clear that player's readiness; seat reassignment clears readiness for everyone.
All players must be ready before the host starts. Game commands are blocked until
then, and lobby edits are blocked after start. Reconnecting keeps players and
readiness. Hosting a game already underway preserves its current turn and skips
the lobby.

Online games require digital banking and in-app cards. The host approves each
joining device and assigns seats. Released seats return to the host. Players can
roll, buy, bid, manage buildings/mortgages, settle debts and accept trades only for
their assigned seats. There are no online value/cash correction controls.

The board refreshes every 1.5 seconds (5 seconds in a background tab). Disconnected
clients cannot make moves. A lost response retains the action ID for safe retry;
reconnecting on the same browser restores its saved room credential. Clearing
browser storage loses that credential; the host can approve a new device and
reassign the player. The host can close a room and download its full JSON backup.
Import that backup locally and host it to create a separate room.

## Deployment

The normal Flask application registers `/speeddie/api`. Its existing Firebase
Admin service account needs read/write access to the `speeddie_rooms` collection.
Firestore rules should deny direct browser access: all access goes through the
server's authenticated device API. Node is installed by the Dockerfile and runs
the same rules and command engine used by the local game. `SPEEDDIE_NODE_BIN` can
select an alternate Node executable. No process-memory storage fallback is used.

Enable Firestore TTL on `speeddie_rooms.expiresAt` to physically remove expired
room and rate-limit documents. The API rejects expired rooms even without TTL.
Rooms expire seven days after their last successful move. Host backups preserve
games longer. Keep the JSON `payload` field exempt from Firestore indexing.

The server checks CSRF and origin, hashes device credentials, hides undrawn decks,
limits room creation/join attempts, and atomically compares revisions before
saving commands. Unique request IDs prevent duplicate effects. The host's full
backup includes deck order; ordinary guest snapshots never do. Host controls and
backups assume a trusted family host, not competitive anti-cheat enforcement.

## Local verification

For a preview without the site's other dependencies:

```sh
python -m speeddie.dev_server --port 8767 --db /tmp/speeddie-rooms.sqlite
node --test tests/speeddie_rules.test.cjs tests/speeddie_engine.test.cjs tests/speeddie_browser.test.cjs
python -m pytest -q tests/test_speeddie_online.py
SPEEDDIE_TEST_URL=http://127.0.0.1:8767 node --test tests/speeddie_online_browser.test.cjs
```

The standalone preview requires Flask and uses SQLite, binds only localhost, and
must not be deployed. Browser tests require Playwright and installed Chrome.
The online browser test uses isolated host/phone contexts, approval and mixed
seats, a consenting trade, real turns, a lost committed-roll response, safe retry,
and browser reload/reconnect, including lobby names and uploaded token pictures.
API tests cover lobby readiness, player limits, profile permissions, concurrent writes, privacy, seat
revocation, auctions, durable reload, expiry, closure, backups and CSRF.

Production rollout still requires checking `/speeddie/api/config` and a real
two-device game after deployment; local SQLite tests do not verify production
Firestore permissions or deployment health.

## Family extras

Shared rooms include per-device turn chimes (opt-in), token entrance animation,
quick auction bids with cash shown, itemized trade receipts, purchase/build previews,
legal debt-raising suggestions, a shared pause/resume button, and reactions with a
five-second server cooldown and a per-device mute. Turn chimes require an open page;
mobile browsers may suspend audio while backgrounded or locked. No push-notification
service is used. Reduced-motion preferences disable the entrance animation.

Before players are ready, the host can select a 30/60/90/120-minute bedtime game.
Changing that rule clears readiness. The clock starts with the game, excludes
pauses, and finishes only at a clean turn boundary, including extra doubles rolls.
The displayed house rule scores cash plus mortgage values of unmortgaged deeds and
half the actual building costs. Mortgaged deeds add zero; bankrupt players are
ineligible and equal scores share the win. This is explicitly a family house rule.

Awards record peak deeds, GO collections, largest auction purchase and rolls;
old saves are not assigned guessed historical totals. Local games also receive
building previews, debt suggestions and end-game awards. Room timers, reactions,
pause and turn alerts are online features. These additions use the existing room
storage and browser audio, with no new paid service or third-party SDK.
