(() => {
  const config = window.WEEKFLOW_LOGISTICS_CONFIG;
  const byId = (id) => document.getElementById(id);
  const planButton = byId("planButton");
  const familyFourButton = byId("familyFourButton");
  const carpoolButton = byId("carpoolButton");
  const customizeButton = byId("customizeButton");
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
  const conflictDetails = document.querySelector(".wfl-conflict-details");
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
  const customBuilder = byId("customBuilder");
  const newCustomDayButton = byId("newCustomDayButton");
  const closeCustomButton = byId("closeCustomButton");
  const customDay = byId("customDay");
  const customHomeAddress = byId("customHomeAddress");
  const customPeopleList = byId("customPeopleList");
  const addAdultButton = byId("addAdultButton");
  const addChildButton = byId("addChildButton");
  const customEvents = byId("customEvents");
  const eventEditor = byId("eventEditor");
  const customEventForm = byId("customEventForm");
  const customEventId = byId("customEventId");
  const customEventTitle = byId("customEventTitle");
  const customEventType = byId("customEventType");
  const customParticipantChoices = byId("customParticipantChoices");
  const customResponsibleAdult = byId("customResponsibleAdult");
  const customStartTime = byId("customStartTime");
  const customEndTime = byId("customEndTime");
  const customResponsibilityMode = byId("customResponsibilityMode");
  const customTravel = byId("customTravel");
  const customLocationName = byId("customLocationName");
  const customLocationAddress = byId("customLocationAddress");
  const customRecurring = byId("customRecurring");
  const cancelEventButton = byId("cancelEventButton");
  const saveCustomButton = byId("saveCustomButton");
  const customSaveState = byId("customSaveState");
  const customCloudState = byId("customCloudState");
  const customError = byId("customError");
  const loadCloudButton = byId("loadCloudButton");
  const saveCloudButton = byId("saveCloudButton");
  const deleteCloudButton = byId("deleteCloudButton");
  const refreshRoutesButton = byId("refreshRoutesButton");
  const STORAGE_KEY = "faithsparks:weekflow:logistics-rules:v1";
  const CUSTOM_STORAGE_KEY = "faithsparks:weekflow:custom-day:v1";
  const PERSON_COLORS = ["#315f53", "#d45e86", "#6657d9", "#168a80", "#4776c5", "#a06d35", "#8a5b32"];
  let scenario = structuredClone(config.defaultScenario);
  let scenarioMode = "demo";
  let current = null;
  let calendarPreferences = { calendar_ids: [], detail_mode: "details" };
  let accountStatus = { signed_in: false };
  let integrationConfig = { live_routes: false, sms: false, email: false, support_links: false };
  let customRevision = 0;

  function blankCustomScenario() {
    return {
      schema_version: 1,
      day_label: "Monday",
      people: [
        { id: "adult-1", name: "Parent", role: "adult", color: PERSON_COLORS[0] },
        { id: "child-1", name: "Child", role: "child", color: PERSON_COLORS[2] },
      ],
      home_location_id: "home",
      locations: [{ id: "home", name: "Home" }],
      routes: [],
      vehicles: [],
      rules: [],
      events: [],
      support_requests: [],
      responsibility_history: [],
    };
  }

  function loadCustomScenario() {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || "null");
      return stored && Array.isArray(stored.people) && Array.isArray(stored.events)
        ? stored
        : blankCustomScenario();
    } catch {
      localStorage.removeItem(CUSTOM_STORAGE_KEY);
      return blankCustomScenario();
    }
  }

  let customScenario = loadCustomScenario();

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function firstSentence(value) {
    const text = String(value ?? "");
    const ending = text.search(/[.!?](?:\s|$)/);
    return ending === -1 ? text : text.slice(0, ending + 1);
  }

  function uniqueId(prefix) {
    const suffix = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function minuteFromTime(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    return hours * 60 + minutes;
  }

  function inputTime(minute) {
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  }

  function saveCustomLocally(markDirty = true) {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customScenario));
    if (markDirty && !customBuilder.hidden) results.hidden = true;
    customSaveState.textContent = "Saved on this device.";
    customizeButton.textContent = customScenario.events.length ? "Continue my family’s day" : "Enter my family’s day";
  }

  function customPeople(role) {
    return customScenario.people.filter((person) => person.role === role);
  }

  function personName(personId) {
    return customScenario.people.find((person) => person.id === personId)?.name || "Not assigned";
  }

  function referencedPerson(personId) {
    return customScenario.events.some((event) => event.participant_ids.includes(personId)
      || event.assigned_adult_id === personId
      || event.dropoff_adult_id === personId
      || event.pickup_adult_id === personId)
      || customScenario.rules.some((rule) => rule.adult_id === personId || rule.fallback_adult_ids.includes(personId));
  }

  function renderCustomPeople() {
    customPeopleList.innerHTML = customScenario.people.map((person) => `
      <div class="wfl-person-row" data-person-id="${escapeHtml(person.id)}">
        <i style="--person:${escapeHtml(person.color)}"></i>
        <label><span>${person.role === "adult" ? "Adult" : "Child"}</span><input type="text" maxlength="120" value="${escapeHtml(person.name)}" aria-label="${person.role === "adult" ? "Adult" : "Child"} name" /></label>
        <button class="wfl-text-button" type="button" data-remove-person="${escapeHtml(person.id)}" aria-label="Remove ${escapeHtml(person.name)}">Remove</button>
      </div>`).join("");
    customPeopleList.querySelectorAll("[data-person-id] input").forEach((input) => {
      input.addEventListener("input", () => {
        const person = customScenario.people.find((item) => item.id === input.closest("[data-person-id]").dataset.personId);
        if (person) person.name = input.value;
        saveCustomLocally();
      });
      input.addEventListener("blur", () => {
        renderParticipantChoices();
        renderCustomEvents();
      });
    });
    customPeopleList.querySelectorAll("[data-remove-person]").forEach((button) => button.addEventListener("click", () => {
      const personId = button.dataset.removePerson;
      const person = customScenario.people.find((item) => item.id === personId);
      if (referencedPerson(personId)) {
        customError.textContent = `${person?.name || "That person"} is used by a commitment. Remove or edit that commitment first.`;
        return;
      }
      if (person?.role === "adult" && customPeople("adult").length === 1) {
        customError.textContent = "Keep at least one adult in the family.";
        return;
      }
      if (customScenario.people.length === 2) {
        customError.textContent = "Keep at least two people in the family.";
        return;
      }
      customScenario.people = customScenario.people.filter((item) => item.id !== personId);
      customError.textContent = "";
      saveCustomLocally();
      renderCustomBuilder();
    }));
  }

  function renderParticipantChoices(selectedIds = []) {
    const role = customEventType.value === "adult_commitment" ? "adult" : "child";
    const people = customPeople(role);
    customParticipantChoices.innerHTML = people.length
      ? people.map((person) => `<label class="wfl-check"><input type="${role === "adult" ? "radio" : "checkbox"}" name="customParticipant" value="${escapeHtml(person.id)}" ${selectedIds.includes(person.id) ? "checked" : ""} /><span>${escapeHtml(person.name)}</span></label>`).join("")
      : `<p>Add a ${role} above first.</p>`;
    customResponsibleAdult.innerHTML = '<option value="">Not decided yet</option>' + customPeople("adult").map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`).join("");
    document.querySelectorAll(".wfl-child-option").forEach((element) => {
      element.hidden = role === "adult";
    });
  }

  function eventLocation(event) {
    return customScenario.locations.find((location) => location.id === event.location_id);
  }

  function renderCustomEvents() {
    const people = Object.fromEntries(customScenario.people.map((person) => [person.id, person]));
    const rules = Object.fromEntries(customScenario.rules.map((rule) => [rule.series_id, rule]));
    customEvents.innerHTML = customScenario.events.length
      ? customScenario.events.map((event) => {
        const rule = rules[event.series_id];
        const participants = event.participant_ids.map(personName).join(" + ");
        const ownership = ownershipLabel(event, rule, people);
        return `<article><div><time>${shortTime(event.start_minute)}–${shortTime(event.end_minute)}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(participants)}${ownership ? ` · ${escapeHtml(ownership)}` : ""}${event.series_id ? " · repeats" : ""}</span></div><div><button class="wfl-text-button" type="button" data-edit-event="${escapeHtml(event.id)}">Edit</button><button class="wfl-text-button" type="button" data-remove-event="${escapeHtml(event.id)}">Remove</button></div></article>`;
      }).join("")
      : '<p class="wfl-empty-copy">Nothing entered yet.</p>';
    customEvents.querySelectorAll("[data-edit-event]").forEach((button) => button.addEventListener("click", () => editCustomEvent(button.dataset.editEvent)));
    customEvents.querySelectorAll("[data-remove-event]").forEach((button) => button.addEventListener("click", () => {
      removeEventArtifacts(button.dataset.removeEvent);
      saveCustomLocally();
      renderCustomBuilder();
    }));
  }

  function renderCustomBuilder() {
    customDay.value = customScenario.day_label;
    customHomeAddress.value = customScenario.locations.find((location) => location.id === "home")?.address || "";
    renderCustomPeople();
    renderCustomEvents();
    renderParticipantChoices();
    updateCustomSyncUi();
  }

  function addCustomPerson(role) {
    if (customScenario.people.length >= 12) {
      customError.textContent = "A family day can include up to 12 people.";
      return;
    }
    const count = customPeople(role).length + 1;
    customScenario.people.push({
      id: uniqueId(role),
      name: role === "adult" ? `Adult ${count}` : `Child ${count}`,
      role,
      color: PERSON_COLORS[customScenario.people.length % PERSON_COLORS.length],
    });
    customError.textContent = "";
    saveCustomLocally();
    renderCustomBuilder();
  }

  function startNewCustomDay() {
    if (customScenario.events.length && newCustomDayButton.dataset.confirm !== "true") {
      newCustomDayButton.dataset.confirm = "true";
      newCustomDayButton.textContent = "Click again to clear this device";
      customError.textContent = "Your cloud copy will not be deleted.";
      return;
    }
    customScenario = blankCustomScenario();
    scenarioMode = "demo";
    scenario = structuredClone(config.defaultScenario);
    newCustomDayButton.dataset.confirm = "false";
    newCustomDayButton.textContent = "Start a new day";
    customError.textContent = "Started a blank day on this device.";
    saveCustomLocally();
    renderCustomBuilder();
    renderScenarioSummary(scenario);
    resetRulesButton.hidden = false;
  }

  function removeEventArtifacts(eventId) {
    const event = customScenario.events.find((item) => item.id === eventId);
    if (!event) return;
    customScenario.events = customScenario.events.filter((item) => item.id !== eventId);
    if (event.series_id) customScenario.rules = customScenario.rules.filter((rule) => rule.series_id !== event.series_id);
    if (event.location_id && event.location_id !== "home") {
      customScenario.locations = customScenario.locations.filter((location) => location.id !== event.location_id);
      customScenario.routes = customScenario.routes.filter((route) => route.from_location_id !== event.location_id && route.to_location_id !== event.location_id);
    }
  }

  function resetCustomEventForm() {
    customEventForm.reset();
    customEventId.value = "";
    customStartTime.value = "15:00";
    customEndTime.value = "16:00";
    customTravel.value = "15";
    customEventType.value = "child_activity";
    customEventForm.querySelector('button[type="submit"]').textContent = "Add commitment";
    renderParticipantChoices();
  }

  function editCustomEvent(eventId) {
    const event = customScenario.events.find((item) => item.id === eventId);
    if (!event) return;
    const rule = customScenario.rules.find((item) => item.series_id === event.series_id);
    const location = eventLocation(event);
    customEventId.value = event.id;
    customEventTitle.value = event.title;
    customEventType.value = event.kind;
    customStartTime.value = inputTime(event.start_minute);
    customEndTime.value = inputTime(event.end_minute);
    customResponsibilityMode.value = event.responsibility_mode;
    customTravel.value = String(event.travel_before ?? rule?.travel_before ?? customScenario.routes.find((route) => route.from_location_id === "home" && route.to_location_id === event.location_id)?.base_minutes ?? 0);
    customLocationName.value = location?.name || "";
    customLocationAddress.value = location?.address || "";
    customRecurring.checked = Boolean(event.series_id);
    renderParticipantChoices(event.participant_ids);
    customResponsibleAdult.value = event.assigned_adult_id || rule?.adult_id || "";
    customEventForm.querySelector('button[type="submit"]').textContent = "Save change";
    eventEditor.open = true;
    eventEditor.scrollIntoView({ behavior: "smooth", block: "center" });
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
    ruleMemory.textContent = scenario.rules.length
      ? `Remembered on this device: ${scenario.rules.map((rule) => rule.label).join(" · ")}`
      : "No repeating responsibility rules are saved yet.";
  }

  function shortTime(minute) {
    const hour = Math.floor(minute / 60);
    const minutes = String(minute % 60).padStart(2, "0");
    return `${hour % 12 || 12}:${minutes} ${hour < 12 ? "AM" : "PM"}`;
  }

  function ownershipLabel(event, rule, people) {
    if (!event.requires_adult) return "";
    const defaultAdultId = event.assigned_adult_id || rule?.adult_id;
    if (event.responsibility_mode === "transport") {
      const dropoffId = event.dropoff_adult_id || rule?.dropoff_adult_id || defaultAdultId;
      const pickupId = event.pickup_adult_id || rule?.pickup_adult_id || defaultAdultId;
      if (!dropoffId || !pickupId) return "Needs an adult";
      if (dropoffId === pickupId) return `${people[dropoffId]?.name || "Adult"} drives`;
      return `${people[dropoffId]?.name || "Adult"} drops off · ${people[pickupId]?.name || "Adult"} picks up`;
    }
    return defaultAdultId ? `${people[defaultAdultId]?.name || "Adult"} stays` : "Needs an adult";
  }

  function renderScenarioSummary(value) {
    const people = Object.fromEntries(value.people.map((person) => [person.id, person]));
    const rules = Object.fromEntries(value.rules.map((rule) => [rule.series_id, rule]));
    const householdCount = value.people.filter((person) => person.household_member !== false).length;
    const isFamilyFour = householdCount === 4 && value.events.some((event) => event.id === "school");
    scenarioEyebrow.textContent = `${value.day_label} ${scenarioMode === "custom" ? "plan" : "test"}`;
    scenarioTitle.textContent = scenarioMode === "custom"
      ? "Your family day."
      : isFamilyFour
        ? "A busy school-and-sports day."
        : "See the hidden handoff.";
    scenarioDescription.textContent = scenarioMode === "custom"
      ? "WeekFlow checks every person, ride, and travel window you entered."
      : isFamilyFour
        ? "WeekFlow checks the travel, drivers, and pickup plan for you."
        : "Start with this example. Nothing changes until you choose an option.";
    scenarioEvents.innerHTML = value.events.map((event) => {
      const participantNames = event.participant_ids.map((id) => people[id]?.name).filter(Boolean).join(" + ");
      const rule = rules[event.series_id];
      const ownership = ownershipLabel(event, rule, people);
      const travel = (event.travel_before ?? rule?.travel_before ?? 0) || (event.travel_after ?? rule?.travel_after ?? 0);
      return `<article><time>${shortTime(event.start_minute)}–${shortTime(event.end_minute)}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(participantNames)}${ownership ? ` · ${escapeHtml(ownership)}` : ""}${travel ? ` · ${travel} minutes each way` : ""}</span></article>`;
    }).join("");
    scenarioRules.innerHTML = `<strong>Rules WeekFlow remembers</strong>${value.rules.map((rule) => `<span>${escapeHtml(rule.label)}</span>`).join("")}`;
  }

  function renderStatus(result) {
    if (result.status === "workable") {
      resultTitle.textContent = `${result.scenario.day_label} is covered.`;
      status.className = "wfl-status good";
      status.innerHTML = "<strong>You’re set.</strong><span>Every ride and responsibility has an available person.</span>";
    } else {
      resultTitle.textContent = `${result.scenario.day_label} needs ${result.issue_count === 1 ? "one decision" : `${result.issue_count} decisions`}.`;
      status.className = "wfl-status warning";
      status.innerHTML = `<strong>Here’s what needs you.</strong><span>Start with the first option below.</span>`;
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
    if (item.kind === "external_help") {
      return '<div class="wfl-suggestion-actions"><button class="wfl-button" type="button" data-carpool-option>Show a carpool option</button></div>';
    }
    if (item.kind === "request_support") {
      const request = current?.support_requests.find((candidate) => candidate.event_id === item.event_id && candidate.adult_id === item.adult_id && candidate.status === "pending");
      if (request) {
        return `<div class="wfl-suggestion-actions"><button class="wfl-button" type="button" data-request="${escapeHtml(request.id)}" data-request-action="accept">They said yes</button><button class="wfl-button" type="button" data-request="${escapeHtml(request.id)}" data-request-action="decline">They can’t help</button></div>`;
      }
    }
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
      conflictDetails.hidden = true;
      return;
    }
    conflictDetails.hidden = false;
    issues.innerHTML = result.issues.map((item) => `<article><span class="wfl-eyebrow">Conflict detected</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("");
    const cards = result.suggestions.map((item, index) => `<article><span class="wfl-eyebrow">${index === 0 ? "Do this next" : item.kind === "reassign" ? "Another option" : "Family decision"}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(firstSentence(item.body))}</p>${suggestionButtons(item)}</article>`);
    suggestions.innerHTML = `${cards[0] || ""}${cards.length > 1 ? `<details class="wfl-more-options"><summary>See ${cards.length - 1} more ${cards.length === 2 ? "decision" : "decisions"}</summary><div>${cards.slice(1).join("")}</div></details>` : ""}`;
    suggestions.querySelectorAll("button[data-adult]").forEach((button) => button.addEventListener("click", () => applyChange(button.dataset.event, button.dataset.adult, button.dataset.scope, button.dataset.responsibility)));
    suggestions.querySelectorAll("button[data-vehicle]").forEach((button) => button.addEventListener("click", () => requestPlan({ kind: "vehicle", event_id: button.dataset.event, vehicle_id: button.dataset.vehicle, scope: button.dataset.scope })));
    suggestions.querySelectorAll("button[data-request]").forEach((button) => button.addEventListener("click", () => requestPlan({ kind: "support_request", request_id: button.dataset.request, action: button.dataset.requestAction })));
    suggestions.querySelectorAll("button[data-carpool-option]").forEach((button) => button.addEventListener("click", () => useScenario(config.carpoolScenario)));
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
    if (scenarioMode === "custom") {
      customScenario = structuredClone(result.scenario);
      saveCustomLocally(false);
      renderCustomBuilder();
    }
  }

  async function requestPlan(change = null) {
    planButton.disabled = true;
    actionStatus.textContent = "Checking the family plan…";
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
      planButton.textContent = "Check again";
      document.querySelector(".wfl-result-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      actionStatus.textContent = error.message;
    } finally {
      planButton.disabled = false;
    }
  }

  function applyChange(eventId, adultId, scope, responsibilityKind = null) {
    return requestPlan({ event_id: eventId, adult_id: adultId, scope, ...(responsibilityKind ? { responsibility_kind: responsibilityKind } : {}) });
  }

  function useScenario(nextScenario) {
    scenarioMode = "demo";
    resetRulesButton.hidden = false;
    scenario = structuredClone(nextScenario);
    renderScenarioSummary(scenario);
    planButton.textContent = "Check this day";
    requestPlan();
  }

  function saveCustomEvent(event) {
    event.preventDefault();
    const participantIds = [...customParticipantChoices.querySelectorAll("input:checked")].map((input) => input.value);
    const startMinute = minuteFromTime(customStartTime.value);
    const endMinute = minuteFromTime(customEndTime.value);
    if (!participantIds.length) {
      customError.textContent = "Choose at least one person for this commitment.";
      return;
    }
    if (endMinute <= startMinute) {
      customError.textContent = "The end time needs to be later than the start time.";
      return;
    }
    const eventId = customEventId.value || uniqueId("event");
    const previousEvent = customScenario.events.find((item) => item.id === eventId);
    const previousRule = customScenario.rules.find((item) => item.series_id === previousEvent?.series_id);
    const isChildActivity = customEventType.value === "child_activity";
    const adultId = isChildActivity ? customResponsibleAdult.value || null : null;
    const travelMinutes = Math.max(0, Math.min(180, Number(customTravel.value) || 0));
    const recurring = isChildActivity && customRecurring.checked;
    const preserveSplit = adultId && adultId === (previousEvent?.assigned_adult_id || previousRule?.adult_id);
    removeEventArtifacts(eventId);
    const locationName = customLocationName.value.trim();
    const locationAddress = customLocationAddress.value.trim();
    const locationId = locationName || locationAddress ? `location-${eventId}` : null;
    if (locationId) {
      customScenario.locations.push({
        id: locationId,
        name: locationName || customEventTitle.value.trim(),
        ...(locationAddress ? { address: locationAddress } : {}),
      });
      customScenario.routes.push(
        { from_location_id: "home", to_location_id: locationId, base_minutes: travelMinutes, traffic_minutes: 0 },
        { from_location_id: locationId, to_location_id: "home", base_minutes: travelMinutes, traffic_minutes: 0 },
      );
    }
    const seriesId = recurring ? `series-${eventId}` : null;
    customScenario.events.push({
      id: eventId,
      title: customEventTitle.value.trim(),
      kind: customEventType.value,
      start_minute: startMinute,
      end_minute: endMinute,
      participant_ids: participantIds,
      requires_adult: isChildActivity,
      responsibility_mode: isChildActivity ? customResponsibilityMode.value : "none",
      series_id: seriesId,
      assigned_adult_id: recurring ? null : adultId,
      dropoff_adult_id: !recurring && preserveSplit ? previousEvent?.dropoff_adult_id || null : null,
      pickup_adult_id: !recurring && preserveSplit ? previousEvent?.pickup_adult_id || null : null,
      location_id: locationId,
      vehicle_id: null,
      travel_before: locationId ? null : travelMinutes,
      travel_after: locationId ? null : travelMinutes,
      fixed: true,
    });
    if (seriesId && adultId) {
      customScenario.rules.push({
        id: `rule-${eventId}`,
        series_id: seriesId,
        label: `${personName(adultId)} normally handles ${customEventTitle.value.trim()}`,
        adult_id: adultId,
        dropoff_adult_id: preserveSplit ? previousRule?.dropoff_adult_id || null : null,
        pickup_adult_id: preserveSplit ? previousRule?.pickup_adult_id || null : null,
        fallback_adult_ids: customPeople("adult").map((person) => person.id).filter((id) => id !== adultId),
        travel_before: travelMinutes,
        travel_after: travelMinutes,
      });
    }
    customScenario.events.sort((left, right) => left.start_minute - right.start_minute || left.title.localeCompare(right.title));
    customError.textContent = "";
    saveCustomLocally();
    renderCustomEvents();
    resetCustomEventForm();
    eventEditor.open = false;
  }

  function updateCustomSyncUi() {
    loadCloudButton.hidden = !accountStatus.signed_in;
    saveCloudButton.hidden = !accountStatus.signed_in;
    deleteCloudButton.hidden = !accountStatus.signed_in;
    refreshRoutesButton.hidden = !(accountStatus.signed_in && integrationConfig.live_routes);
    customCloudState.textContent = accountStatus.signed_in
      ? customRevision
        ? `Cloud copy saved · version ${customRevision}.`
        : "Ready to save across devices."
      : "Sign in to save across devices.";
  }

  async function saveCustomCloud() {
    if (!accountStatus.signed_in) return;
    if (!customScenario.events.length) {
      customCloudState.textContent = "Add a commitment before saving across devices.";
      return;
    }
    saveCloudButton.disabled = true;
    try {
      const payload = await responseJson(config.logisticsStateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ revision: customRevision, scenario: customScenario }),
      });
      customRevision = payload.revision;
      customScenario = payload.scenario;
      saveCustomLocally(false);
      updateCustomSyncUi();
    } catch (error) {
      customCloudState.textContent = error.message;
    } finally {
      saveCloudButton.disabled = false;
    }
  }

  async function deleteCustomCloud() {
    if (!accountStatus.signed_in || !window.confirm("Delete this family day from cloud storage? The copy on this device will stay.")) return;
    deleteCloudButton.disabled = true;
    try {
      await responseJson(config.logisticsStateUrl, {
        method: "DELETE",
        headers: { "X-CSRF-Token": config.csrfToken },
      });
      customRevision = 0;
      customCloudState.textContent = "Cloud copy deleted. This device still has your day.";
    } catch (error) {
      customCloudState.textContent = error.message;
    } finally {
      deleteCloudButton.disabled = false;
    }
  }

  async function loadCustomCloud() {
    loadCloudButton.disabled = true;
    try {
      const payload = await responseJson(config.logisticsStateUrl);
      customRevision = payload.revision;
      if (!payload.scenario) {
        customCloudState.textContent = "No cloud copy yet. Save this day first.";
        return;
      }
      customScenario = payload.scenario;
      saveCustomLocally();
      renderCustomBuilder();
      customCloudState.textContent = `Cloud copy loaded · version ${customRevision}.`;
    } catch (error) {
      customCloudState.textContent = error.message;
    } finally {
      loadCloudButton.disabled = false;
    }
  }

  async function refreshCustomRoutes() {
    const routable = customScenario.routes.some((route) => {
      const from = customScenario.locations.find((location) => location.id === route.from_location_id);
      const to = customScenario.locations.find((location) => location.id === route.to_location_id);
      return from?.address && to?.address;
    });
    if (!routable) {
      customError.textContent = "Add your home address and at least one commitment address first.";
      return;
    }
    refreshRoutesButton.disabled = true;
    try {
      const payload = await responseJson(config.routeRefreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ scenario: customScenario }),
      });
      customScenario = payload.scenario;
      saveCustomLocally();
      customError.textContent = `${payload.refresh.refreshed} travel routes refreshed.`;
      scenarioMode = "custom";
      resetRulesButton.hidden = true;
      scenario = structuredClone(customScenario);
      renderScenarioSummary(scenario);
      await requestPlan();
    } catch (error) {
      customError.textContent = error.message;
    } finally {
      refreshRoutesButton.disabled = false;
    }
  }

  async function saveAndPlanCustomDay() {
    const home = customScenario.locations.find((location) => location.id === "home");
    const address = customHomeAddress.value.trim();
    if (address) home.address = address;
    else delete home.address;
    customScenario.day_label = customDay.value;
    if (customScenario.people.some((person) => !person.name.trim())) {
      customError.textContent = "Give each family member a name.";
      return;
    }
    if (!customScenario.events.length) {
      customError.textContent = "Add at least one commitment before checking the day.";
      eventEditor.open = true;
      return;
    }
    customError.textContent = "";
    saveCustomLocally();
    scenarioMode = "custom";
    resetRulesButton.hidden = true;
    scenario = structuredClone(customScenario);
    renderScenarioSummary(scenario);
    await requestPlan();
  }

  async function loadIntegrationStatus() {
    try {
      integrationConfig = await responseJson(config.integrationStatusUrl);
    } catch {
      integrationConfig = { live_routes: false, sms: false, email: false, support_links: false };
    }
    updateCustomSyncUi();
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
    if (!response.ok) throw new Error(payload.error || "WeekFlow could not complete that request.");
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
      const payload = await responseJson(config.calendarStatusUrl);
      accountStatus = payload;
      updateCustomSyncUi();
      renderCalendarConnection(payload);
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
  familyFourButton.addEventListener("click", () => useScenario(config.familyFourScenario));
  carpoolButton.addEventListener("click", () => useScenario(config.carpoolScenario));
  customizeButton.addEventListener("click", () => {
    customBuilder.hidden = false;
    renderCustomBuilder();
    customBuilder.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  closeCustomButton.addEventListener("click", () => {
    customBuilder.hidden = true;
    customizeButton.focus();
  });
  newCustomDayButton.addEventListener("click", startNewCustomDay);
  addAdultButton.addEventListener("click", () => addCustomPerson("adult"));
  addChildButton.addEventListener("click", () => addCustomPerson("child"));
  customDay.addEventListener("change", () => {
    customScenario.day_label = customDay.value;
    saveCustomLocally();
  });
  customHomeAddress.addEventListener("input", () => {
    const home = customScenario.locations.find((location) => location.id === "home");
    const address = customHomeAddress.value.trim();
    if (address) home.address = address;
    else delete home.address;
    saveCustomLocally();
  });
  customEventType.addEventListener("change", () => renderParticipantChoices());
  customEventForm.addEventListener("submit", saveCustomEvent);
  cancelEventButton.addEventListener("click", () => {
    resetCustomEventForm();
    eventEditor.open = false;
  });
  saveCustomButton.addEventListener("click", saveAndPlanCustomDay);
  loadCloudButton.addEventListener("click", loadCustomCloud);
  saveCloudButton.addEventListener("click", saveCustomCloud);
  deleteCloudButton.addEventListener("click", deleteCustomCloud);
  refreshRoutesButton.addEventListener("click", refreshCustomRoutes);
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
  saveCustomLocally();
  renderCustomBuilder();
  loadCalendarStatus();
  loadIntegrationStatus();
})();
