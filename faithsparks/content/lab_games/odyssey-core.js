(function(global){
'use strict';

const STORAGE_KEY = 'tessas_odyssey_platform_v1';
const VERSION = 2;
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
function resolvePlayer(ref){
  if (!ref) return playerById(state.activePlayerId);
  return playerById(ref) ||
    state.players.find(p => Array.isArray(p.aliases) && p.aliases.includes(ref)) ||
    playerByName(ref);
}
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
function setPlayers(list){
  if (!Array.isArray(list)) return getPlayers();
  const next=[];
  for (const raw of list.slice(0,MAX_PLAYERS)) {
    const name=cleanPlayerName(raw && raw.name);
    if (!name) continue;
    const existing=playerById(raw.id) || playerByName(name);
    const p=existing || {
      id:(raw && raw.id) || ('p_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,7)),
      name, createdAt:(raw && raw.createdAt) || now(), lastPlayedAt:0,
      totals:{xp:0,gamesPlayed:0,completions:0}, games:{}
    };
    p.name=name;
    if (raw && raw.id && raw.id !== p.id) {
      p.aliases=Array.isArray(p.aliases)?p.aliases:[];
      if(!p.aliases.includes(raw.id)) p.aliases.push(raw.id);
    }
    if (raw && raw.createdAt) p.createdAt=raw.createdAt;
    if (!next.some(x=>x.id===p.id || x.name.toLocaleLowerCase()===name.toLocaleLowerCase()))
      next.push(p);
  }
  // Preserve Odyssey-only players not present in the incoming legacy list.
  for (const p of state.players) {
    if (next.length>=MAX_PLAYERS) break;
    if (!next.some(x=>x.id===p.id || x.name.toLocaleLowerCase()===String(p.name||'').toLocaleLowerCase()))
      next.push(p);
  }
  state.players=next;
  if (state.activePlayerId && !playerById(state.activePlayerId)) state.activePlayerId='';
  save();
  return getPlayers();
}
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
    if (item && typeof item==='object' && item.id && item.id!==p.id) {
      p.aliases=Array.isArray(p.aliases)?p.aliases:[];
      if(!p.aliases.includes(item.id)) p.aliases.push(item.id);
    }
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
  protectNativeControl(input); protectNativeControl(cancel); protectNativeControl(saveBtn);
  cancel.onclick=close; saveBtn.onclick=submit; input.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();submit();} if(e.key==='Escape'){e.preventDefault();close();} });
  actions.append(cancel,saveBtn); card.append(title,help,input,error,actions); overlay.append(card); document.body.appendChild(overlay);
  setTimeout(()=>{ input.focus(); input.select(); }, 0);
  return overlay;
}
function getGameStats(name, gameId){
  const p=resolvePlayer(name);
  return p && p.games && p.games[gameId] ? clone(p.games[gameId]) : null;
}
function mergeLegacyGameProgress(gameId, playerRef, data){
  const p=resolvePlayer(playerRef);
  if (!p || !gameId || !data || typeof data!=='object') return null;
  const g=ensureGame(p,gameId);
  const score=Number.isFinite(+data.score) ? Math.max(0,+data.score||0) : (g.currentScore||0);
  g.currentScore=score;
  g.bestScore=Math.max(g.bestScore||0, Math.max(0,+data.bestScore||0), score);
  g.highestLevel=Math.max(g.highestLevel||1, +data.highestLevel||0, +data.level||0, 1);
  g.bestStars=Math.max(g.bestStars||0, +data.bestStars||0, +data.stars||0);
  g.sessions=Math.max(g.sessions||0, +data.gamesPlayed||0, +data.sessions||0);
  g.completions=Math.max(g.completions||0, +data.completions||0);
  g.lastPlayedAt=Math.max(g.lastPlayedAt||0, +data.lastPlayed||0, +data.lastPlayedAt||0);
  if (data.meta && typeof data.meta==='object') g.meta=Object.assign({},g.meta||{},data.meta);
  if (data.resume!==undefined) g.meta=Object.assign({},g.meta||{},{resume:data.resume});
  p.lastPlayedAt=Math.max(p.lastPlayedAt||0,g.lastPlayedAt||0);
  p.totals.gamesPlayed=Math.max(p.totals.gamesPlayed||0,g.sessions||0);
  p.totals.completions=Math.max(p.totals.completions||0,g.completions||0);
  save();
  return clone(g);
}
function getGameProgress(gameId, playerRef){
  const p=resolvePlayer(playerRef);
  if (!p) return null;
  const g=ensureGame(p,gameId);
  return {
    score:g.currentScore||0, bestScore:g.bestScore||0,
    level:g.highestLevel||1, highestLevel:g.highestLevel||1,
    stars:g.bestStars||0, gamesPlayed:g.sessions||0,
    completions:g.completions||0, lastPlayed:g.lastPlayedAt||0,
    lastPlayedAt:g.lastPlayedAt||0, meta:clone(g.meta||{}),
    resume:g.meta && Object.prototype.hasOwnProperty.call(g.meta,'resume') ? clone(g.meta.resume) : null
  };
}
function saveGameProgress(gameId, playerRef, data){ return mergeLegacyGameProgress(gameId,playerRef,data); }
function getSettings(){ return clone(state.settings); }
function setSettings(next){
  state.settings=Object.assign({sound:true,music:true},state.settings||{},next||{});
  state.settings.sound=state.settings.sound!==false;
  state.settings.music=state.settings.music!==false;
  save(); return getSettings();
}
function odysseyLevelFromXp(xp){ return Math.max(1,Math.floor(Math.max(0,+xp||0)/100)+1); }
function getAchievements(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return [];
  const games=Object.entries(p.games||{}).filter(([,g])=>g && !g.hidden);
  const played=games.filter(([,g])=>(g.sessions||0)>0).length;
  const completions=games.reduce((sum,[,g])=>sum+(g.completions||0),0);
  const out=[];
  if (played>=1) out.push({id:'first-game',name:'First Adventure',description:'Play a Tessa’s Odyssey game.'});
  if (played>=4) out.push({id:'all-four',name:'Around Odyssey',description:'Play all four Odyssey games.'});
  if (completions>=10) out.push({id:'ten-completions',name:'Keep Going!',description:'Complete 10 rounds or levels.'});
  if ((p.totals&&p.totals.xp||0)>=500) out.push({id:'xp-500',name:'Odyssey Explorer',description:'Earn 500 Odyssey XP.'});
  return out;
}
function getPlayerSummary(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return null;
  const games={};
  for(const [gameId,g] of Object.entries(p.games||{})) if(g && !g.hidden) games[gameId]=clone(g);
  const xp=p.totals&&p.totals.xp||0;
  return {
    id:p.id,name:p.name,xp,odysseyLevel:odysseyLevelFromXp(xp),
    gamesPlayed:p.totals&&p.totals.gamesPlayed||0,
    completions:p.totals&&p.totals.completions||0,
    lastPlayedAt:p.lastPlayedAt||0,games,
    achievements:getAchievements(p.id)
  };
}
function getDashboard(){ return state.players.map(p=>getPlayerSummary(p.id)); }

function isEditableTarget(target){
  return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));
}
function protectNativeControl(control){
  if(!control || control.dataset.odysseyProtected==='1') return control;
  control.dataset.odysseyProtected='1';
  for(const type of ['keydown','keyup','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click']){
    control.addEventListener(type,e=>e.stopPropagation(),type.startsWith('touch')?{passive:true}:false);
  }
  return control;
}
function installNativeInputGuards(){
  if(installNativeInputGuards.done) return;
  installNativeInputGuards.done=true;
  const nativePrevent=Event.prototype.preventDefault;
  Event.prototype.preventDefault=function(){
    if(isEditableTarget(this.target) || isEditableTarget(document.activeElement)) return;
    return nativePrevent.call(this);
  };
}
function returnToLibrary(){ location.assign('/labs/games'); }

installNativeInputGuards();

const api = {
  VERSION, STORAGE_KEY, MAX_PLAYERS, MAX_NAME,
  cleanPlayerName, getPlayers, setPlayers, ensurePlayer, selectPlayer, startSession,
  syncProgress, recordResult, adoptLegacyProfiles, mergeGlobalNames, hidePlayerForGame,
  showSaved, openNameDialog, getGameStats, getGameProgress, saveGameProgress,
  getProgress:getGameProgress, loadGameProgress:getGameProgress,
  setGameProgress:saveGameProgress, saveProgress:saveGameProgress,
  listPlayers:getPlayers, getProfiles:getPlayers, savePlayers:setPlayers,
  getSettings, setSettings, getPlayerSummary, getDashboard, getAchievements,
  odysseyLevelFromXp, protectNativeControl, installNativeInputGuards, returnToLibrary,
  getActivePlayer(){ const p=playerById(state.activePlayerId); return p ? clone(p) : null; },
  settings(){ return clone(state.settings); },
  setSetting(key,value){ state.settings[key]=!!value; save(); }
};

global.Odyssey = api;
})(window);
