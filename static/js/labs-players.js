import {labsStorage, labsStorageKey} from './labs-storage.js';

const rosterKey = 'faithsparks.labs.players.v1';
const guest = {id: 'player-guest', name: 'Guest', legacy: {}};
const mathKey = 'mathFactRally.v2';
const geoKey = 'faithsparks.geo.v2';
const latinKey = 'faithsparks.latinQuest.players.v1';
const changed = 'labs-players-changed';
const avatarKey = 'faithsparks.labs.avatars.v1';
const nameKey = name => name.trim().toLowerCase();
let memory = null;

function read(key, fallback) {
  try {
    return JSON.parse(labsStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    labsStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current tab can still play when browser storage is unavailable.
  }
}

function named(name) {
  return typeof name === 'string' && name.trim() && !/^player \d+$/i.test(name.trim());
}

function createPlayer(name) {
  return {
    id: 'player-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)),
    name: name.trim().slice(0, 30),
    legacy: {},
  };
}

function mergeLegacy(roster, game, id, name) {
  if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return;
  const linked = roster.find(player => player.legacy[game] === id);
  if (linked) return linked;
  let player = roster.find(player => player.legacy[game] === undefined && nameKey(player.name) === nameKey(name));
  if (!player) {
    player = createPlayer(name);
    roster.push(player);
  }
  player.legacy[game] = id;
  return player;
}

function loadRoster() {
  const saved = read(rosterKey, memory);
  if (Array.isArray(saved)) return saved;
  const roster = [];
  const math = read(mathKey, {});
  for (const name of new Set([
    ...(math.settings?.players || []).map(player => player.name),
    ...(math.session?.players || []).map(player => player.name),
    ...Object.keys(math.progress || {}),
  ])) {
    if (named(name) || (typeof name === 'string' && Object.keys(math.progress?.[nameKey(name)] || {}).length)) {
      mergeLegacy(roster, 'math', nameKey(name), name);
    }
  }
  const geo = read(geoKey, {});
  for (const [id, name] of Object.entries(geo.learnerNames || {})) {
    if (named(name) || Object.keys(geo.progress?.[id] || {}).length || (geo.session && (geo.learner === id || geo.teamLearners?.includes(id) || geo.roundPlayers?.includes(id)))) mergeLegacy(roster, 'geo', id, name);
  }
  for (const {id, name} of read(latinKey, {}).players || []) {
    const used = ['progress.v1', 'flash-reviewed.v1', 'session.v1', 'settings.v1', 'week.v2-independent']
      .some(suffix => Object.keys(read('faithsparks.latinQuest.player.' + id + '.' + suffix, {})).length);
    if (named(name) || used) mergeLegacy(roster, 'latin', id, name);
  }
  memory = roster;
  write(rosterKey, roster);
  return roster;
}

export function importMathPlayers(configs) {
  const roster = loadRoster();
  const mapped = configs.flatMap(config => {
    if (typeof config?.name !== 'string' || !config.name.trim()) return [];
    if (config.id === guest.id) return [{config, profile: guest}];
    let profile;
    if (!config.id) profile = mergeLegacy(roster, 'math', nameKey(config.name), config.name);
    else {
      profile = roster.find(player => player.id === config.id || nameKey(player.name) === nameKey(config.name));
      if (!profile) {
        profile = createPlayer(config.name);
        roster.push(profile);
      }
    }
    return [{config, profile}];
  });
  saveRoster(roster);
  return mapped;
}

function saveRoster(roster) {
  memory = roster;
  write(rosterKey, roster);
  window.dispatchEvent(new Event(changed));
}

export function profiles() {
  const roster = loadRoster();
  return roster.length ? roster : [guest];
}

export function gamePlayerId(player, game) {
  return player.legacy[game] ?? player.id;
}

export function selectedPlayers(game, limit, preferred = []) {
  const roster = profiles();
  const ids = read(rosterKey + '.' + game, preferred);
  const selected = Array.isArray(ids) ? ids.flatMap(id => roster.find(player => player.id === id) || []) : [];
  return (selected.length ? [...new Set(selected)] : roster.slice(0, 1)).slice(0, limit);
}

function node(tag, label, attributes = {}) {
  const element = document.createElement(tag);
  if (label) element.textContent = label;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

// Use the same saved profile ID and sprite coordinates in the picker and during play.
export function playerAvatarPortrait(player, avatarBank, className = 'math-turn-avatar', fallbackIndex = 0) {
  if (!player || !avatarBank?.choices?.length) return null;
  const savedId = read(avatarKey, {})[player.id];
  const chosen = avatarBank.choices.findIndex(icon => icon.id === savedId);
  const index = chosen >= 0 ? chosen : fallbackIndex % avatarBank.choices.length;
  const icon = avatarBank.choices[index];
  const cols = Math.max(1, icon.columns || avatarBank.columns || 4);
  const rows = Math.max(1, icon.rows || avatarBank.rows || Math.ceil(avatarBank.choices.length / cols));
  const cell = Number.isInteger(icon.cellIndex) ? icon.cellIndex : index;
  const x = cell % cols, y = Math.floor(cell / cols);
  const inset = Math.max(0, Math.min(0.2, Number(icon.cropInset) || 0));
  const zoom = 1 / (1 - 2 * inset);
  const percent = (n, count) => count === 1 ? 50 : (((n + .5) * zoom - .5) / (count * zoom - 1)) * 100;
  const portrait = node('i', '', {class: className, 'aria-hidden': 'true'});
  portrait.style.backgroundImage = `url("${icon.src || avatarBank.src}")`;
  portrait.style.backgroundSize = `${cols * zoom * 100}% ${rows * zoom * 100}%`;
  portrait.style.backgroundPosition = `${percent(x, cols)}% ${percent(y, rows)}%`;
  return portrait;
}

export function mountPlayers(root, {game, limit = 1, preferred = [], roleName = 'player', legend, avatarBank = null, onChange = () => {}, onAvatarSaved = () => {}}) {
  const group = node('fieldset');
  const roleLabel = roleName[0].toUpperCase() + roleName.slice(1);
  group.append(node('legend', legend ?? (limit === 1 ? 'Who’s playing?' : 'Who’s playing this round?')));
  const choices = node('div', '', {class: 'labs-player-choices'});
  const note = node('p', '', {role: 'status', class: 'labs-player-note'});
  const manage = node('details');
  manage.append(node('summary', `Manage ${roleName}s`));
  const form = node('form');
  const label = node('label', `${roleLabel} name`);
  const input = node('input', '', {maxlength: '30', required: '', autocomplete: 'off'});
  label.append(input);
  const add = node('button', `Add ${roleName}`, {type: 'submit'});
  const rename = node('select', '', {'aria-label': `${roleLabel} to rename`});
  const renameButton = node('button', `Rename ${roleName}`, {type: 'button'});
  form.append(label, add, rename, renameButton);
  const avatarEnabled = Boolean(avatarBank?.src && Array.isArray(avatarBank.choices) && avatarBank.choices.length);
  const avatarEditor = avatarEnabled ? node('div', '', {class: 'labs-avatar-editor'}) : null;
  const avatarTarget = avatarEnabled ? node('select', '', {'aria-label': 'Choose explorer to customize'}) : null;
  const avatarGrid = avatarEnabled ? node('div', '', {class: 'labs-avatar-grid', role: 'group', 'aria-label': 'Watercolor explorer icon bank'}) : null;
  const saveAvatarButton = avatarEnabled ? node('button', 'Save Avatar', {type:'button', class:'labs-avatar-save'}) : null;
  if (avatarEnabled) {
    const avatarLabel = node('label', 'Choose an icon for');
    avatarLabel.append(avatarTarget);
    avatarEditor.append(node('h3', 'Your Explorer Icon'), node('p', 'Pick a watercolor adventure companion, then select Save Avatar.'), avatarLabel, avatarGrid, saveAvatarButton);
  }
  manage.append(form);
  if (avatarEditor) manage.append(avatarEditor);
  manage.append(node('p', `${roleLabel}s are available in all FaithSparks Labs games in this browser.`));
  group.append(choices, manage);
  if (avatarEnabled) group.append(node('p', 'Want a different adventure companion? Open Manage players to choose your icon.', {class: 'labs-avatar-hint'}));
  group.append(note);
  root.classList.add('labs-players');
  root.replaceChildren(group);
  let selection = selectedPlayers(game, limit, preferred).map(player => player.id);
  let avatarFocusId = null;
  const pendingAvatarChoice = new Map();

  function avatarAt(player, index) {
    if (!avatarEnabled) return -1;
    const chosen = read(avatarKey, {})[player.id];
    const savedIndex = avatarBank.choices.findIndex(icon => icon.id === chosen);
    return savedIndex >= 0 ? savedIndex : index % avatarBank.choices.length;
  }

  function avatarPicture(index, className) {
    const image = node('i', '', {class: className, 'aria-hidden': 'true'});
    const icon = avatarBank.choices[index];
    const cols = Math.max(1, icon.columns || avatarBank.columns || 4);
    const rows = Math.max(1, icon.rows || avatarBank.rows || Math.ceil(avatarBank.choices.length / cols));
    const cellIndex = Number.isInteger(icon.cellIndex) ? icon.cellIndex : index;
    const x = cellIndex % cols;
    const y = Math.floor(cellIndex / cols);
    image.style.backgroundImage = `url("${icon.src || avatarBank.src}")`;
    // A small cropInset removes framing baked into some newer portrait sheets.
    // Keep the crop centered on the *original cell*, even for a reordered grid.
    const inset = Math.max(0, Math.min(0.2, Number(icon.cropInset) || 0));
    const zoom = 1 / (1 - 2 * inset);
    image.style.backgroundSize = `${cols * zoom * 100}% ${rows * zoom * 100}%`;
    const percent = (cell, count) => count === 1 ? 50 : (((cell + .5) * zoom - .5) / (count * zoom - 1)) * 100;
    image.style.backgroundPosition = `${percent(x, cols)}% ${percent(y, rows)}%`;
    return image;
  }

  function renderAvatarBank(roster) {
    if (!avatarEnabled) return;
    const previousTarget = avatarTarget.value;
    avatarTarget.replaceChildren(...roster.map(player => node('option', player.name, {value: player.id})));
    const target = roster.find(player => player.id === avatarFocusId)?.id || roster.find(player => player.id === previousTarget)?.id || selection.find(id => roster.some(p => p.id === id)) || roster[0]?.id;
    avatarFocusId = null;
    if (!target) return;
    avatarTarget.value = target;
    avatarGrid.replaceChildren();
    const current = avatarBank.choices.findIndex(icon => icon.id === pendingAvatarChoice.get(target));
    const active = current >= 0 ? current : avatarAt(roster.find(p => p.id === target), roster.findIndex(p => p.id === target));
    avatarBank.choices.forEach((icon, index) => {
      const button = node('button', '', {type: 'button', class: 'labs-avatar-option', 'aria-label': `Use ${icon.label} icon`, 'aria-pressed': String(index === active)});
      button.append(avatarPicture(index, 'labs-avatar-preview'), node('span', icon.label));
      button.addEventListener('click', () => {
        pendingAvatarChoice.set(target, icon.id);
        note.textContent = `${icon.label} selected. Choose Save Avatar to keep it.`;
        renderAvatarBank(profiles());
      });
      avatarGrid.append(button);
    });
  }
  avatarTarget?.addEventListener('change', () => renderAvatarBank(profiles()));
  saveAvatarButton?.addEventListener('click', () => {
    const roster = profiles();
    const targetId = avatarTarget.value;
    const player = roster.find(person => person.id === targetId);
    if (!player) return;
    const index = avatarBank.choices.findIndex(icon => icon.id === pendingAvatarChoice.get(targetId));
    const chosenIndex = index >= 0 ? index : avatarAt(player, roster.indexOf(player));
    const icon = avatarBank.choices[chosenIndex];
    if (!icon) return;
    const avatarPrefs = read(avatarKey, {});
    avatarPrefs[targetId] = icon.id;
    write(avatarKey, avatarPrefs);
    pendingAvatarChoice.delete(targetId);
    note.textContent = `${player.name} now uses the ${icon.label} icon.`;
    manage.open = false;
    render(false);
    onAvatarSaved(player, icon);
  });

  function render(notify = true) {
    const roster = profiles();
    selection = selection.filter(id => roster.some(player => player.id === id));
    if (!selection.length) selection = [roster[0].id];
    const editing = rename.value;
    rename.replaceChildren();
    for (const player of roster.filter(player => player !== guest)) {
      rename.append(node('option', player.name, {value: player.id}));
    }
    if ([...rename.options].some(option => option.value === editing)) rename.value = editing;
    rename.hidden = renameButton.hidden = !rename.options.length;
    choices.replaceChildren();
    for (const player of roster) {
      const control = node('input', '', {type: limit === 1 ? 'radio' : 'checkbox', name: 'labs-' + game + '-player', value: player.id});
      control.checked = selection.includes(player.id);
      const option = node('label');
      if (avatarEnabled) option.append(avatarPicture(avatarAt(player, roster.indexOf(player)), 'labs-player-portrait'));
      option.append(control, node('span', player.name));
      choices.append(option);
      control.addEventListener('change', () => {
        if (limit === 1) selection = [player.id];
        else if (control.checked && selection.length < limit) selection.push(player.id);
        else if (!control.checked && selection.length > 1) selection = selection.filter(id => id !== player.id);
        else {
          control.checked = !control.checked;
          note.textContent = control.checked ? `Choose at least one ${roleName}.` : `Choose up to ${limit} ${roleName}s.`;
          return;
        }
        note.textContent = '';
        update();
        choices.querySelectorAll('input')[roster.indexOf(player)]?.focus();
      });
    }
    renderAvatarBank(roster);
    if (notify) onChange(selection.map(id => roster.find(player => player.id === id)), roster);
  }

  function update() {
    write(rosterKey + '.' + game, selection);
    render();
  }

  function edit(id) {
    const name = input.value.trim();
    const roster = loadRoster();
    if (!name || roster.some(player => player.id !== id && nameKey(player.name) === nameKey(name))) {
      note.textContent = name ? 'That name is already in use. Try a nickname.' : `Enter a ${roleName} name first.`;
      return;
    }
    if (id) {
      const player = roster.find(player => player.id === id);
      if (!player) return;
      player.name = name;
    } else {
      const player = createPlayer(name);
      roster.push(player);
      if (avatarEnabled) avatarFocusId = player.id;
      const selected = selection.filter(id => id !== guest.id);
      if (limit === 1) selection = [player.id];
      else if (selected.length < limit) selection = [...selected, player.id];
    }
    write(rosterKey + '.' + game, selection);
    input.value = '';
    note.textContent = id ? `${roleLabel} renamed.` : `${roleLabel} added.`;
    saveRoster(roster);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    edit();
  });
  renameButton.addEventListener('click', () => edit(rename.value));
  const refresh = event => {
    if (event.type === changed || event.key === labsStorageKey(rosterKey)) render();
  };
  const restore = event => {
    if (event.persisted) render();
  };
  window.addEventListener('pageshow', restore);
  window.addEventListener(changed, refresh);
  window.addEventListener('storage', refresh);
  render(false);
  return () => {
    window.removeEventListener('pageshow', restore);
    window.removeEventListener(changed, refresh);
    window.removeEventListener('storage', refresh);
  };
}
