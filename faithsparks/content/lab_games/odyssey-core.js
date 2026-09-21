(function(global){
'use strict';

const STORAGE_KEY = 'tessas_odyssey_platform_v1';
const VERSION = 4;
const MAX_PLAYERS = 8;
const MAX_NAME = 20;
const AVATARS = [
  {id:'star',symbol:'★',label:'Star',color:'#7357d9'},
  {id:'horse',symbol:'♞',label:'Horse',color:'#8a5b38'},
  {id:'mail',symbol:'✉',label:'Mail',color:'#39779b'},
  {id:'sparkle',symbol:'✦',label:'Sparkle',color:'#d7962d'},
  {id:'heart',symbol:'♥',label:'Heart',color:'#c6536b'},
  {id:'book',symbol:'◆',label:'Book',color:'#4d7a55'},
  {id:'sun',symbol:'☀',label:'Sun',color:'#cc7d25'},
  {id:'moon',symbol:'☾',label:'Moon',color:'#51638f'}
];

function now(){ return Date.now(); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function safeParse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
function cleanPlayerName(name){
  return String(name || '').replace(/\s+/g,' ').trim().slice(0, MAX_NAME);
}

function nameHash(value){
  let h=0; for(const ch of String(value||'')) h=((h<<5)-h+ch.charCodeAt(0))|0;
  return Math.abs(h);
}
function avatarIdFor(value){ return AVATARS[nameHash(value)%AVATARS.length].id; }
function avatarDefinition(id){ return AVATARS.find(a=>a.id===id) || AVATARS[0]; }
function pushActivity(player,activity){
  if(!player) return;
  player.activity=Array.isArray(player.activity)?player.activity:[];
  player.activity.push(Object.assign({at:now()},activity||{}));
  if(player.activity.length>200) player.activity=player.activity.slice(-200);
}
function localDayStart(ts=now()){
  const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime();
}
function localWeekStart(ts=now()){
  const d=new Date(ts); d.setHours(0,0,0,0);
  const day=d.getDay(); d.setDate(d.getDate()-((day+6)%7)); return d.getTime();
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

function mergeGameRecords(a,b){
  const out=Object.assign({},a||{});
  const newer=(b&&(+b.lastPlayedAt||0))>(+out.lastPlayedAt||0);
  out.sessions=Math.max(+out.sessions||0,+b?.sessions||0);
  out.completions=Math.max(+out.completions||0,+b?.completions||0);
  out.bestScore=Math.max(+out.bestScore||0,+b?.bestScore||0);
  out.currentScore=newer ? Math.max(0,+b?.currentScore||0) : Math.max(0,+out.currentScore||0);
  out.highestLevel=Math.max(1,+out.highestLevel||1,+b?.highestLevel||1);
  out.bestStars=Math.max(+out.bestStars||0,+b?.bestStars||0);
  out.bestAccuracy=Math.max(+out.bestAccuracy||0,+b?.bestAccuracy||0);
  out.xp=Math.max(+out.xp||0,+b?.xp||0);
  out.lastPlayedAt=Math.max(+out.lastPlayedAt||0,+b?.lastPlayedAt||0);
  out.hidden=!!(out.hidden&&b?.hidden);
  out.meta=Object.assign({},out.meta||{},b?.meta||{});
  if(newer&&b?.lastResult) out.lastResult=clone(b.lastResult);
  else if(!out.lastResult&&b?.lastResult) out.lastResult=clone(b.lastResult);
  const ids=[...(Array.isArray(out.resultIds)?out.resultIds:[]),...(Array.isArray(b?.resultIds)?b.resultIds:[])];
  out.resultIds=[...new Set(ids)].slice(-50);
  return out;
}
function normalizePlayers(){
  const merged=[];
  const canonicalByName=new Map();
  for(const raw of Array.isArray(state.players)?state.players:[]){
    const name=cleanPlayerName(raw&&raw.name);
    if(!name) continue;
    const key=name.toLocaleLowerCase();
    let p=canonicalByName.get(key);
    if(!p){
      p=raw;
      p.name=name;
      p.games=p.games&&typeof p.games==='object'?p.games:{};
      p.totals=p.totals||{xp:0,gamesPlayed:0,completions:0};
      p.aliases=Array.isArray(p.aliases)?p.aliases:[];
      p.avatar=p.avatar||avatarIdFor(p.id||p.name);
      p.activity=Array.isArray(p.activity)?p.activity:[];
      canonicalByName.set(key,p);
      merged.push(p);
      continue;
    }
    if(raw.id&&raw.id!==p.id&&!p.aliases.includes(raw.id)) p.aliases.push(raw.id);
    for(const alias of Array.isArray(raw.aliases)?raw.aliases:[])
      if(alias&&alias!==p.id&&!p.aliases.includes(alias)) p.aliases.push(alias);
    p.createdAt=Math.min(+p.createdAt||now(),+raw.createdAt||now());
    p.lastPlayedAt=Math.max(+p.lastPlayedAt||0,+raw.lastPlayedAt||0);
    p.totals.xp=Math.max(+p.totals.xp||0,+raw.totals?.xp||0);
    p.activity=[...(p.activity||[]),...(Array.isArray(raw.activity)?raw.activity:[])].sort((a,b)=>(a.at||0)-(b.at||0)).slice(-200);
    for(const [gameId,g] of Object.entries(raw.games||{}))
      p.games[gameId]=mergeGameRecords(p.games[gameId],g);
  }
  state.players=merged.slice(0,MAX_PLAYERS);
  if(state.activePlayerId&&!playerById(state.activePlayerId)){
    const canonical=state.players.find(p=>Array.isArray(p.aliases)&&p.aliases.includes(state.activePlayerId));
    state.activePlayerId=canonical?canonical.id:'';
  }
}
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
normalizePlayers(); save();
function newPlayer(name){
  const clean = cleanPlayerName(name);
  if (!clean) return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  const p = {
    id:'p_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,7),
    name:clean, createdAt:now(), lastPlayedAt:0,
    avatar:avatarIdFor(clean), activity:[],
    totals:{xp:0,gamesPlayed:0,completions:0}, games:{}
  };
  state.players.push(p); save(); return p;
}
function ensurePlayer(name){ return playerByName(name) || newPlayer(name); }
function getPlayers(){ return state.players.map(clone); }
function setPlayerAvatar(playerRef,avatarId){
  const p=resolvePlayer(playerRef); if(!p) return null;
  const def=avatarDefinition(avatarId);
  p.avatar=def.id; save(); return clone(p);
}
function getPlayerAvatar(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return clone(AVATARS[0]);
  return clone(avatarDefinition(p.avatar||avatarIdFor(p.id||p.name)));
}
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
      avatar:(raw&&raw.avatar)||avatarIdFor(name), activity:[],
      totals:{xp:0,gamesPlayed:0,completions:0}, games:{}
    };
    p.name=name;
    p.avatar=(raw&&raw.avatar)||p.avatar||avatarIdFor(p.id||name);
    p.activity=Array.isArray(p.activity)?p.activity:[];
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
  const p = resolvePlayer(name) || ensurePlayer(name); if (!p) return null;
  state.activePlayerId = p.id; p.lastPlayedAt = now();
  if (gameId) ensureGame(p, gameId).hidden = false;
  save(); return clone(p);
}
function ensureGame(player, gameId){
  if (!player.games) player.games = {};
  if (!player.games[gameId]) {
    player.games[gameId] = {
      sessions:0, completions:0, currentScore:0, bestScore:0,
      highestLevel:1, bestStars:0, xp:0, lastPlayedAt:0, lastResult:null, hidden:false, meta:{}
    };
  }
  return player.games[gameId];
}
function startSession(gameId, name, options){
  const p = name ? (resolvePlayer(name) || ensurePlayer(name)) : playerById(state.activePlayerId);
  if (!p) return null;
  state.activePlayerId = p.id;
  const g = ensureGame(p, gameId);
  const opts = options || {};
  const sessionKey = 'tessas_odyssey_session_v1:' + p.id + ':' + gameId;
  let alreadyStarted = false;
  try { alreadyStarted = !opts.force && sessionStorage.getItem(sessionKey) === '1'; } catch (_) {}
  if (!alreadyStarted) {
    g.sessions = (g.sessions || 0) + 1;
    p.totals.gamesPlayed = (p.totals.gamesPlayed || 0) + 1;
    pushActivity(p,{type:'session',gameId});
    try { sessionStorage.setItem(sessionKey, '1'); } catch (_) {}
  }
  g.lastPlayedAt = p.lastPlayedAt = now();
  save(); return clone(g);
}
function syncProgress(gameId, progress, name){
  const p = name ? (resolvePlayer(name) || ensurePlayer(name)) : playerById(state.activePlayerId);
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
  const p = name ? (resolvePlayer(name) || ensurePlayer(name)) : playerById(state.activePlayerId);
  if (!p) return null;
  state.activePlayerId = p.id;
  const g = ensureGame(p, gameId);
  const r = Object.assign({completed:false}, result || {});
  const oldXp=Math.max(0,p.totals&&p.totals.xp||0);
  const oldLevel=odysseyLevelFromXp(oldXp);
  const oldAchievements=new Set(getAchievements(p.id).map(a=>a.id));

  syncProgress(gameId, r, p.name);
  let duplicate=false;
  if (r.completed) {
    g.resultIds=Array.isArray(g.resultIds)?g.resultIds:[];
    const resultId=r.resultId ? String(r.resultId) : '';
    duplicate=!!(resultId && g.resultIds.includes(resultId));
    if(!duplicate){
      g.completions = (g.completions || 0) + 1;
      p.totals.completions = (p.totals.completions || 0) + 1;
      const scoreXp = Number.isFinite(+r.score) ? Math.min(40, Math.floor(Math.max(0,+r.score)/500)*5) : 0;
      const starsXp = Number.isFinite(+r.stars) ? Math.min(30, Math.max(0,+r.stars)*5) : 0;
      const earned = Number.isFinite(+r.xp) ? Math.max(0,Math.floor(+r.xp||0)) : 25 + scoreXp + starsXp;
      p.totals.xp = (p.totals.xp || 0) + earned;
      g.xp = (g.xp || 0) + earned;
      r.xpEarned = earned;
      pushActivity(p,{type:'completion',gameId,xp:earned,perfect:!!(r.meta&&(r.meta.perfect===true||r.meta.mistakes===0))});
      if(resultId){
        g.resultIds.push(resultId);
        if(g.resultIds.length>50) g.resultIds=g.resultIds.slice(-50);
      }
    }
  }
  g.lastResult = Object.assign({}, r, {at:now()});
  save();

  if(r.completed && !duplicate){
    const newLevel=odysseyLevelFromXp(p.totals.xp||0);
    const newAchievements=getAchievements(p.id).filter(a=>!oldAchievements.has(a.id));
    showCelebration({
      title:newLevel>oldLevel ? 'Odyssey Level Up!' : 'Round Complete!',
      xpEarned:r.xpEarned||0,
      level:newLevel,
      levelUp:newLevel>oldLevel,
      achievements:newAchievements
    });
  }
  return clone(g);
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
function hidePlayerForGame(playerRef, gameId){
  const p = resolvePlayer(playerRef); if (!p || !gameId) return;
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

function showCelebration(opts){
  opts=opts||{};
  let el=document.getElementById('odysseyCelebration');
  if(el) el.remove();
  el=document.createElement('div');
  el.id='odysseyCelebration';
  el.className='odyssey-celebration';
  const badges=Array.isArray(opts.achievements)?opts.achievements:[];
  el.innerHTML=
    '<div class="odyssey-celebration-title">'+(opts.title||'Nice job!')+'</div>'+
    (opts.xpEarned?'<div class="odyssey-celebration-xp">+'+Math.max(0,+opts.xpEarned||0)+' Odyssey XP</div>':'')+
    (opts.levelUp?'<div class="odyssey-celebration-level">Odyssey Level '+Math.max(1,+opts.level||1)+'</div>':'')+
    (badges.length?'<div class="odyssey-celebration-badges">'+badges.map(a=>'🏅 '+a.name).join('<br>')+'</div>':'');
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(showCelebration._t);
  showCelebration._t=setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),250); }, badges.length||opts.levelUp?3600:2200);
  return el;
}
function celebrateUnlock(title,detail){
  return showCelebration({title:title||'New Unlock!',achievements:detail?[{name:detail}]:[]});
}
function openAvatarPicker(playerRef,opts){
  opts=opts||{};
  const p=resolvePlayer(playerRef); if(!p) return null;
  const overlay=document.createElement('div'); overlay.className='odyssey-modal';
  const card=document.createElement('div'); card.className='odyssey-modal-card';
  const title=document.createElement('h2'); title.textContent='Choose an Avatar';
  const grid=document.createElement('div'); grid.className='odyssey-avatar-grid';
  for(const avatar of AVATARS){
    const b=document.createElement('button');
    b.type='button'; b.className='odyssey-avatar-choice'+(p.avatar===avatar.id?' selected':'');
    b.innerHTML='<span style="background:'+avatar.color+'">'+avatar.symbol+'</span><small>'+avatar.label+'</small>';
    protectNativeControl(b);
    b.onclick=()=>{
      setPlayerAvatar(p.id,avatar.id);
      overlay.remove();
      if(opts.onChange) opts.onChange(getPlayerAvatar(p.id));
    };
    grid.appendChild(b);
  }
  const cancel=document.createElement('button'); cancel.type='button'; cancel.className='odyssey-button secondary'; cancel.textContent='Cancel';
  protectNativeControl(cancel); cancel.onclick=()=>overlay.remove();
  card.append(title,grid,cancel); overlay.append(card); document.body.appendChild(overlay);
  return overlay;
}
function showRoundResults(opts){
  opts=opts||{};
  const overlay=document.createElement('div'); overlay.className='odyssey-modal odyssey-results-modal';
  const card=document.createElement('div'); card.className='odyssey-modal-card';
  const title=document.createElement('h2'); title.textContent=opts.title||'Round Complete!';
  const summary=document.createElement('div'); summary.className='odyssey-result-summary';
  const rows=[];
  if(opts.score!==undefined) rows.push(['Score',opts.score]);
  if(opts.bestScore!==undefined) rows.push(['Best',opts.bestScore]);
  if(opts.level!==undefined) rows.push(['Level',opts.level]);
  if(opts.stars!==undefined && +opts.stars>0) rows.push(['Stars',opts.stars]);
  if(opts.xpEarned!==undefined) rows.push(['Odyssey XP','+'+Math.max(0,+opts.xpEarned||0)]);
  summary.innerHTML=rows.map(([k,v])=>'<div><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
  const actions=document.createElement('div'); actions.className='odyssey-modal-actions';
  const primary=document.createElement('button'); primary.type='button'; primary.className='odyssey-button'; primary.textContent=opts.primaryLabel||'Continue';
  protectNativeControl(primary); primary.onclick=()=>{overlay.remove(); if(opts.onPrimary) opts.onPrimary();};
  actions.appendChild(primary);
  if(opts.onReplay){
    const replay=document.createElement('button'); replay.type='button'; replay.className='odyssey-button secondary'; replay.textContent='Play Again';
    protectNativeControl(replay); replay.onclick=()=>{overlay.remove();opts.onReplay();}; actions.appendChild(replay);
  }
  const library=document.createElement('button'); library.type='button'; library.className='odyssey-button secondary'; library.textContent='Game Library';
  protectNativeControl(library); library.onclick=()=>{overlay.remove(); if(opts.onLibrary) opts.onLibrary(); else returnToLibrary();};
  actions.appendChild(library);
  card.append(title,summary,actions); overlay.append(card); document.body.appendChild(overlay);
  return overlay;
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
  const coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  if (!coarse) setTimeout(()=>{ input.focus(); input.select(); }, 0);
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
    score:g.currentScore||0, bestScore:g.bestScore||0, xp:g.xp||0,
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
  const byId=Object.fromEntries(games);
  const xp=Math.max(0,p.totals&&p.totals.xp||0);
  const out=[];
  const add=(id,name,description,icon='🏅')=>out.push({id,name,description,icon});

  if (played>=1) add('first-game','First Adventure','Play a Tessa’s Odyssey game.','✨');
  if (played>=4) add('all-four','Around Odyssey','Play all four Odyssey games.','🧭');
  if (completions>=10) add('ten-completions','Keep Going!','Complete 10 rounds or levels.','🏆');
  if (completions>=25) add('twenty-five-completions','Odyssey Regular','Complete 25 rounds or levels.','🌟');
  if (completions>=50) add('fifty-completions','Odyssey Champion','Complete 50 rounds or levels.','👑');
  const perfect=games.some(([,g])=>g&&g.completions>0&&g.lastResult&&g.lastResult.meta&&(g.lastResult.meta.perfect===true||g.lastResult.meta.mistakes===0));
  if (perfect) add('perfect-round','Perfect Round','Finish a round with no mistakes.','💯');
  if ((byId['whits-end']?.completions||0)>=5) add('whits-regular',"Whit's End Regular",'Complete 5 Whit’s End rounds.','🍨');
  if ((byId['bernard-window-washing']?.completions||0)>=5) add('sparkling-clean','Sparkling Clean','Complete 5 Bernard window jobs.','✨');
  if ((byId['wooten-mail-sorting']?.completions||0)>=5) add('mail-pro','Mail Route Pro','Complete 5 Wooten routes or sorting rounds.','✉️');
  if ((byId['timothy-center-horse-racing']?.highestLevel||1)>=5) add('stable-master','Stable Master','Reach Level 5 at the Timothy Center.','🐴');
  if (xp>=500) add('xp-500','Odyssey Explorer','Earn 500 Odyssey XP.','🗺️');
  if (xp>=1000) add('xp-1000','Odyssey Hero','Earn 1,000 Odyssey XP.','⭐');
  return out;
}
function getRecentGame(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return null;
  let best=null;
  for(const [gameId,g] of Object.entries(p.games||{})){
    if(!g||g.hidden||!(g.lastPlayedAt>0)) continue;
    if(!best||g.lastPlayedAt>best.lastPlayedAt) best={gameId,lastPlayedAt:g.lastPlayedAt,progress:clone(g)};
  }
  return best;
}
function getChallenges(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return [];
  const activity=Array.isArray(p.activity)?p.activity:[];
  const day=localDayStart(), week=localWeekStart();
  const today=activity.filter(a=>(a.at||0)>=day);
  const thisWeek=activity.filter(a=>(a.at||0)>=week);
  const dailySessions=today.filter(a=>a.type==='session').length;
  const dailyCompletions=today.filter(a=>a.type==='completion').length;
  const weeklyCompletions=thisWeek.filter(a=>a.type==='completion').length;
  const weeklyGames=new Set(thisWeek.filter(a=>a.gameId).map(a=>a.gameId)).size;
  const weeklyXp=thisWeek.reduce((sum,a)=>sum+Math.max(0,+a.xp||0),0);
  const item=(id,title,current,target,period)=>({
    id,title,current:Math.min(target,current),target,period,complete:current>=target
  });
  return [
    item('daily-play','Play an Odyssey game today',dailySessions,1,'Daily'),
    item('daily-complete','Complete a round today',dailyCompletions,1,'Daily'),
    item('weekly-complete','Complete 5 rounds this week',weeklyCompletions,5,'Weekly'),
    item('weekly-variety','Play 3 different games this week',weeklyGames,3,'Weekly'),
    item('weekly-xp','Earn 100 Odyssey XP this week',weeklyXp,100,'Weekly')
  ];
}
function getPlayerSummary(playerRef){
  const p=resolvePlayer(playerRef); if(!p) return null;
  const games={};
  let gamesPlayed=0, completions=0;
  for(const [gameId,g] of Object.entries(p.games||{})) {
    if(!g || g.hidden) continue;
    games[gameId]=clone(g);
    gamesPlayed += Math.max(0, g.sessions||0);
    completions += Math.max(0, g.completions||0);
  }
  const xp=Math.max(0,p.totals&&p.totals.xp||0);
  const odysseyLevel=odysseyLevelFromXp(xp);
  const xpIntoLevel=xp%100;
  return {
    id:p.id,name:p.name,avatar:getPlayerAvatar(p.id),xp,odysseyLevel,xpIntoLevel,xpToNextLevel:100-xpIntoLevel,
    gamesPlayed,completions,
    lastPlayedAt:p.lastPlayedAt||0,games,
    recentGame:getRecentGame(p.id),
    achievements:getAchievements(p.id),
    challenges:getChallenges(p.id)
  };
}
function getDashboard(){ return state.players.map(p=>getPlayerSummary(p.id)); }

function isEditableTarget(target){
  return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));
}
function protectNativeControl(control){
  if(!control || control.dataset.odysseyProtected==='1') return control;
  control.dataset.odysseyProtected='1';
  for(const type of ['keydown','keyup','beforeinput','input','change','compositionstart','compositionend','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click']){
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


function visiblePlayers(gameId){
  return state.players
    .filter(p => {
      if (!gameId) return true;
      const g = p.games && p.games[gameId];
      return !(g && g.hidden);
    })
    .map(clone);
}

function confirmDialog(opts){
  opts=opts||{};
  const overlay=document.createElement('div');
  overlay.className='odyssey-modal';
  const card=document.createElement('div');
  card.className='odyssey-modal-card';
  const title=document.createElement('h2');
  title.textContent=opts.title||'Are you sure?';
  const body=document.createElement('p');
  body.textContent=opts.message||'This action cannot be undone.';
  const actions=document.createElement('div');
  actions.className='odyssey-modal-actions';
  const cancel=document.createElement('button');
  cancel.type='button'; cancel.className='odyssey-button secondary'; cancel.textContent=opts.cancelLabel||'Cancel';
  const confirm=document.createElement('button');
  confirm.type='button'; confirm.className='odyssey-button danger'; confirm.textContent=opts.confirmLabel||'Delete';
  protectNativeControl(cancel); protectNativeControl(confirm);
  cancel.onclick=()=>overlay.remove();
  confirm.onclick=()=>{ overlay.remove(); if(opts.onConfirm) opts.onConfirm(); };
  actions.append(cancel,confirm);
  card.append(title,body,actions);
  overlay.append(card);
  document.body.appendChild(overlay);
  return overlay;
}

const playerSelectAutoConsumed=new Set();

function openPlayerSelect(opts){
  opts=opts||{};
  const gameId=opts.gameId||'';
  const autoKey=gameId||'__odyssey__';
  const active=playerById(state.activePlayerId);
  const firstSelectOnPage=!playerSelectAutoConsumed.has(autoKey);
  playerSelectAutoConsumed.add(autoKey);

  // When a player was selected on /labs/games, carry that same stable
  // Odyssey identity straight into the first mini-game opened on this page.
  // Later calls (notably Change Player) deliberately show the selector.
  if(firstSelectOnPage && active && opts.autoContinueActive!==false){
    selectPlayer(active.id,gameId);
    if(opts.onContinue) opts.onContinue(clone(active));
    return {
      close(){},
      refresh(){},
      element:null,
      autoContinued:true
    };
  }
  const existing=document.getElementById('odysseyPlayerSelect');
  if(existing) existing.remove();

  const overlay=document.createElement('div');
  overlay.id='odysseyPlayerSelect';
  overlay.className='odyssey-player-select';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');

  const panel=document.createElement('div');
  panel.className='odyssey-player-panel';

  const title=document.createElement('h1');
  title.textContent='Choose a Player';
  const help=document.createElement('p');
  help.className='odyssey-player-help';
  help.textContent='Continue an existing player or add a new one.';

  const list=document.createElement('div');
  list.className='odyssey-player-list';

  function summaryFor(player){
    if(opts.getSummary){
      try { return opts.getSummary(player) || {}; } catch(_) {}
    }
    const g=gameId ? getGameStats(player.id,gameId) : null;
    return {
      level:g && g.highestLevel || 1,
      bestScore:g && g.bestScore || 0,
      detail:g && g.completions ? `${g.completions} completions` : ''
    };
  }

  function choose(player){
    selectPlayer(player.id,gameId);
    overlay.remove();
    if(opts.onContinue) opts.onContinue(clone(player));
  }

  function render(){
    list.replaceChildren();
    const players=visiblePlayers(gameId);
    if(!players.length){
      const empty=document.createElement('p');
      empty.className='odyssey-player-empty';
      empty.textContent='No players yet. Add a player to begin.';
      list.appendChild(empty);
    }

    for(const player of players){
      const card=document.createElement('div');
      card.className='odyssey-player-card';

      const avatar=getPlayerAvatar(player.id);
      const avatarEl=document.createElement('div');
      avatarEl.className='odyssey-player-avatar';
      avatarEl.textContent=avatar.symbol;
      avatarEl.style.background=avatar.color;

      const name=document.createElement('div');
      name.className='odyssey-player-name';
      name.textContent=player.name;

      const meta=document.createElement('div');
      meta.className='odyssey-player-meta';
      const s=summaryFor(player);
      const parts=[];
      if(s.level || s.highestLevel) parts.push('Highest Level '+(s.highestLevel||s.level));
      if(Number.isFinite(+s.bestScore) && +s.bestScore>0) parts.push('Best '+Math.max(0,+s.bestScore||0));
      if(s.detail) parts.push(String(s.detail));
      meta.textContent=parts.join(' · ') || 'Ready to play';

      const actions=document.createElement('div');
      actions.className='odyssey-player-actions';

      const cont=document.createElement('button');
      cont.type='button'; cont.className='odyssey-button'; cont.textContent='Continue';
      protectNativeControl(cont);
      cont.onclick=()=>choose(player);

      const del=document.createElement('button');
      del.type='button'; del.className='odyssey-button danger'; del.textContent='Delete';
      protectNativeControl(del);
      del.onclick=()=>confirmDialog({
        title:'Delete '+player.name+'?',
        message:opts.deleteMessage || 'This removes this player from this game. Other Odyssey game progress stays intact.',
        confirmLabel:'Delete',
        onConfirm:()=>{
          if(gameId) hidePlayerForGame(player.id,gameId);
          if(opts.onDelete) opts.onDelete(clone(player));
          render();
        }
      });

      actions.append(cont,del);
      const identity=document.createElement('div');
      identity.className='odyssey-player-identity';
      const copy=document.createElement('div');
      copy.append(name,meta);
      identity.append(avatarEl,copy);
      card.append(identity,actions);
      list.appendChild(card);
    }

    const add=document.createElement('button');
    add.type='button';
    add.className='odyssey-button odyssey-new-player-button';
    add.textContent=state.players.length>=MAX_PLAYERS ? '8 Players Maximum' : '+ New Player';
    add.disabled=state.players.length>=MAX_PLAYERS;
    protectNativeControl(add);
    add.onclick=()=>{
      openNameDialog({
        title:'New Player',
        saveLabel:'Create Player',
        validate(name){
          const existing=playerByName(name);
          if(existing){
            const game=gameId && existing.games ? existing.games[gameId] : null;
            if(!(gameId && game && game.hidden)) return 'That player already exists.';
          }
          if(!existing && state.players.length>=MAX_PLAYERS) return 'You can have up to 8 players.';
          return opts.validateName ? (opts.validateName(name)||'') : '';
        },
        onSave(name){
          let player=playerByName(name);
          if(player && gameId){
            const game=ensureGame(player,gameId);
            game.hidden=false;
          }else if(!player){
            player=newPlayer(name);
          }
          if(!player) return;
          if(gameId) ensureGame(playerById(player.id),gameId).hidden=false;
          save();
          if(opts.onCreate) opts.onCreate(clone(player));
          choose(player);
        }
      });
    };

    panel.replaceChildren(title,help,list,add);
  }

  render();
  overlay.append(panel);
  document.body.appendChild(overlay);
  return {
    close(){ overlay.remove(); },
    refresh:render,
    element:overlay
  };
}

function mountGameMenu(opts){
  opts=opts||{};
  const oldButton=document.getElementById('odysseyGameMenuButton');
  if(oldButton) oldButton.remove();
  const oldOverlay=document.getElementById('odysseyGameMenuOverlay');
  if(oldOverlay) oldOverlay.remove();

  const button=document.createElement('button');
  button.id='odysseyGameMenuButton';
  button.type='button';
  button.className='odyssey-hamburger';
  button.setAttribute('aria-label','Open game menu');
  button.textContent='☰';
  protectNativeControl(button);

  let overlay=null;

  function close(){
    if(overlay){ overlay.remove(); overlay=null; }
    if(opts.onResume) opts.onResume();
  }

  function open(){
    if(overlay) return;
    if(opts.onOpen) opts.onOpen();

    overlay=document.createElement('div');
    overlay.id='odysseyGameMenuOverlay';
    overlay.className='odyssey-modal';

    const card=document.createElement('div');
    card.className='odyssey-modal-card odyssey-game-menu-card';
    const title=document.createElement('h2');
    title.textContent='Game Menu';
    card.appendChild(title);

    function menuButton(label,action,secondary=true){
      const b=document.createElement('button');
      b.type='button';
      b.className='odyssey-button'+(secondary?' secondary':'');
      b.textContent=label;
      protectNativeControl(b);
      b.onclick=action;
      card.appendChild(b);
      return b;
    }

    menuButton('Resume / Continue',()=>close(),false);
    menuButton('Restart Current Round',()=>{
      overlay.remove(); overlay=null;
      if(opts.onRestart) opts.onRestart();
    });
    menuButton('Change Player',()=>{
      overlay.remove(); overlay=null;
      if(opts.onSave) opts.onSave();
      if(opts.onChangePlayer) opts.onChangePlayer();
    });
    menuButton('Return to Game Library',()=>{
      overlay.remove(); overlay=null;
      if(opts.onSave) opts.onSave();
      if(opts.onLibrary) opts.onLibrary(); else returnToLibrary();
    });

    const settings=getSettings();
    const soundBtn=menuButton('Sound Effects: '+(settings.sound?'On':'Off'),()=>{
      const next=getSettings();
      next.sound=!next.sound;
      setSettings(next);
      soundBtn.textContent='Sound Effects: '+(next.sound?'On':'Off');
      if(opts.onSettings) opts.onSettings(getSettings());
    });

    if(opts.hasMusic){
      const musicBtn=menuButton('Music: '+(settings.music?'On':'Off'),()=>{
        const next=getSettings();
        next.music=!next.music;
        setSettings(next);
        musicBtn.textContent='Music: '+(next.music?'On':'Off');
        if(opts.onSettings) opts.onSettings(getSettings());
      });
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  button.onclick=open;
  document.body.appendChild(button);

  return {
    open, close,
    showButton(){ button.style.display='flex'; },
    hideButton(){ button.style.display='none'; if(overlay){overlay.remove();overlay=null;} },
    destroy(){ button.remove(); if(overlay) overlay.remove(); },
    button
  };
}

function bindAutosave(saveFn){
  if(typeof saveFn!=='function') return ()=>{};
  const onVisibility=()=>{ if(document.hidden) saveFn('background'); };
  const onPageHide=()=>saveFn('pagehide');
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',onPageHide);
  return ()=>{
    document.removeEventListener('visibilitychange',onVisibility);
    window.removeEventListener('pagehide',onPageHide);
  };
}

function normalizeProgress(data){
  const d=data||{};
  return {
    score:Math.max(0,Number.isFinite(+d.score)?+d.score:0),
    bestScore:Math.max(0,Number.isFinite(+d.bestScore)?+d.bestScore:0),
    level:Math.max(1,Number.isFinite(+d.level)?+d.level:1),
    highestLevel:Math.max(1,Number.isFinite(+d.highestLevel)?+d.highestLevel:(Number.isFinite(+d.level)?+d.level:1)),
    stars:Math.max(0,Number.isFinite(+d.stars)?+d.stars:0),
    gamesPlayed:Math.max(0,Number.isFinite(+d.gamesPlayed)?+d.gamesPlayed:0),
    completions:Math.max(0,Number.isFinite(+d.completions)?+d.completions:0),
    lastPlayed:Math.max(0,Number.isFinite(+d.lastPlayed)?+d.lastPlayed:0),
    meta:d.meta && typeof d.meta==='object' ? clone(d.meta) : {},
    resume:d.resume===undefined ? null : clone(d.resume)
  };
}
function checkpoint(gameId, playerRef, progress, options){
  const normalized=normalizeProgress(progress);
  const saved=mergeLegacyGameProgress(gameId,playerRef,normalized);
  const opts=options||{};
  if(opts.toast) showSaved(opts.message||'Saved');
  return saved;
}
function createRoundId(gameId,playerRef,label){
  const p=resolvePlayer(playerRef);
  const who=p?p.id:'player';
  return [gameId,who,label||'round',now().toString(36),Math.random().toString(36).slice(2,7)].join(':');
}
function createGameShell(opts){
  opts=opts||{};
  const gameId=opts.gameId;
  if(!gameId) throw new Error('Odyssey.createGameShell requires gameId');
  installNativeInputGuards();

  let menu=null;
  let unbindAutosave=()=>{};

  function save(reason,toast){
    let progress={};
    if(typeof opts.getProgress==='function'){
      try{ progress=opts.getProgress(reason)||{}; }catch(_){}
    }
    if(opts.getActivePlayer){
      const ref=opts.getActivePlayer();
      if(ref) checkpoint(gameId,ref,progress,{toast:!!toast});
    }else{
      const p=getActivePlayer();
      if(p) checkpoint(gameId,p.id,progress,{toast:!!toast});
    }
    if(typeof opts.onSave==='function') opts.onSave(reason);
  }

  function showPlayers(){
    if(menu) menu.hideButton();
    return openPlayerSelect({
      gameId,
      getSummary:opts.getSummary,
      deleteMessage:opts.deleteMessage,
      onContinue(player){
        selectPlayer(player.id,gameId);
        if(typeof opts.onContinue==='function') opts.onContinue(player);
        if(menu) menu.showButton();
      },
      onCreate:opts.onCreate,
      onDelete:opts.onDelete
    });
  }

  menu=mountGameMenu({
    gameId,
    hasMusic:!!opts.hasMusic,
    onOpen:opts.onMenuOpen,
    onResume:opts.onResume,
    onRestart(){
      if(typeof opts.restartRound==='function') opts.restartRound();
    },
    onChangePlayer(){
      save('change-player',false);
      if(typeof opts.onChangePlayer==='function') opts.onChangePlayer();
      showPlayers();
    },
    onLibrary(){
      save('library',false);
      returnToLibrary();
    },
    onSave(){ save('menu',false); },
    onSettings:opts.onSettings
  });

  unbindAutosave=bindAutosave(reason=>save(reason,false));

  return {
    gameId,menu,showPlayers,
    checkpoint(progress,options){
      const p=getActivePlayer(); if(!p) return null;
      return checkpoint(gameId,p.id,progress,options);
    },
    startSession(options){
      const p=getActivePlayer(); if(!p) return null;
      return startSession(gameId,p.id,options);
    },
    complete(result){
      const p=getActivePlayer(); if(!p) return null;
      const r=Object.assign({},result||{});
      if(!r.resultId) r.resultId=createRoundId(gameId,p.id,'complete');
      return recordResult(gameId,r,p.id);
    },
    save,
    destroy(){
      unbindAutosave();
      if(menu) menu.destroy();
    }
  };
}

function awardXp(playerRef,amount,reason,gameId){
  const p=resolvePlayer(playerRef); if(!p) return null;
  const add=Math.max(0,Math.floor(+amount||0));
  const oldLevel=odysseyLevelFromXp(p.totals&&p.totals.xp||0);
  p.totals=p.totals||{xp:0,gamesPlayed:0,completions:0};
  p.totals.xp=(p.totals.xp||0)+add;
  if(gameId){ const g=ensureGame(p,gameId); g.xp=(g.xp||0)+add; g.lastPlayedAt=now(); }
  p.lastPlayedAt=now();
  pushActivity(p,{type:'xp',gameId:gameId||'',xp:add,reason:String(reason||'Bonus')});
  if(reason){
    p.xpHistory=Array.isArray(p.xpHistory)?p.xpHistory:[];
    p.xpHistory.push({amount:add,reason:String(reason),at:now()});
    if(p.xpHistory.length>50) p.xpHistory=p.xpHistory.slice(-50);
  }
  save();
  const newLevel=odysseyLevelFromXp(p.totals.xp||0);
  if(add) showCelebration({title:newLevel>oldLevel?'Odyssey Level Up!':(reason||'Bonus XP!'),xpEarned:add,level:newLevel,levelUp:newLevel>oldLevel});
  return getPlayerSummary(p.id);
}


installNativeInputGuards();

const api = {
  VERSION, STORAGE_KEY, MAX_PLAYERS, MAX_NAME, AVATARS,
  cleanPlayerName, getPlayers, setPlayers, ensurePlayer, selectPlayer, startSession,
  setPlayerAvatar, getPlayerAvatar, openAvatarPicker,
  syncProgress, recordResult, adoptLegacyProfiles, mergeGlobalNames, hidePlayerForGame,
  showSaved, openNameDialog, getGameStats, getGameProgress, saveGameProgress,
  getProgress:getGameProgress, loadGameProgress:getGameProgress,
  setGameProgress:saveGameProgress, saveProgress:saveGameProgress,
  listPlayers:getPlayers, getProfiles:getPlayers, savePlayers:setPlayers,
  getSettings, setSettings, getPlayerSummary, getDashboard, getAchievements, getChallenges, getRecentGame,
  odysseyLevelFromXp, protectNativeControl, installNativeInputGuards, returnToLibrary,
  visiblePlayers, confirmDialog, openPlayerSelect, mountGameMenu, bindAutosave,
  normalizeProgress, checkpoint, createRoundId, createGameShell, awardXp,
  showCelebration, celebrateUnlock, showRoundResults,
  getActivePlayer(){ const p=playerById(state.activePlayerId); return p ? clone(p) : null; },
  settings(){ return clone(state.settings); },
  setSetting(key,value){ state.settings[key]=!!value; save(); }
};

global.Odyssey = api;
})(window);
