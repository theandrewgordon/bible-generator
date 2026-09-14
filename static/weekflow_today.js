(() => {
  const config = window.WEEKFLOW_TODAY_CONFIG;
  const byId = (id) => document.getElementById(id);
  const app = byId("todayApp");
  const loading = byId("todayLoading");
  const loadError = byId("todayLoadError");
  const loadErrorMessage = byId("todayLoadErrorMessage");
  const retryButton = byId("retryButton");
  const form = byId("captureForm");
  const titleInput = byId("captureTitle");
  const areaInput = byId("captureArea");
  const personInput = byId("capturePerson");
  const dueInput = byId("captureDue");
  const priorityInput = byId("capturePriority");
  const statusLine = byId("saveStatus");
  const board = byId("todayBoard");

  let state = null;
  let family = null;
  let today = null;
  let saveTimer = null;
  let saveInFlight = false;
  let dirty = false;

  const sectionConfig = {
    overdue: ["overdueSection", "overdueList", "overdueBadge"],
    dueToday: ["dueTodaySection", "dueTodayList", "dueTodayBadge"],
    attention: ["attentionSection", "attentionList", "attentionBadge"],
    waiting: ["waitingSection", "waitingList", "waitingBadge"],
    later: ["laterSection", "laterList", "laterBadge"],
    completed: ["completedSection", "completedList", "completedBadge"],
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function newId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setStatus(message, error = false) {
    statusLine.textContent = message;
    statusLine.classList.toggle("is-error", error);
  }

  function personById(personId) {
    return family.people.find((person) => person.id === personId);
  }

  function compareItems(left, right) {
    const leftDue = left.due_date || "9999-12-31";
    const rightDue = right.due_date || "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    const weight = { high: 0, normal: 1, low: 2 };
    if (weight[left.priority] !== weight[right.priority]) {
      return weight[left.priority] - weight[right.priority];
    }
    return left.created_at.localeCompare(right.created_at);
  }

  function categorizeItems() {
    const groups = {
      overdue: [],
      dueToday: [],
      attention: [],
      waiting: [],
      later: [],
      completed: [],
    };
    state.items.forEach((item) => {
      if (item.status === "completed") {
        groups.completed.push(item);
      } else if (item.status === "waiting") {
        groups.waiting.push(item);
      } else if (item.due_date && item.due_date < today) {
        groups.overdue.push(item);
      } else if (item.due_date === today) {
        groups.dueToday.push(item);
      } else if (item.priority === "high") {
        groups.attention.push(item);
      } else {
        groups.later.push(item);
      }
    });
    Object.entries(groups).forEach(([key, items]) => {
      if (key === "completed") {
        items.sort((left, right) => (right.completed_at || "").localeCompare(left.completed_at || ""));
        groups.completed = items.slice(0, 8);
      } else {
        items.sort(compareItems);
      }
    });
    return groups;
  }

  function formatDue(dueDate) {
    if (!dueDate) return null;
    if (dueDate === today) return "Today";
    const parts = dueDate.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
      .format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function metaSpan(text, className = "") {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    return span;
  }

  function actionButton(label, action, itemId, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.itemId = itemId;
    if (className) button.className = className;
    return button;
  }

  function itemCard(item) {
    const article = document.createElement("article");
    article.className = "wft-item";
    article.dataset.itemId = item.id;

    const check = actionButton(item.status === "completed" ? "✓" : "✓", item.status === "completed" ? "undo" : "complete", item.id, "wft-check");
    check.setAttribute("aria-label", item.status === "completed" ? `Restore ${item.title}` : `Complete ${item.title}`);

    const copy = document.createElement("div");
    copy.className = "wft-item-copy";
    const heading = document.createElement("strong");
    heading.textContent = item.title;
    copy.appendChild(heading);
    const meta = document.createElement("div");
    meta.className = "wft-item-meta";
    meta.appendChild(metaSpan(config.areaLabels[item.area] || item.area));
    const person = item.assigned_person_id ? personById(item.assigned_person_id) : null;
    if (person) {
      const assigned = metaSpan(person.name);
      const dot = document.createElement("i");
      dot.style.setProperty("--person", person.color);
      assigned.prepend(dot);
      meta.appendChild(assigned);
    }
    const due = formatDue(item.due_date);
    if (due) meta.appendChild(metaSpan(`Due ${due}`));
    if (item.priority === "high") meta.appendChild(metaSpan("Important"));
    if (item.status === "waiting") meta.appendChild(metaSpan("Waiting"));
    copy.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "wft-item-actions";
    if (item.status === "completed") {
      actions.appendChild(actionButton("Undo", "undo", item.id));
    } else if (item.status === "waiting") {
      actions.appendChild(actionButton("Resume", "resume", item.id));
    } else {
      actions.appendChild(actionButton("Wait", "wait", item.id));
    }
    actions.appendChild(actionButton("Remove", "remove", item.id, "is-remove"));
    article.append(check, copy, actions);
    return article;
  }

  function renderSection(name, items) {
    const [sectionId, listId, badgeId] = sectionConfig[name];
    const section = byId(sectionId);
    const list = byId(listId);
    section.hidden = items.length === 0;
    byId(badgeId).textContent = String(items.length);
    list.replaceChildren(...items.map(itemCard));
  }

  function renderSummary(groups) {
    byId("dueTodayCount").textContent = String(groups.dueToday.length);
    byId("overdueCount").textContent = String(groups.overdue.length);
    byId("waitingCount").textContent = String(groups.waiting.length);
    byId("openCount").textContent = String(
      groups.overdue.length + groups.dueToday.length + groups.attention.length + groups.later.length,
    );
  }

  function render() {
    const groups = categorizeItems();
    Object.entries(groups).forEach(([name, items]) => renderSection(name, items));
    renderSummary(groups);
    byId("emptyState").hidden = state.items.length > 0;
  }

  function scheduleSave() {
    dirty = true;
    setStatus("Saving…");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, 180);
  }

  async function flushSave() {
    saveTimer = null;
    if (saveInFlight || !dirty) return;
    saveInFlight = true;
    dirty = false;
    const itemsSnapshot = JSON.parse(JSON.stringify(state.items));
    try {
      const response = await fetch(config.stateUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config.csrfToken,
        },
        body: JSON.stringify({ revision: state.revision, items: itemsSnapshot }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await loadState({ quiet: true });
        setStatus("This list changed in another browser. We refreshed it so nothing gets overwritten.", true);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Your change could not be saved.");
      state.revision = payload.revision;
      state.updated_at = payload.updated_at;
      setStatus("Saved");
    } catch (error) {
      dirty = true;
      setStatus(`${error.message} We’ll retry automatically.`, true);
      saveTimer = window.setTimeout(flushSave, 5000);
    } finally {
      saveInFlight = false;
      if (dirty && !saveTimer) scheduleSave();
    }
  }

  function mutateItem(itemId, mutation) {
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    mutation(item);
    item.updated_at = nowIso();
    render();
    scheduleSave();
  }

  function handleBoardAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, itemId } = button.dataset;
    if (action === "remove") {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item || !window.confirm(`Remove “${item.title}”?`)) return;
      state.items = state.items.filter((candidate) => candidate.id !== itemId);
      render();
      scheduleSave();
      return;
    }
    mutateItem(itemId, (item) => {
      if (action === "complete") {
        item.status = "completed";
        item.completed_at = nowIso();
      } else if (action === "wait") {
        item.status = "waiting";
        item.completed_at = null;
      } else {
        item.status = "open";
        item.completed_at = null;
      }
    });
  }

  function renderFamily() {
    const configuredPeople = family.configured ? family.people : [];
    const peopleContainer = byId("familyPeople");
    peopleContainer.replaceChildren(...configuredPeople.map((person) => {
      const span = document.createElement("span");
      span.className = "wft-person";
      const dot = document.createElement("i");
      dot.style.setProperty("--person", person.color);
      span.append(dot, document.createTextNode(person.name));
      return span;
    }));
    personInput.replaceChildren(new Option("Anyone", ""), ...configuredPeople.map((person) => new Option(person.name, person.id)));
    byId("familyGreeting").textContent = family.configured
      ? `${family.name} in one calm view.`
      : "Start with one loose end. Family setup comes next.";
    const parts = today.split("-").map(Number);
    byId("todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long", month: "long", day: "numeric",
    }).format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  async function loadState({ quiet = false } = {}) {
    if (!quiet) {
      loading.hidden = false;
      loadError.hidden = true;
    }
    try {
      const response = await fetch(config.stateUrl, { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Please try again.");
      state = {
        revision: payload.revision,
        items: payload.items,
        updated_at: payload.updated_at,
      };
      family = payload.family;
      today = payload.today;
      renderFamily();
      render();
      app.hidden = false;
      loading.hidden = true;
      loadError.hidden = true;
    } catch (error) {
      if (quiet) throw error;
      loading.hidden = true;
      app.hidden = true;
      loadErrorMessage.textContent = error.message;
      loadError.hidden = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim().replace(/\s+/g, " ");
    if (!title) return;
    const timestamp = nowIso();
    state.items.push({
      id: newId(),
      title,
      area: areaInput.value,
      assigned_person_id: personInput.value || null,
      due_date: dueInput.value || null,
      priority: priorityInput.value,
      status: "open",
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
    });
    titleInput.value = "";
    dueInput.value = "";
    render();
    scheduleSave();
    titleInput.focus();
  });
  board.addEventListener("click", handleBoardAction);
  retryButton.addEventListener("click", () => loadState());
  window.addEventListener("online", () => {
    if (dirty) flushSave();
  });
  loadState();
})();
