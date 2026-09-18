# Board and saved-game review

82 tests pass: 53 browser scenarios and 29 pure rule scenarios. Syntax checks and
scoped diff whitespace checks pass. The suite also repeats the complete game:
190 rolls, 768 decisions, and a winner without a blocked play flow.

Reviewed and included:
- Read-only board overview with 40 correctly ordered perimeter spaces, live local
  player positions, ownership, mortgages, buildings, deed values and Jail status.
- Desktop and narrow phone layout, uploaded tokens, eight players, keyboard
  selection, and board access during pending auctions and after victory.
- Saved-game deletion with confirmation, active-copy cleanup, cancellation,
  storage failure recovery and preservation of unrelated games.
- JSON restore from an empty Home screen.

New holes fixed during review:
- A malformed saved-library entry could crash the Home renderer. Entries are now
  validated individually; good games remain usable and damaged entries can be
  downloaded as raw library recovery data or explicitly deleted.
- Failed New game / Resume writes could leave navigation flags inconsistent with
  the restored game. Views now update according to the save result.
- Resume read the archived copy before preserving current progress. It now saves
  first, preventing a stale current-game snapshot from replacing newer progress.
- Restoring from board view could retain that view and its selection. Successful
  restore returns to play. Sound timers update when games switch or reset.
- Home exposed the active-game settings menu. It now hides that menu so corrections
  cannot alter a game behind the saved-game list.

Setup explicitly identifies this as local pass-and-play. Own-device and mixed
shared-tablet/remote-phone rooms remain planned; no online rooms are implemented
or advertised as working. Their confirmed scope is in the multiplayer plan.

The optional valuation/correction controls remain as before; default locking was
recommended in conversation but has not been implemented in this board change.
