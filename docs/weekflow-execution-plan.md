# WeekFlow execution plan

WeekFlow's product promise is **carry less of the family schedule in your head**.
It should use existing calendars as inputs, then solve the ownership, travel,
supervision, and recovery work those calendars do not express.

## 1. Prove family-logistics orchestration

Status: **implemented as a lab experiment**

- Represent adults, children, fixed commitments, child activities, responsible
  adults, recurring series, travel buffers, and saved fallback adults.
- Detect adult and child double-booking using the full responsibility window.
- Keep every event accounted for even when the plan is not workable.
- Suggest only alternatives that are free for the complete responsibility
  window, and explain why rejected adults cannot cover.
- Require an explicit choice before changing the plan.

Success gate: families consistently say the detected conflict or missing owner
was something they otherwise had to carry mentally.

### Family-of-four pressure test

The built-in Monday simulation uses two parents, a 13-year-old, a 9-year-old,
school, two adult work/appointment commitments, football, and gymnastics. It
exposed and now covers several important failure modes:

- A school driver is occupied only for the morning and afternoon transport
  runs, not the entire school day.
- Drop-off and pickup include travel to the location and the return trip.
- Different adults may own drop-off and pickup for the same recurring event.
- A child double-booking recommends moving a commitment; changing the driver is
  never presented as a solution.
- Separate drop-off and pickup conflicts are both reported, even when they
  involve the same two calendar events.

The deterministic stress harness also ran 10,000 varied family days and checked
6,262 suggested handoffs against the actual resource timeline before and after
application.

Open modeling risks, in priority order:

1. Travel is still a family-entered buffer rather than location- and
   traffic-aware routing between consecutive commitments.
2. Carpools, vehicle capacity, car-seat constraints, and shared rides are not
   modeled yet.
3. A helper outside the household can be saved as an adult, but invitation,
   confirmation, and availability workflows are not built.
4. The planner proves feasibility but does not yet optimize fairness across the
   adults over multiple weeks.

## 2. Make responsibility rules durable

Status: **device-level experiment implemented**

- Support “this occurrence” and “entire recurring series.”
- Remember series responsibility rules and fallback adults.
- Preserve travel buffers as part of the rule.
- Show the rule that assigned each responsibility.
- Add “this and future occurrences” only after real recurring-calendar data is
  connected and recurrence boundaries can be represented faithfully.

Success gate: a normal recurring week requires no duplicate entry in WeekFlow.

## 3. Connect Google Calendar as an input

Status: **secure consent and selected-week preview implemented; continuous sync next**

- Keep existing Google sign-in separate from optional Calendar consent.
- Ask users to select calendars after authorization.
- Offer two import modes: event details or free/busy only.
- Store provider event IDs, recurrence IDs, update timestamps, and source
  calendar IDs; never infer identity from event titles.
- Encrypt Calendar OAuth tokens before server-side storage; never put the
  Calendar grant in the browser session cookie.
- Remember selected calendar IDs and the privacy mode, then automatically
  refresh the current preview on return. Previewed event content is not stored.
- Perform one initial sync, then incremental sync with persisted sync tokens.
- Refresh from push notifications and safely fall back to a full sync when a
  token is invalidated.
- Treat imported events as source-owned and read-only in the first release.

Success gate: changing a selected Google event updates only the affected
WeekFlow plan without duplicates or manual re-entry.

Production configuration requires `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, Firestore credentials, and a dedicated
`WEEKFLOW_CALENDAR_TOKEN_KEY`. Generate the final value with
`Fernet.generate_key()` from the Python `cryptography` package and store it as
a secret. Losing or rotating that key without a migration intentionally makes
existing grants unreadable and requires reconnection.

## 4. Publish accepted plans separately

Status: **after reliable read-only sync**

- Create a dedicated `WeekFlow Family Plan` calendar.
- Publish only plans the adult explicitly accepts.
- Attach stable WeekFlow IDs so repeated publishing updates instead of
  duplicating events.
- Never rewrite source calendar events.
- Make deletion and disconnection behavior obvious and reversible.

Success gate: users always know whether an event came from Google or WeekFlow.

## 5. Add low-friction capture

Status: **after orchestration and sync gates**

- Accept an adult-uploaded image or PDF.
- Extract factual event candidates only: date, time, title, location, and likely
  participants.
- Require confirmation before creating anything.
- Delete the original upload after extraction by default.
- Do not train models on family uploads, perform face recognition, or create
  child accounts in the first release.
- Add voice and forwarded-email capture only after the same confirmation flow
  is reliable.

Success gate: capture saves entry time without increasing wrong events or
private-data retention.

## 6. Beta and monetization

Status: **deliberately deferred**

- Instrument conflict detection, suggestion acceptance, rule reuse, corrections,
  and time-to-workable-plan.
- Interview households after repeated real weeks, not a single demo.
- Monetize orchestration and automation only after the core success gate is met;
  calendar display, generic lists, and photo import are not differentiated
  enough to be the paid product by themselves.
