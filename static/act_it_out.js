"use strict";

const body = document.body;
const code = body.dataset.roomCode;
const role = body.dataset.role;
const gameSlug = body.dataset.gameSlug || "act-it-out";
const gameTitle = body.dataset.gameTitle || "Act It Out";
const isFamilyGameNight = gameTitle === "Family Game Night";
const gameBase = `/group-games/${gameSlug}`;
const gameHome = body.dataset.gameHome || gameBase;
const apiBase = `/api/group-games/${gameSlug}/rooms/${code}`;
const app = document.querySelector("#act-app");
const toast = document.querySelector("#act-toast");
const connectionStatus = document.querySelector("#act-connection");
const readModeSelect = document.querySelector("#act-read-mode");
let csrfToken = document.querySelector('meta[name="csrf-token"]').content;
let latestState = null;
let requestInFlight = false;
let lastRenderSignature = "";
let failedRefreshes = 0;
let refreshPausedUntil = 0;
let readMode = window.localStorage.getItem("actItOutReadMode") || "off";
let speechRun = 0;
let lastSpokenState = "";
let profileEditorOpen = false;
let drawingSendInFlight = false;
let drawingDirty = false;
let drawingAutosendTimer = null;
let drawingSession = 0;
const presetAvatars = [
  ["", "Initials"],
  ["fox", "Friendly fox"],
  ["sunflower", "Sunflower"],
  ["ocean", "Ocean sunrise"],
  ["david", "David with a harp"],
  ["esther", "Queen Esther"],
  ["jesus-children", "Jesus welcoming children"],
  ["noah", "Noah's ark"],
  ["empty-tomb", "Empty tomb"],
  ["cross", "Jesus on the cross"],
];

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
  window.setTimeout(() => toast.classList.remove("show"), 5000);
}

function profileEditor(player) {
  if (!player) return "";
  if (!profileEditorOpen) {
    return `<button id="edit-player-profile" class="bee-button secondary" type="button">Edit name or picture</button>`;
  }
  const keepSelfie = player.avatar && !player.avatar_preset
    ? `<label class="avatar-choice">
        <input type="radio" name="profile_avatar_preset" value="__keep" checked>
        <span class="player-avatar"><img src="${escapeHTML(player.avatar)}" alt=""></span>
        <small>Keep selfie</small>
      </label>`
    : "";
  return `<form id="player-profile-form" class="profile-edit-form">
    <label for="profile-player-name">Player name</label>
    <input id="profile-player-name" name="player_name" maxlength="18" autocomplete="nickname" value="${escapeHTML(player.name)}" required>
    <fieldset class="avatar-gallery">
      <legend>Picture</legend>
      ${keepSelfie}
      ${presetAvatars.map(([id, label]) => `<label class="avatar-choice">
        <input type="radio" name="profile_avatar_preset" value="${escapeHTML(id)}" ${!keepSelfie && (player.avatar_preset || "") === id ? "checked" : ""}>
        <span class="${id ? `preset-avatar avatar-${escapeHTML(id)}` : ""}" aria-hidden="true">${id ? "" : "☺"}</span>
        <small>${escapeHTML(label)}</small>
      </label>`).join("")}
    </fieldset>
    <div class="selfie-picker compact">
      <label class="bee-button secondary selfie-button" for="profile-selfie">Replace with selfie</label>
      <input id="profile-selfie" type="file" accept="image/*" capture="user">
    </div>
    <div class="profile-edit-actions">
      <button class="bee-button primary" type="submit">Save profile</button>
      <button id="cancel-profile-edit" class="bee-button secondary" type="button">Cancel</button>
    </div>
  </form>`;
}

function stopSpeaking() {
  speechRun += 1;
  window.speechSynthesis?.cancel();
  document.querySelectorAll(".is-speaking").forEach(element => element.classList.remove("is-speaking"));
}

function speakItems(items) {
  if (readMode === "off" || !("speechSynthesis" in window)) return;
  stopSpeaking();
  const run = speechRun;
  const speakNext = index => {
    if (run !== speechRun || index >= items.length) return;
    const item = items[index];
    const element = item.element?.();
    element?.classList.add("is-speaking");
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.rate = 0.9;
    utterance.pitch = 1.02;
    utterance.onend = () => {
      element?.classList.remove("is-speaking");
      speakNext(index + 1);
    };
    utterance.onerror = () => {
      element?.classList.remove("is-speaking");
      speakNext(index + 1);
    };
    window.speechSynthesis.speak(utterance);
  };
  speakNext(0);
}

function speakState(state, force = false) {
  if (readMode === "off") return;
  const key = `${state.phase}:${state.round_index}:${state.round?.mode}:${state.round?.clues?.length || 0}:${readMode}`;
  if (!force && key === lastSpokenState) return;
  lastSpokenState = key;
  const items = [];
  if (state.phase === "prepare" && state.viewer.secret_prompt) {
    items.push({
      text: `${modeLabel(state.viewer.secret_prompt.mode)}. ${state.viewer.secret_prompt.answer}`,
      element: () => document.querySelector(".secret-prompt-card h2"),
    });
    if (readMode === "all") {
      if (state.viewer.secret_prompt.instruction) items.push({
        text: state.viewer.secret_prompt.instruction,
        element: () => document.querySelector(".secret-prompt-card p"),
      });
      if (state.viewer.secret_prompt.forbidden_words?.length) items.push({
        text: `Do not say: ${state.viewer.secret_prompt.forbidden_words.join(", ")}`,
        element: () => document.querySelector(".forbidden-words"),
      });
    }
  } else if (state.phase === "round" && state.round) {
    items.push({
      text: modeLabel(state.round.mode),
      element: () => document.querySelector(".display-prompt, .mode-banner, .player-turn-stage h1"),
    });
    if (state.viewer.secret_prompt) {
      items.push({
        text: state.viewer.secret_prompt.answer,
        element: () => document.querySelector(".secret-prompt-card h2"),
      });
      if (readMode === "all" && state.viewer.secret_prompt.instruction) {
        items.push({
          text: state.viewer.secret_prompt.instruction,
          element: () => document.querySelector(".secret-prompt-card p"),
        });
      }
    } else if (readMode === "all" && state.round.clues?.length) {
      state.round.clues.forEach((clue, index) => {
        items.push({
          text: `Clue ${index + 1}. ${clue}`,
          element: () => document.querySelectorAll(".guess-clues li")[index],
        });
      });
    }
  } else if (state.phase === "reveal") {
    items.push({
      text: `Answer. ${state.round?.answer || state.last_result?.answer || ""}`,
      element: () => document.querySelector(".display-reveal p, .revealed-verse p"),
    });
  }
  speakItems(items.filter(item => item.text));
}

function roomPagePath() {
  if (role === "host") return `${gameBase}/host/${encodeURIComponent(code)}`;
  if (role === "display") return `${gameBase}/display/${encodeURIComponent(code)}`;
  return `${gameBase}/play/${encodeURIComponent(code)}`;
}

async function refreshCsrfToken() {
  const response = await fetch(roomPagePath(), { cache: "no-store" });
  if (!response.ok) return false;
  const html = await response.text();
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  const nextToken = documentCopy.querySelector('meta[name="csrf-token"]')?.content;
  if (!nextToken) return false;
  csrfToken = nextToken;
  document.querySelector('meta[name="csrf-token"]').content = nextToken;
  return true;
}

async function api(path, options = {}, allowCsrfRetry = true) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...(options.headers || {}),
    },
  });
  const method = String(options.method || "GET").toUpperCase();
  if (response.status === 403 && method !== "GET" && allowCsrfRetry && await refreshCsrfToken()) {
    return api(path, options, false);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || (response.status === 403 ? "This page lost permission. Refresh and try again." : "Something went wrong. Please try again."));
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

function playerAvatar(player) {
  if (player.avatar_preset) {
    return `<span class="preset-avatar avatar-${escapeHTML(player.avatar_preset)}" aria-hidden="true"></span>`;
  }
  if (player.avatar) {
    return `<img src="${escapeHTML(player.avatar)}" alt="">`;
  }
  return escapeHTML(initials(player.name));
}

function playerRows(state, manage = false) {
  if (!state.players.length) return `<p class="host-controls">Players will appear here when they join.</p>`;
  return state.players.map(player => {
    const teamLabel = state.team_mode && player.team_name
      ? `<small class="team-pill team-${escapeHTML(player.team_color)}">${escapeHTML(player.team_name.replace(" Team", ""))}</small>`
      : "";
    const management = manage
      ? `<span class="player-management">
          ${state.phase === "lobby" && state.team_mode ? `<button class="switch-team-player" data-switch-team-player-id="${escapeHTML(player.id)}" type="button">Switch team</button>` : ""}
          ${["lobby", "round"].includes(state.phase) ? `<button class="away-player ${player.away ? "is-away" : ""}" data-away-player-id="${escapeHTML(player.id)}" type="button">${player.away ? "Bring back" : "Mark away"}</button>` : ""}
          ${state.phase === "lobby" ? `<button class="remove-player" data-player-id="${escapeHTML(player.id)}" type="button" aria-label="Remove ${escapeHTML(player.name)}">×</button>` : ""}
        </span>`
      : "";
    return `<div class="player-score">
      <span class="player-avatar">${playerAvatar(player)}</span>
      <strong>${escapeHTML(player.name)} ${teamLabel} ${player.away ? `<small class="away-label">Away</small>` : `<i class="presence-dot ${player.connected ? "online" : "offline"}" title="${player.connected ? "Connected" : "Reconnecting"}"></i>`}</strong>
      <output>${player.score}</output>
      ${management}
    </div>`;
  }).join("");
}

function scoreRail(state, controls = "") {
  const controllerRecovery = isFamilyGameNight && role === "host" && state.viewer.is_host
    ? Object.keys(state.controller_status || {}).map(pairRole => `<button class="text-button recover-controller" data-controller-role="${escapeHTML(pairRole)}" type="button">Replace ${escapeHTML(pairRole === "couch" ? "family" : pairRole)} controller</button>`).join("")
    : "";
  return `<aside class="score-rail">
    <h2>Players <span class="family-score">${state.team_mode ? "Team points" : "Points"}</span></h2>
    ${teamBoard(state)}
    <div class="score-list">${playerRows(state, role === "host" && ["lobby", "round"].includes(state.phase))}</div>
    ${state.viewer.can_control && controls ? `<div class="host-controls judge-controls">${controls}</div>` : ""}
      ${role === "host" ? `<div class="host-controls">
      ${isFamilyGameNight && state.phase !== "lobby" ? scoreAdjustmentPanel(state) : ""}
      ${controllerRecovery}
      <a class="bee-button secondary full" href="${gameBase}/display/${encodeURIComponent(code)}" target="_blank" rel="noopener">Open TV display</a>
      ${!isFamilyGameNight || state.control_mode === "hosted" ? `<button id="copy-join-link" class="bee-button secondary full" type="button">Copy join link</button>` : ""}
      ${isFamilyGameNight ? `<details class="host-help"><summary>Need help?</summary><div><p><strong>Lost the TV?</strong> Open TV display again; it safely rejoins this room.</p><p><strong>A phone disconnected?</strong> ${state.control_mode === "hosted" ? "Reopen its player page." : "Use Revoke and replace to create a fresh private controller invite."} Scores and turns stay with the room.</p><p><strong>Need to stop?</strong> End the game during a round, or delete the room below.</p><p><strong>Read aloud?</strong> Use the control at the top of this host screen.</p><a href="mailto:hello@faithsparksprintables.com?subject=Family%20Game%20Night%20help">Email support</a></div></details>` : ""}
      ${["round", "reveal"].includes(state.phase) ? `<button id="end-game" class="text-button danger-text" type="button">End game</button>` : ""}
      <button id="close-room" class="text-button danger-text" type="button">Delete this room</button>
    </div>` : ""}
  </aside>`;
}

function scoreAdjustmentPanel(state) {
  const targets = state.team_mode ? state.teams : state.players;
  const targetType = state.team_mode ? "team" : "player";
  const history = state.score_adjustments || [];
  return `<details class="host-help score-adjustments"><summary>Host score adjustment</summary><div>
    <p>Add a kindness bonus or correct a scoring tap. Official round rules stay unchanged.</p>
    ${targets.map(target => `<div class="score-adjust-row"><strong>${escapeHTML(target.name)}</strong>${[-50,-25,25,50].map(delta => `<button type="button" data-score-target-type="${targetType}" data-score-target-id="${escapeHTML(target.id)}" data-score-adjust-delta="${delta}">${delta > 0 ? "+" : ""}${delta}</button>`).join("")}</div>`).join("")}
    ${history.length ? `<div class="score-adjust-history"><strong>Recent</strong>${history.slice(-3).reverse().map(item => `<span>${escapeHTML(item.target_name)} ${item.delta > 0 ? "+" : ""}${item.delta} · ${escapeHTML(item.reason)}</span>`).join("")}<button id="undo-score-adjustment" class="bee-button secondary full" type="button">Undo last adjustment</button></div>` : ""}
  </div></details>`;
}

function modeLabel(mode) {
  if (mode === "draw") return "Draw It!";
  if (mode === "guess") return "Guess It!";
  return mode === "clue" ? "Don’t Say It!" : "Act It!";
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
  if (role === "player" && !state.viewer.can_control) {
    const me = state.players.find(player => player.id === state.viewer.player_id);
    app.innerHTML = `<section class="game-stage player-wait">
      <div class="celebration-mark">✦</div>
      <h1>You’re in, ${escapeHTML(me?.name || "player")}!</h1>
      <p>${me?.team_name ? `You are on ${escapeHTML(me.team_name)}.` : "The host will start soon."}</p>
      <p class="waiting-dots">Look at the shared screen</p>
      ${profileEditor(me)}
    </section>`;
    bindProfileEditor();
    return;
  }
  const isAdaptiveControllerRoom = state.control_mode === "couch" || state.control_mode === "team_auto";
  const couchPaired = Boolean(state.controller_status?.couch);
  const controllersReady = state.control_mode === "couch"
    ? couchPaired
    : state.control_mode === "team_auto"
      ? Boolean(state.controller_status?.gold && state.controller_status?.blue)
      : Boolean(state.players.length);
  const startDisabled = controllersReady ? "" : "disabled";
  const showHostWalkthrough = role === "host" && isFamilyGameNight && state.control_mode === "hosted" && window.localStorage.getItem("familyGameNightHostWalkthrough") !== "done";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage lobby-stage">
      <p class="round-meta">${escapeHTML(state.theme)} · ${state.round_total} cards · 45 seconds each</p>
      <h1>${state.control_mode === "couch" ? (couchPaired ? "Your shared controller is ready" : "Pair your one controller phone") : state.control_mode === "team_auto" ? "Pair both team phones" : "Gather your players"}</h1>
      <p>${state.control_mode === "couch" ? "You do not add a second player or team. Pair one phone below; Faith Sparks creates Gold and Blue turns automatically." : state.control_mode === "team_auto" ? "Use the private Gold and Blue pairing codes below—not the public room code." : "Scan the QR code or enter the room code."}</p>
      ${!isAdaptiveControllerRoom ? `<div class="lobby-code-row">
        <div class="big-code">${escapeHTML(code)}</div>
        <div class="lobby-qr">
          <img src="${gameBase}/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
          <span>Scan to join</span>
        </div>
      </div>` : ""}
      <p>${state.control_mode === "couch" ? (couchPaired ? "Couch controller paired. Gold and Blue teams are ready." : "Waiting for the Couch controller phone.") : `${state.players.length} ${state.players.length === 1 ? "player is" : "players are"} ready. Each card can earn 100 points.`}</p>
      <div class="room-ready-checklist" aria-label="Game readiness">
        <strong>Ready to begin?</strong>
        <span class="waiting">○ Open “TV display” on the big screen</span>
        <span class="${controllersReady ? "ready" : "waiting"}">${controllersReady ? "✓" : "○"} ${state.control_mode === "team_auto" ? "Both team phones paired" : state.control_mode === "couch" ? "Family controller paired" : "Players joined"}</span>
        <span class="waiting">○ Choose who will perform first</span>
      </div>
      ${state.viewer.pairing_tokens && Object.keys(state.viewer.pairing_tokens).length ? `<aside class="host-walkthrough"><div><span>Private controller pairing</span><h2>Scan or privately share the matching controller invite</h2></div><p>These are private controller invites—not the public player room code. Each expires after about ten minutes and works once.</p><div class="controller-pair-grid">${Object.entries(state.viewer.pairing_tokens).map(([pairRole, token]) => `<article><strong>${escapeHTML(pairRole === "couch" ? "Couch controller" : pairRole === "host" ? "Private host controller" : `${pairRole} team`)}</strong>${state.controller_status?.[pairRole] ? `<span>Paired ✓</span><button class="bee-button secondary replace-controller" type="button" data-controller-role="${escapeHTML(pairRole)}">Revoke and replace</button>` : `<img src="${gameBase}/room/${encodeURIComponent(code)}/controller-qr/${encodeURIComponent(pairRole)}" alt="Private QR code for ${escapeHTML(pairRole)} controller"><button class="bee-button secondary share-controller" type="button" data-pair-url="${escapeHTML(`${window.location.origin}/family-game-night/controller/${code}#${token}`)}">Share controller invite</button><button class="text-button replace-controller" type="button" data-controller-role="${escapeHTML(pairRole)}">Generate a new invite</button><code>${escapeHTML(token)}</code>`}</article>`).join("")}</div></aside>` : ""}
      ${showHostWalkthrough ? `<aside class="host-walkthrough" aria-labelledby="host-walkthrough-title">
        <div><span>First game?</span><h2 id="host-walkthrough-title">Three screens, one easy job.</h2></div>
        <ol>
          <li><strong>Put “TV display” on the big screen.</strong><small>Open it in a new tab, then cast or AirPlay that tab if needed.</small></li>
          <li><strong>Keep this host screen with you.</strong><small>You’ll start the game, award points, and move to the next card here.</small></li>
          <li><strong>Players use their own phones.</strong><small>They scan this QR code or visit this page and enter room <b>${escapeHTML(code)}</b>. No account needed.</small></li>
        </ol>
        <button id="dismiss-host-walkthrough" class="bee-button secondary" type="button">Got it</button>
      </aside>` : ""}
    </section>
    ${scoreRail(state, `${state.team_mode ? `<form id="team-name-form"><input name="gold" maxlength="18" value="${escapeHTML(state.teams.find(team => team.id === "gold")?.name || "Gold Team")}" aria-label="Gold team name"><input name="blue" maxlength="18" value="${escapeHTML(state.teams.find(team => team.id === "blue")?.name || "Blue Team")}" aria-label="Blue team name"><button class="bee-button secondary full" type="submit">Save team names</button></form><button id="rebalance-teams" class="bee-button secondary full" type="button" ${state.players.length < 2 ? "disabled" : ""}>Balance teams</button>` : ""}
      <button id="start-game" class="bee-button primary full" type="button" ${startDisabled}>Start game</button>`)}
  </div>`;
  document.querySelector("#start-game")?.addEventListener("click", () => hostAction("start"));
  document.querySelector("#rebalance-teams")?.addEventListener("click", rebalanceTeams);
  document.querySelector("#team-name-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/family-game-night/rooms/${encodeURIComponent(code)}/teams/names`, { method: "POST", body: JSON.stringify({ gold: form.get("gold"), blue: form.get("blue") }) });
      showToast("Team names saved."); await refreshState(true);
    } catch (error) { showToast(error.message); }
  });
  document.querySelectorAll(".share-controller").forEach(button => {
    button.addEventListener("click", async () => {
      const url = button.dataset.pairUrl;
      try {
        if (navigator.share) await navigator.share({ title: "Faith Sparks private controller", text: `Pair a private controller for room ${code}.`, url });
        else { await navigator.clipboard.writeText(url); showToast("Private controller invite copied."); }
      } catch (error) {
        if (error?.name !== "AbortError") showToast("Could not share. Copy the pairing code instead.");
      }
    });
  });
  document.querySelectorAll(".replace-controller").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/family-game-night/rooms/${encodeURIComponent(code)}/controllers/${encodeURIComponent(button.dataset.controllerRole)}/replace`, { method: "POST", body: "{}" });
      showToast("Old access revoked. New invite ready.");
      await refreshState(true);
    } catch (error) { showToast(error.message); }
  }));
  document.querySelector("#dismiss-host-walkthrough")?.addEventListener("click", () => {
    window.localStorage.setItem("familyGameNightHostWalkthrough", "done");
    renderLobby(state);
  });
  bindManagement();
}

function secretPromptCard(prompt, collapsed = false) {
  if (!prompt) return "";
  const card = `<div class="secret-prompt-card">
    <span>${escapeHTML(modeLabel(prompt.mode))}</span>
    <h2>${escapeHTML(prompt.answer)}</h2>
    <p>${escapeHTML(prompt.instruction || (prompt.mode === "draw" ? "Draw the prompt on your phone." : prompt.mode === "clue" ? "Describe it without saying the answer." : "No talking. Use motions only."))}</p>
    ${prompt.forbidden_words?.length ? `<div class="forbidden-words"><strong>Don’t say</strong>${prompt.forbidden_words.map(word => `<b>${escapeHTML(word)}</b>`).join("")}</div>` : ""}
    ${prompt.mode === "guess" && prompt.clues?.length ? `<div class="secret-clue-bank"><strong>Clue bank</strong>${prompt.clues.map(clue => `<span>${escapeHTML(clue)}</span>`).join("")}</div>` : ""}
  </div>`;
  if (!collapsed) return card;
  return `<details class="host-secret-details">
    <summary>Show host answer</summary>
    ${card}
  </details>`;
}

function drawingBoard(state, editable = false) {
  if (state.round?.mode !== "draw") return "";
  if (editable) {
    return `<div class="draw-panel">
      <canvas id="draw-canvas" width="640" height="420" aria-label="Drawing canvas"></canvas>
      <div class="draw-actions">
        <button id="clear-drawing" class="bee-button secondary" type="button">Clear</button>
        <button id="send-drawing" class="bee-button primary" type="button">Send drawing</button>
      </div>
      <p id="draw-status" class="draw-status">Your drawing updates on the shared screen while you draw.</p>
    </div>`;
  }
  return `<div class="draw-display-panel">
    ${state.round.drawing
      ? `<img src="${escapeHTML(state.round.drawing)}" alt="Current drawing">`
      : `<p>Waiting for the drawing...</p>`}
  </div>`;
}

function drawGuessPanel(state) {
  if (state.round?.mode !== "draw") return "";
  if (state.viewer.draw_answer) {
    return `<div class="answer-locked-panel">
      <strong>Answer locked</strong>
      <p>You chose ${escapeHTML(state.viewer.draw_answer.choice)}. Look up at the screen for the reveal.</p>
    </div>`;
  }
  const choices = state.round.choices || [];
  return `<div class="draw-lock-in-prompt"><strong>Lock in your guess</strong><p>Tap one answer below. You only get one choice.</p></div>
  <div class="answer-grid draw-guess-grid">
    ${choices.map(choice => `<button class="answer-button draw-guess-choice" data-draw-choice="${escapeHTML(choice)}" type="button">
      <span class="answer-letter">?</span>
      <strong>${escapeHTML(choice)}</strong>
    </button>`).join("")}
  </div>`;
}

function bindDrawGuessChoices() {
  const buttons = [...document.querySelectorAll("[data-draw-choice]")];
  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      buttons.forEach(choice => { choice.disabled = true; });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      const saved = await submitDrawGuess(button.dataset.drawChoice);
      if (!saved) {
        buttons.forEach(choice => { choice.disabled = false; });
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
      }
    });
  });
}

function renderRound(state) {
  const isPreparing = state.phase === "prepare";
  const isActivePlayer = role === "player" && state.viewer.player_id === state.active_player_id;
  if (role === "player" && !state.viewer.can_control) {
    const hasSecretPrompt = Boolean(state.viewer.secret_prompt);
    const isDrawGuessing = state.round?.mode === "draw" && !isActivePlayer;
    app.innerHTML = `<section class="game-stage player-turn-stage">
      ${isActivePlayer && hasSecretPrompt
        ? `<p class="round-meta">Your turn · ${escapeHTML(state.active_team_name || "Play")}</p>
           <h1>${escapeHTML(modeLabel(state.viewer.secret_prompt?.mode))}</h1>
           ${secretPromptCard(state.viewer.secret_prompt)}
           ${drawingBoard(state, state.viewer.secret_prompt?.mode === "draw")}`
        : isDrawGuessing
          ? `<div class="celebration-mark">?</div>
             <h1>Guess the drawing</h1>
             <p>${escapeHTML(state.active_player_name || "A player")} is drawing on the shared screen.</p>
             ${drawGuessPanel(state)}`
        : `<div class="celebration-mark">✦</div>
           <h1>Look at the screen</h1>
           <p>${state.round?.mode === "guess"
             ? `${escapeHTML(state.active_team_name || "Your team")} is guessing from the TV clues.`
             : `${escapeHTML(state.active_player_name || "A player")} is up for ${escapeHTML(state.active_team_name || "this round")}.`}</p>`}
    </section>`;
    bindDrawGuessChoices();
    return;
  }
  const activePrompt = state.viewer.secret_prompt;
  const isGuess = state.round?.mode === "guess";
  const isDraw = state.round?.mode === "draw";
  const isClue = state.round?.mode === "clue";
  const usesPhoneDrawGuesses = isDraw && state.control_mode === "hosted";
  const pointsAvailable = state.round?.points_available || 100;
  const canRevealClue = isGuess && (state.round?.clues?.length || 0) < (state.round?.clue_count || 0);
  const answeredPlayerIds = new Set(state.round?.answered_player_ids || []);
  const drawGuessers = isDraw
    ? state.players.filter(player => player.id !== state.active_player_id && player.connected && !player.away && !answeredPlayerIds.has(player.id))
    : [];
  const prepareAction = state.viewer.can_prepare && isPreparing
    ? `<div class="private-prompt-ready"><p>Keep this screen private. When the player knows what to ${isDraw ? "draw" : isClue ? "describe" : "act"}, hide the prompt and start the timer.</p><button id="ready-round" class="bee-button primary full" type="button">Ready · hide prompt and start</button></div>`
    : "";
  const controls = state.viewer.can_judge && !isPreparing
    ? isGuess && state.control_mode === "couch" && !activePrompt
      ? `<p class="host-score-hint">Let the active team guess from the TV clues. Reveal the private answer only when someone is ready to judge.</p>
         <button id="show-judge-answer" class="bee-button primary full" type="button">Reveal answer to judge</button>`
      : isDraw
      ? state.control_mode !== "hosted"
        ? `<p class="host-score-hint"><strong>${state.control_mode === "team_auto" ? `The ${escapeHTML(state.active_team_name || "active team")} is playing. Your team judges.` : "Everyone else guesses aloud."}</strong> Lock in the result once.</p>
           <button id="correct-round" class="bee-button primary full" type="button">They got it · +100</button>
           <button id="pass-round" class="bee-button secondary full" type="button">Pass / time</button>
           <button id="skip-round" class="text-button" type="button">Skip card</button>`
        : `<p class="host-score-hint"><strong>Phone guesses:</strong> players tap one answer to lock it in. Correct choices score automatically.</p>
         ${drawGuessers.length ? `<div class="draw-verbal-awards"><strong>Someone called it out?</strong>${drawGuessers.map(player => `<button class="bee-button primary full award-draw-guesser" data-player-id="${escapeHTML(player.id)}" type="button">Award ${escapeHTML(player.name)} · +100</button>`).join("")}</div>` : ""}
         <p class="host-score-hint">${state.round?.answered_count || 0} of ${state.round?.guesser_count || 0} guesses locked.</p>
         <button id="pass-round" class="bee-button secondary full" type="button">Reveal drawing answer</button>
         <button id="skip-round" class="text-button" type="button">Skip card</button>`
      : `<p class="host-score-hint">${state.control_mode === "team_auto" ? `The ${escapeHTML(state.active_team_name || "other team")} is playing. Your team judges this card${isGuess ? "—keep the answer private" : ""}.` : "If the group guesses it, award this card. Then deal the next card."}</p>
         ${canRevealClue ? `<button id="reveal-clue" class="bee-button secondary full" type="button">Reveal next clue</button>` : ""}
         <button id="correct-round" class="bee-button primary full" type="button">Got it right · +${pointsAvailable}</button>
         ${isClue ? `<button id="forbidden-round" class="bee-button secondary full" type="button">Forbidden word · no points</button>` : ""}
         <button id="pass-round" class="bee-button secondary full" type="button">No point / pass</button>
         <button id="skip-round" class="text-button" type="button">Skip card</button>`
    : "";
  const adaptiveTeamTurn = state.control_mode !== "hosted" && state.team_mode;
  const roundHeading = isPreparing
    ? activePrompt
      ? `Private prompt for ${escapeHTML(state.active_team_name || "this turn")}`
      : `${escapeHTML(state.active_team_name || "Next player")}, check your controller`
    : isGuess
      ? `${escapeHTML(state.active_team_name || "Team")} guesses`
      : adaptiveTeamTurn
        ? `${escapeHTML(state.active_team_name || "Team")}: choose someone to ${isDraw ? "draw" : isClue ? "give clues" : "act"}`
        : isDraw ? `${escapeHTML(state.active_player_name || "Player")} draws` : `${escapeHTML(state.active_player_name || "Player")} is up`;
  app.innerHTML = `<div class="game-layout ${isPreparing ? "prepare-layout" : ""} ${canEditDrawing(state) ? "drawing-controller-layout" : ""}">
    <section class="game-stage act-round-stage">
      <p class="round-meta">Round ${state.round_index + 1} of ${state.round_total}</p>
      <h1>${roundHeading}</h1>
      <p class="act-team-line">${escapeHTML(state.active_team_name || "Individual round")}</p>
      ${isPreparing ? "" : `<div class="act-timer"><strong data-act-countdown>${state.timer_seconds}</strong><span>seconds</span></div>`}
      <p class="act-display-instruction">${isPreparing ? activePrompt ? "Only the player taking this turn should look at this screen." : "The private prompt is safely shown only on the controller phone." : isGuess ? `Reveal clues one at a time. This clue is worth ${pointsAvailable} points.` : usesPhoneDrawGuesses ? "The drawing updates here while the player draws. Guessers lock in one answer on their phones." : isDraw ? "Draw on this phone while everyone else guesses aloud." : "Guess out loud. Award 100 points when they get it."}</p>
      ${isPreparing && activePrompt ? secretPromptCard(activePrompt) : ""}
      ${prepareAction}
      ${clueList(state.round)}
      ${isPreparing ? "" : drawingBoard(state, canEditDrawing(state))}
      ${usesPhoneDrawGuesses && !isPreparing ? `<p class="act-display-instruction">${state.round?.answered_count || 0} of ${state.round?.guesser_count || 0} guesses locked.</p>` : ""}
      ${!isPreparing && activePrompt && state.viewer.can_control ? secretPromptCard(activePrompt, true) : ""}
    </section>
    ${scoreRail(state, controls)}
  </div>`;
  document.querySelector("#reveal-clue")?.addEventListener("click", () => hostAction("clue"));
  document.querySelector("#show-judge-answer")?.addEventListener("click", () => hostAction("show-answer"));
  document.querySelector("#ready-round")?.addEventListener("click", () => hostAction("ready"));
  document.querySelector("#correct-round")?.addEventListener("click", () => hostAction("correct"));
  document.querySelector("#pass-round")?.addEventListener("click", () => hostAction("pass"));
  document.querySelector("#forbidden-round")?.addEventListener("click", () => hostAction("forbidden"));
  document.querySelector("#skip-round")?.addEventListener("click", () => hostAction("skip"));
  document.querySelectorAll(".award-draw-guesser").forEach(button => {
    button.addEventListener("click", () => awardDrawGuesser(button.dataset.playerId));
  });
  bindDrawGuessChoices();
  bindManagement();
}

function renderReveal(state) {
  const result = state.last_result || {};
  const isCorrect = result.outcome === "correct";
  const isDraw = result.mode === "draw";
  const outcomeCopy = {
    forbidden: ["Forbidden word used", "No points this card. Reset, hand off the controller, and try the next prompt."],
    timeout: ["Time ran out", "No points this card. The answer is revealed so everyone can reset for the next turn."],
    pass: ["Card passed", "No points this card. Hand off the controller and deal the next prompt when ready."],
    skip: ["Card skipped", "This card was skipped without scoring."],
  }[result.outcome] || ["Passed", "No points for this card. Deal the next card when ready."];
  const drawSummary = isDraw
    ? `${result.correct_guesses || 0} of ${result.guesser_count || result.guess_count || 0} guessed correctly${result.drawer_bonus ? ` · ${escapeHTML(state.active_player_name || "Drawer")} earned a ${result.drawer_bonus}-point drawing bonus` : ""}.`
    : "";
  const controls = state.viewer.can_control
    ? `<button id="next-round" class="bee-button primary full" type="button">${state.round_index + 1 >= state.round_total ? "See winner" : "Next card"}</button>`
    : "";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage act-reveal-stage">
      <div class="celebration-mark">${isCorrect || isDraw ? "✓" : "✦"}</div>
      <h1>${isDraw ? "Drawing revealed" : isCorrect ? "Correct!" : escapeHTML(outcomeCopy[0])}</h1>
      <p>${isDraw ? escapeHTML(drawSummary) : isCorrect ? `${escapeHTML(state.active_player_name || "Player")} earned ${result.points || 0} points. Deal the next card when ready.` : escapeHTML(outcomeCopy[1])}</p>
      <div class="revealed-verse"><strong>Answer</strong><p>${escapeHTML(state.round?.answer || result.answer || "")}</p></div>
      ${isFamilyGameNight && role === "host" && state.round?.prompt_id ? `<div class="prompt-preferences"><strong>Help shape future games</strong><button type="button" data-prompt-preference="favorite">★ Family favorite</button><button type="button" data-prompt-preference="hide">Hide this card</button></div>` : ""}
      ${clueList(state.round, true)}
      ${drawingBoard(state)}
      ${teamBoard(state, true)}
    </section>
    ${scoreRail(state, controls)}
  </div>`;
  document.querySelector("#next-round")?.addEventListener("click", () => hostAction("next"));
  document.querySelectorAll("[data-prompt-preference]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`${apiBase}/prompt-preference`, {method: "POST", body: JSON.stringify({preference: button.dataset.promptPreference})});
      document.querySelectorAll("[data-prompt-preference]").forEach(item => { item.disabled = true; });
      showToast(button.dataset.promptPreference === "favorite" ? "Saved as a family favorite." : "This card will be avoided in future games.");
    } catch (error) { showToast(error.message); }
  }));
  bindManagement();
}

function renderFinished(state) {
  const teamWinners = state.team_mode ? topTeams(state.teams) : [];
  const leaders = topPlayers(state.players, 5);
  const cooperative = state.scoring_style === "cooperative";
  const goalReached = state.family_score >= state.family_goal;
  const heading = cooperative
    ? goalReached ? "Your Family Beat the Goal!" : "Your Family Grew Together!"
    : state.team_mode
    ? teamWinners.length > 1 ? "Team Tie!" : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
    : leaders.length ? `${escapeHTML(leaders[0].name)} Wins!` : "Game complete!";
  const learningRows = (state.learning_summary || []).map(item => `<li><strong>${escapeHTML(item.answer)}</strong><span>${escapeHTML(item.reference)}</span></li>`).join("");
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage finished-stage celebration-stage">
      <div class="celebration-mark">✦</div>
      <h1>${heading}</h1>
      <p>${cooperative ? `Together you earned ${state.family_score} of ${state.family_goal} goal points.` : "Great job acting, guessing, laughing, and learning together."}</p>
      ${cooperative ? `<div class="family-goal-meter"><span style="width:${Math.min(100, Math.round((state.family_score / Math.max(1, state.family_goal)) * 100))}%"></span></div>` : ""}
      ${teamBoard(state, true)}
      <div class="top-individuals">
        <h2>Top players</h2>
        ${leaders.map((player, index) => `<div><span>${index + 1}. ${escapeHTML(player.name)}</span><strong>${player.score}</strong></div>`).join("")}
      </div>
      ${learningRows ? `<div class="learning-summary"><span class="section-kicker">Tonight in Scripture</span><h2>Stories your family encountered</h2><ul>${learningRows}</ul><p>Choose one reference to read together before bed or tomorrow.</p></div>` : ""}
      <div class="next-game-actions">
        <a class="bee-button secondary" href="${gameHome}">Back to ${escapeHTML(gameTitle)}</a>
      </div>
      ${isFamilyGameNight && role !== "display" ? feedbackPanel(state) : ""}
    </section>
    ${scoreRail(state, role === "host" ? `<button id="play-again" class="bee-button secondary full" type="button">New game, same players</button>` : "")}
  </div>`;
  bindManagement();
  bindFeedback();
}

function feedbackStorageKey(state = latestState) {
  return `familyGameNightFeedback:${code}:${state?.completion_number || 1}`;
}

function feedbackPanel(state) {
  if (window.localStorage.getItem(feedbackStorageKey(state)) === "done") {
    return `<aside class="game-feedback thanks"><h2>Thank you!</h2><p>Your feedback will help make the next family’s game night better.</p></aside>`;
  }
  return `<aside class="game-feedback"><h2>Help us make game night better</h2><p>Optional, anonymous, and takes about 30 seconds.</p>
    <form id="family-feedback-form">
      <fieldset><legend>How much did your family enjoy the game?</legend><div class="feedback-rating">${[1,2,3,4,5].map(value => `<label><input type="radio" name="enjoyment" value="${value}" required><span>${value}</span></label>`).join("")}</div></fieldset>
      <label>Which mode was the favorite?<select name="favorite_mode" required><option value="">Choose one</option><option value="act">Act It!</option><option value="draw">Draw It!</option><option value="clue">Don’t Say It!</option><option value="guess">Guess It!</option><option value="mixed">Mixed / no clear favorite</option></select></label>
      <label>Did anything prevent or confuse your family? <small>Optional</small><textarea name="comment" maxlength="500" rows="3"></textarea></label>
      <fieldset><legend>Would your family play again?</legend><div class="feedback-again">${["yes","maybe","no"].map(value => `<label><input type="radio" name="play_again" value="${value}" required><span>${value[0].toUpperCase()+value.slice(1)}</span></label>`).join("")}</div></fieldset>
      <label class="feedback-quote"><input type="checkbox" name="quote_approved"><span>Yes, Faith Sparks may quote this feedback anonymously.</span></label>
      <p class="feedback-privacy">Please don’t include children’s names, ages, or contact information.</p>
      <button class="bee-button primary" type="submit">Send feedback</button><p id="feedback-error" class="setup-error" role="alert" hidden></p>
    </form>
  </aside>`;
}

function bindFeedback() {
  const form = document.querySelector("#family-feedback-form");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = document.querySelector("#feedback-error");
    const data = new FormData(form);
    button.disabled = true;
    error.hidden = true;
    try {
      await api(`${apiBase}/feedback`, {method: "POST", body: JSON.stringify({
        enjoyment: Number(data.get("enjoyment")), favorite_mode: data.get("favorite_mode"),
        comment: data.get("comment"), play_again: data.get("play_again"),
        quote_approved: data.get("quote_approved") === "on",
      })});
      window.localStorage.setItem(feedbackStorageKey(), "done");
      form.closest(".game-feedback").outerHTML = `<aside class="game-feedback thanks"><h2>Thank you!</h2><p>Your feedback will help make the next family’s game night better.</p></aside>`;
    } catch (submitError) {
      error.textContent = submitError.message || "Feedback could not be sent. Your scoreboard is safe; try again later.";
      error.hidden = false;
      button.disabled = false;
    }
  });
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
    const adaptive = state.control_mode === "couch" || state.control_mode === "team_auto";
    const pairingMessage = state.control_mode === "couch"
      ? "Pair the private family controller from the creator’s screen."
      : "Pair the Gold and Blue team phones from the creator’s screen.";
    const couchReadyMessage = `One controller paired · ${state.teams?.map(team => team.name).join(" and ") || "Both teams"} ready`;
    app.innerHTML = `<section class="display-stage display-lobby">
      <p class="display-kicker">${escapeHTML(gameTitle)} · ${escapeHTML(state.theme)}</p>
      <h1>${adaptive ? "Private controllers needed" : "Join the Game"}</h1>
      ${adaptive ? `<p class="display-prompt">${escapeHTML(pairingMessage)}</p>` : `<div class="display-join-row">
        <div><span>Room code</span><strong>${escapeHTML(code)}</strong></div>
        <img src="${gameBase}/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
      </div>`}
      <p class="display-count">${state.control_mode === "couch" && state.controller_status?.couch ? escapeHTML(couchReadyMessage) : `${state.players.length} ${state.players.length === 1 ? "player" : "players"} ready`} · ${state.round_total} cards · 100 points each</p>
      ${displayRosters(state)}
    </section>`;
  } else if (state.phase === "prepare") {
    app.innerHTML = `<section class="display-stage act-display-round prepare-display-round">
      <div class="display-topline"><span>Round ${state.round_index + 1} of ${state.round_total}</span><span>${escapeHTML(state.active_team_name || "Play")}</span></div>
      ${teamBoard(state, true)}
      <h1>${escapeHTML(state.active_team_name || state.active_player_name || "The next player")} is getting ready</h1>
      <p class="display-prompt">${escapeHTML(modeLabel(state.round?.mode))}</p>
      <p class="act-display-instruction">Waiting for the private prompt…</p>
    </section>`;
  } else if (state.phase === "round") {
    const isGuess = state.round?.mode === "guess";
    const isDraw = state.round?.mode === "draw";
    const adaptive = state.control_mode === "couch" || state.control_mode === "team_auto";
    const pointsAvailable = state.round?.points_available || 100;
    const displayHeading = isGuess
      ? `${escapeHTML(state.active_team_name || "Team")} guesses`
      : adaptive
        ? `${escapeHTML(state.active_team_name || "Team")}: choose someone to ${isDraw ? "draw" : state.round?.mode === "clue" ? "give clues" : "act"}`
        : isDraw ? `${escapeHTML(state.active_player_name || "Player")} draws` : `${escapeHTML(state.active_player_name || "Player")} is up`;
    app.innerHTML = `<section class="display-stage act-display-round ${isGuess ? "guess-display-round" : ""} ${isDraw ? "draw-display-round" : ""}">
      <div class="display-topline"><span>Round ${state.round_index + 1} of ${state.round_total}</span><span>${escapeHTML(state.active_team_name || "Play")}</span></div>
      ${teamBoard(state, true)}
      <h1>${displayHeading}</h1>
      <p class="display-prompt">${escapeHTML(modeLabel(state.round?.mode))}</p>
      ${clueList(state.round)}
      ${drawingBoard(state)}
      <div class="act-timer display"><strong data-act-countdown>${state.timer_seconds}</strong><span>seconds</span></div>
      ${isDraw && !adaptive ? `<p class="act-display-instruction">${state.round?.answered_count || 0} of ${state.round?.guesser_count || 0} guesses locked.</p>` : ""}
      <p class="act-display-instruction">${isGuess ? `Call out the answer. This clue is worth ${pointsAvailable} points.` : isDraw && adaptive ? "Guess out loud. A correct team guess earns 100 points." : isDraw ? "Choose the answer on your phone. Correct guesses score automatically." : "Guess out loud. A correct guess is worth 100 points."}</p>
    </section>`;
  } else if (state.phase === "reveal") {
    const isCorrect = state.last_result?.outcome === "correct";
    const isDraw = state.last_result?.mode === "draw";
    app.innerHTML = `<section class="display-stage act-display-reveal">
      <div class="celebration-mark">${isCorrect || isDraw ? "✓" : "✦"}</div>
      <h1>${isDraw ? "Drawing Revealed" : isCorrect ? "Correct!" : "Passed"}</h1>
      <div class="display-reveal"><span>Answer</span><p>${escapeHTML(state.round?.answer || state.last_result?.answer || "")}</p></div>
      ${clueList(state.round, true)}
      ${drawingBoard(state)}
      ${teamBoard(state, true)}
    </section>`;
  } else {
    const teamWinners = state.team_mode ? topTeams(state.teams) : [];
    const leaders = topPlayers(state.players, 5);
    const cooperative = state.scoring_style === "cooperative";
    const heading = cooperative
      ? state.family_score >= state.family_goal ? "Your Family Beat the Goal!" : "Your Family Grew Together!"
      : state.team_mode
      ? teamWinners.length > 1 ? "Team Tie!" : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
      : leaders.length ? `${escapeHTML(leaders[0].name)} Wins!` : "Game complete!";
    app.innerHTML = `<section class="display-stage display-final celebration-stage">
      <div class="celebration-mark">✦</div>
      <h1>${heading}</h1>
      ${cooperative ? `<p>Together: ${state.family_score} of ${state.family_goal} goal points</p><div class="family-goal-meter"><span style="width:${Math.min(100, Math.round((state.family_score / Math.max(1, state.family_goal)) * 100))}%"></span></div>` : ""}
      ${teamBoard(state, true)}
      <div class="display-top-players">
        <h2>Top players</h2>
        ${leaders.map((player, index) => `<div><span>${index + 1}. ${escapeHTML(player.name)}</span><strong>${player.score}</strong></div>`).join("")}
      </div>
    </section>`;
  }
}

function render(state) {
  if (!canEditDrawing(state)) stopDrawingAutosave();
  latestState = state;
  if (role === "display") renderDisplay(state);
  else if (state.phase === "lobby") renderLobby(state);
  else if (state.phase === "prepare" || state.phase === "round") renderRound(state);
  else if (state.phase === "reveal") renderReveal(state);
  else renderFinished(state);
  updateCountdown();
  initDrawingCanvas();
  speakState(state);
}

function updateCountdown() {
  if (!latestState?.round_deadline || latestState.phase !== "round") return;
  const remaining = Math.max(0, Math.ceil(latestState.round_deadline - Date.now() / 1000));
  document.querySelectorAll("[data-act-countdown]").forEach(node => { node.textContent = String(remaining); });
}

async function refresh() {
  if (requestInFlight || Date.now() < refreshPausedUntil) return;
  requestInFlight = true;
  try {
    const state = await api(apiBase);
    refreshPausedUntil = 0;
    failedRefreshes = 0;
    connectionStatus.classList.remove("show");
    const activeCanvas = document.querySelector("#draw-canvas");
    if (activeCanvas && canEditDrawing(latestState) && canEditDrawing(state) && latestState?.round_index === state.round_index && latestState?.active_player_id === state.active_player_id) {
      latestState = state;
      return;
    }
    const signature = JSON.stringify(state);
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      render(state);
    }
  } catch (error) {
    if (error.status === 429 || error.status === 503) refreshPausedUntil = Date.now() + 15000;
    failedRefreshes += 1;
    if (failedRefreshes >= 2) connectionStatus.classList.add("show");
  } finally {
    requestInFlight = false;
  }
}

async function heartbeat() {
  if (role !== "player" || document.hidden) return;
  try {
    await api(`${apiBase}/heartbeat`, { method: "POST", body: "{}" });
  } catch (_error) {
  }
}

async function hostAction(action) {
  try {
    await api(`${apiBase}/${action}`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

function canEditDrawing(state) {
  if (role !== "player" || state?.phase !== "round" || state?.round?.mode !== "draw") return false;
  return Boolean(state.viewer?.can_draw || (state.viewer?.player_id === state.active_player_id && state.viewer?.secret_prompt?.mode === "draw"));
}

function stopDrawingAutosave() {
  drawingSession += 1;
  drawingDirty = false;
  if (drawingAutosendTimer) window.clearTimeout(drawingAutosendTimer);
  drawingAutosendTimer = null;
}

function isCurrentDrawingCanvas(canvas, session) {
  return session === drawingSession && canvas?.isConnected && canvas === document.querySelector("#draw-canvas") && canEditDrawing(latestState);
}

async function sendDrawing(canvas, silent = false, session = drawingSession) {
  if (drawingSendInFlight || !isCurrentDrawingCanvas(canvas, session)) return;
  drawingSendInFlight = true;
  try {
    const status = document.querySelector("#draw-status");
    if (status && !silent) status.textContent = "Sending drawing...";
    drawingDirty = false;
    await api(`${apiBase}/drawing`, {
      method: "POST",
      body: JSON.stringify({ drawing: canvas.toDataURL("image/png") }),
    });
    if (status) status.textContent = silent ? "Drawing updated on the shared screen." : "Drawing sent.";
    if (!silent) await refresh();
  } catch (error) {
    const staleRound = [403, 409].includes(error.status) || !isCurrentDrawingCanvas(canvas, session);
    drawingDirty = !staleRound;
    if (staleRound) {
      stopDrawingAutosave();
      if (!silent) showToast("That drawing turn has ended.");
    } else if (!silent) {
      showToast(error.message);
    }
  } finally {
    drawingSendInFlight = false;
    if (drawingDirty && !drawingAutosendTimer && isCurrentDrawingCanvas(canvas, session)) {
      drawingAutosendTimer = window.setTimeout(() => {
        drawingAutosendTimer = null;
        sendDrawing(canvas, true, session);
      }, 600);
    }
  }
}

async function submitDrawGuess(choice) {
  try {
    await api(`${apiBase}/guess`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    await refresh();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function awardDrawGuesser(playerId) {
  try {
    await api(`${apiBase}/draw-correct`, {
      method: "POST",
      body: JSON.stringify({ player_id: playerId }),
    });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

function initDrawingCanvas() {
  const canvas = document.querySelector("#draw-canvas");
  if (!canvas || canvas.dataset.ready === "true") return;
  stopDrawingAutosave();
  const session = drawingSession;
  canvas.dataset.ready = "true";
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffefb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 7;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#102d5c";
  let drawing = false;
  const queueDrawingSend = () => {
    drawingDirty = true;
    if (drawingAutosendTimer) return;
    drawingAutosendTimer = window.setTimeout(() => {
      drawingAutosendTimer = null;
      if (drawingDirty) sendDrawing(canvas, true, session);
    }, 1200);
  };
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  canvas.addEventListener("pointerdown", event => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const start = point(event);
    context.beginPath();
    context.moveTo(start.x, start.y);
    queueDrawingSend();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
    queueDrawingSend();
  });
  canvas.addEventListener("pointerup", () => {
    drawing = false;
    if (drawingDirty) sendDrawing(canvas, true, session);
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = false;
    if (drawingDirty) sendDrawing(canvas, true, session);
  });
  document.querySelector("#clear-drawing")?.addEventListener("click", () => {
    context.fillStyle = "#fffefb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    queueDrawingSend();
  });
  document.querySelector("#send-drawing")?.addEventListener("click", () => sendDrawing(canvas, false, session));
}

async function switchTeam(playerId) {
  try {
    await api(`${apiBase}/players/${encodeURIComponent(playerId)}/team`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function rebalanceTeams() {
  try {
    await api(`${apiBase}/teams/rebalance`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function removePlayer(playerId) {
  try {
    await api(`${apiBase}/players/${encodeURIComponent(playerId)}/remove`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function toggleAway(playerId) {
  try {
    await api(`${apiBase}/players/${encodeURIComponent(playerId)}/away`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function copyJoinLink() {
  const url = `${window.location.origin}${gameBase}/join/${code}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Join link copied.");
  } catch (_error) {
    showToast("Copy this link: " + url);
  }
}

async function closeRoom() {
  if (!window.confirm("Permanently delete this room for everyone?")) return;
  try {
    const result = await api(`${apiBase}/close`, {
      method: "POST",
      body: "{}",
    });
    window.location.href = result.redirect;
  } catch (error) {
    showToast(error.message);
  }
}

function resizeProfileSelfie(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - size) / 2;
        const sourceY = (image.naturalHeight - size) / 2;
        context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 128, 128);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function rememberGameProfile(name, avatarPreset) {
  window.localStorage.setItem("faithsparksGameProfile", JSON.stringify({
    name,
    avatarPreset,
  }));
}

function bindProfileEditor() {
  document.querySelector("#edit-player-profile")?.addEventListener("click", () => {
    profileEditorOpen = true;
    renderLobby(latestState);
  });
  document.querySelector("#cancel-profile-edit")?.addEventListener("click", () => {
    profileEditorOpen = false;
    renderLobby(latestState);
  });
  document.querySelector("#player-profile-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("player_name")?.toString().trim() || "";
    const selectedPreset = form.querySelector('input[name="profile_avatar_preset"]:checked')?.value || "";
    const file = form.querySelector("#profile-selfie")?.files?.[0];
    const payload = { player_name: name };
    try {
      if (file) {
        payload.avatar_data = await resizeProfileSelfie(file);
        payload.avatar_preset = "";
        rememberGameProfile(name, "");
      } else if (selectedPreset !== "__keep") {
        payload.avatar_data = "";
        payload.avatar_preset = selectedPreset;
        rememberGameProfile(name, selectedPreset);
      } else {
        rememberGameProfile(name, "");
      }
      await api(`${apiBase}/profile`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      profileEditorOpen = false;
      await refresh();
    } catch (error) {
      showToast(error.message || "That profile could not be saved.");
    }
  });
}

function bindManagement() {
  document.querySelectorAll("[data-switch-team-player-id]").forEach(button => {
    button.addEventListener("click", () => switchTeam(button.dataset.switchTeamPlayerId));
  });
  document.querySelectorAll(".remove-player").forEach(button => {
    button.addEventListener("click", () => removePlayer(button.dataset.playerId));
  });
  document.querySelectorAll("[data-away-player-id]").forEach(button => {
    button.addEventListener("click", () => toggleAway(button.dataset.awayPlayerId));
  });
  document.querySelector("#copy-join-link")?.addEventListener("click", copyJoinLink);
  document.querySelectorAll("[data-score-adjust-delta]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/family-game-night/rooms/${encodeURIComponent(code)}/score-adjust`, { method: "POST", body: JSON.stringify({ target_type: button.dataset.scoreTargetType, target_id: button.dataset.scoreTargetId, delta: Number(button.dataset.scoreAdjustDelta) }) });
      showToast("Host adjustment saved."); await refresh();
    } catch (error) { showToast(error.message); }
  }));
  document.querySelector("#undo-score-adjustment")?.addEventListener("click", async () => {
    try { await api(`/api/family-game-night/rooms/${encodeURIComponent(code)}/score-adjust/undo`, { method: "POST", body: "{}" }); showToast("Last adjustment undone."); await refresh(); }
    catch (error) { showToast(error.message); }
  });
  document.querySelectorAll(".recover-controller").forEach(button => button.addEventListener("click", async () => {
    try {
      const result = await api(`/api/family-game-night/rooms/${encodeURIComponent(code)}/controllers/${encodeURIComponent(button.dataset.controllerRole)}/replace`, { method: "POST", body: "{}" });
      const url = `${window.location.origin}/family-game-night/controller/${code}#${result.token}`;
      let delivered = false;
      if (navigator.share) {
        try { await navigator.share({ title: "Faith Sparks replacement controller", url }); delivered = true; }
        catch (shareError) { if (shareError?.name !== "AbortError") showToast("Share did not open; copying instead."); }
      }
      if (!delivered) {
        try { await navigator.clipboard.writeText(url); showToast("Replacement controller invite copied."); }
        catch (_clipboardError) { window.prompt("Copy this replacement controller invite:", url); }
      }
      await refresh();
    } catch (error) { showToast(error.message); }
  }));
  document.querySelector("#close-room")?.addEventListener("click", closeRoom);
  document.querySelector("#play-again")?.addEventListener("click", () => hostAction("play-again"));
  document.querySelector("#end-game")?.addEventListener("click", () => {
    if (window.confirm("End this game and show final scores?")) hostAction("end");
  });
}

refresh();
window.setInterval(refresh, 3000);
window.setInterval(updateCountdown, 250);
heartbeat();
window.setInterval(heartbeat, 25000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    heartbeat();
  }
});

if (readModeSelect) {
  readModeSelect.value = readMode;
  readModeSelect.addEventListener("change", () => {
    readMode = readModeSelect.value;
    window.localStorage.setItem("actItOutReadMode", readMode);
    stopSpeaking();
    if (latestState) speakState(latestState, true);
  });
}
