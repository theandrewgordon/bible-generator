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
- Auctions and Chance/Community Chest remain physical; enter winning bids and card
  effects. Record special rent in the landing amount field. Get Out of Jail Free
  cards remain physical; the bankruptcy review explains where to return them.
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
banking and property screens; `app.js` retains the dice/movement flow. State version
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
