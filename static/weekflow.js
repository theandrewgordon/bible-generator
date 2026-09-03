(() => {
  const config = window.WEEKFLOW_CONFIG;
  const generateButton = document.querySelector("#generateButton");
  const explainButton = document.querySelector("#explainButton");
  const missButton = document.querySelector("#missButton");
  const rebalanceButton = document.querySelector("#rebalanceButton");
  const resetButton = document.querySelector("#resetButton");
  const emptyState = document.querySelector("#emptyState");
  const results = document.querySelector("#results");
  const statusBanner = document.querySelector("#statusBanner");
  const metrics = document.querySelector("#metrics");
  const completedPanel = document.querySelector("#completedPanel");
  const completedList = document.querySelector("#completedList");
  const resolutionPanel = document.querySelector("#resolutionPanel");
  const warningList = document.querySelector("#warningList");
  const recommendationList = document.querySelector("#recommendationList");
  const rolloverPanel = document.querySelector("#rolloverPanel");
  const rolloverList = document.querySelector("#rolloverList");
  const week = document.querySelector("#week");
  const scheduleTitle = document.querySelector("#scheduleTitle");
  const explanations = document.querySelector("#explanations");
  const explanationList = document.querySelector("#explanationList");
  const scenarioSummary = document.querySelector("#scenarioSummary");
  const planner = document.querySelector(".wf-planner");
  const eventEditors = document.querySelector("#eventEditors");
  const addEventButton = document.querySelector("#addEventButton");
  const allowNextWeek = document.querySelector("#allowNextWeek");
  const deadlinePolicy = document.querySelector("#deadlinePolicy");
  const tessaAheadButton = document.querySelector("#tessaAheadButton");
  const addTaskButton = document.querySelector("#addTaskButton");
  const clearAheadButton = document.querySelector("#clearAheadButton");
  const familyDisplayName = document.querySelector("#familyDisplayName");
  const saveStatus = document.querySelector("#saveStatus");
  const familySetupButton = document.querySelector("#familySetupButton");
  const saveButton = document.querySelector("#saveButton");
  const approveButton = document.querySelector("#approveButton");
  const undoButton = document.querySelector("#undoButton");
  const printButton = document.querySelector("#printButton");
  const calendarButton = document.querySelector("#calendarButton");
  const clearDraftButton = document.querySelector("#clearDraftButton");
  const deleteCloudButton = document.querySelector("#deleteCloudButton");
  const familyDialog = document.querySelector("#familyDialog");
  const familyForm = document.querySelector("#familyForm");
  const familyName = document.querySelector("#familyName");
  const familyTimezone = document.querySelector("#familyTimezone");
  const familyAdultEditors = document.querySelector("#familyAdultEditors");
  const familyStudentEditors = document.querySelector("#familyStudentEditors");
  const addAdultButton = document.querySelector("#addAdultButton");
  const addStudentButton = document.querySelector("#addStudentButton");
  const weekStart = document.querySelector("#weekStart");
  const feedbackForm = document.querySelector("#feedbackForm");
  const feedbackStatus = document.querySelector("#feedbackStatus");
  const historySelect = document.querySelector("#historySelect");
  const loadWeekButton = document.querySelector("#loadWeekButton");
  const templateSelect = document.querySelector("#templateSelect");
  const templateName = document.querySelector("#templateName");
  const applyTemplateButton = document.querySelector("#applyTemplateButton");
  const saveTemplateButton = document.querySelector("#saveTemplateButton");
  const deleteTemplateButton = document.querySelector("#deleteTemplateButton");
  const createRolloverButton = document.querySelector("#createRolloverButton");
  const calendarImport = document.querySelector("#calendarImport");
  const steps = Array.from(document.querySelectorAll(".wf-step"));

  const personColorPalette = ["#6657d9", "#d45e86", "#168a80", "#4776c5", "#a45c2f", "#7d5a9e", "#2c7a4b", "#b26b87"];

  let current = null;
  let previousSnapshot = null;
  let customEventSequence = 0;
  let saveTimer = null;
  let savedTemplates = [];
  const storageKey = "faithsparks:weekflow:beta:v2";
  let betaState = {
    schema_version: 1,
    revision: 0,
    family: {
      name: "Our homeschool",
      parent_label: "Parent",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      adults: Object.fromEntries(
        config.adults.map((adult) => [adult.id, { name: adult.name, color: adult.color }]),
      ),
      students: Object.fromEntries(
        config.students.map((student) => [student.id, { name: student.name, color: student.color }]),
      ),
    },
    scenario: config.defaultScenario,
    approved: false,
    updated_at: null,
  };

  const dayLabels = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
  };

  function minutesToTimeValue(minutes) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const remainder = String(minutes % 60).padStart(2, "0");
    return `${hours}:${remainder}`;
  }

  function timeValueToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function currentFamily() {
    return betaState.family;
  }

  function familyPeople(group) {
    return Object.entries(currentFamily()[group] || {}).map(([id, person]) => ({ id, ...person }));
  }

  function currentAdults() {
    return familyPeople("adults");
  }

  function currentStudents() {
    return familyPeople("students");
  }

  function availabilityPeople() {
    return [...currentAdults(), ...currentStudents()];
  }

  function primaryAdult() {
    return currentAdults()[0] || { id: "parent", name: currentFamily().parent_label || "Parent", color: "#d49a3a" };
  }

  function personalizeText(value) {
    let text = String(value ?? "");
    config.students.forEach((student) => {
      const replacement = currentFamily().students[student.id]?.name;
      if (replacement) text = text.replaceAll(student.name, replacement);
    });
    return text.replaceAll("Mom", primaryAdult().name).replaceAll("Parent", primaryAdult().name);
  }

  function normalizeClientFamily(family) {
    const adults = family.adults && Object.keys(family.adults).length
      ? family.adults
      : { parent: { name: family.parent_label || "Parent", color: "#d49a3a" } };
    return {
      ...family,
      parent_label: Object.values(adults)[0].name,
      adults,
    };
  }

  function appendFamilyPersonEditor(container, group, person, { removable = true } = {}) {
    const row = document.createElement("div");
    row.className = "wf-family-person";
    row.dataset.personId = person.id;
    row.dataset.personGroup = group;
    row.innerHTML = `<label><span>${group === "adults" ? "Teaching adult" : "Student"}</span><input maxlength="60" required /></label>${removable ? '<button class="wf-text-button wf-remove-person" type="button">Remove</button>' : ""}`;
    row.querySelector("input").value = person.name;
    row.querySelector(".wf-remove-person")?.addEventListener("click", () => {
      if (container.querySelectorAll(".wf-family-person").length === 1) {
        saveStatus.textContent = `WeekFlow needs at least one ${group === "adults" ? "teaching adult" : "student"}.`;
        return;
      }
      row.remove();
    });
    container.append(row);
  }

  function renderFamilyEditors(family) {
    familyAdultEditors.replaceChildren();
    familyStudentEditors.replaceChildren();
    Object.entries(family.adults).forEach(([id, person]) => appendFamilyPersonEditor(
      familyAdultEditors,
      "adults",
      { id, ...person },
      { removable: Object.keys(family.adults).length > 1 },
    ));
    Object.entries(family.students).forEach(([id, person]) => appendFamilyPersonEditor(
      familyStudentEditors,
      "students",
      { id, ...person },
      { removable: Object.keys(family.students).length > 1 },
    ));
  }

  function applyFamily(rawFamily) {
    const family = normalizeClientFamily(rawFamily);
    betaState.family = family;
    familyDisplayName.textContent = family.name;
    familyName.value = family.name;
    if (Array.from(familyTimezone.options).some((option) => option.value === family.timezone)) {
      familyTimezone.value = family.timezone;
    }
    renderFamilyEditors(family);
    tessaAheadButton.textContent = `Mark ${currentStudents()[0].name}'s independent work done`;
  }

  function renderAvailabilityMatrix(availabilityEnd = {}) {
    const matrix = document.querySelector("#availabilityMatrix");
    const header = document.createElement("div");
    header.className = "wf-matrix-row wf-matrix-header";
    header.setAttribute("role", "row");
    header.innerHTML = '<span role="columnheader">Person</span>' + Object.entries(dayLabels)
      .map(([, label]) => `<span role="columnheader">${label.slice(0, 3)}</span>`)
      .join("");
    matrix.replaceChildren(header);
    availabilityPeople().forEach((person) => {
      const row = document.createElement("div");
      row.className = "wf-matrix-row";
      row.setAttribute("role", "row");
      const heading = document.createElement("strong");
      heading.setAttribute("role", "rowheader");
      heading.textContent = person.name;
      row.append(heading);
      Object.entries(dayLabels).forEach(([dayId, dayLabel]) => {
        const label = document.createElement("label");
        const hidden = document.createElement("span");
        hidden.className = "wf-visually-hidden";
        hidden.textContent = `${person.name} ${dayLabel} availability ends`;
        const select = document.createElement("select");
        select.dataset.resource = person.id;
        select.dataset.day = dayId;
        config.availabilityEndOptions.forEach((choice) => {
          const option = document.createElement("option");
          option.value = choice.value;
          option.textContent = choice.label;
          select.append(option);
        });
        const fallback = person.id === currentStudents()[0]?.id && ["mon", "tue", "wed", "thu"].includes(dayId) ? 16 * 60 : 12 * 60 + 30;
        select.value = String(availabilityEnd[person.id]?.[dayId] ?? fallback);
        label.append(hidden, select);
        row.append(label);
      });
      matrix.append(row);
    });
  }

  function localSnapshot() {
    return {
      ...betaState,
      scenario: collectScenario(),
      current,
      updated_at: new Date().toISOString(),
    };
  }

  function persistLocal(message = "Draft saved on this device.") {
    betaState = localSnapshot();
    try {
      localStorage.setItem(storageKey, JSON.stringify(betaState));
      saveStatus.textContent = message;
    } catch {
      saveStatus.textContent = "This browser could not save the local draft.";
    }
  }

  function scheduleLocalSave() {
    window.clearTimeout(saveTimer);
    saveStatus.textContent = "Saving draft…";
    saveTimer = window.setTimeout(() => persistLocal(), 250);
  }

  function appendEventEditor(event, { enabled = true, removable = false } = {}) {
    const row = document.createElement("article");
    row.className = "wf-event-editor";
    row.dataset.eventId = event.id;
    row._weekflowEventDetail = event.detail || "Added in the WeekFlow event planner.";
    row.innerHTML = `
      <div class="wf-event-editor-head">
        <label class="wf-event-enabled-label"><input class="wf-event-enabled" type="checkbox" /> <span>Use event</span></label>
        <label class="wf-event-title-label"><span>Event name</span><input class="wf-event-title" type="text" maxlength="120" required /></label>
        ${removable ? '<button class="wf-text-button wf-remove-event" type="button">Remove</button>' : ""}
      </div>
      <div class="wf-event-editor-grid">
        <label><span>Day</span><select class="wf-event-day">
          ${Object.entries(dayLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
        </select></label>
        <label><span>Starts</span><input class="wf-event-start" type="time" step="300" required /></label>
        <label><span>Ends</span><input class="wf-event-end" type="time" step="300" required /></label>
        <label><span>Type</span><select class="wf-event-kind"><option value="commitment">Commitment</option><option value="disruption">Life change</option></select></label>
      </div>
      <fieldset class="wf-event-people"><legend>Affects</legend><div class="wf-chip-checks wf-event-affected"></div></fieldset>
      <div class="wf-event-meta">
        <label><input class="wf-event-recurring" type="checkbox" /> Repeats weekly</label>
        <div class="wf-event-credits"><span>Counts for</span><div class="wf-chip-checks"></div></div>
      </div>`;

    row.querySelector(".wf-event-enabled").checked = enabled;
    row.querySelector(".wf-event-title").value = event.title || "Family event";
    row.querySelector(".wf-event-day").value = event.day_id || "mon";
    row.querySelector(".wf-event-start").value = minutesToTimeValue(event.start_minute ?? 9 * 60);
    row.querySelector(".wf-event-end").value = minutesToTimeValue(event.end_minute ?? 12 * 60);
    row.querySelector(".wf-event-kind").value = event.kind || "disruption";
    row.querySelector(".wf-event-recurring").checked = Boolean(event.recurring);

    const people = availabilityPeople();
    const affected = new Set(event.affected || people.map((person) => person.id));
    const affectedGroup = row.querySelector(".wf-event-affected");
    people.forEach((person) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = person.id;
      input.checked = affected.has(person.id);
      label.append(input, document.createTextNode(` ${person.name}`));
      affectedGroup.append(label);
    });

    const credits = new Set(event.credit_subjects || []);
    const creditGroup = row.querySelector(".wf-event-credits .wf-chip-checks");
    config.creditSubjects.forEach((subject) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = subject;
      input.checked = credits.has(subject);
      label.append(input, document.createTextNode(` ${subject}`));
      creditGroup.append(label);
    });

    row.querySelector(".wf-remove-event")?.addEventListener("click", () => {
      row.remove();
      updateScenarioSummary();
      markPlanStale();
    });
    eventEditors.append(row);
  }

  function appendTaskEditor(task, { completed = false, isNew = false } = {}) {
    const row = document.createElement("article");
    row.className = "wf-task-editor";
    row.dataset.taskId = task.id;
    row.dataset.taskDirty = isNew ? "true" : "false";
    row._weekflowTask = structuredClone(task);
    const totalMinutes = task.phases.reduce((total, phase) => total + phase.minutes, 0);
    const parentMinutes = task.phases
      .filter((phase) => phase.resource !== "student")
      .reduce((total, phase) => total + phase.minutes, 0);
    const students = currentStudents();
    const adults = currentAdults();
    const studentChoice = task.student_ids.length === students.length ? "all" : task.student_ids[0];
    const requestedAdult = task.phases.find((phase) => phase.resource !== "student")?.resource;
    const adultChoice = adults.some((adult) => adult.id === requestedAdult) ? requestedAdult : adults[0].id;
    row.innerHTML = `
      <div class="wf-task-editor-head">
        <label class="wf-task-complete-label"><input class="wf-task-completed" type="checkbox" /> Done</label>
        <label><span>Assignment</span><input class="wf-task-title" maxlength="120" required /></label>
        <button class="wf-text-button wf-remove-task" type="button">Remove</button>
      </div>
      <div class="wf-task-editor-grid">
        <label><span>Subject</span><input class="wf-task-subject" maxlength="60" required /></label>
        <label><span>Student</span><select class="wf-task-student">
          ${students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join("")}
          <option value="all">Whole family</option>
        </select></label>
        <label><span>Total min</span><input class="wf-task-total" type="number" min="1" max="420" required /></label>
        <label><span>Adult min</span><input class="wf-task-parent" type="number" min="0" max="240" required /></label>
        <label><span>Teaching adult</span><select class="wf-task-adult">${adults.map((adult) => `<option value="${adult.id}">${escapeHtml(adult.name)}</option>`).join("")}</select></label>
        <label><span>Due</span><select class="wf-task-due">
          ${Object.entries(dayLabels).map(([value, label], index) => `<option value="${index}">${label}</option>`).join("")}
        </select></label>
        <label><span>Priority</span><select class="wf-task-priority"><option value="5">Must do</option><option value="3">Should do</option><option value="1">Flexible</option></select></label>
      </div>`;
    row.querySelector(".wf-task-completed").checked = completed;
    row.querySelector(".wf-task-title").value = task.title;
    row.querySelector(".wf-task-subject").value = task.subject;
    row.querySelector(".wf-task-student").value = studentChoice;
    row.querySelector(".wf-task-total").value = totalMinutes;
    row.querySelector(".wf-task-parent").value = parentMinutes;
    row.querySelector(".wf-task-adult").value = adultChoice;
    row.querySelector(".wf-task-due").value = String(task.due_day ?? 2);
    row.querySelector(".wf-task-priority").value = [1, 3, 5].includes(task.priority) ? String(task.priority) : task.priority >= 4 ? "5" : task.priority >= 2 ? "3" : "1";
    row.querySelectorAll("input:not(.wf-task-completed), select").forEach((input) => {
      input.addEventListener("change", () => { row.dataset.taskDirty = "true"; });
    });
    row.querySelector(".wf-remove-task").addEventListener("click", () => {
      if (document.querySelectorAll(".wf-task-editor").length === 1) {
        saveStatus.textContent = "WeekFlow needs at least one assignment.";
        return;
      }
      row.remove();
      updateScenarioSummary();
      markPlanStale();
    });
    document.querySelector("#aheadOptions").append(row);
  }

  function taskFromEditor(row) {
    if (row.dataset.taskDirty !== "true") return structuredClone(row._weekflowTask);
    const totalMinutes = Number(row.querySelector(".wf-task-total").value);
    const parentMinutes = Number(row.querySelector(".wf-task-parent").value);
    const studentValue = row.querySelector(".wf-task-student").value;
    const studentIds = studentValue === "all" ? currentStudents().map((student) => student.id) : [studentValue];
    const adultId = row.querySelector(".wf-task-adult").value;
    const phases = [];
    if (parentMinutes > 0) phases.push({ label: "Adult-guided work", minutes: Math.min(parentMinutes, totalMinutes), resource: adultId });
    if (totalMinutes > parentMinutes) phases.push({ label: "Independent work", minutes: totalMinutes - parentMinutes, resource: "student" });
    return {
      id: row.dataset.taskId,
      title: row.querySelector(".wf-task-title").value.trim(),
      subject: row.querySelector(".wf-task-subject").value.trim(),
      student_ids: studentIds,
      phases,
      due_day: Number(row.querySelector(".wf-task-due").value),
      priority: Number(row.querySelector(".wf-task-priority").value),
      preferred_start: null,
    };
  }

  function collectScenario() {
    const availabilityEnd = {};
    document.querySelectorAll("#availabilityMatrix select").forEach((select) => {
      availabilityEnd[select.dataset.resource] ||= {};
      availabilityEnd[select.dataset.resource][select.dataset.day] = Number(
        select.value,
      );
    });
    const leadStudentId = currentStudents()[0].id;
    const extendedDays = Object.entries(availabilityEnd[leadStudentId])
      .filter(([, end]) => end > 12 * 60 + 30)
      .map(([day]) => day);
    const events = Array.from(eventEditors.querySelectorAll(".wf-event-editor"))
      .filter((row) => row.querySelector(".wf-event-enabled").checked)
      .map((row) => ({
        id: row.dataset.eventId,
        title: row.querySelector(".wf-event-title").value.trim(),
        detail: row._weekflowEventDetail,
        day_id: row.querySelector(".wf-event-day").value,
        start_minute: timeValueToMinutes(row.querySelector(".wf-event-start").value),
        end_minute: timeValueToMinutes(row.querySelector(".wf-event-end").value),
        affected: Array.from(row.querySelectorAll(".wf-event-affected input:checked")).map((input) => input.value),
        kind: row.querySelector(".wf-event-kind").value,
        recurring: row.querySelector(".wf-event-recurring").checked,
        credit_subjects: Array.from(row.querySelectorAll(".wf-event-credits input:checked")).map((input) => input.value),
      }));
    const taskRows = Array.from(document.querySelectorAll(".wf-task-editor"));
    const tasks = taskRows.map(taskFromEditor);
    return {
      schema_version: 2,
      household: {
        adults: currentAdults(),
        students: currentStudents(),
      },
      week_start: weekStart.value || null,
      events,
      tasks,
      coop_monday: events.some((event) => event.id === "coop" && event.day_id === "mon"),
      coop_credit_subjects: events.flatMap((event) => event.credit_subjects),
      extended_days: extendedDays,
      availability_end: availabilityEnd,
      disruptions: events.filter((event) => event.kind === "disruption").map((event) => event.id),
      completed_task_ids: taskRows
        .filter((row) => row.querySelector(".wf-task-completed").checked)
        .map((row) => row.dataset.taskId),
      allow_next_week: allowNextWeek.checked,
      deadline_policy: deadlinePolicy.value,
    };
  }

  function validateScenario(scenario) {
    scenario.events.forEach((event) => {
      if (!event.title) throw new Error("Every enabled event needs a name.");
      if (!Number.isFinite(event.start_minute) || !Number.isFinite(event.end_minute) || event.end_minute <= event.start_minute) {
        throw new Error(`${event.title}: choose an end time after its start time.`);
      }
      if (!event.affected.length) throw new Error(`${event.title}: choose at least one affected person.`);
    });
    scenario.tasks.forEach((task) => {
      if (!task.title || !task.subject) throw new Error("Every assignment needs a title and subject.");
      const total = task.phases.reduce((sum, phase) => sum + phase.minutes, 0);
      if (!Number.isFinite(total) || total < 1 || total > 420) {
        throw new Error(`${task.title}: total time must be between 1 and 420 minutes.`);
      }
      if (!task.phases.length || task.phases.some((phase) => !Number.isFinite(phase.minutes) || phase.minutes < 1)) {
        throw new Error(`${task.title}: adult time cannot exceed total time.`);
      }
    });
    document.querySelectorAll(".wf-task-editor").forEach((row) => {
      const total = Number(row.querySelector(".wf-task-total").value);
      const parent = Number(row.querySelector(".wf-task-parent").value);
      if (parent < 0 || parent > total) {
        throw new Error(`${row.querySelector(".wf-task-title").value || "Assignment"}: adult time cannot exceed total time.`);
      }
    });
  }

  function applyScenario(scenario) {
    if (scenario.week_start) {
      weekStart.value = scenario.week_start;
    } else {
      const monday = startOfCurrentWeek();
      weekStart.value = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    }
    allowNextWeek.checked = scenario.allow_next_week;
    deadlinePolicy.value = scenario.deadline_policy;
    const taskContainer = document.querySelector("#aheadOptions");
    taskContainer.replaceChildren();
    const completedIds = new Set(scenario.completed_task_ids || []);
    (scenario.tasks || config.defaultScenario.tasks).forEach((task) => {
      appendTaskEditor(task, { completed: completedIds.has(task.id) });
    });
    renderAvailabilityMatrix(scenario.availability_end);
    document.querySelectorAll("#availabilityMatrix select").forEach((select) => {
      select.value = String(
        scenario.availability_end[select.dataset.resource][select.dataset.day],
      );
    });
    eventEditors.replaceChildren();
    const scenarioEvents = scenario.events || [];
    const eventsById = new Map(scenarioEvents.map((event) => [event.id, event]));
    config.eventPresets.forEach((preset) => {
      appendEventEditor(eventsById.get(preset.id) || preset, {
        enabled: eventsById.has(preset.id),
      });
    });
    scenarioEvents
      .filter((event) => !config.eventPresets.some((preset) => preset.id === event.id))
      .forEach((event) => appendEventEditor(event, { enabled: true, removable: true }));
  }

  function updateScenarioSummary() {
    const scenario = collectScenario();
    const parts = [];
    parts.push(`${scenario.tasks.length} assignment${scenario.tasks.length === 1 ? "" : "s"}`);
    scenario.events.forEach((event) => parts.push(`${event.title} ${dayLabels[event.day_id]}`));
    if (scenario.extended_days.length) {
      const days = scenario.extended_days.map(
        (day) => day[0].toUpperCase() + day.slice(1),
      );
      parts.push(`Tessa until 4 on ${days.join(", ")}`);
    }
    if (scenario.completed_task_ids.length) {
      parts.push(
        `${scenario.completed_task_ids.length} assignment${scenario.completed_task_ids.length === 1 ? "" : "s"} already done`,
      );
    }
    if (scenario.deadline_policy === "essentials") {
      parts.push("essential deadlines protected");
    } else if (scenario.deadline_policy === "balanced") {
      parts.push("balanced through Friday");
    }
    const customAvailability = Object.entries(scenario.availability_end).some(
      ([resource, days]) =>
        resource !== "tessa" && Object.values(days).some((end) => end !== 12 * 60 + 30),
    );
    if (customAvailability) parts.push("custom family availability");
    scenarioSummary.textContent = parts.length
      ? parts.join(" · ")
      : "Standard morning schedule with no added events.";
  }

  function markPlanStale() {
    setStep(2);
    betaState.approved = false;
    approveButton.textContent = "Approve week";
    scheduleLocalSave();
    if (!current) return;
    statusBanner.classList.add("is-disrupted");
    statusBanner.innerHTML = `
      <strong>The planning inputs changed.</strong>
      <span>Optimize again to replace the displayed schedule with one that honors the new week.</span>`;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function setStep(active) {
    steps.forEach((step, index) => {
      step.classList.toggle("is-active", index + 1 === active);
    });
  }

  function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${remainder} min`;
    if (!remainder) return `${hours} hr`;
    return `${hours} hr ${remainder} min`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function metricCard(label, value, note, danger = false) {
    return `
      <article class="wf-metric${danger ? " is-danger" : ""}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </article>`;
  }

  function renderMetrics(data) {
    const parent = data.metrics;
    const allStudentsFit = Object.values(parent.students).every(
      (student) => student.shortfall === 0,
    );
    const accountedFor = data.scheduled_count + data.completed_count;
    metrics.innerHTML = [
      metricCard(
        "Assignments",
        `${accountedFor}/${data.total_count}`,
        data.completed_count
          ? `${data.completed_count} already satisfied · ${data.scheduled_count} scheduled`
          : data.unscheduled_count
            ? `${data.unscheduled_count} could not fit`
            : "All placed this week",
        data.unscheduled_count > 0,
      ),
      metricCard(
        "Student capacity",
        allStudentsFit ? "Fits" : "Short",
        allStudentsFit
          ? "Each child has enough individual time"
          : "At least one child lacks enough time",
        !allStudentsFit,
      ),
      metricCard(
        "Teaching attention",
        formatMinutes(parent.parent_demand),
        `remaining before ${parent.due_label} ends`,
      ),
      metricCard(
        "Adult shortfall",
        parent.parent_shortfall ? formatMinutes(parent.parent_shortfall) : "None",
        `${formatMinutes(parent.parent_capacity)} usable before the deadline`,
        parent.parent_shortfall > 0,
      ),
    ].join("");
  }

  function phaseMarkup(phase) {
    const adult = currentFamily().adults?.[phase.resource];
    return `<span class="wf-mini-phase ${phase.resource !== "student" ? "parent" : ""}">${escapeHtml(phase.start.replace(" AM", "a").replace(" PM", "p"))} · ${Number(phase.minutes)}m ${phase.resource !== "student" ? escapeHtml(adult?.name || primaryAdult().name) : "solo"}</span>`;
  }

  function blockMarkup(entry) {
    const hasParent = entry.parent_minutes > 0;
    const group = entry.student_ids.length > 1;
    const color = currentFamily().students[entry.student_ids[0]]?.color || "#315f53";
    return `
      <article class="wf-block${hasParent ? " has-parent" : ""}${group ? " is-group" : ""}${entry.late ? " is-late" : ""}" style="--owner:${color}">
        <div class="wf-block-top">
          <span>${entry.start}–${entry.end}</span>
          ${entry.late ? '<span class="wf-late-label">Past due</span>' : `<span>${entry.duration} min</span>`}
        </div>
        <h3>${escapeHtml(entry.title)}</h3>
        <div class="wf-block-owner">${entry.student_ids.map((id) => escapeHtml(currentFamily().students[id]?.name || id)).join(" + ")} · ${escapeHtml(entry.subject)}</div>
        <div class="wf-block-phases">${entry.phases.map(phaseMarkup).join("")}</div>
        <button class="wf-complete-task" type="button" data-task-id="${escapeHtml(entry.task_id)}">Mark done</button>
      </article>`;
  }

  function eventMarkup(event) {
    return `
      <article class="wf-event-block ${event.kind}">
        <span>${escapeHtml(event.start)}–${escapeHtml(event.end)} · ${escapeHtml(event.kind)}</span>
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(event.detail)}</small>
      </article>`;
  }

  function dayMarkup(day) {
    const eventRows = day.events.map(eventMarkup).join("");
    let workRows;
    if (day.missed) {
      workRows = `<div class="wf-missed-message"><strong>No usable school capacity</strong><span>WeekFlow preserves the day as unavailable.</span></div>`;
    } else if (!day.entries.length) {
      workRows = `<div class="wf-no-work">No additional work scheduled</div>`;
    } else {
      workRows = day.entries.map(blockMarkup).join("");
    }
    return `
      <section class="wf-day${day.missed ? " is-missed" : ""}">
        <header class="wf-day-header">
          <div><strong>${day.label}</strong><small>${day.date ? `${escapeHtml(new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }))} · ` : ""}${day.start}–${day.end}</small></div>
          <span class="wf-day-count">${day.missed ? "Unavailable" : `${day.entries.length} blocks`}</span>
        </header>
        <div class="wf-day-body">${eventRows}${workRows}</div>
      </section>`;
  }

  function renderCompleted(items) {
    completedPanel.hidden = !items.length;
    completedList.innerHTML = items
      .map(
        (item) => `
          <article class="wf-completed-item">
            <span>${item.kind === "ahead" ? "Worked ahead" : "Co-op credit"}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${(item.student_ids || []).map((id) => escapeHtml(currentFamily().students[id]?.name || id)).join(" + ")} · ${escapeHtml(personalizeText(item.detail))}</small>
          </article>`,
      )
      .join("");
  }

  function renderRollover(items) {
    rolloverPanel.hidden = !items.length;
    rolloverList.innerHTML = items
      .map(
        (item) => `
          <article class="wf-completed-item">
            <span>Needs a new slot</span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${item.student_ids.map((id) => escapeHtml(currentFamily().students[id]?.name || id)).join(" + ")} · ${Number(item.minutes)} min</small>
          </article>`,
      )
      .join("");
  }

  function renderExplanations(items) {
    explanationList.innerHTML = items
      .map(
        (item) => `
          <article class="wf-explanation">
            <strong>${escapeHtml(personalizeText(item.title))}</strong>
            <p>${escapeHtml(personalizeText(item.body))}</p>
          </article>`,
      )
      .join("");
  }

  function renderResolution(data) {
    const hasTradeoff = data.warnings.length || data.recommendations.length;
    resolutionPanel.hidden = !hasTradeoff;
    if (!hasTradeoff) {
      warningList.innerHTML = "";
      recommendationList.innerHTML = "";
      return;
    }

    warningList.innerHTML = data.warnings
      .map(
        (warning) => `
          <article class="wf-warning-card ${warning.kind}">
            <span>Constraint</span>
            <strong>${escapeHtml(warning.title)}</strong>
            <p>${escapeHtml(warning.body)}</p>
          </article>`,
      )
      .join("");

    recommendationList.innerHTML = data.recommendations
      .map(
        (recommendation, index) => `
          <article class="wf-recommendation-card">
            <span>Option ${index + 1}</span>
            <strong>${escapeHtml(recommendation.title)}</strong>
            <p>${escapeHtml(recommendation.body)}</p>
          </article>`,
      )
      .join("");
  }

  function render(data) {
    current = data;
    emptyState.hidden = true;
    results.hidden = false;
    explanations.hidden = true;
    explainButton.textContent = "Explain This Schedule";

    statusBanner.classList.toggle("is-disrupted", data.mode === "disrupted");
    if (data.mode === "baseline") {
      statusBanner.innerHTML = `
        <strong>The recurring family rhythm is optimized.</strong>
        <span>Commitments, different student hours, parent windows, and every assignment are represented.</span>`;
      scheduleTitle.textContent = "Optimized family week";
    } else if (data.mode === "adjusted") {
      statusBanner.innerHTML = `
        <strong>Work already completed has been credited.</strong>
        <span>${data.completed_count} assignment${data.completed_count === 1 ? " no longer needs" : "s no longer need"} another calendar slot.</span>`;
      scheduleTitle.textContent = "Updated family week";
    } else {
      const changeCount = data.scenario.disruptions.length;
      statusBanner.innerHTML = `
        <strong>The week was rebuilt around ${changeCount} real-life change${changeCount === 1 ? "" : "s"}.</strong>
        <span>${data.metrics.parent_shortfall ? `Direct parent attention is short by ${formatMinutes(data.metrics.parent_shortfall)} before ${data.metrics.due_label} ends.` : "All remaining work is placed without resource conflicts."}</span>`;
      scheduleTitle.textContent = "Re-optimized family week";
    }

    renderMetrics(data);
    renderCompleted(data.completed);
    renderRollover(data.rollover || []);
    renderResolution(data);
    week.innerHTML = data.days.map(dayMarkup).join("");
    renderExplanations(data.explanations);
    explainButton.disabled = false;
    approveButton.disabled = false;
    printButton.disabled = false;
    calendarButton.disabled = false;
    betaState.approved = false;
    setStep(3);
    scheduleLocalSave();
  }

  function placementMap(plan) {
    return new Map(
      (plan?.days || []).flatMap((day) =>
        day.entries.map((entry) => [entry.task_id, `${day.id}:${entry.start_minute}`]),
      ),
    );
  }

  function changedPlacementCount(before, after) {
    const left = placementMap(before);
    const right = placementMap(after);
    return new Set([...left.keys(), ...right.keys()]).size
      ? [...new Set([...left.keys(), ...right.keys()])].filter((id) => left.get(id) !== right.get(id)).length
      : 0;
  }

  async function fetchSchedule(mode, button) {
    setBusy(button, true, mode === "baseline" ? "Optimizing…" : "Re-optimizing…");
    let succeeded = false;
    try {
      const scenario = collectScenario();
      validateScenario(scenario);
      const response = await fetch(config.scheduleUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config.csrfToken,
        },
        body: JSON.stringify({ mode, scenario }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Scheduler returned ${response.status}`);
      const before = current ? { plan: current, scenario: current.scenario } : null;
      render(payload);
      trackEvent("plan_generated");
      if (before) {
        previousSnapshot = before;
        undoButton.disabled = false;
        const moved = changedPlacementCount(before.plan, payload);
        saveStatus.textContent = moved
          ? `${moved} assignment${moved === 1 ? "" : "s"} changed. You can undo this replan.`
          : "The plan was checked; no assignment times changed.";
      }
      succeeded = true;
      if (mode === "baseline") {
        missButton.disabled = false;
        missButton.textContent = "Quick test: Lose Tuesday";
        rebalanceButton.hidden = true;
      } else {
        rebalanceButton.hidden = true;
        missButton.disabled = true;
        missButton.textContent = "Tuesday Lost";
      }
    } catch (error) {
      statusBanner.classList.add("is-disrupted");
      statusBanner.innerHTML = `<strong>Could not run the scheduler.</strong><span>${escapeHtml(error.message)}</span>`;
      results.hidden = false;
    } finally {
      setBusy(button, false);
      if (mode === "disrupted" && succeeded) button.hidden = true;
    }
  }

  function resetPlan() {
    applyScenario(config.defaultScenario);
    current = null;
    previousSnapshot = null;
    emptyState.hidden = false;
    results.hidden = true;
    completedPanel.hidden = true;
    resolutionPanel.hidden = true;
    rolloverPanel.hidden = true;
    explanations.hidden = true;
    explainButton.disabled = true;
    explainButton.textContent = "Explain This Schedule";
    approveButton.disabled = true;
    printButton.disabled = true;
    calendarButton.disabled = true;
    undoButton.disabled = true;
    missButton.disabled = true;
    missButton.textContent = "Quick test: Lose Tuesday";
    rebalanceButton.hidden = true;
    setStep(1);
    updateScenarioSummary();
  }

  function statePayload({ approved = betaState.approved } = {}) {
    return {
      schema_version: 1,
      revision: betaState.revision || 0,
      family: currentFamily(),
      scenario: collectScenario(),
      approved,
      updated_at: betaState.updated_at,
    };
  }

  async function saveState({ approved = betaState.approved } = {}) {
    betaState.approved = approved;
    persistLocal(approved ? "Approved plan saved on this device." : "Draft saved on this device.");
    if (approved) approveButton.textContent = "Approved on device";
    if (approved) trackEvent("plan_approved");
    if (!config.signedIn) {
      return;
    }

    let cloudSaved = false;
    approveButton.disabled = true;
    setBusy(saveButton, true, "Saving…");
    try {
      const response = await fetch(config.stateUrl, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config.csrfToken,
        },
        body: JSON.stringify(statePayload({ approved })),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Cloud save returned ${response.status}`);
      betaState = { ...betaState, ...payload, current };
      persistLocal(approved ? "Approved plan saved to your account." : "Draft saved to your account.");
      cloudSaved = true;
    } catch (error) {
      saveStatus.textContent = `${error.message} Your device copy is still safe.`;
    } finally {
      setBusy(saveButton, false);
      approveButton.disabled = false;
      if (approved) approveButton.textContent = cloudSaved ? "Approved" : "Approved on device";
    }
  }

  function trackEvent(event) {
    fetch(config.analyticsUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
      body: JSON.stringify({ event }),
    }).catch(() => {});
  }

  function replaceSelectOptions(select, placeholder, rows, value, label) {
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.append(first);
    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = value(row);
      option.textContent = label(row);
      select.append(option);
    });
  }

  async function loadCloudLibrary() {
    if (!config.signedIn || !config.betaAccess) return;
    try {
      const [weeksResponse, templatesResponse] = await Promise.all([
        fetch(config.weeksUrl, { credentials: "same-origin" }),
        fetch(config.templatesUrl, { credentials: "same-origin" }),
      ]);
      if (!weeksResponse.ok || !templatesResponse.ok) return;
      const weekPayload = await weeksResponse.json();
      const templatePayload = await templatesResponse.json();
      savedTemplates = templatePayload.templates || [];
      replaceSelectOptions(
        historySelect,
        "Current device week",
        weekPayload.weeks || [],
        (weekRow) => weekRow.week_start,
        (weekRow) => `${weekRow.week_start}${weekRow.approved ? " · approved" : " · draft"}`,
      );
      replaceSelectOptions(
        templateSelect,
        "Choose a template",
        savedTemplates,
        (template) => template.id,
        (template) => template.name,
      );
    } catch {
      // The device-first planner remains usable during cloud outages.
    }
  }

  function applyLoadedState(payload, message) {
    betaState = { ...payload, current: payload.plan };
    applyFamily(betaState.family);
    applyScenario(betaState.scenario);
    render(payload.plan);
    betaState.approved = Boolean(payload.approved);
    if (betaState.approved) approveButton.textContent = "Approved";
    persistLocal(message);
  }

  function importCalendarText(text) {
    const room = Math.max(0, 40 - eventEditors.querySelectorAll(".wf-event-editor").length);
    const importedEvents = window.WeekFlowCalendar.parseWeekEvents(text, weekStart.value, room);
    importedEvents.forEach((importedEvent) => {
      customEventSequence += 1;
      appendEventEditor(
        {
          id: `calendar-${Date.now()}-${customEventSequence}`,
          ...importedEvent,
          detail: "Imported from an iCalendar file.",
          affected: availabilityPeople().map((person) => person.id),
          kind: "commitment",
          recurring: false,
          credit_subjects: [],
        },
        { enabled: true, removable: true },
      );
    });
    if (!importedEvents.length) throw new Error("No Monday–Friday events from this week were found in that calendar file.");
    updateScenarioSummary();
    markPlanStale();
    saveStatus.textContent = `${importedEvents.length} calendar event${importedEvents.length === 1 ? "" : "s"} imported. Optimize again.`;
    trackEvent("calendar_imported");
  }

  function startOfCurrentWeek() {
    if (current?.scenario?.week_start) {
      return new Date(`${current.scenario.week_start}T00:00:00`);
    }
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
  }

  function calendarDate(dayIndex, minute) {
    const date = startOfCurrentWeek();
    date.setDate(date.getDate() + dayIndex);
    date.setMinutes(minute);
    const datePart = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("");
    const timePart = [String(date.getHours()).padStart(2, "0"), String(date.getMinutes()).padStart(2, "0"), "00"].join("");
    return `${datePart}T${timePart}`;
  }

  function calendarEscape(value) {
    return String(value ?? "").replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
  }

  function exportCalendar() {
    if (!current) return;
    const timezone = currentFamily().timezone;
    const rows = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FaithSparks//WeekFlow Beta//EN", "CALSCALE:GREGORIAN"];
    current.days.forEach((day, dayIndex) => {
      [...day.events, ...day.entries].forEach((item) => {
        const start = item.start_minute;
        const end = item.end_minute;
        if (!Number.isInteger(start) || !Number.isInteger(end)) return;
        rows.push(
          "BEGIN:VEVENT",
          `UID:${calendarEscape(item.task_id || item.id)}-${dayIndex}@weekflow.faithsparks`,
          `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
          `DTSTART;TZID=${timezone}:${calendarDate(dayIndex, start)}`,
          `DTEND;TZID=${timezone}:${calendarDate(dayIndex, end)}`,
          `SUMMARY:${calendarEscape(item.title)}`,
          `DESCRIPTION:${calendarEscape(item.detail || `${(item.student_names || []).join(" + ")} · ${item.subject || "WeekFlow"}`)}`,
          "END:VEVENT",
        );
      });
    });
    rows.push("END:VCALENDAR");
    const blob = new Blob([`${rows.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "weekflow-week.ics";
    link.click();
    URL.revokeObjectURL(url);
    trackEvent("calendar_exported");
  }

  function restoreLocalState() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!stored?.family?.students || !stored?.scenario) return false;
      if (!Object.values(stored.family.students).length || !Object.values(stored.family.students).every((student) => student?.name)) return false;
      betaState = stored;
      applyFamily(betaState.family);
      applyScenario(betaState.scenario);
      updateScenarioSummary();
      if (betaState.current) {
        const wasApproved = Boolean(betaState.approved);
        render(betaState.current);
        betaState.approved = wasApproved;
        if (wasApproved) approveButton.textContent = "Approved";
      }
      saveStatus.textContent = "Recovered your draft from this device.";
      return true;
    } catch {
      localStorage.removeItem(storageKey);
      return false;
    }
  }

  async function loadCloudState() {
    if (!config.signedIn) return;
    try {
      const response = await fetch(config.stateUrl, { credentials: "same-origin" });
      if (!response.ok) return;
      const payload = await response.json();
      betaState = { ...payload, current: payload.plan };
      applyFamily(betaState.family);
      applyScenario(betaState.scenario);
      updateScenarioSummary();
      if (payload.revision > 0 || payload.approved) render(payload.plan);
      betaState.approved = Boolean(payload.approved);
      if (betaState.approved) approveButton.textContent = "Approved";
      persistLocal("Cloud plan loaded.");
    } catch {
      saveStatus.textContent = "Using the safe device copy while cloud saving is unavailable.";
    }
  }

  generateButton.addEventListener("click", () => fetchSchedule("baseline", generateButton));

  explainButton.addEventListener("click", () => {
    if (!current) return;
    const willShow = explanations.hidden;
    explanations.hidden = !willShow;
    explainButton.textContent = willShow ? "Hide Explanation" : "Explain This Schedule";
    if (willShow) explanations.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  missButton.addEventListener("click", () => {
    setStep(2);
    missButton.disabled = true;
    missButton.textContent = "Tuesday Lost";
    rebalanceButton.hidden = false;
    statusBanner.classList.add("is-disrupted");
    statusBanner.innerHTML = `
      <strong>Tuesday just became unavailable.</strong>
      <span>Re-optimize to combine the lost day with the rhythm and life events already selected.</span>`;
  });

  rebalanceButton.addEventListener("click", () => fetchSchedule("disrupted", rebalanceButton));
  resetButton.addEventListener("click", resetPlan);

  function newPersonId(prefix) {
    customEventSequence += 1;
    return `${prefix}-${Date.now()}-${customEventSequence}`;
  }

  function collectFamilyPeople(container, group) {
    const people = {};
    Array.from(container.querySelectorAll(".wf-family-person")).forEach((row, index) => {
      const id = row.dataset.personId;
      const existing = currentFamily()[group]?.[id];
      people[id] = {
        name: row.querySelector("input").value.trim(),
        color: existing?.color || personColorPalette[index % personColorPalette.length],
      };
    });
    return people;
  }

  function migrateScenarioForFamily(scenario, family) {
    const oldStudentIds = scenario.household?.students?.map((person) => person.id)
      || Object.keys(currentFamily().students);
    const oldAdultIds = scenario.household?.adults?.map((person) => person.id)
      || Object.keys(currentFamily().adults || { parent: {} });
    const studentIds = Object.keys(family.students);
    const adultIds = Object.keys(family.adults);
    const oldPeople = new Set([...oldAdultIds, ...oldStudentIds]);
    const newPeople = [...adultIds, ...studentIds];
    const availabilityEnd = {};
    newPeople.forEach((id) => {
      availabilityEnd[id] = {};
      Object.keys(dayLabels).forEach((dayId) => {
        availabilityEnd[id][dayId] = scenario.availability_end[id]?.[dayId]
          ?? (id === studentIds[0] && ["mon", "tue", "wed", "thu"].includes(dayId) ? 16 * 60 : 12 * 60 + 30);
      });
    });
    const tasks = scenario.tasks.map((task) => {
      const wasWholeFamily = task.student_ids.length === oldStudentIds.length
        && task.student_ids.every((id) => oldStudentIds.includes(id));
      const assignedStudents = wasWholeFamily
        ? studentIds
        : task.student_ids.filter((id) => studentIds.includes(id));
      return {
        ...task,
        student_ids: assignedStudents.length ? assignedStudents : [studentIds[0]],
        phases: task.phases.map((phase) => ({
          ...phase,
          resource: phase.resource === "student" || adultIds.includes(phase.resource)
            ? phase.resource
            : adultIds[0],
        })),
      };
    });
    const events = scenario.events.map((event) => {
      const affectedSet = new Set(event.affected);
      const affectedEveryone = [...oldPeople].every((id) => affectedSet.has(id));
      const affected = affectedEveryone
        ? newPeople
        : event.affected.filter((id) => newPeople.includes(id));
      return { ...event, affected: affected.length ? affected : newPeople };
    });
    return {
      ...scenario,
      household: {
        adults: Object.entries(family.adults).map(([id, person]) => ({ id, ...person })),
        students: Object.entries(family.students).map(([id, person]) => ({ id, ...person })),
      },
      availability_end: availabilityEnd,
      tasks,
      events,
      extended_days: Object.entries(availabilityEnd[studentIds[0]])
        .filter(([, end]) => end > 12 * 60 + 30)
        .map(([dayId]) => dayId),
    };
  }

  function clearRenderedPlanAfterFamilyChange() {
    current = null;
    previousSnapshot = null;
    results.hidden = true;
    emptyState.hidden = false;
    approveButton.disabled = true;
    printButton.disabled = true;
    calendarButton.disabled = true;
    undoButton.disabled = true;
    setStep(2);
  }

  familySetupButton.addEventListener("click", () => {
    applyFamily(currentFamily());
    familyDialog.showModal();
  });

  familyForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!familyForm.reportValidity()) return;
    const scenario = collectScenario();
    const adults = collectFamilyPeople(familyAdultEditors, "adults");
    const students = collectFamilyPeople(familyStudentEditors, "students");
    const family = {
      name: familyName.value.trim(),
      parent_label: Object.values(adults)[0].name,
      timezone: familyTimezone.value,
      adults,
      students,
    };
    const migratedScenario = migrateScenarioForFamily(scenario, family);
    applyFamily(family);
    applyScenario(migratedScenario);
    clearRenderedPlanAfterFamilyChange();
    familyDialog.close();
    persistLocal("Family setup saved on this device.");
    if (!localStorage.getItem(`${storageKey}:onboarded`)) {
      localStorage.setItem(`${storageKey}:onboarded`, "1");
      trackEvent("onboarding_complete");
    }
  });

  addAdultButton.addEventListener("click", () => {
    if (familyAdultEditors.querySelectorAll(".wf-family-person").length >= config.limits.adults) {
      saveStatus.textContent = `Your ${config.limits.tier} tier supports up to ${config.limits.adults} teaching adults.`;
      return;
    }
    appendFamilyPersonEditor(
      familyAdultEditors,
      "adults",
      { id: newPersonId("adult"), name: "Teaching adult" },
    );
  });

  addStudentButton.addEventListener("click", () => {
    if (familyStudentEditors.querySelectorAll(".wf-family-person").length >= config.limits.students) {
      saveStatus.textContent = `Your ${config.limits.tier} tier supports up to ${config.limits.students} students.`;
      return;
    }
    appendFamilyPersonEditor(
      familyStudentEditors,
      "students",
      { id: newPersonId("student"), name: "Student" },
    );
  });

  saveButton.addEventListener("click", () => saveState());
  approveButton.addEventListener("click", () => saveState({ approved: true }));
  undoButton.addEventListener("click", () => {
    if (!previousSnapshot) return;
    applyScenario(previousSnapshot.scenario);
    render(previousSnapshot.plan);
    previousSnapshot = null;
    undoButton.disabled = true;
    saveStatus.textContent = "The previous plan was restored.";
  });
  printButton.addEventListener("click", () => window.print());
  calendarButton.addEventListener("click", exportCalendar);
  clearDraftButton.addEventListener("click", () => {
    if (!window.confirm("Clear the WeekFlow draft stored on this device?")) return;
    localStorage.removeItem(storageKey);
    resetPlan();
    saveStatus.textContent = "The device draft was cleared.";
  });
  deleteCloudButton?.addEventListener("click", async () => {
    if (!window.confirm("Delete every saved WeekFlow week and template from your cloud account? Download a backup first if you need one. This cannot be undone.")) return;
    try {
      const response = await fetch(config.stateUrl, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": config.csrfToken },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The cloud plan could not be deleted.");
      localStorage.removeItem(storageKey);
      betaState.revision = 0;
      resetPlan();
      saveStatus.textContent = "All WeekFlow cloud data and the device draft were deleted.";
    } catch (error) {
      saveStatus.textContent = error.message;
    }
  });
  weekStart.addEventListener("change", () => {
    const selected = new Date(`${weekStart.value}T12:00:00`);
    if (selected.getDay() !== 1) {
      const monday = new Date(selected);
      monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
      weekStart.value = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      saveStatus.textContent = "WeekFlow adjusted the date to that week's Monday.";
    }
    markPlanStale();
  });

  week.addEventListener("click", (event) => {
    const button = event.target.closest(".wf-complete-task");
    if (!button) return;
    const input = document.querySelector(
      `.wf-task-editor[data-task-id="${CSS.escape(button.dataset.taskId)}"] .wf-task-completed`,
    );
    if (!input) return;
    input.checked = true;
    updateScenarioSummary();
    markPlanStale();
    generateButton.focus();
  });

  feedbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = feedbackForm.querySelector("button[type='submit']");
    setBusy(button, true, "Sending…");
    try {
      const response = await fetch(config.feedbackUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({
          realistic: document.querySelector("#feedbackRealistic").value,
          comment: document.querySelector("#feedbackComment").value,
          contact: document.querySelector("#feedbackContact").checked,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Feedback could not be sent.");
      feedbackForm.reset();
      feedbackStatus.textContent = "Thank you—your feedback was saved.";
    } catch (error) {
      feedbackStatus.textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });

  tessaAheadButton.addEventListener("click", () => {
    document.querySelectorAll(".wf-task-editor").forEach((row) => {
      const task = taskFromEditor(row);
      const parentMinutes = task.phases
        .filter((phase) => phase.resource !== "student")
        .reduce((total, phase) => total + phase.minutes, 0);
      if (task.student_ids.length === 1 && task.student_ids[0] === currentStudents()[0].id && parentMinutes === 0) {
        row.querySelector(".wf-task-completed").checked = true;
      }
    });
    updateScenarioSummary();
    markPlanStale();
  });

  clearAheadButton.addEventListener("click", () => {
    document.querySelectorAll(".wf-task-completed").forEach((input) => {
      input.checked = false;
    });
    updateScenarioSummary();
    markPlanStale();
  });

  addTaskButton.addEventListener("click", () => {
    customEventSequence += 1;
    appendTaskEditor(
      {
        id: `task-${Date.now()}-${customEventSequence}`,
        title: "New assignment",
        subject: "General",
        student_ids: [currentStudents()[0].id],
        phases: [{ label: "Independent work", minutes: 20, resource: "student" }],
        due_day: 2,
        priority: 3,
        preferred_start: null,
      },
      { isNew: true },
    );
    updateScenarioSummary();
    markPlanStale();
    document.querySelector("#aheadOptions").lastElementChild.querySelector(".wf-task-title").focus();
  });

  addEventButton.addEventListener("click", () => {
    customEventSequence += 1;
    appendEventEditor(
      {
        id: `custom-${Date.now()}-${customEventSequence}`,
        title: "Family event",
        detail: "Added in the WeekFlow event planner.",
        day_id: "mon",
        start_minute: 9 * 60,
        end_minute: 12 * 60,
        affected: availabilityPeople().map((person) => person.id),
        kind: "disruption",
        recurring: false,
        credit_subjects: [],
      },
      { enabled: true, removable: true },
    );
    updateScenarioSummary();
    markPlanStale();
    eventEditors.lastElementChild.querySelector(".wf-event-title").focus();
  });

  historySelect.addEventListener("change", () => {
    loadWeekButton.disabled = !historySelect.value;
  });

  loadWeekButton.addEventListener("click", async () => {
    if (!historySelect.value) return;
    setBusy(loadWeekButton, true, "Loading…");
    try {
      const response = await fetch(`${config.weeksUrl}/${encodeURIComponent(historySelect.value)}`, { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The saved week could not be loaded.");
      applyLoadedState(payload, `Week of ${historySelect.value} loaded.`);
    } catch (error) {
      saveStatus.textContent = error.message;
    } finally {
      setBusy(loadWeekButton, false);
    }
  });

  templateSelect.addEventListener("change", () => {
    applyTemplateButton.disabled = !templateSelect.value;
    deleteTemplateButton.disabled = !templateSelect.value;
  });

  applyTemplateButton.addEventListener("click", () => {
    const template = savedTemplates.find((item) => item.id === templateSelect.value);
    if (!template) return;
    const scenario = structuredClone(template.scenario);
    scenario.week_start = weekStart.value;
    scenario.completed_task_ids = [];
    applyScenario(migrateScenarioForFamily(scenario, currentFamily()));
    clearRenderedPlanAfterFamilyChange();
    updateScenarioSummary();
    persistLocal(`Template “${template.name}” applied. Optimize when ready.`);
  });

  saveTemplateButton.addEventListener("click", async () => {
    const name = templateName.value.trim();
    if (!name) {
      saveStatus.textContent = "Name the reusable template first.";
      templateName.focus();
      return;
    }
    if (!config.signedIn || !config.betaAccess) {
      saveStatus.textContent = "Sign in with a WeekFlow beta account to save cloud templates.";
      return;
    }
    setBusy(saveTemplateButton, true, "Saving…");
    try {
      const response = await fetch(config.templatesUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ name, scenario: collectScenario() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The template could not be saved.");
      templateName.value = "";
      saveStatus.textContent = `Template “${payload.name}” saved.`;
      trackEvent("template_saved");
      await loadCloudLibrary();
    } catch (error) {
      saveStatus.textContent = error.message;
    } finally {
      setBusy(saveTemplateButton, false);
    }
  });

  deleteTemplateButton.addEventListener("click", async () => {
    const selected = savedTemplates.find((item) => item.id === templateSelect.value);
    if (!selected || !window.confirm(`Delete the “${selected.name}” template?`)) return;
    try {
      const response = await fetch(`${config.templatesUrl}/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": config.csrfToken },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The template could not be deleted.");
      saveStatus.textContent = `Template “${selected.name}” deleted.`;
      await loadCloudLibrary();
    } catch (error) {
      saveStatus.textContent = error.message;
    }
  });

  createRolloverButton.addEventListener("click", async () => {
    if (!config.signedIn || !config.betaAccess) {
      saveStatus.textContent = "Sign in with a WeekFlow beta account to create a saved rollover week.";
      return;
    }
    setBusy(createRolloverButton, true, "Creating…");
    try {
      const response = await fetch(config.rolloverUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify(statePayload({ approved: false })),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The rollover week could not be created.");
      applyLoadedState(payload, `Rollover draft created for ${payload.scenario.week_start}.`);
      trackEvent("rollover_created");
      await loadCloudLibrary();
    } catch (error) {
      saveStatus.textContent = error.message;
    } finally {
      setBusy(createRolloverButton, false);
    }
  });

  calendarImport.addEventListener("change", async () => {
    const file = calendarImport.files?.[0];
    if (!file) return;
    try {
      if (file.size > 500000) throw new Error("Calendar files must be smaller than 500 KB.");
      importCalendarText(await file.text());
    } catch (error) {
      saveStatus.textContent = error.message;
    } finally {
      calendarImport.value = "";
    }
  });

  planner.addEventListener("change", () => {
    updateScenarioSummary();
    markPlanStale();
  });

  resetPlan();
  applyFamily(currentFamily());
  const restoredDeviceState = restoreLocalState();
  loadCloudState();
  loadCloudLibrary();
  trackEvent("page_view");
  if (!restoredDeviceState && !localStorage.getItem(`${storageKey}:onboarded`)) {
    window.setTimeout(() => familySetupButton.click(), 350);
  }
})();
