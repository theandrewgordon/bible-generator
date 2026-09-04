(() => {
  const config = window.WEEKFLOW_LOGISTICS_CONFIG;
  const byId = (id) => document.getElementById(id);
  const planButton = byId("planButton");
  const familyFourButton = byId("familyFourButton");
  const carpoolButton = byId("carpoolButton");
  const actionStatus = byId("actionStatus");
  const results = byId("results");
  const resultTitle = byId("resultTitle");
  const status = byId("status");
  const metrics = byId("metrics");
  const guardrailSummary = byId("guardrailSummary");
  const fairnessSummary = byId("fairnessSummary");
  const supportSummary = byId("supportSummary");
  const timeline = byId("timeline");
  const mobileTimeline = byId("mobileTimeline");
  const issues = byId("issues");
  const suggestions = byId("suggestions");
  const responsibilityForm = byId("responsibilityForm");
  const activitySelect = byId("activitySelect");
  const adultSelect = byId("adultSelect");
  const scopeSelect = byId("scopeSelect");
  const scenarioEyebrow = byId("scenarioEyebrow");
  const scenarioTitle = byId("scenarioTitle");
  const scenarioDescription = byId("scenarioDescription");
  const scenarioEvents = byId("scenarioEvents");
  const scenarioRules = byId("scenarioRules");
  const ruleMemory = byId("ruleMemory");
  const resetRulesButton = byId("resetRulesButton");
  const calendarStatus = byId("calendarStatus");
  const calendarControls = byId("calendarControls");
  const calendarForm = byId("calendarForm");
  const calendarList = byId("calendarList");
  const calendarWeek = byId("calendarWeek");
  const calendarPreview = byId("calendarPreview");
  const disconnectCalendarButton = byId("disconnectCalendarButton");
  const STORAGE_KEY = "faithsparks:weekflow:logistics-rules:v1";
  let scenario = structuredClone(config.defaultScenario);
  let current = null;
  let calendarPreferences = { calendar_ids: [], detail_mode: "details" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadRememberedRules() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const adultIds = new Set(scenario.people.filter((person) => person.role === "adult").map((person) => person.id));
      if (!Array.isArray(saved)) return;
      saved.forEach((savedRule) => {
        const rule = scenario.rules.find((item) => item.series_id === savedRule.series_id);
        if (rule && adultIds.has(savedRule.adult_id)) {
          rule.adult_id = savedRule.adult_id;
          rule.label = savedRule.label || rule.label;
          if (Array.isArray(savedRule.fallback_adult_ids)) rule.fallback_adult_ids = savedRule.fallback_adult_ids;
        }
      });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function rememberRules() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario.rules.map((rule) => ({
      series_id: rule.series_id,
      adult_id: rule.adult_id,
      label: rule.label,
      fallback_adult_ids: rule.fallback_adult_ids,
    }))));
  }

  function renderRuleMemory() {
    ruleMemory.textContent = `Remembered on this device: ${scenario.rules.map((rule) => rule.label).join(" · ")}`;
  }

  function shortTime(minute) {
    const hour = Math.floor(minute / 60);
    const minutes = String(minute % 60).padStart(2, "0");
    return `${hour % 12 || 12}:${minutes} ${hour < 12 ? "AM" : "PM"}`;
  }

  function renderScenarioSummary(value) {
    const people = Object.fromEntries(value.people.map((person) => [person.id, person]));
    const rules = Object.fromEntries(value.rules.map((rule) => [rule.series_id, rule]));
    const householdCount = value.people.filter((person) => person.household_member !== false).length;
    const isFamilyFour = householdCount === 4 && value.events.some((event) => event.id === "school");
    scenarioEyebrow.textContent = `${value.day_label} test`;
    scenarioTitle.textContent = isFamilyFour
      ? "School, two jobs, and two sports—with the handoffs included."
      : "Three ordinary events. One hidden collision.";
    scenarioDescription.textContent = isFamilyFour
      ? "Two parents and two children expose whether WeekFlow removes decisions or merely displays them."
      : "These commitments do not overlap cleanly once drivers and travel are treated as real resources.";
    scenarioEvents.innerHTML = value.events.map((event) => {
      const participantNames = event.participant_ids.map((id) => people[id]?.name).filter(Boolean).join(" + ");
      const rule = rules[event.series_id];
      const driver = rule ? people[rule.adult_id]?.name : "";
      const mode = event.responsibility_mode === "transport" ? "drop-off + pickup" : event.requires_adult ? "responsible throughout" : "fixed commitment";
      const travel = (event.travel_before ?? rule?.travel_before ?? 0) || (event.travel_after ?? rule?.travel_after ?? 0);
      return `<article><time>${shortTime(event.start_minute)}–${shortTime(event.end_minute)}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(participantNames)}${driver ? ` · ${escapeHtml(driver)} ${mode}` : ""}${travel ? ` · ${travel} minutes each way` : ""}</span></article>`;
    }).join("");
    scenarioRules.innerHTML = `<strong>Rules WeekFlow remembers</strong>${value.rules.map((rule) => `<span>${escapeHtml(rule.label)}</span>`).join("")}`;
  }

  function renderStatus(result) {
    if (result.status === "workable") {
      resultTitle.textContent = `${result.scenario.day_label} has a workable handoff plan.`;
      status.className = "wfl-status good";
      status.innerHTML = "<strong>Every responsibility is covered.</strong><span>No adult or child is expected in two places once travel is included.</span>";
    } else {
      resultTitle.textContent = `${result.scenario.day_label} needs a decision.`;
      status.className = "wfl-status warning";
      status.innerHTML = `<strong>The calendar contains ${result.assignments.length} valid events.</strong><span>The family plan still has ${result.issue_count} ${result.issue_count === 1 ? "responsibility problem" : "responsibility problems"}.</span>`;
    }
  }

  function renderMetrics(result) {
    const travel = result.assignments.reduce((total, item) => total + item.invisible_travel_minutes, 0);
    const ruleCount = result.assignments.filter((item) => item.assignment_source === "series_rule").length;
    metrics.innerHTML = `
      <article><span>Calendar events</span><strong>${result.assignments.length}</strong></article>
      <article><span>Invisible travel</span><strong>${travel} minutes</strong></article>
      <article><span>Rules applied automatically</span><strong>${ruleCount}</strong></article>
      <article><span>Traffic-aware routes</span><strong>${result.routing.traffic_aware_events}</strong></article>
      <article><span>Vehicle checks</span><strong>${result.vehicle_checks}</strong></article>`;
  }

  function renderBetaSafeguards(result) {
    const routeCount = result.routing.route_aware_events;
    guardrailSummary.innerHTML = `<p><strong>${routeCount}</strong> ${routeCount === 1 ? "event uses" : "events use"} saved location routes${result.routing.traffic_aware_events ? ", including traffic padding" : ""}.</p><p><strong>${result.vehicle_checks}</strong> transport ${result.vehicle_checks === 1 ? "plan was" : "plans were"} checked for passenger room, car seats, and driver access.</p>`;
    const fairness = result.fairness;
    fairnessSummary.innerHTML = `${fairness.rows.map((row) => `<div class="wfl-fairness-row"><span>${escapeHtml(row.adult_name)}</span><strong>${row.total_minutes} min · ${row.handoffs} handoffs</strong></div>`).join("")}<p class="${fairness.status === "needs_balance" ? "needs-balance" : ""}">${escapeHtml(fairness.recommendation)}</p>`;
    supportSummary.innerHTML = result.support_requests.length
      ? result.support_requests.map((item) => {
        const actions = item.status === "draft"
          ? `<button class="wfl-text-button" data-request="${item.id}" data-request-action="send" type="button">Queue request</button>`
          : item.status === "pending" && ["queued", "sent"].includes(item.notification_status)
            ? `<button class="wfl-text-button" data-request="${item.id}" data-request-action="mark_delivered" type="button">Mark notification delivered</button>`
            : item.status === "pending"
            ? `<div class="wfl-request-actions"><button class="wfl-text-button" data-request="${item.id}" data-request-action="accept" type="button">Simulate accept</button><button class="wfl-text-button" data-request="${item.id}" data-request-action="decline" type="button">Simulate decline</button></div>`
            : "";
        return `<div class="wfl-support-row"><p><strong>${escapeHtml(item.adult_name)}</strong> · ${escapeHtml(item.event_title)} ${escapeHtml(item.responsibility_kind)}<br><span>${escapeHtml(item.kind)} request: ${escapeHtml(item.status)} · notification: ${escapeHtml(item.notification_status)}</span></p>${actions}</div>`;
      }).join("")
      : "<p>No outside help is assumed in this plan. Add a named helper or carpool request before WeekFlow counts it.</p>";
    supportSummary.querySelectorAll("button[data-request]").forEach((button) => button.addEventListener("click", () => requestPlan({ kind: "support_request", request_id: button.dataset.request, action: button.dataset.requestAction })));
  }

  function placeInSlots(blocks) {
    const slotEnds = [];
    return blocks.map((block) => {
      let slot = slotEnds.findIndex((end) => end <= block.start_minute);
      if (slot === -1) {
        slot = slotEnds.length;
        slotEnds.push(block.end_minute);
      } else {
        slotEnds[slot] = block.end_minute;
      }
      return { ...block, slot, slotCount: slotEnds.length };
    });
  }

  function renderTimeline(result) {
    const allBlocks = Object.values(result.timeline).flat();
    const startMinute = allBlocks.length ? Math.floor(Math.min(...allBlocks.map((block) => block.start_minute)) / 60) * 60 : 8 * 60;
    const endMinute = allBlocks.length ? Math.ceil(Math.max(...allBlocks.map((block) => block.end_minute)) / 60) * 60 : 20 * 60;
    const span = Math.max(60, endMinute - startMinute);
    const tickStep = span > 8 * 60 ? 2 * 60 : 60;
    const ticks = [];
    for (let minute = startMinute; minute <= endMinute; minute += tickStep) ticks.push(minute);
    const people = result.scenario.people;
    const axis = `<div class="wfl-axis"><span></span><div class="wfl-axis-track">${ticks.map((minute) => `<time style="left:${((minute - startMinute) / span) * 100}%">${minute / 60 > 12 ? minute / 60 - 12 : minute / 60}:00</time>`).join("")}</div></div>`;
    const lanes = people.map((person) => {
      const blocks = placeInSlots(result.timeline[person.id] || []);
      const slots = Math.max(1, ...blocks.map((block) => block.slot + 1));
      const height = Math.max(68, slots * 31 + 13);
      const content = blocks.map((block) => {
        const left = ((Math.max(startMinute, block.start_minute) - startMinute) / span) * 100;
        const width = ((Math.min(endMinute, block.end_minute) - Math.max(startMinute, block.start_minute)) / span) * 100;
        return `<div class="wfl-block ${block.conflict ? "conflict" : ""}" style="left:${left}%;width:${Math.max(.8, width)}%;top:${7 + block.slot * 31}px;height:25px;bottom:auto" title="${escapeHtml(`${block.start}–${block.end} · ${block.title}`)}"><strong>${escapeHtml(block.title)}</strong><span>${escapeHtml(block.start)}–${escapeHtml(block.end)}</span></div>`;
      }).join("");
      return `<div class="wfl-lane" style="min-height:${height}px"><div class="wfl-person"><i style="--person:${person.color}"></i><strong>${escapeHtml(person.name)}</strong></div><div class="wfl-track" style="min-height:${height}px">${ticks.slice(0,-1).map((minute) => `<i class="wfl-gridline" style="left:${((minute - startMinute) / span) * 100}%"></i>`).join("")}${content}</div></div>`;
    }).join("");
    timeline.innerHTML = axis + lanes;

    const mobileBlocks = people.flatMap((person) => (result.timeline[person.id] || []).map((block) => ({ ...block, person: person.name })))
      .sort((left, right) => left.start_minute - right.start_minute || left.person.localeCompare(right.person));
    mobileTimeline.innerHTML = mobileBlocks.map((block) => `
      <article class="wfl-mobile-block ${block.conflict ? "conflict" : ""}"><time>${escapeHtml(block.start)}</time><div><strong>${escapeHtml(block.person)} · ${escapeHtml(block.title)}</strong><span>Until ${escapeHtml(block.end)}${block.conflict ? " · conflict" : ""}</span></div></article>`).join("");
  }

  function suggestionButtons(item) {
    if (item.kind === "switch_vehicle") {
      return `<div class="wfl-suggestion-actions"><button class="wfl-button" type="button" data-event="${item.event_id}" data-vehicle="${item.vehicle_id}" data-scope="occurrence">Use this day</button><button class="wfl-button" type="button" data-event="${item.event_id}" data-vehicle="${item.vehicle_id}" data-scope="series">Remember vehicle</button></div>`;
    }
    if (item.kind !== "reassign") return "";
    const responsibility = item.responsibility_kind ? ` data-responsibility="${item.responsibility_kind}"` : "";
    return `<div class="wfl-suggestion-actions"><button class="wfl-button" type="button" data-event="${item.event_id}" data-adult="${item.adult_id}" data-scope="occurrence"${responsibility}>Apply this day</button><button class="wfl-button" type="button" data-event="${item.event_id}" data-adult="${item.adult_id}" data-scope="series"${responsibility}>Remember for the series</button></div>`;
  }

  function renderDecisions(result) {
    if (!result.issues.length) {
      issues.innerHTML = '<div class="wfl-empty-decision"><span class="wfl-eyebrow">Resolved</span><h3>No uncovered handoffs remain.</h3><p>Change an assignment below to pressure-test another option.</p></div>';
      suggestions.replaceChildren();
      return;
    }
    issues.innerHTML = result.issues.map((item) => `<article><span class="wfl-eyebrow">Conflict detected</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("");
    suggestions.innerHTML = result.suggestions.map((item) => `<article><span class="wfl-eyebrow">${item.kind === "reassign" ? "Workable option" : "Family decision needed"}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>${suggestionButtons(item)}</article>`).join("");
    suggestions.querySelectorAll("button[data-adult]").forEach((button) => button.addEventListener("click", () => applyChange(button.dataset.event, button.dataset.adult, button.dataset.scope, button.dataset.responsibility)));
    suggestions.querySelectorAll("button[data-vehicle]").forEach((button) => button.addEventListener("click", () => requestPlan({ kind: "vehicle", event_id: button.dataset.event, vehicle_id: button.dataset.vehicle, scope: button.dataset.scope })));
  }

  function renderForm(result) {
    const activities = result.assignments.filter((item) => item.kind === "child_activity");
    const acceptedHelpers = new Set(result.support_requests.filter((item) => item.status === "accepted").map((item) => item.adult_id));
    const adults = result.scenario.people.filter((person) => person.role === "adult" && (person.household_member !== false || acceptedHelpers.has(person.id)));
    activitySelect.innerHTML = activities.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("");
    adultSelect.innerHTML = adults.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("");
    const selected = activities[0];
    if (selected?.adult_id) adultSelect.value = selected.adult_id;
    activitySelect.onchange = () => {
      const activity = current.assignments.find((item) => item.id === activitySelect.value);
      if (activity?.adult_id) adultSelect.value = activity.adult_id;
      scopeSelect.querySelector('option[value="series"]').disabled = !activity?.series_id;
    };
  }

  function render(result) {
    current = result;
    scenario = result.scenario;
    results.hidden = false;
    renderStatus(result);
    renderMetrics(result);
    renderBetaSafeguards(result);
    renderTimeline(result);
    renderDecisions(result);
    renderForm(result);
    renderRuleMemory();
  }

  async function requestPlan(change = null) {
    planButton.disabled = true;
    actionStatus.textContent = "Checking drivers, travel, participants, and handoffs…";
    try {
      const response = await fetch(config.planUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ scenario, ...(change ? { change } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The family plan could not be built.");
      render(payload);
      if (change?.scope === "series") rememberRules();
      actionStatus.textContent = "";
      planButton.textContent = `Recheck ${payload.scenario.day_label} Logistics`;
      if (change) document.querySelector(".wfl-result-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      actionStatus.textContent = error.message;
    } finally {
      planButton.disabled = false;
    }
  }

  function applyChange(eventId, adultId, scope, responsibilityKind = null) {
    return requestPlan({ event_id: eventId, adult_id: adultId, scope, ...(responsibilityKind ? { responsibility_kind: responsibilityKind } : {}) });
  }

  function mondayFor(date = new Date()) {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - offset);
    return [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, "0"), String(monday.getDate()).padStart(2, "0")].join("-");
  }

  async function responseJson(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Google Calendar could not be reached.");
    return payload;
  }

  function renderCalendarConnection(payload) {
    calendarPreferences = payload.preferences || calendarPreferences;
    calendarStatus.className = `wfl-calendar-status${payload.connected ? " connected" : ""}`;
    if (!payload.signed_in) {
      calendarStatus.innerHTML = `<div><strong>Sign in with an adult account first.</strong><span>Calendar permission is requested separately after sign-in.</span></div><a class="wfl-button" href="${escapeHtml(payload.sign_in_url)}">Sign in</a>`;
      return;
    }
    if (!payload.configured) {
      calendarStatus.innerHTML = "<div><strong>Calendar connection needs server setup.</strong><span>The planner still works; encrypted Calendar credentials are not configured in this environment.</span></div>";
      return;
    }
    if (!payload.connected) {
      calendarStatus.innerHTML = `<div><strong>Google Calendar is not connected.</strong><span>The permission is read-only and can be disconnected at any time.</span></div><a class="wfl-button" href="${escapeHtml(payload.connect_url)}">Connect Google Calendar</a>`;
      return;
    }
    calendarStatus.innerHTML = "<div><strong>Google Calendar is connected read-only.</strong><span>Choose exactly which calendars WeekFlow may preview.</span></div>";
    calendarControls.hidden = false;
    loadCalendarChoices();
  }

  async function loadCalendarStatus() {
    try {
      renderCalendarConnection(await responseJson(config.calendarStatusUrl));
    } catch (error) {
      calendarStatus.innerHTML = `<div><strong>Calendar status is unavailable.</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  async function loadCalendarChoices() {
    try {
      const payload = await responseJson(config.calendarsUrl);
      if (!payload.calendars.length) {
        calendarList.innerHTML = "<p>No readable calendars were found.</p>";
        return;
      }
      const selected = new Set(calendarPreferences.calendar_ids || []);
      const hasRememberedSelection = selected.size > 0;
      if (!selected.size) {
        const primary = payload.calendars.find((item) => item.primary) || payload.calendars[0];
        selected.add(primary.id);
      }
      calendarList.innerHTML = payload.calendars.map((item) => `
        <label class="wfl-choice"><input type="checkbox" name="calendarId" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""} /><i class="wfl-calendar-dot" style="--calendar-color:${escapeHtml(item.color)}"></i><span><strong>${escapeHtml(item.name)}${item.primary ? " · Primary" : ""}</strong><small>Google access: ${escapeHtml(item.access_role)}</small></span></label>`).join("");
      const savedMode = calendarPreferences.detail_mode || "details";
      const modeInput = calendarForm.querySelector(`input[name="detailMode"][value="${savedMode}"]`);
      if (modeInput) modeInput.checked = true;
      if (hasRememberedSelection) calendarForm.requestSubmit();
    } catch (error) {
      calendarList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }

  function formatCalendarTime(value, allDay = false) {
    if (allDay) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }

  function renderCalendarPreview(payload) {
    calendarPreview.hidden = false;
    const privacy = payload.detail_mode === "availability"
      ? "Only busy windows were read; titles and locations stayed private."
      : "Event titles, times, and locations were read for this preview.";
    calendarPreview.innerHTML = `
      <h3>${payload.event_count} ${payload.event_count === 1 ? "commitment" : "commitments"} found</h3>
      <p>${privacy} Nothing from this preview was saved.</p>
      <div class="wfl-calendar-events">${payload.events.length ? payload.events.map((event) => `
        <article class="wfl-calendar-event"><time>${escapeHtml(formatCalendarTime(event.start, event.all_day))}</time><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.source_calendar_name)}${event.location ? ` · ${escapeHtml(event.location)}` : ""} · read-only</span></div></article>`).join("") : "<p>No events appear in the selected week.</p>"}</div>`;
  }

  async function previewCalendars(event) {
    event.preventDefault();
    const button = calendarForm.querySelector('button[type="submit"]');
    const calendarIds = [...calendarForm.querySelectorAll('input[name="calendarId"]:checked')].map((input) => input.value);
    if (!calendarIds.length) {
      calendarPreview.hidden = false;
      calendarPreview.innerHTML = "<p>Choose at least one calendar.</p>";
      return;
    }
    button.disabled = true;
    try {
      const detailMode = calendarForm.querySelector('input[name="detailMode"]:checked').value;
      const payload = await responseJson(config.calendarPreviewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ calendar_ids: calendarIds, detail_mode: detailMode, week_start: calendarWeek.value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York" }),
      });
      calendarPreferences = { calendar_ids: calendarIds, detail_mode: detailMode };
      renderCalendarPreview(payload);
    } catch (error) {
      calendarPreview.hidden = false;
      calendarPreview.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  }

  async function disconnectCalendar() {
    disconnectCalendarButton.disabled = true;
    try {
      await responseJson(config.calendarDisconnectUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: "{}",
      });
      calendarControls.hidden = true;
      calendarPreview.hidden = true;
      await loadCalendarStatus();
    } catch (error) {
      calendarPreview.hidden = false;
      calendarPreview.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    } finally {
      disconnectCalendarButton.disabled = false;
    }
  }

  planButton.addEventListener("click", () => requestPlan());
  familyFourButton.addEventListener("click", () => {
    scenario = structuredClone(config.familyFourScenario);
    renderScenarioSummary(scenario);
    planButton.textContent = "Recheck Family Logistics";
    requestPlan();
  });
  carpoolButton.addEventListener("click", () => {
    scenario = structuredClone(config.carpoolScenario);
    renderScenarioSummary(scenario);
    planButton.textContent = "Recheck Carpool Logistics";
    requestPlan();
  });
  responsibilityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyChange(activitySelect.value, adultSelect.value, scopeSelect.value);
  });
  resetRulesButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    scenario = structuredClone(config.defaultScenario);
    renderScenarioSummary(scenario);
    requestPlan();
  });
  calendarWeek.value = mondayFor();
  calendarForm.addEventListener("submit", previewCalendars);
  disconnectCalendarButton.addEventListener("click", disconnectCalendar);

  loadRememberedRules();
  renderScenarioSummary(scenario);
  loadCalendarStatus();
})();
