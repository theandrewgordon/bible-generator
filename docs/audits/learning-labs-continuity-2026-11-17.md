# Learning Labs continuity and sharing audit — November 17, 2026

Scope: Geo Detectives, Math Fact Adventure, Latin Quest and Grammar Grove.

| Area | Finding | Change |
| --- | --- | --- |
| Navigation | Grammar was missing from the common game navigation and lacked a link back to the other games. | All four games use one game catalog, consistent names, current-page markers and a Labs link. |
| Sharing | Only three games had a Share control, its action was ambiguous, and success feedback was hidden. | Every game has Copy game link, visible confirmation and manual-copy fallback. Links use the canonical public route and omit learner names, scores, progress, tracking and unfinished rounds. |
| Latin continuity | Unfinished rounds were only held in memory and were lost when navigating to another game or reloading. | Save each learner's unfinished round locally. Explicit Resume returns to the first unanswered question, preserving points, help credit, draft answers and flashcard state without regrading prior answers. |
| Grammar continuity | Leaving/reloading lost question position, points and partially filled answers. Solo showed two score totals. | Save preferences and unfinished round state, provide explicit Resume, preserve draft/placed answers, and show one score in solo mode. Fresh chapters reset round points. |
| Setup simplicity | Latin's essential word-type, answer-style and reviewed-only options were inside nested drawers; the large header displaced the controls. | Main learning controls stay visible. Session length, voice and other optional tools remain in one Practice options drawer. The ancient-world header is more compact. |

Existing Geo and Math saved-round behavior, separate Start fresh/Resume actions, individual learning histories, Latin reviewed-word eligibility, OpenAI audio and saved voice caches are retained.

Data boundaries: journals and learner identities remain app-specific and browser-local. This audit does not merge differently named learner profiles or add account/cross-device synchronization. Grammar stores round scores and round state; it does not claim to provide the same long-term mastery journal as the other apps.

Validation includes production builds, all existing learning-app checks, Latin saved-state validation/controller tests, safe canonical-link tests, and browser checks for navigation, clipboard fallback, resume/draft preservation, visible Latin setup controls and desktop/phone overflow.
