"use strict";

const body = document.body;
const code = body.dataset.roomCode;
const role = body.dataset.role;
const app = document.querySelector("#act-app");
const toast = document.querySelector("#act-toast");
const connectionStatus = document.querySelector("#act-connection");
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
let latestState = null;
let requestInFlight = false;
let lastRenderSignature = "";
let failedRefreshes = 0;

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
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function topPlayers(players, limit = 5) {
  return [...(players || [])].sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name)).slice(0, limit);
}

function topTeams(teams) {
  const sorted = [...(teams || [])].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  return sorted.filter(team => team.score === topScore);
}

function teamBoard(state, display = false) {
  if (!state.team_mode || !state.teams?.length) return "";
  const className = display ? "act-display-team-board" : "team-scoreboard";
  return `<div class="${className}">
    ${state.teams.map(team => `<section class="${display ? "act-display-team" : "team-score-card"} team-${escapeHTML(team.color)}">
      <strong>${escapeHTML(team.name)}</strong>
      <output>${team.score}</output>
      <small>${team.players} ${team.players === 1 ? "player" : "players"}</small>
    </section>`).join("")}
  </div>`;
}

function playerRows(state, manage = false) {
  if (!state.players.length) return `<p class="host-controls">Players will appear here when they join.</p>`;
  return state.players.map(player => {
    const teamLabel = state.team_mode && player.team_name
      ? `<small class="team-pill team-${escapeHTML(player.team_color)}">${escapeHTML(player.team_name.replace(" Team", ""))}</small>`
      : "";
    const management = manage
      ? `<span class="player-management">
          ${state.team_mode ? `<button class="switch-team-player" data-switch-team-player-id="${escapeHTML(player.id)}" type="button">Switch team</button>` : ""}
          <button class="remove-player" data-player-id="${escapeHTML(player.id)}" type="button" aria-label="Remove ${escapeHTML(player.name)}">×</button>
        </span>`
      : "";
    return `<div class="player-score">
      <span class="player-avatar">${escapeHTML(initials(player.name))}</span>
      <strong>${escapeHTML(player.name)} ${teamLabel} <i class="presence-dot ${player.connected ? "online" : "offline"}" title="${player.connected ? "Connected" : "Reconnecting"}"></i></strong>
      <output>${player.score}</output>
      ${management}
    </div>`;
  }).join("");
}

function scoreRail(state, controls = "") {
  return `<aside class="score-rail">
    <h2>Players <span class="family-score">${state.team_mode ? "Teams" : "Scores"}</span></h2>
    ${teamBoard(state)}
    <div class="score-list">${playerRows(state, role === "host" && state.phase === "lobby")}</div>
    ${role === "host" ? `<div class="host-controls">
      ${controls}
      <a class="bee-button secondary full" href="/group-games/act-it-out/display/${encodeURIComponent(code)}" target="_blank" rel="noopener">Open TV display</a>
      <button id="copy-join-link" class="bee-button secondary full" type="button">Copy join link</button>
      ${["round", "reveal"].includes(state.phase) ? `<button id="end-game" class="text-button danger-text" type="button">End game</button>` : ""}
    </div>` : ""}
  </aside>`;
}

function modeLabel(mode) {
  if (mode === "guess") return "Guess the story";
  return mode === "clue" ? "Give clues" : "Act it out";
}

function clueList(round, compact = false) {
  if (round?.mode !== "guess") return "";
  const clues = round.clues || [];
  const remaining = Math.max(0, (round.clue_count || 0) - clues.length);
  return `<div class="${compact ? "guess-clues compact" : "guess-clues"}">
    <strong>Clues</strong>
    ${clues.length
      ? `<ol>${clues.map(clue => `<li>${escapeHTML(clue)}</li>`).join("")}</ol>`
      : `<p>Clues will appear here.</p>`}
    ${remaining ? `<small>${remaining} more ${remaining === 1 ? "clue" : "clues"} ready</small>` : `<small>All clues revealed</small>`}
  </div>`;
}

function renderLobby(state) {
  if (role === "player") {
    const me = state.players.find(player => player.id === state.viewer.player_id);
    app.innerHTML = `<section class="game-stage player-wait">
      <div class="celebration-mark">✦</div>
      <h1>You’re in, ${escapeHTML(me?.name || "player")}!</h1>
      <p>${me?.team_name ? `You are on ${escapeHTML(me.team_name)}.` : "The host will start soon."}</p>
      <p class="waiting-dots">Look at the shared screen</p>
    </section>`;
    return;
  }
  const startDisabled = state.players.length ? "" : "disabled";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage lobby-stage">
      <p class="round-meta">${escapeHTML(state.theme)} · 10 rounds · 45 seconds</p>
      <h1>Gather your players</h1>
      <p>Scan the QR code or enter the room code.</p>
      <div class="lobby-code-row">
        <div class="big-code">${escapeHTML(code)}</div>
        <div class="lobby-qr">
          <img src="/group-games/act-it-out/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
          <span>Scan to join</span>
        </div>
      </div>
      <p>${state.players.length} ${state.players.length === 1 ? "player is" : "players are"} ready</p>
    </section>
    ${scoreRail(state, `${state.team_mode ? `<button id="rebalance-teams" class="bee-button secondary full" type="button" ${state.players.length < 2 ? "disabled" : ""}>Balance teams</button>` : ""}
      <button id="start-game" class="bee-button primary full" type="button" ${startDisabled}>Start game</button>`)}
  </div>`;
  document.querySelector("#start-game")?.addEventListener("click", () => hostAction("start"));
  document.querySelector("#rebalance-teams")?.addEventListener("click", rebalanceTeams);
  bindManagement();
}

function secretPromptCard(prompt) {
  if (!prompt) return "";
  return `<div class="secret-prompt-card">
    <span>${escapeHTML(modeLabel(prompt.mode))}</span>
    <h2>${escapeHTML(prompt.answer)}</h2>
    <p>${escapeHTML(prompt.instruction || (prompt.mode === "clue" ? "Describe it without saying the answer." : "No talking. Use motions only."))}</p>
    ${prompt.forbidden_words?.length ? `<div class="forbidden-words"><strong>Don’t say</strong>${prompt.forbidden_words.map(word => `<b>${escapeHTML(word)}</b>`).join("")}</div>` : ""}
    ${prompt.mode === "guess" && prompt.clues?.length ? `<div class="secret-clue-bank"><strong>Clue bank</strong>${prompt.clues.map(clue => `<span>${escapeHTML(clue)}</span>`).join("")}</div>` : ""}
  </div>`;
}

function renderRound(state) {
  const isActivePlayer = role === "player" && state.viewer.player_id === state.active_player_id;
  if (role === "player") {
    const hasSecretPrompt = Boolean(state.viewer.secret_prompt);
    app.innerHTML = `<section class="game-stage player-turn-stage">
      ${isActivePlayer && hasSecretPrompt
        ? `<p class="round-meta">Your turn · ${escapeHTML(state.active_team_name || "Play")}</p>
           <h1>${escapeHTML(modeLabel(state.viewer.secret_prompt?.mode))}</h1>
           ${secretPromptCard(state.viewer.secret_prompt)}`
        : `<div class="celebration-mark">✦</div>
           <h1>Look at the screen</h1>
           <p>${state.round?.mode === "guess"
             ? `${escapeHTML(state.active_team_name || "Your team")} is guessing from the TV clues.`
             : `${escapeHTML(state.active_player_name || "A player")} is up for ${escapeHTML(state.active_team_name || "this round")}.`}</p>`}
    </section>`;
    return;
  }
  const activePrompt = state.viewer.secret_prompt;
  const isGuess = state.round?.mode === "guess";
  const canRevealClue = isGuess && (state.round?.clues?.length || 0) < (state.round?.clue_count || 0);
  const controls = role === "host"
    ? `${canRevealClue ? `<button id="reveal-clue" class="bee-button secondary full" type="button">Reveal next clue</button>` : ""}
       <button id="correct-round" class="bee-button primary full" type="button">Correct +100</button>
       <button id="pass-round" class="bee-button secondary full" type="button">Pass</button>`
    : "";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage act-round-stage">
      <p class="round-meta">Round ${state.round_index + 1} of ${state.round_total}</p>
      <h1>${isGuess ? `${escapeHTML(state.active_team_name || "Team")} guesses` : `${escapeHTML(state.active_player_name || "Player")} is up`}</h1>
      <p class="act-team-line">${escapeHTML(state.active_team_name || "Individual round")}</p>
      <div class="act-timer"><strong data-act-countdown>${state.timer_seconds}</strong><span>seconds</span></div>
      <p class="act-display-instruction">${isGuess ? "Reveal clues one at a time. The team guesses out loud." : activePrompt ? "Secret prompt is visible below for the host." : "Guess out loud. The answer is hidden from the TV."}</p>
      ${clueList(state.round)}
      ${role === "host" ? secretPromptCard(activePrompt) : ""}
    </section>
    ${scoreRail(state, controls)}
  </div>`;
  document.querySelector("#reveal-clue")?.addEventListener("click", () => hostAction("clue"));
  document.querySelector("#correct-round")?.addEventListener("click", () => hostAction("correct"));
  document.querySelector("#pass-round")?.addEventListener("click", () => hostAction("pass"));
  bindManagement();
}

function renderReveal(state) {
  const result = state.last_result || {};
  const isCorrect = result.outcome === "correct";
  const controls = role === "host"
    ? `<button id="next-round" class="bee-button primary full" type="button">${state.round_index + 1 >= state.round_total ? "See winner" : "Next round"}</button>`
    : "";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage act-reveal-stage">
      <div class="celebration-mark">${isCorrect ? "✓" : "✦"}</div>
      <h1>${isCorrect ? "Correct!" : "Passed"}</h1>
      <p>${escapeHTML(state.active_player_name || "Player")} ${isCorrect ? "earned 100 points." : "can try another next time."}</p>
      <div class="revealed-verse"><strong>Answer</strong><p>${escapeHTML(state.round?.answer || result.answer || "")}</p></div>
      ${clueList(state.round, true)}
      ${teamBoard(state, true)}
    </section>
    ${scoreRail(state, controls)}
  </div>`;
  document.querySelector("#next-round")?.addEventListener("click", () => hostAction("next"));
  bindManagement();
}

function renderFinished(state) {
  const teamWinners = state.team_mode ? topTeams(state.teams) : [];
  const leaders = topPlayers(state.players, 5);
  const heading = state.team_mode
    ? teamWinners.length > 1 ? "Team Tie!" : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
    : leaders.length ? `${escapeHTML(leaders[0].name)} Wins!` : "Game complete!";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage finished-stage">
      <div class="celebration-mark">✦</div>
      <h1>${heading}</h1>
      <p>Great job acting, guessing, laughing, and learning together.</p>
      ${teamBoard(state, true)}
      <div class="top-individuals">
        <h2>Top players</h2>
        ${leaders.map((player, index) => `<div><span>${index + 1}. ${escapeHTML(player.name)}</span><strong>${player.score}</strong></div>`).join("")}
      </div>
      <div class="next-game-actions">
        <a class="bee-button secondary" href="/group-games/act-it-out">Back to Act It Out</a>
      </div>
    </section>
    ${scoreRail(state)}
  </div>`;
  bindManagement();
}

function displayRosters(state) {
  if (!state.team_mode) return "";
  return `<div class="display-rosters">
    ${state.teams.map(team => {
      const players = state.players.filter(player => player.team_id === team.id);
      return `<section class="display-roster team-${escapeHTML(team.color)}">
        <h2>${escapeHTML(team.name)}</h2>
        <div>${players.length ? players.map(player => `<span>${escapeHTML(player.name)}</span>`).join("") : "<small>Waiting</small>"}</div>
      </section>`;
    }).join("")}
  </div>`;
}

function renderDisplay(state) {
  if (state.phase === "lobby") {
    app.innerHTML = `<section class="display-stage display-lobby">
      <p class="display-kicker">Act It Out · ${escapeHTML(state.theme)}</p>
      <h1>Join the Game</h1>
      <div class="display-join-row">
        <div><span>Room code</span><strong>${escapeHTML(code)}</strong></div>
        <img src="/group-games/act-it-out/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
      </div>
      <p class="display-count">${state.players.length} ${state.players.length === 1 ? "player" : "players"} ready</p>
      ${displayRosters(state)}
    </section>`;
  } else if (state.phase === "round") {
    const isGuess = state.round?.mode === "guess";
    app.innerHTML = `<section class="display-stage act-display-round ${isGuess ? "guess-display-round" : ""}">
      <div class="display-topline"><span>Round ${state.round_index + 1} of ${state.round_total}</span><span>${escapeHTML(state.active_team_name || "Play")}</span></div>
      ${teamBoard(state, true)}
      <h1>${isGuess ? `${escapeHTML(state.active_team_name || "Team")} guesses` : `${escapeHTML(state.active_player_name || "Player")} is up`}</h1>
      <p class="display-prompt">${escapeHTML(modeLabel(state.round?.mode))}</p>
      ${clueList(state.round)}
      <div class="act-timer display"><strong data-act-countdown>${state.timer_seconds}</strong><span>seconds</span></div>
      <p class="act-display-instruction">${isGuess ? "Call out the answer when your team knows it." : "Guess out loud. The prompt is on their phone."}</p>
    </section>`;
  } else if (state.phase === "reveal") {
    const isCorrect = state.last_result?.outcome === "correct";
    app.innerHTML = `<section class="display-stage act-display-reveal">
      <div class="celebration-mark">${isCorrect ? "✓" : "✦"}</div>
      <h1>${isCorrect ? "Correct!" : "Passed"}</h1>
      <div class="display-reveal"><span>Answer</span><p>${escapeHTML(state.round?.answer || state.last_result?.answer || "")}</p></div>
      ${clueList(state.round, true)}
      ${teamBoard(state, true)}
    </section>`;
  } else {
    const teamWinners = state.team_mode ? topTeams(state.teams) : [];
    const leaders = topPlayers(state.players, 5);
    const heading = state.team_mode
      ? teamWinners.length > 1 ? "Team Tie!" : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
      : leaders.length ? `${escapeHTML(leaders[0].name)} Wins!` : "Game complete!";
    app.innerHTML = `<section class="display-stage display-final">
      <div class="celebration-mark">✦</div>
      <h1>${heading}</h1>
      ${teamBoard(state, true)}
      <div class="display-top-players">
        <h2>Top players</h2>
        ${leaders.map((player, index) => `<div><span>${index + 1}. ${escapeHTML(player.name)}</span><strong>${player.score}</strong></div>`).join("")}
      </div>
    </section>`;
  }
}

function render(state) {
  latestState = state;
  if (role === "display") renderDisplay(state);
  else if (state.phase === "lobby") renderLobby(state);
  else if (state.phase === "round") renderRound(state);
  else if (state.phase === "reveal") renderReveal(state);
  else renderFinished(state);
  updateCountdown();
}

function updateCountdown() {
  if (!latestState?.round_deadline || latestState.phase !== "round") return;
  const remaining = Math.max(0, Math.ceil(latestState.round_deadline - Date.now() / 1000));
  document.querySelectorAll("[data-act-countdown]").forEach(node => { node.textContent = String(remaining); });
}

async function refresh() {
  if (requestInFlight) return;
  requestInFlight = true;
  try {
    const state = await api(`/api/group-games/act-it-out/rooms/${code}`);
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
    await api(`/api/group-games/act-it-out/rooms/${code}/heartbeat`, { method: "POST", body: "{}" });
  } catch (_error) {
  }
}

async function hostAction(action) {
  try {
    await api(`/api/group-games/act-it-out/rooms/${code}/${action}`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function switchTeam(playerId) {
  try {
    await api(`/api/group-games/act-it-out/rooms/${code}/players/${encodeURIComponent(playerId)}/team`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function rebalanceTeams() {
  try {
    await api(`/api/group-games/act-it-out/rooms/${code}/teams/rebalance`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function removePlayer(playerId) {
  try {
    await api(`/api/group-games/act-it-out/rooms/${code}/players/${encodeURIComponent(playerId)}/remove`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function copyJoinLink() {
  const url = `${window.location.origin}/group-games/act-it-out/join/${code}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Join link copied.");
  } catch (_error) {
    showToast("Copy this link: " + url);
  }
}

function bindManagement() {
  document.querySelectorAll("[data-switch-team-player-id]").forEach(button => {
    button.addEventListener("click", () => switchTeam(button.dataset.switchTeamPlayerId));
  });
  document.querySelectorAll(".remove-player").forEach(button => {
    button.addEventListener("click", () => removePlayer(button.dataset.playerId));
  });
  document.querySelector("#copy-join-link")?.addEventListener("click", copyJoinLink);
  document.querySelector("#end-game")?.addEventListener("click", () => {
    if (window.confirm("End this game and show final scores?")) hostAction("end");
  });
}

refresh();
window.setInterval(refresh, 1200);
window.setInterval(updateCountdown, 250);
heartbeat();
window.setInterval(heartbeat, 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    heartbeat();
  }
});
