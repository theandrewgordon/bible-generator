(() => {
  const config = window.WEEKFLOW_SETTINGS_CONFIG;
  const app = document.getElementById("settingsApp");
  const loading = document.getElementById("settingsLoading");
  const errorBox = document.getElementById("settingsError");
  const errorMessage = document.getElementById("settingsErrorMessage");
  const form = document.getElementById("settingsForm");
  const status = document.getElementById("settingsStatus");
  let state = null;
  const colors = ["#6657d9", "#d45e86", "#168a80", "#3d7fba", "#d87843"];
  const cleanId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const request = async (options = {}) => {
    const response = await fetch(config.stateUrl, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Please try again.");
    return payload;
  };
  const people = (role) => state.family[role];
  function renderPeople(role, targetId, label) {
    const target = document.getElementById(targetId);
    target.replaceChildren(...Object.entries(people(role)).map(([id, person]) => {
      const row = document.createElement("div"); row.className = "wfs-person-row";
      const input = document.createElement("input"); input.value = person.name; input.maxLength = 60; input.required = true; input.dataset.role = role; input.dataset.id = id; input.setAttribute("aria-label", `${label} name`);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "wfs-remove"; remove.textContent = "Remove"; remove.dataset.removeRole = role; remove.dataset.removeId = id; remove.disabled = Object.keys(people(role)).length <= 1;
      row.append(input, remove); return row;
    }));
  }
  function render() {
    document.getElementById("familyName").value = state.family.name;
    document.getElementById("familyTimezone").value = state.family.timezone;
    renderPeople("adults", "adultList", "Adult"); renderPeople("students", "studentList", "Child");
  }
  function setStatus(message, isError = false) { status.textContent = message; status.classList.toggle("is-error", isError); }
  async function load() {
    loading.hidden = false; app.hidden = true; errorBox.hidden = true;
    try { state = await request(); render(); loading.hidden = true; app.hidden = false; }
    catch (error) { loading.hidden = true; errorMessage.textContent = error.message; errorBox.hidden = false; }
  }
  document.getElementById("addAdult").addEventListener("click", () => { const id = cleanId("adult"); state.family.adults[id] = { name: "New adult", color: colors[Object.keys(state.family.adults).length % colors.length] }; renderPeople("adults", "adultList", "Adult"); });
  document.getElementById("addStudent").addEventListener("click", () => { const id = cleanId("child"); state.family.students[id] = { name: "New child", color: colors[Object.keys(state.family.students).length % colors.length] }; renderPeople("students", "studentList", "Child"); });
  document.getElementById("adultList").addEventListener("click", (event) => { const button = event.target.closest("button[data-remove-role]"); if (!button) return; delete state.family[button.dataset.removeRole][button.dataset.removeId]; if (state.family.primary_adult_id === button.dataset.removeId) state.family.primary_adult_id = Object.keys(state.family.adults)[0]; renderPeople("adults", "adultList", "Adult"); });
  document.getElementById("studentList").addEventListener("click", (event) => { const button = event.target.closest("button[data-remove-role]"); if (!button) return; delete state.family[button.dataset.removeRole][button.dataset.removeId]; renderPeople("students", "studentList", "Child"); });
  form.addEventListener("input", (event) => { const input = event.target; if (input.dataset.role) state.family[input.dataset.role][input.dataset.id].name = input.value; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); setStatus("Saving…");
    state.family.name = document.getElementById("familyName").value.trim(); state.family.timezone = document.getElementById("familyTimezone").value.trim();
    try { state = await request({ method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify(state) }); render(); setStatus("Family settings saved"); }
    catch (error) { setStatus(error.message, true); }
  });
  document.getElementById("retrySettings").addEventListener("click", load);
  document.getElementById("restoreBackup").addEventListener("click", async () => {
    const file = document.getElementById("backupFile").files[0];
    const restoreStatus = document.getElementById("restoreStatus");
    if (!file) { restoreStatus.textContent = "Choose a WeekFlow backup first."; restoreStatus.className = "is-error"; return; }
    if (!window.confirm("Restore this backup and replace the current family plan?")) return;
    restoreStatus.textContent = "Restoring…"; restoreStatus.className = "";
    try {
      const backup = JSON.parse(await file.text());
      const response = await fetch("/labs/weekflow/backup/restore", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": config.csrfToken }, body: JSON.stringify({ confirm: true, backup }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The backup could not be restored.");
      restoreStatus.textContent = "Backup restored. Reloading your settings…";
      await load();
    } catch (error) { restoreStatus.textContent = error.message; restoreStatus.className = "is-error"; }
  });
  load();
})();
