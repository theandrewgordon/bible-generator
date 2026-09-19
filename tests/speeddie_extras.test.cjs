const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const G=require('../speeddie/rules.js'),E=require('../speeddie/engine.js'),game=require('./speeddie_fixture.cjs');
const context=vm.createContext({G,GROUP_COLORS:{Brown:'#955'},structuredClone,money:n=>'$'+n,escapeHTML:s=>String(s),tokenMarkup:p=>p.token,localStorage:{getItem:()=>null}});
vm.runInContext(fs.readFileSync(require.resolve('../speeddie/extras.js'),'utf8'),context);
test('build preview gives real resulting cash and rent without spending money',()=>{
 const s=game();s.spaces[1].owner=s.spaces[3].owner='p0';const before=structuredClone(s);
 assert.match(context.previewBuild(s,s.spaces[1]),/Costs \$50 · leaves \$2450 · rent becomes \$10/);assert.deepEqual(s,before);
});
test('rescue options only offer legal cash raising actions',()=>{
 const s=game();s.spaces[1].owner='p0';const before=structuredClone(s);
 assert.match(context.rescueOptions(s,'p0'),/Mortgage Mediterranean Avenue · \+\$30/);assert.deepEqual(s,before);
 s.spaces[1].mortgaged=true;assert.doesNotMatch(context.rescueOptions(s,'p0'),/Mortgage Mediterranean/);
});
test('GO and rolls track actual play and survive bankruptcy',()=>{
 const s=game(2);s.players[0].position=39;
 const rolled=E.command(s,'roll',{},['p0'],{die:()=>1});assert.equal(rolled.players[0].familyStats.go,1);assert.equal(rolled.players[0].familyStats.rolls,1);
 rolled.players[0].cash=0;G.owe(rolled,'p0','p1',10000,'Rent');const end=E.command(rolled,'bankrupt',{},['p0']);
 assert.match(context.familyAwards(end),/Most GO collections: Tessa/);assert.match(context.familyAwards(end),/thanks for playing/);
});
test('auction awards record purchases rather than unsuccessful bids',()=>{
 const s=game(2);G.startAuction(s,1);G.auctionTurn(s,100);G.auctionTurn(s,null);
 assert.equal(s.players[0].familyStats.auction,100);assert.match(context.familyAwards(s),/Biggest auction purchase: Tessa · \$100/);
});

test('collections name the missing deed owner and destination previews match rent',()=>{
 const s=game();s.spaces[1].owner='p0';s.spaces[3].owner='p1';
 assert.match(context.collectionTracker(s,s.players[0]),/Brown · 1 of 2/);
 assert.match(context.collectionTracker(s,s.players[0]),/Baltic Avenue: Mom/);
 assert.equal(context.destinationPreview(s,3),'Pay Mom $4');
 s.spaces[3].mortgaged=true;assert.equal(context.destinationPreview(s,3),'Mortgaged · no rent');
 assert.match(context.destinationPreview(s,7),/effect is unknown/);
});
test('bulk sale confirmation uses actual building costs',()=>{
 const s=game();s.spaces[1].owner=s.spaces[3].owner='p0';
 s.spaces[1].buildings=1;s.spaces[1].buildingCosts=[71];
 s.spaces[3].buildings=1;s.spaces[3].buildingCosts=[50];
 assert.match(context.bigSaleConfirmation(s,1),/2 house\(s\).*\$60/);
});
test('reconnect summary reports new events and the correct next actor',()=>{
 const s=game();s.ledger=[{message:'Mom bought Boardwalk.',time:'new'},{message:'Earlier move',time:'old'}];
 const room={state:s,me:{name:'Tablet',seats:['p0']}};
 assert.match(context.welcomeBack({lastEvent:'old|Earlier move'},room),/Mom bought Boardwalk.*You are next to act/);
});
test('rent explanation is frozen with the bill before buildings change',()=>{
 const s=game();s.spaces[1].owner=s.spaces[3].owner='p1';s.players[0].position=1;s.phase='landed';G.captureLanding(s);
 assert.match(s.landingBill.explanation,/all 2 Brown properties/);G.build(s,1,1);
 G.transfer(s,'p0','p1',s.landingBill.amount,s.landingBill.reason);
 assert.match(s.ledger[0].explanation,/unimproved rent is doubled/);
});
test('trade preview and accepted property/cash exchange have the same net worth',()=>{
 const s=game();s.spaces[1].owner='p0';s.spaces[5].owner='p1';const original=structuredClone(s);
 const offer={a:'p0',b:'p1',fromA:[1],fromB:[5],cashA:50,cashB:0};
 const preview=context.projectTrade(s,offer);assert.deepEqual(s,original);
 assert.equal(G.netWorth(preview,'p0'),2650);assert.equal(G.netWorth(preview,'p1'),2610);
 G.trade(s,'p0','p1',[1],[5],50,0);assert.equal(G.netWorth(s,'p0'),G.netWorth(preview,'p0'));assert.equal(G.netWorth(s,'p1'),G.netWorth(preview,'p1'));
});
test('trade net worth preview includes mortgage fees and optional redemption once',()=>{
 for(const lift of [[],[5]]){
  const s=game();s.spaces[1].owner='p0';s.spaces[5].owner='p1';s.spaces[5].mortgaged=true;
  const offer={a:'p0',b:'p1',fromA:[1],fromB:[5],cashA:50,cashB:0};
  const preview=context.projectTrade(s,offer,lift);assert.equal(G.netWorth(preview,'p0'),2540);
  G.trade(s,'p0','p1',[1],[5],50,0,lift);G.settle(s);assert.equal(G.netWorth(s,'p0'),2540);assert.equal(G.netWorth(s,'p1'),2610);
 }
});

test('building choices exclude incomplete, mortgaged, uneven and unaffordable purchases without mutating state',()=>{
 const s=game(),choices=()=>Array.from(context.buildableProperties(s,'p0'),q=>q.index);
 s.spaces[1].owner='p0';s.spaces[6].owner='p0';assert.deepEqual(choices(),[]);
 s.spaces[3].owner='p0';const before=structuredClone(s);assert.deepEqual(choices(),[1,3]);assert.deepEqual(s,before);
 G.build(s,1,1);assert.deepEqual(choices(),[3]);
 s.spaces[3].mortgaged=true;assert.deepEqual(choices(),[]);s.spaces[3].mortgaged=false;
 s.players[0].cash=49;assert.deepEqual(choices(),[]);s.players[0].cash=50;assert.deepEqual(choices(),[3]);
 s.pendingCard={};assert.deepEqual(choices(),[]);s.pendingCard=null;s.tradeOffer={};assert.deepEqual(choices(),[]);
});
