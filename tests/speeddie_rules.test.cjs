const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const G = require('../speeddie/rules.js');
const source = fs.readFileSync(require.resolve('../speeddie/app.js'), 'utf8');
const board = vm.runInNewContext(source.slice(source.indexOf('const DEFAULT_SPACES'), source.indexOf('const GROUP_COLORS')) + '\nJSON.stringify(DEFAULT_SPACES)');
function game(count = 3) {
  return G.upgrade({ version: 5, started: true, phase: 'ready', currentPlayer: 0,
    moneyMode: 'banker', spaces: JSON.parse(board), players: Array.from({length: count}, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: '#397bb5', position: 0, cash: 2500, inJail: false })),
    freeParkingRule: 'official' });
}
function own(s, indices, id = 'p0', level = 0) { for (const i of indices) Object.assign(s.spaces[i], { owner: id, buildings: level, buildingCosts: Array(level).fill(s.spaces[i].buildCost) }); }
function change(s, fn) { const next = G.run(s, fn).state; G.validate(next); return next; }

test('old games gain safe helper defaults without losing owners or names', () => {
  const s = game(); delete s.moneyMode; delete s.players[0].cash; s.spaces[1].owner = 'p0'; s.spaces[1].name = 'Our street';
  G.upgrade(s); assert.equal(s.moneyMode, 'helper'); assert.equal(s.spaces[1].name, 'Our street'); assert.equal(s.spaces[1].owner, 'p0'); assert.equal(s.version, 6); G.validate(s);
});
test('eight-player turn order skips eliminations and wraps', () => {
  const s = game(8); s.players[1].bankrupt = true; G.advance(s); assert.equal(s.currentPlayer, 2); s.currentPlayer = 7; G.advance(s); assert.equal(s.currentPlayer, 0); G.validate(s);
});
test('purchase and rent use US deed values and update both sides', () => {
  let s = change(game(), s => G.buy(s, 1, 'p0')); assert.equal(s.players[0].cash, 2440);
  s = change(s, s => G.buy(s, 3, 'p0')); assert.equal(G.rent(s, s.spaces[1]), 4);
  s = change(s, s => G.transfer(s, 'p1', 'p0', 4, 'Rent')); assert.equal(s.players[1].cash, 2496); assert.equal(s.players[0].cash, 2384);
});
test('failed purchase is atomic', () => {
  const s = game(); s.players[0].cash = 10; const before = structuredClone(s);
  assert.throws(() => G.run(s, s => G.buy(s, 39, 'p0')), /Not enough/); assert.deepEqual(s, before);
});
test('build requires complete unmortgaged group and even development', () => {
  let s = game(); own(s, [1]); assert.throws(() => change(s, s => G.build(s, 1, 1)), /entire/);
  own(s, [3]); s = change(s, s => G.build(s, 1, 1)); assert.equal(G.rent(s, s.spaces[1]), 10); assert.equal(G.stock(s).houses, 31);
  assert.throws(() => change(s, s => G.build(s, 1, 1)), /evenly/); assert.throws(() => change(s, s => G.mortgage(s, 3)), /every building/);
  s = change(s, s => G.build(s, 3, 1)); s = change(s, s => G.build(s, 1, 1));
  assert.throws(() => change(s, s => G.build(s, 3, -1)), /evenly/);
});
test('hotel returns four houses and cannot exceed one hotel', () => {
  let s = game(); own(s, [1, 3], 'p0', 4); s = change(s, s => G.build(s, 1, 1));
  assert.deepEqual(G.stock(s), { houses: 28, hotels: 11 }); assert.equal(G.rent(s, s.spaces[1]), 250);
  assert.throws(() => change(s, s => G.build(s, 1, 1)), /maximum/);
  s = change(s, s => G.build(s, 1, -1)); assert.deepEqual(G.stock(s), { houses: 24, hotels: 12 });
});
test('hotel downgrade shortage can be resolved by selling the whole group', () => {
  let s = game(); own(s, [1, 3], 'p0', 5); own(s, [6, 8, 9, 11, 13, 14, 16, 18, 19], 'p1', 3);
  own(s, [21, 23, 24], 'p1', 1); assert.equal(G.stock(s).houses, 2);
  assert.throws(() => change(s, s => G.build(s, 1, -1)), /four houses/);
  s = change(s, s => G.sellGroup(s, 1)); assert.equal(s.players[0].cash, 2750); assert.equal(G.stock(s).hotels, 12);
});
test('building auction resale uses actual paid cost', () => {
  let s = game(); own(s, [1, 3]); s = change(s, s => G.build(s, 1, 1, 120)); s = change(s, s => G.build(s, 1, -1)); assert.equal(s.players[0].cash, 2440);
});
test('bank house supply cannot be exceeded', () => {
  const s = game(); own(s, [1, 3], 'p0', 4); own(s, [6, 8, 9, 11, 13, 14], 'p1', 4); own(s, [16, 18, 19]);
  assert.equal(G.stock(s).houses, 0); assert.throws(() => change(s, s => G.build(s, 16, 1)), /no building/);
});
test('mortgage pays principal and redemption charges principal plus interest', () => {
  let s = game(); own(s, [1, 3]); s = change(s, s => G.mortgage(s, 1)); assert.equal(s.players[0].cash, 2530); assert.equal(G.rent(s, s.spaces[1]), 0); assert.equal(G.rent(s, s.spaces[3]), 8);
  assert.throws(() => change(s, s => G.build(s, 3, 1)), /mortgages/);
  s = change(s, s => G.mortgage(s, 1)); assert.equal(s.players[0].cash, 2497);
});
test('railroad count includes mortgaged holdings, utility uses dice multiplier', () => {
  const s = game(); own(s, [5, 15, 12, 28]); s.spaces[15].mortgaged = true;
  assert.equal(G.rent(s, s.spaces[5]), 50); assert.equal(G.rent(s, s.spaces[12], 9), 90);
});
test('trade exchanges cash and deeds atomically and blocks developed groups', () => {
  let s = game(); own(s, [1, 3]); own(s, [5], 'p1'); s = change(s, s => G.trade(s, 'p0', 'p1', [1], [5], 150, 25));
  assert.equal(s.players[0].cash, 2375); assert.equal(s.players[1].cash, 2625); assert.equal(s.spaces[5].owner, 'p0');
  const b = game(); own(b, [1, 3], 'p0', 1); assert.throws(() => change(b, s => G.trade(s, 'p0', 'p1', [3], [], 0, 0)), /buildings/);
});
test('transferred mortgage supports immediate redemption and later interest', () => {
  let s = game(); own(s, [1]); s.spaces[1].mortgaged = true;
  s = change(s, s => G.trade(s, 'p0', 'p1', [1], [], 0, 0, [1])); assert.equal(s.debts[0].amount, 33);
  s = change(s, s => G.settle(s)); assert.equal(s.spaces[1].mortgaged, false); assert.equal(s.players[1].cash, 2467);
});
test('zero cash is not bankruptcy; liquidatable assets prevent premature bankruptcy', () => {
  let s = game(); s.players[0].cash = 0; own(s, [1]); assert.throws(() => change(s, s => G.bankrupt(s, 'p0', 'bank')), /Record/);
  s = change(s, s => G.owe(s, 'p0', 'bank', 20, 'Tax')); assert.throws(() => change(s, s => G.bankrupt(s, 'p0', 'bank')), /cover the bill/);
  s = change(s, s => G.mortgage(s, 1)); s = change(s, s => G.settle(s)); assert.equal(s.players[0].cash, 10); assert.equal(s.players[0].bankrupt, false);
});
test('player bankruptcy sells buildings, passes deeds and cash, skips turn, charges inherited interest', () => {
  let s = game(); own(s, [1, 3], 'p0', 1); own(s, [5]); s.spaces[5].mortgaged = true; s.players[0].cash = 5; s.phase = 'classic-first-stop'; s.roll = {d1:1,d2:2,speed:'Property Finder'}; s.extraTurn = true;
  s = change(s, s => G.owe(s, 'p0', 'p1', 1000, 'Rent', {kind:'landing'}));
  s = change(s, s => G.bankrupt(s, 'p0', 'p1')); assert.equal(s.players[1].cash, 2555); assert.equal(s.spaces[1].owner, 'p1'); assert.equal(s.spaces[1].buildings, 0); assert.equal(s.debts[0].amount, 10); assert.equal(s.currentPlayer, 1); assert.equal(s.phase, 'ready'); assert.equal(s.extraTurn, false);
});
test('bank bankruptcy clears mortgages and auctions all deeds before resuming', () => {
  let s = game(); own(s, [1, 5]); s.spaces[5].mortgaged = true; s.players[0].cash = 0;
  s = change(s, s => G.owe(s, 'p0', 'bank', 500, 'Tax')); s = change(s, s => G.bankrupt(s, 'p0', 'bank'));
  assert.deepEqual(s.auctions, [1, 5]); assert.equal(s.spaces[5].mortgaged, false);
  s = change(s, s => G.buy(s, 1, 'p2', 10)); assert.deepEqual(s.auctions, [5]); assert.equal(s.players[2].cash, 2490);
});
test('inherited fees can trigger another bankruptcy without orphaned deeds', () => {
  let s = game(); own(s, [5]); s.spaces[5].mortgaged = true; s.players[0].cash = s.players[1].cash = 0;
  s = change(s, s => G.owe(s, 'p0', 'p1', 10, 'Rent')); s = change(s, s => G.bankrupt(s, 'p0', 'p1'));
  s = change(s, s => G.bankrupt(s, 'p1', 'bank')); assert.equal(G.active(s).length, 1); assert.equal(s.currentPlayer, 2); assert.deepEqual(s.auctions, []); assert.equal(s.winnerId, 'p2');
});
test('pending debt survives JSON round trip and settlement is not duplicated', () => {
  let s = change(game(), s => G.owe(s, 'p0', 'p1', 80, 'Rent', {kind:'landing'})); s = JSON.parse(JSON.stringify(s)); G.validate(s);
  s = change(s, s => G.settle(s)); assert.equal(s.players[0].cash, 2420); assert.equal(s.players[1].cash, 2580); assert.throws(() => change(s, s => G.settle(s)), /No payment/);
});
test('helper mode records building purchases without altering cash', () => {
  let s = game(); s.moneyMode = 'helper'; own(s, [1, 3]); s = change(s, s => G.build(s, 1, 1)); assert.equal(s.players[0].cash, 2500); assert.equal(s.spaces[1].buildings, 1); assert.match(s.ledger[0].message, /physical money/);
});
test('invalid imports reject bad tokens, money, owners and resumed actions', () => {
  for (const corrupt of [s => {s.players[0].token = 'https://invalid.example/evil.png'}, s => {s.players[0].cash = -1}, s => {s.phase = 'bus'; s.roll = null}, s => {s.spaces[1].owner = 'missing'}, s => {s.debts = [{from:'p0',to:'bank',amount:2,reason:'bad',resume:{kind:'execute'}}]}]) {
    const s = game(); corrupt(s); assert.throws(() => G.validate(s));
  }
});

test('both decks preserve all 16 cards across draws, holds, use and reload',()=>{
  const s=game();G.initDecks(s,()=>.5);s.phase='landed';s.players[0].position=7;
  for(const deck of ['chance','chest']){
    const keep=G.cardDecks[deck].findIndex(c=>c.type==='keep');s.decks[deck]=[keep,...s.decks[deck].filter(i=>i!==keep)];G.drawCard(s,deck);G.applyCard(s);G.validate(s);
    assert.equal(s.decks[deck].length,15);G.useHeldCard(s,'p0');assert.equal(s.decks[deck].at(-1),keep);G.validate(s);
  }
});
test('backward card chains into chest without GO; forward GO card preserves Classic continuation',()=>{
  const s=game();s.phase='classic-first-stop';s.roll={d1:3,d2:4,speed:'Property Finder'};s.players[0].position=36;
  s.pendingCard={physical:true,deck:'chance',effect:{type:'back',amount:3}};G.applyCard(s);assert.equal(s.players[0].position,33);assert.equal(s.bankLandingResolved,false);assert.equal(s.players[0].cash,2500);
  s.pendingCard={physical:true,deck:'chest',effect:{type:'move',target:0}};G.applyCard(s);assert.equal(s.players[0].cash,2700);assert.equal(s.phase,'classic-first-stop');G.validate(s);
});
test('nearest railroad doubles rent; utility uses a fresh white-dice roll; mortgages waive rent',()=>{
  for(const type of ['railroad','utility']){
    const s=game();s.phase='landed';s.players[0].position=7;s.roll={d1:1,d2:1,speed:3};const dest=type==='railroad'?15:12;own(s,[dest],'p1');
    s.pendingCard={physical:true,deck:'chance',effect:{type}};G.applyCard(s,()=>4);assert.equal(s.landingBill.amount,type==='railroad'?50:80);G.validate(s);
    s.players[0].position=7;s.landingBill=null;s.spaces[dest].mortgaged=true;s.pendingCard={physical:true,deck:'chance',effect:{type}};G.applyCard(s,()=>{throw Error('Should not roll');});assert.equal(s.landingBill.amount,0);
  }
});
test('repairs count hotels once and payments to each player queue in order',()=>{
  const s=game();own(s,[1,3],'p0',5);s.pendingCard={physical:true,deck:'chest',effect:{type:'repairs',house:40,hotel:115}};G.applyCard(s);assert.equal(s.debts[0].amount,230);G.settle(s);
  s.pendingCard={physical:true,deck:'chance',effect:{type:'pay-each',amount:50}};G.applyCard(s);assert.deepEqual(s.debts.map(d=>d.to),['p1','p2']);G.validate(s);
});
test('auction permits original player, skips leader, rejects excess cash and awards atomically',()=>{
  const s=game();G.startAuction(s,1);assert.equal(s.auction.turn,'p0');G.auctionTurn(s,100);assert.equal(s.auction.turn,'p1');
  assert.throws(()=>G.run(s,s=>G.auctionTurn(s,3000)),/cash/);G.auctionTurn(s,110);G.auctionTurn(s,null);assert.equal(s.auction.turn,'p0');G.auctionTurn(s,null);
  assert.equal(s.auction,null);assert.equal(s.spaces[1].owner,'p1');assert.equal(s.players[1].cash,2390);G.validate(s);
});
test('everyone passing clears bankruptcy auction and resolves landed property with no purchase',()=>{
  const s=game();s.players[0].position=1;s.auctions=[1];G.startAuction(s,1);for(let i=0;i<3;i++)G.auctionTurn(s,null);
  assert.equal(s.auction,null);assert.deepEqual(s.auctions,[]);assert.equal(s.spaces[1].owner,null);assert.equal(s.bankLandingResolved,true);G.validate(s);
});
test('held digital cards transfer to a creditor or return to bank deck on bankruptcy',()=>{
  for(const creditor of ['bank','p1']){const s=game();G.initDecks(s);const id=7;s.decks.chance=s.decks.chance.filter(i=>i!==id);s.heldCards=[{owner:'p0',deck:'chance',id,physical:false}];s.players[0].cash=0;G.owe(s,'p0',creditor,500,'Bill');G.bankrupt(s,'p0',creditor);assert.equal(s.heldCards.length,creditor==='bank'?0:1);if(creditor==='bank')assert.equal(s.decks.chance.at(-1),id);else assert.equal(s.heldCards[0].owner,'p1');G.validate(s);}
});
test('every supplied card effect produces a valid game state',()=>{
  for(const [deck,cards] of Object.entries(G.cardDecks)) for(const [id] of cards.entries()) {
    const s=game(8);G.initDecks(s);s.phase='landed';s.players[0].position=deck==='chance'?36:33;s.roll={d1:1,d2:2,speed:1};s.decks[deck]=[id,...s.decks[deck].filter(i=>i!==id)];G.drawCard(s,deck);G.applyCard(s,()=>3);G.validate(s);while(s.debts.length)G.settle(s);G.validate(s);
  }
});

test('save validation rejects duplicate decks, altered digital effects and malformed auctions',()=>{
  const s=game();G.initDecks(s);s.phase='landed';s.players[0].position=7;G.drawCard(s,'chance');G.validate(s);
  let bad=structuredClone(s);bad.pendingCard.effect.type='collect';bad.pendingCard.effect.amount=100000;assert.throws(()=>G.validate(bad),/match/);
  bad=structuredClone(s);bad.decks.chance.push(bad.decks.chance[0]);assert.throws(()=>G.validate(bad),/duplicated/);
  bad=game();G.startAuction(bad,1);bad.auction.remaining.push('p0');assert.throws(()=>G.validate(bad),/participants/);
});
test('net worth values deeds buildings and mortgages without changing cash',()=>{
 const s=game();const id=s.players[0].id,start=s.players[0].cash;
 assert.equal(G.netWorth(s,id),start);G.buy(s,1,id);assert.equal(G.netWorth(s,id),start);
 G.buy(s,3,id);G.build(s,1,1);assert.equal(G.netWorth(s,id),start);
 G.build(s,1,-1);assert.equal(G.netWorth(s,id),start-25);
 G.mortgage(s,1);assert.equal(G.netWorth(s,id),start-25);
});
test('net worth counts a pending landing bill once and becomes zero after bankruptcy',()=>{
 const s=game();const id=s.players[0].id;s.spaces[1].owner=s.players[1].id;s.players[0].position=1;s.phase='landed';G.captureLanding(s);
 assert.equal(G.netWorth(s,id),s.players[0].cash-2);G.owe(s,id,s.players[1].id,2,s.landingBill.reason,{kind:'landing'});assert.equal(G.netWorth(s,id),s.players[0].cash-2);
 s.players[0].cash=0;G.bankrupt(s,id,s.players[1].id);assert.equal(G.netWorth(s,id),0);
});
test('net worth does not count a mortgage twice while its redemption is pending',()=>{
 const s=game();const id=s.players[0].id;s.spaces[1].owner=id;s.spaces[1].mortgaged=true;
 G.owe(s,id,'bank',33,'Mortgage transfer',{kind:'unmortgage',index:1});
 const before=G.netWorth(s,id);assert.equal(before,s.players[0].cash+27);G.settle(s);assert.equal(G.netWorth(s,id),before);
});
