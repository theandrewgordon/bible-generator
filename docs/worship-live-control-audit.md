# Worship leader live-control audit

This audit focuses on the moments when one person is leading worship, watching the room, and controlling slides from a phone or clicker. Every change below is implemented in the live remote, presenter, or stage view.

| # | Improvement | What it saves | Worth doing? | Familiar or new? |
|---|---|---|---|---|
| 1 | Audience and stage displays refresh in 200–350 ms during normal operation | About 0.8–1.2 seconds of uncertainty per slide change | Yes — this fixes the reported delay at its source | Performance improvement, not a new feature |
| 2 | Rapid Next/Previous commands queue instead of disappearing | Repeated taps, missed lyrics, and recovery effort | Yes — dropped input is unacceptable live | Familiar transport-control behavior |
| 3 | Touch controls fire on touch-down and immediately vibrate/show “Sending…” | Perceived delay and “did it register?” uncertainty | Yes — especially valuable while looking away from the phone | Familiar mobile-remote feedback |
| 4 | Previous and Next identify and disable at the start/end of the set | Accidental taps and boundary confusion | Yes — small change, high clarity | Established presentation-control convention |
| 5 | Tapping the next-slide preview advances to it | One reach/tap decision per slide | Yes — the preview already communicates the target | Established in presentation remote apps |
| 6 | Swipe left/right on the current preview advances or goes back | Thumb travel and eyes-on-screen time | Yes — useful while holding the phone one-handed | Familiar mobile gesture |
| 7 | Arrow keys, Page Up/Down, Space, Home/End, C, and B work on the remote | Phone tapping when using a Bluetooth clicker or keyboard | Yes — makes common presentation hardware usable | Established presentation convention |
| 8 | Repeat chorus, Next item, and Undo jump stay visible | One disclosure click during the most time-sensitive recoveries | Yes — these are live recovery controls, not setup controls | Familiar actions in a worship-specific arrangement |
| 9 | Previous/Next stays sticky at the bottom, near the operator’s thumb | Reach effort and accidental scrolling | Yes — repeated hundreds of times in a service | Familiar mobile control layout |
| 10 | The remote shows item number, slide-within-item, title, and section | “Where am I?” confusion in long songs and services | Yes — context lowers recovery time without adding workflow | Familiar presenter/status context |

None of these invents a new worship workflow. They apply interaction patterns worship leaders already encounter in presentation remotes and mobile controls, while keeping the existing Faith Sparks session model intact.

## Verification invariants

- A second navigation tap received before the first network response is preserved and sent in order.
- Server responses do not roll the optimistic display backward while queued commands remain.
- Start/end controls cannot advance outside the deck.
- Remote polling still backs off on errors and ignores stale state while commands are pending.
- Presenter and stage views stop polling when hidden and recover when visible.
