(function(global){
'use strict';

const STORAGE_KEY = 'tessas_odyssey_platform_v1';
const VERSION = 3;
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
      highestLevel:1, bestStars:0, xp:0, lastPlayedAt:0, lastResult:null, hidden:false, meta:{}
    };
  }
  return player.games[gameId];
}
function startSession(gameId, name, options){
  const p = name ? ensurePlayer(name) : playerById(state.activePlayerId);
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
    try { sessionStorage.setItem(sessionKey, '1'); } catch (_) {}
  }
  g.lastPlayedAt = p.lastPlayedAt = now();
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
    g.resultIds=Array.isArray(g.resultIds)?g.resultIds:[];
    const resultId=r.resultId ? String(r.resultId) : '';
    const duplicate=resultId && g.resultIds.includes(resultId);
    if(!duplicate){
      g.completions = (g.completions || 0) + 1;
      p.totals.completions = (p.totals.completions || 0) + 1;
      const scoreXp = Number.isFinite(+r.score) ? Math.min(40, Math.floor(Math.max(0,+r.score)/500)*5) : 0;
      const starsXp = Number.isFinite(+r.stars) ? Math.min(30, Math.max(0,+r.stars)*5) : 0;
      const earned = Number.isFinite(+r.xp) ? Math.max(0,Math.floor(+r.xp||0)) : 25 + scoreXp + starsXp;
      p.totals.xp = (p.totals.xp || 0) + earned;
      g.xp = (g.xp || 0) + earned;
      r.xpEarned = earned;
      if(resultId){
        g.resultIds.push(resultId);
        if(g.resultIds.length>50) g.resultIds=g.resultIds.slice(-50);
      }
    }
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
  const out=[];
  if (played>=1) out.push({id:'first-game',name:'First Adventure',description:'Play a Tessa’s Odyssey game.'});
  if (played>=4) out.push({id:'all-four',name:'Around Odyssey',description:'Play all four Odyssey games.'});
  if (completions>=10) out.push({id:'ten-completions',name:'Keep Going!',description:'Complete 10 rounds or levels.'});
  const perfect=games.some(([,g])=>g && g.completions>0 && g.lastResult && g.lastResult.meta && (g.lastResult.meta.perfect===true || g.lastResult.meta.mistakes===0));
  if (perfect) out.push({id:'perfect-round',name:'Perfect Round',description:'Finish a round with no mistakes.'});
  if ((p.totals&&p.totals.xp||0)>=500) out.push({id:'xp-500',name:'Odyssey Explorer',description:'Earn 500 Odyssey XP.'});
  return out;
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
    id:p.id,name:p.name,xp,odysseyLevel,xpIntoLevel,xpToNextLevel:100-xpIntoLevel,
    gamesPlayed,completions,
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

function openPlayerSelect(opts){
  opts=opts||{};
  const gameId=opts.gameId||'';
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
      card.append(name,meta,actions);
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
          if(playerByName(name)) return 'That player already exists.';
          if(state.players.length>=MAX_PLAYERS) return 'You can have up to 8 players.';
          return opts.validateName ? (opts.validateName(name)||'') : '';
        },
        onSave(name){
          const player=newPlayer(name);
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
  p.totals=p.totals||{xp:0,gamesPlayed:0,completions:0};
  p.totals.xp=(p.totals.xp||0)+add;
  if(gameId){ const g=ensureGame(p,gameId); g.xp=(g.xp||0)+add; g.lastPlayedAt=now(); }
  p.lastPlayedAt=now();
  if(reason){
    p.xpHistory=Array.isArray(p.xpHistory)?p.xpHistory:[];
    p.xpHistory.push({amount:add,reason:String(reason),at:now()});
    if(p.xpHistory.length>50) p.xpHistory=p.xpHistory.slice(-50);
  }
  save();
  return getPlayerSummary(p.id);
}

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
  visiblePlayers, confirmDialog, openPlayerSelect, mountGameMenu, bindAutosave,
  normalizeProgress, checkpoint, createRoundId, createGameShell, awardXp,
  getActivePlayer(){ const p=playerById(state.activePlayerId); return p ? clone(p) : null; },
  settings(){ return clone(state.settings); },
  setSetting(key,value){ state.settings[key]=!!value; save(); }
};

global.Odyssey = api;
})(window);
