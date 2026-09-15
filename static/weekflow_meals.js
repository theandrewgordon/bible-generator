(() => {
  const config = window.WEEKFLOW_MEALS_CONFIG;
  const byId = (id) => document.getElementById(id);
  const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const SLOT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
  const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
  const KIND_LABELS = { shopping: "Shopping", prep: "Preparation", other: "Meal step" };
  const TIME_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", anytime: "Any time" };
  let state = null;
  let selectedDate = null;
  let saving = false;

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.error || "Please try again."); error.status = response.status; throw error; }
    return payload;
  }

  function newId(prefix) { return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function nowIso() { return new Date().toISOString(); }
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function empty(text) { return element("div", "wfm-empty", text); }
  function person(id) { return state.family.people.find((candidate) => candidate.id === id); }
  function setStatus(text, error = false) { const node = byId("mealsSaveStatus"); node.textContent = text; node.classList.toggle("is-error", error); }

  function dates() {
    const monday = new Date(`${state.week_start}T12:00:00Z`);
    return DAY_LABELS.map((label, index) => { const value = new Date(monday); value.setUTCDate(monday.getUTCDate() + index); return { label, date: value.toISOString().slice(0, 10) }; });
  }

  function formatDate(date) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
  function mealsFor(date) { return state.meals.filter((meal) => meal.date === date).sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]); }
  function handoffsFor(date) { return state.handoffs.filter((item) => item.due_date === date).sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || a.title.localeCompare(b.title)); }

  function renderTabs() {
    byId("dayTabs").replaceChildren(...dates().map((day) => {
      const button = element("button"); button.type = "button"; button.role = "tab"; button.dataset.date = day.date;
      button.classList.toggle("is-active", day.date === selectedDate); button.setAttribute("aria-selected", String(day.date === selectedDate));
      button.append(element("b", "", day.label.slice(0, 3)), element("span", "", formatDate(day.date))); return button;
    }));
  }

  function mealCard(meal) {
    const article = element("article", "wfm-meal");
    article.append(element("span", "wfm-slot", SLOT_LABELS[meal.slot]));
    const copy = element("div", "wfm-copy");
    copy.append(element("strong", "", meal.title));
    const details = [person(meal.lead_person_id)?.name, meal.note].filter(Boolean).join(" · ");
    if (details) copy.append(element("span", "", details));
    const actions = element("div", "wfm-actions");
    [["Edit", "edit-meal"], ["Prep step", "prep-meal"], ["Remove", "remove-meal"]].forEach(([label, action]) => {
      const button = element("button", action === "remove-meal" ? "is-remove" : "", label); button.type = "button"; button.dataset.action = action; button.dataset.mealId = meal.id; actions.append(button);
    });
    article.append(copy, actions); return article;
  }

  function handoffCard(item) {
    const article = element("article", `wfm-handoff${item.status === "completed" ? " is-done" : ""}`);
    const check = element("button", "wfm-check", "✓"); check.type = "button"; check.dataset.action = item.status === "completed" ? "undo-handoff" : "complete-handoff"; check.dataset.handoffId = item.id;
    check.setAttribute("aria-label", item.status === "completed" ? `Restore ${item.title}` : `Complete ${item.title}`);
    const copy = element("div", "wfm-copy"); copy.append(element("strong", "", item.title));
    const assigned = person(item.assigned_person_id); const details = element("span", "", `${KIND_LABELS[item.kind]} · ${TIME_LABELS[item.time_of_day]}`);
    if (assigned) { details.append(document.createTextNode(" · ")); const name = element("span", "wfm-person", assigned.name); const dot = element("i"); dot.style.setProperty("--person", assigned.color); name.prepend(dot); details.append(name); }
    copy.append(details);
    const actions = element("div", "wfm-actions"); const remove = element("button", "is-remove", "Remove"); remove.type = "button"; remove.dataset.action = "remove-handoff"; remove.dataset.handoffId = item.id; actions.append(remove);
    article.append(check, copy, actions); return article;
  }

  function renderDay() {
    const day = dates().find((row) => row.date === selectedDate) || dates()[0];
    byId("dayTitle").textContent = `${day.date === state.today ? "Today’s" : `${day.label}’s`} meals`;
    const meals = mealsFor(day.date); const handoffs = handoffsFor(day.date);
    byId("dayMeals").replaceChildren(...(meals.length ? meals.map(mealCard) : [empty("No meal is planned here. An open night can be a plan too.")]));
    byId("dayHandoffs").replaceChildren(...(handoffs.length ? handoffs.map(handoffCard) : [empty("No shopping or preparation step is waiting for this day.")]));
  }

  function renderWeek() {
    byId("weekMeals").replaceChildren(...dates().map((day) => {
      const row = element("div", "wfm-week-row"); const planned = mealsFor(day.date); const dinner = planned.find((meal) => meal.slot === "dinner");
      row.append(element("b", "", `${day.label.slice(0, 3)} ${formatDate(day.date)}`), element("span", "", dinner ? dinner.title : planned.length ? planned.map((meal) => meal.title).join(" · ") : "Open")); return row;
    }));
  }

  function renderSummary() {
    const weekDates = new Set(dates().map((day) => day.date));
    byId("plannedCount").textContent = String(state.meals.filter((meal) => weekDates.has(meal.date)).length);
    byId("todayStepCount").textContent = String(state.handoffs.filter((item) => item.due_date === state.today && item.status === "open").length);
    byId("openHandoffCount").textContent = String(state.handoffs.filter((item) => item.status === "open").length);
    byId("completedHandoffCount").textContent = String(state.handoffs.filter((item) => weekDates.has(item.due_date) && item.status === "completed").length);
  }

  function renderRelatedMeals() {
    const select = byId("handoffForm").elements.meal_id; const current = select.value;
    select.replaceChildren(new Option("General meal task", ""), ...state.meals.slice().sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]).map((meal) => new Option(`${formatDate(meal.date)} · ${SLOT_LABELS[meal.slot]} · ${meal.title}`, meal.id)));
    select.value = state.meals.some((meal) => meal.id === current) ? current : "";
  }

  function render() { renderTabs(); renderDay(); renderWeek(); renderSummary(); renderRelatedMeals(); }

  function closeEditors() { byId("mealEditor").hidden = true; byId("handoffEditor").hidden = true; }
  function openMeal(meal = null, date = selectedDate) {
    closeEditors(); const form = byId("mealForm"); form.reset(); form.elements.meal_id.value = meal?.id || ""; form.elements.date.value = meal?.date || date; form.elements.slot.value = meal?.slot || "dinner"; form.elements.title.value = meal?.title || ""; form.elements.lead_person_id.value = meal?.lead_person_id || ""; form.elements.note.value = meal?.note || "";
    byId("mealEditorEyebrow").textContent = meal ? "Edit meal" : "Plan one meal"; byId("mealEditorTitle").textContent = meal ? meal.title : "What will make this day easier?"; byId("saveMealButton").textContent = meal ? "Save changes" : "Plan meal"; byId("mealFormStatus").textContent = ""; byId("mealEditor").hidden = false; byId("mealEditor").scrollIntoView({ behavior: "smooth", block: "start" }); form.elements.title.focus({ preventScroll: true });
  }
  function openHandoff(meal = null, date = selectedDate) {
    closeEditors(); const form = byId("handoffForm"); form.reset(); form.elements.due_date.value = meal?.date || date; form.elements.meal_id.value = meal?.id || ""; byId("handoffFormStatus").textContent = ""; byId("handoffEditorTitle").textContent = meal ? `Prepare for ${meal.title}.` : "Make the hidden step visible."; byId("handoffEditor").hidden = false; byId("handoffEditor").scrollIntoView({ behavior: "smooth", block: "start" }); form.elements.title.focus({ preventScroll: true });
  }

  async function persist(message, previous) {
    if (saving) { setStatus("Finishing the previous meal change…"); return false; }
    saving = true; setStatus("Saving…");
    try {
      state = await jsonRequest(config.stateUrl, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify({ revision: state.revision, meals: state.meals, handoffs: state.handoffs }) });
      render(); setStatus(message); return true;
    } catch (error) {
      state = previous;
      if (error.status === 409) { try { state = await jsonRequest(config.stateUrl); } catch (_refreshError) { /* keep last known-good state */ } }
      render(); setStatus(error.status === 409 ? "Meals changed in another browser. We refreshed before overwriting anything." : error.message, true); return false;
    } finally { saving = false; }
  }

  async function submitMeal(event) {
    event.preventDefault(); if (saving) return; const form = event.currentTarget; const data = new FormData(form); const id = String(data.get("meal_id") || ""); const existing = state.meals.find((meal) => meal.id === id); const date = String(data.get("date")); const slot = String(data.get("slot"));
    if (state.meals.some((meal) => meal.id !== id && meal.date === date && meal.slot === slot)) { const status = byId("mealFormStatus"); status.textContent = `${SLOT_LABELS[slot]} already has a meal on that day.`; status.classList.add("is-error"); return; }
    const previous = structuredClone(state); const timestamp = nowIso(); const meal = { id: id || newId("meal"), date, slot, title: String(data.get("title")).trim().replace(/\s+/g, " "), lead_person_id: String(data.get("lead_person_id") || "") || null, note: String(data.get("note") || "").trim().replace(/\s+/g, " ") || null, created_at: existing?.created_at || timestamp, updated_at: timestamp };
    if (existing) state.meals = state.meals.map((item) => item.id === id ? meal : item); else state.meals.push(meal); selectedDate = date; closeEditors(); render(); await persist(existing ? "Meal updated" : "Meal planned", previous);
  }

  async function submitHandoff(event) {
    event.preventDefault(); if (saving) return; const data = new FormData(event.currentTarget); const previous = structuredClone(state); const timestamp = nowIso(); const handoff = { id: newId("meal-step"), title: String(data.get("title")).trim().replace(/\s+/g, " "), kind: String(data.get("kind")), assigned_person_id: String(data.get("assigned_person_id")), due_date: String(data.get("due_date")), time_of_day: String(data.get("time_of_day")), meal_id: String(data.get("meal_id") || "") || null, status: "open", created_at: timestamp, updated_at: timestamp, completed_at: null };
    state.handoffs.push(handoff); selectedDate = handoff.due_date; closeEditors(); render(); await persist("Meal handoff added", previous);
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-action]"); if (!button || saving) return; const { action } = button.dataset;
    if (button.dataset.mealId) {
      const meal = state.meals.find((item) => item.id === button.dataset.mealId); if (!meal) return;
      if (action === "edit-meal") { openMeal(meal); return; } if (action === "prep-meal") { openHandoff(meal); return; }
      if (!window.confirm(`Remove “${meal.title}”? Its prep steps will remain.`)) return;
      const previous = structuredClone(state); state.meals = state.meals.filter((item) => item.id !== meal.id); state.handoffs.forEach((item) => { if (item.meal_id === meal.id) item.meal_id = null; }); render(); await persist("Meal removed; its handoffs remain", previous); return;
    }
    const handoff = state.handoffs.find((item) => item.id === button.dataset.handoffId); if (!handoff) return;
    if (action === "remove-handoff" && !window.confirm(`Remove “${handoff.title}”?`)) return;
    const previous = structuredClone(state); const timestamp = nowIso();
    if (action === "remove-handoff") state.handoffs = state.handoffs.filter((item) => item.id !== handoff.id);
    else { handoff.status = action === "complete-handoff" ? "completed" : "open"; handoff.completed_at = handoff.status === "completed" ? timestamp : null; handoff.updated_at = timestamp; }
    render(); await persist(action === "remove-handoff" ? "Meal handoff removed" : handoff.status === "completed" ? "Meal handoff completed" : "Meal handoff restored", previous);
  }

  function populateForms() {
    const people = state.family.people; const mealLead = byId("mealForm").elements.lead_person_id; mealLead.replaceChildren(new Option("Not decided", ""), ...people.map((item) => new Option(item.name, item.id)));
    byId("handoffForm").elements.assigned_person_id.replaceChildren(...people.map((item) => new Option(item.name, item.id)));
    [byId("mealForm").elements.date, byId("handoffForm").elements.due_date].forEach((select) => select.replaceChildren(...dates().map((day) => new Option(`${day.label} · ${formatDate(day.date)}`, day.date))));
  }

  async function load() {
    byId("mealsLoading").hidden = false; byId("mealsError").hidden = true; byId("mealsApp").hidden = true;
    try {
      state = await jsonRequest(config.stateUrl); selectedDate = dates().some((day) => day.date === state.today) ? state.today : state.week_start; populateForms(); byId("mealsGreeting").textContent = state.family.configured ? `${state.family.name} · name the meal, then share only the preparation that matters.` : "Set up the family first, then give meals and their preparation a clear owner."; byId("setupNotice").hidden = state.family.configured; byId("showMealForm").disabled = !state.family.configured; byId("showHandoffForm").disabled = !state.family.configured; render(); byId("mealsLoading").hidden = true; byId("mealsApp").hidden = false;
    } catch (error) { byId("mealsLoading").hidden = true; byId("mealsErrorMessage").textContent = error.message; byId("mealsError").hidden = false; }
  }

  byId("showMealForm").addEventListener("click", () => openMeal()); byId("showHandoffForm").addEventListener("click", () => openHandoff()); byId("addForDay").addEventListener("click", () => openMeal()); byId("addStepForDay").addEventListener("click", () => openHandoff());
  document.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", closeEditors)); byId("mealForm").addEventListener("submit", submitMeal); byId("handoffForm").addEventListener("submit", submitHandoff); byId("mealsApp").addEventListener("click", handleAction);
  byId("dayTabs").addEventListener("click", (event) => { const button = event.target.closest("button[data-date]"); if (!button) return; selectedDate = button.dataset.date; renderTabs(); renderDay(); }); byId("retryButton").addEventListener("click", load); load();
})();
