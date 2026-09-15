(() => {
  const config = window.WEEKFLOW_SETTINGS_CONFIG;
  const app = document.getElementById("settingsApp");
  const loading = document.getElementById("settingsLoading");
  const errorBox = document.getElementById("settingsError");
  const errorMessage = document.getElementById("settingsErrorMessage");
  const form = document.getElementById("settingsForm");
  const status = document.getElementById("settingsStatus");
  const colors = ["#6657d9", "#d45e86", "#168a80", "#3d7fba", "#d87843"];
  const commonTimezones = [
    ["America/New_York", "Eastern time"], ["America/Chicago", "Central time"],
    ["America/Denver", "Mountain time"], ["America/Phoenix", "Arizona time"],
    ["America/Los_Angeles", "Pacific time"], ["America/Anchorage", "Alaska time"],
    ["Pacific/Honolulu", "Hawaii time"], ["UTC", "UTC"],
  ];
  let state = null;
  let aggregate = null;

  const cleanId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Please try again.");
    return payload;
  }
  const people = (role) => state.family[role];
  const allPeople = () => ({ ...state.family.adults, ...state.family.students });

  function referencedPersonIds() {
    const ids = new Set(Object.keys(allPeople()));
    const used = new Set();
    const sources = [
      state.scenario?.tasks, aggregate?.items, aggregate?.household?.routines,
      aggregate?.meals?.meals, aggregate?.meals?.handoffs, aggregate?.medical?.items,
      aggregate?.travel?.plans, aggregate?.travel?.handoffs, aggregate?.logistics?.plan,
    ];
    const scan = (value) => {
      if (typeof value === "string") { if (ids.has(value)) used.add(value); return; }
      if (Array.isArray(value)) { value.forEach(scan); return; }
      if (value && typeof value === "object") Object.values(value).forEach(scan);
    };
    sources.forEach(scan);
    return used;
  }

  function removePersonFromScenario(personId) {
    delete state.scenario.availability_end[personId];
    state.scenario.events = state.scenario.events.flatMap((event) => {
      const affected = event.affected.filter((id) => id !== personId);
      return affected.length ? [{ ...event, affected }] : [];
    });
  }

  function addPersonAvailability(personId, role) {
    const peerIds = Object.keys(people(role));
    const peer = peerIds.map((id) => state.scenario.availability_end[id]).find(Boolean);
    state.scenario.availability_end[personId] = peer
      ? { ...peer }
      : Object.fromEntries(["mon", "tue", "wed", "thu", "fri"].map((day) => [day, role === "adults" ? 17 * 60 : 12 * 60 + 30]));
  }

  function renderPeople(role, targetId, label) {
    const target = document.getElementById(targetId);
    const used = referencedPersonIds();
    const sourcesIncomplete = Object.keys(aggregate?.source_errors || {}).length > 0;
    const entries = Object.entries(people(role));
    target.replaceChildren(...entries.map(([id, person]) => {
      const row = document.createElement("div"); row.className = "wfs-person-row";
      const input = document.createElement("input"); input.value = person.name; input.maxLength = 60; input.required = true; input.dataset.role = role; input.dataset.id = id; input.setAttribute("aria-label", `${label} name`);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "wfs-remove"; remove.textContent = sourcesIncomplete ? "Unavailable" : used.has(id) ? "Assigned" : "Remove"; remove.dataset.removeRole = role; remove.dataset.removeId = id; remove.disabled = entries.length <= 1 || used.has(id) || sourcesIncomplete; remove.title = sourcesIncomplete ? "WeekFlow could not safely check every area. Try again after all areas are available." : used.has(id) ? "Reassign this person’s lessons and responsibilities before removing them." : "Remove this person";
      row.append(input, remove); return row;
    }));
  }

  function renderTimezone() {
    const select = document.getElementById("familyTimezone");
    const known = commonTimezones.some(([value]) => value === state.family.timezone);
    const options = commonTimezones.map(([value, label]) => new Option(label, value));
    if (!known) options.push(new Option(state.family.timezone, state.family.timezone));
    select.replaceChildren(...options); select.value = state.family.timezone;
  }

  function renderPrimaryAdult() {
    const select = document.getElementById("primaryAdult");
    select.replaceChildren(...Object.entries(state.family.adults).map(([id, person]) => new Option(person.name, id)));
    select.value = state.family.primary_adult_id;
  }

  function render() {
    document.getElementById("familyName").value = state.family.name;
    renderTimezone(); renderPrimaryAdult();
    renderPeople("adults", "adultList", "Adult"); renderPeople("students", "studentList", "Child");
    const adultCount = Object.keys(state.family.adults).length;
    const studentCount = Object.keys(state.family.students).length;
    document.getElementById("adultCount").textContent = `${adultCount} of ${config.maxAdults}`;
    document.getElementById("studentCount").textContent = `${studentCount} of ${config.maxStudents}`;
    document.getElementById("addAdult").disabled = adultCount >= config.maxAdults;
    document.getElementById("addStudent").disabled = studentCount >= config.maxStudents;
    const unavailable = Object.keys(aggregate?.source_errors || {});
    const warning = document.getElementById("settingsSourceWarning");
    warning.hidden = unavailable.length === 0;
    warning.textContent = unavailable.length ? "Some WeekFlow areas could not be checked, so removing family members is paused. Your names and other settings can still be saved." : "";
  }

  function setStatus(message, isError = false) { status.textContent = message; status.classList.toggle("is-error", isError); }
  async function load() {
    loading.hidden = false; app.hidden = true; errorBox.hidden = true;
    try {
      [state, aggregate] = await Promise.all([jsonRequest(config.stateUrl), jsonRequest(config.aggregateUrl)]);
      render(); loading.hidden = true; app.hidden = false;
    } catch (error) { loading.hidden = true; errorMessage.textContent = error.message; errorBox.hidden = false; }
  }

  document.getElementById("addAdult").addEventListener("click", () => {
    if (Object.keys(state.family.adults).length >= config.maxAdults) return;
    const id = cleanId("adult"); addPersonAvailability(id, "adults"); state.family.adults[id] = { name: "New adult", color: colors[Object.keys(state.family.adults).length % colors.length] }; render();
  });
  document.getElementById("addStudent").addEventListener("click", () => {
    if (Object.keys(state.family.students).length >= config.maxStudents) return;
    const id = cleanId("child"); addPersonAvailability(id, "students"); state.family.students[id] = { name: "New child", color: colors[Object.keys(state.family.students).length % colors.length] }; render();
  });
  for (const targetId of ["adultList", "studentList"]) {
    document.getElementById(targetId).addEventListener("click", (event) => {
      const button = event.target.closest("button[data-remove-role]");
      if (!button || button.disabled) return;
      removePersonFromScenario(button.dataset.removeId);
      delete state.family[button.dataset.removeRole][button.dataset.removeId];
      if (state.family.primary_adult_id === button.dataset.removeId) state.family.primary_adult_id = Object.keys(state.family.adults)[0];
      render();
    });
  }
  form.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.role) { state.family[input.dataset.role][input.dataset.id].name = input.value; renderPrimaryAdult(); }
  });
  document.getElementById("primaryAdult").addEventListener("change", (event) => {
    state.family.primary_adult_id = event.target.value;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); setStatus("Saving…");
    state.family.name = document.getElementById("familyName").value.trim();
    state.family.timezone = document.getElementById("familyTimezone").value;
    state.family.primary_adult_id = document.getElementById("primaryAdult").value;
    try { state = await jsonRequest(config.stateUrl, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify(state) }); render(); setStatus("Family settings saved"); }
    catch (error) { setStatus(error.message, true); }
  });
  document.getElementById("retrySettings").addEventListener("click", load);
  document.getElementById("restoreBackup").addEventListener("click", async () => {
    const file = document.getElementById("backupFile").files[0];
    const restoreStatus = document.getElementById("restoreStatus");
    if (!file) { restoreStatus.textContent = "Choose a WeekFlow backup first."; restoreStatus.className = "is-error"; return; }
    let backup;
    try { backup = JSON.parse(await file.text()); }
    catch (_error) { restoreStatus.textContent = "That file is not valid JSON."; restoreStatus.className = "is-error"; return; }
    const familyName = backup?.state?.family?.name || "the family in this backup";
    if (!window.confirm(`Restore ${familyName}? WeekFlow will validate the complete backup before replacing the current plan.`)) return;
    restoreStatus.textContent = "Validating and restoring…"; restoreStatus.className = "";
    try {
      const payload = await jsonRequest(config.restoreUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify({ confirm: true, backup }) });
      restoreStatus.textContent = `Backup restored with ${payload.weeks} saved week${payload.weeks === 1 ? "" : "s"} and ${payload.templates} template${payload.templates === 1 ? "" : "s"}.`;
      await load();
    } catch (error) { restoreStatus.textContent = error.message; restoreStatus.className = "is-error"; }
  });
  load();
})();
