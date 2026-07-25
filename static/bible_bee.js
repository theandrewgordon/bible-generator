"use strict";

const body = document.body;
const code = body.dataset.roomCode;
const role = body.dataset.role;
const app = document.querySelector("#bee-app");
const toast = document.querySelector("#bee-toast");
const connectionStatus = document.querySelector("#bee-connection");
const soundToggle = document.querySelector("#bee-sound-toggle");
const readModeSelect = document.querySelector("#bee-read-mode");
let csrfToken = document.querySelector('meta[name="csrf-token"]').content;
let latestState = null;
let requestInFlight = false;
let failedRefreshes = 0;
let refreshPausedUntil = 0;
let lastRenderSignature = "";
let roomExpired = false;
let pendingChoice = null;
let pendingQuestionIndex = null;
let soundEnabled = window.localStorage.getItem("bibleBeeSound") === "on";
let audioContext = null;
let readMode = window.localStorage.getItem("bibleBeeReadMode") || "off";
let speechRun = 0;
let lastSpokenQuestion = "";
let profileEditorOpen = false;
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

function updateSoundToggle() {
  if (!soundToggle) return;
  soundToggle.textContent = soundEnabled ? "Sound on" : "Sound off";
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
}

function playTone(kind = "round") {
  if (!soundEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  const patterns = {
    lock: [520],
    reveal: [523, 659],
    round: [392, 494],
    finish: [523, 659, 784],
  };
  const notes = patterns[kind] || patterns.round;
  notes.forEach((frequency, index) => {
    const start = audioContext.currentTime + (index * 0.11);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === "lock" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === "finish" ? 0.07 : 0.055, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  });
}

function stopSpeaking() {
  speechRun += 1;
  window.speechSynthesis?.cancel();
  document.querySelectorAll(".is-speaking").forEach(element => {
    element.classList.remove("is-speaking");
  });
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
    utterance.rate = 0.88;
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

function speakQuestion(state, force = false) {
  if (readMode === "off" || state.phase !== "question" || !state.question) return;
  const key = `${state.question_index}:${state.question.label}:${readMode}`;
  if (!force && key === lastSpokenQuestion) return;
  lastSpokenQuestion = key;
  const items = [{
    text: state.question.prompt,
    element: () => document.querySelector(".question-prompt"),
  }];
  if (readMode === "all") {
    items.unshift({
      text: state.question.label,
      element: () => document.querySelector(".mode-banner"),
    });
    state.question.choices.forEach((choice, index) => {
      items.push({
        text: `Answer ${String.fromCharCode(65 + index)}. ${choice}`,
        element: () => document.querySelector(`[data-choice="${index}"]`),
      });
    });
  }
  speakItems(items);
}

function speakConfirmation() {
  if (readMode !== "all" || pendingChoice === null) return;
  const letter = String.fromCharCode(65 + pendingChoice);
  const choice = latestState.question.choices[pendingChoice];
  speakItems([
    {
      text: `You chose answer ${letter}. ${choice}`,
      element: () => document.querySelector(".answer-confirmation > span"),
    },
    {
      text: "Yes, lock this answer.",
      element: () => document.querySelector("#confirm-answer"),
    },
    {
      text: "No, choose again.",
      element: () => document.querySelector("#change-answer"),
    },
  ]);
}

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

function profileEditor(state, player) {
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

function roomPagePath() {
  if (role === "host") return `/family-bible-bee/host/${encodeURIComponent(code)}`;
  if (role === "display") return `/family-bible-bee/display/${encodeURIComponent(code)}`;
  return `/family-bible-bee/play/${encodeURIComponent(code)}`;
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

function sortedTopPlayers(players, limit = 5) {
  return [...(players || [])]
    .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function topTeams(teams) {
  const sorted = [...(teams || [])].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  return sorted.filter(team => team.score === topScore);
}

function displayTeamBoard(state, compact = false) {
  if (!state.team_mode || !state.teams?.length) return "";
  return `<div class="display-team-board ${compact ? "compact" : ""}">
    ${state.teams.map(team => `<section class="display-team-card team-${escapeHTML(team.color)}">
      <span>${escapeHTML(team.name)}</span>
      <strong>${team.score}</strong>
      <small>${team.players} ${team.players === 1 ? "player" : "players"}</small>
    </section>`).join("")}
  </div>`;
}

function displayTeamRosters(state) {
  if (!state.team_mode || !state.teams?.length) return "";
  return `<div class="display-rosters">
    ${state.teams.map(team => {
      const players = state.players.filter(player => player.team_id === team.id);
      return `<section class="display-roster team-${escapeHTML(team.color)}">
        <h2>${escapeHTML(team.name)}</h2>
        <div>
          ${players.length
            ? players.map(player => `<span>${escapeHTML(player.name)}</span>`).join("")
            : `<small>Waiting for players</small>`}
        </div>
      </section>`;
    }).join("")}
  </div>`;
}

function scoreRail(state, controls = "") {
  const controllerRecovery = role === "host" && state.viewer.is_owner
    ? Object.entries(state.controller_status || {}).map(([pairRole, paired]) => `<button class="text-button recover-controller" data-controller-role="${escapeHTML(pairRole)}" type="button">${paired ? "Replace" : "Create"} ${escapeHTML(pairRole === "couch" ? "family" : pairRole)} controller${paired ? "" : " invite"}</button>`).join("")
    : "";
  const teamBoard = state.team_mode && state.teams?.length
    ? `<div class="team-scoreboard">
        ${state.teams.map(team => `<div class="team-score-card team-${escapeHTML(team.color)}">
          <strong>${escapeHTML(team.name)}</strong>
          <output>${team.score}</output>
          <small>${team.players} ${team.players === 1 ? "player" : "players"}</small>
        </div>`).join("")}
      </div>`
    : "";
  const players = state.players.length
    ? state.players.map(player => {
        const avatar = player.avatar_preset
          ? `<span class="preset-avatar avatar-${escapeHTML(player.avatar_preset)}" aria-hidden="true"></span>`
          : player.avatar
          ? `<img src="${escapeHTML(player.avatar)}" alt="">`
          : escapeHTML(initials(player.name));
        const teamLabel = state.team_mode && player.team_name
          ? `<small class="team-pill team-${escapeHTML(player.team_color)}">${escapeHTML(player.team_name.replace(" Team", ""))}</small>`
          : "";
        const management = role === "host" && state.viewer.is_owner && state.phase === "lobby"
          ? `<span class="player-management">
              ${state.team_mode ? `<button class="switch-team-player" data-switch-team-player-id="${escapeHTML(player.id)}" type="button">Switch team</button>` : ""}
              <button class="remove-player" data-player-id="${escapeHTML(player.id)}" type="button" aria-label="Remove ${escapeHTML(player.name)}">×</button>
            </span>`
          : role === "host" && state.viewer.is_owner
            ? `<span class="player-management">
                ${state.phase === "question"
                  ? `<button class="away-player ${player.away ? "is-away" : ""}" data-away-player-id="${escapeHTML(player.id)}" type="button">${player.away ? "Bring back" : "Mark away"}</button>`
                  : ""}
              </span>`
            : "";
        return `
        <div class="player-score">
          <span class="player-avatar">${avatar}</span>
          <strong>${escapeHTML(player.name)} ${teamLabel} ${player.away ? `<small class="away-label">Away</small>` : `<i class="presence-dot ${player.connected ? "online" : "offline"}" title="${player.connected ? "Connected" : "Reconnecting"}"></i>`}</strong>
          <output>${player.score}</output>
          ${management}
        </div>`;
      }).join("")
    : `<p class="host-controls">Players will appear here when they join.</p>`;
  return `<aside class="score-rail">
    <h2>Players <span class="family-score">Family ${state.family_score || 0}</span></h2>
    ${teamBoard}
    <div class="score-list">${players}</div>
    ${role === "host" ? `
      ${state.control_mode === "hosted" ? `<div class="join-invite">
        <span class="host-only-label">Host only</span>
        <strong>Invite the family</strong>
        <p class="join-url">${escapeHTML(`${window.location.origin}/family-bible-bee/join/${code}`)}</p>
      </div>` : ""}
      <div class="host-controls">
        ${controls}
        ${state.phase !== "lobby" ? scoreAdjustmentPanel(state) : ""}
        ${controllerRecovery}
        <a class="bee-button secondary full" href="/family-bible-bee/display/${encodeURIComponent(code)}" target="_blank" rel="noopener">Open TV display</a>
        ${state.control_mode === "hosted" ? `<button id="copy-join-link" class="bee-button secondary full" type="button">Copy join link</button>` : ""}
        ${["question", "reveal", "paused"].includes(state.phase)
          ? `<button id="pause-game" class="text-button" type="button">${state.phase === "paused" ? "Resume game" : "Pause game"}</button>
             <button id="skip-question" class="text-button" type="button" ${state.phase === "paused" ? "disabled" : ""}>Skip question · count as missed</button>
             <button id="end-game-early" class="text-button danger-text" type="button">End game early</button>`
          : ""}
        ${state.viewer.is_owner ? `<button id="close-room" class="text-button danger-text" type="button">Delete this room</button>` : ""}
      </div>` : ""}
  </aside>`;
}

function scoreAdjustmentPanel(state) {
  const targets = state.team_mode ? state.teams : state.players;
  const targetType = state.team_mode ? "team" : "player";
  const history = state.score_adjustments || [];
  return `<details class="host-help score-adjustments"><summary>Host score adjustment</summary><div>
    <p>Add a kindness bonus or correct a scoring tap. Normal Bible Bee scoring stays unchanged.</p>
    ${targets.map(target => `<div class="score-adjust-row"><strong>${escapeHTML(target.name)}</strong>${[-50,-25,25,50].map(delta => `<button type="button" data-host-score-target-type="${targetType}" data-host-score-target-id="${escapeHTML(target.id)}" data-host-score-delta="${delta}">${delta > 0 ? "+" : ""}${delta}</button>`).join("")}</div>`).join("")}
    ${history.length ? `<div class="score-adjust-history"><strong>Recent</strong>${history.slice(-3).reverse().map(item => `<span>${escapeHTML(item.target_name)} ${item.delta > 0 ? "+" : ""}${item.delta} · ${escapeHTML(item.reason)}</span>`).join("")}<button id="undo-host-score" class="bee-button secondary full" type="button">Undo last adjustment</button></div>` : ""}
  </div></details>`;
}

function renderLobby(state) {
  if (role === "player") {
    const me = state.players.find(player => player.id === state.viewer.player_id);
    app.innerHTML = `<section class="game-stage player-wait">
      <div class="celebration-mark">✦</div>
      <h1>You’re in, ${escapeHTML(me?.name || "player")}!</h1>
      <p>The host will begin when everyone is ready.</p>
      <p class="waiting-dots">Waiting for the family</p>
      ${profileEditor(state, me)}
    </section>`;
    bindProfileEditor();
    return;
  }
  const adaptive = state.control_mode === "couch" || state.control_mode === "team_auto";
  const requiredRoles = state.control_mode === "couch" ? ["couch"] : state.control_mode === "team_auto" ? ["gold", "blue"] : ["host"];
  const controllersReady = state.control_mode === "hosted" || requiredRoles.every(pairRole => state.controller_status?.[pairRole]);
  const startDisabled = state.players.length && controllersReady ? "" : "disabled";
  const ownerTeamControls = state.viewer.is_owner && state.team_mode
    ? `<form id="team-name-form"><input name="gold" maxlength="18" value="${escapeHTML(state.teams.find(team => team.id === "gold")?.name || "Gold Team")}" aria-label="Gold team name"><input name="blue" maxlength="18" value="${escapeHTML(state.teams.find(team => team.id === "blue")?.name || "Blue Team")}" aria-label="Blue team name"><button class="bee-button secondary full" type="submit">Save team names</button></form><button id="rebalance-teams" class="bee-button secondary full" type="button" ${state.players.length < 2 ? "disabled" : ""}>Balance teams</button>`
    : "";
  const tokens = state.viewer.pairing_tokens || {};
  const pairingCards = Object.entries(tokens).map(([pairRole, token]) => {
    const paired = state.controller_status?.[pairRole];
    const label = pairRole === "couch" ? "Shared family controller" : pairRole === "host" ? "Private host controller" : `${pairRole} team controller`;
    return `<article class="controller-pair-card"><strong>${escapeHTML(label)}</strong>${paired
      ? `<span>Paired ✓</span><button class="bee-button secondary replace-controller" data-controller-role="${escapeHTML(pairRole)}" type="button">Revoke and replace</button>`
      : `<img src="/family-bible-bee/room/${encodeURIComponent(code)}/controller-qr/${encodeURIComponent(pairRole)}" alt="Private QR for ${escapeHTML(label)}"><button class="bee-button secondary share-controller" data-pair-url="${escapeHTML(`${window.location.origin}/family-bible-bee/controller/${code}#${token}`)}" type="button">Share private invite</button><button class="text-button replace-controller" data-controller-role="${escapeHTML(pairRole)}" type="button">Generate a new invite</button><code>${escapeHTML(token)}</code>`}</article>`;
  }).join("");
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage lobby-stage">
      <p class="round-meta">${escapeHTML(state.deck_name)} · ${escapeHTML(state.translation)} · ${escapeHTML(state.game_style)}</p>
      <h1>${state.control_mode === "couch" ? "Pair your shared family phone" : state.control_mode === "team_auto" ? "Pair both team phones" : "Gather your family"}</h1>
      <p>${adaptive ? "Use these private controller invites. The public room code cannot join this game." : "Pair the private host controller, then let optional players join with the public room code."}</p>
      ${!adaptive ? `<div class="lobby-code-row">
        <div class="big-code">${escapeHTML(code)}</div>
        <div class="lobby-qr">
          <img src="/family-bible-bee/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
          <span>Scan to join</span>
        </div>
      </div>` : ""}
      ${pairingCards ? `<div class="controller-pair-grid">${pairingCards}</div>` : ""}
      <p>${state.players.length} ${state.players.length === 1 ? "player is" : "players are"} ready</p>
      <div class="room-ready-checklist" aria-label="Game readiness">
        <strong>Ready to begin?</strong>
        <span class="ready">✓ ${escapeHTML(state.deck_name)} selected</span>
        <span class="${controllersReady ? "ready" : "waiting"}">${controllersReady ? "✓" : "○"} ${adaptive ? "Private controllers paired" : "Host and players connected"}</span>
        <span class="ready">✓ Everyone knows answers lock once</span>
      </div>
    </section>
  ${scoreRail(state, `${ownerTeamControls}
    <button id="start-game" class="bee-button primary full" type="button" ${startDisabled}>Start ${state.question_total} rounds</button>`)}
  </div>`;
  document.querySelector("#start-game")?.addEventListener("click", () => hostAction("start"));
  document.querySelector("#rebalance-teams")?.addEventListener("click", rebalanceTeams);
  document.querySelector("#team-name-form")?.addEventListener("submit", async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/family-bible-bee/rooms/${encodeURIComponent(code)}/teams/names`, { method: "POST", body: JSON.stringify({ gold: form.get("gold"), blue: form.get("blue") }) });
      showToast("Team names saved."); await refresh();
    } catch (error) { showToast(error.message); }
  });
  document.querySelectorAll(".share-controller").forEach(button => button.addEventListener("click", async () => {
    const url = button.dataset.pairUrl;
    try {
      if (navigator.share) await navigator.share({ title: "Faith Sparks Bible Bee controller", url });
      else { await navigator.clipboard.writeText(url); showToast("Private controller invite copied."); }
    } catch (error) { if (error?.name !== "AbortError") showToast("Could not share this invite."); }
  }));
  document.querySelectorAll(".replace-controller").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/family-bible-bee/rooms/${encodeURIComponent(code)}/controllers/${encodeURIComponent(button.dataset.controllerRole)}/replace`, { method: "POST", body: "{}" });
      showToast("Old access revoked. New private invite ready.");
      await refresh();
    } catch (error) { showToast(error.message); }
  }));
  bindRoomManagement();
}

function answerButtons(state) {
  const question = state.question;
  const viewerAnswer = state.viewer.answer;
  return question.choices.map((choice, index) => {
    const selected = viewerAnswer === index || (
      state.phase === "question"
      && !state.viewer.has_answered
      && pendingChoice === index
    );
    const correct = state.phase === "reveal" && question.correct === index;
    const wrongSelected = state.phase === "reveal" && selected && !correct;
    const classes = [
      "answer-button",
      selected ? "selected" : "",
      correct ? "correct-answer" : "",
      wrongSelected ? "wrong-answer" : "",
    ].filter(Boolean).join(" ");
    const disabled = role !== "player" || !state.viewer.can_answer || state.viewer.has_answered || state.phase === "reveal";
    return `<button class="${classes}" data-choice="${index}" type="button" ${disabled ? "disabled" : ""}>
      <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHTML(choice)}</span>
    </button>`;
  }).join("");
}

function renderQuestion(state) {
  const answered = state.answered_player_ids.length;
  const question = state.question;
  if (
    state.phase !== "question"
    || state.viewer.has_answered
    || pendingQuestionIndex !== state.question_index
  ) {
    pendingChoice = null;
    pendingQuestionIndex = state.question_index;
  }
  let controls = "";
  if (role === "host") {
    controls = state.phase === "question"
      ? `<p>${answered} of ${state.active_player_count ?? state.players.filter(player => !player.away && player.connected).length} ${question.mode === "oral" ? "ready" : "answered"}</p>
         <button id="reveal-answer" class="bee-button primary full" type="button">Reveal answer</button>`
      : `<p class="auto-next-note">${state.question_index + 1 >= state.question_total ? "Results" : "Next round"} in <strong data-countdown>${state.reveal_seconds}</strong>s unless paused.</p>
         <button id="next-question" class="bee-button primary full" type="button">${state.question_index + 1 >= state.question_total ? "See final results now" : "Next round now"}</button>`;
  }

  let feedback = "";
  if (role === "player" && question.mode === "oral" && state.phase === "reveal") {
    const judgment = state.viewer.oral_judgment;
    feedback = judgment === "correct"
      ? `<p class="answer-feedback good">Beautiful recitation! Full credit.</p>`
      : judgment === "almost"
        ? `<p class="answer-feedback">Almost there—partial credit earned.</p>`
        : `<p class="answer-feedback try">Good practice. This passage will return for review.</p>`;
  } else if (role === "player" && state.phase === "question" && pendingChoice !== null) {
    feedback = `<div class="answer-confirmation" role="status">
      <strong>Lock in answer ${String.fromCharCode(65 + pendingChoice)}?</strong>
      <span>${escapeHTML(question.choices[pendingChoice])}</span>
      <div>
        <button id="confirm-answer" class="bee-button primary" type="button">Yes, lock this answer</button>
        <button id="change-answer" class="bee-button secondary" type="button">No, choose again</button>
      </div>
    </div>`;
  } else if (role === "player" && state.phase === "question" && state.viewer.has_answered) {
    feedback = `<p class="answer-feedback">Answer locked in. Look up at the shared screen!</p>`;
  } else if (role === "player" && state.phase === "reveal") {
    feedback = state.viewer.correct
      ? `<p class="answer-feedback good">${escapeHTML(state.viewer.score_reason || `Wonderful remembering! +${state.viewer.round_points || 0}`)}.</p>`
      : `<p class="answer-feedback try">Good try—this one will come back for review.</p>`;
  }

  let answerArea = `<div class="answers">${answerButtons(state)}</div>`;
  if (question.mode === "oral") {
    if (role === "player") {
      const selfJudge = state.control_mode === "couch" || state.control_mode === "team_auto";
      const adaptivePractice = state.control_mode === "couch"
        ? "Pass the private phone to the active team. Practice together, then tap Ready."
        : "The active team practices together, recites, and records its result honestly.";
      answerArea = state.viewer.has_answered
        ? `<div class="oral-player-panel"><strong>Recitation ready</strong><p>${selfJudge ? "Recite together, then choose the result honestly." : "Recite when the host calls your name."}</p>${selfJudge && state.phase === "question" ? `<div>
            <button data-judge-player="${escapeHTML(state.viewer.player_id)}" data-judgment="correct" type="button">Full credit</button>
            <button data-judge-player="${escapeHTML(state.viewer.player_id)}" data-judgment="almost" type="button">Almost</button>
            <button data-judge-player="${escapeHTML(state.viewer.player_id)}" data-judgment="try" type="button">Practice</button>
          </div>` : ""}</div>`
        : `<div class="oral-player-panel"><p>${selfJudge ? adaptivePractice : "Practice quietly, then tell the host you’re ready."}</p><button id="ready-to-recite" class="bee-button primary" type="button">I’m ready to recite</button></div>`;
    } else {
      const activePlayers = state.players.filter(player => !player.away && player.connected);
      const rows = activePlayers.map(player => {
        const ready = state.answered_player_ids.includes(player.id);
        const judgment = state.oral_judgments[player.id];
        return `<div class="oral-judge-row">
          <strong>${escapeHTML(player.name)}</strong>
          <span>${judgment ? escapeHTML(judgment) : ready ? "Ready" : "Practicing"}</span>
          ${role === "host" && state.phase === "question" && !judgment ? `<div>
            <button data-judge-player="${escapeHTML(player.id)}" data-judgment="correct" type="button">Full credit</button>
            <button data-judge-player="${escapeHTML(player.id)}" data-judgment="almost" type="button">Almost</button>
            <button data-judge-player="${escapeHTML(player.id)}" data-judgment="try" type="button">Practice</button>
          </div>` : ""}
        </div>`;
      }).join("");
      answerArea = `<div class="oral-host-panel"><p>Call on each player, listen, then award credit.</p>${rows}</div>`;
    }
  }

  app.innerHTML = `<div class="game-layout">
    <section class="game-stage">
      <div class="round-meta">
        <span>Round ${state.question_index + 1} of ${state.question_total}</span>
        <span>${escapeHTML(state.translation)}</span>
      </div>
      <h1 class="mode-banner">${escapeHTML(question.label)}</h1>
      ${state.active_team_id ? `<p class="turn-handoff">${state.viewer.can_answer ? `${escapeHTML(state.teams.find(team => team.id === state.active_team_id)?.name || state.active_team_id)}: this is your turn.` : `Pass control to ${escapeHTML(state.teams.find(team => team.id === state.active_team_id)?.name || state.active_team_id)}.`}</p>` : ""}
      <p class="question-prompt">${escapeHTML(question.prompt)}</p>
      ${state.phase === "question" && state.question_deadline ? `<p class="challenge-timer">${escapeHTML(state.difficulty)} timer: <strong data-question-countdown>${state.question_seconds || 30}</strong>s</p>` : ""}
      ${answerArea}
      ${feedback}
      ${state.phase === "reveal" ? `<div class="revealed-verse"><strong>${escapeHTML(question.reference)}</strong><p>${escapeHTML(question.answer_text || "")}</p></div>` : ""}
      ${state.phase === "reveal" && question.context_note ? `<aside class="learning-context"><strong>Talk about it</strong><p>${escapeHTML(question.context_note)}</p></aside>` : ""}
      ${state.phase === "reveal" ? `<p class="shared-countdown">${state.question_index + 1 >= state.question_total ? "Final results" : "Next question"} in <strong data-countdown>${state.reveal_seconds}</strong> seconds</p>` : ""}
    </section>
    ${scoreRail(state, controls)}
  </div>`;

  document.querySelectorAll(".answer-button:not(:disabled)").forEach(button => {
    button.addEventListener("click", () => stageAnswer(Number(button.dataset.choice)));
  });
  document.querySelector("#confirm-answer")?.addEventListener("click", () => submitAnswer(pendingChoice));
  document.querySelector("#change-answer")?.addEventListener("click", clearPendingAnswer);
  document.querySelector("#ready-to-recite")?.addEventListener("click", readyToRecite);
  document.querySelectorAll("[data-judge-player]").forEach(button => {
    button.addEventListener("click", () => judgeRecitation(button.dataset.judgePlayer, button.dataset.judgment));
  });
  document.querySelector("#reveal-answer")?.addEventListener("click", () => hostAction("reveal"));
  document.querySelector("#next-question")?.addEventListener("click", () => hostAction("next"));
  bindRoomManagement();
}

function stageAnswer(choice) {
  pendingChoice = choice;
  pendingQuestionIndex = latestState.question_index;
  renderQuestion(latestState);
  speakConfirmation();
}

function clearPendingAnswer() {
  stopSpeaking();
  pendingChoice = null;
  renderQuestion(latestState);
  speakQuestion(latestState, true);
}

function renderFinished(state) {
  const topScore = state.players[0]?.score;
  const winners = state.players.filter(player => player.score === topScore);
  const teamWinners = state.team_mode ? topTeams(state.teams) : [];
  const cooperative = state.scoring_style === "cooperative";
  const goalReached = state.family_score >= state.family_goal;
  const winnerHeading = cooperative
    ? goalReached ? "Your Family Beat the Goal!" : "Your Family Grew Together!"
    : state.team_mode
    ? teamWinners.length > 1
      ? "Team Tie!"
      : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
    : winners.length > 1
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
  const topIndividualRows = state.team_mode
    ? `<div class="top-individuals">
        <h2>Top players</h2>
        ${sortedTopPlayers(state.players, 5).map((player, index) => `<div>
          <span>${index + 1}. ${escapeHTML(player.name)}</span>
          <strong>${player.score}</strong>
        </div>`).join("")}
      </div>`
    : "";
  app.innerHTML = `<div class="game-layout">
    <section class="game-stage finished-stage celebration-stage">
      <div class="celebration-mark">✦</div>
      <h1>${winnerHeading}</h1>
      <p>${cooperative ? `Together you earned ${state.family_score} of ${state.family_goal} goal points.` : state.team_mode ? "Team points are tallied. Celebrate the winners, then review the verses together." : "You practiced " + state.question_total + " passages together. Accuracy matters, but faithful practice is the real win."}</p>
      ${cooperative ? `<div class="family-goal-meter"><span style="width:${Math.min(100, Math.round((state.family_score / Math.max(1, state.family_goal)) * 100))}%"></span></div>` : ""}
      ${displayTeamBoard(state, true)}
      ${topIndividualRows}
      <div class="review-list">
        <h2>Review tomorrow</h2>
        ${reviewRows}
        <h2>Family strengths</h2>
        <ul>${strengths}</ul>
        ${playerFeedback ? `<div class="feedback-grid">${playerFeedback}</div>` : ""}
        ${summary.suggested_deck ? `<p class="next-deck">Try next: <strong>${escapeHTML(summary.suggested_deck)}</strong></p>` : ""}
        ${role === "host" ? `<button id="print-review" class="bee-button secondary" type="button">Print family practice sheet</button>` : ""}
      </div>
      ${nextGameActions("Back to Family Bible Bee")}
    </section>
    ${scoreRail(state, (summary.review_tomorrow || []).length && role === "host"
      ? `<button id="review-rematch" class="bee-button gold full" type="button">Play missed verses again</button>
         <button id="play-again" class="bee-button secondary full" type="button">New game, same players</button>`
      : role === "host"
        ? `<button id="play-again" class="bee-button secondary full" type="button">New game, same players</button>`
        : "")}
  </div>`;
  bindRoomManagement();
  document.querySelector("#print-review")?.addEventListener("click", () => window.print());
}

function renderDisplayLobby(state) {
  const adaptive = state.control_mode === "couch" || state.control_mode === "team_auto";
  const pairingMessage = state.control_mode === "couch"
    ? "Pair the private family controller from the creator’s screen."
    : "Pair the Gold and Blue team phones from the creator’s screen.";
  const couchReadyMessage = `One controller paired · ${state.teams?.map(team => team.name).join(" and ") || "Both teams"} ready`;
  app.innerHTML = `<section class="display-stage display-lobby">
    <p class="display-kicker">${escapeHTML(state.deck_name)} · ${escapeHTML(state.translation)}</p>
    <h1>${adaptive ? "Private controllers needed" : "Join the Bible Bee"}</h1>
    ${adaptive ? `<p class="display-prompt">${escapeHTML(pairingMessage)}</p>` : `<div class="display-join-row">
      <div>
        <span>Room code</span>
        <strong>${escapeHTML(code)}</strong>
      </div>
      <img src="/family-bible-bee/room/${encodeURIComponent(code)}/qr" alt="QR code to join room ${escapeHTML(code)}">
    </div>`}
    <p class="display-count">${state.control_mode === "couch" && state.controller_status?.couch ? escapeHTML(couchReadyMessage) : `${state.players.length} ${state.players.length === 1 ? "player" : "players"} ready`}</p>
    ${displayTeamRosters(state)}
  </section>`;
}

function renderDisplayQuestion(state) {
  const question = state.question;
  const answered = state.answered_player_ids.length;
  const activePlayers = state.eligible_answer_count ?? state.active_player_count ?? state.players.filter(player => !player.away && player.connected).length;
  const activeTeam = state.active_team_id ? state.teams.find(team => team.id === state.active_team_id) : null;
  const oralInstruction = state.control_mode === "couch"
    ? "Pass the private phone to the active team. Practice together, then tap Ready."
    : state.control_mode === "team_auto"
      ? "The active team practices together, recites, and records its result honestly."
      : "Players recite when the host calls their name.";
  const answerRows = question.mode === "oral"
    ? `<div class="display-oral-note">${escapeHTML(oralInstruction)}</div>`
    : `<div class="display-answers">
        ${question.choices.map((choice, index) => {
          const correct = state.phase === "reveal" && question.correct === index;
          return `<div class="${correct ? "correct-answer" : ""}">
            <span>${String.fromCharCode(65 + index)}</span>
            <strong>${escapeHTML(choice)}</strong>
          </div>`;
        }).join("")}
      </div>`;
  app.innerHTML = `<section class="display-stage display-question">
    <div class="display-topline">
      <span>Round ${state.question_index + 1} of ${state.question_total}</span>
      <span>${escapeHTML(state.translation)}</span>
      <span>${state.phase === "question" ? `${answered} of ${activePlayers} answered` : "Answer revealed"}</span>
    </div>
    ${displayTeamBoard(state, true)}
    ${activeTeam ? `<p class="turn-handoff">${escapeHTML(activeTeam.name)} answers this question</p>` : ""}
    <h1>${escapeHTML(question.label)}</h1>
    <p class="display-prompt">${escapeHTML(question.prompt)}</p>
    ${state.phase === "question" && state.question_deadline ? `<p class="display-timer"><strong data-question-countdown>${state.question_seconds || 30}</strong>s</p>` : ""}
    ${answerRows}
    ${state.phase === "reveal" ? `<div class="display-reveal">
      <span>${escapeHTML(question.reference)}</span>
      <p>${escapeHTML(question.answer_text || "")}</p>
    </div>${question.context_note ? `<div class="display-context"><strong>Talk about it</strong><p>${escapeHTML(question.context_note)}</p></div>` : ""}` : ""}
  </section>`;
}

function renderDisplayFinished(state) {
  const teamWinners = state.team_mode ? topTeams(state.teams) : [];
  const topPlayers = sortedTopPlayers(state.players, 5);
  const cooperative = state.scoring_style === "cooperative";
  const heading = cooperative
    ? state.family_score >= state.family_goal ? "Your Family Beat the Goal!" : "Your Family Grew Together!"
    : state.team_mode
    ? teamWinners.length > 1
      ? "Team Tie!"
      : `${escapeHTML(teamWinners[0]?.name || "Team")} Wins!`
    : topPlayers.length > 1 && topPlayers[0].score === topPlayers[1].score
      ? "We Have a Tie!"
      : `${escapeHTML(topPlayers[0]?.name || "Bible Bee")} Wins!`;
  app.innerHTML = `<section class="display-stage display-final celebration-stage">
    <div class="celebration-mark">✦</div>
    <h1>${heading}</h1>
    ${cooperative ? `<p>Together: ${state.family_score} of ${state.family_goal} goal points</p><div class="family-goal-meter"><span style="width:${Math.min(100, Math.round((state.family_score / Math.max(1, state.family_goal)) * 100))}%"></span></div>` : ""}
    ${displayTeamBoard(state)}
    <div class="display-top-players">
      <h2>Top players</h2>
      ${topPlayers.map((player, index) => `<div>
        <span>${index + 1}. ${escapeHTML(player.name)}</span>
        <strong>${player.score}</strong>
      </div>`).join("")}
    </div>
  </section>`;
}

function renderDisplay(state) {
  if (state.phase === "lobby") renderDisplayLobby(state);
  else if (state.phase === "question" || state.phase === "reveal") renderDisplayQuestion(state);
  else if (state.phase === "paused") renderPaused(state);
  else renderDisplayFinished(state);
}

function nextGameActions(homeLabel) {
  return `<div class="next-game-actions" aria-label="Play another game">
    <h2>Ready for another game?</h2>
    <form class="finished-join-form">
      <label for="finished-room-code">Enter a new room code</label>
      <div class="finished-code-row">
        <input id="finished-room-code" name="room_code" maxlength="4" autocomplete="off"
          autocapitalize="characters" pattern="[A-Za-z0-9]{4}" placeholder="BEE7" required>
        <button class="bee-button primary" type="submit">Join room</button>
      </div>
    </form>
    <a class="bee-button secondary" href="/family-bible-bee">${homeLabel}</a>
  </div>`;
}

function bindNextGameActions() {
  document.querySelector(".finished-join-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nextCode = new FormData(form).get("room_code")?.toString().trim().toUpperCase();
    if (!nextCode || !/^[A-Z0-9]{4}$/.test(nextCode)) {
      form.querySelector("input")?.focus();
      return;
    }
    window.location.assign(`/family-bible-bee/join/${encodeURIComponent(nextCode)}`);
  });
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
  document.querySelectorAll(".recover-controller").forEach(button => button.addEventListener("click", async () => {
    try {
      const result = await api(`/api/family-bible-bee/rooms/${encodeURIComponent(code)}/controllers/${encodeURIComponent(button.dataset.controllerRole)}/replace`, { method: "POST", body: "{}" });
      const url = `${window.location.origin}/family-bible-bee/controller/${code}#${result.token}`;
      let delivered = false;
      if (navigator.share) {
        try { await navigator.share({ title: "Faith Sparks Bible Bee replacement controller", url }); delivered = true; }
        catch (shareError) { if (shareError?.name !== "AbortError") showToast("Share did not open; copying instead."); }
      }
      if (!delivered) {
        try { await navigator.clipboard.writeText(url); showToast("Replacement controller invite copied."); }
        catch (_clipboardError) { window.prompt("Copy this replacement controller invite:", url); }
      }
      await refresh();
    } catch (error) { showToast(error.message); }
  }));
  bindNextGameActions();
  document.querySelectorAll(".remove-player").forEach(button => {
    button.addEventListener("click", () => removePlayer(button.dataset.playerId));
  });
  document.querySelectorAll("[data-switch-team-player-id]").forEach(button => {
    button.addEventListener("click", () => switchTeam(button.dataset.switchTeamPlayerId));
  });
  document.querySelectorAll("[data-host-score-delta]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/family-bible-bee/rooms/${encodeURIComponent(code)}/score-adjust`, { method: "POST", body: JSON.stringify({ target_type: button.dataset.hostScoreTargetType, target_id: button.dataset.hostScoreTargetId, delta: Number(button.dataset.hostScoreDelta) }) });
      showToast("Host adjustment saved."); await refresh();
    } catch (error) { showToast(error.message); }
  }));
  document.querySelector("#undo-host-score")?.addEventListener("click", async () => {
    try { await api(`/api/family-bible-bee/rooms/${encodeURIComponent(code)}/score-adjust/undo`, { method: "POST", body: "{}" }); showToast("Last adjustment undone."); await refresh(); }
    catch (error) { showToast(error.message); }
  });
  document.querySelectorAll("[data-away-player-id]").forEach(button => {
    button.addEventListener("click", () => toggleAway(button.dataset.awayPlayerId));
  });
  document.querySelector("#close-room")?.addEventListener("click", closeRoom);
  document.querySelector("#copy-join-link")?.addEventListener("click", copyJoinLink);
  document.querySelector("#pause-game")?.addEventListener("click", () => hostAction("pause"));
  document.querySelector("#skip-question")?.addEventListener("click", () => hostAction("skip"));
  document.querySelector("#end-game-early")?.addEventListener("click", async () => {
    if (window.confirm("End the game now and show the review summary?")) await hostAction("end");
  });
  document.querySelector("#review-rematch")?.addEventListener("click", () => hostAction("rematch"));
  document.querySelector("#play-again")?.addEventListener("click", () => hostAction("play-again"));
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
      await api(`/api/family-bible-bee/rooms/${code}/profile`, {
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

function render(state) {
  const previousState = latestState;
  latestState = state;
  if (role === "display") renderDisplay(state);
  else if (state.phase === "lobby") renderLobby(state);
  else if (state.phase === "question" || state.phase === "reveal") renderQuestion(state);
  else if (state.phase === "paused") renderPaused(state);
  else renderFinished(state);
  updateCountdown();
  speakQuestion(state);
  if (previousState && previousState.phase === "question" && state.phase === "reveal") playTone("reveal");
  else if (previousState && previousState.phase !== "finished" && state.phase === "finished") playTone("finish");
  else if (previousState && previousState.question_index !== state.question_index) playTone("round");
}

function updateCountdown() {
  const now = Date.now() / 1000;
  if (latestState?.reveal_deadline && latestState.phase === "reveal") {
    const remaining = Math.max(0, Math.ceil(latestState.reveal_deadline - now));
    document.querySelectorAll("[data-countdown]").forEach(node => {
      node.textContent = String(remaining);
    });
  }
  if (latestState?.question_deadline && latestState.phase === "question") {
    const remaining = Math.max(0, Math.ceil(latestState.question_deadline - now));
    document.querySelectorAll("[data-question-countdown]").forEach(node => {
      node.textContent = String(remaining);
    });
  }
}

async function refresh() {
  if (requestInFlight || roomExpired || Date.now() < refreshPausedUntil) return;
  requestInFlight = true;
  try {
    const state = await api(`/api/family-bible-bee/rooms/${code}`);
    refreshPausedUntil = 0;
    failedRefreshes = 0;
    connectionStatus.classList.remove("show");
    const signature = JSON.stringify(state);
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      render(state);
    }
  } catch (error) {
    if (error.status === 404) {
      roomExpired = true;
      connectionStatus.classList.remove("show");
      app.innerHTML = `<section class="game-stage player-wait">
        <div class="celebration-mark">✦</div>
        <h1>This game has wrapped up.</h1>
        <p>Finished room codes retire after 30 minutes.</p>
        ${nextGameActions("Back to Family Bible Bee")}
      </section>`;
      bindNextGameActions();
      return;
    }
    if (error.status === 429 || error.status === 503) refreshPausedUntil = Date.now() + 15000;
    failedRefreshes += 1;
    if (failedRefreshes >= 2) connectionStatus.classList.add("show");
  } finally {
    requestInFlight = false;
  }
}

async function heartbeat() {
  if (role !== "player" || document.hidden || roomExpired) return;
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
  if (choice === null) return;
  stopSpeaking();
  try {
    await api(`/api/family-bible-bee/rooms/${code}/answer`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    playTone("lock");
    pendingChoice = null;
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function readyToRecite() {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/ready`, { method: "POST", body: "{}" });
    playTone("lock");
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function judgeRecitation(playerId, judgment) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/judge`, {
      method: "POST",
      body: JSON.stringify({ player_id: playerId, judgment }),
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

async function switchTeam(playerId) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/players/${encodeURIComponent(playerId)}/team`, {
      method: "POST",
      body: "{}",
    });
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function rebalanceTeams() {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/teams/rebalance`, {
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

async function toggleAway(playerId) {
  try {
    await api(`/api/family-bible-bee/rooms/${code}/players/${encodeURIComponent(playerId)}/away`, {
      method: "POST",
      body: "{}",
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
  if (!window.confirm("Permanently delete this room for everyone?")) return;
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
updateSoundToggle();
if (readModeSelect) {
  readModeSelect.value = ["off", "verse", "all"].includes(readMode) ? readMode : "off";
  readModeSelect.addEventListener("change", () => {
    readMode = readModeSelect.value;
    window.localStorage.setItem("bibleBeeReadMode", readMode);
    lastSpokenQuestion = "";
    stopSpeaking();
    speakQuestion(latestState, true);
  });
}
soundToggle?.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  window.localStorage.setItem("bibleBeeSound", soundEnabled ? "on" : "off");
  updateSoundToggle();
  if (soundEnabled) playTone("round");
});
window.setInterval(refresh, 3000);
window.setInterval(updateCountdown, 250);
heartbeat();
window.setInterval(heartbeat, 25000);
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
