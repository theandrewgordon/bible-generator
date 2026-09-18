# Shared family games — proposed next phase

Confirmed intent: Mom can take turns on her own phone while Tessa plays in another
room. This is active multiplayer, not merely a spectator screen. The local board
overview is implemented; shared games are not implemented yet.

## Confirmed play modes

- Pass & play: one shared phone/tablet, offline local game.
- Own devices: private online room with separate player controls.
- Mixed room: Tessa and Dad share the host tablet while Mom has her own phone.
  The host device may control multiple explicitly assigned seats; other devices
  control their assigned seats. Seat permissions must govern every command.

Only pass & play is implemented today. Own-device and mixed rooms remain planned.

## Family experience

- Host starts an online game and shares a private link or short room code.
- Mom joins as her player; the host approves the seat. No public room directory.
- Everyone sees the same board, cash, ownership, buildings, current decision and
  latest action. A phone can switch between its action screen and the board.
- Each person controls their own rolls, purchases, auction bids, card decisions,
  property management and trade responses. Host corrections are separate.
- Digital bank and digital cards are the recommended initial online mode. Physical
  pieces may remain on the table, but the shared game is authoritative.
- Closing a phone or a brief disconnection does not erase the game. Rejoining
  restores the same seat. Show reconnecting status and disable actions until the
  latest server state is confirmed. Internet is required for shared play.
- Keep local offline games and JSON backup/export as separate supported modes.

## Work required

1. Shared persistence and rooms. The repository already has Firestore integration
   in `faithsparks/services/firestore.py`; confirm deployment configuration before
   selecting it for rooms. Do not store rooms only in a Flask worker's memory:
   production uses multiple Gunicorn workers.
2. Authoritative game commands. Extract the remaining browser-dependent movement
   logic alongside the pure rule engine. A game service must validate actions and
   generate dice/decks. Clients send requests, not replacement game snapshots.
   Decide how to run the shared JavaScript engine server-side before introducing
   a second implementation of the rules in Python.
3. Seat identity and permissions. Use room membership credentials, host-approved
   seat claims, reconnect tokens, rate-limited join codes and host-only correction
   controls. A room code is discovery, not authority to control all players.
4. Atomic updates and duplicate protection. Each command carries an expected game
   revision and unique action ID. Validate the correct actor: current player,
   auction bidder, debtor or consenting trade participant as appropriate. Retry
   must not roll, pay, buy, or apply a card twice.
5. Live public state. Stream committed revisions to each device. Keep undrawn deck
   order and private room credentials out of the public board payload. Do not
   optimistically queue financial or dice actions offline.
6. Shared saves and backup policy. Online export/import belongs to the host;
   restoring a backup should create a distinct room. Do not accidentally expose
   future deck order through ordinary participant exports.
7. Two-device verification. Test simultaneous actions, auction turns, trade
   acceptance, debt/building management, reconnects, suspended phones, host exit,
   duplicate requests, old revisions, room privacy and completed-game cleanup.

Firestore supports [live listeners](https://firebase.google.com/docs/firestore/query-data/listen)
and [atomic transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).
Those facilities cover synchronization/storage; the game permissions and command
validation still need to be implemented and tested.

This is a substantial multiplayer feature, not a switch on localStorage or a
shared JSON download. No deployment, new paid service or room access was created
while adding the local board view.
