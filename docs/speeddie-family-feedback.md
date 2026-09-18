# Speed Die family feedback — working notes

Status: working feature plan. Bankruptcy report withdrawn; card source, initial
board scope, and shared-screen auctions confirmed below. Remaining proposals are
identified separately.

## Interpretation of the dictated notes

- “Chance and today be checked” probably means Chance and Community Chest.
- “All mods” probably means both helper and banker modes.
- “Using last words” probably means fewer words with clearer instructions.
- “Save the game ... particles” appears to mean save progress and start another game.
- “House words or rules” appears to mean choosing house rules during setup.

These are interpretations, not confirmed requirements.

## Ideas and assessment

| Idea | Usefulness / scope | Recommended behavior |
| --- | --- | --- |
| Bankruptcy should work | Critical; investigate the exact failed interaction | Show an obvious “Can't pay?” action on a bill, with shortfall, available assets, sell/mortgage/trade options, and bankruptcy when eligible. Current code requires an unpaid bill and disallows bankruptcy while cash plus liquidation value covers it. Determine whether the complaint is a bug, an unclear restriction, or a request to quit voluntarily. |
| Less confusing banker toolbar | High; interface simplification | Use a small “Bank” menu for manual transfers and history. Put “My properties” with the player and card actions at the landing. Hide advanced correction tools behind a separate control. |
| Chance / Community Chest in the app | High; substantial feature if actual decks are included | Choose physical cards or in-app cards during setup. Physical mode should provide guided actions; in-app mode needs a specified edition, deck order, held cards, movement and payment handling, and save/undo support. Do not invent “exact” card wording without identifying the edition. |
| Return to home when game ends | High; small-to-medium scope alongside saved games | Celebrate first, show the winner, then offer “Home” and “Play again.” Preserve the completed game and undo; avoid instantly replacing the winner screen. |
| Victory celebration | Good polish; small scope | Gold winner panel and brief confetti. Respect reduced-motion settings. |
| Dice pictures / dots | High readability; moderate visual work | Show pip faces for ordinary dice. Keep Speed Die symbols distinct. Optional numeral/pip preference for numeric faces; preserve accessible text labels. |
| Shorter, clearer wording | High; broad interface pass | Put one next action first, with brief outcome text such as “Pay Bob $50.” Move explanations into expandable help rather than deleting necessary information. |
| House rules chosen at setup | High; moderate behavior changes | Provide an official preset plus explicit house-rule choices. Start with rules already supported: leave unowned, Free Parking reward/pot, and Speed Die activation/movement variants. Only display “Leave unowned” when enabled; preserve the selected rules in the save. |
| Menu explanations | High; small-to-medium scope | Use tap/click information buttons and keyboard-focusable help. Hover can supplement help but cannot be the only way to read it on phones. |
| Guided auctions | High; substantial workflow | On one shared screen, show the property, current bid, leader, and whose bid it is. Offer affordable bid increments, custom bid, and pass. Define who bids first and whether passing withdraws the player. Award once everyone except the leader has withdrawn. Include zero-bid handling, bankrupt-player exclusion, save/resume and undo. Keep “Record an auction held at the table” as an optional shortcut. |
| Sound effects and background music | Effects useful; music optional polish | Separate effects and music controls, mute and volume. Start only after user interaction. Use short dice/build/payment/victory sounds; music should be optional and unobtrusive. |
| Save multiple games | High; substantial persistence change | Home screen with named saved games, Resume, New game and completed games. Retain autosave and export/import. Starting another game must not overwrite the existing one. Editing locks must apply per game. |
| Fixed starting cash with bill breakdown | High clarity; small-to-medium scope | Use the selected rules preset instead of a free-form setup amount. Display the total and physical bill quantities in helper mode; show the opening balance in banker mode. Balance corrections for resuming a physical game remain separate. |
| House symbols | High readability; small visual scope | Show 1–4 house icons or a hotel, plus a text count. Use a clear Build button; expose eligibility and cost. Do not rely on an emoji alone for an action. |

## Questions sent to the parent

1. What exactly happens when bankruptcy fails: missing control, disabled control,
   or an error? What is the message?
2. Should setup offer physical vs in-app cards, keep only physical cards with
   guided effects, or always draw in the app?
3. Should guided auctions run on one shared screen, remain spoken at the table,
   or allow separate devices?

## Suggested order

1. Simplify bills, player properties, wording,
   house-rule setup and touch-friendly help.
2. Build named saves and Home/Resume/New game, with a clear winner exit.
3. Add shared-screen auctions and the chosen card experience.
4. Add pip dice, building icons, a brief celebration, and optional audio.

The core direction is a family-facing game companion with one clear next action
at each stop. Card source and auction-device decisions are recorded below.

## Parent decisions and follow-up — September 17

- Bankruptcy worked; the reported failure is withdrawn. Keep the existing safeguards
  and tests. Clearer presentation can remain part of the interface work.
- Card handling must be a setup choice: physical cards or in-app cards.
- Auctions should use one shared screen with alternating player bids/passes, similar
  to the Switch experience. Separate-device bidding is out of scope for this plan.

### Recommended physical-card workflow (proposed, not yet confirmed)

Show “What does your card do?” with these choices:
- Collect money from the bank.
- Pay the bank.
- Collect from / pay each other player.
- Move to a space, nearest railroad/utility, or backward a number of spaces.
- Go to Jail.
- Keep a Get Out of Jail Free card.
- Pay repairs, calculated from houses and hotels using the rates on the card.

Ask only for the needed amount/destination/rates. Preview the consequence before
applying it. Card moves should account for GO, special rent, the new landing, and
Classic Speed Die continuation together. Keep text describing the physical card
optional; do not require typing its exact wording or searching an edition-specific
card list. A manual correction remains available for unusual cards.

For in-app cards, “Draw card” displays the card and “Apply card” applies its effects
once. The exact supported edition/deck still needs to be selected before this
feature is implemented. Physical-card mode remains usable with other editions.

### Confirmed initial board scope

Start with Classic US / Deluxe Monopoly. The parent's physical Deluxe board is
from the 1990s; its exact printing is not currently available. Defer Dogopoly,
Gatoropoly, and other themed boards.

Board selection should select the corresponding deck. Keep the separate setup
choice between physical cards and in-app cards. Verify Classic deck effects and
edition-sensitive rules before implementation; do not label a generic Classic
deck as an exact match for an unverified 1990s Deluxe printing. Clearly identify
the supported deck, and retain guided physical-card consequences for differences.
The user does not need to locate their boxes to proceed with Classic support.

### Shared-screen auction proposal

Show property, current leader/bid, active bidder, and available cash. Provide bid
increments, a custom bid, and Pass. Proposed default: passing withdraws a player
from that auction. Continue until only the leading bidder remains. Handle a full
round with no bids explicitly; do not silently turn it into a purchase or a house
rule. Deduct cash and transfer ownership once at completion. Persist an unfinished
auction so it can resume after closing the app. This is a proposed interaction,
not a claim that every Switch auction rule has been reproduced.

## Implementation — September 17

Implemented the agreed first release: clearer Bank menu, physical/digital card
setup, guided consequences and previews, persistent shared-screen auctions, named
saved games and Home, fixed starting money and bill quantities, optional house
rules, dice dots, house/hotel icons, gold victory animation, and optional generated
sounds/music. Existing bankruptcy protections remain in place.

Digital cards use traditional US 2008–2020 effects, with short original summaries.
They are labeled as a compatibility deck, not an exact 1990s Deluxe reproduction.
The physical-card workflow handles printing differences. No themed boards added.

The archive is local to the browser, with export/import backups. A browser-wide
writer lock protects the library and active game; simultaneous editing of different
saved games in separate tabs is deliberately not enabled in this release.
