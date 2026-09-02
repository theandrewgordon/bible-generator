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
  const week = document.querySelector("#week");
  const scheduleTitle = document.querySelector("#scheduleTitle");
  const explanations = document.querySelector("#explanations");
  const explanationList = document.querySelector("#explanationList");
  const scenarioSummary = document.querySelector("#scenarioSummary");
  const planner = document.querySelector(".wf-planner");
  const coopMonday = document.querySelector("#coopMonday");
  const allowNextWeek = document.querySelector("#allowNextWeek");
  const deadlinePolicy = document.querySelector("#deadlinePolicy");
  const tessaAheadButton = document.querySelector("#tessaAheadButton");
  const clearAheadButton = document.querySelector("#clearAheadButton");
  const steps = Array.from(document.querySelectorAll(".wf-step"));

  const studentColors = Object.fromEntries(
    config.students.map((student) => [student.id, student.color]),
  );

  let current = null;

  function checkedValues(selector) {
    return Array.from(document.querySelectorAll(`${selector} input:checked`)).map(
      (input) => input.value,
    );
  }

  function collectScenario() {
    const availabilityEnd = {};
    document.querySelectorAll("#availabilityMatrix select").forEach((select) => {
      availabilityEnd[select.dataset.resource] ||= {};
      availabilityEnd[select.dataset.resource][select.dataset.day] = Number(
        select.value,
      );
    });
    const extendedDays = Object.entries(availabilityEnd.tessa)
      .filter(([, end]) => end > 12 * 60 + 30)
      .map(([day]) => day);
    return {
      coop_monday: coopMonday.checked,
      coop_credit_subjects: checkedValues("#coopCredits"),
      extended_days: extendedDays,
      availability_end: availabilityEnd,
      disruptions: checkedValues("#disruptionOptions"),
      completed_task_ids: checkedValues("#aheadOptions"),
      allow_next_week: allowNextWeek.checked,
      deadline_policy: deadlinePolicy.value,
    };
  }

  function applyScenario(scenario) {
    coopMonday.checked = scenario.coop_monday;
    allowNextWeek.checked = scenario.allow_next_week;
    deadlinePolicy.value = scenario.deadline_policy;
    const groups = [
      ["#coopCredits", scenario.coop_credit_subjects],
      ["#disruptionOptions", scenario.disruptions],
      ["#aheadOptions", scenario.completed_task_ids],
    ];
    groups.forEach(([selector, values]) => {
      document.querySelectorAll(`${selector} input`).forEach((input) => {
        input.checked = values.includes(input.value);
      });
    });
    document.querySelectorAll("#availabilityMatrix select").forEach((select) => {
      select.value = String(
        scenario.availability_end[select.dataset.resource][select.dataset.day],
      );
    });
    syncCoopControls();
  }

  function syncCoopControls() {
    document.querySelectorAll("#coopCredits input").forEach((input) => {
      input.disabled = !coopMonday.checked;
      if (!coopMonday.checked) input.checked = false;
    });
  }

  function updateScenarioSummary() {
    const scenario = collectScenario();
    const parts = [];
    if (scenario.coop_monday) parts.push("Monday CC / co-op");
    if (scenario.coop_monday && scenario.coop_credit_subjects.length) {
      parts.push(`co-op covers ${scenario.coop_credit_subjects.join(" + ")}`);
    }
    if (scenario.extended_days.length) {
      const days = scenario.extended_days.map(
        (day) => day[0].toUpperCase() + day.slice(1),
      );
      parts.push(`Tessa until 4 on ${days.join(", ")}`);
    }
    if (scenario.disruptions.length) {
      parts.push(
        `${scenario.disruptions.length} life change${scenario.disruptions.length === 1 ? "" : "s"}`,
      );
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
        "Parent attention",
        formatMinutes(parent.parent_demand),
        `remaining before ${parent.due_label} ends`,
      ),
      metricCard(
        "Parent shortfall",
        parent.parent_shortfall ? formatMinutes(parent.parent_shortfall) : "None",
        `${formatMinutes(parent.parent_capacity)} usable before the deadline`,
        parent.parent_shortfall > 0,
      ),
    ].join("");
  }

  function phaseMarkup(phase) {
    return `<span class="wf-mini-phase ${phase.resource === "parent" ? "parent" : ""}">${phase.start.replace(" AM", "a").replace(" PM", "p")} · ${phase.minutes}m ${phase.resource === "parent" ? "Mom" : "solo"}</span>`;
  }

  function blockMarkup(entry) {
    const hasParent = entry.parent_minutes > 0;
    const group = entry.student_ids.length > 1;
    const color = studentColors[entry.student_ids[0]] || "#315f53";
    return `
      <article class="wf-block${hasParent ? " has-parent" : ""}${group ? " is-group" : ""}${entry.late ? " is-late" : ""}" style="--owner:${color}">
        <div class="wf-block-top">
          <span>${entry.start}–${entry.end}</span>
          ${entry.late ? '<span class="wf-late-label">Past due</span>' : `<span>${entry.duration} min</span>`}
        </div>
        <h3>${entry.title}</h3>
        <div class="wf-block-owner">${entry.student_names.join(" + ")} · ${entry.subject}</div>
        <div class="wf-block-phases">${entry.phases.map(phaseMarkup).join("")}</div>
      </article>`;
  }

  function eventMarkup(event) {
    return `
      <article class="wf-event-block ${event.kind}">
        <span>${event.start}–${event.end} · ${event.kind}</span>
        <strong>${event.title}</strong>
        <small>${event.detail}</small>
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
          <div><strong>${day.label}</strong><small>${day.start}–${day.end}</small></div>
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
            <strong>${item.title}</strong>
            <small>${item.student_names.join(" + ")} · ${item.detail}</small>
          </article>`,
      )
      .join("");
  }

  function renderExplanations(items) {
    explanationList.innerHTML = items
      .map(
        (item) => `
          <article class="wf-explanation">
            <strong>${item.title}</strong>
            <p>${item.body}</p>
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
            <strong>${warning.title}</strong>
            <p>${warning.body}</p>
          </article>`,
      )
      .join("");

    recommendationList.innerHTML = data.recommendations
      .map(
        (recommendation, index) => `
          <article class="wf-recommendation-card">
            <span>Option ${index + 1}</span>
            <strong>${recommendation.title}</strong>
            <p>${recommendation.body}</p>
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
    renderResolution(data);
    week.innerHTML = data.days.map(dayMarkup).join("");
    renderExplanations(data.explanations);
    explainButton.disabled = false;
    setStep(3);
  }

  async function fetchSchedule(mode, button) {
    setBusy(button, true, mode === "baseline" ? "Optimizing…" : "Re-optimizing…");
    let succeeded = false;
    try {
      const response = await fetch(config.scheduleUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config.csrfToken,
        },
        body: JSON.stringify({ mode, scenario: collectScenario() }),
      });
      if (!response.ok) throw new Error(`Scheduler returned ${response.status}`);
      render(await response.json());
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
      statusBanner.innerHTML = `<strong>Could not run the scheduler.</strong><span>${error.message}</span>`;
      results.hidden = false;
    } finally {
      setBusy(button, false);
      if (mode === "disrupted" && succeeded) button.hidden = true;
    }
  }

  function resetPlan() {
    applyScenario(config.defaultScenario);
    current = null;
    emptyState.hidden = false;
    results.hidden = true;
    completedPanel.hidden = true;
    resolutionPanel.hidden = true;
    explanations.hidden = true;
    explainButton.disabled = true;
    explainButton.textContent = "Explain This Schedule";
    missButton.disabled = true;
    missButton.textContent = "Quick test: Lose Tuesday";
    rebalanceButton.hidden = true;
    setStep(1);
    updateScenarioSummary();
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

  tessaAheadButton.addEventListener("click", () => {
    document
      .querySelectorAll('#aheadOptions input[data-students="Tessa"][data-parent-minutes="0"]')
      .forEach((input) => {
        input.checked = true;
      });
    updateScenarioSummary();
    setStep(2);
  });

  clearAheadButton.addEventListener("click", () => {
    document.querySelectorAll("#aheadOptions input").forEach((input) => {
      input.checked = false;
    });
    updateScenarioSummary();
  });

  planner.addEventListener("change", () => {
    syncCoopControls();
    updateScenarioSummary();
    setStep(2);
    if (current) {
      statusBanner.classList.add("is-disrupted");
      statusBanner.innerHTML = `
        <strong>The planning inputs changed.</strong>
        <span>Optimize again to replace the displayed schedule with one that honors the new week.</span>`;
    }
  });

  resetPlan();
})();
