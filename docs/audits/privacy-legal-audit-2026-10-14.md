# Privacy, Kids & Legal Audit — 2026-10-14

**Scope:**
- What FaithSparks collects about families and children, where it goes (Meta, OpenAI/Anthropic, Google, Stripe) and how long it stays.
- Account deletion.
- The privacy policy, terms and copyright policy against what the code actually does.
- Scripture and lyric licensing.
- Subscription disclosures.

**Baseline:** `main` at `221c25a`.

**How it was checked:** code review of every template that loads third-party scripts, every Firestore collection and Storage upload, the OAuth scopes, and the legal pages. Items marked **[verify]** depend on dashboard settings I can't see. *Not legal advice.* These are the gaps a careful reviewer would flag; a one-hour review by a lawyer of the final policy text is worth it once the fixes are in.

**The big picture:** the foundations are good.
- **No child accounts.** Kids play on standalone join and controller pages that load no tracking.
- **WeekFlow and Live Worship load no tracking.**
- **Scripture is public domain only** until licensed keys are added, and is never AI-written.
- **The copyright policy is solid.**

The real gaps:
- **The Meta Pixel runs on pages where children play.**
- **There is no way to delete an account,** though the policy promises it.
- **The privacy policy doesn't match a few things the app now does,** such as Google Calendar access, AI processing of family names, and the Medical tab.

---

## P1

### 1. The Meta Pixel loads on pages children use [verified in code]
`base.html` loads the Meta Pixel on **every page that extends it** (all but `/admin`), whenever `META_PIXEL_ID` is set **[verify]** in Render. It sends a hash of the signed-in parent's email for advanced matching. Pages that extend `base.html` include:
- **Labs games** (`lab_games.html`), where kids play under named player profiles.
- **Family Game Night** (`family_game_night.html`).
- **Games** (`games.html`, `games_detail.html`) and `play.html`.

Two problems:
- **Meta's automatic events are on.** `autoConfig` isn't disabled, so the pixel also collects **button text and page metadata** on its own. On the games pages that can include player names, which breaks the privacy policy's line "we do not intentionally send child names … to advertising measurement tools".
- **Every page URL is sent**, query string included (verse choices, for example).

**Why it matters:** COPPA treats ad-tracking identifiers collected on child-directed pages as personal information that needs verifiable parental consent; the FTC's recent enforcement has focused on exactly this. Meta's Business Tools Terms also forbid sending data from child-directed services.

**Fix (small):**
- Load the pixel **only on an allowlist of marketing and checkout pages**: home, Plus, Browse, Start Here, About, and purchase success.
- Call `fbq('set', 'autoConfig', false, id)` before `init`.
- Never load it on games, Labs, WeekFlow, worship or account pages.

### 2. No way to delete an account [verified in code]
The policy says "you may request … deletion through Support", but there's no tool for it, neither for users nor in admin. One family's data is spread across:
- `users` (including the Labs game roster of children's first names and progress)
- `worksheets` and their Storage files, `lesson_packs`, `referrals`, `gifts`
- WeekFlow state, saved weeks, integrations and feedback
- church memberships, plus churches they own
- `google_signin_tokens`, Same Brain challenges
- the Stripe customer

Doing that by hand in the Firestore console is slow and will miss things. Several state privacy laws, and Google's OAuth policy (#5), expect deletion to actually work.

**Fix:**
- One `delete_user_data(email)` service that cancels any Stripe subscription, removes or anonymizes each collection above, and deletes owned Storage files.
- Owned churches: transfer to another owner if there is one, otherwise delete.
- Keep `purchases` and `admin_log` rows with the email replaced by a hash (tax and dispute records).
- An **admin button** on the user page, and a **Delete my account** item in the account menu (type your email to confirm).

---

## P2

3. **AI-written ESV/NLT worksheets from before today can still be downloaded [verified in code].** Copywork now refuses ESV and NLT, because no licensed source is configured. But PDFs made before the copywork fix stay in families' history and are served as-is. They carry a Crossway or Tyndale notice over text the AI wrote.

   **Fix:** don't serve an ESV or NLT worksheet while that version isn't configured. Show "This version isn't available right now; remake it in KJV or WEB". Delete those files from Storage. *(Tested the same way as the old shared custom files.)*

4. **Google Calendar access isn't covered by the policy [verified in code].** WeekFlow asks for `calendar.readonly`, which Google classes as a **sensitive scope**. That requires:
   - Google's OAuth app verification. **[verify]** in Google Cloud → OAuth consent screen. Until then: a "Google hasn't verified this app" warning and a 100-user cap.
   - A privacy policy that says what Calendar data is used for, plus Google's **Limited Use** statement.

   **Fix:** add a short Google user data section to the policy, then submit for verification when WeekFlow launches.

5. **The privacy policy is vague, or behind the code, in a few places [verified in code].**
   - **Providers aren't named.** Name them: Google (sign-in, Firebase hosting and storage, Calendar), Stripe, OpenAI and Anthropic, Meta (marketing pages only, after #1), Render.
   - **What reaches the AI isn't stated.** WeekFlow AI intake sends household first names, typed notes, photos and voice notes to OpenAI, which stores nothing (`store=False`). Custom worksheet text goes through moderation.
   - **Children.** The section says children shouldn't submit information, but kids do type **player names** in games. Describe it honestly:
     - nicknames are saved under the parent's account;
     - live game rooms expire automatically;
     - kids never sign in.
   - **Medical.** The policy says "avoid diagnoses, medical details", yet WeekFlow has a **Medical** tab (refills, vaccines, provider, notes). Say it's for appointment logistics, and add the same one-line hint inside that tab.
   - **Retention.** State the actual periods: game rooms (hours), rate-limit records (about a day), deleted accounts (removed within 30 days).

6. **Subscription disclosures are thin [verified in code].** The Plus page says "Cancel anytime" and "$0 today". It doesn't say near the buttons that the plan **renews automatically at $X per month or year until cancelled**, or that **the card is charged when the trial ends** unless you cancel. California's auto-renewal law and several others require that, clearly, before purchase. Stripe Checkout shows the price, but the app's own page and terms are what regulators read.

   **Fix:**
   - One line under each plan button.
   - A short **Subscriptions** section in the Terms: renewal, how to cancel, refunds.
   - `consent_collection={"terms_of_service": "required"}` on Stripe Checkout.
   - **Dashboard:** turn on Stripe's trial-ending reminder emails.

7. **The Terms lack the basics:**
   - account holders must be 18 or older;
   - a limitation of liability;
   - governing law (your state);
   - how changes to the terms are announced.

   These are standard short paragraphs, worth having a lawyer glance at.

8. **Auto-delete depends on dashboard settings [verify].** Game rooms set `expireAt`; rate limits and Same Brain links set `expiresAt`. Firestore only deletes them if a **TTL policy** exists for each collection and field. Without one, children's nicknames in rooms, and emails and IPs in `rate_limits`, stay forever. The app already ignores expired records; this is about actually deleting them. The checklist below has the list.

## P3
- **DMCA agent [verify]:** the takedown policy is good, but safe harbor also needs a registered agent with the U.S. Copyright Office ($6, renewed every 3 years).
- **Logs** include emails (illustration and import logging). That's acceptable given Render's limited log retention, but don't log pasted text.
- **EU visitors:** Meta's pixel without a consent banner isn't GDPR-compliant. Ignore this unless you market to Europe; #1 limits it to marketing pages either way.
- **US state privacy laws** like the CCPA have size thresholds FaithSparks is well under. Recheck if it grows a lot.
- **Shared Library visibility** (auth #5) is still your call. It matters for CCLI.

## Scripture licensing — fine today, read this before adding keys
Production has no `ESV_API_KEY` or `API_BIBLE_KEY`, so only public-domain versions (KJV, WEB, ASV and so on) are offered. ESV and NLT get a friendly "choose another version" in Copywork, Bible Bee, lesson packs and worship. If you add keys later:
- **API.Bible (NLT and others):**
  - Commercial use (Plus is paid) needs a **Pro or Enterprise** plan; Starter is non-commercial only.
  - **FUMS usage reporting is required** for web display; a server-side call per view is fine.
  - Cached text must be **refreshed at least every 30 days**.
  - **Copyright attribution** every time the text is shown.
  - Print/PDF use isn't covered by their docs, so ask support@api.bible.
- **ESV API (Crossway) [verify]:** read its terms on commercial use and caching limits before using it on a paid site. Crossway also licenses separately.

## What's solid
- **Kids never sign in.** Game join, controller and room pages are standalone, with no pixel and no third-party scripts.
- **No tracking** in WeekFlow or Live Worship.
- **OpenAI intake** uses `store=False` and a hashed user ID.
- **Same Brain** challenge links are noindex and no-referrer.
- **Scripture** is public domain or licensed only; never AI-written.
- **Storage** uses signed URLs.
- **Google tokens** are encrypted and removed at logout.
- **The copyright and takedown policy** is clear, with a repeat-infringer rule and photo consent.
- **The terms** already say automated results can be wrong and that WeekFlow isn't professional advice.

## Your checklist (dashboards)
1. **Render:** is `META_PIXEL_ID` set? (Fix #1 is needed either way, before you turn it on.)
2. **Google Cloud → Firestore → TTL**, add policies for:
   - `family_bible_bee_rooms.expireAt` and `act_it_out_rooms.expireAt`
   - `rate_limits.expiresAt`
   - `speeddie_rooms.expiresAt`
   - `same_brain_challenges.expiresAt` and `same_brain_together.expiresAt`
3. **Google Cloud → OAuth consent screen:** check the verification status for the Calendar scope.
4. **Stripe → Settings → Billing → Subscriptions:** turn on trial-ending reminder emails.
5. **copyright.gov/dmca-directory:** register a DMCA agent.

## Suggested fix order
1. **#1** Pixel allowlist plus `autoConfig` off (small, biggest risk).
2. **#3** Stop serving old AI-written ESV/NLT PDFs (small).
3. **#2** Delete-my-data service, admin button and self-serve button.
4. **#5–#7** Policy and terms text, the renewal line, Stripe terms consent.
5. **#4** Google section in the policy, then verification at WeekFlow launch.
