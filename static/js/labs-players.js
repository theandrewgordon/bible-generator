const rosterKey = 'faithsparks.labs.players.v1';
const guest = {id: 'player-guest', name: 'Guest', legacy: {}};
const mathKey = 'mathFactRally.v2';
const geoKey = 'faithsparks.geo.v2';
const latinKey = 'faithsparks.latinQuest.players.v1';
const changed = 'labs-players-changed';
const nameKey = name => name.trim().toLowerCase();
let memory = null;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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

export function mountPlayers(root, {game, limit = 1, preferred = [], onChange = () => {}}) {
  const group = node('fieldset');
  group.append(node('legend', limit === 1 ? 'Who’s playing?' : 'Who’s playing this round?'));
  const choices = node('div', '', {class: 'labs-player-choices'});
  const note = node('p', '', {role: 'status', class: 'labs-player-note'});
  const manage = node('details');
  manage.append(node('summary', 'Manage players'));
  const form = node('form');
  const label = node('label', 'Player name');
  const input = node('input', '', {maxlength: '30', required: '', autocomplete: 'off'});
  label.append(input);
  const add = node('button', 'Add player', {type: 'submit'});
  const rename = node('select', '', {'aria-label': 'Player to rename'});
  const renameButton = node('button', 'Rename player', {type: 'button'});
  form.append(label, add, rename, renameButton);
  manage.append(form, node('p', 'Players are available in all FaithSparks Labs games in this browser.'));
  group.append(choices, manage, note);
  root.classList.add('labs-players');
  root.replaceChildren(group);
  let selection = selectedPlayers(game, limit, preferred).map(player => player.id);

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
      option.append(control, node('span', player.name));
      choices.append(option);
      control.addEventListener('change', () => {
        if (limit === 1) selection = [player.id];
        else if (control.checked && selection.length < limit) selection.push(player.id);
        else if (!control.checked && selection.length > 1) selection = selection.filter(id => id !== player.id);
        else {
          control.checked = !control.checked;
          note.textContent = control.checked ? 'Choose at least one player.' : 'Choose up to ' + limit + ' players.';
          return;
        }
        note.textContent = '';
        update();
        choices.querySelectorAll('input')[roster.indexOf(player)]?.focus();
      });
    }
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
      note.textContent = name ? 'That name is already in use. Try a nickname.' : 'Enter a player name first.';
      return;
    }
    if (id) {
      const player = roster.find(player => player.id === id);
      if (!player) return;
      player.name = name;
    } else {
      const player = createPlayer(name);
      roster.push(player);
      const selected = selection.filter(id => id !== guest.id);
      if (limit === 1) selection = [player.id];
      else if (selected.length < limit) selection = [...selected, player.id];
    }
    write(rosterKey + '.' + game, selection);
    input.value = '';
    note.textContent = id ? 'Player renamed.' : 'Player added.';
    saveRoster(roster);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    edit();
  });
  renameButton.addEventListener('click', () => edit(rename.value));
  const refresh = event => {
    if (event.type === changed || event.key === rosterKey) render();
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
