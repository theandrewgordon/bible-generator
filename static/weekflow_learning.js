(() => {
  const config = window.WEEKFLOW_LEARNING_CONFIG;
  const byId = (id) => document.getElementById(id);
  const DAYS = ["mon", "tue", "wed", "thu", "fri"];
  const COLORS = ["#6657d9", "#d45e86", "#168a80", "#3d7fba"];
  let learning = null;
  let todayState = null;
  let selectedDay = "mon";
  let selectedKid = null;
  let savingLearning = false;
  let savingToday = false;
  let savingHousehold = false;
  let savingMeals = false;
  let savingTravel = false;

  function setStatus(message, error = false) {
    const element = byId("learningSaveStatus");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", error);
  }

  function safeId(prefix) {
    const value = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function currentWeekMonday(isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    const weekday = date.getUTCDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function initialDay(isoDate) {
    const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
    return DAYS[weekday >= 1 && weekday <= 5 ? weekday - 1 : 0];
  }

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Please try again.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function familyPeople() {
    const statePeople = [
      ...Object.entries(learning.family.adults).map(([id, person]) => ({ id, ...person, role: "adult" })),
      ...Object.entries(learning.family.students).map(([id, person]) => ({ id, ...person, role: "student" })),
    ];
    const todayPeople = todayState?.family?.people || [];
    const stateIds = new Set(statePeople.map((person) => person.id));
    if (todayPeople.length === statePeople.length && todayPeople.every((person) => stateIds.has(person.id))) {
      return todayPeople;
    }
    return statePeople;
  }

  function students() {
    return familyPeople().filter((person) => person.role === "student");
  }

  function adults() {
    return familyPeople().filter((person) => person.role === "adult");
  }

  function person(personId) {
    return familyPeople().find((candidate) => candidate.id === personId);
  }

  function createEmpty(text) {
    const empty = document.createElement("div");
    empty.className = "wfl-empty";
    empty.textContent = text;
    return empty;
  }

  function meta(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  function button(label, action, itemId, className = "") {
    const result = document.createElement("button");
    result.type = "button";
    result.textContent = label;
    result.dataset.action = action;
    result.dataset.itemId = itemId;
    if (className) result.className = className;
    return result;
  }

  function assignmentCard(entry, { completed = false, childView = false } = {}) {
    const article = document.createElement("article");
    article.className = "wfl-assignment";
    article.dataset.taskId = entry.task_id;
    const check = button("✓", completed ? "restore-task" : "complete-task", entry.task_id, "wfl-check");
    check.setAttribute("aria-label", completed ? `Restore ${entry.title}` : `Complete ${entry.title}`);
    if (completed) {
      check.style.color = "#fff";
      check.style.borderColor = "#2d7561";
      check.style.background = "#2d7561";
    }

    const copy = document.createElement("div");
    copy.className = "wfl-assignment-copy";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    copy.appendChild(title);
    const details = document.createElement("div");
    details.className = "wfl-assignment-meta";
    details.appendChild(meta(entry.subject));
    if (!completed && entry.start) details.appendChild(meta(`${entry.start}–${entry.end}`));
    if (!childView && entry.student_names?.length) details.appendChild(meta(entry.student_names.join(" + ")));
    if (entry.parent_minutes) details.appendChild(meta(`${entry.parent_minutes} min with parent`));
    if (entry.late) details.appendChild(meta("Past preferred deadline"));
    if (completed) details.appendChild(meta(entry.detail || "Completed"));
    copy.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "wfl-assignment-actions";
    actions.appendChild(button(completed ? "Undo" : "Done", completed ? "restore-task" : "complete-task", entry.task_id));
    if (!childView && config.mode === "homeschool") {
      actions.appendChild(button("Remove", "remove-task", entry.task_id, "is-remove"));
    }
    article.append(check, copy, actions);
    return article;
  }

  function selectedDayRow() {
    return learning.plan.days.find((day) => day.id === selectedDay) || learning.plan.days[0];
  }

  function selectedCalendarDate() {
    const row = selectedDayRow();
    if (row.date) return row.date;
    const monday = new Date(`${currentWeekMonday(todayState.today)}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + Math.max(0, DAYS.indexOf(row.id)));
    return monday.toISOString().slice(0, 10);
  }

  function renderDayTabs() {
    const tabs = byId("dayTabs");
    tabs.replaceChildren(...learning.plan.days.map((day) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.role = "tab";
      tab.dataset.day = day.id;
      tab.classList.toggle("is-active", day.id === selectedDay);
      tab.setAttribute("aria-selected", String(day.id === selectedDay));
      const label = document.createTextNode(day.label.slice(0, 3));
      const count = document.createElement("span");
      count.textContent = `${day.entries.length} item${day.entries.length === 1 ? "" : "s"}`;
      tab.append(label, count);
      return tab;
    }));
  }

  function renderWarning() {
    const panel = byId("planWarning");
    const warning = learning.plan.warnings[0];
    panel.hidden = !warning;
    panel.replaceChildren();
    if (!warning) return;
    const title = document.createElement("strong");
    title.textContent = warning.title;
    const body = document.createElement("p");
    body.textContent = warning.body;
    panel.append(title, body);
  }

  function renderParentHelp() {
    const day = selectedDayRow();
    const moments = day.entries.flatMap((entry) => entry.phases
      .filter((phase) => phase.resource !== "student")
      .map((phase) => ({ ...phase, entry }))
    ).sort((left, right) => left.start_minute - right.start_minute);
    byId("selectedDayParentTime").textContent = `${moments.reduce((sum, moment) => sum + moment.minutes, 0)} minutes`;
    const list = byId("parentHelpList");
    if (!moments.length) {
      list.replaceChildren(createEmpty("No scheduled parent-led phases on this day."));
      return;
    }
    list.replaceChildren(...moments.map((moment) => {
      const article = document.createElement("article");
      article.className = "wfl-help-item";
      const time = document.createElement("time");
      time.textContent = moment.start;
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = moment.entry.title;
      const detail = document.createElement("p");
      const adult = person(moment.resource);
      detail.textContent = `${moment.label} · ${moment.entry.student_names.join(" + ")}${adult ? ` · ${adult.name}` : ""}`;
      copy.append(title, detail);
      const duration = document.createElement("span");
      duration.textContent = `${moment.minutes} min`;
      article.append(time, copy, duration);
      return article;
    }));
  }

  function renderHomeschool() {
    byId("homeschoolGreeting").textContent = `${learning.family.name} · one plan around the attention available.`;
    byId("assignmentCount").textContent = String(learning.plan.total_count);
    byId("completedCount").textContent = String(learning.plan.completed_count);
    byId("parentMinutes").textContent = `${learning.plan.metrics.parent_demand}m`;
    const clear = learning.plan.feasibility.deadline_feasible;
    byId("planStatus").textContent = clear ? "Clear" : "Needs a choice";
    byId("planStatus").classList.toggle("is-error", !clear);
    byId("planStatusDetail").textContent = clear ? "everything fits" : "review the warning";
    renderDayTabs();
    renderWarning();
    renderParentHelp();
    const day = selectedDayRow();
    byId("dayAssignmentCount").textContent = `${day.entries.length} assignment${day.entries.length === 1 ? "" : "s"}`;
    byId("learningDayTitle").textContent = `${day.label} learning plan`;
    const list = byId("learningDayList");
    list.replaceChildren(...(day.entries.length
      ? day.entries.map((entry) => assignmentCard(entry))
      : [createEmpty("No schoolwork is scheduled on this day.")]
    ));
    const completed = byId("completedAssignmentsSection");
    completed.hidden = learning.plan.completed.length === 0;
    byId("completedAssignments").replaceChildren(...learning.plan.completed.map((entry) => assignmentCard(entry, { completed: true })));
    renderStudentPicker();
  }

  function taskTotalsForKid(studentId) {
    const tasks = learning.scenario.tasks.filter((task) => task.student_ids.includes(studentId));
    const completedIds = new Set(learning.scenario.completed_task_ids);
    return {
      tasks,
      completed: tasks.filter((task) => completedIds.has(task.id)).length,
      parent: tasks.reduce((sum, task) => sum + task.phases.filter((phase) => phase.resource !== "student").reduce((phaseSum, phase) => phaseSum + phase.minutes, 0), 0),
      independent: tasks.reduce((sum, task) => sum + task.phases.filter((phase) => phase.resource === "student").reduce((phaseSum, phase) => phaseSum + phase.minutes, 0), 0),
    };
  }

  function renderKidTabs() {
    const tabs = byId("kidTabs");
    tabs.replaceChildren(...students().map((student) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.role = "tab";
      tab.dataset.kidId = student.id;
      tab.style.setProperty("--person", student.color);
      tab.classList.toggle("is-active", student.id === selectedKid);
      tab.setAttribute("aria-selected", String(student.id === selectedKid));
      const dot = document.createElement("i");
      tab.append(dot, document.createTextNode(student.name));
      return tab;
    }));
  }

  function responsibilityCard(item) {
    const article = document.createElement("article");
    article.className = "wfl-assignment";
    const action = item.source === "household" ? "complete-household" : item.source === "meals" ? "complete-meal" : item.source === "travel" ? "complete-travel" : "complete-responsibility";
    const check = button("✓", action, item.id, "wfl-check");
    check.setAttribute("aria-label", `Complete ${item.title}`);
    const copy = document.createElement("div");
    copy.className = "wfl-assignment-copy";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const details = document.createElement("div");
    details.className = "wfl-assignment-meta";
    details.appendChild(meta(item.source === "household" ? "Household routine" : item.source === "meals" ? (item.kind === "shopping" ? "Meal shopping" : item.kind === "prep" ? "Meal preparation" : "Meal step") : item.source === "travel" ? ({ packing: "Packing", booking: "Booking", hosting: "Hosting", errand: "Travel errand", other: "Travel preparation" }[item.kind] || "Travel preparation") : item.area === "kids" ? "Kids" : item.area.charAt(0).toUpperCase() + item.area.slice(1)));
    if (item.time_of_day) details.appendChild(meta(item.time_of_day === "anytime" ? "Any time" : item.time_of_day.charAt(0).toUpperCase() + item.time_of_day.slice(1)));
    if (item.due_date) details.appendChild(meta(item.due_date === todayState.today ? "Due today" : `Due ${item.due_date}`));
    if (item.status === "waiting") details.appendChild(meta("Waiting"));
    copy.append(title, details);
    const actions = document.createElement("div");
    actions.className = "wfl-assignment-actions";
    actions.appendChild(button("Done", action, item.id));
    article.append(check, copy, actions);
    return article;
  }

  function renderKids() {
    const allStudents = students();
    if (!selectedKid || !allStudents.some((student) => student.id === selectedKid)) selectedKid = allStudents[0]?.id;
    renderKidTabs();
    renderDayTabs();
    const student = person(selectedKid);
    if (!student) return;
    byId("kidsGreeting").textContent = `${learning.family.name} · learning and family responsibilities together.`;
    const header = byId("selectedKidHeader");
    const name = document.createElement("h2");
    name.textContent = student.name;
    const sub = document.createElement("p");
    sub.textContent = "A child-sized view from the shared family plan—not another calendar to maintain.";
    header.replaceChildren(name, sub);
    const totals = taskTotalsForKid(student.id);
    byId("kidAssignmentCount").textContent = String(totals.tasks.length);
    byId("kidCompletedCount").textContent = String(totals.completed);
    byId("kidParentMinutes").textContent = `${totals.parent}m`;
    byId("kidIndependentMinutes").textContent = `${totals.independent}m`;
    const day = selectedDayRow();
    const dayDate = selectedCalendarDate();
    byId("kidLessonsTitle").textContent = `${student.name} on ${day.label}`;
    const lessons = day.entries.filter((entry) => entry.student_ids.includes(student.id));
    byId("kidLessonList").replaceChildren(...(lessons.length
      ? lessons.map((entry) => assignmentCard(entry, { childView: true }))
      : [createEmpty(`${student.name} has no scheduled lessons on ${day.label}.`)]
    ));
    const todayResponsibilities = todayState.items.filter((item) => item.assigned_person_id === student.id && item.status !== "completed");
    const householdResponsibilities = (todayState.household?.occurrences || [])
      .filter((item) => item.assigned_person_id === student.id && item.date === dayDate && !item.completed)
      .map((item) => ({ ...item, area: "home", status: "open", source: "household", due_date: item.date }));
    const mealResponsibilities = (todayState.meals?.handoffs || [])
      .filter((item) => item.assigned_person_id === student.id && item.due_date === dayDate && item.status !== "completed")
      .map((item) => ({ ...item, area: "meals", source: "meals" }));
    const travelResponsibilities = (todayState.travel?.handoffs || [])
      .filter((item) => item.assigned_person_id === student.id && item.due_date === dayDate && item.status !== "completed")
      .map((item) => ({ ...item, area: "travel", source: "travel" }));
    const responsibilities = [...householdResponsibilities, ...mealResponsibilities, ...travelResponsibilities, ...todayResponsibilities];
    byId("kidResponsibilityList").replaceChildren(...(responsibilities.length
      ? responsibilities.map(responsibilityCard)
      : [createEmpty(`No open family responsibilities are assigned to ${student.name}.`)]
    ));
  }

  function renderStudentPicker() {
    const container = byId("assignmentStudents");
    if (!container) return;
    container.replaceChildren(...students().map((student, index) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "student_id";
      input.value = student.id;
      input.checked = index === 0;
      label.append(input, document.createTextNode(student.name));
      return label;
    }));
  }

  function render() {
    if (config.mode === "homeschool") renderHomeschool();
    else renderKids();
  }

  async function saveLearning(message, fallback = null) {
    if (savingLearning) return false;
    savingLearning = true;
    const previous = fallback || JSON.parse(JSON.stringify(learning));
    setStatus("Rebuilding the family plan…");
    try {
      learning = await jsonRequest(config.stateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({
          revision: learning.revision,
          family: learning.family,
          scenario: learning.scenario,
          approved: false,
          updated_at: learning.updated_at,
        }),
      });
      render();
      setStatus(message);
      return true;
    } catch (error) {
      learning = previous;
      if (error.status === 409) {
        try {
          learning = await jsonRequest(config.stateUrl);
        } catch (_refreshError) {
          // Keep the last known-good local copy when the refresh also fails.
        }
      }
      render();
      setStatus(
        error.status === 409
          ? "This plan changed in another browser. We refreshed it so nothing gets overwritten."
          : error.message,
        true,
      );
      return false;
    } finally {
      savingLearning = false;
    }
  }

  async function saveTodayResponsibility(itemId) {
    if (savingToday) return;
    const item = todayState.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const previous = JSON.parse(JSON.stringify(todayState));
    const timestamp = new Date().toISOString();
    item.status = "completed";
    item.completed_at = timestamp;
    item.updated_at = timestamp;
    renderKids();
    savingToday = true;
    setStatus("Saving responsibility…");
    try {
      const saved = await jsonRequest(config.todayStateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ revision: todayState.revision, items: todayState.items }),
      });
      todayState = { ...todayState, ...saved };
      setStatus("Responsibility completed");
    } catch (error) {
      todayState = previous;
      renderKids();
      setStatus(error.message, true);
    } finally {
      savingToday = false;
    }
  }

  async function saveHouseholdResponsibility(itemId) {
    if (savingHousehold) return;
    const household = todayState.household;
    const item = household?.occurrences.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const previous = JSON.parse(JSON.stringify(household));
    household.completions[itemId] = new Date().toISOString();
    item.completed = true;
    item.completed_at = household.completions[itemId];
    renderKids();
    savingHousehold = true;
    setStatus("Saving household responsibility…");
    try {
      const saved = await jsonRequest(config.householdStateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ revision: household.revision, routines: household.routines, completions: household.completions }),
      });
      todayState.household = saved;
      setStatus("Household responsibility completed");
    } catch (error) {
      todayState.household = previous;
      renderKids();
      setStatus(error.message, true);
    } finally {
      savingHousehold = false;
    }
  }

  async function saveMealResponsibility(itemId) {
    if (savingMeals) return;
    const meals = todayState.meals;
    const item = meals?.handoffs.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const previous = JSON.parse(JSON.stringify(meals));
    const timestamp = new Date().toISOString();
    item.status = "completed"; item.completed_at = timestamp; item.updated_at = timestamp;
    renderKids(); savingMeals = true; setStatus("Saving meal handoff…");
    try {
      todayState.meals = await jsonRequest(config.mealsStateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ revision: meals.revision, meals: meals.meals, handoffs: meals.handoffs }),
      });
      setStatus("Meal handoff completed");
    } catch (error) {
      todayState.meals = previous; renderKids(); setStatus(error.message, true);
    } finally { savingMeals = false; }
  }

  async function saveTravelResponsibility(itemId) {
    if (savingTravel) return;
    const travel = todayState.travel; const item = travel?.handoffs.find((candidate) => candidate.id === itemId); if (!item) return;
    const previous = JSON.parse(JSON.stringify(travel)); const timestamp = new Date().toISOString(); item.status = "completed"; item.completed_at = timestamp; item.updated_at = timestamp;
    renderKids(); savingTravel = true; setStatus("Saving travel handoff…");
    try {
      todayState.travel = await jsonRequest(config.travelStateUrl, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify({ revision: travel.revision, plans: travel.plans, handoffs: travel.handoffs }) });
      setStatus("Travel handoff completed");
    } catch (error) { todayState.travel = previous; renderKids(); setStatus(error.message, true); } finally { savingTravel = false; }
  }

  function taskAction(event) {
    const target = event.target.closest("button[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const taskId = target.dataset.itemId;
    if (action === "complete-responsibility") {
      saveTodayResponsibility(taskId);
      return;
    }
    if (action === "complete-household") {
      saveHouseholdResponsibility(taskId);
      return;
    }
    if (action === "complete-meal") {
      saveMealResponsibility(taskId);
      return;
    }
    if (action === "complete-travel") {
      saveTravelResponsibility(taskId);
      return;
    }
    if (savingLearning) {
      setStatus("Finishing the previous plan change…");
      return;
    }
    const previous = JSON.parse(JSON.stringify(learning));
    if (action === "remove-task") {
      const task = learning.scenario.tasks.find((candidate) => candidate.id === taskId);
      if (!task || !window.confirm(`Remove “${task.title}” from this week?`)) return;
      learning.scenario.tasks = learning.scenario.tasks.filter((candidate) => candidate.id !== taskId);
      learning.scenario.completed_task_ids = learning.scenario.completed_task_ids.filter((id) => id !== taskId);
      saveLearning("Assignment removed", previous);
      return;
    }
    const completed = new Set(learning.scenario.completed_task_ids);
    if (action === "complete-task") completed.add(taskId);
    if (action === "restore-task") completed.delete(taskId);
    learning.scenario.completed_task_ids = [...completed];
    saveLearning(
      action === "complete-task" ? "Assignment completed" : "Assignment restored",
      previous,
    );
  }

  function setupFamily(event) {
    event.preventDefault();
    if (savingLearning) return;
    const previous = JSON.parse(JSON.stringify(learning));
    const form = new FormData(event.currentTarget);
    const childNames = form.getAll("child_name").map((name) => String(name).trim()).filter(Boolean);
    if (!childNames.length) return;
    const adultName = String(form.get("adult_name")).trim();
    const familyName = String(form.get("family_name")).trim();
    const adultId = "adult-1";
    const studentRows = childNames.map((name, index) => ({ id: `student-${index + 1}`, name, color: COLORS[index] }));
    const weekdays = Object.fromEntries(DAYS.map((day) => [day, 12 * 60 + 30]));
    const availability = { [adultId]: { ...weekdays } };
    studentRows.forEach((student) => { availability[student.id] = { ...weekdays }; });
    learning.family = {
      name: familyName,
      parent_label: adultName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      adults: { [adultId]: { name: adultName, color: "#d49a3a" } },
      students: Object.fromEntries(studentRows.map((student) => [student.id, { name: student.name, color: student.color }])),
    };
    learning.scenario = {
      schema_version: 2,
      household: { adults: [{ id: adultId, name: adultName, color: "#d49a3a" }], students: studentRows },
      week_start: currentWeekMonday(todayState.today),
      events: [],
      tasks: [],
      coop_monday: false,
      coop_credit_subjects: [],
      extended_days: [],
      availability_end: availability,
      disruptions: [],
      completed_task_ids: [],
      allow_next_week: true,
      deadline_policy: "strict",
    };
    const status = byId("familyFormStatus");
    status.textContent = "Creating your family plan…";
    saveLearning("Family plan created", previous).then((saved) => {
      if (!saved) {
        status.textContent = "We couldn’t save your family. Please try again.";
        status.classList.add("is-error");
        return;
      }
      byId("familyOnboarding").hidden = true;
      byId("learningApp").hidden = false;
      selectedKid = students()[0]?.id;
      render();
    });
  }

  function addAssignment(event) {
    event.preventDefault();
    if (savingLearning) {
      setStatus("Finishing the previous plan change…");
      return;
    }
    const previous = JSON.parse(JSON.stringify(learning));
    const assignmentForm = event.currentTarget;
    const form = new FormData(assignmentForm);
    const studentIds = form.getAll("student_id").map(String);
    const status = byId("assignmentStatus");
    if (!studentIds.length) {
      status.textContent = "Choose at least one child.";
      status.classList.add("is-error");
      return;
    }
    const minutes = Number(form.get("minutes"));
    const adultId = adults()[0].id;
    const help = form.get("help");
    let phases;
    if (help === "together") {
      phases = [{ label: "Learn together", minutes, resource: adultId }];
    } else if (help === "checkin") {
      phases = [
        { label: "Start together", minutes: 5, resource: adultId },
        { label: "Work independently", minutes: minutes - 10, resource: "student" },
        { label: "Check together", minutes: 5, resource: adultId },
      ];
    } else {
      phases = [{ label: "Work independently", minutes, resource: "student" }];
    }
    learning.scenario.tasks.push({
      id: safeId("task"),
      title: String(form.get("title")).trim(),
      subject: String(form.get("subject")).trim(),
      student_ids: studentIds,
      phases,
      due_day: Number(form.get("due_day")),
      priority: Number(form.get("priority")),
      preferred_start: null,
    });
    status.textContent = "Adding assignment…";
    status.classList.remove("is-error");
    saveLearning("Assignment added", previous).then((saved) => {
      if (!saved) return;
      assignmentForm.reset();
      byId("addAssignmentPanel").hidden = true;
      renderStudentPicker();
    });
  }

  async function load() {
    byId("learningLoading").hidden = false;
    byId("learningError").hidden = true;
    try {
      [learning, todayState] = await Promise.all([
        jsonRequest(config.stateUrl),
        jsonRequest(config.todayStateUrl),
      ]);
      selectedDay = initialDay(todayState.today);
      selectedKid = students()[0]?.id;
      byId("learningLoading").hidden = true;
      if (learning.revision === 0) {
        byId("familyOnboarding").hidden = false;
        byId("learningApp").hidden = true;
      } else {
        byId("familyOnboarding").hidden = true;
        byId("learningApp").hidden = false;
        render();
      }
    } catch (error) {
      byId("learningLoading").hidden = true;
      byId("learningErrorMessage").textContent = error.message;
      byId("learningError").hidden = false;
    }
  }

  byId("retryButton").addEventListener("click", load);
  byId("familyForm").addEventListener("submit", setupFamily);
  byId("learningApp").addEventListener("click", (event) => {
    const dayTab = event.target.closest("button[data-day]");
    if (dayTab) {
      selectedDay = dayTab.dataset.day;
      render();
      return;
    }
    const kidTab = event.target.closest("button[data-kid-id]");
    if (kidTab) {
      selectedKid = kidTab.dataset.kidId;
      renderKids();
      return;
    }
    taskAction(event);
  });
  if (config.mode === "homeschool") {
    byId("showAddAssignment").addEventListener("click", () => {
      byId("assignmentStatus").textContent = "";
      byId("addAssignmentPanel").hidden = false;
      byId("addAssignmentPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    byId("closeAddAssignment").addEventListener("click", () => { byId("addAssignmentPanel").hidden = true; });
    byId("assignmentForm").addEventListener("submit", addAssignment);
  }
  load();
})();
