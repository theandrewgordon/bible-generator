# Speed Die companion

Open `/speeddie` or `/speeddie/`. This is a browser-only companion for a physical
board: no accounts or server-side game state. Pictures are processed locally. Choose 2–8 players,
tokens or local pictures, and physical-money helper or digital banker mode.

- Manage properties: buy/sell houses and hotels, mortgage, and review deed values.
- Banker mode: purchases, rent, auctions, GO, taxes, jail, card payments, cash trades,
  inherited mortgage fees, and Free Parking options use the same cash ledger.
  The last survivor wins immediately; no further payments or auctions are required.
- Only one tab can edit a game at a time. Other tabs show live read-only updates
  and take over when the editing tab closes (requires HTTPS or localhost).
- Rent and its recipient are recorded on arrival and survive later asset changes.
- An unpaid bill pauses play. Raise cash by selling, mortgaging, or trading, then
  settle. Correct or waive a mistaken bill with a logged reason. Funded payments
  are applied immediately, including incoming cash needed to clear a debt. Bankruptcy transfers an estate to its creditor or queues bank auctions.
- Auctions support saved, turn-by-turn bids and passes on one screen, or recording
  an auction held aloud. Passing withdraws; all passes without a bid leave the deed
  in the bank. Bids cannot exceed available digital cash.
- Setup offers physical cards with guided consequence previews, or a shuffled
  Classic US 2008–2020 effect deck. Draw/apply are separate saved actions. Card moves
  resolve the new space before Classic Property Finder continues; Jail ends it.
  Special railroad/utility rent and repairs are calculated. Held Jail cards leave
  the deck, can be traded, and return when used or pass to a bankruptcy creditor.
- Home preserves named games, including unfinished auctions and completed games.
  Starting or importing another game first preserves the active one. Saves remain
  local; export each game for a portable backup. One browser-wide writer lock
  conservatively protects both the active game and saved-game library.
- Setup fixes starting money at $2,500 with the physical bill breakdown. The
  default Classic Speed Die preset waits until each player first passes GO. House
  rules unlock immediate activation, Streets movement, Free Parking, and leaving
  unowned property without auction.
- Dice dots/numerals, optional synthesized effects/music, volume, and a gold winner
  celebration are included. Sound starts after interaction; motion respects the
  reduced-motion preference. No remote media or audio downloads are used.
- Settings contain modern US fixed taxes and editable payments. Each deed has
  editable prices, mortgage values, construction costs, and rent schedules.
  For a different edition, confirm values against the physical board.
- Switch money modes between turns; enter actual cash when enabling banker mode
  for an existing game. Existing version 1–5 saves migrate to helper mode.
- Damaged saves open a recovery screen with an unchanged-data download, backup
  import, and reset. A failed save preserves both game state and undo history.
- Saving an unchanged position preserves paid rent and Jail attempt counts.
- Export/import includes token pictures. Undo restores the last saved action,
  including cash, deeds, buildings, pending bills, and turn state. Up to ten undo steps
  survive reload; the ledger keeps the latest 150 financial/management entries.

`rules.js` is the DOM-free rules/transaction layer. `companion.js` contains the
banking and property screens; `family.js` adds library/card/auction presentation;
`app.js` retains the dice/movement flow. State version
6 adds financial data and resumable bills; snapshots omit recursive undo history.
Token images are resized locally to 128px. Import validation checks ownership,
cash, buildings, dice phases, and pending actions before replacing a game.

## Verification

```sh
node --test tests/speeddie_rules.test.cjs
node --test tests/speeddie_browser.test.cjs
```

The browser suite needs `playwright` available to Node (install in your development
environment or supply `NODE_PATH`). It launches an isolated headless Chrome and
its own local HTTP server. Set `SPEEDDIE_BROWSER=chromium` to use Playwright's
installed Chromium instead. No new production package dependencies are required.
The existing movement checks also run with `?selftest=1`.

Rules reference: [Hasbro Speed Die / classic instructions](https://www.hasbro.com/common/instruct/00009.pdf).
The app retains the existing Streets-style movement variant and clearly labeled
Free Parking / leave-unowned house rules.

Deck effects are cross-checked against the [traditional US card list](https://www.monopolyland.com/list-monopoly-chance-community-chest-cards/).
This is a compatibility preset, not a claim to reproduce a specific 1990s Deluxe
printing. Use the physical-card setup choice for the exact cards in your box.
Modern fixed taxes are the default; old percentage taxes require the existing
explicit tax-amount correction. Dogopoly and Gatoropoly are not included.
