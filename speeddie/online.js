/* Online rooms use commands and authoritative snapshots; never local game writes. */
'use strict';
let onlineSession=null, onlineRoom=null, onlineConnected=false, onlineBusy=false, onlinePending=null, onlinePoll=null, onlineCSRF=null;
const ONLINE_KEY='speeddie-online-devices-v1';
function onlineSaved(){try{return JSON.parse(localStorage.getItem(ONLINE_KEY)||'{}');}catch{return {};}}
function rememberOnline(){
  try {const saved=onlineSaved();saved[onlineSession.code]={...onlineSession,pending:onlinePending};localStorage.setItem(ONLINE_KEY,JSON.stringify(saved));}
  catch(_){alert('Room access could not be saved on this browser. Keep this tab open to retain your player access.');}
}
async function onlineConfig(){
  const r=await fetch('/speeddie/api/config',{cache:'no-store'});if(!r.ok)throw Error('Online rooms need the game server. This static preview supports pass & play only.');
  const c=await r.json();onlineCSRF=c.csrf;if(!c.available)throw Error('Online rooms are not configured on this server. Pass & play still works.');return c;
}
async function roomRequest(path,body,credential=onlineSession?.token){
  if(!onlineCSRF)await onlineConfig();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {
    const r=await fetch('/speeddie/api'+path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':onlineCSRF,...(credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let value;try{value=await r.json();}catch{throw Error('The game server did not respond. Reconnect and retry.');}
    if(!r.ok){const error=Error(value.error||'Room request failed.');error.status=r.status;throw error;}return value;
  } finally{clearTimeout(timeout);}
}
function onlineLaunchButtons(){return `<details class="online-launch"><summary>Play on your own devices</summary><p>Host a digital game, then share its room code. The host can keep several players on one tablet while others use their phones.</p>${button('Join a room','online-join')}${Object.keys(onlineSaved()).map(code=>button(`Reconnect · ${escapeHTML(code)}`,'online-reconnect',code)).join('')}</details>`;}
async function openOnlineJoin(){
  showDialog('Join a game',`<label class="field"><span>Room code</span><input id="online-code" maxlength="8" autocomplete="off" required></label><label class="field"><span>Your name</span><input id="online-name" maxlength="24" required></label><p>The host will choose which players this phone controls.</p><button class="button" type="submit">Ask to join</button>`,async()=>{
    if(!archiveCurrent())return false;
    const code=document.querySelector('#online-code').value.trim().toUpperCase(),name=document.querySelector('#online-name').value.trim();
    const result=await roomRequest(`/rooms/${encodeURIComponent(code)}/join`,{name},null);enterOnline({code,token:result.token},result.room);return true;
  });
}
async function hostOnline(){
  if(!state.started||state.moneyMode!=='banker'||state.cardMode!=='digital'){alert('Start a game with digital banking and in-app cards to host it online.');return;}
  if(!archiveCurrent())return;
  try {await onlineConfig();const result=await roomRequest('/rooms',{state:snapshotState(state)},null);enterOnline({code:result.room.code,token:result.token},result.room);}
  catch(e){alert(e.message);}
}
async function reconnectOnline(code){
  if(!archiveCurrent())return;
  const saved=onlineSaved()[code];if(!saved)return;
  try {await onlineConfig();const result=await roomRequest(`/rooms/${code}`,null,saved.token);enterOnline(saved,result.room);}
  catch(e){alert(e.message);}
}
function enterOnline(credentials,room){
  onlineSession={code:credentials.code,token:credentials.token};onlinePending=credentials.pending||null;onlineRoom=room;onlineConnected=true;onlineBusy=false;boardView=false;boardSelection=null;homeView=false;
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());rememberOnline();render();scheduleOnline();
}
function leaveOnline(){
  clearTimeout(onlinePoll);onlineSession=null;onlineRoom=null;onlinePending=null;onlineConnected=false;onlineBusy=false;boardView=false;boardSelection=null;
  adoptStoredGame();homeView=true;syncMusic();render();
}
function scheduleOnline(){clearTimeout(onlinePoll);if(onlineSession)onlinePoll=setTimeout(refreshOnline,document.hidden?5000:1500);}
async function refreshOnline(){
  if(!onlineSession)return;
  if(onlineBusy){scheduleOnline();return;}
  const sessionAtStart=onlineSession;
  try {
    const result=await roomRequest(`/rooms/${onlineSession.code}`);
    if(onlineSession!==sessionAtStart)return;
    const changed=!onlineConnected||result.room.revision>(onlineRoom?.revision||0);onlineConnected=true;
    if(result.room.revision>=(onlineRoom?.revision||0))onlineRoom=result.room;
    if(changed)render();
  }catch(e){if(onlineSession!==sessionAtStart)return;onlineConnected=false;render();}
  finally{scheduleOnline();}
}
async function onlineCommand(action,args={}){
  if(onlineBusy||!onlineConnected||onlineRoom.closed)return;
  onlinePending ||= {id:crypto.randomUUID(),revision:onlineRoom.revision,action,args};rememberOnline();onlineBusy=true;render();
  const sessionAtStart=onlineSession;
  try{
    const result=await roomRequest(`/rooms/${onlineSession.code}/actions`,onlinePending);
    if(onlineSession!==sessionAtStart)return;
    onlinePending=null;onlineRoom=result.room;onlineConnected=true;rememberOnline();
    if(action==='roll'||action==='jail-roll')playEffect('roll');
  }catch(e){
    if(onlineSession!==sessionAtStart)return;
    if(e.status&&e.status<500){onlinePending=null;rememberOnline();alert(e.message);if(e.status===403)onlineCSRF=null;}
    else onlineConnected=false;
  }finally{if(onlineSession===sessionAtStart){onlineBusy=false;render();scheduleOnline();}}
}
const onlineButton=(label,action,value='')=>`<button type="button" class="button secondary" data-online="${action}" data-value="${escapeHTML(value)}">${label}</button>`;
function onlineOwn(id){return onlineRoom.me.seats.includes(id);}
function onlineNext(){
  if(onlineRoom.lobby)return onlineLobby();
  if(state.winnerId)return `<h2>${escapeHTML(G.player(state,state.winnerId).name)} wins!</h2><p>The completed game is saved in this room.</p>`;
  if(state.tradeOffer){const o=state.tradeOffer;return `<h3>Trade proposal</h3><p>${escapeHTML(G.player(state,o.a).name)} offers ${money(o.cashA)} and ${escapeHTML(o.fromA.map(i=>state.spaces[i].name).join(', ')||'no properties')}${o.cardsA.length?' plus Jail card(s)':''}.</p><p>For ${money(o.cashB)} and ${escapeHTML(o.fromB.map(i=>state.spaces[i].name).join(', ')||'no properties')} from ${escapeHTML(G.player(state,o.b).name)}${o.cardsB.length?' plus Jail card(s)':''}.</p><p>Mortgaged deeds carry a 10% transfer fee.</p>${onlineOwn(o.b)?onlineButton('Accept trade','trade-accept'):''}${onlineOwn(o.a)||onlineOwn(o.b)?onlineButton('Decline / withdraw','trade-reject'):'Waiting for the trading players.'}`;}
  if(state.auction){const a=state.auction;return `<h3>Auction: ${escapeHTML(state.spaces[a.index].name)}</h3><p>${a.leader?escapeHTML(G.player(state,a.leader).name)+' leads at '+money(a.bid):'No bids yet.'}</p><p>${escapeHTML(G.player(state,a.turn).name)} is bidding.</p>${onlineOwn(a.turn)?`${amountField('Total bid','online-bid',a.bid+1,'min="1"')}${onlineButton('Place bid','auction-bid')}${onlineButton('Pass · withdraw','auction-pass')}`:''}`;}
  if(state.debts.length){const d=state.debts[0],debtor=G.player(state,d.from);return `<h3>${escapeHTML(debtor.name)} owes ${money(d.amount)}</h3><p>${escapeHTML(d.reason)} · Cash ${money(debtor.cash)}</p>${onlineOwn(d.from)?`${debtor.cash>=d.amount?onlineButton('Pay bill','settle'):'Sell buildings, mortgage, or trade below to raise cash.'}${onlineButton('Declare bankruptcy','bankrupt')}`:'Waiting for this player to settle.'}`;}
  if(state.auctions.length)return `<h3>Bankruptcy auction</h3><p>${escapeHTML(state.spaces[state.auctions[0]].name)}</p>${onlineOwn(currentPlayer().id)?onlineButton('Start auction','auction-start',state.auctions[0]):'Waiting for the current player.'}`;
  if(!onlineOwn(currentPlayer().id))return `<h3>${escapeHTML(currentPlayer().name)}’s turn</h3><p>Watch the board while they play.</p>`;
  const p=currentPlayer(),q=currentSpace();
  if(state.pendingCard)return `<h3>Card</h3><p>${escapeHTML(cardDescription(state.pendingCard.effect))}</p>${onlineButton('Apply card','apply-card')}`;
  if(state.phase==='ready')return p.inJail?`<h3>In Jail · attempt ${p.jailAttempts+1}</h3>${p.jailAttempts<2?onlineButton('Pay '+money(state.rules.jail),'jail-pay'):''}${(state.heldCards||[]).some(c=>c.owner===p.id)?onlineButton('Use Jail card','jail-card'):''}${onlineButton('Try doubles','jail-roll')}`:`<h3>${escapeHTML(p.name)} · ready?</h3>${onlineButton('Roll dice','roll')}`;
  if(state.phase==='bus')return `<h3>Choose a Bus move</h3>${[...new Set([state.roll.d1,state.roll.d2,state.roll.d1+state.roll.d2])].map(n=>onlineButton(`${n} → ${escapeHTML(state.spaces[(p.position+n)%40].name)}`,'bus',n)).join('')}`;
  if(state.phase==='triples')return `<h3>Triples · choose any space</h3><select id="online-destination">${state.spaces.map(q=>`<option value="${q.index}">${escapeHTML(q.name)}</option>`).join('')}</select>${onlineButton('Move','triples')}`;
  if(!state.bankLandingResolved&&!p.inJail){
    if(isProperty(q)&&!q.owner)return `<h3>${escapeHTML(q.name)} · ${money(q.price)}</h3>${p.cash>=q.price?onlineButton('Buy','buy'):''}${onlineButton('Auction','auction-start',q.index)}${state.allowLeaveUnowned?onlineButton('Leave unowned','leave'):''}`;
    if(isCardSpace(q))return onlineButton('Draw card','draw-card');
    if(state.landingBill?.amount)return `<p>${escapeHTML(state.landingBill.reason)} · ${money(state.landingBill.amount)}</p>${onlineButton('Pay / resolve bill','pay')}`;
    if(q.index===20&&state.freeParkingRule!=='official')return onlineButton('Collect Free Parking','parking');
    return onlineButton('Finish this stop','resolve');
  }
  return onlineButton(state.phase==='classic-first-stop'?'Continue Property Finder':state.extraTurn?'Finish stop · roll again':'End turn',state.phase==='classic-first-stop'?'finder':'end');
}
function onlineAssets(){
  if(onlineRoom.lobby||state.winnerId||state.auction||state.pendingCard||state.tradeOffer)return '';
  return `<details class="panel"><summary>Your properties &amp; trades</summary>${G.active(state).filter(p=>onlineOwn(p.id)).map(p=>`<h3>${escapeHTML(p.name)} · ${money(p.cash)}</h3>${state.spaces.filter(q=>q.owner===p.id).map(q=>`<article class="online-property"><h4>${escapeHTML(q.name)}</h4><p>${q.mortgaged?'Mortgaged':buildingLabel(q)}</p><div class="button-row">${q.type==='property'?onlineButton('Build '+money(q.buildCost),'build',q.index)+(q.buildings?onlineButton('Sell one','sell',q.index)+onlineButton('Sell group buildings','sell-group',q.index):''):''}${onlineButton(q.mortgaged?'Unmortgage':'Mortgage','mortgage',q.index)}</div></article>`).join('')||'<p>No deeds yet.</p>'}${onlineButton('Propose a trade','trade-open',p.id)}`).join('')}</details>`;
}
function renderOnline(){
  menuButton.classList.add('hidden');document.querySelector('#save-status').hidden=true;app.inert=false;
  if(!onlineRoom){app.innerHTML='<p>Connecting…</p>';return;}
  if(onlineRoom.state)state=onlineRoom.state;
  const r=onlineRoom;
  app.innerHTML=`<section class="panel online-status"><strong>Room ${escapeHTML(r.code)}</strong><p>${r.closed?'Room closed · read-only':!onlineConnected?'Disconnected. Reconnect before making a move.':onlineBusy?'Saving your action…':r.me.status==='pending'?'Waiting for host approval.':r.me.status==='rejected'?'The host declined this device.':'Connected · '+escapeHTML(r.me.seats.map(id=>state.players.find(p=>p.id===id)?.name||'').join(' / ')||'watching')}</p><div class="button-row">${onlineButton('Back to local games','exit')}${onlineButton('Reconnect','refresh')}${r.me.host?onlineButton('Players & room','room-settings'):''}</div>${onlinePending?`<p>An action needs confirmation. Retry safely using the same request.</p>${onlineButton('Retry pending action','retry')}`:''}</section>
  ${r.state?`${state.roll?renderDice():''}<section class="panel instruction online-actions"><div class="button-stack">${onlineNext()}</div></section>${onlineAssets()}${renderBoardOverview()}`:''}`;
  app.querySelector('#close-board')?.remove();
  app.querySelectorAll('[data-board-space]').forEach(el=>el.onclick=()=>{boardSelection=Number(el.dataset.boardSpace);app.querySelectorAll('[data-board-space]').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',String(b===el));});document.querySelector('#board-space-details').innerHTML=renderBoardSpaceDetails(state.spaces[boardSelection]);});
  bindOnline(app);
  if(!onlineConnected||onlineBusy||onlinePending||r.closed)app.querySelectorAll('[data-online]').forEach(b=>{if(!['exit','refresh','room-settings','retry'].includes(b.dataset.online))b.disabled=true;});
}
function bindOnline(root){root.querySelectorAll('[data-online]').forEach(b=>b.onclick=async()=>{
  const action=b.dataset.online,value=b.dataset.value;
  if(action==='profile'){openOnlineProfile(value);return;}
  if(action==='add-player'){openOnlineProfile();return;}
  if(action==='ready'){await lobbyCommand({action:'ready',players:[value]});return;}
  if(action==='start-game'){await lobbyCommand({action:'start'});return;}
  if(action==='exit'){leaveOnline();return;}
  if(action==='refresh'){onlineCSRF=null;await refreshOnline();return;}
  if(action==='retry'){if(onlinePending)await onlineCommand(onlinePending.action,onlinePending.args);return;}
  if(action==='room-settings'){openRoomSettings();return;}
  if(action==='trade-open'){openOnlineTrade(value);return;}
  if(action==='bankrupt'&&!confirm('Declare bankruptcy for this unpaid bill? Properties transfer under the game rules.'))return;
  let args={};if(['build','sell','sell-group','mortgage','auction-start'].includes(action))args.index=Number(value);
  if(action==='bus')args.amount=Number(value);
  if(action==='triples')args.index=Number(document.querySelector('#online-destination').value);
  if(action==='auction-bid'){try{args.amount=readAmount('online-bid');}catch(e){alert(e.message);return;}}
  await onlineCommand(action,args);
});}
function openRoomSettings(){
  const r=onlineRoom;
  showDialog('Players & room',`<p>Share code <strong>${escapeHTML(r.code)}</strong>. Each approved phone controls its assigned players. Unassigned players stay on this host device.</p><p>Saved online for seven days after the last move. Download a backup for longer storage.</p>${r.members.map(m=>`<article class="online-property"><h3>${escapeHTML(m.name)}${m.host?' · this host':''}</h3><p>${escapeHTML(m.status)}</p>${state.players.filter(p=>!p.bankrupt).map(p=>`<label class="check-card"><input type="checkbox" data-seat-member="${m.id}" value="${p.id}" ${m.seats.includes(p.id)?'checked':''}><span>${escapeHTML(p.name)}</span></label>`).join('')}<button type="button" class="button secondary" data-assign="${m.id}">Save this device’s players</button></article>`).join('')}<div class="button-stack"><button type="button" id="online-backup" class="button secondary">Download room backup</button><button type="button" id="online-close" class="button danger">Close room for everyone</button></div>`);
  document.querySelectorAll('[data-assign]').forEach(b=>b.onclick=async()=>{try{const seats=[...document.querySelectorAll(`[data-seat-member="${b.dataset.assign}"]:checked`)].map(e=>e.value);const result=await roomRequest(`/rooms/${r.code}/members`,{member:b.dataset.assign,seats});onlineRoom=result.room;document.querySelector('#companion-dialog').close();render();}catch(e){alert(e.message);}});
  document.querySelector('#online-backup').onclick=async()=>{try{const data=await roomRequest(`/rooms/${r.code}/backup`);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data.state,null,2)],{type:'application/json'}));a.download=`speeddie-${r.code}-backup.json`;a.click();URL.revokeObjectURL(a.href);}catch(e){alert(e.message);}};
  document.querySelector('#online-close').onclick=async()=>{if(!confirm('Close this room for everyone? You can still download its backup.'))return;try{const result=await roomRequest(`/rooms/${r.code}/close`,{});onlineRoom=result.room;document.querySelector('#companion-dialog').close();render();}catch(e){alert(e.message);}};
}
function openOnlineTrade(a){
  const options=G.active(state).filter(p=>p.id!==a);if(!options.length)return;
  showDialog('Propose a trade',`<label class="field"><span>Trade with</span><select id="online-trade-to">${options.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}</select></label><div id="online-trade-items"></div><p>Each player must agree. Mortgage transfer fees are due after acceptance.</p><button class="button" type="submit">Send proposal</button>`,async()=>{
    const chosen=side=>[...document.querySelectorAll(`[data-trade-side="${side}"]:checked`)];
    const data={a,b:document.querySelector('#online-trade-to').value,cashA:readAmount('online-cash-a',true),cashB:readAmount('online-cash-b',true),fromA:chosen('a').filter(e=>!e.dataset.card).map(e=>Number(e.value)),fromB:chosen('b').filter(e=>!e.dataset.card).map(e=>Number(e.value)),cardsA:chosen('a').filter(e=>e.dataset.card).map(e=>e.value),cardsB:chosen('b').filter(e=>e.dataset.card).map(e=>e.value)};
    document.querySelector('#companion-dialog').close();await onlineCommand('trade-propose',data);return true;
  });
  const draw=()=>{const b=document.querySelector('#online-trade-to').value;document.querySelector('#online-trade-items').innerHTML=[[a,'a'],[b,'b']].map(([id,side])=>`<h3>${escapeHTML(G.player(state,id).name)} offers</h3>${amountField('Cash','online-cash-'+side,0)}${state.spaces.filter(p=>p.owner===id).map(p=>`<label class="check-card"><input data-trade-side="${side}" type="checkbox" value="${p.index}" ${G.group(state,p).some(q=>q.buildings)?'disabled':''}><span>${escapeHTML(p.name)}${p.mortgaged?' (mortgaged)':''}</span></label>`).join('')}${(state.heldCards||[]).filter(c=>c.owner===id).map(c=>`<label class="check-card"><input type="checkbox" data-trade-side="${side}" data-card="true" value="${c.deck}"><span>${c.deck} Jail card</span></label>`).join('')}`).join('');};
  document.querySelector('#online-trade-to').onchange=draw;draw();
}

function onlineLobby(){
  const ready=onlineRoom.ready||[];
  return `<h2>Get ready to play</h2><p>Choose your player details, then tap Ready. The host starts when everyone is ready.</p>${state.players.map(p=>`<article class="online-property"><h3><span class="small-token">${tokenMarkup(p)}</span> ${escapeHTML(p.name)}</h3><p>${ready.includes(p.id)?'Ready ✓':'Choosing player details'}</p>${onlineOwn(p.id)?onlineButton('Name, color & token','profile',p.id)+(!ready.includes(p.id)?onlineButton('Ready','ready',p.id):''):''}</article>`).join('')}${state.players.length<8?onlineButton('Add another player on this device','add-player'):''}${onlineRoom.me.host?onlineButton('Start game','start-game'):'<p>Waiting for the host to start.</p>'}`;
}
async function lobbyCommand(data){
  if(onlineBusy||!onlineConnected||onlineRoom.closed)return false;
  onlineBusy=true;render();
  try{const result=await roomRequest(`/rooms/${onlineSession.code}/lobby`,data);onlineRoom=result.room;return true;}
  catch(e){alert(e.message);return false;}
  finally{onlineBusy=false;render();scheduleOnline();}
}
function openOnlineProfile(id){
  const p=state.players.find(p=>p.id===id);
  showDialog(p?'Your player':'Add a player',`<label class="field"><span>Name</span><input id="lobby-name" maxlength="24" required value="${escapeHTML(p?.name||'')}"></label><label class="field"><span>Color</span><input id="lobby-color" type="color" value="${p?.color||'#397bb5'}"></label><label class="field"><span>Token</span><select id="lobby-token">${p?'<option value="keep">Keep current token</option>':''}${TOKEN_CHOICES.map(t=>`<option>${t}</option>`).join('')}</select></label><label class="field"><span>Or use a picture</span><input id="lobby-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p>You can use a dog, horse, LEGO creation, or your own picture.</p><button class="button" type="submit">Save player</button>`,async()=>{
    const name=document.querySelector('#lobby-name').value,color=document.querySelector('#lobby-color').value;
    const selected=document.querySelector('#lobby-token').value;
    const token=await imageToken(document.querySelector('#lobby-photo').files[0])||(selected==='keep'?p.token:selected);
    return await lobbyCommand({action:p?'profile':'add',player:id,name,color,token});
  });
}
