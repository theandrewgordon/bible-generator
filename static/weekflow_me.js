(() => {
  const config = window.WEEKFLOW_ME_CONFIG;
  const byId = (id) => document.getElementById(id);
  const form = byId("personalForm");
  const adultPickerWrap = byId("adultPickerWrap");
  const adultPicker = byId("adultPicker");
  const AREA_LABELS = { inbox: "Today", homeschool: "Homeschool", kids: "Kids", schedule: "Schedule", home: "Household", meals: "Meals", medical: "Medical", travel: "Travel + guests", me: "Me" };
  const SOURCE_LABELS = { today: "Today", homeschool: "Homeschool", household: "Household", meals: "Meals", medical: "Medical", travel: "Travel + guests" };
  let state = null;
  let familyState = null;
  let primaryAdult = null;
  let saving = false;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function nowIso() { return new Date().toISOString(); }
  function newId() { return window.crypto?.randomUUID ? window.crypto.randomUUID() : `me-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function setStatus(text, error = false) { const node = byId("meSaveStatus"); node.textContent = text; node.classList.toggle("is-error", error); }
  async function jsonRequest(url, options = {}) { const response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(payload.error || "Please try again."); error.status = response.status; throw error; } return payload; }
  function dateLabel(value) { if (!value) return "No date"; if (value === state.today) return "Today"; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
  function sourceHref(item) { return config.sourceUrls[item.area] || config.sourceUrls[item.source === "household" ? "home" : item.source] || config.sourceUrls.inbox; }

  function personalItems() {
    return state.items.filter((item) => item.area === "me" && (!item.assigned_person_id || item.assigned_person_id === primaryAdult.id)).map((item) => ({ ...item, source: "today", personal: true }));
  }

  function familyItems() {
    const todayItems = state.items.filter((item) => item.area !== "me" && item.assigned_person_id === primaryAdult.id).map((item) => ({ ...item, source: "today" }));
    const householdItems = (state.household?.occurrences || []).filter((item) => item.assigned_person_id === primaryAdult.id).map((item) => ({ id: item.id, title: item.title, area: "home", source: "household", due_date: item.date, status: item.completed ? "completed" : "open", completed_at: item.completed_at, time_detail: `${item.time_of_day === "anytime" ? "Any time" : item.time_of_day[0].toUpperCase() + item.time_of_day.slice(1)} · ${item.estimated_minutes} min` }));
    const mealItems = (state.meals?.handoffs || []).filter((item) => item.assigned_person_id === primaryAdult.id).map((item) => ({ ...item, area: "meals", source: "meals", time_detail: item.time_of_day === "anytime" ? "Any time" : item.time_of_day[0].toUpperCase() + item.time_of_day.slice(1) }));
    const medicalItems = (state.medical?.items || []).filter((item) => item.assigned_person_id === primaryAdult.id).map((item) => ({ ...item, area: "medical", source: "medical", due_date: item.date, time_detail: [item.time, item.provider].filter(Boolean).join(" · ") }));
    const travelItems = (state.travel?.handoffs || []).filter((item) => item.assigned_person_id === primaryAdult.id).map((item) => ({ ...item, area: "travel", source: "travel", time_detail: item.time_of_day === "anytime" ? "Any time" : item.time_of_day[0].toUpperCase() + item.time_of_day.slice(1) }));
    const homeschoolItems = (state.homeschool?.parent_help || []).filter((item) => (item.phases || []).some((phase) => phase.resource === primaryAdult.id)).map((item) => ({ id: `homeschool-${item.task_id}-${item.day_id}`, title: item.title, area: "homeschool", source: "homeschool", due_date: state.today, status: "open", readOnly: true, time_detail: [`${item.start}–${item.end}`, (item.student_names || []).join(", ")].filter(Boolean).join(" · ") }));
    return [...todayItems, ...homeschoolItems, ...householdItems, ...mealItems, ...medicalItems, ...travelItems];
  }

  function allItems() { return [...personalItems(), ...familyItems()]; }
  function compareOpen(left, right) { const leftDate = left.due_date || "9999-12-31"; const rightDate = right.due_date || "9999-12-31"; if (leftDate !== rightDate) return leftDate.localeCompare(rightDate); const priorities = { high: 0, normal: 1, low: 2 }; return (priorities[left.priority] ?? 1) - (priorities[right.priority] ?? 1) || left.title.localeCompare(right.title); }
  function compareCompleted(left, right) { return String(right.completed_at || right.updated_at || "").localeCompare(String(left.completed_at || left.updated_at || "")); }

  function empty(title, body) { const node = element("div", "wfp-empty"); node.append(element("strong", "", title), document.createTextNode(body)); return node; }
  function actionButton(label, action, item) { const button = element("button", action === "remove" ? "is-remove" : "", label); button.type = "button"; button.dataset.action = action; button.dataset.itemId = item.id; button.dataset.source = item.source; return button; }
  function itemCard(item) {
    const completed = item.status === "completed";
    const article = element("article", "wft-item");
    const check = item.readOnly ? element("span", "wft-check", "→") : actionButton("✓", completed ? "undo" : "complete", item);
    check.className = "wft-check";
    if (!item.readOnly) check.setAttribute("aria-label", completed ? `Restore ${item.title}` : `Complete ${item.title}`);
    if (completed) { check.style.color = "#fff"; check.style.borderColor = "#2d7561"; check.style.background = "#2d7561"; }
    const copy = element("div", "wft-item-copy");
    copy.append(element("strong", "", item.title));
    const meta = element("div", "wft-item-meta");
    meta.append(element("span", "", item.personal ? "For me" : item.source === "today" ? AREA_LABELS[item.area] : SOURCE_LABELS[item.source] || AREA_LABELS[item.area]));
    if (item.due_date) meta.append(element("span", "", dateLabel(item.due_date)));
    if (item.time_detail) meta.append(element("span", "", item.time_detail));
    if (item.priority === "high") meta.append(element("span", "", "Important"));
    if (item.status === "waiting") meta.append(element("span", "", "Waiting"));
    if (item.source === "medical" && item.for_person_id !== primaryAdult.id) { const person = state.family.people.find((candidate) => candidate.id === item.for_person_id); if (person) meta.append(element("span", "", `For ${person.name}`)); }
    copy.append(meta);
    const actions = element("div", "wft-item-actions");
    if (!item.readOnly) actions.append(actionButton(completed ? "Undo" : "Done", completed ? "undo" : "complete", item));
    if (item.source === "today") {
      if (item.personal && !completed) actions.append(actionButton("Edit", "edit", item));
      if (!completed && item.status === "open") actions.append(actionButton("Wait", "wait", item));
      if (!completed && item.status === "waiting") actions.append(actionButton("Resume", "resume", item));
      if (item.personal) actions.append(actionButton("Remove", "remove", item));
    } else {
      const link = element("a", "wfp-source-link", "Open"); link.href = sourceHref(item); actions.append(link);
    }
    article.append(check, copy, actions);
    return article;
  }

  function render() {
    const personal = personalItems().filter((item) => item.status !== "completed").sort(compareOpen);
    const family = familyItems().filter((item) => item.status !== "completed").sort(compareOpen);
    const completed = allItems().filter((item) => item.status === "completed").sort(compareCompleted).slice(0, 8);
    byId("personalBadge").textContent = String(personal.length);
    byId("familyBadge").textContent = String(family.length);
    byId("completedBadge").textContent = String(completed.length);
    byId("personalList").replaceChildren(...(personal.length ? personal.map(itemCard) : [empty("Nothing is asking for your attention.", " This space can stay open.")]));
    byId("familyList").replaceChildren(...(family.length ? family.map(itemCard) : [empty("No family handoffs are assigned to you.", " The shared plan is clear.")]));
    byId("completedList").replaceChildren(...completed.map(itemCard));
    byId("completedSection").hidden = completed.length === 0;
    const open = [...personal, ...family];
    byId("dueTodayCount").textContent = String(open.filter((item) => item.due_date === state.today).length);
    byId("overdueCount").textContent = String(open.filter((item) => item.due_date && item.due_date < state.today).length);
    byId("upcomingCount").textContent = String(open.filter((item) => item.due_date && item.due_date > state.today).length);
    byId("waitingCount").textContent = String(open.filter((item) => item.status === "waiting").length);
    const warning = byId("meSourceWarning");
    const names = Object.keys(state.source_errors || {});
    warning.hidden = names.length === 0;
    warning.textContent = names.length ? `Some areas are temporarily unavailable: ${names.join(", ")}. Open those areas or try again.` : "";
  }

  function renderAdultPicker() {
    const adults = state.family.people.filter((person) => person.role === "adult");
    adultPicker.replaceChildren(...adults.map((person) => new Option(person.name, person.id)));
    adultPicker.value = primaryAdult?.id || "";
    adultPickerWrap.hidden = adults.length < 2;
  }

  async function changePrimaryAdult() {
    const nextId = adultPicker.value;
    if (!nextId || nextId === primaryAdult?.id || saving) return;
    if (!familyState) {
      try { familyState = await jsonRequest(config.familyStateUrl); }
      catch (error) { setStatus(error.message, true); renderAdultPicker(); return; }
    }
    const previous = clone(familyState);
    familyState.family.primary_adult_id = nextId;
    saving = true;
    setStatus("Saving your view…");
    try {
      familyState = await jsonRequest(config.familyStateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify(familyState),
      });
      primaryAdult = state.family.people.find((person) => person.id === nextId) || null;
      renderAdultPicker();
      render();
      setStatus("Your personal view is saved");
    } catch (error) {
      familyState = previous;
      renderAdultPicker();
      setStatus(error.message, true);
    } finally { saving = false; }
  }

  function resetForm() { form.reset(); form.elements.item_id.value = ""; byId("personalSubmit").textContent = "Add for me"; byId("cancelPersonalEdit").hidden = true; }
  function editItem(item) { form.elements.item_id.value = item.id; form.elements.title.value = item.title; form.elements.due_date.value = item.due_date || ""; form.elements.priority.value = item.priority; form.elements.status.value = item.status === "waiting" ? "waiting" : "open"; byId("personalDetails").open = true; byId("personalSubmit").textContent = "Save for me"; byId("cancelPersonalEdit").hidden = false; form.elements.title.focus(); form.scrollIntoView({ behavior: "smooth", block: "center" }); }

  async function saveToday(message, previous) {
    saving = true; setStatus("Saving…");
    try {
      const saved = await jsonRequest(config.stateUrl, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify({ revision: state.revision, items: state.items }) });
      state.revision = saved.revision; state.items = saved.items; state.updated_at = saved.updated_at; render(); setStatus(message);
    } catch (error) {
      state = previous;
      if (error.status === 409) { try { await load({ quiet: true }); } catch (_refreshError) { /* keep last known state */ } }
      render(); setStatus(error.status === 409 ? "This plan changed in another browser. We refreshed it before overwriting anything." : error.message, true);
    } finally { saving = false; }
  }

  async function submitPersonal(event) {
    event.preventDefault(); if (saving || !primaryAdult) return;
    const data = new FormData(form); const id = String(data.get("item_id") || ""); const existing = state.items.find((item) => item.id === id); const previous = clone(state); const timestamp = nowIso();
    const item = { id: id || newId(), title: String(data.get("title")).trim().replace(/\s+/g, " "), area: "me", assigned_person_id: primaryAdult.id, due_date: String(data.get("due_date") || "") || null, priority: String(data.get("priority")), status: String(data.get("status")), created_at: existing?.created_at || timestamp, updated_at: timestamp, completed_at: null };
    if (existing) state.items = state.items.map((candidate) => candidate.id === id ? item : candidate); else state.items.push(item);
    resetForm(); render(); await saveToday(existing ? "Personal reminder updated" : "Added to Things for Me", previous);
  }

  async function saveSourceItem(item, completed) {
    const previous = clone(state); const timestamp = nowIso(); let url; let body; let key = item.source;
    if (key === "household") { if (completed) state.household.completions[item.id] = timestamp; else delete state.household.completions[item.id]; const occurrence = state.household.occurrences.find((candidate) => candidate.id === item.id); if (occurrence) { occurrence.completed = completed; occurrence.completed_at = completed ? timestamp : null; } url = config.householdStateUrl; body = { revision: state.household.revision, routines: state.household.routines, completions: state.household.completions }; }
    if (key === "meals") { const target = state.meals.handoffs.find((candidate) => candidate.id === item.id); target.status = completed ? "completed" : "open"; target.completed_at = completed ? timestamp : null; target.updated_at = timestamp; url = config.mealsStateUrl; body = { revision: state.meals.revision, meals: state.meals.meals, handoffs: state.meals.handoffs }; }
    if (key === "medical") { const target = state.medical.items.find((candidate) => candidate.id === item.id); target.status = completed ? "completed" : "open"; target.completed_at = completed ? timestamp : null; target.updated_at = timestamp; url = config.medicalStateUrl; body = { revision: state.medical.revision, items: state.medical.items }; }
    if (key === "travel") { const target = state.travel.handoffs.find((candidate) => candidate.id === item.id); target.status = completed ? "completed" : "open"; target.completed_at = completed ? timestamp : null; target.updated_at = timestamp; url = config.travelStateUrl; body = { revision: state.travel.revision, plans: state.travel.plans, handoffs: state.travel.handoffs }; }
    render(); saving = true; setStatus("Saving…");
    try { state[key] = await jsonRequest(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify(body) }); render(); setStatus(completed ? "Responsibility completed" : "Responsibility restored"); }
    catch (error) { state = previous; if (error.status === 409) { try { await load({ quiet: true }); } catch (_refreshError) { /* keep last known state */ } } render(); setStatus(error.status === 409 ? "This plan changed in another browser. We refreshed it before overwriting anything." : error.message, true); }
    finally { saving = false; }
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-action]"); if (!button || saving) return;
    const item = allItems().find((candidate) => candidate.id === button.dataset.itemId && candidate.source === button.dataset.source); if (!item) return;
    const action = button.dataset.action;
    if (action === "edit") { editItem(item); return; }
    if (action === "remove" && !window.confirm(`Remove “${item.title}”?`)) return;
    if (item.source !== "today") { await saveSourceItem(item, action === "complete"); return; }
    const previous = clone(state); const target = state.items.find((candidate) => candidate.id === item.id); const timestamp = nowIso();
    if (action === "remove") state.items = state.items.filter((candidate) => candidate.id !== item.id);
    else if (action === "complete") { target.status = "completed"; target.completed_at = timestamp; target.updated_at = timestamp; }
    else { target.status = action === "wait" ? "waiting" : "open"; target.completed_at = null; target.updated_at = timestamp; }
    render(); await saveToday(action === "remove" ? "Personal reminder removed" : action === "complete" ? "Completed" : action === "wait" ? "Marked as waiting" : "Restored", previous);
  }

  async function load({ quiet = false } = {}) {
    if (!quiet) { byId("meLoading").hidden = false; byId("meError").hidden = true; byId("meApp").hidden = true; }
    try {
      state = await jsonRequest(config.stateUrl);
      familyState = null;
      const primaryId = state.family.primary_adult_id;
      primaryAdult = state.family.people.find((person) => person.id === primaryId && person.role === "adult")
        || state.family.people.find((person) => person.role === "adult") || null;
      if (!primaryAdult) throw new Error("Set up an adult in your WeekFlow family first.");
      byId("meGreeting").textContent = state.family.configured ? `${primaryAdult.name}, the plan should care for your attention too.` : "Set up the family first, then WeekFlow can gather what belongs to you.";
      byId("setupNotice").hidden = state.family.configured;
      byId("meWorkspace").hidden = !state.family.configured;
      form.querySelectorAll("input, select, button").forEach((control) => { control.disabled = !state.family.configured; });
      byId("focusQuickAdd").disabled = !state.family.configured;
      byId("focusQuickAdd").hidden = !state.family.configured;
      resetForm(); renderAdultPicker(); render();
      if (!quiet) { byId("meLoading").hidden = true; byId("meApp").hidden = false; }
    } catch (error) { if (!quiet) { byId("meLoading").hidden = true; byId("meErrorMessage").textContent = error.message; byId("meError").hidden = false; } throw error; }
  }

  form.addEventListener("submit", submitPersonal);
  byId("cancelPersonalEdit").addEventListener("click", resetForm);
  byId("focusQuickAdd").addEventListener("click", () => { form.elements.title.focus(); form.scrollIntoView({ behavior: "smooth", block: "center" }); });
  adultPicker.addEventListener("change", changePrimaryAdult);
  byId("meApp").addEventListener("click", handleAction);
  byId("retryButton").addEventListener("click", () => load().catch(() => {}));
  load().catch(() => {});
})();
