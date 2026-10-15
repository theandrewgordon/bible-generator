# Group & Church Games Audit — 2026-10-14

**Scope:**
- **Family Bible Bee**
- **Act It Out and Draw It** (group and church versions)
- **Family Game Night** (paid)
- The family naming in Labs games

The Labs arcade games and Speed Die were covered on 2026-10-11 (`games-audit-2026-10-11.md`), and Bible Bee's AI cost in the AI-cost audit.

**Baseline:** `main` at `64d9ca8`.

**How it was checked:**
- **Role simulation:** three people per game against the real app:
  - a **host** (signed in, created the room);
  - a **kid** who joined with the code;
  - a **stranger** who knows only the code.

  Each one tried every room action.
- **Hidden-information check:** I compared each person's view of the room state against the secret answer or prompt.
- **Code review:** joins, names, avatars, the paywall and polling.

**The big picture:** the room games are solidly built.
- **Host-only actions:** all **43 attempts** by a stranger or a joined kid were refused (403), covering start, next, reveal, score changes, removing players, controller replacement and more.
- **Hidden answers stay hidden:** Bible Bee sends no answer before the reveal, and in Act It Out only the current actor and the host see the prompt.
- **The Family Game Night paywall** is enforced on the server.

The real problem is **children's selfies**. The rest is naming and polish.

---

## P1

### 1. Kids can upload a selfie that's stored and shown on the shared screen [verified in code]
The join pages for Bible Bee, Act It Out and Draw It offer **"take a photo"** (`<input type="file" capture="user">`, the front camera). The JPEG (up to 60 KB) is stored in the room, shown on the TV and host screens, and served to anyone with the room code and player id (`/room/<code>/avatar/<player_id>`).
- **Church games:** the kids joining are **other families' children**. There's no parent account involved, and the photo goes straight from the child to the server.
- **COPPA:** under COPPA a child's photo is personal information, and collecting it directly from a child needs verifiable parental consent.
- **Your own policy:** the new privacy policy says kids use nicknames only, so this contradicts it.
- **Retention:** photos stay until the room expires (hours), and physically only once the Firestore TTL policy exists.

**Fix (simple and safe):** remove photo avatars and keep the built-in picture avatars. The server rejects any uploaded image, and the camera option goes away. If you want photos back later, make them on-device only: shown on the child's own phone, never uploaded.

## P2

2. **Labs games are open to everyone when the beta list is empty [verified in code].** `LAB_GAMES_BETA_EMAILS` has the same fail-open check WeekFlow had. If it's unset in Render, any signed-in Google account gets Labs, including the family-named games below.

   **Fix:** the same rule as WeekFlow: beta list or admins in production.

3. **Player names aren't filtered for rude words [verified in code].** Names must match letters, numbers and `.'-` (18 characters max). Only "admin", "host", "moderator" and "faithsparks" are blocked, so a kid (or a stranger who got the code) can put a rude name on the church TV. The host can remove a player, which helps after the fact.

   **Fix:** a small built-in list of rude words and slurs, checked by whole word and common letter swaps. Instant, with no network call.

4. **Labs uses your family's names [verified]. Your call.**
   - The page is titled **"Tessa's Games"**.
   - Four games are titled and named **"Gordon Ice Cream Town"**, "Gordon Mail Run", "Gordon Window Washing" and "Gordon Family Stables" (`gordon-*.html`).
   - "Gordon Family Stables Farm" appears in game text.

   That's lovely for a family-only beta, but with #2 open it's your daughter's first name and your surname together on a page any signed-in user can open.

   **Fix if you want it:** neutral display titles ("Sparks Games", "Ice Cream Town", "Mail Run", "Window Washing", "Family Stables") and renamed files with redirects from the old URLs. Keep the internal save keys (`tessas_games_*`) so no progress is lost.

## P3
- **Room-code guessing:** codes are 4 characters from 32 letters and digits, about 1 million combinations. Joining is rate-limited per IP, but looking up a code isn't, so a script could probe for live rooms. With few rooms live at once that's slow and low value, and the Family Game Night couch and team modes need a private controller invite anyway. **Fix:** limit failed code lookups per IP (for example 60 per 10 minutes).
- **Room TTL:** `family_bible_bee_rooms.expireAt` and `act_it_out_rooms.expireAt` are already on the Firestore TTL checklist (privacy audit). They matter more while photos exist.

## What's solid
- **Authorization:** every host action checks the host session or the paired controller role. Strangers and joined players get 403 on all 43 actions tried.
- **Hidden information:** Bible Bee keeps `correct` and `answer_text` empty until reveal, for everyone including the host's state. In Act It Out the prompt and forbidden words go only to the active actor and the host.
- **Paywall:** a free account can only create the free 10-round mixed game, and anything else returns 403 even if the form is edited.
- **Input checks:** the name pattern, duplicate-name check, player caps (12 individual, 40 team), avatar and drawing format checks (real JPEG or PNG, size caps) and preset avatars.
- **Limits:** rate limits on create (8/hr per host) and join (60–80 per 10 minutes per IP, enough for a church on one Wi-Fi network).
- **Polling:** rooms are cached briefly, so a 3 s poll doesn't mean a Firestore read every time.
- **No voice recording:** Bible Bee recitation is judged by the host or controller, not by recording the child.

## Suggested fix order
1. **#1** Remove photo avatars (small).
2. **#2** Labs fail closed (tiny, same as WeekFlow).
3. **#3** Name filter (small).
4. **#4** Your call on the family names.
5. **P3** Throttle failed code lookups.
