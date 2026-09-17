"use strict";

// Everything is stored in this browser only. No account or server is involved.
const STORAGE_KEY = "faithsparks-speed-die-v1";
const PLAYER_COLORS = ["#397bb5", "#d69b29", "#4f9169", "#b95e78", "#785daa", "#cf6d3b", "#267d80", "#855d42"];
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
const positionDialog = document.querySelector("#position-dialog");
const positionForm = document.querySelector("#position-form");
const tradeDialog = document.querySelector("#trade-dialog");
const tradeForm = document.querySelector("#trade-form");
let correctingPlayerId = null;
let positionCorrectionReason = "manual";
let recoveryRaw = null;
let state = loadState();
let lastSavedState = snapshotState(state);
let undoStack = Array.isArray(state.undoStack) ? state.undoStack.slice(0, 10) : state.undo ? [state.undo] : [];
let undoState = undoStack[0] || null;
let lastSavedUndoStack = undoStack.slice();
let storedSnapshot = localStorage.getItem(STORAGE_KEY);
let saveWriterReady = false;
delete state.undo; delete state.undoStack;

function freshState() {
  return SpeedDieRules.upgrade({
    version: 5,
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
    firstStopResolved: false,
    landingResolved: true,
    freeParkingRule: "official",
    extraTurn: false,
    history: []
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  recoveryRaw = null;
  if (raw === null) return freshState();
  try {
    const saved = JSON.parse(raw);
    if (!isValidState(saved)) throw new Error("Invalid saved game format.");
    return migrateState(saved);
  } catch (error) {
    recoveryRaw = raw;
    console.warn("Saved game needs recovery.", error);
    return freshState();
  }
}
function renderRecovery() {
  app.innerHTML = `<section class="panel"><h2>Recover your saved game</h2>
    <p>The saved game could not be read. Its original data has been kept. Download it before importing a backup or resetting.</p>
    <div class="button-stack">
      <button id="recovery-export" class="button secondary" type="button">Download damaged save</button>
      <button id="recovery-import" class="button secondary" type="button">Import a game backup</button>
      <button id="recovery-reset" class="button danger" type="button">Reset damaged save</button>
    </div></section>`;
  document.querySelector("#recovery-export").onclick = () => document.querySelector("#export-button").click();
  document.querySelector("#recovery-import").onclick = () => document.querySelector("#import-input").click();
  document.querySelector("#recovery-reset").onclick = () => document.querySelector("#reset-button").click();
}

function isValidState(value) {
  return Boolean(
    value && [1, 2, 3, 4, 5, 6].includes(value.version) && Array.isArray(value.players) &&
    Array.isArray(value.spaces) && value.spaces.length === 40
  );
}

function migrateState(saved) {
  const previousVersion = saved.version;
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
  saved.firstStopResolved = Boolean(saved.firstStopResolved);
  const savedPlayer = saved.players[saved.currentPlayer];
  const savedSpace = savedPlayer ? saved.spaces[savedPlayer.position] : null;
  saved.landingResolved = previousVersion >= 5
    ? saved.landingResolved !== false
    : !(saved.phase === "landed" && savedSpace && isProperty(savedSpace) && savedSpace.owner === null);
  saved.freeParkingRule = ["official", "500", "100", "50", "pot"].includes(saved.freeParkingRule)
    ? saved.freeParkingRule
    : "official";
  if (previousVersion < 6) saved.moneyMode = "helper";
  SpeedDieRules.upgrade(saved);
  SpeedDieRules.validate(saved);
  return saved;
}

function snapshotState(value) {
  const copy = structuredClone(value);
  delete copy.undo; delete copy.undoStack;
  return copy;
}
function adoptStoredGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = loadState();
  undoStack = Array.isArray(state.undoStack) ? state.undoStack.slice(0, 10) : state.undo ? [state.undo] : [];
  undoState = undoStack[0] || null;
  delete state.undo; delete state.undoStack;
  lastSavedState = snapshotState(state); storedSnapshot = raw; lastSavedUndoStack = undoStack.slice();
}
function saveState(skipUndo = false) {
  if (!saveWriterReady || localStorage.getItem(STORAGE_KEY) !== storedSnapshot) {
    adoptStoredGame();
    alert("This game changed in another tab. The latest save has been loaded; please repeat your action.");
    return false;
  }
  SpeedDieRules.captureLanding(state);
  const next = snapshotState(state), previousStack = lastSavedUndoStack.slice();
  if (!skipUndo && JSON.stringify(next) !== JSON.stringify(lastSavedState)) undoStack = [lastSavedState, ...undoStack].slice(0, 10);
  try {
    const raw = JSON.stringify({ ...next, undoStack });
    localStorage.setItem(STORAGE_KEY, raw);
    storedSnapshot = raw; lastSavedState = next; undoState = undoStack[0] || null;
    lastSavedUndoStack = undoStack.slice(); recoveryRaw = null;
    return true;
  } catch (error) {
    state = structuredClone(lastSavedState); undoStack = previousStack; undoState = undoStack[0] || null;
    alert("Could not save this change. It was rolled back. Export your game or free browser storage, then try again.");
    return false;
  }
}
function renderSaveAccess() {
  app.inert = !saveWriterReady; menuButton.disabled = !saveWriterReady;
  const status = document.querySelector("#save-status");
  status.hidden = saveWriterReady;
  status.textContent = navigator.locks ? "Read-only: another tab may be editing this game. Close that tab to continue here. Changes appear automatically." : "This browser cannot protect shared saves. Open this game in a current browser over HTTPS or localhost.";
}
function initializeSaveAccess() {
  if (!navigator.locks) return;
  navigator.locks.request(STORAGE_KEY + "-writer", async () => {
    adoptStoredGame(); saveWriterReady = true; render();
    await new Promise(resolve => {
      window.addEventListener("pagehide", () => { saveWriterReady = false; resolve(); }, { once: true });
    });
  }).catch(error => { console.error("Game lock failed", error); saveWriterReady = false; renderSaveAccess(); });
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY || saveWriterReady) return;
    try { adoptStoredGame(); render(); } catch (error) { console.warn("Could not reload shared save", error); }
  });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
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
function isCardSpace(space) { return ["Chance", "Community Chest"].includes(space.name); }
function isTriplesRoll(d1, d2, speed) {
  return typeof speed === "number" && d1 === d2 && d2 === speed;
}
function canPayBeforeJailRoll(jailAttempts) { return jailAttempts < 2; }
function doublesOutcome(consecutiveDoubles, d1, d2) {
  if (d1 !== d2) return { result: "no", count: 0 };
  const count = consecutiveDoubles + 1;
  return count >= 3
    ? { result: "third", count: 0 }
    : { result: "yes", count };
}
function propertyTargetFor(spaces, player) {
  const properties = spaces.filter(isProperty);
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
function needsLandingResolution() {
  return state.phase === "landed" &&
    isProperty(currentSpace()) &&
    currentSpace().owner === null &&
    !state.landingResolved;
}
function setLandingResolutionState() {
  state.landingResolved = !(isProperty(currentSpace()) && currentSpace().owner === null);
}
function destinationIndex(position, amount, boardSize = 40) {
  return (position + amount) % boardSize;
}
function destinationForMove(amount) {
  return state.spaces[destinationIndex(currentPlayer().position, amount, state.spaces.length)];
}
function spaceGroupLabel(space) {
  return space.group ? `${space.group} ${space.groupOrder}` : "";
}
function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function render() {
  menuButton.classList.toggle("hidden", !state.started);
  if (recoveryRaw !== null) renderRecovery();
  else if (!state.started) renderSetup();
  else renderGame();
  renderSaveAccess();
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
                ${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${n} players</option>`).join("")}
              </select>
            </label>
            <div id="player-inputs" class="player-inputs"></div>
          </div>
          <div>
            <label class="field"><span>Money handling</span><select name="money-mode"><option value="helper">Helper · use physical money</option><option value="banker">Banker · track money in the app</option></select></label>
            <label class="field"><span>Starting cash per player</span><input name="starting-cash" type="number" min="0" max="100000000" step="1" value="2500" required></label>
            <p class="muted small">US board values are included. Adjust your edition’s prices and payments in Game options.</p>
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
                <strong>After each player lands on or passes GO</strong>
                <small>Each player unlocks it after completing their first trip around.</small>
              </label>
            </div>
            <div class="setup-note">
              <strong>Speed Die cash reminder</strong>
              <span>Official Speed Die play adds $1,000 to each player’s normal starting cash.</span>
            </div>
            <label class="field">
              <span>Free Parking rule</span>
              <select name="free-parking">
                <option value="official">Official: nothing happens</option>
                <option value="500">House rule: collect $500</option>
                <option value="100">House rule: collect $100</option>
                <option value="50">House rule: collect $50</option>
                <option value="pot">House rule: collect the center pot</option>
              </select>
            </label>
          </div>
        </div>
        <button class="button primary" type="submit">Start game</button>
      </form>
    </section>`;

  const count = document.querySelector("#player-count");
  const names = document.querySelector("#player-inputs");
  function drawNameInputs() {
    const old = [...names.querySelectorAll(".setup-name")].map(input => input.value);
    const tokens = [...names.querySelectorAll(".setup-token")].map(input => input.value);
    const photos = [...names.querySelectorAll(".setup-image")].map(input => input.files);
    names.innerHTML = Array.from({ length: Number(count.value) }, (_, index) => `
      <label class="field">
        <span>Player ${index + 1}</span>
        <input class="setup-name" type="text" maxlength="24" required value="${escapeHTML(old[index] || "")}" placeholder="Enter a name">
      </label><label class="field"><span>Player ${index + 1} token</span><select class="setup-token">${TOKEN_CHOICES.map((t, i) => `<option ${t === (tokens[index] || TOKEN_CHOICES[index]) ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <details class="setup-photo"><summary>Use your own token picture</summary><label class="field"><span>Player ${index + 1} picture</span><input class="setup-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label></details>`).join("");
    names.querySelectorAll(".setup-image").forEach((input, i) => { if (photos[i]?.length) input.files = photos[i]; });
  }
  count.addEventListener("change", drawNameInputs);
  drawNameInputs();
  document.querySelector("#setup-form").addEventListener("submit", startGame);
}

async function startGame(event) {
  event.preventDefault();
  const nameInputs = [...document.querySelectorAll("#player-inputs .setup-name")];
  const names = nameInputs.map(input => input.value.trim());
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    alert("Please give each player a different name.");
    return;
  }
  const setupForm = event.currentTarget;
  const startButton = setupForm.querySelector('button[type="submit"]');
  const formData = new FormData(setupForm);
  const startingCash = Number(formData.get("starting-cash"));
  if (!SpeedDieRules.isMoney(startingCash)) { alert("Enter a valid starting cash amount."); return; }
  startButton.disabled = true;
  let tokens;
  try {
    tokens = await Promise.all([...document.querySelectorAll(".setup-image")].map(async (input, i) => await imageToken(input.files[0]) || document.querySelectorAll(".setup-token")[i].value));
  } catch (error) { alert(error.message); startButton.disabled = false; return; }
  state = freshState();
  state.started = true;
  state.moneyMode = formData.get("money-mode");
  state.rules.startingCash = Number(formData.get("starting-cash"));
  state.mode = formData.get("mode");
  state.activation = formData.get("activation");
  state.freeParkingRule = formData.get("free-parking");
  state.players = names.map((name, index) => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}`,
    name,
    cash: state.rules.startingCash, bankrupt: false, token: tokens[index],
    position: 0,
    passedGo: state.activation === "immediate",
    color: PLAYER_COLORS[index],
    inJail: false,
    jailAttempts: 0,
    consecutiveDoubles: 0
  }));
  undoState = null; undoStack = [];
  saveState(true);
  render();
}

function renderGame() {
  const player = currentPlayer();
  const space = currentSpace();
  const speedActive = state.activation === "immediate" || player.passedGo;
  app.innerHTML = `
    <section class="panel turn-heading">
      <span class="player-token" style="background:${player.color}">${tokenMarkup(player)}</span>
      <div>
        <p class="eyebrow">Current player</p>
        <h2>${escapeHTML(player.name)}</h2>
        <p class="location">At ${escapeHTML(space.name)} · ${state.mode === "streets" ? "Streets-style" : "Classic"} mode</p>
      </div>
    </section>

    ${state.roll ? renderDice() : ""}
    ${renderPendingActions() || renderActionArea(speedActive)}
    ${renderPlayers()}
    ${renderCompanion()}
    ${renderBoard()}
  `;
  bindGameEvents();
  bindCompanionEvents();
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
          <span class="small-token" style="border-color:${player.color}" aria-hidden="true">${tokenMarkup(player)}</span>
          <div class="player-summary">
            <strong>${escapeHTML(player.name)}${player.bankrupt ? " · Out" : state.winnerId === player.id ? " · Winner" : index === state.currentPlayer ? " · Taking turn" : ""}</strong>
            <span>${player.bankrupt ? "Bankrupt" : player.inJail ? "In Jail" : escapeHTML(state.spaces[player.position].name)}${state.moneyMode === "banker" ? ` · $${player.cash.toLocaleString()}` : ""}${state.activation === "after-go" && !player.passedGo ? " · Speed Die locked" : ""}</span>
          </div>
          <button class="edit-player" data-player="${player.id}" type="button">Token / details</button>
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
    const thirdAttempt = !canPayBeforeJailRoll(currentPlayer().jailAttempts);
    const jailFee = state.moneyMode === "banker" ? state.rules.jail : 50;
    return `<section class="panel instruction jail-panel">
      <p class="eyebrow">In Jail · attempt ${currentPlayer().jailAttempts + 1} of 3</p>
      <h2>${thirdAttempt ? "Final doubles attempt" : "How do you want to get out?"}</h2>
      <p>${thirdAttempt
        ? `Use a physical Get Out of Jail Free card, or roll for doubles. If you miss, pay $${jailFee} and move using that roll.`
        : "Pay the bank, use a physical Get Out of Jail Free card, or try to roll doubles."}</p>
      <div class="button-stack">
        ${thirdAttempt ? "" : `<button id="pay-jail" class="button primary gold" type="button">Pay $${jailFee} &amp; roll normally</button>`}
        <button id="use-jail-card" class="button secondary" type="button">Use Get Out of Jail Free card</button>
        <button id="try-jail-doubles" class="button secondary" type="button">Try to roll doubles</button>
      </div>
    </section>`;
  }
  if (state.phase === "ready") {
    return `<section class="panel instruction ${speedActive ? "" : "gold-instruction"}">
      <h2>${speedActive ? "Ready to roll?" : "Two dice for now"}</h2>
      <p>${speedActive ? "Roll both white dice and the Speed Die." : "The Speed Die unlocks for this player after landing on or passing GO."}</p>
      <button id="roll-button" class="button primary gold" type="button">Roll dice</button>
    </section>`;
  }
  if (state.phase === "bus") {
    const { d1, d2 } = state.roll;
    const busMoves = [...new Set([d1, d2, d1 + d2])];
    return `<section class="panel instruction gold-instruction">
      <h2>Bus roll: choose your move</h2>
      <p>Move one white die or both white dice.</p>
      <div class="button-row">
        ${busMoves.map(move => {
          const destination = destinationForMove(move);
          return `<button class="button bus-choice" data-move="${move}">Move ${move} → ${escapeHTML(destination.name)}</button>`;
        }).join("")}
      </div>
    </section>`;
  }
  if (state.phase === "triples") {
    return `<section class="panel instruction gold-instruction">
      <p class="eyebrow">Three of a kind</p>
      <h2>Choose any space on the board</h2>
      <p>Triples let you move anywhere. You do not roll again afterward.</p>
      <label class="field">
        <span>Destination</span>
        <select id="triples-space">
          ${state.spaces.map(space => `<option value="${space.index}">${space.index} · ${escapeHTML(space.name)}</option>`).join("")}
        </select>
      </label>
      <button id="move-triples" class="button primary gold" type="button">Move to selected space</button>
    </section>`;
  }
  if (state.phase === "classic-first-stop") {
    const needsAuction = isProperty(currentSpace()) &&
      currentSpace().owner === null &&
      !state.firstStopResolved;
    return `<section class="panel instruction">
      <h2>First stop: ${escapeHTML(currentSpace().name)}</h2>
      <p>Resolve this space using your physical board. Then continue to the Property Finder move.</p>
      ${renderLandingResolution(false)}
      ${isCardSpace(currentSpace()) ? `<button id="card-moved-token" class="button secondary" type="button">The card moved my token</button>` : ""}
      ${needsAuction ? `<p class="resolution-warning">Buy this property, record the auction winner, or explicitly use the leave-unowned house rule before continuing.</p>` : ""}
      <button id="continue-finder" class="button primary" type="button" ${needsAuction ? "disabled" : ""}>Continue Property Finder</button>
    </section>`;
  }
  const unresolvedProperty = needsLandingResolution();
  return `
    <section class="panel instruction">
      <p class="eyebrow">Your move</p>
      <h2>${escapeHTML(state.message)}</h2>
      ${renderLandingResolution(true)}
      ${isCardSpace(currentSpace()) ? `<button id="card-moved-token" class="button secondary" type="button">The card moved my token</button>` : ""}
      ${state.extraTurn ? `<p class="status-note doubles-note">You rolled doubles. Finish resolving this space, then roll again.</p>` : ""}
      ${unresolvedProperty ? `<p class="resolution-warning">Resolve this property before continuing: buy it, record the auction winner, or explicitly use the leave-unowned house rule.</p>` : ""}
    </section>
    <button id="end-turn-button" class="button primary" type="button" ${unresolvedProperty ? "disabled" : ""}>${state.extraTurn ? "Roll again — doubles!" : "End turn"}</button>`;
}

function renderLandingResolution(includeOwnedMessage) {
  if (state.moneyMode === "banker") return renderBankLanding();
  const space = currentSpace();
  if (!isProperty(space)) {
    return `<p class="status-note">${escapeHTML(spaceInstruction(space))}</p>`;
  }
  if (space.owner === null) {
    return `<div class="landing-card panel">
      <h3>${escapeHTML(space.name)} is unowned</h3>
      <div class="button-stack">
        <button class="button buy-current" type="button">Mark bought by ${escapeHTML(currentPlayer().name)}</button>
        <button class="button secondary choose-owner" data-space="${space.index}" data-owner-action="auction" type="button">Record auction winner</button>
        <button class="button quiet leave-unowned" type="button">House rule: leave unowned</button>
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
  const utilityRoll = space.type === "utility" && state.roll
    ? state.roll.d1 + state.roll.d2 + (typeof state.roll.speed === "number" ? state.roll.speed : 0)
    : null;
  const utilityNote = utilityRoll === null
    ? ""
    : ` Utility dice total: ${utilityRoll}; Bus and Property Finder count as zero.`;
  return includeOwnedMessage
    ? `<p class="status-note">Owned by ${escapeHTML(owner.name)}. Pay $${SpeedDieRules.rent(state, space, utilityRoll || 0)} using physical money.${utilityNote}</p>`
    : `<p class="status-note">This property is owned by ${escapeHTML(owner.name)}. Resolve any rent before continuing.${utilityNote}</p>`;
}

function renderBoard() {
  return `<details class="panel">
    <summary>Board &amp; properties</summary>
    <div class="details-body">
      <p class="muted small">Tap a name to edit it. Tap an ownership label to make a correction.</p>
      <div class="board-list">
        ${state.spaces.map(space => {
          const playersHere = state.players.filter(player => !player.bankrupt && player.position === space.index);
          const owner = state.players.find(player => player.id === space.owner);
          return `<div class="space-row ${playersHere.length ? "current-space" : ""}">
            <span class="space-marker">
              ${space.group ? `<i class="group-color" style="background:${GROUP_COLORS[space.group]}"></i>` : ""}
              <b>${space.index}</b>
            </span>
            <div>
              <input class="space-name" data-space="${space.index}" value="${escapeHTML(space.name)}" aria-label="Name for space ${space.index}">
              <span class="space-kind">${escapeHTML(spaceGroupLabel(space) || space.type)}</span>
              ${space.mortgaged ? `<span class="mortgage-badge">Mortgaged</span>` : ""}${space.buildings ? `<span class="mortgage-badge">${buildingLabel(space)}</span>` : ""}
              ${playersHere.length ? `<div class="token-dots" title="${escapeHTML(playersHere.map(p => p.name).join(", "))}">${playersHere.map(p => `<span class="tiny-token" style="border-color:${p.color}">${tokenMarkup(p)}</span>`).join("")}</div>` : ""}
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
    button.addEventListener("click", () => {
      const move = Number(button.dataset.move);
      completeMove(move, `Move ${move} spaces to ${destinationForMove(move).name}.`);
    })
  );
  document.querySelector("#continue-finder")?.addEventListener("click", continuePropertyFinder);
  document.querySelector("#move-triples")?.addEventListener("click", moveAfterTriples);
  document.querySelector("#card-moved-token")?.addEventListener("click", () =>
    openPositionDialog(
      currentPlayer().id,
      state.phase === "classic-first-stop" ? "card-classic" : "card-normal"
    )
  );
  document.querySelector("#end-turn-button")?.addEventListener("click", endTurn);
  document.querySelector("#pay-jail")?.addEventListener("click", payToLeaveJail);
  document.querySelector("#use-jail-card")?.addEventListener("click", useJailCard);
  document.querySelector("#try-jail-doubles")?.addEventListener("click", tryJailDoubles);
  document.querySelector("#open-trade")?.addEventListener("click", openTradeDialog);
  document.querySelector(".buy-current")?.addEventListener("click", buyCurrent);
  document.querySelector(".leave-unowned")?.addEventListener("click", () => {
    state.message += " House rule used: the property remains unowned.";
    if (state.phase === "classic-first-stop") state.firstStopResolved = true;
    state.landingResolved = true;
    saveState(); render();
  }, { once: true });
  document.querySelectorAll(".choose-owner").forEach(button =>
    button.addEventListener("click", () => openOwnerDialog(
      Number(button.dataset.space ?? currentSpace().index),
      button.dataset.ownerAction || "settings"
    ))
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
  if (gameBlocked()) return;
  state.bankLandingResolved = false; state.landingBill = null;
  const player = currentPlayer();
  const speedActive = state.activation === "immediate" || player.passedGo;
  const d1 = randomDie();
  const d2 = randomDie();
  const speed = speedActive ? SPEED_FACES[Math.floor(Math.random() * SPEED_FACES.length)] : null;
  state.roll = { d1, d2, speed, speedActive };
  if (isTriplesRoll(d1, d2, speed)) {
    player.consecutiveDoubles = 0;
    state.extraTurn = false;
    state.phase = "triples";
    state.message = "Triples: choose any board space.";
    saveState(); render();
    return;
  }
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
    state.firstStopResolved = false;
    state.phase = "classic-first-stop";
    state.message = `Move ${whiteTotal} spaces and resolve this space first.`;
    saveState(); render();
  } else {
    moveToPropertyFinderTarget();
  }
}

function completeMove(amount, message) {
  state.bankLandingResolved = false; state.landingBill = null;
  movePlayer(amount);
  state.phase = "landed";
  state.message = message;
  resolveGoToJail();
  setLandingResolutionState();
  recordRoll();
  saveState(); render();
}

function movePlayer(amount) {
  const player = currentPlayer();
  const destination = player.position + amount;
  if (destination >= 40) { player.passedGo = true; creditGo(player, Math.floor(destination / 40)); }
  player.position = destination % 40;
}

function moveAfterTriples() {
  const target = Number(document.querySelector("#triples-space").value);
  if (!Number.isInteger(target) || target < 0 || target >= state.spaces.length) return;
  const player = currentPlayer();
  if (target !== 30 && (target === 0 || target < player.position)) { player.passedGo = true; creditGo(player); }
  state.bankLandingResolved = false; state.landingBill = null;
  player.position = target;
  state.phase = "landed";
  state.extraTurn = false;
  state.message = `Triples: move directly to ${state.spaces[target].name}.`;
  resolveGoToJail();
  setLandingResolutionState();
  recordRoll();
  saveState();
  render();
}

function registerDoubles(d1, d2) {
  const player = currentPlayer();
  const outcome = doublesOutcome(player.consecutiveDoubles, d1, d2);
  player.consecutiveDoubles = outcome.count;
  state.extraTurn = outcome.result === "yes";
  return outcome.result;
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
  state.landingResolved = true;
  state.message = message;
}

function resolveGoToJail() {
  if (currentPlayer().position !== 30) return false;
  sendToJail("You landed on Go to Jail. Move directly to Jail.");
  return true;
}

function findPropertyTarget() {
  return propertyTargetFor(state.spaces, currentPlayer());
}

function moveToPropertyFinderTarget(target = findPropertyTarget()) {
  if (target === null) {
    const total = state.roll.d1 + state.roll.d2;
    completeMove(total, `No valid rent property was found. Move ${total} spaces using the white dice.`);
    return;
  }
  const player = currentPlayer();
  const distance = (target - player.position + 40) % 40 || 40;
  if (player.position + distance >= 40) { player.passedGo = true; creditGo(player); }
  state.bankLandingResolved = false; state.landingBill = null;
  player.position = target;
  const targetSpace = state.spaces[target];
  state.phase = "landed";
  state.message = targetSpace.owner === null
    ? `Property Finder: move directly to ${targetSpace.name}, the next unowned property.`
    : `All properties are owned. Move to ${targetSpace.name}, the next property owned by another player.`;
  state.pendingFinderTarget = null;
  setLandingResolutionState();
  recordRoll();
  saveState(); render();
}

function payToLeaveJail() {
  if (gameBlocked()) return;
  if (state.moneyMode === "banker") {
    return commitGame(s => SpeedDieRules.owe(s, currentPlayer().id, s.freeParkingRule === "pot" ? "pot" : "bank", s.rules.jail, "Leave Jail", { kind: "jail-roll" }));
  }
  const player = currentPlayer();
  player.inJail = false;
  player.jailAttempts = 0;
  player.consecutiveDoubles = 0;
  state.message = "Pay $50 to the bank, then roll normally.";
  rollDice();
}

function useJailCard() {
  const player = currentPlayer();
  player.inJail = false;
  player.jailAttempts = 0;
  player.consecutiveDoubles = 0;
  state.message = "Return your physical Get Out of Jail Free card, then roll normally.";
  rollDice();
}

function tryJailDoubles() {
  if (gameBlocked()) return;
  state.bankLandingResolved = false; state.landingBill = null;
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
    setLandingResolutionState();
  } else {
    player.jailAttempts += 1;
    if (player.jailAttempts >= 3) {
      if (state.moneyMode === "banker") {
        SpeedDieRules.owe(state, player.id, state.freeParkingRule === "pot" ? "pot" : "bank", state.rules.jail, "Third Jail attempt", { kind: "jail-move", amount: d1 + d2 });
        recordRoll(); saveState(); render(); return;
      }
      player.inJail = false;
      player.jailAttempts = 0;
      movePlayer(d1 + d2);
      state.phase = "landed";
      state.message = `No doubles on the third attempt. Pay $50, then move ${d1 + d2} spaces.`;
      resolveGoToJail();
      setLandingResolutionState();
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
  if (gameBlocked() || bankLandingPending()) return;
  if (isProperty(currentSpace()) && currentSpace().owner === null && !state.firstStopResolved) return;
  const target = findPropertyTarget();
  if (target === null) {
    state.phase = "landed";
    state.pendingFinderTarget = null;
    state.firstStopResolved = false;
    state.message = `Property Finder found no eligible property. Stay on ${currentSpace().name}; the white-dice move was already completed.`;
    recordRoll();
    saveState();
    render();
    return;
  }
  state.firstStopResolved = false;
  moveToPropertyFinderTarget(target);
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
  return commitGame(s => SpeedDieRules.buy(s, currentSpace().index, currentPlayer().id));
}

function renameSpace(index, name) {
  const cleanName = name.trim();
  if (cleanName) state.spaces[index].name = cleanName.slice(0, 40);
  saveState(); render();
}

function spaceInstruction(space) {
  const freeParkingInstructions = {
    official: "You landed on Free Parking. Official rule: nothing happens.",
    "500": "You landed on Free Parking. House rule: collect $500 from the bank.",
    "100": "You landed on Free Parking. House rule: collect $100 from the bank.",
    "50": "You landed on Free Parking. House rule: collect $50 from the bank.",
    pot: "You landed on Free Parking. House rule: collect the center pot."
  };
  const instructions = {
    "Chance": "You landed on Chance. Draw a Chance card and follow it.",
    "Community Chest": "You landed on Community Chest. Draw a Community Chest card and follow it.",
    "Income Tax": "You landed on Income Tax. Resolve the tax using your physical board.",
    "Luxury Tax": "You landed on Luxury Tax. Resolve the tax using your physical board.",
    "Free Parking": freeParkingInstructions[state.freeParkingRule] || freeParkingInstructions.official,
    "GO": "You landed on GO. Apply your physical board’s GO payment rule.",
    "Jail / Just Visiting": currentPlayer().inJail
      ? "You are in Jail."
      : "You landed on Jail / Just Visiting. You are only visiting."
  };
  return instructions[space.name] || `You landed on ${space.name}. Resolve that space using your physical board.`;
}

function openTradeDialog() {
  const options = SpeedDieRules.active(state)
    .map(player => `<option value="${player.id}">${escapeHTML(player.name)}</option>`)
    .join("");
  const playerA = document.querySelector("#trade-player-a");
  const playerB = document.querySelector("#trade-player-b");
  playerA.innerHTML = options;
  playerB.innerHTML = options;
  playerA.value = SpeedDieRules.active(state)[0].id;
  playerB.value = SpeedDieRules.active(state)[1].id;
  document.querySelector("#trade-cash-a").value = 0;
  document.querySelector("#trade-cash-b").value = 0;
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
      <input type="checkbox" value="${space.index}" data-side="${side}" ${SpeedDieRules.group(state, space).some(p => p.buildings) ? "disabled" : ""}>
      <span>
        ${escapeHTML(space.name)} ${SpeedDieRules.group(state, space).some(p => p.buildings) ? "(sell group buildings first)" : ""}<small class="muted">· ${escapeHTML(spaceGroupLabel(space))}</small>
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
  const fromAIndexes = selectedTradeProperties("trade-properties-a");
  const fromBIndexes = selectedTradeProperties("trade-properties-b");
  const fromA = fromAIndexes.map(index => state.spaces[index].name);
  const fromB = fromBIndexes.map(index => state.spaces[index].name);
  const summary = [];
  if (fromA.length) summary.push(`${playerA.name} gives ${fromA.join(", ")} to ${playerB.name}.`);
  if (fromB.length) summary.push(`${playerB.name} gives ${fromB.join(", ")} to ${playerA.name}.`);
  const mortgaged = [...fromAIndexes, ...fromBIndexes]
    .map(index => state.spaces[index])
    .filter(space => space.mortgaged);
  const warning = mortgaged.length
    ? `<p class="resolution-warning"><strong>Mortgage reminder:</strong> ${escapeHTML(mortgaged.map(space => space.name).join(", "))} ${mortgaged.length === 1 ? "is" : "are"} mortgaged. The new owner must immediately handle the bank’s 10% interest and any unmortgage payment using the physical game.</p>`
    : "";
  document.querySelector("#trade-summary").innerHTML =
    `<p>${escapeHTML(summary.join(" ") || "Select properties to preview the trade.")}</p>${warning}`;
  document.querySelector("#complete-trade").disabled = summary.length === 0 && !Number(document.querySelector("#trade-cash-a").value) && !Number(document.querySelector("#trade-cash-b").value);
}

document.querySelector("#trade-player-a").addEventListener("change", updateTradeProperties);
document.querySelector("#trade-player-b").addEventListener("change", updateTradeProperties);
document.querySelector("#cancel-trade").addEventListener("click", () => tradeDialog.close());
tradeForm.addEventListener("submit", event => {
  event.preventDefault();
  const playerAId = document.querySelector("#trade-player-a").value;
  const playerBId = document.querySelector("#trade-player-b").value;
  if (!playerAId || !playerBId || playerAId === playerBId) return;
  const ok = commitGame(s => SpeedDieRules.trade(s, playerAId, playerBId,
    selectedTradeProperties("trade-properties-a"), selectedTradeProperties("trade-properties-b"),
    Number(document.querySelector("#trade-cash-a").value), Number(document.querySelector("#trade-cash-b").value),
    document.querySelector("#trade-lift").checked ? [...selectedTradeProperties("trade-properties-a"), ...selectedTradeProperties("trade-properties-b")] : []));
  if (ok) tradeDialog.close();
});

function openOwnerDialog(spaceIndex, action = "settings") {
  if (action === "auction") openAuction(spaceIndex);
  else openProperty(spaceIndex);
}

function openPositionDialog(playerId, reason = "manual") {
  const player = state.players.find(person => person.id === playerId);
  if (!player || player.bankrupt || gameBlocked()) return;
  correctingPlayerId = playerId;
  positionCorrectionReason = reason;
  document.querySelector("#position-dialog-player").textContent = `Move ${player.name} to the correct space.`;
  document.querySelector("#position-space").innerHTML = state.spaces
    .map(space => `<option value="${space.index}" ${space.index === player.position ? "selected" : ""}>${space.index} · ${escapeHTML(space.name)}</option>`)
    .join("");
  document.querySelector("#position-in-jail").checked = player.inJail;
  document.querySelector("#position-collect-go").checked = false;
  positionDialog.showModal();
}

positionForm.addEventListener("submit", event => {
  event.preventDefault();
  const player = state.players.find(person => person.id === correctingPlayerId);
  if (!player) return;
  const previousPosition = player.position;
  const collectGo = document.querySelector("#position-collect-go").checked;
  const markInJail = document.querySelector("#position-in-jail").checked;
  const target = markInJail ? 10 : Number(document.querySelector("#position-space").value);
  const changed = target !== previousPosition || player.inJail !== markInJail;
  const cardMove = positionCorrectionReason !== "manual";
  if (!changed && !cardMove && !collectGo) { positionDialog.close(); return; }
  if (player.id === currentPlayer().id && (changed || cardMove)) { state.bankLandingResolved = false; state.landingBill = null; }
  player.position = target;
  if (collectGo && !markInJail && player.position !== 30) { player.passedGo = true; creditGo(player); }
  if (markInJail && (changed || cardMove)) {
    player.position = 10;
    player.inJail = true;
    player.jailAttempts = 0;
    player.consecutiveDoubles = 0;
    if (player.id === currentPlayer().id) state.extraTurn = false;
  } else if (!markInJail && player.inJail) {
    player.inJail = false;
    player.jailAttempts = 0;
  }
  if (positionCorrectionReason === "card-classic" || positionCorrectionReason === "card-normal") {
    if (player.position === 0) player.passedGo = true;
    state.firstStopResolved = false;
    if (markInJail || player.position === 30) {
      sendToJail("A card sent you directly to Jail.");
      recordRoll();
    } else if (positionCorrectionReason === "card-classic") {
      state.phase = "classic-first-stop";
      state.message = `Card movement recorded from ${state.spaces[previousPosition].name} to ${state.spaces[player.position].name}. Resolve this space, then continue Property Finder.`;
    } else {
      state.phase = "landed";
      state.message = `Card movement recorded from ${state.spaces[previousPosition].name} to ${state.spaces[player.position].name}. Resolve the new space.`;
      setLandingResolutionState();
    }
  }
  saveState();
  positionDialog.close();
  positionCorrectionReason = "manual";
  render();
});

document.querySelector("#cancel-position").addEventListener("click", () => {
  correctingPlayerId = null;
  positionCorrectionReason = "manual";
  positionDialog.close();
});

function endTurn() {
  if (needsLandingResolution() || gameBlocked() || bankLandingPending()) return;
  if (!state.extraTurn) {
    currentPlayer().consecutiveDoubles = 0;
    SpeedDieRules.advance(state);
  }
  state.roll = null;
  state.phase = "ready";
  state.message = "";
  state.pendingFinderTarget = null;
  state.firstStopResolved = false;
  state.landingResolved = true;
  state.extraTurn = false;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

menuButton.addEventListener("click", () => menuDialog.showModal());

document.querySelector("#export-button").addEventListener("click", () => {
  const blob = new Blob([recoveryRaw !== null ? recoveryRaw : JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${recoveryRaw !== null ? "damaged-save" : "faithsparks-speed-die"}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#import-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2000000) { alert("Game file is too large (maximum 2 MB)."); event.target.value = ""; return; }
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidState(imported)) throw new Error("This is not a valid Speed Die game file.");
    const next = migrateState(imported);
    delete next.undo; delete next.undoStack;
    state = next;
    undoState = null; undoStack = [];
    saveState(true);
    menuDialog.close();
    render();
  } catch (error) {
    alert(error.message || "That file could not be imported.");
  }
  event.target.value = "";
});

document.querySelector("#reset-button").addEventListener("click", () => {
  if (!confirm("Reset this game and erase its saved progress?")) return;
  state = freshState();
  undoState = null; undoStack = [];
  saveState(true);
  menuDialog.close();
  render();
});

// Open the app with ?selftest=1 to run deterministic checks for rare rule branches.
function runRuleSelfChecks() {
  const checks = [];
  const check = (description, condition) => checks.push({ description, passed: Boolean(condition) });
  check("numeric triples are recognized", isTriplesRoll(3, 3, 3));
  check("Bus is not treated as triples", !isTriplesRoll(3, 3, "Bus"));
  check("third consecutive doubles sends player to Jail", doublesOutcome(2, 4, 4).result === "third");
  check("a non-double clears the doubles chain", doublesOutcome(2, 4, 5).count === 0);
  check("voluntary jail payment is unavailable on attempt three", !canPayBeforeJailRoll(2));
  check("Bus destination wraps around GO", destinationIndex(38, 5) === 3);

  const testPlayer = { id: "current", position: 0 };
  const targetSpaces = structuredClone(DEFAULT_SPACES);
  targetSpaces.forEach(space => { if (isProperty(space)) space.owner = "current"; });
  targetSpaces[5].owner = "opponent";
  targetSpaces[5].mortgaged = true;
  targetSpaces[15].owner = "opponent";
  check("Property Finder skips mortgaged rent property", propertyTargetFor(targetSpaces, testPlayer) === 15);
  targetSpaces[15].mortgaged = true;
  check("Property Finder returns no target when every opponent property is mortgaged", propertyTargetFor(targetSpaces, testPlayer) === null);

  const failed = checks.filter(result => !result.passed);
  if (failed.length) throw new Error(`Rule self-checks failed: ${failed.map(result => result.description).join(", ")}`);
  console.info(`Speed Die rule self-checks passed (${checks.length}).`);
}

initializeCompanion();
initializeSaveAccess();

if (new URLSearchParams(window.location.search).has("selftest")) runRuleSelfChecks();
render();
