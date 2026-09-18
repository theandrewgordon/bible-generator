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
function tradeReceipt(o){
  return `<div class="trade-receipt">${[['a','fromA','cashA','cardsA'],['b','fromB','cashB','cardsB']].map(([who,props,cash,cards])=>{const p=G.player(state,o[who]);return `<article><h3>${tokenMarkup(p)} ${escapeHTML(p.name)} gives</h3><strong>${money(o[cash])}</strong>${o[props].map(i=>{const q=state.spaces[i];return `<div class="receipt-deed" style="border-color:${GROUP_COLORS[q.group]||'#777'}">${escapeHTML(q.name)}${q.mortgaged?' · mortgaged':''}</div>`;}).join('')}${o[cards].map(c=>`<p>${escapeHTML(c)} Get Out of Jail Free card</p>`).join('')}<p>Cash after trade: ${money(p.cash-o[cash]+o[who==='a'?'cashB':'cashA'])} before mortgage fees.</p></article>`;}).join('')}</div><p>Receiving mortgaged deeds also creates a 10% mortgage transfer fee.</p>`;
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
  return `<div class="winner-panel"><h2>${winners.map(id=>escapeHTML(state.players.find(p=>p.id===id).name)).join(' & ')} ${winners.length>1?'share the win!':'wins!'}</h2><div class="confetti" aria-hidden="true">✦ · ✧ · ✦ · ✧ · ✦</div>${onlineRoom.result?onlineRoom.result.scores.map(r=>`<p>${escapeHTML(state.players.find(p=>p.id===r.player).name)}: ${money(r.score)}${r.bankrupt?' · bankrupt':''}</p>`).join(''):''}${familyAwards(state)}${onlineButton('Back to saved games','exit')}</div>`;
}
