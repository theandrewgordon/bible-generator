# Geo play audit — November 16, 2026

This audit used the public game as a learner and parent, then replayed the repaired flows locally. It includes Quest, incorrect guesses, clues, skipping, pause/resume, teams, revisiting completed questions, Undo after reload, comparison judging and the final journal. It is a sampled play audit, not a claim that every clue or device has been manually reviewed.

## Reproduced and corrected

| Hole | Observed behavior | Change |
| --- | --- | --- |
| Overlapping answers remained | The phone playthrough offered hot spring and geyser as competing answers for the same clue. | Remove that pairing, explain the relationship, and expand the overlap policy for nested categories. |
| Repeated opening deck | Starting a new All landscapes session returned Bay, Beach, Brook, Cape and Coast again. | New sessions spread across themes and favor less-practiced cases; team selection considers both learners. |
| Active option discarded a session | Pause, click the already-selected One detective option: Resume disappeared. | Selecting an unchanged option preserves the session. Changing an actual option still starts a new setup. |
| Pending team turn could be stolen | Answer two questions, return to team two's recorded answer, then jump to unanswered question three: it remained team two's turn. | Pending and manually assigned question ownership are stored independently of the answer being viewed. |
| Skip was recorded as an error | Skip for now incremented the learner's wrong count and displayed Discovered. | A separate skipped record, no wrong judgment, a Skipped trail marker, and a retry action that restores the prior learning record. Skips remain worth revisiting and appear separately in the results note. |
| Team points disappeared at the finish | The journal showed learning counts but neither team's final score. | Final team/solo scores and a lead/tie heading. |
| Undo disappeared after reload | Save/reload removed all snapshots. | Persist and validate up to five bounded Undo snapshots. |
| Next left the new prompt above the viewport | Advancing from the footer kept the viewport near the bottom of the next comparison. | Focus the new heading and scroll its mystery board into view; show the current team in the card metadata. |
| Comparison instructions were wrong | Compare's toolbar said to choose one of three terms. | Explain aloud and check together. |
| Feedback was indirect | A wrong selection showed A new thing learned without explicitly stating the choice was incorrect. | Correct/Not quite/Answer revealed text identifies the choice and best answer. |
| Visual and wording mismatch | A moraine was pictured as glacier ice or a mountain; the singular gated-chamber clue's answer was locks, pictured as a river. | Independently drawn moraine and lock diagrams; lock is singular. |
| Placeholder examples | The 24 newer cases repeated their third clue under In the world. | Independently written concrete situations for all 24. |
| Phone answer placement | Scenery and guide separated the clue cards from their answer buttons. | Phone choices, feedback and navigation appear before the optional scenery; new feedback scrolls into view. |

## Validation

The learning tests now include regressions for unchanged options, turn ownership, manual assignment, skip/retry, restoration of prior records, bounded saved Undo, varied unseen decks and meaningful field examples. Existing question counts, valid choices, overlapping-term exclusions and illustration-class coverage are retained. The updated flows were also played through the browser UI, including a parent-approved comparison and a four-skip session, checking visible state rather than only internal data.

Illustrations and examples are original FaithSparks work. General reference facts were checked against [NPS glacial geology](https://www.nps.gov/glac/learn/nature/glacial-geology.htm), the [USGS glacier glossary](https://pubs.usgs.gov/of/2004/1216/text.html) and [USACE's description of locking](https://www.swt.usace.army.mil/Missions/Navigation/Locking.aspx). The [NPS hydrothermal guide](https://www.nps.gov/yell/learn/nature/hydrothermal-features.htm) also confirms that geysers are a type of hot spring. No reference artwork or prose was copied.

## Remaining learning-design gap

Geo is still primarily a geography vocabulary and comparison game. The illustrated theme map chooses a topic; it is not an exercise in locating places, interpreting scale, placing a label on a diagram, or navigating a real map. Those would add a different kind of geographic reasoning. Parent scoring in Compare also remains deliberate human judgment rather than automatic assessment of a spoken explanation.
