# Accounts, Auth & Admin Audit — 2026-10-14

**Scope:**
- Google sign-in and token storage, sessions and logout.
- CSRF, redirect safety, admin checks.
- Worship church roles and invites.
- A full access sweep of the app.

**Baseline:** `main` at `38d2802`.

**How it was checked:**
- **Automated sweep:** every one of the 402 routes, 429 route-and-method pairs in all, requested three ways (signed out, normal user, admin), with a valid CSRF token so only the real access rules decide. Run against the real app with an in-memory Firestore, AI calls disabled.
- **Code review:** the sign-in, session, CSRF and role code.

**The big picture:** access control is in good shape.
- **Admin:** all 30 admin routes send signed-out visitors to sign-in and give normal users 403.
- **Signed out:** only public pages, the stateless WeekFlow demos, and the capability-link Live Worship pages answer 200.
- **Owned data:** worksheets, lesson packs and church libraries are looked up by the signed-in email or a membership check.

The findings are one real bug (church owners can demote themselves) and some missing hardening.

---

## P1

### 1. A church owner who enters their own invite code becomes a plain member [verified in code]
`worship_church_join` always writes `{"role": "member"}` with `merge=True`. If the owner types the church code, for example to "join" on a second device, their role becomes `member`. They then lose:
- Delete church, Reset library, Clean duplicates.
- The CCLI license setting.

There's no way to get owner back without editing Firestore.

**Fix:** if a membership already exists, keep its role and just switch to that library.

### 2. Any page can be shown inside another site's frame (clickjacking) [verified in code]
Nothing sets `X-Frame-Options` or a `frame-ancestors` policy. A hostile page can load `/admin/users`, `/billing` or Plan Worship ("Reset library") invisibly and trick a signed-in user into clicking.

**[verify]** whether Cloudflare/Render adds the header. Either way, the app should send it itself.

**Fix:** `X-Frame-Options: SAMEORIGIN` plus `Content-Security-Policy: frame-ancestors 'self'` on every response.

---

## P2

3. **Google sign-in doesn't check that the email is verified.** Admin rights come from matching the email against `ADMIN_EMAILS`. Google returns `verified_email`; an account whose address isn't verified should not be signed in at all. **Fix:** a one-line check in `load_user_info`.

4. **Church invites can't be managed.**
   - The invite code can't be changed. If it's posted somewhere, anyone can join for good.
   - An owner can't see or remove members.
   - Every member gets edit and **delete** rights on the church library.

   **Fix:** owner-only **New invite code** and a **Members** list with Remove. Optionally a "view only" invite.

5. **The Shared Library is visible to every signed-in user** in production (read-only; only admins edit). Anyone can build and download slides from your church's songs, which are licensed under *your* CCLI license. This is your call: keep it public with public-domain hymns only, or limit it to members. It ties to full-audit #22.

6. **No log of admin plan changes.** Gifts are logged with who and when; `set_plan` and `reset_usage` aren't. **Fix:** write the same kind of log entry.

7. **WeekFlow demo data uses what look like your children's real first names** ("tessa", "diana", "elsie") as IDs, and they appear in the public demo responses. Display names are already swapped (e.g. "elsie" → "Lucy"). **Fix:** rename the IDs. (Covered properly in the WeekFlow chunk.)

## P3
- **Logout is a GET link**, so any page can sign a visitor out (an annoyance, not a breach). **Fix:** make it a POST button.
- **HSTS isn't set by the app** **[verify]** Cloudflare/Render. **Fix:** `Strict-Transport-Security: max-age=31536000` in production.
- **No `next` after an admin-page sign-in:** `admin_required` redirects to sign-in without it, so admins land on the home page.
- **No self-serve account deletion or data export.** That belongs in the Privacy chunk (#5).

## What's solid
- **Admin:** all 30 admin routes are gated: signed out → sign-in, normal user → 403. Admin is an allowlist in `ADMIN_EMAILS`.
- **Signed-out access:** limited to public pages, stateless demos and capability links.
- **Ownership checks:** worksheets, lesson packs, church switching and church-only actions all check the signed-in email or membership.
- **Google tokens:** encrypted at rest in Firestore (not in the cookie), cached 5 minutes, deleted on logout. A stolen session cookie stops working after logout.
- **Cookies:** HttpOnly, Secure and SameSite=Lax in production. The app refuses to boot in production without `FLASK_SECRET_KEY`.
- **CSRF:** on every POST, constant-time compare, with narrow capability-token exemptions (webhook, OAuth, live remote and controller pairing).
- **Redirects:** post-login `next` is validated (`is_safe_url`, same host).
- **Invite codes:** 128-bit random, rate-limited (8 per 15 minutes per user, 20 per IP).

## Suggested fix order
1. #1 owner demotion (small)
2. #2 frame and HSTS headers (one `after_request`)
3. #3 verified email (one line)
4. #6 admin log, plus logout as POST
5. #4 invite rotation and member list (small feature)
6. Your call: #5 Shared Library visibility
