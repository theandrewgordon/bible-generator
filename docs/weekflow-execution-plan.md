# WeekFlow execution plan

WeekFlow's product promise is **put the hidden handoffs on one clear plan**.
It should use existing calendars as inputs, then solve the ownership, travel,
supervision, and recovery work those calendars do not express. The interface
shows one next decision first; explanations, alternate choices, and planning
diagnostics stay available behind progressive disclosure.

## Command center foundation

Status: **Step 1 implemented**

`/labs/weekflow/today` is the signed-in daily front door for WeekFlow. It adds
a fast brain-dump flow and one adult-owned responsibility list without running
the homeschool scheduler or logistics solver on page load.

- Read the established WeekFlow family record as the shared source for names,
  colors, assignments, and household timezone.
- Capture an item with an area, family member, due date, priority, and status.
- Separate overdue, due-today, important, waiting, later, and recently completed
  items without showing the same responsibility in multiple sections.
- Complete, restore, pause, resume, and remove items with optimistic UI and
  revision-protected cloud saving.
- Keep the Today document independent from the heavier schedule state, include
  it in household backups, and send it through the private low-latency request
  lane.
- Link the homeschool scheduler and family-logistics planner as deeper tools
  instead of duplicating them inside the overview.

## Homeschool and Kids integration

Status: **Step 2 implemented**

`/labs/weekflow/homeschool` and `/labs/weekflow/kids` now turn the scheduling
engine into daily family tools instead of exposing it only as a lab demo.

- New families can name the household, teaching adult, and children without
  inheriting fictional demo assignments or creating child accounts.
- A homeschool week may be genuinely empty and receives useful empty states.
- Adults can add assignments for one child or a group, choose a deadline,
  estimate time, and describe whether the work is independent, checked at the
  beginning and end, or parent-led throughout.
- The Homeschool view shows the daily learning plan, explicit parent-help
  moments, weekly load, feasibility warnings, completed work, and removal or
  restoration controls.
- The Kids view projects that same plan by child and combines schoolwork with
  responsibilities assigned through WeekFlow Today.
- Completing an assignment from either view updates the shared homeschool plan;
  completing a family responsibility updates the shared Today document.
- Both views remain adult-owned, private, non-cacheable, and isolated from the
  public scheduler experiment.

## Schedule and logistics integration

Status: **Step 3 implemented**

`/labs/weekflow/schedule` is the light daily schedule for an adult, while the
existing logistics lab remains the deeper place to enter or resolve a family
plan.

- Combine the current homeschool week, Schedule-tagged Today responsibilities,
  and the saved family-logistics plan in one seven-day agenda.
- Put missing owners, overlapping responsibility windows, rides, and handoffs
  ahead of diagnostic detail; leave a clear day visually calm.
- Keep travel-expanded ownership visible beside the agenda, including the adult
  responsible for each commitment and the true responsibility window.
- Make Google Calendar a separate, optional, read-only preview. Calendar event
  content is never added to the saved Schedule state.
- Flag a calendar commitment that overlaps a saved logistics responsibility as
  a handoff to confirm, without pretending WeekFlow knows which person owns an
  unclassified external event.
- Reuse the existing logistics editor for additions and decisions instead of
  duplicating its complex controls in the daily view.
- Load the adult-owned WeekFlow sources through one private, non-cacheable,
  latency-prioritized endpoint with calm states for a new family, an empty day,
  missing logistics, disconnected Calendar, and provider failure.

## Household responsibilities

Status: **Step 4 implemented**

`/labs/weekflow/household` gives recurring chores and routines one shared,
adult-owned home without creating child accounts or copying the same task into
several disconnected lists.

- Create or edit a recurring responsibility with an owner, weekdays,
  time-of-day, category, and modest duration estimate.
- Complete or restore the dated occurrence without completing every future
  occurrence; pause, resume, or remove the repeating rule separately.
- Project active routines into the current week instead of materializing a
  second task document for every day.
- Show today's household work inside Today, the selected day's work in
  Schedule, and each child's work in Kids from the same source of truth.
- Keep completion history bounded, include household state in the family
  backup, and protect saves with the same optimistic revision checks as Today.
- Load household projections alongside other dashboard data in parallel and
  keep every household route private, non-cacheable, and latency-prioritized.

## Meals and preparation handoffs

Status: **Step 5 implemented**

`/labs/weekflow/meals` provides a deliberately small weekly meal rhythm without
turning WeekFlow into a recipe, nutrition, pantry, or grocery-store app.

- Name breakfast, lunch, or dinner for a day, with an optional lead and short
  note; keep one clear plan per meal slot.
- Add dated shopping or preparation handoffs with an explicit family owner,
  time of day, and optional related meal.
- Complete or restore the same handoff from Meals, Today, or a child's Kids
  view without copying it into separate task documents.
- Show meals and open meal handoffs inside the selected day's Schedule from the
  same source of truth.
- Keep Meals state independent from heavier planning data, revision-protected,
  included in family backups, bounded over time, private, non-cacheable, and on
  the low-latency request path.
- Preserve honest empty space: an unplanned meal is shown as open, not treated
  as a failure or filled with generated advice.

The next product decision is whether families repeatedly use this small rhythm
before expanding WeekFlow's “More” area. Recipe storage and grocery inventory
remain intentionally out of scope.

## Travel and guests

Status: **Step 7 implemented**

`/labs/weekflow/travel` gives upcoming trips and guest visits a small shared
home, centered on preparation rather than detailed itinerary management.

- Record an away-from-home or guest plan with its date range, optional place,
  adult lead, and one short note.
- Assign packing, booking, hosting, errand, or other preparation handoffs to a
  family member with a due date and time of day.
- Project the same open handoff into Today, Schedule, and the assigned child's
  Kids view; complete it from any of those adult-owned views.
- Show an active trip or visit as an all-day Schedule item across its date
  range, without copying it into the calendar or task documents.
- Keep old history bounded while retaining unfinished handoffs, include the
  state in family backups, and use revision-protected, private, non-cacheable,
  latency-prioritized routes.
- Keep reservations, route planning, detailed itineraries, and travel content
  intentionally outside WeekFlow.

Step 6 (Medical) remains deliberately unimplemented; this step does not imply
that WeekFlow should store sensitive medical detail before its privacy boundary
and real family need are validated.

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

## 2. Let families enter and keep their real day

Status: **personal entry and optional cloud persistence implemented**

- Add, edit, and remove household adults, children, adult commitments, school,
  co-op, sports, appointments, and other child activities.
- Capture the day, participants, responsible adult, drop-off/pickup versus
  stay-through responsibility, travel time, optional place/address, and whether
  the assignment repeats.
- Save drafts automatically on the current device, even without an account.
- Keep “Check my day” device-local. Use a separate explicit action for
  account-owned cloud storage, with revision protection across browsers and a
  separate delete-cloud-copy control.
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
