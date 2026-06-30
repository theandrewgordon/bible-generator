"use strict";

// Everything is stored in this browser only. No account or server is involved.
const STORAGE_KEY = "faithsparks-speed-die-v1";
const PLAYER_COLORS = ["#397bb5", "#d69b29", "#4f9169", "#b95e78", "#785daa", "#cf6d3b"];
const SPEED_FACES = [1, 2, 3, "Bus", "Property Finder", "Property Finder"];

// Standard U.S. board order. Names remain editable for other editions.
// The group and order fields provide quick visual labels such as "Orange 1."
const DEFAULT_SPACES = [
  ["GO", "corner"], ["Mediterranean Avenue", "property", "Brown", 1], ["Community Chest", "other"], ["Baltic Avenue", "property", "Brown", 2],
  ["Income Tax", "other"], ["Reading Railroad", "railroad", "Railroad", 1], ["Oriental Avenue", "property", "Light Blue", 1], ["Chance", "other"],
  ["Vermont Avenue", "property", "Light Blue", 2], ["Connecticut Avenue", "property", "Light Blue", 3], ["Jail / Just Visiting", "corner"], ["St. Charles Place", "property", "Pink", 1],
  ["Electric Company", "utility", "Utility", 1], ["States Avenue", "property", "Pink", 2], ["Virginia Avenue", "property", "Pink", 3], ["Pennsylvania Railroad", "railroad", "Railroad", 2],
  ["St. James Place", "property", "Orange", 1], ["Community Chest", "other"], ["Tennessee Avenue", "property", "Orange", 2], ["New York Avenue", "property", "Orange", 3],
  ["Free Parking", "corner"], ["Kentucky Avenue", "property", "Red", 1], ["Chance", "other"], ["Indiana Avenue", "property", "Red", 2],
  ["Illinois Avenue", "property", "Red", 3], ["B. & O. Railroad", "railroad", "Railroad", 3], ["Atlantic Avenue", "property", "Yellow", 1], ["Ventnor Avenue", "property", "Yellow", 2],
  ["Water Works", "utility", "Utility", 2], ["Marvin Gardens", "property", "Yellow", 3], ["Go to Jail", "corner"], ["Pacific Avenue", "property", "Green", 1],
  ["North Carolina Avenue", "property", "Green", 2], ["Community Chest", "other"], ["Pennsylvania Avenue", "property", "Green", 3], ["Short Line", "railroad", "Railroad", 4],
  ["Chance", "other"], ["Park Place", "property", "Dark Blue", 1], ["Luxury Tax", "other"], ["Boardwalk", "property", "Dark Blue", 2]
].map(([name, type, group = null, groupOrder = null], index) => ({
  index, name, type, group, groupOrder, owner: null, mortgaged: false
}));

const GROUP_COLORS = {
  "Brown": "#8b5a32",
  "Light Blue": "#82cbe5",
  "Pink": "#d95b9d",
  "Orange": "#ee8a27",
  "Red": "#d83b40",
  "Yellow": "#e8c62f",
  "Green": "#29945d",
  "Dark Blue": "#26509c",
  "Railroad": "#59616c",
  "Utility": "#7795a5"
};

const app = document.querySelector("#app");
const menuButton = document.querySelector("#game-menu-button");
const menuDialog = document.querySelector("#menu-dialog");
const ownerDialog = document.querySelector("#owner-dialog");
const positionDialog = document.querySelector("#position-dialog");
const positionForm = document.querySelector("#position-form");
const tradeDialog = document.querySelector("#trade-dialog");
const tradeForm = document.querySelector("#trade-form");
let ownerDialogCallback = null;
let correctingPlayerId = null;
let state = loadState();

function freshState() {
  return {
    version: 3,
    started: false,
    players: [],
    currentPlayer: 0,
    mode: "streets",
    activation: "immediate",
    spaces: structuredClone(DEFAULT_SPACES),
    roll: null,
    phase: "ready",
    message: "",
    pendingFinderTarget: null,
    extraTurn: false,
    history: []
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidState(saved)) return migrateState(saved);
  } catch (error) {
    console.warn("Saved game could not be read.", error);
  }
  return freshState();
}

function isValidState(value) {
  return Boolean(
    value && [1, 2, 3].includes(value.version) && Array.isArray(value.players) &&
    Array.isArray(value.spaces) && value.spaces.length === 40
  );
}

function migrateState(saved) {
  // Preserve players, positions, ownership, and custom edits. Replace only names
  // that still match the original generic defaults from the first app version.
  const oldGenericNames = [
    "GO", "Maple Lane", "Community Stop", "Cedar Lane", "Game Fee", "North Station", "Lake Avenue", "Lucky Card",
    "Hill Avenue", "Garden Avenue", "Visiting", "Market Place", "Power Company", "Meadow Avenue", "Sunset Avenue", "East Station",
    "Orchard Street", "Community Stop", "River Street", "Forest Street", "Free Rest", "Park Avenue", "Lucky Card", "Library Avenue",
    "Harbor Avenue", "South Station", "Pine Street", "Willow Street", "Water Works", "Aspen Street", "Rest Stop", "Rose Avenue",
    "Oak Avenue", "Community Stop", "Elm Avenue", "West Station", "Lucky Card", "Grand Avenue", "City Fee", "Boardwalk Way"
  ];
  saved.spaces = saved.spaces.map((space, index) => ({
    ...space,
    name: space.name === oldGenericNames[index] ? DEFAULT_SPACES[index].name : space.name,
    type: DEFAULT_SPACES[index].type,
    group: DEFAULT_SPACES[index].group,
    groupOrder: DEFAULT_SPACES[index].groupOrder,
    mortgaged: Boolean(space.mortgaged)
  }));
  saved.players = saved.players.map(player => ({
    ...player,
    inJail: Boolean(player.inJail),
    jailAttempts: Number(player.jailAttempts) || 0,
    consecutiveDoubles: Number(player.consecutiveDoubles) || 0
  }));
  saved.extraTurn = Boolean(saved.extraTurn);
  saved.version = 3;
  return saved;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentPlayer() { return state.players[state.currentPlayer]; }
function currentSpace() { return state.spaces[currentPlayer().position]; }
function isProperty(space) { return ["property", "railroad", "utility"].includes(space.type); }
function spaceGroupLabel(space) {
  return space.group ? `${space.group} ${space.groupOrder}` : "";
}
function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function render() {
  menuButton.classList.toggle("hidden", !state.started);
  if (!state.started) renderSetup();
  else renderGame();
}

function renderSetup() {
  app.innerHTML = `
    <section class="panel">
      <div class="setup-intro">
        <h2>Start a family game</h2>
        <p class="muted">Add your players and choose how the Speed Die should work. You can edit every property name once the game begins.</p>
      </div>
      <form id="setup-form">
        <div class="setup-grid">
          <div>
            <label class="field">
              <span>Number of players</span>
              <select id="player-count">
                ${[2, 3, 4, 5, 6].map(n => `<option value="${n}">${n} players</option>`).join("")}
              </select>
            </label>
            <div id="player-inputs" class="player-inputs"></div>
          </div>
          <div>
            <p class="fieldset-label">Rule mode</p>
            <div class="radio-group">
              <label class="radio-card">
                <input type="radio" name="mode" value="streets" checked>
                <strong>Streets-style Speed Die</strong>
                <small>Property Finder skips the white-dice move.</small>
              </label>
              <label class="radio-card">
                <input type="radio" name="mode" value="classic">
                <strong>Classic Speed Die Mode</strong>
                <small>Move the white dice first, then use Property Finder.</small>
              </label>
            </div>
            <p class="fieldset-label">When is the Speed Die active?</p>
            <div class="radio-group">
              <label class="radio-card">
                <input type="radio" name="activation" value="immediate" checked>
                <strong>Immediately</strong>
                <small>Roll all three dice from the first turn.</small>
              </label>
              <label class="radio-card">
                <input type="radio" name="activation" value="after-go">
                <strong>After each player passes GO</strong>
                <small>Each player unlocks it after their first trip around.</small>
              </label>
            </div>
          </div>
        </div>
        <button class="button primary" type="submit">Start game</button>
      </form>
    </section>`;

  const count = document.querySelector("#player-count");
  const names = document.querySelector("#player-inputs");
  function drawNameInputs() {
    const old = [...names.querySelectorAll("input")].map(input => input.value);
    names.innerHTML = Array.from({ length: Number(count.value) }, (_, index) => `
      <label class="field">
        <span>Player ${index + 1}</span>
        <input type="text" maxlength="24" required value="${escapeHTML(old[index] || "")}" placeholder="Enter a name">
      </label>`).join("");
  }
  count.addEventListener("change", drawNameInputs);
  drawNameInputs();
  document.querySelector("#setup-form").addEventListener("submit", startGame);
}

function startGame(event) {
  event.preventDefault();
  const nameInputs = [...document.querySelectorAll("#player-inputs input")];
  const names = nameInputs.map(input => input.value.trim());
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    alert("Please give each player a different name.");
    return;
  }
  state = freshState();
  state.started = true;
  state.mode = new FormData(event.currentTarget).get("mode");
  state.activation = new FormData(event.currentTarget).get("activation");
  state.players = names.map((name, index) => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}`,
    name,
    position: 0,
    passedGo: state.activation === "immediate",
    color: PLAYER_COLORS[index],
    inJail: false,
    jailAttempts: 0,
    consecutiveDoubles: 0
  }));
  saveState();
  render();
}

function renderGame() {
  const player = currentPlayer();
  const space = currentSpace();
  const speedActive = state.activation === "immediate" || player.passedGo;
  app.innerHTML = `
    <section class="panel turn-heading">
      <span class="player-token" style="background:${player.color}">${escapeHTML(initials(player.name))}</span>
      <div>
        <p class="eyebrow">Current player</p>
        <h2>${escapeHTML(player.name)}</h2>
        <p class="location">At ${escapeHTML(space.name)} · ${state.mode === "streets" ? "Streets-style" : "Classic"} mode</p>
      </div>
    </section>

    ${renderPlayers()}
    ${state.roll ? renderDice() : ""}
    ${renderActionArea(speedActive)}
    ${renderBoard()}
  `;
  bindGameEvents();
}

function renderPlayers() {
  return `<section class="panel players-panel">
    <div class="players-heading">
      <h2>Players</h2>
      <button id="open-trade" class="button secondary trade-button" type="button">Trade</button>
    </div>
    <div class="player-list">
      ${state.players.map((player, index) => `
        <div class="player-row ${index === state.currentPlayer ? "active-player" : ""}">
          <i class="player-color" style="background:${player.color}" aria-hidden="true"></i>
          <div class="player-summary">
            <strong>${escapeHTML(player.name)}${index === state.currentPlayer ? " · Taking turn" : ""}</strong>
            <span>${player.inJail ? "In Jail" : escapeHTML(state.spaces[player.position].name)}${state.activation === "after-go" && !player.passedGo ? " · Speed Die locked" : ""}</span>
          </div>
          <button class="correct-position" data-player="${player.id}" type="button">Correct</button>
        </div>`).join("")}
    </div>
  </section>`;
}

function renderDice() {
  const { d1, d2, speed, speedActive } = state.roll;
  const speedFace = !speedActive ? "—" : speed === "Bus" ? "🚌" : speed === "Property Finder" ? "⌖" : speed;
  return `
    <section class="dice-grid" aria-label="Dice results">
      ${dieCard("White die 1", d1, d1)}
      ${dieCard("White die 2", d2, d2)}
      ${dieCard("Speed Die", speedFace, speedActive ? speed : "Not active", true)}
    </section>`;
}

function dieCard(label, face, result, speed = false) {
  return `<div class="die-card ${speed ? "speed" : ""}">
    <span class="die-face" aria-hidden="true">${escapeHTML(face)}</span>
    <span class="die-label">${escapeHTML(label)}</span>
    <span class="die-result">${escapeHTML(result)}</span>
  </div>`;
}

function renderActionArea(speedActive) {
  if (state.phase === "ready" && currentPlayer().inJail) {
    return `<section class="panel instruction jail-panel">
      <p class="eyebrow">In Jail · attempt ${currentPlayer().jailAttempts + 1} of 3</p>
      <h2>How do you want to get out?</h2>
      <p>Pay the bank using the physical game, or try to roll doubles.</p>
      <div class="button-stack">
        <button id="pay-jail" class="button primary gold" type="button">Pay $50 &amp; roll normally</button>
        <button id="try-jail-doubles" class="button secondary" type="button">Try to roll doubles</button>
      </div>
    </section>`;
  }
  if (state.phase === "ready") {
    return `<section class="panel instruction ${speedActive ? "" : "gold-instruction"}">
      <h2>${speedActive ? "Ready to roll?" : "Two dice for now"}</h2>
      <p>${speedActive ? "Roll both white dice and the Speed Die." : "The Speed Die unlocks for this player after passing GO."}</p>
      <button id="roll-button" class="button primary gold" type="button">Roll dice</button>
    </section>`;
  }
  if (state.phase === "bus") {
    const { d1, d2 } = state.roll;
    return `<section class="panel instruction gold-instruction">
      <h2>Bus roll: choose your move</h2>
      <p>Move one white die or both white dice.</p>
      <div class="button-row">
        <button class="button bus-choice" data-move="${d1}">Move ${d1}</button>
        <button class="button bus-choice" data-move="${d2}">Move ${d2}</button>
        <button class="button bus-choice" data-move="${d1 + d2}">Move ${d1 + d2}</button>
      </div>
    </section>`;
  }
  if (state.phase === "classic-first-stop") {
    return `<section class="panel instruction">
      <h2>First stop: ${escapeHTML(currentSpace().name)}</h2>
      <p>Resolve this space using your physical board. Then continue to the Property Finder move.</p>
      ${renderLandingResolution(false)}
      <button id="continue-finder" class="button primary" type="button">Continue Property Finder</button>
    </section>`;
  }
  return `
    <section class="panel instruction">
      <p class="eyebrow">Your move</p>
      <h2>${escapeHTML(state.message)}</h2>
      ${renderLandingResolution(true)}
      ${state.extraTurn ? `<p class="status-note doubles-note">You rolled doubles. Finish resolving this space, then roll again.</p>` : ""}
    </section>
    <button id="end-turn-button" class="button primary" type="button">${state.extraTurn ? "Roll again — doubles!" : "End turn"}</button>`;
}

function renderLandingResolution(includeOwnedMessage) {
  const space = currentSpace();
  if (!isProperty(space)) {
    return `<p class="status-note">${escapeHTML(spaceInstruction(space))}</p>`;
  }
  if (space.owner === null) {
    return `<div class="landing-card panel">
      <h3>${escapeHTML(space.name)} is unowned</h3>
      <div class="button-stack">
        <button class="button buy-current" type="button">Mark bought by ${escapeHTML(currentPlayer().name)}</button>
        <button class="button secondary choose-owner" data-space="${space.index}" type="button">Choose another owner</button>
        <button class="button quiet leave-unowned" type="button">Leave unowned</button>
      </div>
    </div>`;
  }
  const owner = state.players.find(person => person.id === space.owner);
  if (!owner) return "";
  if (space.mortgaged) {
    return `<p class="status-note">${escapeHTML(space.name)} is owned by ${escapeHTML(owner.name)}, but it is mortgaged. No rent is due.</p>`;
  }
  if (owner.id === currentPlayer().id) {
    return `<p class="status-note">${escapeHTML(space.name)} is owned by ${escapeHTML(owner.name)}.</p>`;
  }
  return includeOwnedMessage
    ? `<p class="status-note">Owned by ${escapeHTML(owner.name)}. Pay rent using your physical board/card.</p>`
    : `<p class="status-note">This property is owned by ${escapeHTML(owner.name)}. Resolve any rent before continuing.</p>`;
}

function renderBoard() {
  return `<details class="panel">
    <summary>Board &amp; properties</summary>
    <div class="details-body">
      <p class="muted small">Tap a name to edit it. Tap an ownership label to make a correction.</p>
      <div class="board-list">
        ${state.spaces.map(space => {
          const playersHere = state.players.filter(player => player.position === space.index);
          const owner = state.players.find(player => player.id === space.owner);
          return `<div class="space-row ${playersHere.length ? "current-space" : ""}">
            <span class="space-marker">
              ${space.group ? `<i class="group-color" style="background:${GROUP_COLORS[space.group]}"></i>` : ""}
              <b>${space.index}</b>
            </span>
            <div>
              <input class="space-name" data-space="${space.index}" value="${escapeHTML(space.name)}" aria-label="Name for space ${space.index}">
              <span class="space-kind">${escapeHTML(spaceGroupLabel(space) || space.type)}</span>
              ${space.mortgaged ? `<span class="mortgage-badge">Mortgaged</span>` : ""}
              ${playersHere.length ? `<div class="token-dots" title="${escapeHTML(playersHere.map(p => p.name).join(", "))}">${playersHere.map(p => `<i class="mini-token" style="background:${p.color}"></i>`).join("")}</div>` : ""}
            </div>
            ${isProperty(space) ? `<button class="owner-button choose-owner" data-space="${space.index}" type="button">${owner ? escapeHTML(owner.name) : "Unowned"}</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>
  </details>`;
}

function bindGameEvents() {
  document.querySelector("#roll-button")?.addEventListener("click", rollDice);
  document.querySelectorAll(".bus-choice").forEach(button =>
    button.addEventListener("click", () => completeMove(Number(button.dataset.move), `Move ${button.dataset.move} spaces.`))
  );
  document.querySelector("#continue-finder")?.addEventListener("click", continuePropertyFinder);
  document.querySelector("#end-turn-button")?.addEventListener("click", endTurn);
  document.querySelector("#pay-jail")?.addEventListener("click", payToLeaveJail);
  document.querySelector("#try-jail-doubles")?.addEventListener("click", tryJailDoubles);
  document.querySelector("#open-trade")?.addEventListener("click", openTradeDialog);
  document.querySelector(".buy-current")?.addEventListener("click", buyCurrent);
  document.querySelector(".leave-unowned")?.addEventListener("click", () => {
    state.message += " The property remains unowned.";
    saveState(); render();
  }, { once: true });
  document.querySelectorAll(".choose-owner").forEach(button =>
    button.addEventListener("click", () => openOwnerDialog(Number(button.dataset.space ?? currentSpace().index)))
  );
  document.querySelectorAll(".space-name").forEach(input =>
    input.addEventListener("change", () => renameSpace(Number(input.dataset.space), input.value))
  );
  document.querySelectorAll(".correct-position").forEach(button =>
    button.addEventListener("click", () => openPositionDialog(button.dataset.player))
  );
}

function randomDie() { return Math.floor(Math.random() * 6) + 1; }

function rollDice() {
  const player = currentPlayer();
  const speedActive = state.activation === "immediate" || player.passedGo;
  const d1 = randomDie();
  const d2 = randomDie();
  const speed = speedActive ? SPEED_FACES[Math.floor(Math.random() * SPEED_FACES.length)] : null;
  state.roll = { d1, d2, speed, speedActive };
  const doublesResult = registerDoubles(d1, d2);
  if (doublesResult === "third") {
    sendToJail("Three doubles in a row. Go directly to Jail.");
    recordRoll();
    saveState(); render();
    return;
  }

  if (!speedActive || typeof speed === "number") {
    const move = d1 + d2 + (typeof speed === "number" ? speed : 0);
    completeMove(move, `Move ${move} spaces. Resolve the space you land on.`);
    return;
  }
  if (speed === "Bus") {
    state.phase = "bus";
    state.message = "Choose a Bus move.";
    saveState(); render();
    return;
  }

  if (state.mode === "classic") {
    const whiteTotal = d1 + d2;
    movePlayer(whiteTotal);
    if (resolveGoToJail()) {
      recordRoll();
      saveState(); render();
      return;
    }
    state.pendingFinderTarget = findPropertyTarget();
    state.phase = "classic-first-stop";
    state.message = `Move ${whiteTotal} spaces and resolve this space first.`;
    saveState(); render();
  } else {
    moveToPropertyFinderTarget();
  }
}

function completeMove(amount, message) {
  movePlayer(amount);
  state.phase = "landed";
  state.message = message;
  resolveGoToJail();
  recordRoll();
  saveState(); render();
}

function movePlayer(amount) {
  const player = currentPlayer();
  const destination = player.position + amount;
  if (destination >= 40) player.passedGo = true;
  player.position = destination % 40;
}

function registerDoubles(d1, d2) {
  const player = currentPlayer();
  if (d1 !== d2) {
    player.consecutiveDoubles = 0;
    state.extraTurn = false;
    return "no";
  }
  player.consecutiveDoubles += 1;
  if (player.consecutiveDoubles >= 3) {
    state.extraTurn = false;
    player.consecutiveDoubles = 0;
    return "third";
  }
  state.extraTurn = true;
  return "yes";
}

function sendToJail(message = "Go directly to Jail. Do not remain on Go to Jail.") {
  const player = currentPlayer();
  player.position = 10;
  player.inJail = true;
  player.jailAttempts = 0;
  player.consecutiveDoubles = 0;
  state.extraTurn = false;
  state.pendingFinderTarget = null;
  state.phase = "landed";
  state.message = message;
}

function resolveGoToJail() {
  if (currentPlayer().position !== 30) return false;
  sendToJail("You landed on Go to Jail. Move directly to Jail.");
  return true;
}

function findPropertyTarget() {
  const player = currentPlayer();
  const properties = state.spaces.filter(isProperty);
  const unowned = properties.filter(space => space.owner === null);
  const candidates = unowned.length
    ? unowned
    : properties.filter(space =>
      space.owner !== null &&
      space.owner !== player.id &&
      !space.mortgaged
    );
  if (!candidates.length) return null;
  return candidates
    .map(space => ({ space, distance: (space.index - player.position + 40) % 40 || 40 }))
    .sort((a, b) => a.distance - b.distance)[0].space.index;
}

function moveToPropertyFinderTarget(target = findPropertyTarget()) {
  if (target === null) {
    const total = state.roll.d1 + state.roll.d2;
    completeMove(total, `No valid rent property was found. Move ${total} spaces using the white dice.`);
    return;
  }
  const player = currentPlayer();
  const distance = (target - player.position + 40) % 40 || 40;
  if (player.position + distance >= 40) player.passedGo = true;
  player.position = target;
  const targetSpace = state.spaces[target];
  state.phase = "landed";
  state.message = targetSpace.owner === null
    ? `Property Finder: move directly to ${targetSpace.name}, the next unowned property.`
    : `All properties are owned. Move to ${targetSpace.name}, the next property owned by another player.`;
  state.pendingFinderTarget = null;
  recordRoll();
  saveState(); render();
}

function payToLeaveJail() {
  const player = currentPlayer();
  player.inJail = false;
  player.jailAttempts = 0;
  player.consecutiveDoubles = 0;
  state.message = "Pay $50 to the bank, then roll normally.";
  rollDice();
}

function tryJailDoubles() {
  const player = currentPlayer();
  const d1 = randomDie();
  const d2 = randomDie();
  state.roll = { d1, d2, speed: null, speedActive: false, jailAttempt: true };
  state.extraTurn = false;
  player.consecutiveDoubles = 0;

  if (d1 === d2) {
    player.inJail = false;
    player.jailAttempts = 0;
    movePlayer(d1 + d2);
    state.phase = "landed";
    state.message = `You rolled doubles and left Jail. Move ${d1 + d2} spaces.`;
    resolveGoToJail();
  } else {
    player.jailAttempts += 1;
    if (player.jailAttempts >= 3) {
      player.inJail = false;
      player.jailAttempts = 0;
      movePlayer(d1 + d2);
      state.phase = "landed";
      state.message = `No doubles on the third attempt. Pay $50, then move ${d1 + d2} spaces.`;
      resolveGoToJail();
    } else {
      state.phase = "landed";
      state.message = `No doubles. Stay in Jail. This was attempt ${player.jailAttempts} of 3.`;
    }
  }
  recordRoll();
  saveState();
  render();
}

function continuePropertyFinder() {
  moveToPropertyFinderTarget(state.pendingFinderTarget);
}

function recordRoll() {
  if (!state.roll) return;
  state.history.unshift({
    player: currentPlayer().name,
    d1: state.roll.d1,
    d2: state.roll.d2,
    speed: state.roll.speed,
    message: state.message,
    time: new Date().toISOString()
  });
  state.history = state.history.slice(0, 30);
}

function buyCurrent() {
  currentSpace().owner = currentPlayer().id;
  currentSpace().mortgaged = false;
  state.message += ` Marked as bought by ${currentPlayer().name}.`;
  saveState(); render();
}

function renameSpace(index, name) {
  const cleanName = name.trim();
  if (cleanName) state.spaces[index].name = cleanName.slice(0, 40);
  saveState(); render();
}

function spaceInstruction(space) {
  const instructions = {
    "Chance": "You landed on Chance. Draw a Chance card and follow it.",
    "Community Chest": "You landed on Community Chest. Draw a Community Chest card and follow it.",
    "Income Tax": "You landed on Income Tax. Resolve the tax using your physical board.",
    "Luxury Tax": "You landed on Luxury Tax. Resolve the tax using your physical board.",
    "Free Parking": "You landed on Free Parking. Apply your family’s Free Parking rule.",
    "GO": "You landed on GO. Apply your physical board’s GO payment rule.",
    "Jail / Just Visiting": currentPlayer().inJail
      ? "You are in Jail."
      : "You landed on Jail / Just Visiting. You are only visiting."
  };
  return instructions[space.name] || `You landed on ${space.name}. Resolve that space using your physical board.`;
}

function openTradeDialog() {
  const options = state.players
    .map(player => `<option value="${player.id}">${escapeHTML(player.name)}</option>`)
    .join("");
  const playerA = document.querySelector("#trade-player-a");
  const playerB = document.querySelector("#trade-player-b");
  playerA.innerHTML = options;
  playerB.innerHTML = options;
  playerA.value = state.players[0].id;
  playerB.value = state.players[1].id;
  updateTradeProperties();
  tradeDialog.showModal();
}

function selectedTradeProperties(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(input => Number(input.value));
}

function tradePropertyList(player, side) {
  const properties = state.spaces.filter(space => isProperty(space) && space.owner === player.id);
  if (!properties.length) return `<p class="trade-empty">${escapeHTML(player.name)} has no properties.</p>`;
  return properties.map(space => `
    <label class="trade-property">
      <input type="checkbox" value="${space.index}" data-side="${side}">
      <span>
        ${escapeHTML(space.name)} <small class="muted">· ${escapeHTML(spaceGroupLabel(space))}</small>
        ${space.mortgaged ? `<small class="mortgage-badge">Mortgaged</small>` : ""}
      </span>
    </label>`).join("");
}

function updateTradeProperties() {
  const playerAId = document.querySelector("#trade-player-a").value;
  const playerBId = document.querySelector("#trade-player-b").value;
  const playerA = state.players.find(player => player.id === playerAId);
  const playerB = state.players.find(player => player.id === playerBId);
  const validPair = playerA && playerB && playerA.id !== playerB.id;
  document.querySelector("#complete-trade").disabled = !validPair;
  if (!validPair) {
    document.querySelector("#trade-properties-a").innerHTML = "";
    document.querySelector("#trade-properties-b").innerHTML = "";
    document.querySelector("#trade-summary").textContent = "Choose two different players.";
    return;
  }
  document.querySelector("#trade-a-legend").textContent = `${playerA.name} gives`;
  document.querySelector("#trade-b-legend").textContent = `${playerB.name} gives`;
  document.querySelector("#trade-properties-a").innerHTML = tradePropertyList(playerA, "a");
  document.querySelector("#trade-properties-b").innerHTML = tradePropertyList(playerB, "b");
  document.querySelectorAll(".trade-property input").forEach(input =>
    input.addEventListener("change", updateTradeSummary)
  );
  updateTradeSummary();
}

function updateTradeSummary() {
  const playerA = state.players.find(player => player.id === document.querySelector("#trade-player-a").value);
  const playerB = state.players.find(player => player.id === document.querySelector("#trade-player-b").value);
  if (!playerA || !playerB || playerA.id === playerB.id) return;
  const fromA = selectedTradeProperties("trade-properties-a").map(index => state.spaces[index].name);
  const fromB = selectedTradeProperties("trade-properties-b").map(index => state.spaces[index].name);
  const summary = [];
  if (fromA.length) summary.push(`${playerA.name} gives ${fromA.join(", ")} to ${playerB.name}.`);
  if (fromB.length) summary.push(`${playerB.name} gives ${fromB.join(", ")} to ${playerA.name}.`);
  document.querySelector("#trade-summary").textContent =
    summary.join(" ") || "Select properties to preview the trade.";
  document.querySelector("#complete-trade").disabled = summary.length === 0;
}

document.querySelector("#trade-player-a").addEventListener("change", updateTradeProperties);
document.querySelector("#trade-player-b").addEventListener("change", updateTradeProperties);
document.querySelector("#cancel-trade").addEventListener("click", () => tradeDialog.close());
tradeForm.addEventListener("submit", event => {
  event.preventDefault();
  const playerAId = document.querySelector("#trade-player-a").value;
  const playerBId = document.querySelector("#trade-player-b").value;
  if (!playerAId || !playerBId || playerAId === playerBId) return;
  selectedTradeProperties("trade-properties-a").forEach(index => {
    state.spaces[index].owner = playerBId;
  });
  selectedTradeProperties("trade-properties-b").forEach(index => {
    state.spaces[index].owner = playerAId;
  });
  saveState();
  tradeDialog.close();
  render();
});

function openOwnerDialog(spaceIndex) {
  const space = state.spaces[spaceIndex];
  document.querySelector("#owner-dialog-property").textContent = space.name;
  const mortgageToggle = document.querySelector("#mortgage-toggle");
  mortgageToggle.classList.toggle("hidden", space.owner === null);
  mortgageToggle.textContent = space.mortgaged ? "Unmortgage property" : "Mark as mortgaged";
  mortgageToggle.onclick = () => {
    if (space.owner === null) return;
    space.mortgaged = !space.mortgaged;
    saveState();
    ownerDialog.close();
    render();
  };
  document.querySelector("#owner-options").innerHTML = `
    <button class="button quiet owner-option" data-owner="" type="button">Leave unowned</button>
    ${state.players.map(player => `<button class="button secondary owner-option" data-owner="${player.id}" type="button">${escapeHTML(player.name)}</button>`).join("")}`;
  ownerDialogCallback = ownerId => {
    space.owner = ownerId || null;
    if (!space.owner) space.mortgaged = false;
    saveState(); render();
  };
  document.querySelectorAll(".owner-option").forEach(button => button.addEventListener("click", () => {
    ownerDialogCallback(button.dataset.owner);
    ownerDialog.close();
  }));
  ownerDialog.showModal();
}

function openPositionDialog(playerId) {
  const player = state.players.find(person => person.id === playerId);
  if (!player) return;
  correctingPlayerId = playerId;
  document.querySelector("#position-dialog-player").textContent = `Move ${player.name} to the correct space.`;
  document.querySelector("#position-space").innerHTML = state.spaces
    .map(space => `<option value="${space.index}" ${space.index === player.position ? "selected" : ""}>${space.index} · ${escapeHTML(space.name)}</option>`)
    .join("");
  positionDialog.showModal();
}

positionForm.addEventListener("submit", event => {
  event.preventDefault();
  const player = state.players.find(person => person.id === correctingPlayerId);
  if (!player) return;
  player.position = Number(document.querySelector("#position-space").value);
  if (player.inJail && player.position !== 10) {
    player.inJail = false;
    player.jailAttempts = 0;
  }
  saveState();
  positionDialog.close();
  render();
});

document.querySelector("#cancel-position").addEventListener("click", () => {
  correctingPlayerId = null;
  positionDialog.close();
});

function endTurn() {
  if (!state.extraTurn) {
    currentPlayer().consecutiveDoubles = 0;
    state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  }
  state.roll = null;
  state.phase = "ready";
  state.message = "";
  state.pendingFinderTarget = null;
  state.extraTurn = false;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

menuButton.addEventListener("click", () => menuDialog.showModal());

document.querySelector("#export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `faithsparks-speed-die-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#import-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidState(imported)) throw new Error("This is not a valid Speed Die game file.");
    state = migrateState(imported);
    saveState();
    menuDialog.close();
    render();
  } catch (error) {
    alert(error.message || "That file could not be imported.");
  }
  event.target.value = "";
});

document.querySelector("#reset-button").addEventListener("click", () => {
  if (!confirm("Reset this game and erase its saved progress?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = freshState();
  menuDialog.close();
  render();
});

render();
