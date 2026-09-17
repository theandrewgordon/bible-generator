# Speed Die audit — September 17, 2026

## Resolution

All seven findings below have been fixed. The original observations and screenshots
are retained as historical evidence, not a description of the current build.

- Web Locks allow one editing tab, with read-only live updates and automatic takeover.
  Saves also reject stale snapshots instead of overwriting newer data.
- A terminal winner state clears remaining obligations and disables ordinary play.
- Landing bills retain their arrival-time creditor and amount through asset changes.
- Funded incoming payments apply immediately instead of waiting behind an unpaid bill.
- Pending bills support logged amount corrections and explicit zero-dollar waivers;
  ten undo steps survive reload. Cash corrections include before/after values.
- Off-turn Jail corrections preserve the current player's doubles entitlement.
- Rent fields reject blank, zero, negative, and fractional input; a separate logged
  waiver handles deliberate no-payment decisions.

Verification: 46 automated rules/browser tests pass, including ten new browser
regressions covering the findings and related save/resume interactions. The wider
Flask test suite remains unavailable in this environment because Flask is not
installed. The usability suggestions at the end remain optional follow-up work.

## Original audit

Verdict: the normal path works, but banker mode needs fixes before it can be relied
on for a family game without manual recovery. Seven distinct issues were reproduced.
Application source was not changed during this audit.

## What was exercised

An isolated Chrome session played a complete, scripted three-player game through
the app's controls, using seeded dice, purchases, building, rent, mortgages,
liquidation, and bankruptcy. It used sample physical-card effects ($50 awards or
fees), rather than a complete official shuffled card deck. Strategy was simple:
buy when affordable, build completed groups, sell/mortgage when unable to pay.
There were no negotiated trades in this long game. Targeted scenarios separately
exercised exceptional state transitions, recovery, and two tabs sharing one save.
No test state was written to the user's open browser session.

The long game reached Alice's winner screen after 434 rolls and 1,785 control-loop
iterations. Cara went bankrupt on roll 227 over a $550 bill; Bob went bankrupt on
roll 434 over a $100 bill. This is a test trace, not an estimate of real game length.

Evidence: [scenario and game results](results.json),
[additional scenarios](extra-results.json), [completed game](game-end.png),
[blocked final player](final-player-debt.png).

## Confirmed findings, in recommended repair order

### 1. P1 — A second tab silently overwrites newer purchases and balances

Reproduction:
1. Open the same saved game in two tabs.
2. In the first tab, buy Mediterranean Avenue for $60.
3. In the second tab, change another player's name.
4. Reload the first tab.

Observed: Mediterranean becomes unowned again and the buyer's balance returns to
$2,500. The second tab saved its entire stale copy, erasing the purchase.

Cause: `speeddie/app.js:136–143` writes the complete snapshot without checking a
revision or handling external storage updates.

Fix: enforce one active writer or use a save revision with stale-write rejection
and a storage-change reload flow. A name change must never silently revert money.
Regression: two tabs independently mutate a game; the second write must refresh,
merge safely, or refuse, and the purchase must survive.

### 2. P1 — The last surviving player can be trapped behind an inherited fee

Reproduction: two players remain. The losing player cannot pay a player-to-player
bill and owns a mortgaged Reading Railroad. Declare bankruptcy to the other player,
who has $0 and no remaining assets that can raise cash.

Observed: one active player remains, but a $10 inherited mortgage bill hides the
winner screen. Pay is disabled. Declare bankruptcy says the last player has won,
yet the app still displays the unpaid bill and blocks play.

Cause: `speeddie/rules.js:148` creates inheritance bills before checking whether
the game has ended; `speeddie/companion.js:40–53` renders debts before the winner;
`rules.js:129` prevents bankruptcy of the last survivor.

Fix: represent game completion explicitly and apply terminal-state handling
consistently before creating further required financial actions. Endgame should
also disable ordinary money/building operations while allowing deliberate review
and correction.
Regression: last-player bankruptcy with mortgaged assets, both with and without
cash; bank bankruptcy with an outstanding auction queue.

### 3. P2 — Rent changes after landing when the owner manages property

Reproduction A: Alice lands on Bob's undeveloped Mediterranean Avenue while Bob
owns both brown deeds. The app shows $4 rent. Before paying, build a house there
through Manage properties.

Observed: Alice's bill changes to $10 even though she already landed.

Reproduction B: Alice lands on Bob's Mediterranean for $2. Mortgage that property
before clicking the rent button.

Observed: the rent button disappears and the stop says no rent is due.

Cause: `speeddie/companion.js:56–59` calculates rent from live ownership/buildings
on every render. A landing obligation is only captured when Pay is clicked.

Fix: capture the creditor, amount, and reason on arrival; resolve that obligation
independently of later asset changes. Keep card-specific adjustments explicit and
logged. The owner should not retroactively raise or erase an existing bill.
Regression: build, mortgage, trade, and ownership changes while a landing awaits
resolution, including both Classic Property Finder stops.

### 4. P2 — A funded incoming payment gets stuck behind the recipient's debt

Reproduction: Alice has $0 and owes the bank $50. Through Payment / card, record
Bob (who has $100) paying Alice $50.

Observed: Bob's payment is appended as another bill behind Alice's unpaid bank
bill. Alice still has $0; only the first bill can be settled. The normal payment
flow cannot apply the available incoming money. A cash-only trade is a workaround.

Cause: `speeddie/companion.js:143–146` queues all non-bank digital payments;
`rules.js:159–161` only settles queue index zero.

Fix: distinguish an immediate funded transfer from an unpaid obligation. Permit
eligible incoming payments needed to resolve an existing debt, while retaining a
clear order for mandatory card obligations.
Regression: debt → funded incoming transfer → settle original debt, with each
side debited/credited once.

### 5. P2 — A mistaken bill becomes uncorrectable after another action

Reproduction: enter $1,000 instead of the correct rent, then mortgage a property
while trying to pay. Notice the mistake and choose Undo.

Observed: Undo reverses only the mortgage. The $1,000 bill remains, Undo is now
disabled, and the debt panel has no edit/cancel control. Settings are blocked by
pending debt. Recovery requires an exported JSON edit, reset, or a fictitious
payment rather than a proper correction.

Cause: one-level undo in `speeddie/app.js:136–143` and
`companion.js:220–223`; debt controls at `companion.js:44–46` only offer payment,
asset management, trade, and bankruptcy.

Fix: allow explicit correction/cancellation of an unpaid bill, retaining the
interrupted turn and logging the old/new amount and reason. Prefer several undo
steps or transaction reversals for already-completed actions. Cash corrections
also need before/after amounts in the ledger.
Regression: incorrect bill → mortgage → correct bill → settle, including reload.

### 6. P2 — Correcting another player's Jail status cancels the current doubles turn

Reproduction: Alice rolls doubles and is entitled to roll again. Open Bob's token
/details, correct his position, and mark him in Jail.

Observed: Alice's button changes from “Roll again — doubles!” to “End turn.”
Clicking it advances to Bob. Alice loses her earned extra roll.

Cause: `speeddie/app.js:985–990` clears the global `extraTurn` even when the
corrected player is not the current player.

Fix: only update turn-wide state when correcting the player whose turn it is.
Regression: off-turn Jail corrections during doubles, Bus, and Classic first stop.

### 7. P2 — Clearing the rent amount marks the bill paid for $0

Reproduction: on an owned-property landing, erase the amount in the rent field
and click Pay / resolve bill.

Observed: the required field is accepted as zero, a $0 transfer is logged, and
End turn becomes available.

Cause: `speeddie/companion.js:238–243` converts the empty string with `Number()`;
the action is a plain button and does not invoke the field's form validation.

Fix: validate nonempty finite whole-dollar input before converting. If zero-rent
waivers are intentionally supported, expose an explicit waiver/correction action.
Regression: blank, whitespace, decimal, negative, and valid zero values.

## Usability improvements after the correctness fixes

- Disable impossible building/mortgage actions with a reason displayed beside the
  property. Currently many invalid actions look available and end in an alert.
- Offer a preview of several building purchases or sales across a color group;
  one-click-per-house and repeated dialog changes slow down physical play.
- Show a player's cash, available liquidation value, and exact shortfall together
  in property management and bankruptcy review.
- Keep Chance/Community Chest manual as designed, but add useful helpers: repair
  totals, a fresh utility rent roll, and a single workflow for card movement plus
  GO salary. These are product gaps, not failures of the existing declared scope.
- Make completed games clearly read-only for ordinary play. The winner still
  appears as “Taking turn,” and management/payment controls remain available.

## Test coverage conclusion

The original 36 automated tests still pass. Their coverage demonstrates isolated
successful actions, but missed interacting actions: multiple browser tabs,
post-landing changes, off-turn corrections, debt recovery, and terminal bankruptcy.
Each finding above should become a regression test before its fix is considered
complete. Another full play-through should then include negotiated trades,
transferred mortgages, and recovery from intentionally mistyped card amounts.

Rules reference: [Hasbro Speed Die / classic instructions](https://www.hasbro.com/common/instruct/00009.pdf).
In particular, the source identifies the last remaining player as the winner and
explains rent on landing and mortgage transfer obligations. The save, input,
queue, and correction findings are directly observed software behavior.
