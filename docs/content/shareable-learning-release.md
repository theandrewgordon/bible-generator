# Shareable learning release — November 16, 2026

## Active release decisions

These games are independent FaithSparks educational tools, with no claim of endorsement, certification, or curriculum-provider affiliation. The share button copies only the public game URL; names, answers and learning records are browser-local.

The former photographed Latin card transcription is replaced by a newly selected 191-card collection: 80 nouns, 63 verbs, 12 conjunctions and 36 original grammar prompts. New `fs-` IDs prevent historic progress from being silently reassigned to different words. Existing browser records remain stored, but only the current collection counts in the current journal. The selection is organized around general everyday vocabulary and grammatical coverage, rather than a commercial course's sequence. Standard Latin facts were checked against general reference traditions including Lewis & Short (1879) and Allen & Greenough (1903); their compilation or modern edited prose is not reproduced.

The imported 300-question Math answer-key bank is removed from active source and bundles. Arithmetic is derived by the game, with original missing-number and story variants. There are no commercial worksheet identifiers or answer-key references in the interface.

All 125 Geo clue triples were authored for this release, grouped into independent themes. Fifty-five comparisons explain relationships rather than force false exclusive categories. Overlapping term families are excluded from right-versus-wrong alternatives. USGS explicitly notes that lake/pond and river/creek classifications lack universal cutoffs. Original diagrams are used for map and groundwater concepts. Previously commissioned/generated FaithSparks artwork supplies the illustrated interface; no CC logos, audio, maps, page layouts or characters are added.

## Sources consulted

- Classical Conversations' own sharing guidance: https://classical-conversations.helpscoutdocs.com/article/33-copyright-and-permission-to-use-classical-conversations-materials
- U.S. Copyright Office on factual compilations: https://www.copyright.gov/register/tx-databases.html
- U.S. Copyright Office, ideas and facts versus expression: https://www.copyright.gov/engage/docs/literary_works.pdf
- USGS on overlapping geographic names: https://www.usgs.gov/media/audio/what-difference-between-lake-and-pond-mountain-and-hill-or-river-and-creek
- General Latin dictionary reference portal: https://logeion.uchicago.edu/
- Original 1903 grammar reference: https://archive.org/details/allengreenoughsn01alle

This is a documented risk-reduction process, not a legal clearance or promise of zero legal risk. CC's own guidance places restrictions on distributing creations using its content; this public release therefore replaces the earlier collection rather than relying on a disclaimer or a purchaser-only assumption.

## Authorized historical cleanup — executed November 16, 2026

The user explicitly authorized coordinated removal from public history. A complete private recovery mirror and the independent release archive are stored outside the repository in an owner-only directory; the recovery mirror has a disabled push URL. The related active FaithSparks chat was notified before the rewrite.

The historical Latin content directory, embedded Math bank source, Geo question data, former standalone games and all generated learning bundles were removed from all locally mirrored refs. The independently authored current files were then restored. Before publication, the full application tree matched the tested release exactly (`9a350824c0fb36eb0b01ac5f5043f8f4a93f5789`). No unrelated file changed on any affected branch.

An atomic push with an explicit old-tip lease for each branch updated all 10 affected published branches, preserving the other 26 branch tips. A subsequent fetch and reachability check confirmed that none of the 36 published branch heads reaches any of the 369 replaced commits. The sanitized application release is `65d0bf8c2ce970056d5806b0195ded5763c1350b`. This checkout now follows that history, and a local push guard rejects branches containing the first removed ancestor. Other checkouts must preserve uncommitted work and rebase or re-clone; merging an old branch would republish removed history.

### GitHub-retained copies remain a platform limitation

This is **not a complete erasure of all public historical copies**. GitHub retains read-only pull-request references; after the branch rewrite, affected older refs were still advertised for PRs 2 (merge ref), 3–11 and 13. A direct historical raw-content URL also returned HTTP 200. Branch force pushes cannot delete those references or GitHub caches. No public forks were listed at the time of the audit; independently retained clones are outside this repository's control.

A factual platform-support request and recovery instructions are prepared outside the public repository. GitHub's sensitive-data documentation says its support process does not remove non-sensitive data, so this copyright/content cleanup must be described accurately and may require a different platform process. No legal infringement finding is asserted, and no takedown notice was submitted on the user's behalf.

See GitHub's explanation of retained pull refs, caches and clone coordination: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
