(function(global){
'use strict';

const STORAGE_KEY = 'tessas_odyssey_platform_v1';
const VERSION = 1;
const MAX_PLAYERS = 8;
const MAX_NAME = 20;

function now(){ return Date.now(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function safeParse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
function cleanPlayerName(name){
  return String(name || '').replace(/\s+/g,' ').trim().slice(0, MAX_NAME);
}
function defaultState(){
  return {version:VERSION, activePlayerId:'', players:[], settings:{sound:true,music:true}};
}
function load(){
  try {
    const parsed = safeParse(localStorage.getItem(STORAGE_KEY), null);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    parsed.version = VERSION;
    parsed.players = Array.isArray(parsed.players) ? parsed.players : [];
    parsed.settings = Object.assign({sound:true,music:true}, parsed.settings || {});
    return parsed;
  } catch (_) { return defaultState(); }
}
let state = load();
function save(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} }
function playerByName(name){
  const key = cleanPlayerName(name).toLocaleLowerCase();
  return state.players.find(p => String(p.name || '').toLocaleLowerCase() === key) || null;
}
function playerById(id){ return state.players.find(p => p.id === id) || null; }
function newPlayer(name){
  const clean = cleanPlayerName(name);
  if (!clean) return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  const p = {
    id:'p_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,7),
    name:clean, createdAt:now(), lastPlayedAt:0,
    totals:{xp:0,gamesPlayed:0,completions:0}, games:{}
  };
  state.players.push(p); save(); return p;
}
function ensurePlayer(name){ return playerByName(name) || newPlayer(name); }
function getPlayers(){ return state.players.map(clone); }
function selectPlayer(name, gameId){
  const p = ensurePlayer(name); if (!p) return null;
  state.activePlayerId = p.id; p.lastPlayedAt = now();
  if (gameId) ensureGame(p, gameId).hidden = false;
  save(); return clone(p);
}
function ensureGame(player, gameId){
  if (!player.games) player.games = {};
  if (!player.games[gameId]) {
    player.games[gameId] = {
      sessions:0, completions:0, currentScore:0, bestScore:0,
      highestLevel:1, bestStars:0, lastPlayedAt:0, lastResult:null, hidden:false, meta:{}
    };
  }
  return player.games[gameId];
}
function startSession(gameId, name){
  const p = name ? ensurePlayer(name) : playerById(state.activePlayerId);
  if (!p) return null;
  state.activePlayerId = p.id;
  const g = ensureGame(p, gameId);
  g.sessions = (g.sessions || 0) + 1;
  g.lastPlayedAt = p.lastPlayedAt = now();
  p.totals.gamesPlayed = (p.totals.gamesPlayed || 0) + 1;
  save(); return clone(g);
}
function syncProgress(gameId, progress, name){
  const p = name ? ensurePlayer(name) : playerById(state.activePlayerId);
  if (!p) return null;
  state.activePlayerId = p.id;
  const g = ensureGame(p, gameId);
  const data = progress || {};
  if (Number.isFinite(+data.score)) {
    g.currentScore = Math.max(0, +data.score || 0);
    g.bestScore = Math.max(g.bestScore || 0, g.currentScore);
  }
  if (Number.isFinite(+data.level)) g.highestLevel = Math.max(g.highestLevel || 1, +data.level || 1);
  if (Number.isFinite(+data.stars)) g.bestStars = Math.max(g.bestStars || 0, +data.stars || 0);
  if (Number.isFinite(+data.accuracy)) g.bestAccuracy = Math.max(g.bestAccuracy || 0, Math.max(0, Math.min(1, +data.accuracy)));
  if (data.meta && typeof data.meta === 'object') g.meta = Object.assign({}, g.meta || {}, data.meta);
  g.lastPlayedAt = p.lastPlayedAt = now();
  save(); return clone(g);
}
function recordResult(gameId, result, name){
  const p = name ? ensurePlayer(name) : playerById(state.activePlayerId);
  if (!p) return null;
  state.activePlayerId = p.id;
  const g = ensureGame(p, gameId);
  const r = Object.assign({completed:false}, result || {});
  syncProgress(gameId, r, p.name);
  if (r.completed) {
    g.completions = (g.completions || 0) + 1;
    p.totals.completions = (p.totals.completions || 0) + 1;
    const scoreXp = Number.isFinite(+r.score) ? Math.min(40, Math.floor(Math.max(0,+r.score)/500)*5) : 0;
    const starsXp = Number.isFinite(+r.stars) ? Math.min(30, Math.max(0,+r.stars)*5) : 0;
    p.totals.xp = (p.totals.xp || 0) + 25 + scoreXp + starsXp;
  }
  g.lastResult = Object.assign({}, r, {at:now()});
  save(); return clone(g);
}
function adoptLegacyProfiles(gameId, profiles, mapper){
  if (!Array.isArray(profiles)) return;
  profiles.forEach(item => {
    const name = cleanPlayerName(typeof item === 'string' ? item : item && item.name);
    if (!name) return;
    const p = ensurePlayer(name); if (!p) return;
    const mapped = mapper ? mapper(item) : {};
    if (mapped) syncProgress(gameId, mapped, name);
  });
}
function mergeGlobalNames(localProfiles, makeDefault, gameId){
  const list = Array.isArray(localProfiles) ? localProfiles.slice() : [];
  const names = new Set(list.map(x => cleanPlayerName(typeof x === 'string' ? x : x && x.name).toLocaleLowerCase()).filter(Boolean));
  for (const p of state.players) {
    if (gameId && p.games && p.games[gameId] && p.games[gameId].hidden) continue;
    const key = p.name.toLocaleLowerCase();
    if (!names.has(key) && list.length < MAX_PLAYERS) {
      list.push(makeDefault ? makeDefault(p.name) : p.name);
      names.add(key);
    }
  }
  return list;
}
function hidePlayerForGame(name, gameId){
  const p = playerByName(name); if (!p || !gameId) return;
  const g = ensureGame(p, gameId); g.hidden = true; save();
}

function showSaved(message){
  let el = document.getElementById('odysseySaveToast');
  if (!el) {
    el = document.createElement('div'); el.id = 'odysseySaveToast'; el.className = 'odyssey-save-toast'; document.body.appendChild(el);
  }
  el.textContent = message || 'Saved'; el.classList.add('show');
  clearTimeout(showSaved._t); showSaved._t = setTimeout(()=>el.classList.remove('show'), 900);
}
function openNameDialog(opts){
  opts = opts || {};
  const existing = document.getElementById('odysseyNameDialog'); if (existing) existing.remove();
  const overlay = document.createElement('div'); overlay.id='odysseyNameDialog'; overlay.className='odyssey-modal';
  const card = document.createElement('div'); card.className='odyssey-modal-card';
  const title = document.createElement('h2'); title.textContent = opts.title || 'New Player';
  const help = document.createElement('p'); help.textContent = opts.help || 'Type your name. Your device will remember your progress.';
  const input = document.createElement('input'); input.className='odyssey-name-input'; input.type='text'; input.inputMode='text'; input.enterKeyHint='done'; input.autocomplete='name'; input.autocapitalize='words'; input.maxLength=MAX_NAME; input.value=cleanPlayerName(opts.value || ''); input.placeholder='Player name';
  const error = document.createElement('div'); error.className='odyssey-error';
  const actions = document.createElement('div'); actions.className='odyssey-modal-actions';
  const cancel = document.createElement('button'); cancel.type='button'; cancel.className='odyssey-button secondary'; cancel.textContent='Cancel';
  const saveBtn = document.createElement('button'); saveBtn.type='button'; saveBtn.className='odyssey-button'; saveBtn.textContent=opts.saveLabel || 'Save';
  function close(){ overlay.remove(); if (opts.onCancel) opts.onCancel(); }
  function submit(){
    const name = cleanPlayerName(input.value);
    if (!name) { error.textContent='Type a name first.'; input.focus(); return; }
    const msg = opts.validate ? opts.validate(name) : '';
    if (msg) { error.textContent=msg; input.focus(); return; }
    overlay.remove(); if (opts.onSave) opts.onSave(name);
  }
  cancel.onclick=close; saveBtn.onclick=submit; input.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();submit();} if(e.key==='Escape'){e.preventDefault();close();} });
  actions.append(cancel,saveBtn); card.append(title,help,input,error,actions); overlay.append(card); document.body.appendChild(overlay);
  setTimeout(()=>{ input.focus(); input.select(); }, 0);
  return overlay;
}
function getGameStats(name, gameId){ const p=playerByName(name); return p && p.games && p.games[gameId] ? clone(p.games[gameId]) : null; }

const api = {
  VERSION, STORAGE_KEY, MAX_PLAYERS, MAX_NAME,
  cleanPlayerName, getPlayers, ensurePlayer, selectPlayer, startSession,
  syncProgress, recordResult, adoptLegacyProfiles, mergeGlobalNames, hidePlayerForGame,
  showSaved, openNameDialog, getGameStats,
  getActivePlayer(){ const p=playerById(state.activePlayerId); return p ? clone(p) : null; },
  settings(){ return clone(state.settings); },
  setSetting(key,value){ state.settings[key]=!!value; save(); }
};

global.Odyssey = api;
})(window);
