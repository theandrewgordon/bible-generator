"use strict";

const body = document.body;
const code = body.dataset.roomCode;
const role = body.dataset.role;
const app = document.querySelector("#bee-app");
const toast = document.querySelector("#bee-toast");
const connectionStatus = document.querySelector("#bee-connection");
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
let latestState = null;
let requestInFlight = false;
let failedRefreshes = 0;
let lastRenderSignature = "";

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function scoreRail(state, controls = "") {
  const players = state.players.length
    ? state.players.map(player => `
        <div class="player-score">
          <span class="player-avatar">${escapeHTML(initials(player.name))}</span>
          <strong>${escapeHTML(player.name)} <i class="presence-dot ${player.connected ? "online" : "offline"}" title="${player.connected ? "Connected" : "Reconnecting"}"></i></strong>
          <output>${player.score}</output>
          ${role === "host" && state.phase === "lobby"
            ? `<button class="remove-player" data-player-id="${escapeHTML(player.id)}" type="button" aria-label="Remove ${escapeHTML(player.name)}">×</button>`
            : role === "host"
              ? `<span class="score-adjust">
                  <button data-player-id="${escapeHTML(player.id)}" data-score-delta="-50" type="button" aria-label="Remove 50 points from ${escapeHTML(player.name)}">−</button>
                  <button data-player-id="${escapeHTML(player.id)}" data-score-delta="50" type="button" aria-label="Add 50 points to ${escapeHTML(player.name)}">+</button>
                </span>`
              : ""}
        </div>`).join("")
    : `<p class="host-controls">Players will appear here when they join.</p>`;
  return `<aside class="score-rail">
    <h2>Players</h2>
    <div class="score-list">${players}</div>
    ${role === "host" ? `
      <div class="join-invite">
        <span class="host-only-label">Host only</span>
        <strong>Invite the family</strong>
        <p class="join-url">${escapeHTML(`${window.location.origin}/family-bible-bee/join/${code}`)}</p>
      </div>
      <div class="host-controls">
        ${controls}
        <a class="bee-button secondary full" href="/family-bible-bee/display/${encodeURIComponent(code)}" target="_blank" rel="noopener">Open TV display</a>
        <button id="copy-join-link" class="bee-button secondary full" type="button">Copy join link</button>
        ${["question", "reveal", "paused"].includes(state.phase)
          ? `<button id="pause-game" class="text-button" type="button">${state.phase === "paused" ? "Resume game" : "Pause game"}</button>
             <button id="skip-question" class="text-button" type="button" ${state.phase === "paused" ? "disabled" : ""}>Skip question</button>
             <button id="end-game-early" class="text-button danger-text" type="button">End game early</button>`
          : ""}
        <button id="close-room" class="text-button" type="button">End this room</button>
      </div>` : ""}
  </aside>`;
}

function renderLobby(state) {
  if (role === "player") {
    const me = state.players.find(player => player.id === state.viewer.player_id);
    app.innerHTML = `<section class="game-stage player-wait">
      <div class="celebration-mark">✦</div>
      <h1>You’re in, ${escapeHTML(me?.name || "player")}!</h1>
      <p>The host will begin when everyone is ready.</p>
      <p class="waiting-dots">Waiting for the family</p>
    </section>`;
    return;
  }
  const startDisabled = state.players.length ? "" : "disabled";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage lobby-stage">
      <p class="round-meta">${escapeHTML(state.deck_name)} · ${escapeHTML(state.translation)} · ${escapeHTML(state.game_style)}</p>
      <h1>Gather your family</h1>
      <p>Open FaithSparks on each phone and enter this room code.</p>
      <div class="lobby-code-row">
        <div class="big-code">${escapeHTML(code)}</div>
        <div class="lobby-qr">
          <img src="/family-bible-bee/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
          <span>Scan to join</span>
        </div>
      </div>
      <p>${state.players.length} ${state.players.length === 1 ? "player is" : "players are"} ready</p>
    </section>
    ${scoreRail(state, `<button id="start-game" class="bee-button primary full" type="button" ${startDisabled}>Start ${state.question_total} rounds</button>`)}
  </div>`;
  document.querySelector("#start-game")?.addEventListener("click", () => hostAction("start"));
  bindRoomManagement();
}

function answerButtons(state) {
  const question = state.question;
  const viewerAnswer = state.viewer.answer;
  return question.choices.map((choice, index) => {
    const selected = viewerAnswer === index;
    const correct = state.phase === "reveal" && question.correct === index;
    const wrongSelected = state.phase === "reveal" && selected && !correct;
    const classes = [
      "answer-button",
      selected ? "selected" : "",
      correct ? "correct-answer" : "",
      wrongSelected ? "wrong-answer" : "",
    ].filter(Boolean).join(" ");
    const disabled = role !== "player" || state.viewer.has_answered || state.phase === "reveal";
    return `<button class="${classes}" data-choice="${index}" type="button" ${disabled ? "disabled" : ""}>
      <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHTML(choice)}</span>
    </button>`;
  }).join("");
}

function renderQuestion(state) {
  const answered = state.answered_player_ids.length;
  const question = state.question;
  let controls = "";
  if (role === "host") {
    controls = state.phase === "question"
      ? `<p>${answered} of ${state.players.length} answered</p>
         <button id="reveal-answer" class="bee-button primary full" type="button">Reveal answer</button>`
      : `<button id="next-question" class="bee-button primary full" type="button">${state.question_index + 1 >= state.question_total ? "See final results" : "Next round"}</button>`;
  }

  let feedback = "";
  if (role === "player" && state.phase === "question" && state.viewer.has_answered) {
    feedback = `<p class="answer-feedback">Answer locked in. Look up at the shared screen!</p>`;
  } else if (role === "player" && state.phase === "reveal") {
    feedback = state.viewer.correct
      ? `<p class="answer-feedback good">Wonderful remembering! +${state.viewer.round_points || 0} points, including your speed bonus.</p>`
      : `<p class="answer-feedback try">Good try—this one will come back for review.</p>`;
  }

  app.innerHTML = `<div class="game-layout">
    <section class="game-stage">
      <div class="round-meta">
        <span>Round ${state.question_index + 1} of ${state.question_total}</span>
        <span>${escapeHTML(state.translation)}</span>
      </div>
      <h1 class="mode-banner">${escapeHTML(question.label)}</h1>
      <p class="question-prompt">${escapeHTML(question.prompt)}</p>
      <div class="answers">${answerButtons(state)}</div>
      ${feedback}
      ${state.phase === "reveal" ? `<div class="revealed-verse"><strong>${escapeHTML(question.reference)}</strong><p>${escapeHTML(question.answer_text || "")}</p></div>` : ""}
    </section>
    ${scoreRail(state, controls)}
  </div>`;

  document.querySelectorAll(".answer-button:not(:disabled)").forEach(button => {
    button.addEventListener("click", () => submitAnswer(Number(button.dataset.choice)));
  });
  document.querySelector("#reveal-answer")?.addEventListener("click", () => hostAction("reveal"));
  document.querySelector("#next-question")?.addEventListener("click", () => hostAction("next"));
  bindRoomManagement();
}

function renderFinished(state) {
  const topScore = state.players[0]?.score;
  const winners = state.players.filter(player => player.score === topScore);
  const winnerHeading = winners.length > 1
    ? `It’s a tie: ${winners.map(player => escapeHTML(player.name)).join(" & ")}!`
    : winners.length === 1
      ? `Wonderful work, ${escapeHTML(winners[0].name)}!`
      : "Wonderful work!";
  const summary = state.review_summary || {};
  const reviewRows = (summary.review_tomorrow || []).length
    ? summary.review_tomorrow.map(item => `<div class="review-row">
        <strong>${escapeHTML(item.reference)}</strong>
        <span>${item.missed} ${item.missed === 1 ? "player needs" : "players need"} another look</span>
      </div>`).join("")
    : `<p>Every verse was answered correctly. Beautiful work!</p>`;
  const strengths = (summary.strengths || []).length
    ? summary.strengths.map(item => `<li>${escapeHTML(item.reference)}</li>`).join("")
    : `<li>Showing up and practicing together</li>`;
  const playerFeedback = (summary.players || []).map(player => `
    <div class="feedback-card">
      <strong>${escapeHTML(player.name)}</strong>
      <span class="encouragement-badge">${escapeHTML(player.badge)}</span>
      <b>${player.correct} of ${player.total} correct</b>
      <p>${escapeHTML(player.message)}</p>
    </div>`).join("");
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage finished-stage">
      <div class="celebration-mark">✦</div>
      <h1>${winnerHeading}</h1>
      <p>You practiced ${state.question_total} passages together. Accuracy matters, but faithful practice is the real win.</p>
      <div class="review-list">
        <h2>Review tomorrow</h2>
        ${reviewRows}
        <h2>Family strengths</h2>
        <ul>${strengths}</ul>
        ${playerFeedback ? `<div class="feedback-grid">${playerFeedback}</div>` : ""}
        ${summary.suggested_deck ? `<p class="next-deck">Try next: <strong>${escapeHTML(summary.suggested_deck)}</strong></p>` : ""}
      </div>
      <a class="bee-button secondary" href="/family-bible-bee">Start another room</a>
    </section>
    ${scoreRail(state)}
  </div>`;
  bindRoomManagement();
}

function renderPaused(state) {
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage player-wait">
      <div class="celebration-mark">Ⅱ</div>
      <h1>Game paused</h1>
      <p>The host will resume when everyone is ready.</p>
    </section>
    ${scoreRail(state)}
  </div>`;
  bindRoomManagement();
}

function bindRoomManagement() {
  document.querySelectorAll(".remove-player").forEach(button => {
    button.addEventListener("click", () => removePlayer(button.dataset.playerId));
  });
  document.querySelectorAll("[data-score-delta]").forEach(button => {
    button.addEventListener("click", () => adjustScore(button.dataset.playerId, Number(button.dataset.scoreDelta)));
  });
  document.querySelector("#close-room")?.addEventListener("click", closeRoom);
  document.querySelector("#copy-join-link")?.addEventListener("click", copyJoinLink);
  document.querySelector("#pause-game")?.addEventListener("click", () => hostAction("pause"));
  document.querySelector("#skip-question")?.addEventListener("click", () => hostAction("skip"));
  document.querySelector("#end-game-early")?.addEventListener("click", async () => {
    if (window.confirm("End the game now and show the review summary?")) await hostAction("end");
  });
}

function render(state) {
  latestState = state;
  if (state.phase === "lobby") renderLobby(state);
  else if (state.phase === "question" || state.phase === "reveal") renderQuestion(state);
  else if (state.phase === "paused") renderPaused(state);
  else renderFinished(state);
}

async function refresh() {
  if (requestInFlight) return;
  requestInFlight = true;
  try {
    const state = await api(`/api/family-bible-bee/rooms/${code}`);
    failedRefreshes = 0;
    connectionStatus.classList.remove("show");
    const signature = JSON.stringify(state);
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      render(state);
    }
  } catch (error) {
    failedRefreshes += 1;
    if (failedRefreshes >= 2) connectionStatus.classList.add("show");
  } finally {
    requestInFlight = false;
  }
}

async function heartbeat() {
  if (role !== "player" || document.hidden) return;
  try {
    await api(`/api/family-bible-bee/rooms/${code}/heartbeat`, { method: "POST", body: "{}" });
  } catch (error) {
    // Refresh owns the visible recovery status so a brief heartbeat miss is quiet.
  }
}

async function hostAction(action) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/${action}`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function submitAnswer(choice) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/answer`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function removePlayer(playerId) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/players/${encodeURIComponent(playerId)}/remove`, {
      method: "POST",
      body: "{}",
    });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function adjustScore(playerId, delta) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/players/${encodeURIComponent(playerId)}/score`, {
      method: "POST",
      body: JSON.stringify({ delta }),
    });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function copyJoinLink() {
  const url = `${window.location.origin}/family-bible-bee/join/${code}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Join link copied.");
  } catch (error) {
    showToast("Copy this link: " + url);
  }
}

async function closeRoom() {
  if (!window.confirm("End this room for everyone?")) return;
  try {
    const result = await api(`/api/family-bible-bee/rooms/${code}/close`, {
      method: "POST",
      body: "{}",
    });
    window.location.href = result.redirect;
  } catch (error) {
    showToast(error.message);
  }
}

refresh();
window.setInterval(refresh, 1200);
heartbeat();
window.setInterval(heartbeat, 15000);
window.addEventListener("online", () => {
  refresh();
  heartbeat();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    heartbeat();
  }
});
