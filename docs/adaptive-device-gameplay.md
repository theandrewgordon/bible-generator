# Adaptive-device gameplay

Family Game Night stores an explicit `control_mode` on every new room. It is never inferred from the number of connected browsers.

| Mode | Physical devices | Controller model |
|---|---:|---|
| Couch Play (`couch`) | 2 | One public laptop/iPad plus one private phone passed between teams |
| Team Play (`team_auto`) | 3 | Public display plus one controller/player phone per team |
| Hosted Play (`hosted`) | 4+ | Public display, private host, and team/player phones |

The public promise is: **Works with 2 devices. Best with 3.** A television and casting are optional. When casting is used, only the public display should be cast.

## Authorization and secrets

| Surface | Unrevealed Act/Draw/Clue prompt | Guess answer | Public clues/drawing/scores | Scoring controls |
|---|---|---|---|---|
| Public display | Never | Never | Yes | No |
| Couch controller | Active prompt | Never | Yes | Yes |
| Active Team Play phone | Its active prompt | Never | Yes | Yes |
| Waiting Team Play phone | Never | Never | Yes | No |
| Hosted controller | Yes | Yes | Yes | Yes |

Filtering and action authorization are enforced by the room-state and mutation endpoints, not CSS. A room code alone grants no control. Existing signed session cookies provide room-scoped player/controller authority and CSRF protection remains in force for mutations.

## Mode rules and scoring

- Act It and Don’t Say It: the active team answers aloud; correct is +100.
- Guess It: teams answer aloud; points decline 100/75/50/25 as clues are revealed. Team devices never receive the answer.
- Draw It: Couch and Team Play use spoken Pictionary-style guessing and the active controller records +100 or pass. Hosted Play retains optional individual phone lock-in.
- Skip never retains points. Mutation guards prevent scoring a round twice.

Couch Play creates a virtual second team in the room so a single private phone can alternate Gold and Blue turns and retain separate team totals. Its heartbeat keeps that virtual team available; no child identity is synthesized or collected.

## Recovery

Controller authority survives refresh through the signed session. The creator retains ownership, recovery, close, and delete authority. Public displays are replaceable and contain no capability. Server timestamps remain authoritative for timers and room expiry.

## Bible Bee

Bible Bee continues to support shared verbal/team play and individual answer locking. A future dedicated team-controller pairing UI may improve its ergonomics, but the current game does not require one phone per participant. Oral Recitation remains host judged and does not expose its answer before judging.

## Remaining family playtests

- Observe phone handoff between Gold and Blue teams in Couch Play.
- Confirm a family understands which browser is private and which is safe to cast.
- Compare spoken Draw It adjudication with Hosted Play’s individual lock-in.
- Validate touch ergonomics and difficulty with children on real phones.
