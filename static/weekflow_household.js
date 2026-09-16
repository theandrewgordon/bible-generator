(() => {
  const config = window.WEEKFLOW_HOUSEHOLD_CONFIG;
  const byId = (id) => document.getElementById(id);
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  const TIME_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", anytime: "Any time" };
  const CATEGORY_LABELS = { home: "Around the house", kitchen: "Kitchen", laundry: "Laundry", pets: "Pet care", care: "Family care", outside: "Outside", other: "Other" };
  let state = null;
  let selectedDate = null;
  let saving = false;

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Please try again.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function newId() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() { return new Date().toISOString(); }
  function person(personId) { return state.family.people.find((candidate) => candidate.id === personId); }
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function empty(text) { return element("div", "wfh-empty", text); }
  function setStatus(text, error = false) { const node = byId("householdSaveStatus"); node.textContent = text; node.classList.toggle("is-error", error); }

  function dates() {
    const monday = new Date(`${state.week_start}T12:00:00Z`);
    return DAYS.map((day, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return { day, date: date.toISOString().slice(0, 10) }; });
  }

  function dayOccurrences(date = selectedDate) { return state.occurrences.filter((item) => item.date === date); }

  function renderTabs() {
    byId("dayTabs").replaceChildren(...dates().map((row) => {
      const button = element("button");
      button.type = "button"; button.role = "tab"; button.dataset.date = row.date;
      button.tabIndex = row.date === selectedDate ? 0 : -1;
      button.classList.toggle("is-active", row.date === selectedDate);
      button.setAttribute("aria-selected", String(row.date === selectedDate));
      const parsed = new Date(`${row.date}T12:00:00Z`);
      button.append(element("b", "", DAY_LABELS[row.day].slice(0, 3)), element("span", "", new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed)));
      return button;
    }));
  }

  function occurrenceCard(item) {
    const article = element("article", `wfh-occurrence${item.completed ? " is-done" : ""}`);
    const check = element("button", "wfh-check", "✓");
    check.type = "button"; check.dataset.action = item.completed ? "undo" : "complete"; check.dataset.occurrenceId = item.id;
    check.setAttribute("aria-label", item.completed ? `Restore ${item.title}` : `Complete ${item.title}`);
    const copy = element("div", "wfh-copy");
    copy.append(element("strong", "", item.title), element("span", "", `${TIME_LABELS[item.time_of_day]} · ${CATEGORY_LABELS[item.category]} · ${item.estimated_minutes} min`));
    const assigned = element("span", "wfh-person");
    const dot = element("i"); dot.style.setProperty("--person", item.assigned_person_color);
    assigned.append(dot, document.createTextNode(item.assigned_person_name));
    article.append(check, copy, assigned);
    return article;
  }

  function renderDay() {
    const current = dates().find((row) => row.date === selectedDate) || dates()[0];
    const items = dayOccurrences();
    const done = items.filter((item) => item.completed).length;
    byId("dayTitle").textContent = `${current.date === state.today ? "Today" : DAY_LABELS[current.day]} at home`;
    byId("dayProgress").textContent = `${done} of ${items.length} done`;
    byId("dayProgressBar").style.width = items.length ? `${Math.round((done / items.length) * 100)}%` : "0%";
    byId("occurrenceList").replaceChildren(...(items.length ? items.map(occurrenceCard) : [empty("Nothing repeats on this day. Leave the space open, or add a responsibility when it would truly help.")]));
  }

  function routineCard(routine) {
    const article = element("article", "wfh-routine");
    const head = element("div", "wfh-routine-head");
    const copy = element("div");
    const assigned = person(routine.assigned_person_id);
    const dayCopy = routine.days.length === 7 ? "Every day" : routine.days.map((day) => DAY_LABELS[day].slice(0, 3)).join(", ");
    copy.append(element("strong", "", routine.title), element("span", "", `${assigned?.name || "Family"} · ${dayCopy} · ${TIME_LABELS[routine.time_of_day]}`));
    head.append(copy, element("span", "", routine.active ? "Active" : "Paused"));
    const actions = element("div", "wfh-routine-actions");
    [["Edit", "edit"], [routine.active ? "Pause" : "Resume", "toggle"], ["Remove", "remove"]].forEach(([label, action]) => {
      const button = element("button", action === "remove" ? "is-remove" : "", label);
      button.type = "button"; button.dataset.action = action; button.dataset.routineId = routine.id; actions.append(button);
    });
    article.append(head, actions);
    return article;
  }

  function renderRoutines() {
    byId("routineList").replaceChildren(...(state.routines.length ? state.routines.map(routineCard) : [empty("No recurring work yet. Start with one small responsibility the family repeats often.")]));
  }

  function renderSummary() {
    const todayItems = dayOccurrences(state.today);
    byId("todayOpenCount").textContent = String(todayItems.filter((item) => !item.completed).length);
    byId("todayDoneCount").textContent = String(todayItems.filter((item) => item.completed).length);
    byId("weekCount").textContent = String(state.occurrences.length);
    byId("peopleCount").textContent = String(new Set(state.routines.filter((item) => item.active).map((item) => item.assigned_person_id)).size);
  }

  function render() { renderTabs(); renderDay(); renderRoutines(); renderSummary(); }

  function resetForm() {
    const form = byId("routineForm");
    form.reset();
    form.elements.routine_id.value = "";
    DAYS.slice(0, 5).forEach((day) => { form.querySelector(`input[value="${day}"]`).checked = true; });
    DAYS.slice(5).forEach((day) => { form.querySelector(`input[value="${day}"]`).checked = false; });
    byId("routineEditorEyebrow").textContent = "New responsibility";
    byId("routineEditorTitle").textContent = "Add it once. Let it return when needed.";
    byId("saveRoutineButton").textContent = "Add responsibility";
    byId("routineFormStatus").textContent = "";
  }

  function openForm(routine = null) {
    resetForm();
    if (routine) {
      const form = byId("routineForm");
      form.elements.routine_id.value = routine.id;
      form.elements.title.value = routine.title;
      form.elements.assigned_person_id.value = routine.assigned_person_id;
      form.elements.time_of_day.value = routine.time_of_day;
      form.elements.estimated_minutes.value = String(routine.estimated_minutes);
      form.elements.category.value = routine.category;
      DAYS.forEach((day) => { form.querySelector(`input[value="${day}"]`).checked = routine.days.includes(day); });
      byId("routineEditorEyebrow").textContent = "Edit responsibility";
      byId("routineEditorTitle").textContent = routine.title;
      byId("saveRoutineButton").textContent = "Save changes";
    }
    byId("routineEditor").hidden = false;
    byId("routineEditor").scrollIntoView({ behavior: "smooth", block: "start" });
    byId("routineForm").elements.title.focus({ preventScroll: true });
  }

  function closeForm() { byId("routineEditor").hidden = true; resetForm(); byId("showRoutineForm").focus(); }

  async function persist(message, previous) {
    if (saving) { setStatus("Finishing the previous household change…"); return false; }
    saving = true; setStatus("Saving…");
    try {
      state = await jsonRequest(config.stateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ revision: state.revision, routines: state.routines, completions: state.completions }),
      });
      render(); setStatus(message); return true;
    } catch (error) {
      state = previous;
      if (error.status === 409) {
        try { state = await jsonRequest(config.stateUrl); } catch (_refreshError) { /* retain the last known-good copy */ }
      }
      render(); setStatus(error.status === 409 ? "Household changed in another browser. We refreshed before overwriting anything." : error.message, true); return false;
    } finally { saving = false; }
  }

  async function submitRoutine(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const days = data.getAll("day").map(String);
    if (!days.length) { byId("routineFormStatus").textContent = "Choose at least one day."; byId("routineFormStatus").classList.add("is-error"); return; }
    const previous = structuredClone(state);
    const routineId = String(data.get("routine_id") || "");
    const existing = state.routines.find((routine) => routine.id === routineId);
    const timestamp = nowIso();
    const routine = {
      id: routineId || newId(), title: String(data.get("title")).trim().replace(/\s+/g, " "),
      assigned_person_id: String(data.get("assigned_person_id")), days,
      time_of_day: String(data.get("time_of_day")), category: String(data.get("category")),
      estimated_minutes: Number(data.get("estimated_minutes")), active: existing?.active ?? true,
      created_at: existing?.created_at || timestamp, updated_at: timestamp,
    };
    if (existing) state.routines = state.routines.map((item) => item.id === routine.id ? routine : item);
    else state.routines.push(routine);
    byId("routineEditor").hidden = true; render();
    if (await persist(existing ? "Responsibility updated" : "Responsibility added", previous)) resetForm();
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || saving) return;
    const action = button.dataset.action;
    if (button.dataset.occurrenceId) {
      const previous = structuredClone(state);
      if (action === "complete") state.completions[button.dataset.occurrenceId] = nowIso();
      else delete state.completions[button.dataset.occurrenceId];
      const occurrence = state.occurrences.find((item) => item.id === button.dataset.occurrenceId);
      if (occurrence) { occurrence.completed = action === "complete"; occurrence.completed_at = state.completions[button.dataset.occurrenceId] || null; }
      render(); await persist(action === "complete" ? "Responsibility completed" : "Responsibility restored", previous); return;
    }
    const routine = state.routines.find((item) => item.id === button.dataset.routineId);
    if (!routine) return;
    if (action === "edit") { openForm(routine); return; }
    if (action === "remove" && !window.confirm(`Remove “${routine.title}” and its recent completion history?`)) return;
    const previous = structuredClone(state);
    if (action === "toggle") { routine.active = !routine.active; routine.updated_at = nowIso(); }
    if (action === "remove") {
      state.routines = state.routines.filter((item) => item.id !== routine.id);
      Object.keys(state.completions).filter((key) => key.startsWith(`${routine.id}:`)).forEach((key) => delete state.completions[key]);
    }
    render(); await persist(action === "remove" ? "Responsibility removed" : routine.active ? "Responsibility resumed" : "Responsibility paused", previous);
  }

  async function load() {
    byId("householdLoading").hidden = false; byId("householdError").hidden = true; byId("householdApp").hidden = true;
    try {
      state = await jsonRequest(config.stateUrl); selectedDate = state.today;
      const select = byId("routineForm").elements.assigned_person_id;
      select.replaceChildren(...state.family.people.map((item) => new Option(item.name, item.id)));
      byId("householdGreeting").textContent = state.family.configured ? `${state.family.name} · give recurring work a clear home, time, and owner.` : "Set up the family first, then share recurring work without child accounts.";
      byId("setupNotice").hidden = state.family.configured;
      byId("showRoutineForm").disabled = !state.family.configured;
      render(); byId("householdLoading").hidden = true; byId("householdApp").hidden = false;
    } catch (error) {
      byId("householdLoading").hidden = true; byId("householdErrorMessage").textContent = error.message; byId("householdError").hidden = false;
    }
  }

  byId("showRoutineForm").addEventListener("click", () => openForm());
  byId("closeRoutineForm").addEventListener("click", closeForm);
  byId("cancelRoutineButton").addEventListener("click", closeForm);
  byId("routineForm").addEventListener("submit", submitRoutine);
  byId("householdApp").addEventListener("click", handleAction);
  byId("dayTabs").addEventListener("click", (event) => { const button = event.target.closest("button[data-date]"); if (!button) return; selectedDate = button.dataset.date; renderTabs(); renderDay(); });
  byId("dayTabs").addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = [...byId("dayTabs").querySelectorAll("[role='tab']")]; const index = tabs.indexOf(event.target); if (index < 0) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click(); tabs[next].focus(); });
  byId("retryButton").addEventListener("click", load);
  load();
})();
