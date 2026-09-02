(() => {
  const config = window.WEEKFLOW_CONFIG;
  const generateButton = document.querySelector("#generateButton");
  const explainButton = document.querySelector("#explainButton");
  const missButton = document.querySelector("#missButton");
  const rebalanceButton = document.querySelector("#rebalanceButton");
  const emptyState = document.querySelector("#emptyState");
  const results = document.querySelector("#results");
  const statusBanner = document.querySelector("#statusBanner");
  const metrics = document.querySelector("#metrics");
  const resolutionPanel = document.querySelector("#resolutionPanel");
  const warningList = document.querySelector("#warningList");
  const recommendationList = document.querySelector("#recommendationList");
  const week = document.querySelector("#week");
  const scheduleTitle = document.querySelector("#scheduleTitle");
  const explanations = document.querySelector("#explanations");
  const explanationList = document.querySelector("#explanationList");
  const steps = Array.from(document.querySelectorAll(".wf-step"));

  const studentColors = Object.fromEntries(
    config.students.map((student) => [student.id, student.color]),
  );

  let current = null;
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
    metrics.innerHTML = [
      metricCard(
        "Assignments",
        String(data.scheduled_count),
        data.unscheduled_count ? `${data.unscheduled_count} could not fit` : "All placed this week",
        data.unscheduled_count > 0,
      ),
      metricCard(
        "Student capacity",
        allStudentsFit ? "Fits" : "Short",
        allStudentsFit
          ? "Every child has enough individual time"
          : "At least one child lacks enough time",
        !allStudentsFit,
      ),
      metricCard(
        "Parent attention",
        formatMinutes(parent.parent_demand),
        `required before ${parent.due_label} ends`,
      ),
      metricCard(
        "Parent shortfall",
        parent.parent_shortfall ? formatMinutes(parent.parent_shortfall) : "None",
        parent.parent_shortfall
          ? `${formatMinutes(parent.parent_capacity)} available before the deadline`
          : `${formatMinutes(parent.parent_capacity)} available before the deadline`,
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

  function dayMarkup(day) {
    let body;
    if (day.missed) {
      body = `<div class="wf-missed-message"><strong>Morning lost</strong><span>No student or parent capacity remains.</span></div>`;
    } else if (!day.entries.length) {
      body = `<div class="wf-no-work">No work scheduled</div>`;
    } else {
      body = day.entries.map(blockMarkup).join("");
    }
    return `
      <section class="wf-day${day.missed ? " is-missed" : ""}">
        <header class="wf-day-header">
          <div><strong>${day.label}</strong><small>${day.start}–${day.end}</small></div>
          <span class="wf-day-count">${day.missed ? "Unavailable" : `${day.entries.length} blocks`}</span>
        </header>
        <div class="wf-day-body">${body}</div>
      </section>`;
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

    const shortfall = data.metrics.parent_shortfall;
    statusBanner.classList.toggle("is-disrupted", data.mode === "disrupted");
    if (data.mode === "baseline") {
      statusBanner.innerHTML = `
        <strong>Baseline generated without resource conflicts.</strong>
        <span>Independent phases create room for one-on-one teaching; all work lands by Wednesday.</span>`;
      scheduleTitle.textContent = "Baseline family schedule";
    } else {
      statusBanner.innerHTML = `
        <strong>Tuesday was removed and the household was re-optimized.</strong>
        <span>${shortfall ? `Student time still fits, but direct parent attention is short by ${formatMinutes(shortfall)} before Wednesday ends.` : "All work still fits before the deadline."}</span>`;
      scheduleTitle.textContent = "Re-optimized family schedule";
    }

    renderMetrics(data);
    renderResolution(data);
    week.innerHTML = data.days.map(dayMarkup).join("");
    renderExplanations(data.explanations);
    explainButton.disabled = false;
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
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error(`Scheduler returned ${response.status}`);
      render(await response.json());
      succeeded = true;
      if (mode === "baseline") {
        missButton.disabled = false;
        missButton.textContent = "Miss Tuesday Morning";
        rebalanceButton.hidden = true;
        setStep(1);
      } else {
        rebalanceButton.hidden = true;
        missButton.disabled = true;
        missButton.textContent = "Tuesday Morning Missed";
        setStep(3);
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
    missButton.textContent = "Tuesday Morning Missed";
    rebalanceButton.hidden = false;
    statusBanner.classList.add("is-disrupted");
    statusBanner.innerHTML = `
      <strong>Tuesday morning just went sideways.</strong>
      <span>The old plan is now invalid. Re-optimize to preserve student, parent, and deadline constraints.</span>`;
    const tuesday = week.querySelector(".wf-day");
    if (tuesday) tuesday.classList.add("is-missed");
  });

  rebalanceButton.addEventListener("click", () => fetchSchedule("disrupted", rebalanceButton));
})();
