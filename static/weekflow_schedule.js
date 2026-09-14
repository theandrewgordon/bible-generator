(() => {
  const config = window.WEEKFLOW_SCHEDULE_CONFIG;
  const byId = (id) => document.getElementById(id);
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const COLORS = { school: "#6657d9", logistics: "#1f7a68", responsibility: "#d28a32", calendar: "#3f77ad" };
  let state = null;
  let selectedDate = null;
  let days = [];
  let calendarEvents = [];

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Please try again.");
    return payload;
  }

  function localDate(value) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function mondayFor(value) {
    const date = localDate(value) || new Date();
    const weekday = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    return isoDate(date);
  }

  function buildDays() {
    const planDates = new Map((state.learning.plan.days || []).map((day) => [day.date, day]));
    const monday = localDate(mondayFor(state.today));
    days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      const dateValue = isoDate(date);
      return { date: dateValue, label: DAY_NAMES[date.getUTCDay()], learning: planDates.get(dateValue) || null };
    });
    selectedDate = days.some((day) => day.date === state.today) ? state.today : days[0].date;
  }

  function personName(personId) {
    return state.family.people.find((person) => person.id === personId)?.name || null;
  }

  function minutesLabel(minutes) {
    const normalized = Number(minutes);
    if (!Number.isFinite(normalized)) return "Any time";
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const suffix = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function timeFromCalendar(value, allDay) {
    if (allDay) return "All day";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: state.family.timezone,
    }).format(parsed);
  }

  function calendarMinute(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 10000;
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: state.family.timezone,
    }).formatToParts(parsed).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return Number(parts.hour) * 60 + Number(parts.minute);
  }

  function calendarDate(event) {
    if (event.all_day) return String(event.start).slice(0, 10);
    const parsed = new Date(event.start);
    if (Number.isNaN(parsed.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: state.family.timezone,
    }).formatToParts(parsed).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function selectedDay() {
    return days.find((day) => day.date === selectedDate) || days[0];
  }

  function logisticsForSelectedDay() {
    const plan = state.logistics.plan;
    if (!plan) return [];
    return plan.scenario.day_label === selectedDay().label ? plan.assignments : [];
  }

  function responsibilitiesForSelectedDay() {
    return (state.responsibilities.items || []).filter((item) => {
      if (item.status === "completed" || item.area !== "schedule") return false;
      return item.due_date === selectedDate || (!item.due_date && selectedDate === state.today);
    });
  }

  function agendaItems() {
    const day = selectedDay();
    const school = (state.family.configured ? day.learning?.entries || [] : []).map((entry) => ({
      id: `school-${entry.task_id}`,
      title: entry.title,
      time: entry.start ? `${entry.start}–${entry.end}` : "Flexible",
      sort: Number(entry.start_minute ?? 10000),
      detail: `${entry.student_names.join(" + ")} · ${entry.subject}${entry.parent_minutes ? ` · ${entry.parent_minutes} min with parent` : ""}`,
      source: "Homeschool",
      kind: "school",
    }));
    const logistics = logisticsForSelectedDay().map((entry) => ({
      id: `logistics-${entry.id}`,
      title: entry.title,
      time: `${minutesLabel(entry.start_minute)}–${minutesLabel(entry.end_minute)}`,
      sort: Number(entry.start_minute),
      detail: [entry.participant_names?.join(" + "), entry.adult_name ? `${entry.adult_name} responsible` : entry.requires_adult ? "Needs an adult" : null].filter(Boolean).join(" · "),
      source: "Family logistics",
      kind: "logistics",
    }));
    const responsibilities = responsibilitiesForSelectedDay().map((item) => ({
      id: `responsibility-${item.id}`,
      title: item.title,
      time: "Any time",
      sort: 11000,
      detail: personName(item.assigned_person_id) || "Family responsibility",
      source: "Today",
      kind: "responsibility",
    }));
    const calendar = calendarEvents.filter((event) => calendarDate(event) === selectedDate).map((event) => ({
      id: `calendar-${event.source_calendar_id}-${event.provider_event_id}`,
      title: event.title,
      time: timeFromCalendar(event.start, event.all_day),
      sort: event.all_day ? -1 : calendarMinute(event.start),
      detail: [event.source_calendar_name, event.location].filter(Boolean).join(" · "),
      source: "Google Calendar · preview",
      kind: "calendar",
    }));
    return [...calendar, ...school, ...logistics, ...responsibilities].sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function empty(message) {
    return element("div", "wfs-empty", message);
  }

  function renderTabs() {
    const tabs = byId("dayTabs");
    tabs.replaceChildren(...days.map((day) => {
      const button = element("button");
      button.type = "button";
      button.role = "tab";
      button.dataset.date = day.date;
      button.classList.toggle("is-active", day.date === selectedDate);
      button.setAttribute("aria-selected", String(day.date === selectedDate));
      const label = element("b", "", day.label.slice(0, 3));
      const date = localDate(day.date);
      const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
      button.append(label, element("span", "", shortDate));
      return button;
    }));
  }

  function renderAgenda() {
    const day = selectedDay();
    const items = agendaItems();
    byId("agendaTitle").textContent = `${day.label}’s agenda`;
    byId("agendaCount").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    byId("agendaList").replaceChildren(...(items.length ? items.map((item) => {
      const article = element("article", "wfs-agenda-item");
      article.append(element("time", "", item.time));
      const rule = element("i");
      rule.style.setProperty("--item-color", COLORS[item.kind]);
      article.append(rule);
      const copy = element("div");
      copy.append(element("strong", "", item.title));
      if (item.detail) copy.append(element("span", "", item.detail));
      copy.append(element("span", "wfs-source", item.source));
      article.append(copy);
      return article;
    }) : [empty("Nothing is scheduled here yet. Leave the space open, or add only what the family truly needs.")]));
  }

  function issuesForSelectedDay() {
    const plan = state.logistics.plan;
    if (!plan || plan.scenario.day_label !== selectedDay().label) return [];
    return plan.issues || [];
  }

  function calendarOverlapWarnings() {
    const timedCalendar = calendarEvents.filter((event) => !event.all_day && calendarDate(event) === selectedDate);
    const logistics = logisticsForSelectedDay();
    const warnings = timedCalendar.flatMap((calendar) => {
      const start = new Date(calendar.start);
      const end = new Date(calendar.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
      const overlap = logistics.find((item) => calendarMinute(start) < item.responsibility_end && calendarMinute(end) > item.responsibility_start);
      return overlap ? [{
        title: `Confirm the handoff around ${overlap.title}`,
        body: `${calendar.title} overlaps its true responsibility window. Check that the right adult is still free.`,
        kind: "calendar_overlap",
      }] : [];
    });
    return [...new Map(warnings.map((warning) => [warning.title, warning])).values()].slice(0, 3);
  }

  function renderAttention() {
    const issues = [...issuesForSelectedDay(), ...calendarOverlapWarnings()];
    const panel = byId("attentionPanel");
    panel.classList.toggle("needs-attention", issues.length > 0);
    byId("attentionTitle").textContent = issues.length ? `${selectedDay().label} needs ${issues.length === 1 ? "one decision" : `${issues.length} decisions`}.` : "The handoffs are covered.";
    byId("attentionCount").textContent = issues.length ? String(issues.length) : "Clear";
    const list = byId("attentionList");
    if (!issues.length) {
      list.replaceChildren(element("p", "wfs-clear-copy", state.logistics.has_saved_plan ? "No missing owner, ride, or overlapping responsibility is showing for this day." : "No saved family-logistics plan is attached to this day yet."));
      return;
    }
    list.replaceChildren(...issues.map((issue) => {
      const article = element("article", "wfs-alert");
      const copy = element("div");
      copy.append(element("strong", "", issue.title), element("span", "", issue.body));
      const link = element("a", "", "Resolve →");
      link.href = config.logisticsUrl;
      article.append(copy, link);
      return article;
    }));
  }

  function renderCoverage() {
    const assignments = logisticsForSelectedDay();
    const list = byId("coverageList");
    if (!assignments.length) {
      list.replaceChildren(empty(state.logistics.has_saved_plan ? "No logistics commitments are saved for this day." : "Add the family’s appointments, activities, and rides when you are ready."));
      return;
    }
    list.replaceChildren(...assignments.map((item) => {
      const article = element("article", `wfs-coverage-item${item.requires_adult && !item.adult_name ? " is-open" : ""}`);
      const copy = element("div");
      copy.append(element("strong", "", item.title), element("span", "", item.responsibility_mode === "transport" ? item.responsibility_window : `${minutesLabel(item.start_minute)}–${minutesLabel(item.end_minute)}`));
      const owner = item.adult_name || (item.requires_adult ? "Needs an adult" : item.participant_names?.join(" + ") || "Covered");
      article.append(copy, element("b", "", owner));
      return article;
    }));
  }

  function renderDay() {
    renderTabs();
    renderAttention();
    renderAgenda();
    renderCoverage();
  }

  function setCalendarStatus(title, body, action) {
    const status = byId("calendarStatus");
    status.replaceChildren();
    const copy = element("div");
    copy.append(element("strong", "", title), document.createTextNode(body));
    status.append(copy);
    if (action) status.append(action);
  }

  async function loadCalendarChoices(preferences) {
    const payload = await jsonRequest(config.calendarsUrl);
    const selected = new Set(preferences.calendar_ids || []);
    if (!selected.size && payload.calendars.length) selected.add((payload.calendars.find((item) => item.primary) || payload.calendars[0]).id);
    const list = byId("calendarList");
    list.replaceChildren(...payload.calendars.map((calendar) => {
      const label = element("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "calendarId";
      input.value = calendar.id;
      input.checked = selected.has(calendar.id);
      const copy = element("span");
      copy.append(element("b", "", `${calendar.name}${calendar.primary ? " · Primary" : ""}`), element("small", "", "Read-only preview"));
      label.append(input, copy);
      return label;
    }));
    const mode = byId("calendarForm").querySelector(`input[name="detailMode"][value="${preferences.detail_mode || "details"}"]`);
    if (mode) mode.checked = true;
  }

  async function loadCalendar() {
    try {
      const status = await jsonRequest(config.calendarStatusUrl);
      if (!status.configured) {
        byId("calendarSummary").textContent = "Optional · unavailable here";
        setCalendarStatus("Calendar is not set up on this server.", "Your WeekFlow schedule still works normally without it.");
        return;
      }
      if (!status.connected) {
        byId("calendarSummary").textContent = "Optional · not connected";
        const link = element("a", "wfs-button", "Connect Google Calendar");
        link.href = status.connect_url;
        setCalendarStatus("Google Calendar is not connected.", "Connect it separately when a read-only preview would help.", link);
        return;
      }
      byId("calendarSummary").textContent = "Connected · read-only";
      setCalendarStatus("Google Calendar is connected.", "Choose what to show in this temporary preview.");
      await loadCalendarChoices(status.preferences || {});
      byId("calendarForm").hidden = false;
    } catch (error) {
      byId("calendarSummary").textContent = "Optional · unavailable";
      setCalendarStatus("Calendar preview is unavailable.", error.message);
    }
  }

  async function previewCalendar(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const calendarIds = [...form.querySelectorAll('input[name="calendarId"]:checked')].map((input) => input.value);
    if (!calendarIds.length) {
      setCalendarStatus("Choose at least one calendar.", "Nothing has been added to the agenda.");
      return;
    }
    button.disabled = true;
    try {
      const detailMode = form.querySelector('input[name="detailMode"]:checked').value;
      const payload = await jsonRequest(config.calendarPreviewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ calendar_ids: calendarIds, detail_mode: detailMode, week_start: mondayFor(selectedDate), timezone: state.family.timezone }),
      });
      calendarEvents = payload.events || [];
      byId("calendarSummary").textContent = `${payload.event_count} previewed · not saved`;
      setCalendarStatus("Calendar preview added.", `${payload.event_count} commitment${payload.event_count === 1 ? "" : "s"} are visible in blue. Nothing was saved.`);
      renderDay();
    } catch (error) {
      setCalendarStatus("We couldn’t preview that calendar.", error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function load() {
    byId("scheduleLoading").hidden = false;
    byId("scheduleError").hidden = true;
    byId("scheduleApp").hidden = true;
    try {
      state = await jsonRequest(config.stateUrl);
      buildDays();
      byId("scheduleGreeting").textContent = `${state.family.name} · school, appointments, rides, and responsibilities in one place.`;
      byId("setupNotice").hidden = state.family.configured;
      renderDay();
      byId("scheduleLoading").hidden = true;
      byId("scheduleApp").hidden = false;
      loadCalendar();
    } catch (error) {
      byId("scheduleLoading").hidden = true;
      byId("scheduleErrorMessage").textContent = error.message;
      byId("scheduleError").hidden = false;
    }
  }

  byId("dayTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    selectedDate = button.dataset.date;
    renderDay();
  });
  byId("calendarForm").addEventListener("submit", previewCalendar);
  byId("retryButton").addEventListener("click", load);
  load();
})();
