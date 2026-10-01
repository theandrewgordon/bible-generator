# Faith Sparks live audit — 1 October 2026

Target: https://faithsparksprintables.com. This audit used the deployed browser UI and real storage, not the earlier local fixtures.

## Release and findings

The hardening change was merged to main as `42d63ef` through PR #3. The deployed page was verified to include the recovery, question retirement, Group, and Home changes. Its full CI job passed.

Two additional issues were reproduced and fixed in `5326ca5`, pushed to main and verified live:

1. **Async rematch refresh reopened the original invitation.** The old `?s=` code remained in the URL. After starting a rematch and answering question one, reload returned to the original invite. The fix clears the old query before saving the new round; Daily replay received the same fix. Final production retest stayed on question two with the same question after reload.
2. **The Labs Same Brain card unnecessarily required Google sign-in.** It linked to `/labs/games/same-brain`. It now points to `/same-brain`; clicking the deployed link opened the public game without sign-in.

Ordinary in-game refresh also lost progress on the old deployment at the start of this audit. After the initial hardening deployment, question-two recovery passed in the live browser.

## Production checks

- Created a five-question challenge as Audit Host; lowercase code entry opened it after deployment, retaining its original question IDs.
- Completed it as Audit Friend and saw 100%; the creator's response list showed the friend and score with a full-comparison action.
- Refreshed a received challenge at question two and preserved progress. All answers disabled after one choice.
- Invalid short code displayed “Enter the full 7-character code.”
- Separate HTTP sessions tested Together against real storage: identical question IDs, hidden first-player answers, forbidden outsider access, equal 60% results, immutable retries, and third-player rejection.
- Two concurrent real Together rematch requests returned the same successor room. This is one real contention test, not a load test.
- Group anonymous create/join passed. Retries did not add players; host/participant keys recovered results; invalid keys received 403.
- Joined that Group through the browser as a third player. The results displayed three players and 87% consensus, and survived reload.
- The public free John 3:16 worksheet flow reached “Worksheet ready” and incremented the practice counter. The generated PDF contents were not inspected.
- Same Brain and worksheet pages had no horizontal overflow at 390px; Group results had none at 820px. The worksheet mobile menu expanded. Desktop public navigation was inspected.
- Five first-party assets referenced by the home, worksheet, and Same Brain pages returned 200. The inspected worksheet and Group tabs had no recorded console errors.

## Public entry-point checks

22 entry points were checked initially: 19 public pages returned 200, three redirected to Google sign-in, and none produced HTTP errors. A sign-in redirect does not verify the authenticated workflow. The Same Brain Labs link was subsequently corrected as described above.

Public pages checked: `/`, `/prepare`, `/play`, `/labs`, `/families`, `/churches`, `/start-here`, `/about`, `/verse-of-the-week`, `/scripture-attribution`, `/terms`, `/privacy`, `/copyright`, `/plus`, `/family-game-night`, `/family-bible-bee`, `/games`, `/labs/weekflow`, and `/generate`.

Sign-in destinations checked: `/worship`, `/labs/games`, and the old `/labs/games/same-brain` entry. The authenticated Labs route remains available; the public card now bypasses it.

## Automated follow-up validation

The full GitHub CI job passed for follow-up commit `5326ca5`. Locally, 169 affected Python tests passed. Five existing SyntaxWarnings in unrelated Ice Cream HTML patch strings were reported. Runtime checks passed 39,600 simulated rounds, including a new async-rematch URL regression. The browser regression scenario now also checks rematch refresh. The new behavior was verified manually against the deployed site.

## Limits and test records

- Tests used clearly named Audit Host/Friend/Browser/Final records and created a Together successor room. Test rooms remain subject to normal expiry. Existing users' rooms were not modified. This produced a small amount of audit analytics traffic.
- Browser tabs shared one browser profile. API checks used separate HTTP sessions.
- Physical iPhone/iPad hardware, Facebook/Messenger embedded browsers, and native mobile share sheets were not tested. Responsive viewport checks do not substitute for them.
- Signed-in premium tools, checkout/payment, account-backed avatars, and live paid TTS were not exercised. They retain earlier automated coverage and still need account/device checks.
- This was a focused functional release audit, not exhaustive security, accessibility, load, or all-products acceptance testing.
