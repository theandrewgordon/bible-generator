/* Read-only board overview. Selecting a space never moves money or tokens. */
"use strict";
let boardView = false;
let boardSelection = null;
let boardOwners = null;
function ownerBadge(p,extra=""){return `<span class="owner-character ${extra}" style="border-color:${p.color}" title="Owned by ${escapeHTML(p.name)}" aria-label="Owned by ${escapeHTML(p.name)}">${tokenMarkup(p)}</span>`;}
function buildingSymbols(q){return q.buildings===5?"🏨":"🏠".repeat(q.buildings||0);}
function boardCoordinates(index) {
  if (index <= 10) return [11, 11-index];
  if (index <= 20) return [21-index, 1];
  if (index <= 30) return [1, index-19];
  return [index-29, 11];
}
function boardOccupants(index) { return state.players.filter(p=>!p.bankrupt && p.position===index); }
function boardSpaceDescription(space) {
  const owner=state.players.find(p=>p.id===space.owner), here=boardOccupants(space.index);
  return `${space.name}${owner ? `; owned by ${owner.name}` : isProperty(space) ? '; unowned' : ''}${space.mortgaged ? '; mortgaged' : ''}${space.buildings ? `; ${buildingLabel(space)}` : ''}${here.length ? `; ${here.map(p=>`${p.name}${p.inJail?' in Jail':space.index===10?' just visiting':''}`).join(', ')}` : ''}`;
}
function renderBoardOverview() {
  const newOwners=new Set(state.spaces.filter(q=>boardOwners&&q.owner&&boardOwners[q.index]!==q.owner).map(q=>q.index));
  boardOwners=state.spaces.map(q=>q.owner);
  const selected=state.spaces[boardSelection ?? currentPlayer().position];
  const active=G.active(state), unowned=state.spaces.filter(p=>isProperty(p)&&!p.owner).length;
  return `<section class="panel board-overview"><div class="players-heading"><h2>Game board</h2><button id="close-board" type="button" class="button secondary board-back">Back to play</button></div>
    <p class="muted small">Tap any space for details. Square character badges show who owns a property. Round tokens show who is visiting. Tap for names and building details. ${["bus","triples"].includes(state.phase)?"Outlined spaces are your move choices.":""}</p>
    <div class="monopoly-board" aria-label="Board overview">
      ${state.spaces.map(space=>{
        const [row,col]=boardCoordinates(space.index), owner=state.players.find(p=>p.id===space.owner), here=boardOccupants(space.index);
        const icon=space.index===0?'GO':space.index===10?'JAIL':space.index===20?'PARK':space.index===30?'→JAIL':isCardSpace(space)?(space.name==='Chance'?'?':'✉'):space.type==='railroad'?'🚂':space.type==='utility'?'⚡':space.index===4||space.index===38?'$':String(space.index);
        return `<button type="button" class="board-square ${selected.index===space.index?'selected':''} ${destinationCandidate(space.index)?'move-candidate':''} ${here.length?'occupied':''} ${space.mortgaged?'is-mortgaged':''}" data-board-space="${space.index}" style="grid-row:${row};grid-column:${col};--group-color:${GROUP_COLORS[space.group] || '#d8d5ce'}" aria-label="${escapeHTML(boardSpaceDescription(space))}" aria-pressed="${selected.index===space.index}">
          <span class="board-band" aria-hidden="true"></span><span class="board-short" aria-hidden="true">${icon}</span><span class="board-name" aria-hidden="true">${escapeHTML(space.name)}</span>
          ${owner?ownerBadge(owner,`board-owner ${newOwners.has(space.index)?'owner-new':''}`):''}
          ${space.mortgaged?'<span class="board-mortgage" aria-hidden="true">M</span>':''}
          ${space.buildings?`<span class="board-building" aria-hidden="true">${space.buildings===5?'🏨':'🏠'+space.buildings}</span>`:''}
          <span class="board-token-row" aria-hidden="true">${here.slice(0,1).map(p=>`<span class="board-token" style="border-color:${p.color}">${tokenMarkup(p)}</span>`).join('')}${here.length>1?`<b>+${here.length-1}</b>`:''}</span>
        </button>`;
      }).join('')}
      <div class="board-center"><p class="eyebrow">${state.winnerId?'Game complete':'Current turn'}</p><h3>${escapeHTML(currentPlayer().name)}${state.winnerId?' wins!':''}</h3><p>${escapeHTML(state.gameName || 'Family game')}</p><p class="muted small">${unowned} properties available<br>M = mortgaged · 🏠 houses · 🏨 hotel</p><div class="board-player-key">${active.map(p=>`<div><span class="board-key-token" style="border-color:${p.color}">${tokenMarkup(p)}</span><span>${escapeHTML(p.name)}${state.moneyMode==='banker'?` · ${money(p.cash)}`:''}</span></div>`).join('')}</div></div>
    </div>
    <div id="board-space-details" class="board-space-details" aria-live="polite">${renderBoardSpaceDetails(selected)}</div>
  </section>${renderWealthPanel()}`;
}
function renderBoardSpaceDetails(space) {
  const owner=state.players.find(p=>p.id===space.owner), here=boardOccupants(space.index);
  return `${destinationCandidate(space.index)?`<p><strong>Move preview:</strong> ${escapeHTML(destinationPreview(state,space.index))}</p>`:""}<h3>${space.index} · ${escapeHTML(space.name)}</h3>${owner?`<p class="owner-detail">${ownerBadge(owner)}<strong>Owned by ${escapeHTML(owner.name)}</strong></p>`:''}${space.buildings?`<p class="building-symbols" aria-label="${buildingLabel(space)}">${buildingSymbols(space)}</p>`:''}<p>${isProperty(space)?`${owner?`Owned by ${escapeHTML(owner.name)}`:'Available from the bank'} · Price ${money(space.price)}${space.mortgaged?' · Mortgaged: no rent':''}${space.type==='property'?` · ${buildingLabel(space)}`:''}`:space.index===10?'Jailed players and visitors share this square.':space.index===20?'Free Parking':isCardSpace(space)?'Draw a card when you land here.':''}</p>
    ${isProperty(space)?`<p class="muted small">Mortgage value ${money(space.mortgage)}${space.type==='property'?` · Building cost ${money(space.buildCost)}`:''}</p><dl class="board-rents">${space.rents.map((rent,i)=>`<div><dt>${space.type==='property'?['Base','1 house','2 houses','3 houses','4 houses','Hotel'][i]:space.type==='railroad'?`${i+1} railroad${i?'s':''}`:`${i+1} utilit${i?'ies':'y'}`}</dt><dd>${space.type==='utility'?`${rent} × dice`:money(rent)}</dd></div>`).join('')}</dl>`:''}
    <p>${here.length?`Here: ${here.map(p=>`${escapeHTML(p.name)}${p.inJail?' (in Jail)':space.index===10?' (just visiting)':''}`).join(', ')}`:'No players on this space.'}</p>`;
}
function bindBoardEvents() {
  document.querySelector('#close-board').onclick=()=>{boardView=false;render();window.scrollTo({top:0,behavior:'instant'});};
  document.querySelectorAll('[data-board-space]').forEach(el=>el.onclick=()=>{
    boardSelection=Number(el.dataset.boardSpace);
    document.querySelectorAll('[data-board-space]').forEach(b=>{const selected=b===el;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    document.querySelector('#board-space-details').innerHTML=renderBoardSpaceDetails(state.spaces[boardSelection]);
  });
}
