# Billing Audit — 2026-10-14

**Scope:**
- `faithsparks/views/billing.py`: Stripe checkout, success pages, billing portal, webhook, referrals, trials.
- `services/usage.py` and `services/users.py`: plans, quotas, Plus checks.
- Every place that grants or checks access: generate, games, bundles, Family Game Night, Same Brain, WeekFlow.
- Admin gift, set-plan and reset tools.

**Baseline:** `main` at `85a7f42`.

**How it was checked:**
- I read every money path in the code.
- I sent signed Stripe webhook events to the real app, with an in-memory Firestore and Stripe's API stubbed.
- I posted real checkout requests with CSRF.

Items marked **[verified]** were reproduced; **[verify]** depends on Stripe dashboard settings I can't see.

**The big picture:** signature checks, CSRF, sign-in on checkout and bundle purchase verification are solid. The weak spot is the webhook. It trusts the first event it sees, swallows its own failures, and never reads the subscription's real status. That one handler causes most of the P1 findings. Only 3 test files touch Stripe, and none test the webhook.

## Status — fixes applied 2026-10-14

I re-ran the same simulation against the real app, and all 8 scenarios now behave correctly. `tests/test_billing_audit_fixes.py` adds 19 tests, all failing on the old code. The full suite has 1,017 passing.

| # | Status |
|---|---|
| 1 Silent drop | Fixed: a failed fulfillment answers 500, so Stripe retries. Each event ID is processed once. |
| 2 Second subscription | Fixed: members see **Manage billing** on `/plus`, and the server sends a second checkout to the billing portal. Cancelling an *old* subscription never touches the current one. |
| 3 Classroom quota | Fixed: the plan comes from the price map. Members who subscribed earlier (stored as "plus") are recognized from their saved price, so no migration is needed. |
| 4 Failed payments | Fixed: access follows Stripe's status. `active`, `trialing` and `past_due` (the retry window) keep Plus; `unpaid`, `paused` and `canceled` remove it. A gift still active is kept. |
| 5 Replayed events | Fixed: every subscription event writes the subscription's live status, so an old replay can't re-grant Plus. |
| 6 Free-verse batch | Fixed: every generated worksheet is billed except free-library ones |
| 7 `/regenerate` | Fixed: 12 per hour per user, and it reuses the stored verse data instead of calling the API |
| 8 Any price | Fixed: only the configured Plus prices can be bought |
| 9 Trial reuse | Fixed: one trial per account |
| 10 Gift end | Fixed: an expiring or revoked gift returns a paying member to their paid plan |
| 11 Referral | Fixed: the free month is added *alongside* existing discounts (`discounts=[…]`); it applies only to subscriptions |
| 12 API drift | Fixed: renewal date and invoice subscription are read from both old and new locations |
| 13 Missing secret | Fixed: answers 500 and logs an error |
| 14 `/plus` speed | Fixed: price lookups cached for an hour |
| 15 Lesson packs | **Your call:** unchanged (6 per hour, not on credits) |
| 16 Game re-download | Fixed: one credit per game |
| 17 Usage race | Fixed: atomic `Increment` |
| 18 Plus check | Fixed: games and bundles now use `has_active_plus` |
| P3 | Removed `resolve_price_id_local` and `/admin/reset_credits`. The success page now grants Plus right away after verifying with Stripe. `/buy/pack` stays a sign-in-only GET, because the sign-in redirect depends on it. |
| Also | `/plus` showed "$0 today" to everyone, but only invite trials are free. It now says "Cancel anytime" unless a trial applies. |

The dashboard checklist below still applies.

---

## P1 — customers pay and don't get Plus, or keep Plus without paying

### 1. A failed fulfillment is silently dropped [verified]
The webhook wraps everything in `try/except` and **returns 200 even when the Firestore write fails**. A 200 tells Stripe "done", so it never retries.
- A brief Firestore hiccup during `checkout.session.completed` means the customer is charged but never gets Plus.
- Nothing alerts you.
- *Simulated:* Firestore error during fulfillment → webhook answered 200, user `isPro: None`.

**Fix:** return 500 when fulfillment fails, so Stripe retries for up to 3 days. The writes are merges, so a retry is safe.

### 2. Plus members can buy a second plan, then lose Plus while still paying [verified]
- `/plus` shows the subscribe buttons to members who already have Plus.
- `/create_checkout_session` doesn't check for an existing subscription.
- A member who "switches" monthly → annual by buying again ends up with **two subscriptions**, charged twice.
- When they cancel the old one, `customer.subscription.deleted` sets `isPro: False` without checking which subscription ended.
- *Simulated:* monthly + annual → cancel monthly → annual still billing, user `isPro: False`, `subscriptionId: None`.

**Fix:**
- Show Plus members **Manage billing** (the Stripe portal handles switching with proration) instead of buy buttons.
- Refuse a second checkout server-side.
- On `deleted`, only downgrade when the deleted subscription is the user's current `subscriptionId`.

### 3. Classroom subscribers get the Family quota (15/month instead of 100) [verified]
The webhook picks the plan by comparing to the legacy `STRIPE_PRICE_FAMILY` / `STRIPE_PRICE_CLASSROOM` env vars. It doesn't use the monthly/annual prices you actually sell. Every subscriber is stored as `plan: "plus"`, and `_quota_for_plan("plus")` gives the **Family** limit.
- *Simulated:* classroom monthly purchase → `plan: plus` → 15/month.

**Fix:** use the existing `PRICE_KIND_MAP` (`_classify_price`) in the webhook. Then run a one-off script to correct existing classroom users from their `priceId`.

### 4. Failed payments never remove Plus [verified + verify]
`customer.subscription.updated` only stores `renewAt` and `priceId` and ignores `status`, and `has_active_plus` reads only `isPro`.
- `past_due`, `unpaid` and `paused` all leave Plus on.
- *Simulated:* all three statuses kept `isPro: True`.
- Plus is removed only if Stripe eventually **deletes** the subscription.

**[verify]** In the Stripe dashboard (Billing → Revenue recovery → Retries), the setting for "if all retries fail" decides the impact:
- If it's **Cancel subscription**, the impact is a few weeks of free access during retries, which is normal.
- If it's **Mark as unpaid** or **Leave as-is**, those users keep Plus forever.

**Fix:** derive access from the subscription status (`active` or `trialing` → Plus) on every subscription event.

### 5. A replayed old event re-grants Plus after cancellation [verified]
Stripe delivers events at least once and not in order. A retried `checkout.session.completed` arriving after `customer.subscription.deleted` sets `isPro: True` again. That happens even though the subscription it just fetched from Stripe says `canceled`. The same replay also resets `trialStartedAt`.
- *Simulated:* delete → replayed completed → `isPro: True`.

**Fix:** handle all three subscription events with one `_sync_subscription(sub)` that writes state from the subscription's **current** status. Also record processed event IDs, so a duplicate is a no-op.

---

## P2 — money leaks and drift

6. **One free verse makes a whole batch free [verified in code].** `worksheets.py:612` skips counting usage for the entire request if *any* item is a free slug. A batch of one free verse plus 10 others costs 0 credits. **Fix:** count `success_count − free_count`.

7. **`/regenerate/<file>` has no quota or rate limit.** It calls the verse API (OpenAI) every time, and it's a GET. Reloading it repeatedly is unlimited AI spend. **Fix:**
   - Make it POST.
   - Apply the generate rate limit.
   - Either count a credit or serve the stored JSON instead of re-fetching.

8. **Checkout accepts any price [verified].** `price_id` comes from the form and `resolve_price_id` passes through any `price_…` or `prod_…`. *Simulated:* `price_SOME_OLD_1_DOLLAR` went straight to Stripe. Any old, test or cheaper price in your account can be bought as Plus, and the webhook grants Plus for any subscription. **Fix:** allow only the four prices in `PRICE_KIND_MAP`.

9. **Trial codes can be reused.** Nothing checks for an earlier trial, so the same account can cancel and start another 30-day trial forever. **Fix:** skip the trial if the user already has `trialStartedAt` or a past `subscriptionId`.

10. **Gift expiry or revoke downgrades paying customers [verified].** Both write `plan: free, isPro: False` even when the user has an active subscription. *Simulated:* paying user plus an expired gift → `isPro: False`. **Fix:** on expiry or revoke, restore the subscription state when `subscriptionId` is active.

11. **Referral reward may wipe a lifetime discount [verify].** `_grant_referral_reward` sets `coupon=` on the subscription. In Stripe that **replaces** the existing discount, so a referrer on `SAVE25FOREVER` gets one free month and then loses 25% forever. The `coupon` parameter is also deprecated in current API versions. **Fix:** add the coupon through `discounts=[…existing, {coupon}]`, or as a credit balance.

12. **Stripe API version drift [verify].** `stripe==16.0.0` pins a 2026 API version. Since `2025-03-31.basil`:
    - `subscription.current_period_end` moved to subscription items, so `renewAt` is never set.
    - `invoice.subscription` moved to `invoice.parent.subscription_details`, so the `invoice.payment_succeeded` handler finds no subscription. **Trial-conversion metrics and referral rewards never fire.**

    **Fix:**
    - Read both locations.
    - Check the webhook endpoint's API version in the dashboard (Developers → Webhooks).
    - Add a test that feeds a current-format event.

13. **A missing webhook secret drops every event with 200.** If `STRIPE_WEBHOOK_SECRET` isn't set, the handler answers 200 and does nothing, so purchases vanish quietly. **Fix:** return 500 and log an error, so the Stripe dashboard shows failures.

14. **`/plus` makes 4 sequential Stripe API calls on every view** (`Price.retrieve` ×4). That adds roughly 0.5–1.5s to your pricing page and uses Stripe rate limit. **Fix:** cache prices for an hour.

15. **Lesson packs aren't on credits.** Any signed-in user can make 6 per hour, about 144 per day, each costing several AI calls. This is a product decision: put them on credits or Plus, or lower the cap.

16. **Re-downloading a game spends a credit each time** (`dl_game`). **Fix:** charge once per slug per user.

17. **Usage counting can lose increments.** `_update_usage` reads, adds, then writes, so parallel generations can lose counts. **Fix:** `firestore.Increment`.

18. **Four different "is this user Plus?" rules:**
    - `has_active_plus` checks `isPro`.
    - `dl_game` checks `isPro` or the plan name.
    - `_get_user_plan` checks the plan field first.
    - The navbar uses its own session cache.

    They disagree in edge cases (gift, admin set-plan, legacy docs). **Fix:** one function, used everywhere.

## P3 — cleanup
- **Dead code:**
  - `resolve_price_id_local` in app.py duplicates `stripe_svc`.
  - `/admin/reset_credits/<uid>` writes a `credits` field nothing reads, and no page links to it.
  - The legacy `STRIPE_PRICE_FAMILY` / `STRIPE_PRICE_CLASSROOM` variables.
- **`/buy/pack/<slug>` is a GET** that creates a Stripe Checkout session, so link previews and prefetch create sessions. Make it POST.
- **Success pages don't fulfill:** `/plus/success` and Family Game Night success rely only on the webhook (bundles verify and fulfill on the success page). After #1 that's fine. Optionally verify and fulfill on the success page too, so access is instant even if the webhook is slow.
- **No webhook tests:** the fixes above should land with tests for each simulated scenario.

## Stripe dashboard checklist (5 minutes)
- [ ] **Webhooks:** the endpoint is subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.payment_succeeded`. Note its API version.
- [ ] **Revenue recovery:** "if all retries fail" is set to **Cancel subscription** (see #4).
- [ ] **Products:** archive any old or test prices you don't sell (limits #8 until the allowlist ships).
- [ ] **Customer portal:** plan switching is enabled between the four Plus prices, so #2's "Manage billing" path covers upgrades.

## What's solid
- The webhook signature is verified; a bad signature gets 400.
- Checkout requires sign-in and CSRF, and locks `customer_email` to the signed-in account.
- Bundle purchases are verified on the success page: payment status, pack, price, and buyer email must all match.
- Family Game Night checks ownership before selling and grants access only on paid or no-payment status.
- Admin money tools are behind `admin_required`. Gifts are logged with who and when.
- Firestore writes are merges, so retries are safe once #1 makes Stripe retry.

## Suggested fix order
1. **Rewrite the webhook core (#1, #2, #3, #4, #5, #12, #13):**
   - One `_sync_subscription(sub)` that writes from Stripe's status.
   - Plan comes from `PRICE_KIND_MAP`.
   - Return 500 on failure; dedupe event IDs.
   - Tests for every scenario above.
2. **Plus member UI and server guard (#2):** Manage billing instead of buy, no second checkout.
3. **Price allowlist and one trial per account (#8, #9).**
4. **Usage leaks (#6, #7, #16, #17).**
5. **Gift and referral (#10, #11), price caching (#14), cleanup.**
6. **Your call:** lesson packs on credits (#15).
