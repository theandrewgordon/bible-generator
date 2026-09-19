/* Family extras reuse the rules for previews; they never mutate the game. */
function previewBuild(s,q){
  try{const copy=structuredClone(s);G.build(copy,q.index,1);return `Costs ${money(q.buildCost)} · leaves ${money(copy.players.find(p=>p.id===q.owner).cash)} · rent becomes ${money(G.rent(copy,copy.spaces[q.index]))}`;}
  catch(e){return e.message;}
}
function rescueOptions(s,id,online=false){
  const options=[];
  for(const q of s.spaces.filter(q=>q.owner===id))for(const action of ['mortgage','sell','sell-group']){
    if(action==='mortgage'&&q.mortgaged)continue;
    if(action==='sell-group'&&s.spaces.some(other=>other.owner===id&&other.group===q.group&&other.index<q.index&&other.buildings))continue;
    try{const copy=structuredClone(s),before=G.player(copy,id).cash;
      if(action==='mortgage')G.mortgage(copy,q.index);else if(action==='sell')G.build(copy,q.index,-1);else G.sellGroup(copy,q.index);
      const gain=G.player(copy,id).cash-before;if(gain<=0)continue;
      const label=`${action==='mortgage'?'Mortgage':action==='sell'?'Sell one building on':'Sell group buildings near'} ${escapeHTML(q.name)} · +${money(gain)}`;
      options.push(online?onlineButton(label,action,q.index):`<p>${label}</p>`);
    }catch(_){}
  }
  return `<details class="rescue"><summary>Help me pay this bill</summary><p>These are your legal ways to raise cash right now. Selling one building may change the next options.</p>${options.join('')||'<p>No mortgage or building sale is available. You can still propose a trade.</p>'}${!online?'<p>Use My properties to make a sale or mortgage.</p>':''}</details>`;
}
function projectTrade(s,o,lift=[]){
  const copy=structuredClone(s);
  if(o.fromA.length||o.fromB.length||o.cashA||o.cashB)G.trade(copy,o.a,o.b,o.fromA,o.fromB,o.cashA,o.cashB,lift);
  return copy;
}
function tradeWorthPreview(s,o,lift=[]){
  if(s.moneyMode!=='banker')return '';
  const after=projectTrade(s,o,lift);
  return `<div class="trade-worth-preview"><h3>After this trade</h3>${[o.a,o.b].map(id=>{const p=G.player(s,id),next=G.player(after,id);return `<p><strong>${escapeHTML(p.name)}</strong><br>Cash: ${money(p.cash)} → ${money(next.cash)}<br>Net worth: ${money(G.netWorth(s,id))} → ${money(G.netWorth(after,id))}</p>`;}).join('')}<p class="muted small">Net worth includes the incoming and outgoing properties, cash, and any new mortgage transfer fees. Cash shown is before paying those fees or redeeming mortgages.</p></div>`;
}
function tradeReceipt(o){
  return `<div class="trade-receipt">${[['a','fromA','cashA','cardsA'],['b','fromB','cashB','cardsB']].map(([who,props,cash,cards])=>{const p=G.player(state,o[who]);return `<article><h3>${tokenMarkup(p)} ${escapeHTML(p.name)} gives</h3><strong>${money(o[cash])}</strong>${o[props].map(i=>{const q=state.spaces[i];return `<div class="receipt-deed" style="border-color:${GROUP_COLORS[q.group]||'#777'}">${escapeHTML(q.name)}${q.mortgaged?' · mortgaged':''}</div>`;}).join('')}${o[cards].map(c=>`<p>${escapeHTML(c)} Get Out of Jail Free card</p>`).join('')}<p>Cash after trade: ${money(p.cash-o[cash]+o[who==='a'?'cashB':'cashA'])} before mortgage fees.</p></article>`;}).join('')}</div>${tradeWorthPreview(state,o)}<p>Receiving mortgaged deeds also creates a 10% mortgage transfer fee.</p>`;
}
function familyAwards(s){
  const stat=(p,key)=>Number.isSafeInteger(p.familyStats?.[key])?p.familyStats[key]:0;
  const rows=s.players.map(p=>({p,deeds:stat(p,'peakDeeds'),go:stat(p,'go'),bid:stat(p,'auction'),rolls:stat(p,'rolls')}));
  const awards=[];
  for(const [key,label] of [['deeds','Biggest landlord'],['go','Most GO collections'],['bid','Biggest auction purchase']]){
    const best=Math.max(0,...rows.map(r=>r[key]));if(best)awards.push(`<p>🏅 ${label}: ${rows.filter(r=>r[key]===best).map(r=>escapeHTML(r.p.name)).join(' & ')} · ${key==='bid'?money(best):best}</p>`);
  }
  return `<div class="family-awards"><h3>Everyone gets a moment</h3>${awards.join('')}${rows.map(r=>`<p>${tokenMarkup(r.p)} ${escapeHTML(r.p.name)} · ${r.rolls} recorded rolls${r.p.bankrupt?' · thanks for playing!':''}</p>`).join('')}<p class="muted small">Awards count play recorded since this feature was added.</p></div>`;
}
let familyPreferences;
try{familyPreferences=JSON.parse(localStorage.getItem('speeddie-family-preferences')||'{}')||{};}catch{familyPreferences={};}
let familyAttentionKey=null,familyIntroKey=null;
function saveFamilyPreferences(){try{localStorage.setItem('speeddie-family-preferences',JSON.stringify(familyPreferences));}catch(_){} }
function attentionPlayer(){return state.tradeOffer?.b||state.auction?.turn||state.debts[0]?.from||currentPlayer().id;}
function familyAttention(){
  const key=onlineRoom?.lobby||onlineRoom?.pausedAt||state.winnerId||onlineRoom?.result?null:attentionPlayer();
  const mine=key&&onlineOwn(key);
  document.title=mine?'Your turn! · Speed Die':'Speed Die · Family game';
  if(key!==familyAttentionKey&&mine&&familyPreferences.chime){try{tone(660,.2,.25);setTimeout(()=>tone(880,.25,.25),160);}catch(_){}}
  familyAttentionKey=key;
}
function familyRoomBar(){
  const r=onlineRoom;
  const time=r.deadline?Math.max(0,Math.ceil((r.deadline-(r.pausedAt||Date.now()/1000))/60)):null;
  const status=r.pausedAt?'Paused · take your time':time===0?'Bedtime finish: complete this turn and any pending decisions.':time!==null?`About ${time} minutes left`:'';
  const reaction=!familyPreferences.muteReactions&&r.reaction&&Date.now()/1000-r.reaction.time<8?`<p role="status">${escapeHTML(r.reaction.name)}: ${escapeHTML(r.reaction.emoji)}</p>`:'';
  return `<section class="panel family-room"><p>${status}</p><div class="button-row">${!r.lobby&&!r.result&&!state.winnerId?onlineButton(r.pausedAt?'Resume game':'Family pause',r.pausedAt?'family-resume':'family-pause'):''}${onlineButton(familyPreferences.chime?'Turn chime: on':'Enable turn chime','chime')}${onlineButton(familyPreferences.muteReactions?'Show reactions':'Mute reactions','mute-reactions')}</div><p class="muted small">Turn chimes need this page open; phones may silence background or locked screens.</p>${!familyPreferences.muteReactions?`<div class="button-row">${['👏','😱','🎉','Nice move!'].map(e=>onlineButton(e,'reaction',e)).join('')}</div>`:''}${reaction}</section>`;
}
async function familyRoomCommand(action,extra={}){
  try{const result=await roomRequest(`/rooms/${onlineSession.code}/family`,{action,...extra});if(result.room.revision>=onlineRoom.revision)onlineRoom=result.room;render();}
  catch(e){alert(e.message);}
}
function bedtimeLobby(){
  const minutes=onlineRoom.bedtimeMinutes||0;
  return `<p><strong>${minutes?`${minutes}-minute bedtime game`:'No time limit'}</strong></p><p>Bedtime house rule: finish the current turn after time runs out. Score = cash + mortgage value of unmortgaged deeds + half the price paid for buildings. Mortgaged deeds add $0. Bankrupt players cannot win; ties share the win. Pauses stop the clock.</p>${onlineRoom.me.host?`<label class="field"><span>Finish after</span><select id="bedtime-minutes">${[0,30,60,90,120].map(n=>`<option value="${n}" ${n===minutes?'selected':''}>${n?n+' minutes':'No time limit'}</option>`).join('')}</select></label>${onlineButton('Set bedtime rule','bedtime')}`:''}`;
}
function onlineCelebration(){
  const winners=onlineRoom.result?.winners||[state.winnerId];
  return `<div class="winner-panel"><h2>${winners.map(id=>escapeHTML(state.players.find(p=>p.id===id).name)).join(' & ')} ${winners.length>1?'share the win!':'wins!'}</h2>${winnerSpotlight(winners.map(id=>state.players.find(p=>p.id===id)))}${onlineRoom.result?onlineRoom.result.scores.map(r=>`<p>${escapeHTML(state.players.find(p=>p.id===r.player).name)}: ${money(r.score)}${r.bankrupt?' · bankrupt':''}</p>`).join(''):''}${familyAwards(state)}${onlineButton('Download game-night keepsake','keepsake')}${onlineButton('Back to saved games','exit')}</div>`;
}

function propertyActionLabel(q,action){
  if(action==='build'&&q.buildings>=5)return '🏨 Hotel already built';
  if(action==='build')return `${q.buildings===4?'🏨 Upgrade 4 houses to a hotel':q.buildings>=5?'🏨 Hotel already built':'🏠 Add 1 house'} · pay ${money(q.buildCost)}`;
  if(action==='sell')return `${q.buildings===5?'🏨 Sell hotel → keep 4 houses':'🏠 Remove & sell 1 house'} · get ${money(Math.floor((q.buildingCosts?.at(-1)||0)/2))}`;
  if(action==='sell-group')return '🏘️ Sell all buildings in this color group';
  return q.mortgaged?`🔓 Pay off mortgage · pay ${money(q.mortgage+Math.ceil(q.mortgage/10))}`:`🏦 Mortgage property · get ${money(q.mortgage)}`;
}
function winnerSpotlight(players){
  const colors=['#ef476f','#ffd166','#06b6a0','#4d96ff','#a66cff'];
  return `<div class="winner-spotlight"><div class="confetti" aria-hidden="true">${Array.from({length:32},(_,i)=>`<i style="--x:${(i*37)%100}%;--y:${(i*53)%90}%;--delay:${(i%8)*.17}s;--confetti-color:${colors[i%colors.length]};--tilt:${i%2?150:-150}deg"></i>`).join('')}</div><div class="winner-tokens">${players.map(p=>`<div class="winner-person"><div class="winner-token" role="img" aria-label="${escapeHTML(p.name)}’s winning token">${tokenMarkup(p)}</div><strong>${escapeHTML(p.name)}</strong></div>`).join('')}</div></div>`;
}
function collectionTracker(s,p){
  const groups=[...new Set(s.spaces.filter(q=>q.type==='property'&&q.owner===p.id).map(q=>q.group))];
  return `<details class="collection-tracker"><summary>My color collections</summary>${groups.map(color=>{const group=s.spaces.filter(q=>q.type==='property'&&q.group===color),owned=group.filter(q=>q.owner===p.id);return `<article style="border-left:6px solid ${GROUP_COLORS[color]||'#777'};padding-left:.7rem"><strong>${escapeHTML(color)} · ${owned.length} of ${group.length}</strong><p>${owned.length===group.length?'Complete set!':group.filter(q=>q.owner!==p.id).map(q=>`${escapeHTML(q.name)}: ${escapeHTML(s.players.find(p=>p.id===q.owner)?.name||'available from the bank')}`).join('<br>')}</p></article>`;}).join('')||'<p>Your color collections appear here after you get a street.</p>'}</details>`;
}
function destinationPreview(s,index){
  const q=s.spaces[index],p=s.players[s.currentPlayer];
  if(!q)return '';
  if(index===30)return 'Go directly to Jail';
  if(index===4)return 'Tax: '+money(s.rules.incomeTax);
  if(index===38)return 'Tax: '+money(s.rules.luxuryTax);
  if([2,7,17,22,33,36].includes(index))return 'Draw a card; its effect is unknown';
  if(['property','railroad','utility'].includes(q.type)){
    if(!q.owner)return `Buy for ${money(q.price)} or auction`;
    if(q.owner===p.id)return 'Your property · no rent';
    if(q.mortgaged)return 'Mortgaged · no rent';
    const owner=s.players.find(p=>p.id===q.owner).name;
    const dice=(s.roll?.d1||0)+(s.roll?.d2||0)+(typeof s.roll?.speed==='number'?s.roll.speed:0);
    return `Pay ${owner} ${money(G.rent(s,q,dice))}${q.type==='utility'?' using this roll':''}`;
  }
  if(index===20&&s.freeParkingRule!=='official')return `Collect ${money(s.freeParkingRule==='pot'?s.freeParkingPot:Number(s.freeParkingRule))}`;
  return index===0?'Collect GO salary':index===10?'Just visiting Jail':'No payment';
}
function destinationCandidate(index){
  if(state.phase==='triples')return true;
  if(state.phase!=='bus'||!state.roll)return false;
  const p=currentPlayer(),r=state.roll;
  return [r.d1,r.d2,r.d1+r.d2].some(n=>(p.position+n)%40===index);
}
function bigSaleConfirmation(s,index){
  const q=s.spaces[index],group=G.group(s,q),houses=group.reduce((n,q)=>n+(q.buildings<5?q.buildings:0),0),hotels=group.filter(q=>q.buildings===5).length;
  const proceeds=group.reduce((n,q)=>n+q.buildingCosts.reduce((n,c)=>n+Math.floor(c/2),0),0);
  return `Sell every building in ${q.group}: ${houses} house(s) and ${hotels} hotel(s), and receive ${money(proceeds)}? The properties stay yours, but their rent will drop.`;
}
function whatHappened(){
  const entry=state.ledger?.[0];
  return entry?`<details class="panel what-happened"><summary>What just happened?</summary><p>${escapeHTML(entry.message)}</p>${entry.explanation?`<p>${escapeHTML(entry.explanation)}</p>`:''}</details>`:'';
}
let reconnectWelcome='';
function welcomeBack(saved,room){
  if(!room.state)return 'Welcome back. Waiting for host approval.';
  const names=room.me.seats.map(id=>room.state.players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ')||room.me.name;
  const updates=room.state.ledger||[],last=saved.lastEvent;
  const marker=last?updates.findIndex(e=>e.time+'|'+e.message===last):-1;
  const newer=last&&marker!==0?updates.slice(0,marker<0?3:Math.min(marker,3)):[];
  const s=room.state,next=s.tradeOffer?.b||s.auction?.turn||s.debts[0]?.from||s.players[s.currentPlayer]?.id;
  return `Welcome back, ${names}! ${newer.length?newer.map(e=>e.message).join(' '):'Your game is saved.'} ${room.lobby?'The lobby is waiting.':room.pausedAt?'The game is paused.':room.result||s.winnerId?'The game is complete.':room.me.seats.includes(next)?'You are next to act.':s.players.find(p=>p.id===next).name+' is next to act.'}`;
}
async function downloadKeepsake(){
  const s=structuredClone(state),result=typeof onlineRoom!=='undefined'?onlineRoom?.result:null;
  const ids=result?.winners||[s.winnerId];if(!ids[0])return;
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=520+s.players.length*100;
  const c=canvas.getContext('2d');c.fillStyle='#fff8df';c.fillRect(0,0,canvas.width,canvas.height);
  c.textAlign='center';c.fillStyle='#173858';c.font='bold 42px sans-serif';c.fillText('Our family game night',500,70);
  c.font='24px sans-serif';c.fillText((s.gameName||'Speed Die').slice(0,50),500,112);c.fillText(new Date().toLocaleDateString(),500,150);
  c.font='bold 32px sans-serif';c.fillText(ids.map(id=>s.players.find(p=>p.id===id).name).join(' & ')+' won!',500,208,920);
  for(let i=0;i<s.players.length;i++){
    const p=s.players[i],y=290+i*100;c.fillStyle=p.color;c.fillRect(55,y-45,8,82);
    if(p.token.startsWith('data:image/')){try{const img=new Image();img.src=p.token;await img.decode();const scale=Math.min(75/img.width,75/img.height);c.drawImage(img,90+(75-img.width*scale)/2,y-40+(75-img.height*scale)/2,img.width*scale,img.height*scale);}catch(_){c.font='40px sans-serif';c.fillText('★',127,y+15);}}
    else {c.font='48px sans-serif';c.fillText(p.token||p.name.slice(0,2),127,y+15);}
    c.fillStyle='#173858';c.textAlign='left';c.font='bold 27px sans-serif';c.fillText(p.name+(ids.includes(p.id)?' · Winner':''),200,y,720);
    c.font='20px sans-serif';c.fillText(`${p.familyStats?.rolls||0} recorded rolls · peak deeds ${p.familyStats?.peakDeeds||0}${p.bankrupt?' · Thanks for playing!':''}`,200,y+32,740);c.textAlign='center';
  }
  const awards=document.createElement('div');awards.innerHTML=familyAwards(s);
  const lines=[...awards.querySelectorAll('p')].map(p=>p.textContent).filter(t=>t.startsWith('🏅'));
  c.font='22px sans-serif';lines.forEach((line,i)=>c.fillText(line,500,canvas.height-160+i*36,920));
  c.font='17px sans-serif';c.fillText('Made with Speed Die · memories worth keeping',500,canvas.height-35);
  const a=document.createElement('a');a.download='family-game-night.png';a.href=canvas.toDataURL('image/png');a.click();
}

function wealthLine(s,p){return s.moneyMode==='banker'?`<span class="player-wealth"><b>Cash ${money(p.cash)}</b><b>Net worth ${money(G.netWorth(s,p.id))}</b></span>`:'<span class="muted small">Cash and net worth require digital banking.</span>';}
function wealthExplanation(){return '<details class="wealth-help"><summary>How is net worth calculated?</summary><p>Cash + printed property values + building values − mortgages − recorded unpaid bills. A hotel counts as five building purchases. Bankrupt players have $0 net worth. This is not spendable cash; bedtime games still use their agreed liquidation-value scoring.</p></details>';}
function renderWealthPanel(){return `<section class="panel wealth-panel"><h2>Player totals</h2>${state.players.map(p=>`<div class="wealth-row">${ownerBadge(p)}<div><strong>${escapeHTML(p.name)}${p.bankrupt?' · Out':''}</strong>${wealthLine(state,p)}</div></div>`).join('')}${state.moneyMode==='banker'?wealthExplanation():''}</section>`;}
function buildableProperties(s,id){
  if(!s.started||s.winnerId||s.auction||s.pendingCard||s.tradeOffer||s.debts.length||s.auctions.length)return [];
  return s.spaces.filter(q=>q.type==='property'&&q.owner===id).filter(q=>{
    try{G.build(structuredClone(s),q.index,1);return true;}catch(_){return false;}
  });
}
function renderBuildChoices(s,id,online=false){
  const choices=buildableProperties(s,id),groups=[...new Set(choices.map(q=>q.group))];
  return `<section class="build-choices"><h3>Build houses &amp; hotels</h3><p class="muted small">Only legal purchases are shown: complete, unmortgaged color sets, even building, enough cash, and buildings available in the bank. Keep building here until you close this menu.</p>${groups.map(color=>`<section class="build-color-set" style="border-top-color:${GROUP_COLORS[color]||'#777'}"><h4>${escapeHTML(color)} color set · complete</h4>${choices.filter(q=>q.group===color).map(q=>`<article class="build-property"><strong>${escapeHTML(q.name)}</strong><p>${buildingLabel(q)} · ${escapeHTML(previewBuild(s,q))}</p>${online?onlineButton(propertyActionLabel(q,'build'),'build',q.index):button(propertyActionLabel(q,'build'),'build',q.index)}</article>`).join('')}</section>`).join('')||'<p>No houses or hotels can be added right now. Complete a color set, clear its mortgages, or check your cash and the bank’s building supply.</p>'}</section>`;
}
