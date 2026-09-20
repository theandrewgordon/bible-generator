(() => {
  const config = window.WEEKFLOW_CONFIG;
  const byId = (id) => document.getElementById(id);
  const generateButton = byId("generateButton");
  const actionStatus = byId("actionStatus");
  const results = byId("results");
  const scheduleTitle = byId("scheduleTitle");
  const statusBanner = byId("statusBanner");
  const metrics = byId("metrics");
  const dayTabs = byId("dayTabs");
  const resourceTimeline = byId("resourceTimeline");
  const mobileTimeline = byId("mobileTimeline");
  const week = byId("week");
  const explainButton = byId("explainButton");
  const explanations = byId("explanations");
  const explanationList = byId("explanationList");
  const disruptButton = byId("disruptButton");
  const rebuildButton = byId("rebuildButton");
  const disruptionCopy = byId("disruptionCopy");
  const changePanel = byId("changePanel");
  const changeSummary = byId("changeSummary");
  const feedbackPanel = byId("feedbackPanel");
  const feedbackForm = byId("feedbackForm");
  const feedbackStatus = byId("feedbackStatus");
  const demoPlayButton = byId("demoPlayButton");
  const demoNextButton = byId("demoNextButton");
  const demoResetButton = byId("demoResetButton");
  const demoProgress = byId("demoProgress");
  const demoStageTitle = byId("demoStageTitle");
  const demoStageCopy = byId("demoStageCopy");
  const demoPeople = byId("demoPeople");
  const demoEvents = byId("demoEvents");
  const demoTasks = byId("demoTasks");
  const demoLiveStatus = byId("demoLiveStatus");
  const demoCleanup = byId("demoCleanup");
  const demoCleanupCopy = byId("demoCleanupCopy");
  const demoFinishButton = byId("demoFinishButton");
  const demoRemoveButton = byId("demoRemoveButton");

  const START_MINUTE = 9 * 60;
  const LATEST_MINUTE = 16 * 60;
  const people = [...config.adults, ...config.students];
  const peopleById = Object.fromEntries(people.map((person) => [person.id, person]));
  let current = null;
  let baseline = null;
  let selectedDay = "mon";
  let demoScenario = JSON.parse(JSON.stringify(config.defaultScenario));
  let demoStep = -1;
  let demoTimer = null;
  let demoPlaying = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function demoChips(element, rows, kind = "") {
    element.replaceChildren(...rows.map((label) => {
      const chip = document.createElement("span");
      chip.className = `wf-demo-chip ${kind}`.trim();
      chip.textContent = label;
      return chip;
    }));
  }

  function updateDemoProgress() {
    demoProgress.querySelectorAll("li").forEach((item, index) => {
      item.classList.toggle("is-active", index === demoStep);
      item.classList.toggle("is-done", index < demoStep || demoStep >= 5);
      if (index === demoStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }

  function stopDemoPlayback() {
    if (demoTimer) window.clearTimeout(demoTimer);
    demoTimer = null;
    demoPlaying = false;
    demoPlayButton.textContent = demoStep >= 4 ? "Replay walkthrough" : "Continue walkthrough";
  }

  function resetDemo() {
    stopDemoPlayback();
    demoScenario = JSON.parse(JSON.stringify(config.defaultScenario));
    demoStep = -1;
    demoStageTitle.textContent = "Ready when you are";
    demoStageCopy.textContent = "Press play for the automatic tour, or use Next step at your own pace.";
    demoLiveStatus.textContent = "";
    [demoPeople, demoEvents, demoTasks].forEach((element) => {
      const empty = document.createElement("span");
      empty.className = "wf-demo-empty";
      empty.textContent = "Not entered yet";
      element.replaceChildren(empty);
    });
    demoCleanup.hidden = true;
    demoFinishButton.disabled = false;
    demoRemoveButton.disabled = false;
    demoPlayButton.textContent = "Play walkthrough";
    demoNextButton.disabled = false;
    results.hidden = true;
    feedbackPanel.hidden = true;
    changePanel.hidden = true;
    current = null;
    baseline = null;
    updateDemoProgress();
  }

  async function runDemoStep() {
    if (demoStep >= 4) {
      stopDemoPlayback();
      return;
    }
    demoStep += 1;
    updateDemoProgress();
    if (demoStep === 0) {
      demoStageTitle.textContent = "First, name the people sharing the day.";
      demoStageCopy.textContent = "WeekFlow needs names only so it can protect each person from being double-booked.";
      demoChips(demoPeople, [
        ...demoScenario.household.adults.map((person) => person.name),
        ...demoScenario.household.students.map((person) => person.name),
      ]);
      demoLiveStatus.textContent = "Family added.";
    } else if (demoStep === 1) {
      demoStageTitle.textContent = "Next, protect the immovable parts of the week.";
      demoStageCopy.textContent = "Co-op, appointments, travel, and other commitments become unavailable time before lessons are placed.";
      demoChips(demoEvents, demoScenario.events.map((event) => `${event.title} · ${event.day_id.toUpperCase()}`), "event");
      demoLiveStatus.textContent = `${demoScenario.events.length} fixed commitments added.`;
    } else if (demoStep === 2) {
      demoStageTitle.textContent = "Add the work and say how much parent help it needs.";
      demoStageCopy.textContent = "A lesson may be independent, parent-led, or split into kickoff, solo work, and a final check.";
      const preview = demoScenario.tasks.slice(0, 5).map((task) => task.title);
      if (demoScenario.tasks.length > preview.length) preview.push(`+ ${demoScenario.tasks.length - preview.length} more`);
      demoChips(demoTasks, preview, "task");
      demoLiveStatus.textContent = `${demoScenario.tasks.length} assignments ready to schedule.`;
    } else if (demoStep === 3) {
      demoStageTitle.textContent = "Now the real scheduler coordinates the family.";
      demoStageCopy.textContent = "It checks every student, every adult-help phase, every commitment, and every deadline.";
      demoLiveStatus.textContent = "Running the actual WeekFlow scheduler…";
      const plan = await build("baseline", demoScenario);
      demoLiveStatus.textContent = plan
        ? `${plan.scheduled_count} assignments placed with ${plan.unscheduled_count} left out.`
        : "The example could not be scheduled. Try again.";
      if (plan) results.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      demoStageTitle.textContent = "Finally, clean up the week as real life happens.";
      demoStageCopy.textContent = "Finishing or removing work rebuilds only what remains; the original family data is never copied or overwritten by this demo.";
      demoCleanup.hidden = false;
      demoLiveStatus.textContent = "Try either cleanup option below.";
      demoCleanup.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (demoPlaying && demoStep < 4) {
      demoTimer = window.setTimeout(runDemoStep, demoStep === 3 ? 2100 : 1150);
    } else if (demoStep >= 4) {
      stopDemoPlayback();
      demoNextButton.disabled = true;
    }
  }

  function playDemo() {
    if (demoPlaying) {
      stopDemoPlayback();
      demoPlayButton.textContent = "Continue walkthrough";
      return;
    }
    if (demoStep >= 4) resetDemo();
    demoPlaying = true;
    demoPlayButton.textContent = "Pause walkthrough";
    runDemoStep();
  }

  function formatTime(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "a" : "p"}`;
  }

  function placementMap(plan) {
    return Object.fromEntries(plan.days.flatMap((day) => day.entries.map((entry) => [
      entry.task_id,
      `${entry.day_id}:${entry.start_minute}:${entry.end_minute}`,
    ])));
  }

  function changedAssignments(plan) {
    if (!baseline || plan.mode !== "disrupted") return [];
    const before = placementMap(baseline);
    const after = placementMap(plan);
    return Object.keys(before).filter((taskId) => before[taskId] !== after[taskId]);
  }

  function renderMetrics(plan) {
    const parent = plan.metrics;
    const independentMinutes = plan.days.flatMap((day) => day.entries)
      .flatMap((entry) => entry.phases)
      .filter((phase) => phase.resource === "student")
      .reduce((total, phase) => total + phase.minutes, 0);
    const cards = [
      ["Weekly work accounted for", `${plan.scheduled_count + plan.completed_count} / ${plan.total_count}`, plan.unscheduled_count ? "needs-attention" : "good"],
      ["Parent time scheduled", `${parent.parent_demand} of ${parent.parent_capacity} min`, parent.parent_shortfall ? "needs-attention" : "good"],
      ["Deadline status", plan.feasibility.deadline_feasible ? "All deadlines met" : "Tradeoff needed", plan.feasibility.deadline_feasible ? "good" : "needs-attention"],
      ["Independent work created", `${independentMinutes} minutes`, "neutral"],
    ];
    metrics.innerHTML = cards.map(([label, value, state]) => `
      <article class="wf-metric ${state}"><span>${label}</span><strong>${value}</strong></article>
    `).join("");
  }

  function renderStatus(plan) {
    const activeDays = plan.days.filter((day) => day.entries.length).map((day) => day.label);
    if (plan.completed_count) {
      statusBanner.className = "wf-status is-good";
      statusBanner.innerHTML = `<strong>${plan.completed_count} finished; ${plan.scheduled_count} remaining assignments placed.</strong><span>The completed work stays out of the rebuilt schedule, and nobody is double-booked.</span>`;
    } else if (plan.mode === "disrupted") {
      const changed = changedAssignments(plan);
      const shortfall = plan.metrics.parent_shortfall;
      statusBanner.className = "wf-status is-warning";
      statusBanner.innerHTML = `<strong>${changed.length} assignments changed.</strong><span>${shortfall ? `Parent attention is now short by ${shortfall} minutes before the protected deadline.` : "All work still fits before the protected deadline."} No parent or student is double-booked.</span>`;
    } else {
      statusBanner.className = "wf-status is-good";
      statusBanner.innerHTML = `<strong>${plan.scheduled_count} assignments placed conflict-free.</strong><span>The baseline uses ${activeDays.slice(0, 3).join(", ")} instead of piling the week into its first available day.</span>`;
    }
  }

  function visibleEndMinute(day) {
    const latest = Math.max(
      12 * 60 + 30,
      ...day.entries.map((entry) => entry.end_minute),
      ...day.events.map((event) => event.end_minute),
    );
    return Math.min(LATEST_MINUTE, Math.ceil(latest / 30) * 30);
  }

  function blockGeometry(start, end, endMinute) {
    const span = endMinute - START_MINUTE;
    const boundedStart = Math.max(START_MINUTE, start);
    const boundedEnd = Math.min(endMinute, end);
    return {
      left: ((boundedStart - START_MINUTE) / span) * 100,
      width: Math.max(0.7, ((boundedEnd - boundedStart) / span) * 100),
    };
  }

  function timelineBlocks(day, resourceId) {
    const blocks = [];
    day.events.filter((event) => event.affected.includes(resourceId)).forEach((event) => {
      blocks.push({
        start: event.start_minute,
        end: event.end_minute,
        title: event.title,
        detail: event.kind === "commitment" ? "Fixed commitment" : "Unavailable",
        kind: "event",
      });
    });
    day.entries.forEach((entry) => {
      entry.phases.forEach((phase) => {
        const isAdult = config.adults.some((adult) => adult.id === resourceId);
        if (isAdult && phase.resource !== resourceId) return;
        if (!isAdult && !entry.student_ids.includes(resourceId)) return;
        const group = entry.student_ids.length > 1;
        blocks.push({
          start: phase.start_minute,
          end: phase.end_minute,
          title: entry.title,
          detail: isAdult ? entry.student_names.join(" + ") : phase.label,
          kind: group ? "group" : phase.resource === "student" ? "solo" : "parent",
        });
      });
    });
    return blocks.sort((left, right) => left.start - right.start || left.end - right.end);
  }

  function renderDesktopTimeline(day) {
    const endMinute = visibleEndMinute(day);
    const span = endMinute - START_MINUTE;
    const ticks = [];
    for (let minute = START_MINUTE; minute <= endMinute; minute += 60) ticks.push(minute);
    if (ticks.at(-1) !== endMinute) ticks.push(endMinute);
    const axis = `<div class="wf-time-axis"><span></span>${ticks.map((minute) => `<time style="left:${((minute - START_MINUTE) / span) * 100}%">${formatTime(minute)}</time>`).join("")}</div>`;
    const lanes = people.map((person) => {
      const blocks = timelineBlocks(day, person.id).map((block) => {
        const geometry = blockGeometry(block.start, block.end, endMinute);
        return `<div class="wf-time-block ${block.kind}" style="left:${geometry.left}%;width:${geometry.width}%" title="${escapeHtml(`${formatTime(block.start)}–${formatTime(block.end)} · ${block.title} · ${block.detail}`)}"><strong>${escapeHtml(block.title)}</strong><span>${escapeHtml(block.detail)}</span></div>`;
      }).join("");
      return `<div class="wf-resource-row"><div class="wf-resource-name"><i style="--person:${person.color}"></i><strong>${escapeHtml(person.name)}</strong></div><div class="wf-resource-track">${ticks.slice(0, -1).map((minute) => `<i class="wf-gridline" style="left:${((minute - START_MINUTE) / span) * 100}%"></i>`).join("")}${blocks}</div></div>`;
    }).join("");
    resourceTimeline.innerHTML = axis + lanes;
  }

  function renderMobileTimeline(day) {
    const moments = [];
    day.events.forEach((event) => moments.push({
      start: event.start_minute,
      end: event.end_minute,
      title: event.title,
      people: event.affected.map((id) => peopleById[id]?.name).filter(Boolean).join(" + "),
      kind: "event",
    }));
    day.entries.forEach((entry) => entry.phases.forEach((phase) => {
      const adult = phase.resource !== "student" ? peopleById[phase.resource]?.name : null;
      moments.push({
        start: phase.start_minute,
        end: phase.end_minute,
        title: entry.title,
        people: [adult, ...entry.student_names].filter(Boolean).join(" + "),
        kind: entry.student_ids.length > 1 ? "group" : phase.resource === "student" ? "solo" : "parent",
      });
    }));
    moments.sort((left, right) => left.start - right.start || left.end - right.end);
    mobileTimeline.innerHTML = moments.length ? moments.map((moment) => `
      <article class="wf-mobile-moment ${moment.kind}"><time>${formatTime(moment.start)}<small>–${formatTime(moment.end)}</small></time><div><strong>${escapeHtml(moment.title)}</strong><span>${escapeHtml(moment.people)}</span></div></article>
    `).join("") : '<p class="wf-no-work">No scheduled work this day.</p>';
  }

  function renderSelectedDay() {
    const day = current.days.find((item) => item.id === selectedDay) || current.days[0];
    selectedDay = day.id;
    dayTabs.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.day === selectedDay;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("tabindex", active ? "0" : "-1");
    });
    renderDesktopTimeline(day);
    renderMobileTimeline(day);
  }

  function renderDayTabs(plan) {
    dayTabs.innerHTML = plan.days.map((day) => `<button type="button" role="tab" id="day-tab-${day.id}" aria-controls="resourceTimeline" data-day="${day.id}"><strong>${day.label.slice(0, 3)}</strong><span>${day.entries.length} assignment${day.entries.length === 1 ? "" : "s"}</span></button>`).join("");
    dayTabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      selectedDay = button.dataset.day;
      renderSelectedDay();
    }));
  }

  dayTabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...dayTabs.querySelectorAll("button")];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    let nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : currentIndex + (event.key === "ArrowRight" ? 1 : -1);
    nextIndex = (nextIndex + tabs.length) % tabs.length;
    tabs[nextIndex].click();
    tabs[nextIndex].focus();
  });

  function renderWeek(plan) {
    const maxParent = Math.max(...plan.days.map((day) => day.entries.reduce((total, entry) => total + entry.parent_minutes, 0)), 1);
    week.innerHTML = plan.days.map((day) => {
      const parentMinutes = day.entries.reduce((total, entry) => total + entry.parent_minutes, 0);
      return `<button type="button" class="wf-day-card" data-day="${day.id}"><span>${day.label}</span><strong>${day.entries.length} assignment${day.entries.length === 1 ? "" : "s"}</strong><div class="wf-load-bar"><i style="width:${(parentMinutes / maxParent) * 100}%"></i></div><small>${parentMinutes} parent minutes</small></button>`;
    }).join("");
    week.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      selectedDay = button.dataset.day;
      renderSelectedDay();
      document.querySelector(".wf-timeline-section").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderExplanations(plan) {
    explanationList.innerHTML = plan.explanations.map((item) => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></article>`).join("");
  }

  function renderChanges(plan) {
    const changed = changedAssignments(plan);
    const baselineTuesday = baseline.days.find((day) => day.id === "tue");
    const affected = baselineTuesday.entries.filter((entry) => entry.start_minute < 12 * 60 + 30).length;
    const late = plan.days.flatMap((day) => day.entries).filter((entry) => entry.late);
    changeSummary.innerHTML = `
      <article><strong>${affected}</strong><span>Tuesday-morning assignments directly affected</span></article>
      <article><strong>${changed.length}</strong><span>assignments repositioned to keep resources conflict-free</span></article>
      <article><strong>${plan.metrics.parent_shortfall}m</strong><span>raw parent-attention shortfall before Wednesday ends</span></article>
      <article><strong>${late.length}</strong><span>assignments moved later rather than silently disappearing</span></article>`;
    changePanel.hidden = false;
  }

  function renderPlan(plan) {
    current = plan;
    results.hidden = false;
    feedbackPanel.hidden = false;
    scheduleTitle.textContent = plan.mode === "disrupted" ? "Rebuilt family week" : "Baseline family week";
    // Wednesday most clearly exposes kickoff → independent → review handoffs,
    // so the experiment opens on the day that best demonstrates the idea.
    selectedDay = "wed";
    renderStatus(plan);
    renderMetrics(plan);
    renderDayTabs(plan);
    renderSelectedDay();
    renderWeek(plan);
    renderExplanations(plan);
    explanations.hidden = true;
    explainButton.textContent = "Why this schedule?";
    explainButton.setAttribute("aria-expanded", "false");
    if (plan.mode === "disrupted") renderChanges(plan);
    results.focus({ preventScroll: true });
  }

  async function build(mode, scenario = config.defaultScenario) {
    const button = mode === "disrupted" ? rebuildButton : generateButton;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = mode === "disrupted" ? "Rebuilding…" : "Building…";
    actionStatus.textContent = "Checking every parent and student constraint…";
    try {
      const response = await fetch(config.scheduleUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({ mode, scenario }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The schedule could not be built.");
      if (mode === "baseline") baseline = payload;
      renderPlan(payload);
      actionStatus.textContent = "";
      generateButton.textContent = "Rebuild Baseline Schedule";
      return payload;
    } catch (error) {
      actionStatus.textContent = error.message;
      return null;
    } finally {
      button.disabled = false;
      if (mode === "disrupted") button.textContent = original;
    }
  }

  generateButton.addEventListener("click", () => {
    rebuildButton.hidden = true;
    disruptButton.hidden = false;
    disruptionCopy.textContent = "Remove Tuesday morning while keeping genuinely available independent afternoon work.";
    changePanel.hidden = true;
    build("baseline");
  });

  disruptButton.addEventListener("click", () => {
    disruptButton.hidden = true;
    rebuildButton.hidden = false;
    disruptionCopy.innerHTML = "Tuesday 9:00 AM–12:30 PM is now unavailable. <strong>Avery’s genuinely independent afternoon window remains usable.</strong>";
    rebuildButton.focus();
  });

  rebuildButton.addEventListener("click", () => build("disrupted"));

  explainButton.addEventListener("click", () => {
    explanations.hidden = !explanations.hidden;
    explainButton.textContent = explanations.hidden ? "Why this schedule?" : "Hide explanations";
    explainButton.setAttribute("aria-expanded", String(!explanations.hidden));
    if (!explanations.hidden) explanations.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  feedbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = feedbackForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const response = await fetch(config.feedbackUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrfToken },
        body: JSON.stringify({
          realistic: byId("feedbackRealistic").value,
          comment: byId("feedbackComment").value,
          contact: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Feedback could not be saved.");
      feedbackForm.reset();
      feedbackStatus.textContent = "Thank you—your feedback was saved.";
    } catch (error) {
      feedbackStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  demoPlayButton.addEventListener("click", playDemo);
  demoNextButton.addEventListener("click", () => {
    if (demoPlaying) stopDemoPlayback();
    runDemoStep();
  });
  demoResetButton.addEventListener("click", resetDemo);
  demoFinishButton.addEventListener("click", async () => {
    const task = demoScenario.tasks.find((candidate) => !demoScenario.completed_task_ids.includes(candidate.id));
    if (!task) return;
    demoFinishButton.disabled = true;
    demoCleanupCopy.textContent = `Marking “${task.title}” finished and rebuilding the remaining week…`;
    demoScenario.completed_task_ids.push(task.id);
    const plan = await build("baseline", demoScenario);
    demoCleanupCopy.textContent = plan
      ? `Done. “${task.title}” is complete; ${plan.scheduled_count} remaining assignments were checked again.`
      : "That cleanup could not be applied. Please try again.";
  });
  demoRemoveButton.addEventListener("click", async () => {
    const task = demoScenario.tasks.find((candidate) => candidate.priority <= 2)
      || demoScenario.tasks.at(-1);
    if (!task) return;
    demoRemoveButton.disabled = true;
    demoCleanupCopy.textContent = `Removing flexible work “${task.title}” and rebuilding…`;
    demoScenario.tasks = demoScenario.tasks.filter((candidate) => candidate.id !== task.id);
    demoScenario.completed_task_ids = demoScenario.completed_task_ids.filter((taskId) => taskId !== task.id);
    const plan = await build("baseline", demoScenario);
    demoCleanupCopy.textContent = plan
      ? `Removed. The ${plan.total_count}-assignment week was rebuilt without losing the other work.`
      : "That cleanup could not be applied. Please try again.";
  });

  resetDemo();
})();
