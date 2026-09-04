# WeekFlow execution plan

WeekFlow's product promise is **put the hidden handoffs on one clear plan**.
It should use existing calendars as inputs, then solve the ownership, travel,
supervision, and recovery work those calendars do not express. The interface
shows one next decision first; explanations, alternate choices, and planning
diagnostics stay available behind progressive disclosure.

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
- Helpers outside the household are not counted unless both confirmation and a
  full availability window cover the responsibility; direct assignment obeys
  the same guardrail.
- Separate sibling calendar entries can be linked as one shared ride, so they
  produce one driver obligation, one travel cost, and one linked update.
- Saved locations and directional routes can replace generic buffers, with
  time-window traffic padding called out separately in the plan.
- Every transport plan can verify passenger capacity, required car-seat spots,
  and whether the assigned adult can use the selected vehicle.
- Named helper and carpool requests move through draft, queued, delivered,
  accepted, or declined states; pending help is never counted as coverage.
- Four-week responsibility history is combined with the current day, and safe
  alternatives prefer the less-loaded available household adult.

The deterministic stress harness also ran 10,000 varied family days and checked
6,262 suggested handoffs against the actual resource timeline before and after
application.

Production bridge implemented in September 2026:

- Google Routes API v2 can opt-in to refresh saved directional route profiles
  with traffic-aware durations. Unroutable locations retain deterministic
  fallback times and the planner labels which data was refreshed.
- Twilio SMS and SendGrid email adapters can deliver helper or carpool requests.
- Helper responses use expiring, tamper-evident, one-purpose links. The recipient
  sees only the requested handoff, never the household calendar or contact
  details. The first response wins atomically.
- Operational analytics record privacy-safe outcome dimensions for generated
  logistics plans, route refreshes, sent requests, and responses.

Production configuration is opt-in. Live routes require
`GOOGLE_MAPS_ROUTES_API_KEY`. SMS requires `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Email requires
`SENDGRID_API_KEY` and `WEEKFLOW_FROM_EMAIL`. Response links require Firestore
and a dedicated `WEEKFLOW_SUPPORT_SIGNING_KEY` of at least 24 characters.

Remaining beta risks, in priority order:

1. Provider credentials, sender verification, consent copy, delivery receipts,
   and operational alerting must be configured and exercised in staging before
   inviting families. Automated tests use fakes and do not send messages.
2. Fairness currently measures responsibility minutes and handoff counts. Beta
   interviews must establish whether families also want weighting for planning,
   waiting, schedule changes, and emotional labor.
3. Saved contacts and multi-household carpool membership need a consented,
   encrypted address book so a family can enter a helper once without exposing
   one household's calendar to another.
4. Live route refresh needs to be connected to persisted household locations and
   scheduled departures; the provider adapter and secure endpoint exist, but the
   lab examples intentionally continue to work without addresses or credentials.

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
