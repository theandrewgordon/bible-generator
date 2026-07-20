# Family Game Night launch runbook

Use this checklist for the first production purchase and launch-day monitoring. Never paste secret values into this document, issues, or logs.

## Before accepting purchases

- Confirm production serves the intended `main` commit from `/family-game-night` asset version markers.
- Confirm `STRIPE_PRICE_FAMILY_GAME_NIGHT` is the active one-time production Price ID.
- Confirm `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are from the same Stripe mode as the Price ID.
- Confirm the Stripe webhook endpoint includes `checkout.session.completed` and points to `/stripe/webhook` on the production domain.
- Confirm `FIREBASE_CREDS_JSON`, `FLASK_SECRET_KEY`, Google OAuth credentials, and the production domain callback are configured.
- Confirm the sales page shows the intended price and the checkout button is available.
- Run the complete automated test suite.

## First purchase verification

1. Sign in with a real account that does not already own Family Game Night.
2. Start checkout from `/family-game-night` and confirm Stripe shows a one-time payment with the expected amount.
3. Cancel once. Confirm the browser returns to the Complete Game offer and says nothing was charged.
4. Start checkout again and complete the payment.
5. In Stripe, confirm the Checkout Session is paid and the webhook delivery returned HTTP 200.
6. In Firestore, confirm the buyer document contains:
   - `purchases.family_game_night: true`
   - `purchaseDetails.family_game_night.checkoutSessionId`
   - the expected Price ID and purchase timestamp
7. Sign out and back in. Confirm 15- and 20-round options, individual modes, categories, and difficulties remain unlocked.
8. Create a paid room and join it from a signed-out player device. Confirm the player encounters no paywall.
9. Attempt checkout again from the owner account. Confirm it returns to setup without creating another Checkout Session.
10. Refund the purchase in Stripe if it was only a launch test. Record the refund decision privately with the transaction.

## Launch-day checks

- Watch Render logs for elevated 4xx/5xx responses on Family Game Night routes.
- Watch Stripe webhook deliveries for retries or non-200 responses.
- Watch aggregate funnel events for room creation, first join, start, finish, checkout start, checkout cancel, and fulfillment.
- Treat inability to create, join, start, finish, pay, or restore ownership as a launch blocker.
- Treat unclear instructions or isolated device layout issues as beta feedback unless multiple families are blocked.

## Support response

Ask for the room code, approximate time, device/browser, and the step that failed. Do not request passwords, full payment-card details, OAuth tokens, Stripe secrets, or Firestore credentials.

- Room issue: check Render logs by time and room code.
- Payment issue: check the Stripe Checkout Session and webhook delivery before changing Firestore.
- Missing access: verify the signed-in email matches the Checkout customer email and webhook metadata.
- Player issue: remind the family that only the host signs in; players use the room code.

## Rollback

Rollback is appropriate for a reproducible launch blocker, security exposure, or widespread checkout/entitlement failure.

1. Identify the last known-good production commit from the live asset version marker and Git history.
2. Use Render's rollback/redeploy control for that exact known-good deploy. Do not rewrite `main` history.
3. Verify `/family-game-night`, `/family-game-night/play`, and one public room-state request after rollback.
4. If checkout itself is unsafe, unset `STRIPE_PRICE_FAMILY_GAME_NIGHT` and redeploy; the free game remains available while the purchase button is disabled.
5. Preserve logs and failed Checkout Session IDs for diagnosis, without copying secrets or payment details.
6. Fix forward on a branch, run the full suite, merge normally, and deploy again.
