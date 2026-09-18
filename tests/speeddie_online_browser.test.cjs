const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const game=require('./speeddie_fixture.cjs');
const base=process.env.SPEEDDIE_TEST_URL||'http://127.0.0.1:8767';
test('two devices: approval, mixed seats, trade consent, turns, disconnect and reconnect',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844}});
 const host=await a.newPage(),mom=await b.newPage();const errors=[];
 for(const p of [host,mom]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base+'/speeddie/');}
 await host.evaluate(s=>{state=s;saveState();render();},game());
 await host.evaluate(()=>hostOnline());await host.locator('.online-status').waitFor();
 const code=await host.evaluate(()=>onlineSession.code);
 await mom.locator('.online-launch summary').click();await mom.locator('[data-action="online-join"]').click();
 await mom.locator('#online-code').fill(code);await mom.locator('#online-name').fill('Mom phone');
 await mom.getByRole('button',{name:'Ask to join'}).click();await mom.getByText('Waiting for host approval.').waitFor();
 await host.evaluate(()=>refreshOnline());await host.locator('[data-online="room-settings"]').click();
 const member=host.locator('.online-property').filter({has:host.getByRole('heading',{name:'Mom phone',exact:true})});
 await member.locator('input[value="p1"]').check();await member.getByRole('button').click();await host.waitForFunction(()=>onlineRoom.me.seats.length===2);
 await mom.evaluate(()=>refreshOnline());assert.deepEqual(await mom.evaluate(()=>onlineRoom.me.seats),['p1']);
 assert.deepEqual(await host.evaluate(()=>onlineRoom.me.seats),['p0','p2']);
 await mom.locator('[data-online="profile"]').click();
 await mom.locator('#lobby-name').fill('Mama');await mom.locator('#lobby-color').fill('#123abc');await mom.locator('#lobby-token').selectOption({label:'🐎'});
 await mom.getByRole('button',{name:'Save player',exact:true}).click();await mom.waitForFunction(()=>!onlineBusy&&state.players[1].name==='Mama');
 await host.evaluate(()=>refreshOnline());assert.equal(await host.evaluate(()=>state.players[1].token),'🐎');
 await mom.locator('[data-online="profile"]').click();
 await mom.locator('#lobby-photo').setInputFiles({name:'token.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await mom.getByRole('button',{name:'Save player',exact:true}).click();await mom.waitForFunction(()=>!onlineBusy&&state.players[1].token.startsWith('data:image/'));
 await mom.reload();await mom.locator('.online-launch summary').click();await mom.locator('[data-action="online-reconnect"]').click();await mom.locator('[data-online="profile"]').waitFor();
 assert.equal(await mom.evaluate(()=>state.players[1].name),'Mama');assert.match(await mom.evaluate(()=>state.players[1].token),/^data:image\//);
 await host.evaluate(()=>lobbyCommand({action:'ready',players:['p0','p2']}));
 await mom.evaluate(()=>lobbyCommand({action:'ready',players:['p1']}));
 await host.evaluate(()=>refreshOnline());await host.locator('[data-online="start-game"]').click();await host.waitForFunction(()=>!onlineBusy&&!onlineRoom.lobby);
 await host.locator('details.panel summary').click();await host.locator('[data-online="trade-open"][data-value="p0"]').click();
 await host.locator('#online-cash-a').fill('100');await host.getByRole('button',{name:'Send proposal'}).click();
 await mom.evaluate(()=>refreshOnline());await mom.locator('[data-online="trade-accept"]').click();await mom.waitForFunction(()=>!onlineBusy&&!state.tradeOffer);
 await host.evaluate(()=>refreshOnline());assert.equal(await host.evaluate(()=>state.players[0].cash),2400);
 // Exercise the actual UI decisions until Mom's turn, including doubles/cards/auctions.
 for(let n=0;n<60;n++){
  if(await host.evaluate(()=>state.currentPlayer===1&&state.phase==='ready'))break;
  const button=host.locator('.online-actions [data-online]').first();await button.waitFor();await button.click();
  await host.waitForFunction(()=>!onlineBusy);await host.evaluate(()=>refreshOnline());
 }
 assert.equal(await host.evaluate(()=>state.currentPlayer),1);
 await mom.evaluate(()=>refreshOnline());await mom.locator('[data-online="roll"]').waitFor();
 // Drop the response after the server commits. Retry must not roll twice.
 await mom.route('**/actions',async route=>{await route.fetch();await route.abort();},{times:1});
 await mom.locator('[data-online="roll"]').click();await mom.waitForFunction(()=>onlinePending&&!onlineBusy);
 const rev=await host.evaluate(async()=>{await refreshOnline();return onlineRoom.revision;});
 await mom.evaluate(()=>refreshOnline());await mom.locator('[data-online="retry"]').click();await mom.waitForFunction(()=>!onlinePending&&!onlineBusy);
 assert.equal(await mom.evaluate(()=>onlineRoom.revision),rev);
 await mom.reload();await mom.locator('.online-launch summary').click();await mom.locator('[data-action="online-reconnect"]').click();
 await mom.locator('.online-status').waitFor();assert.deepEqual(await mom.evaluate(()=>onlineRoom.me.seats),['p1']);
 assert.equal(await mom.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('shared auction follows bidder seats across devices',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const host=await (await browser.newContext()).newPage(),mom=await (await browser.newContext()).newPage();
 for(const p of [host,mom]){p.on('dialog',d=>d.accept());await p.goto(base+'/speeddie/');}
 const s=game();s.phase='landed';s.players[0].position=1;
 await host.evaluate(async s=>{state=s;saveState();await hostOnline();},s);
 const code=await host.evaluate(()=>onlineSession.code);
 await mom.evaluate(async code=>{const result=await roomRequest(`/rooms/${code}/join`,{name:'Mom'},null);enterOnline({code,token:result.token},result.room);},code);
 const id=await mom.evaluate(()=>onlineRoom.me.id);
 await host.evaluate(async id=>{const r=await roomRequest(`/rooms/${onlineSession.code}/members`,{member:id,seats:['p1']});onlineRoom=r.room;render();},id);
 await mom.evaluate(()=>refreshOnline());
 await host.locator('[data-online="auction-start"]').click();await host.waitForFunction(()=>!onlineBusy&&state.auction);
 await host.locator('#online-bid').fill('20');await host.locator('[data-online="auction-bid"]').click();await host.waitForFunction(()=>!onlineBusy&&state.auction.turn==='p1');
 await mom.evaluate(()=>refreshOnline());await mom.locator('#online-bid').fill('30');await mom.locator('[data-online="auction-bid"]').click();await mom.waitForFunction(()=>!onlineBusy&&state.auction.turn==='p2');
 await host.evaluate(()=>refreshOnline());await host.locator('[data-online="auction-pass"]').click();await host.waitForFunction(()=>!onlineBusy&&state.auction.turn==='p0');
 await host.locator('[data-online="auction-pass"]').click();await host.waitForFunction(()=>!onlineBusy&&!state.auction);
 await mom.evaluate(()=>refreshOnline());assert.equal(await mom.evaluate(()=>state.spaces[1].owner),'p1');assert.equal(await mom.evaluate(()=>state.players[1].cash),2470);
 }finally{await browser.close();}
});
test('family pause, reactions, mute and bedtime readiness work across devices',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const host=await (await browser.newContext()).newPage();host.on('dialog',d=>d.accept());await host.goto(base+'/speeddie/');
 await host.evaluate(async s=>{state=s;saveState();await hostOnline();},game());
 await host.locator('#bedtime-minutes').selectOption('30');await host.locator('[data-online="bedtime"]').click();await host.waitForFunction(()=>!onlineBusy&&onlineRoom.bedtimeMinutes===30);
 await host.evaluate(()=>lobbyCommand({action:'ready',players:onlineRoom.me.seats}));await host.locator('[data-online="start-game"]').click();await host.waitForFunction(()=>!onlineBusy&&!onlineRoom.lobby);
 await host.locator('[data-online="family-pause"]').click();await host.waitForFunction(()=>onlineRoom.pausedAt);assert.equal(await host.locator('[data-online="roll"]').count(),0);
 await host.locator('[data-online="family-resume"]').click();await host.waitForFunction(()=>!onlineRoom.pausedAt);await host.locator('[data-online="roll"]').waitFor();
 await host.locator('[data-online="reaction"]').first().click();await host.getByRole('status').waitFor();
 await host.locator('[data-online="mute-reactions"]').click();assert.equal(await host.getByRole('status').count(),0);
 await host.locator('[data-online="chime"]').click();assert.equal(await host.evaluate(()=>familyPreferences.chime),true);
 assert.equal(await host.evaluate(()=>onlineRoom.deadline>Date.now()/1000),true);
 }finally{await browser.close();}
});
