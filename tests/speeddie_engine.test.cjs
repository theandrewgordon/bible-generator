const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../speeddie/engine.js'),G=require('../speeddie/rules.js'),game=require('./speeddie_fixture.cjs');
test('Streets Property Finder falls back to white dice when all deeds belong to player',()=>{
 const s=game();s.mode='streets';s.activation='immediate';s.spaces.filter(q=>['property','railroad','utility'].includes(q.type)).forEach(q=>q.owner='p0');
 const next=E.command(s,'roll',{},['p0'],{die:()=>2,random:()=>.8});
 assert.equal(next.players[0].position,4);assert.equal(next.phase,'landed');assert.equal(next.landingBill.amount,200);
});
test('Classic second stop stays put when no finder destination exists',()=>{
 const s=game();s.spaces.filter(q=>['property','railroad','utility'].includes(q.type)).forEach(q=>q.owner='p0');s.phase='classic-first-stop';s.bankLandingResolved=true;s.players[0].position=6;
 const next=E.command(s,'finder',{},['p0']);assert.equal(next.players[0].position,6);assert.equal(next.phase,'landed');
});
test('shared engine bankruptcy transfers deeds and declares survivor winner',()=>{
 const s=game(2);s.players[0].cash=0;s.spaces[1].owner='p0';G.owe(s,'p0','p1',10000,'Rent',{kind:'landing'});
 const next=E.command(s,'bankrupt',{},['p0']);assert.equal(next.winnerId,'p1');assert.equal(next.spaces[1].owner,'p1');assert.equal(next.players[0].bankrupt,true);
});
