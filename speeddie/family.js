/* Family play flows: saved games, card consequences, auctions and presentation. */
"use strict";
let homeView = false;
const LIBRARY_KEY = "faithsparks-speed-die-library-v1";
function library() {
  const raw = localStorage.getItem(LIBRARY_KEY);
  const result = raw ? JSON.parse(raw) : {};
  if (!result || Array.isArray(result) || typeof result !== "object") throw new Error("Saved-game library cannot be read. Export the current game before clearing browser storage.");
  return result;
}
function archiveCurrent() {
  if (!saveWriterReady) return false;
  try {
    if (state.started) {
      if (!state.gameId) { state.gameId = crypto.randomUUID(); if (!saveState(true)) return false; }
      const games = library(); games[state.gameId] = { ...snapshotState(state), undoStack, savedAt: new Date().toISOString() };
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(games));
    }
    return true;
  } catch (e) { alert(`Could not preserve this game: ${e.message}`); return false; }
}
function goHome() { if (!archiveCurrent()) return; document.querySelectorAll('dialog[open]').forEach(d => d.close()); homeView = true; render(); }
function newFamilyGame() { if (!archiveCurrent()) return; homeView = false; state = freshState(); syncMusic(); undoStack = []; undoState = null; if (saveState(true)) render(); }
function resumeFamilyGame(id) {
  try {
    const next = migrateState(structuredClone(library()[id]));
    if (!archiveCurrent()) return;
    state = next; undoStack = next.undoStack || []; undoState = undoStack[0] || null;
    delete state.undoStack; homeView = false; if (saveState(true)) render();
  } catch (e) { alert(`Could not open this game: ${e.message}`); }
}
function renderHome() {
  let games;
  try { games = Object.values(library()).sort((a,b) => (b.savedAt || '').localeCompare(a.savedAt || '')); }
  catch (e) { app.innerHTML = `<section class="panel"><h2>Saved games need attention</h2><p>${escapeHTML(e.message)}</p>${button('Back to current game','home-back')}</section>`; bindActions(app); return; }
  app.innerHTML = `<section class="panel"><h2>Family games</h2><p>Saved on this browser. Export a backup to keep a copy elsewhere.</p>${button('New game','new-game')}<div class="saved-games">${games.map(s => `<article class="panel"><h3>${escapeHTML(s.gameName || 'Family game')}</h3><p>${escapeHTML(s.players.map(p=>p.name).join(', '))}</p><p>${s.winnerId ? 'Completed' : 'In progress'} · ${escapeHTML(new Date(s.savedAt).toLocaleString())}</p>${button(s.winnerId ? 'View result' : 'Resume','resume-game',s.gameId)}</article>`).join('') || '<p>No saved games yet.</p>'}</div></section>`;
  bindActions(app);
}
function cardPending(s = state) {
  return ['landed','classic-first-stop'].includes(s.phase) && !s.bankLandingResolved && !s.players[s.currentPlayer]?.inJail && [2,7,17,22,33,36].includes(s.players[s.currentPlayer]?.position);
}
function renderCardLanding() {
  const deck = [7,22,36].includes(currentPlayer().position) ? 'chance' : 'chest';
  const name = deck === 'chance' ? 'Chance' : 'Community Chest';
  if (state.pendingCard) return `<article class="card-preview"><h3>${name}</h3><p>${escapeHTML(cardDescription(state.pendingCard.effect))}</p>${button('Apply card','apply-card')}</article>`;
  return `<h3>${name}</h3><p>${state.cardMode === 'digital' ? 'Draw a card, read it, then apply it.' : 'Draw from your physical deck, then tell the app what happens.'}</p>${button(state.cardMode === 'digital' ? 'Draw card' : 'Enter card consequence',state.cardMode === 'digital' ? 'draw-card' : 'physical-card',deck)}`;
}
function openPhysicalCard() {
  const types = [['collect','Collect from bank'],['pay','Pay bank'],['collect-each','Collect from each player'],['pay-each','Pay each player'],['move','Advance to a space'],['back','Move backward'],['railroad','Nearest railroad · double rent'],['utility','Nearest utility · fresh dice × 10'],['jail','Go to Jail'],['keep','Keep Get Out of Jail Free'],['repairs','Pay repairs']];
  showDialog('What does your card do?', `<label class="field"><span>Consequence</span><select id="card-effect">${types.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><div id="card-fields"></div><button class="button" type="submit">Preview consequence</button>`, () => {
    const type = document.querySelector('#card-effect').value;
    const effect = {type};
    if (['collect','pay','collect-each','pay-each','back'].includes(type)) effect.amount = readAmount('card-amount');
    if (type === 'move') effect.target = Number(document.querySelector('#card-target').value);
    if (type === 'repairs') { effect.house = readAmount('card-house', true); effect.hotel = readAmount('card-hotel', true); }
    const deck = [7,22,36].includes(currentPlayer().position) ? 'chance' : 'chest';
    return commitGame(s => { G.assert(cardPending(s) && !s.pendingCard, 'Resolve the current card first.'); s.pendingCard = {deck, effect, physical:true}; });
  });
  const fields = () => {
    const type = document.querySelector('#card-effect').value;
    document.querySelector('#card-fields').innerHTML = ['collect','pay','collect-each','pay-each','back'].includes(type) ? amountField(type === 'back' ? 'Spaces backward (1–39)' : 'Amount per player', 'card-amount', '', type === 'back' ? 'max="39" min="1"' : 'min="1"') : type === 'move' ? `<label class="field"><span>Destination · collect GO when passed</span><select id="card-target">${state.spaces.map(p=>`<option value="${p.index}">${escapeHTML(p.name)}</option>`).join('')}</select></label>` : type === 'repairs' ? amountField('Cost per house','card-house',25) + amountField('Cost per hotel','card-hotel',100) : '<p>No amount needed.</p>';
  };
  document.querySelector('#card-effect').onchange = fields; fields();
}
function renderAuctionFlow() {
  const a = state.auction, p = G.player(state,a.turn), prop = state.spaces[a.index];
  return `<section class="panel instruction"><p class="eyebrow">Auction · pass the screen</p><h2>${escapeHTML(prop.name)}</h2><p>${a.leader ? `${escapeHTML(G.player(state,a.leader).name)} leads at ${money(a.bid)}.` : 'No bids yet. Bidding starts at $1.'}</p><h3>${escapeHTML(p.name)}’s bid</h3><p>${state.moneyMode === 'banker' ? `Available: ${money(p.cash)}.` : 'Bid only what you can pay in physical cash.'}</p><div class="button-row auction-bids">${[1,10,50,100].map(n=>button(`Bid ${money(a.bid+n)}`,'auction-bid',a.bid+n,state.moneyMode === 'banker' && p.cash < a.bid+n ? 'disabled' : '')).join('')}</div>${amountField('Your total bid','turn-bid',a.bid+1,'min="1"')}<div class="button-stack">${button('Place custom bid','auction-custom')}${button('Pass · withdraw','auction-pass')}</div><details><summary>How bidding works</summary><p>Everyone may bid, including the player who declined to buy. Take turns. Passing withdraws you from this auction. The last bidder wins. If everyone passes without a bid, the property stays in the bank.</p></details></section>`;
}
function openFamilyAuction(index) {
  if (state.auction) return;
  showDialog(`Auction · ${state.spaces[index].name}`, `<p>Take turns bidding on this screen. Passing withdraws you from this auction.</p>${button('Start turn-by-turn bidding','auction-start',index)}<details><summary>Already held the auction out loud?</summary><label class="field"><span>Winning player</span><select id="auction-player">${playerOptions(currentPlayer().id)}</select></label>${amountField('Winning bid','auction-price',state.spaces[index].price,'min="1"')}<button class="button" type="submit">Record purchase</button></details>`,()=>commitGame(s=>G.buy(s,index,document.querySelector('#auction-player').value,readAmount('auction-price'))));
}
let audioContext, musicTimer, musicStep = 0;
function tone(freq, duration=.12, volume=.1) {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume().catch(()=>{});
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type='sine'; osc.frequency.value=freq; gain.gain.setValueAtTime(volume * (state.audioVolume ?? .3),audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);
}
function playEffect(kind) {
  if (!state.soundEffects || document.hidden) return;
  try { const notes = kind === 'roll' ? [180,125,220,150] : kind === 'victory' ? [392,494,587,784] : [440,660]; notes.forEach((n,i)=>setTimeout(()=>tone(n,.12,.25),i*90)); } catch (_) { /* Audio is optional. */ }
}
function syncMusic() {
  clearInterval(musicTimer); musicTimer = null;
  if (state.music && !document.hidden) musicTimer = setInterval(()=>{ try { tone([262,330,392,330,294,349,440,349][musicStep++%8],.55,.06); } catch (_) {} },650);
}
document.addEventListener('visibilitychange',syncMusic);
function openPresentation() {
  menuDialog.close();
  showDialog('Dice & sound', `<label class="check-card"><input id="pip-setting" type="checkbox" ${state.dicePips !== false ? 'checked' : ''}><span>Show dice dots</span></label><label class="check-card"><input id="effects-setting" type="checkbox" ${state.soundEffects ? 'checked' : ''}><span>Sound effects</span></label><label class="check-card"><input id="music-setting" type="checkbox" ${state.music ? 'checked' : ''}><span>Gentle background music</span></label><label class="field"><span>Volume</span><input id="audio-volume" type="range" min="0" max="1" step=".05" value="${state.audioVolume ?? .3}"></label><button class="button" type="submit">Save preferences</button>`,()=>{
    state.dicePips=document.querySelector('#pip-setting').checked;state.soundEffects=document.querySelector('#effects-setting').checked;state.music=document.querySelector('#music-setting').checked;state.audioVolume=Number(document.querySelector('#audio-volume').value);
    if (!saveState()) return false;syncMusic();playEffect('payment');render();
  });
}
function familyAction(action,value) {
  if (action === 'home') {goHome(); return true;}
  if (action === 'home-back') {homeView=false;render();return true;}
  if (action === 'new-game') {newFamilyGame();return true;}
  if (action === 'resume-game') {resumeFamilyGame(value);return true;}
  if (action === 'presentation') {openPresentation();return true;}
  if (action === 'card-trade') {openCardTrade();return true;}
  if (action === 'bank-menu') {showDialog('Bank',`${button('Payment / correction','payment')}${button('History','history')}${button('Trade a Jail card','card-trade')}<details><summary>Help with money</summary><p>Normal rent, purchases and cards appear during the turn. Use a manual payment only for an extra agreed transaction or correction.</p></details>`);return true;}
  if (action === 'physical-card') {openPhysicalCard();return true;}
  if (action === 'draw-card') {commitGame(s=>{G.assert(cardPending(s),'No card is due.');G.drawCard(s,value);});return true;}
  if (action === 'apply-card') {commitGame(s=>G.applyCard(s,()=>Math.floor(Math.random()*6)+1));return true;}
  if (action === 'auction-start') {if(commitGame(s=>G.startAuction(s,Number(value)))) document.querySelector('#companion-dialog').close();return true;}
  if (['auction-bid','auction-custom','auction-pass'].includes(action)) {commitGame(s=>G.auctionTurn(s,action==='auction-pass'?null:action==='auction-custom'?readAmount('turn-bid'):Number(value)));return true;}
  return false;
}

document.addEventListener('pointerdown',()=>{if(state.music&&!musicTimer)syncMusic();});
function openCardTrade() {
  const cards = state.heldCards || [];
  if (!cards.length) { showDialog('Trade a Jail card','<p>No recorded Get Out of Jail Free cards are held.</p>'); return; }
  showDialog('Trade a Jail card', `<label class="field"><span>Card to sell or give</span><select id="held-card">${cards.map((c,i)=>`<option value="${i}">${escapeHTML(G.player(state,c.owner).name)} · ${c.deck==='chance'?'Chance':'Community Chest'}</option>`).join('')}</select></label><label class="field"><span>Recipient</span><select id="card-buyer">${playerOptions()}</select></label>${amountField('Agreed price (0 for a gift)','card-price',0)}<button class="button" type="submit">Complete card trade</button>`,()=>commitGame(s=>{
    const card=s.heldCards[Number(document.querySelector('#held-card').value)], buyer=document.querySelector('#card-buyer').value;
    G.assert(card && card.owner!==buyer,'Choose a different recipient.');
    G.transfer(s,buyer,card.owner,readAmount('card-price',true),'Get Out of Jail Free card trade');card.owner=buyer;
  }));
}

function cardDescription(effect) {
  let text = G.cardText(effect);
  if (effect.type === 'move') text = `Advance to ${state.spaces[effect.target].name}. Collect GO salary if you pass GO.`;
  if (effect.type === 'repairs') {
    const owned = state.spaces.filter(p=>p.owner===currentPlayer().id);
    const houses=owned.reduce((n,p)=>n+(p.buildings<5?p.buildings:0),0), hotels=owned.filter(p=>p.buildings===5).length;
    text += ` You have ${houses} houses and ${hotels} hotels: $${houses*effect.house+hotels*effect.hotel} total.`;
  }
  return text;
}
