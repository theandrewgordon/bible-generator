const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const G=require('../speeddie/rules.js'),E=require('../speeddie/engine.js'),game=require('./speeddie_fixture.cjs');
const context=vm.createContext({G,structuredClone,money:n=>'$'+n,escapeHTML:s=>String(s),tokenMarkup:p=>p.token,localStorage:{getItem:()=>null}});
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
