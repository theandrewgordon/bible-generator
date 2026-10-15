# WeekFlow Audit — 2026-10-14

**Scope:** the WeekFlow lab: planner, Today/Kids, Household, Meals, Medical, Travel, Logistics, helper requests by SMS and email, Google Calendar, AI intake, saved weeks, templates, backup and restore, and the public demo.

**Baseline:** `main` at `935fee6`.

**How it was checked:**
- **Access sweep:** all 55 WeekFlow route-and-method pairs, called three ways (signed out, signed in but not on the beta list, beta user), against the real app with an in-memory Firestore.
- **Code review:** the store, support, calendar and scheduler services.
- **Load test:** timed the public scheduler on the largest input it accepts.

Items marked **[verify]** depend on Render settings.

**The big picture:** WeekFlow is carefully built.
- Every private route needs sign-in plus beta access.
- All family data lives under `users/<email>`, so account deletion removes it.
- Plan limits are enforced on the server.
- Every write is size-capped and rate-limited, and edits from two devices are caught as conflicts.
- Helper links are signed, expire in 7 days and store only hashes.
- Calendar tokens are encrypted with their own key.

The problems:
- **The beta list is open to everyone when it's empty.**
- **Helper requests can text any phone number in the world.**
- **The demo uses your children's names.**

---

## P1

### 1. WeekFlow is open to every signed-in user when the beta list is empty [verified in code, verify Render]
`_has_beta_access` returns True when `WEEKFLOW_BETA_EMAILS` is empty, and that setting isn't in `render.yaml`. If it's unset in Render, **any** Google account gets all of WeekFlow:
- saved family plans, Medical, Travel;
- texting and emailing helpers (#2).

The AI-cost fix closed only AI intake this way.

**Fix:** fail closed in production. With an empty list, only admins get in; the public demo pages stay public. When WeekFlow launches, switch it to Plus or set the list.

### 2. Helper requests can text any number in any country [verified in code]
`/logistics/support/send` accepts any E.164 number (`+[1-9]…`) and puts the user's own event title (120 characters) into the text. The only limit is 12 an hour per account, and accounts are free. Two risks:
- **SMS pumping (toll fraud):** scripted sends to premium international numbers. It's the most common way Twilio bills explode, and #1 makes it reachable by anyone.
- **Spam or phishing relay:** your number sends whatever text someone types to strangers.

**Fix:**
- Allow **US and Canada (+1) only** by default (`WEEKFLOW_SMS_COUNTRIES`).
- A **daily cap across the whole app** (for example 50 texts) plus a per-IP limit.
- **Dashboard:** in Twilio → Messaging → Geo permissions, allow the US only. **[verify]** whether Twilio is set up in Render at all; if not, this waits until it is, but #1 and the code fix should land first.

## P2

3. **The demo uses your children's real first names as IDs [verified].** The public demo and every new family's starting plan use `tessa`, `diana` and `elsie` as student IDs (shown as Avery, Maya, Lucy). They appear in every public demo response and 35 times in the scheduler code. The demo also mentions a "CC / co-op day". The scheduler gives `tessa` special treatment (the first-student defaults).

   **Fix:** rename to `student-1/2/3` and drop the special case. Saved family plans keep their own IDs, so nothing breaks for existing users.

   *Related, for chunk 7:* the Labs games page is titled "Tessa's Games", and four game files are named `gordon-*.html`.

4. **Helper-request records keep the owner's email and survive account deletion [verified in code].** `weekflow_support_requests` stores `ownerEmail` in plain text. Account deletion doesn't touch it, and it only disappears if a TTL policy exists for `expiresAt`, which isn't on the earlier checklist.

   **Fix:** delete them in `delete_user_data`, and add the TTL policy.

5. **Disconnecting Google Calendar doesn't revoke access at Google [verified in code].** Disconnect, and now account deletion, remove the encrypted token, but the grant stays listed in the user's Google account until they remove it themselves. Google's verification reviewers check for this.

   **Fix:** call `https://oauth2.googleapis.com/revoke` on disconnect and on account deletion.

## P3
- **Restoring a backup skips the plan limits.** A free user who restores a hand-edited backup can have 8 students, 3 adults and 8 templates. That's low impact while WeekFlow isn't sold, but the restore should run the same `_limit_error` check.
- **The public status endpoint** (`/logistics/integrations/status`) tells anyone whether SMS, email and maps are configured. It's harmless, but signing it in costs nothing.

## What's solid
- **Access:** all private routes return 401 when signed out and 403 when not on the beta list (when the list is set). Public routes: the demo pages, the stateless demo scheduler and planner, analytics, feedback and helper links.
- **Data location:** everything per family is under `users/<email>/weekflow…`, so the new account deletion removes it.
- **Plan limits on the server:** students, adults, saved weeks and templates (restore aside).
- **Abuse limits:** every write route is rate-limited and size-capped (24 KB–13 MB depending on the route), and the AI intake fix added an IP limit.
- **Conflicts:** edits from two devices raise `WeekFlowRevisionConflict` instead of overwriting.
- **Scheduler:** handles the largest accepted input (8 students, 100 tasks) in about 0.01 s, so the public demo can't tie up the single worker.
- **Helper links:**
  - signed and expire in 7 days;
  - the nonce and destination are stored only as hashes (last 4 digits shown);
  - responders see only the event title, adult name and job;
  - signing needs a 24+ character key or the feature turns off.
- **Calendar:** read-only scope; the token is encrypted with a dedicated Fernet key and never in cookies; events aren't copied.
- **AI intake:** hashed user ID, `store=False`, budgeted, fail-closed (from the AI and privacy fixes).
- **Medical tab:** "no diagnoses" hint (privacy fix).
- **Analytics:** anonymous hashes and counts only.

## Your checklist
1. **Render:** set `WEEKFLOW_BETA_EMAILS` to your family's adult emails, or leave it empty after fix #1, which then means admins only.
2. **Twilio** (if set up): Messaging → Settings → **Geo permissions → United States only**.
3. **Firestore TTL:** add `weekflow_support_requests.expiresAt` to the TTL list from the privacy audit.

## Suggested fix order
1. **#1** Fail closed in production (small).
2. **#2** +1-only texts, daily cap, IP limit.
3. **#3** Rename the demo IDs.
4. **#4, #5** Clean up support requests on deletion; revoke the Google grant.
5. **P3** Limit check on restore.
