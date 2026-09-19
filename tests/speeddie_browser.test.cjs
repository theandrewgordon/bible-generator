// Run with Node's test runner and Playwright available in NODE_PATH.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let browser, server, url, baseline;
const errors = [];
before(async () => {
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://local').pathname.split('/').pop() || 'index.html';
    if (!['index.html', 'app.js', 'rules.js', 'companion.js', 'family.js', 'board.js', 'engine.js', 'online.js','extras.js','token-editor.js', 'style.css'].includes(name)) {res.writeHead(404); return res.end();}
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, '../speeddie', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: process.env.SPEEDDIE_BROWSER || 'chrome', headless: true });
});
after(async () => { await browser?.close(); server?.close(); assert.deepEqual(errors, [], 'No browser exceptions'); });
async function page() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', async d => { if (d.type() === 'alert') errors.push(d.message()); await d.accept(); });
  await p.goto(url + '?selftest=1');
  await p.waitForFunction(() => saveWriterReady);
  if (baseline) await p.evaluate(data => { state = structuredClone(data); undoState = null; saveState(true); render(); }, baseline);
  return p;
}
const click = async (p, action) => {
  if (['payment','history'].includes(action) && !await p.locator(`#app [data-action="${action}"]`).count()) { await p.locator('#app [data-action="bank-menu"]').click(); return p.locator(`#companion-dialog [data-action="${action}"]`).click(); }
  return p.locator(`#app [data-action="${action}"]`).first().click();
};
const submit = p => p.locator('#companion-form button[type="submit"]').click();

test('eight-player setup, local image, export, reload, and narrow-screen layout', async () => {
  const p = await page(); await p.selectOption('#player-count', '8');
  for (let i=0;i<8;i++) await p.locator('.setup-name').nth(i).fill(`Player ${i + 1}`);
  await p.selectOption('[name="money-mode"]', 'banker');
  await p.locator('.setup-image').first().setInputFiles({name:'lego.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')});
  await p.locator('#setup-form button[type="submit"]').click(); await p.waitForSelector('#roll-button');
  baseline = await p.evaluate(() => snapshotState(state)); assert.equal(baseline.players.length, 8); assert.match(baseline.players[0].token, /^data:image\/png/);
  assert.equal(await p.locator('.player-row').count(), 8);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await p.evaluate(() => {const row=document.querySelector('.player-row'); return row.querySelector('.small-token').getBoundingClientRect().right <= row.querySelector('.player-summary').getBoundingClientRect().left}), true);
  await p.reload(); assert.equal(await p.locator('.player-row').count(), 8); await p.waitForSelector('.player-token img');
  await p.locator('#game-menu-button').click(); const download = p.waitForEvent('download'); await p.locator('#export-button').click();
  const file = await download; const json = JSON.parse(fs.readFileSync(await file.path(), 'utf8')); assert.equal(json.players[0].token, baseline.players[0].token);
  await p.close();
});

test('build, sell, and undo restore cash and buildings together', async () => {
  const p = await page(); await p.evaluate(() => { [1,3].forEach(i => state.spaces[i].owner=state.players[0].id); saveState(); render(); });
  await click(p, 'properties'); await p.locator('#companion-dialog [data-action="build"][data-value="1"]').click();
  assert.deepEqual(await p.evaluate(() => [state.spaces[1].buildings,state.players[0].cash]), [1,2450]);
  await p.locator('#close-companion').click(); await click(p,'undo'); assert.deepEqual(await p.evaluate(() => [state.spaces[1].buildings,state.players[0].cash]),[0,2500]);
  await p.close();
});

test('ordinary rent pays once and blocks turn until resolved', async () => {
  const p = await page(); await p.evaluate(() => { state.spaces[1].owner=state.players[1].id; state.players[0].position=1; state.phase='landed'; state.bankLandingResolved=false; saveState(); render(); });
  assert.equal(await p.locator('#end-turn-button').isDisabled(),true); await click(p,'landing-pay');
  assert.deepEqual(await p.evaluate(() => state.players.slice(0,2).map(p=>p.cash)), [2498,2502]);
  await p.reload(); assert.equal(await p.locator('[data-action="landing-pay"]').count(),0); await p.locator('#end-turn-button').click();
  assert.equal(await p.evaluate(()=>state.currentPlayer),1); await p.close();
});

test('unpaid rent survives reload; mortgage raises cash and resumes the turn', async () => {
  const p=await page(); await p.evaluate(()=>{state.players[0].cash=0;state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.spaces[5].owner=state.players[0].id;state.phase='landed';saveState();render();});
  await click(p,'landing-pay'); await p.reload(); assert.equal(await p.locator('.debt-panel').count(),1);
  await p.locator('.debt-panel [data-action="properties"]').click(); await p.locator('#companion-dialog [data-action="mortgage"][data-value="5"]').click(); await p.locator('#close-companion').click();
  await click(p,'settle'); assert.equal(await p.evaluate(()=>state.players[0].cash),98); assert.equal(await p.locator('#end-turn-button').isEnabled(),true); await p.close();
});

test('bankruptcy at Classic first stop cancels finder move and transfers estate',async()=>{
  const p=await page(); await p.evaluate(()=>{state.mode='classic';state.phase='classic-first-stop';state.roll={d1:1,d2:2,speed:'Property Finder',speedActive:true};state.players[0].position=39;state.players[0].cash=0;state.spaces[39].owner=state.players[1].id;state.spaces[1].owner=state.players[0].id;state.spaces[1].mortgaged=true;saveState();render();});
  await click(p,'landing-pay'); await p.locator('.debt-panel [data-action="bankruptcy"]').click(); await submit(p);
  assert.deepEqual(await p.evaluate(()=>[state.currentPlayer,state.phase,state.roll,state.players[0].bankrupt,state.spaces[1].owner===state.players[1].id]),[1,'ready',null,true,true]);
  assert.equal(await p.evaluate(()=>state.debts[0].amount),3); await click(p,'settle'); assert.equal(await p.locator('#roll-button').count(),1); await p.close();
});

test('bank bankruptcy queues an auction, auction debits winner and clears queue',async()=>{
  const p=await page(); await p.evaluate(()=>{state.players[0].cash=0;state.spaces[1].owner=state.players[0].id;state.spaces[1].mortgaged=true;G.owe(state,state.players[0].id,'bank',500,'Tax');saveState();render();});
  await p.locator('.debt-panel [data-action="bankruptcy"]').click();await submit(p);await click(p,'auction');await p.locator('#companion-dialog summary').click();await p.locator('#auction-price').fill('25');await submit(p);
  assert.deepEqual(await p.evaluate(()=>[state.auctions.length,state.spaces[1].mortgaged,state.players[1].cash]),[0,false,2475]);await p.close();
});

test('third jail roll waits for payment, then moves once and undo restores debt',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=10;state.players[0].inJail=true;state.players[0].jailAttempts=2;let n=0;randomDie=()=>[1,2][n++];saveState();render();});
  await p.locator('#try-jail-doubles').click();assert.equal(await p.evaluate(()=>state.players[0].position),10);await p.reload();await click(p,'settle');
  assert.deepEqual(await p.evaluate(()=>[state.players[0].position,state.players[0].cash,state.players[0].inJail]),[13,2450,false]);await click(p,'undo');
  assert.deepEqual(await p.evaluate(()=>[state.players[0].position,state.players[0].cash,state.debts.length]),[10,2500,1]);await p.close();
});

test('cash trade and mortgage transfer settle correctly through the dialog',async()=>{
  const p=await page();await p.evaluate(()=>{state.spaces[1].owner=state.players[0].id;state.spaces[1].mortgaged=true;saveState();render();});
  await p.locator('#open-trade').click();await p.locator('#trade-properties-a input[value="1"]').check();await p.locator('#trade-cash-b').fill('100');await p.locator('#trade-lift').check();await p.locator('#complete-trade').click();
  assert.equal(await p.evaluate(()=>state.players[0].cash),2600);await click(p,'settle');assert.deepEqual(await p.evaluate(()=>[state.spaces[1].mortgaged,state.players[1].cash]),[false,2367]);await p.close();
});

test('legacy save migrates to helper; enabling banker uses entered balances',async()=>{
  const p=await page();await p.evaluate(()=>{const old=snapshotState(state);old.version=5;delete old.moneyMode;old.players.forEach(p=>{delete p.cash;delete p.token;delete p.bankrupt});old.spaces.forEach(p=>{delete p.buildings;delete p.buildingCosts;delete p.rents;delete p.price;delete p.mortgage;delete p.buildCost});old.spaces[1].name='LEGO Lane';old.spaces[1].owner=old.players[0].id;localStorage.setItem(STORAGE_KEY,JSON.stringify(old));});
  await p.reload();assert.equal(await p.evaluate(()=>state.moneyMode),'helper');assert.equal(await p.evaluate(()=>state.spaces[1].name),'LEGO Lane');
  await p.locator('#game-menu-button').click();await p.locator('#bank-settings').click();await p.locator('#money-mode').selectOption('banker');await p.locator('[id^="balance-"]').first().fill('1234');await submit(p);
  assert.deepEqual(await p.evaluate(()=>[state.moneyMode,state.players[0].cash]),['banker',1234]);await p.close();
});

test('Free Parking pot and GO salary are credited exactly once',async()=>{
  const p=await page();await p.evaluate(()=>{state.freeParkingRule='pot';state.freeParkingPot=175;state.players[0].position=20;state.phase='landed';saveState();render();});
  await click(p,'parking');await p.reload();assert.deepEqual(await p.evaluate(()=>[state.freeParkingPot,state.players[0].cash]),[0,2675]);
  await p.evaluate(()=>{state.players[0].position=39;completeMove(2,'Cross GO');});assert.equal(await p.evaluate(()=>state.players[0].cash),2875);await p.close();
});

test('custom photo can be replaced with a token and survives import',async()=>{
  const p=await page();await p.locator('.edit-player').first().click();await p.locator('#player-token').selectOption('🐎');await submit(p);assert.equal(await p.evaluate(()=>state.players[0].token),'🐎');
  const payload=await p.evaluate(()=>JSON.stringify(state));await p.locator('#game-menu-button').click();await p.locator('#import-input').setInputFiles({name:'game.json',mimeType:'application/json',buffer:Buffer.from(payload)});await p.waitForFunction(()=>!document.querySelector('#menu-dialog').open);assert.equal(await p.evaluate(()=>state.players[0].token),'🐎');await p.close();
});

test('helper bankruptcy works without a cash ledger and last survivor wins',async()=>{
  const p=await page();await p.evaluate(()=>{state.moneyMode='helper';state.players=state.players.slice(0,2);state.spaces[1].owner=state.players[0].id;saveState();render();});
  await p.locator('.edit-player').first().click();await p.locator('#companion-dialog [data-action="bankruptcy"]').click();
  await p.locator('#bankrupt-creditor').selectOption(await p.evaluate(()=>state.players[1].id));await submit(p);
  assert.match(await p.locator('.winner-panel').innerText(),/Player 2 wins/);assert.equal(await p.locator('#roll-button').count(),0);assert.equal(await p.locator('#open-trade').isDisabled(),true);await p.close();
});

test('triples and card moves to Jail do not collect GO salary',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=35;state.phase='triples';state.roll={d1:3,d2:3,speed:3,speedActive:true};saveState();render();});
  await p.locator('#triples-space').selectOption('30');await p.locator('#move-triples').click();assert.equal(await p.evaluate(()=>state.players[0].cash),2500);
  await p.evaluate(()=>{state.players[0].inJail=false;state.players[0].position=36;state.phase='landed';state.bankLandingResolved=false;saveState();render();});
  await click(p,'physical-card');await p.locator('#card-effect').selectOption('jail');await submit(p);await click(p,'apply-card');assert.equal(await p.evaluate(()=>state.players[0].cash),2500);assert.equal(await p.evaluate(()=>state.players[0].inJail),true);await p.close();
});

test('voluntary Jail payment uses configured fee and pot, then allows a normal roll',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=10;state.players[0].inJail=true;state.rules.jail=75;state.freeParkingRule='pot';saveState();render();});
  assert.match(await p.locator('#pay-jail').innerText(),/75/);await p.locator('#pay-jail').click();await click(p,'settle');assert.deepEqual(await p.evaluate(()=>[state.players[0].cash,state.freeParkingPot,state.players[0].inJail]),[2425,75,false]);assert.equal(await p.locator('#roll-button').count(),1);await p.close();
});

test('edition values update rent and image token can be changed after setup',async()=>{
  const p=await page();await p.evaluate(()=>{state.spaces[1].owner=state.players[0].id;saveState();render();});
  await click(p,'properties');await p.locator('#companion-dialog [data-action="property"]').click();await p.locator('.edition-details summary').click();await p.locator('#rent-0').fill('17');await submit(p);assert.equal(await p.evaluate(()=>G.rent(state,state.spaces[1])),17);
  await p.locator('.edit-player').nth(1).click();await p.locator('#player-image').setInputFiles({name:'piece.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});await submit(p);await p.waitForFunction(()=>state.players[1].token.startsWith('data:'));await p.reload();assert.match(await p.evaluate(()=>state.players[1].token),/^data:image\/png/);await p.close();
});

test('cash-only trade and physical card pay-everyone bill queue',async()=>{
  const p=await page();await p.locator('#open-trade').click();await p.locator('#trade-cash-a').fill('10');await p.locator('#complete-trade').click();assert.deepEqual(await p.evaluate(()=>state.players.slice(0,2).map(p=>p.cash)),[2490,2510]);
  await click(p,'payment');await p.locator('#payment-to').selectOption('everyone');await p.locator('#payment-amount').fill('5');await submit(p);assert.equal(await p.evaluate(()=>state.debts.length),0);assert.equal(await p.evaluate(()=>state.players[0].cash),2455);await p.close();
});

test('second tab is read-only, receives updates, then safely takes over the saved game', async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=1;state.phase='landed';state.landingResolved=false;saveState();render();});
  const q=await p.context().newPage();await q.goto(url);await q.waitForFunction(()=>document.querySelector('#app').inert);
  assert.equal(await q.evaluate(()=>saveWriterReady),false);
  await click(p,'buy');await q.waitForFunction(()=>state.spaces[1].owner!==null);
  assert.equal(await q.evaluate(()=>state.players[0].cash),2440);
  await p.close();await q.waitForFunction(()=>saveWriterReady);
  await q.locator('.edit-player').nth(1).click();await q.locator('#player-name').fill('Robert');await submit(q);await q.reload();await q.waitForFunction(()=>saveWriterReady);
  assert.deepEqual(await q.evaluate(()=>[state.players[0].cash,state.spaces[1].owner===state.players[0].id,state.players[1].name]),[2440,true,'Robert']);await q.close();
});

test('final survivor inherits a mortgage without an impossible payment; undo resumes game',async()=>{
  const p=await page();await p.evaluate(()=>{state.players=state.players.slice(0,2);state.players.forEach(p=>p.cash=0);state.spaces[5].owner=state.players[0].id;state.spaces[5].mortgaged=true;G.owe(state,state.players[0].id,state.players[1].id,50,'Chairman card');saveState();render();});
  await click(p,'bankruptcy');await submit(p);assert.equal(await p.locator('.winner-panel').count(),1);assert.equal(await p.evaluate(()=>state.debts.length),0);assert.equal(await p.locator('#app [data-action="bank-menu"]').isDisabled(),true);
  await p.reload();assert.equal(await p.locator('.winner-panel').count(),1);await click(p,'undo');assert.equal(await p.evaluate(()=>G.active(state).length),2);assert.equal(await p.locator('.debt-panel').count(),1);await p.close();
});

test('rent is frozen through building, reload, and a property trade before payment',async()=>{
  const p=await page();await p.evaluate(()=>{[1,3].forEach(i=>state.spaces[i].owner=state.players[1].id);state.players[0].position=1;state.phase='landed';saveState();render();});
  assert.equal(await p.locator('#landing-payment').inputValue(),'4');await click(p,'properties');await p.locator('#manage-player').selectOption(await p.evaluate(()=>state.players[1].id));await p.locator('#companion-dialog [data-action="build"][data-value="1"]').click();await p.locator('#close-companion').click();await p.reload();assert.equal(await p.locator('#landing-payment').inputValue(),'4');
  await click(p,'landing-pay');assert.equal(await p.evaluate(()=>state.players[0].cash),2496);await p.close();
});

test('mortgaging or trading a landed-on property cannot erase or redirect its rent',async()=>{
  const p=await page();await p.evaluate(()=>{state.spaces[1].owner=state.players[1].id;state.players[0].position=1;state.phase='landed';saveState();render();});
  await click(p,'properties');await p.locator('#manage-player').selectOption(await p.evaluate(()=>state.players[1].id));await p.locator('#companion-dialog [data-action="mortgage"][data-value="1"]').click();await p.locator('#close-companion').click();assert.equal(await p.locator('#landing-payment').inputValue(),'2');
  await p.locator('#open-trade').click();await p.locator('#trade-player-a').selectOption(await p.evaluate(()=>state.players[1].id));await p.locator('#trade-player-b').selectOption(await p.evaluate(()=>state.players[2].id));await p.locator('#trade-properties-a input[value="1"]').check();await p.locator('#complete-trade').click();await click(p,'settle');assert.equal(await p.locator('#landing-payment').inputValue(),'2');
  await click(p,'landing-pay');assert.deepEqual(await p.evaluate(()=>state.players.slice(0,3).map(p=>p.cash)),[2498,2532,2497]);await p.close();
});

test('funded incoming payment rescues an existing debt without creating a queue deadlock',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].cash=0;G.owe(state,state.players[0].id,'bank',50,'Bill');saveState();render();});
  await click(p,'payment');await p.locator('#payment-from').selectOption(await p.evaluate(()=>state.players[1].id));await p.locator('#payment-to').selectOption(await p.evaluate(()=>state.players[0].id));await p.locator('#payment-amount').fill('50');await submit(p);
  assert.deepEqual(await p.evaluate(()=>[state.players[0].cash,state.debts.length]),[50,1]);await click(p,'settle');assert.equal(await p.evaluate(()=>state.debts.length),0);await p.close();
});

test('mistyped rent can be corrected after mortgage and reload without losing the turn',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].cash=0;state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.spaces[5].owner=state.players[0].id;state.phase='landed';saveState();render();});
  await p.locator('#landing-payment').fill('1000');await click(p,'landing-pay');await p.locator('.debt-panel [data-action="properties"]').click();await p.locator('#companion-dialog [data-action="mortgage"][data-value="5"]').click();await p.locator('#close-companion').click();await p.reload();
  await click(p,'correct-debt');await p.locator('#corrected-amount').fill('2');await p.locator('#correction-reason').fill('Typed the wrong rent');await submit(p);await click(p,'settle');assert.deepEqual(await p.evaluate(()=>[state.players[0].cash,state.debts.length,state.bankLandingResolved]),[98,0,true]);assert.equal(await p.locator('#end-turn-button').isEnabled(),true);await p.close();
});

test('multiple undo steps survive reload and remove a mistaken bill after reversing a mortgage',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].cash=0;state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.spaces[5].owner=state.players[0].id;state.phase='landed';saveState();render();});
  await p.locator('#landing-payment').fill('1000');await click(p,'landing-pay');await p.locator('.debt-panel [data-action="properties"]').click();await p.locator('#companion-dialog [data-action="mortgage"][data-value="5"]').click();await p.locator('#close-companion').click();await p.reload();await click(p,'undo');await click(p,'undo');assert.equal(await p.evaluate(()=>state.debts.length),0);assert.equal(await p.locator('#landing-payment').inputValue(),'2');await p.close();
});

test('off-turn Jail correction preserves doubles and frozen bill',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.phase='landed';state.extraTurn=true;state.roll={d1:2,d2:2,speed:1,speedActive:true};saveState();render();});
  await p.locator('.edit-player').nth(1).click();await p.locator('#companion-dialog [data-action="position"]').click();await p.locator('#position-in-jail').check();await p.locator('#position-form button[type="submit"]').click();assert.equal(await p.evaluate(()=>state.extraTurn),true);assert.equal(await p.locator('#landing-payment').inputValue(),'2');await click(p,'landing-pay');await p.locator('#end-turn-button').click();assert.equal(await p.evaluate(()=>state.currentPlayer),0);await p.close();
});

test('blank, zero, decimal, and negative rent cannot silently resolve a bill; explicit waiver can',async()=>{
  const p=await page();const alerts=[];p.removeAllListeners('dialog');p.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await p.evaluate(()=>{state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.phase='landed';saveState();render();});
  for(const value of ['', '0', '1.5', '-1']){await p.locator('#landing-payment').fill(value);await click(p,'landing-pay');assert.equal(await p.evaluate(()=>state.bankLandingResolved),false);}
  assert.equal(alerts.length,4);await click(p,'waive-landing');await p.locator('#waiver-reason').fill('Agreed rent waiver');await submit(p);assert.equal(await p.evaluate(()=>state.bankLandingResolved),true);assert.match(await p.evaluate(()=>state.ledger[0].message),/Agreed rent waiver/);await p.close();
});

test('waiving a pending Jail fine preserves its continuation',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].cash=0;state.players[0].position=10;state.players[0].inJail=true;saveState();render();});await p.locator('#pay-jail').click();await click(p,'correct-debt');await p.locator('#corrected-amount').fill('0');await p.locator('#correction-reason').fill('Correction: paid physically');await submit(p);await click(p,'settle');assert.equal(await p.evaluate(()=>state.players[0].inJail),false);assert.equal(await p.locator('#roll-button').count(),1);await p.close();
});

test('saving an unchanged position does not reopen paid rent or consume undo history',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.phase='landed';saveState();render();});await click(p,'landing-pay');
  const before=await p.evaluate(()=>({cash:state.players[0].cash,undo:undoStack.length}));
  await p.locator('.edit-player').first().click();await p.locator('#companion-dialog [data-action="position"]').click();await p.locator('#position-form button[type="submit"]').click();
  assert.deepEqual(await p.evaluate(()=>({cash:state.players[0].cash,undo:undoStack.length})),before);assert.equal(await p.locator('#landing-payment').count(),0);assert.equal(await p.locator('#end-turn-button').isEnabled(),true);await p.reload();assert.equal(await p.locator('#landing-payment').count(),0);await p.close();
});

test('unchanged Jail correction preserves attempts; real movement still creates a new landing',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=10;state.players[0].inJail=true;state.players[0].jailAttempts=2;saveState();render();});
  await p.locator('.edit-player').first().click();await p.locator('#companion-dialog [data-action="position"]').click();await p.locator('#position-form button[type="submit"]').click();assert.equal(await p.evaluate(()=>state.players[0].jailAttempts),2);
  await p.evaluate(()=>{state.players[0].inJail=false;state.players[0].position=1;state.spaces[1].owner=state.players[1].id;state.spaces[3].owner=state.players[1].id;state.phase='landed';saveState();render();});await click(p,'landing-pay');
  await p.locator('.edit-player').first().click();await p.locator('#companion-dialog [data-action="position"]').click();await p.locator('#position-space').selectOption('3');await p.locator('#position-form button[type="submit"]').click();assert.equal(await p.locator('#landing-payment').inputValue(),'8');await p.close();
});

test('failed undo preserves both game state and the complete undo stack, allowing retry',async()=>{
  const p=await page();const alerts=[];p.removeAllListeners('dialog');p.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await p.evaluate(()=>{state.players[0].position=1;state.phase='landed';state.landingResolved=false;saveState();render();});await click(p,'buy');
  const before=await p.evaluate(()=>JSON.stringify({state:snapshotState(state),stack:undoStack,raw:localStorage.getItem(STORAGE_KEY)}));
  await p.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}});await click(p,'undo');
  assert.equal(await p.evaluate(()=>JSON.stringify({state:snapshotState(state),stack:undoStack,raw:localStorage.getItem(STORAGE_KEY)})),before);assert.match(alerts[0],/rolled back/);
  await p.evaluate(()=>{Storage.prototype.setItem=window.realSetItem});await click(p,'undo');assert.deepEqual(await p.evaluate(()=>[state.spaces[1].owner,state.players[0].cash]),[null,2500]);await p.close();
});

test('malformed save can be downloaded intact and replaced with a valid backup',async()=>{
  const p=await page();const backup=await p.evaluate(()=>JSON.stringify(state));await p.evaluate(()=>localStorage.setItem(STORAGE_KEY,'{broken save'));await p.reload();await p.waitForFunction(()=>saveWriterReady);await p.waitForSelector('#recovery-export');
  assert.equal(await p.evaluate(()=>app.inert),false);assert.equal(await p.evaluate(()=>localStorage.getItem(STORAGE_KEY)),'{broken save');
  const download=p.waitForEvent('download');await p.locator('#recovery-export').click();const file=await download;assert.equal(fs.readFileSync(await file.path(),'utf8'),'{broken save');
  const chooser=p.waitForEvent('filechooser');await p.locator('#recovery-import').click();await (await chooser).setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await p.waitForSelector('#roll-button');assert.equal(await p.evaluate(()=>recoveryRaw),null);await p.reload();await p.waitForSelector('#roll-button');await p.close();
});

test('invalid saved schema has an explicit recovery reset rather than a read-only lockout',async()=>{
  const p=await page();await p.evaluate(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify({version:6,players:[],spaces:[]})));await p.reload();await p.waitForFunction(()=>saveWriterReady);await p.locator('#recovery-reset').click();await p.waitForSelector('#setup-form');assert.equal(await p.evaluate(()=>recoveryRaw),null);await p.reload();await p.waitForSelector('#setup-form');await p.close();
});

test('failed recovery reset preserves the damaged original and recovery actions',async()=>{
  const p=await page();const alerts=[];p.removeAllListeners('dialog');p.on('dialog',async d=>{alerts.push(d.message());await d.accept()});await p.evaluate(()=>localStorage.setItem(STORAGE_KEY,'{original'));await p.reload();await p.waitForFunction(()=>saveWriterReady);
  await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}});await p.locator('#recovery-reset').click();assert.equal(await p.evaluate(()=>localStorage.getItem(STORAGE_KEY)),'{original');assert.equal(await p.locator('#recovery-export').count(),1);assert.ok(alerts.some(s=>s.includes('rolled back')));await p.close();
});

test('guided auction survives reload, awards once, and undo restores bidding',async()=>{
  const p=await page();await p.evaluate(()=>{state.players=state.players.slice(0,3);state.players[0].position=1;state.phase='landed';state.bankLandingResolved=false;saveState();render();});
  await click(p,'auction');await p.locator('[data-action="auction-start"]').click();await p.locator('[data-action="auction-bid"][data-value="50"]').click();await p.reload();await click(p,'auction-pass');await click(p,'auction-pass');
  assert.deepEqual(await p.evaluate(()=>[state.auction,state.spaces[1].owner===state.players[0].id,state.players[0].cash]),[null,true,2450]);await click(p,'undo');assert.equal(await p.locator('[data-action="auction-pass"]').count(),1);await p.close();
});
test('physical card preview blocks ending, then chained card landing requires its own consequence',async()=>{
  const p=await page();await p.evaluate(()=>{state.moneyMode='helper';state.players[0].position=36;state.phase='landed';state.bankLandingResolved=false;saveState();render();});
  assert.equal(await p.locator('#end-turn-button').isDisabled(),true);await click(p,'physical-card');await p.selectOption('#card-effect','back');await p.fill('#card-amount','3');await submit(p);await p.reload();await click(p,'apply-card');assert.equal(await p.evaluate(()=>state.players[0].position),33);assert.equal(await p.locator('#end-turn-button').isDisabled(),true);
  await click(p,'physical-card');await p.selectOption('#card-effect','collect');await p.fill('#card-amount','100');await submit(p);await click(p,'apply-card');assert.equal(await p.locator('#end-turn-button').isEnabled(),true);await p.close();
});
test('digital draw and apply persist separately, held Jail card returns once',async()=>{
  const p=await page();await p.evaluate(()=>{state.cardMode='digital';state.players[0].position=7;state.phase='landed';state.bankLandingResolved=false;state.decks.chance=[7,...state.decks.chance.filter(i=>i!==7)];saveState();render();});
  await click(p,'draw-card');await p.reload();await click(p,'apply-card');assert.equal(await p.evaluate(()=>state.heldCards.length),1);await p.evaluate(()=>{state.players[0].position=10;state.players[0].inJail=true;state.phase='ready';saveState();render();});await p.locator('#use-jail-card').click();assert.equal(await p.evaluate(()=>state.heldCards.length),0);assert.equal(await p.evaluate(()=>state.decks.chance.at(-1)),7);await p.close();
});
test('Home preserves two named games and a pending auction across new game and reload',async()=>{
  const p=await page();await p.evaluate(()=>{state.gameName='Tessa game';G.startAuction(state,1);saveState();render();});await p.locator('#game-menu-button').click();await p.locator('#home-button').click();await click(p,'new-game');
  await p.locator('.setup-name').nth(0).fill('Tessa');await p.locator('.setup-name').nth(1).fill('Dad');await p.fill('[name="game-name"]','Second game');await p.locator('#setup-form button[type="submit"]').click();await p.locator('#game-menu-button').click();await p.locator('#home-button').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),2);
  await p.locator('.saved-games article').filter({hasText:'Tessa game'}).locator('[data-action="resume-game"]').click();await p.reload();assert.equal(await p.evaluate(()=>state.gameName),'Tessa game');assert.equal(await p.locator('[data-action="auction-pass"]').count(),1);await p.close();
});
test('new setup has fixed cash, official defaults and optional leave-unowned house rule',async()=>{
  const p=await page();await p.evaluate(()=>newFamilyGame());assert.equal(await p.locator('[name="starting-cash"]').count(),0);assert.equal(await p.locator('[name="leave-unowned"]').isDisabled(),true);
  await p.selectOption('#rules-preset','house');await p.locator('[name="leave-unowned"]').check();await p.locator('.setup-name').nth(0).fill('Tessa');await p.locator('.setup-name').nth(1).fill('Dad');await p.locator('#setup-form button[type="submit"]').click();await p.evaluate(()=>{state.players[0].position=1;state.phase='landed';state.landingResolved=false;saveState();render();});assert.equal(await p.locator('.leave-unowned').count(),1);await p.close();
});
test('winner can go Home and play again while completed game remains available',async()=>{
  const p=await page();await p.evaluate(()=>{state.moneyMode='helper';state.players=state.players.slice(0,2);G.bankrupt(state,state.players[0].id,'bank');saveState();render();});assert.equal(await p.locator('.confetti').count(),1);await click(p,'home');assert.equal(await p.locator('.saved-games').getByText(/Completed/).count(),1);await click(p,'resume-game');await click(p,'new-game');assert.equal(await p.locator('#setup-form').count(),1);await p.close();
});
test('dice dots and independent audio preferences persist, reduced motion disables confetti',async()=>{
  const p=await page();await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#game-menu-button').click();await p.locator('#presentation-button').click();await p.locator('#effects-setting').check();await p.locator('#music-setting').check();await submit(p);await p.locator('#roll-button').click();assert.equal(await p.locator('.pip-face').count(),2);await p.reload();assert.deepEqual(await p.evaluate(()=>[state.soundEffects,state.music]),[true,true]);await p.close();
});

test('library storage failure keeps the active game and prevents starting another',async()=>{
  const p=await page();p.removeAllListeners('dialog');const alerts=[];p.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
  await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===LIBRARY_KEY)throw Error('Quota');return original.call(this,k,v);};newFamilyGame();});
  assert.equal(await p.evaluate(()=>state.started),true);assert.equal(await p.locator('#roll-button').count(),1);assert.match(alerts[0],/Could not preserve/);await p.close();
});

test('complete three-player digital game follows visible actions through a winner', {timeout:240000},async()=>{
  const p=await page();await p.evaluate(()=>{state.players=state.players.slice(0,3);state.cardMode='digital';state.mode='classic';state.activation='after-go';let seed=72631;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};G.initDecks(state);saveState();render();});
  let steps=0,rolls=0;
  // Dispatch the visible buttons directly to avoid animation waits in this long replay.
  const tap=async selector=>p.evaluate(sel=>{const el=document.querySelector(sel);if(!el||el.disabled)throw Error(`Unavailable action ${sel}`);el.click();},selector);
  for(;steps<6500;steps++){
    const s=await p.evaluate(()=>snapshotState(state));if(s.winnerId)break;
    const cp=s.players[s.currentPlayer];
    if(s.auction){await tap('[data-action="auction-pass"]');continue;}
    if(s.debts.length){
      const d=s.debts[0],debtor=s.players.find(p=>p.id===d.from);
      if(debtor.cash>=d.amount){await tap('[data-action="settle"]');continue;}
      const buildings=s.spaces.find(q=>q.owner===d.from&&q.buildings);
      const mortgage=s.spaces.find(q=>q.owner===d.from&&!q.mortgaged);
      if(buildings){await p.evaluate(i=>openProperty(i),buildings.index);await tap('#companion-dialog [data-action="sell-group"]');await tap('#close-companion');continue;}
      if(mortgage){await p.evaluate(id=>openProperties(id),d.from);await tap(`#companion-dialog [data-action="mortgage"][data-value="${mortgage.index}"]`);await tap('#close-companion');continue;}
      await tap('[data-action="bankruptcy"]');await tap('#companion-form button[type="submit"]');continue;
    }
    if(s.auctions.length){await tap('[data-action="auction"]');await tap('[data-action="auction-start"]');continue;}
    if(s.pendingCard){await tap('[data-action="apply-card"]');continue;}
    if(s.phase==='ready'){
      if(cp.inJail){await tap('#try-jail-doubles');rolls++;continue;}
      // Build affordable complete groups through the same property controls used by a player.
      const build=await p.evaluate(()=>state.spaces.find(q=>{if(q.owner!==currentPlayer().id||q.type!=='property'||currentPlayer().cash<q.buildCost+100)return false;try{G.run(state,s=>G.build(s,q.index,1));return true;}catch{return false;}})?.index);
      if(build!==undefined){await p.evaluate(()=>openProperties());await tap(`#companion-dialog [data-action="build"][data-value="${build}"]`);await tap('#close-companion');continue;}
      await tap('#roll-button');rolls++;continue;
    }
    if(s.phase==='bus'){await tap('.bus-choice');continue;}
    if(s.phase==='triples'){await p.selectOption('#triples-space',String(s.spaces.find(q=>['property','railroad','utility'].includes(q.type)&&!q.owner)?.index??0));await tap('#move-triples');continue;}
    const action=await p.evaluate(()=>['draw-card','buy','landing-pay','resolve','parking'].find(a=>document.querySelector(`#app [data-action="${a}"]:not(:disabled)`)));
    if(action){await tap(`#app [data-action="${action}"]`);continue;}
    if(await p.locator('#app [data-action="auction"]').count()){await tap('#app [data-action="auction"]');await tap('[data-action="auction-start"]');continue;}
    if(s.phase==='classic-first-stop'){await tap('#continue-finder');continue;}
    await tap('#end-turn-button');
  }
  assert.ok(await p.evaluate(()=>state.winnerId),`No winner after ${steps} decisions / ${rolls} rolls`);
  assert.equal(await p.locator('.winner-panel').count(),1);await p.evaluate(()=>G.validate(state));
  console.log(`Full game: ${rolls} rolls, ${steps} decisions, winner ${await p.evaluate(()=>currentPlayer().name)}.`);
  await p.screenshot({path:'/tmp/speeddie-family-winner.png',fullPage:true});await click(p,'home');assert.equal(await p.locator('[data-action="resume-game"]').count(),1);await p.close();
});

test('using a Jail card is one undoable action, restoring both imprisonment and the card',async()=>{
  const p=await page();await p.evaluate(()=>{state.cardMode='digital';state.players[0].position=10;state.players[0].inJail=true;state.decks.chance=state.decks.chance.filter(i=>i!==7);state.heldCards=[{deck:'chance',id:7,physical:false,owner:state.players[0].id}];saveState();render();});await p.locator('#use-jail-card').click();assert.equal(await p.locator('#roll-button').count(),1);await click(p,'undo');assert.equal(await p.evaluate(()=>state.players[0].inJail),true);assert.equal(await p.evaluate(()=>state.heldCards.length),1);await p.close();
});
test('recorded Jail card can be sold through Bank and its ownership survives reload',async()=>{
  const p=await page();await p.evaluate(()=>{state.heldCards=[{deck:'chance',id:null,physical:true,owner:state.players[0].id}];saveState();render();});await click(p,'bank-menu');await p.locator('[data-action="card-trade"]').click();await p.selectOption('#card-buyer',await p.evaluate(()=>state.players[1].id));await p.fill('#card-price','20');await submit(p);await p.reload();assert.deepEqual(await p.evaluate(()=>[state.heldCards[0].owner===state.players[1].id,state.players[0].cash,state.players[1].cash]),[true,2520,2480]);await p.close();
});

test('delete active saved game clears both copies and cannot reappear after reload or New game',async()=>{
  const p=await page();await p.evaluate(()=>goHome());await click(p,'delete-game');assert.equal(await p.locator('[data-action="resume-game"]').count(),0);assert.equal(await p.evaluate(()=>state.started),false);
  await p.reload();await p.locator('#setup-home').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),0);await click(p,'new-game');await p.locator('#setup-home').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),0);await p.close();
});
test('delete another saved game preserves current progress; cancel does not delete',async()=>{
  const p=await page();await p.evaluate(()=>{archiveCurrent();const games=library();games.other={...snapshotState(state),gameId:'other',gameName:'Old game'};localStorage.setItem(LIBRARY_KEY,JSON.stringify(games));goHome();});const before=await p.evaluate(()=>snapshotState(state));
  p.removeAllListeners('dialog');p.on('dialog',d=>d.dismiss());await p.locator('[data-action="delete-game"][data-value="other"]').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),2);
  p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());await p.locator('[data-action="delete-game"][data-value="other"]').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),1);assert.deepEqual(await p.evaluate(()=>snapshotState(state)),before);await p.close();
});
test('failed deletion preserves active state and archived backup',async()=>{
  const p=await page();await p.evaluate(()=>goHome());const before=await p.evaluate(()=>snapshotState(state));p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());
  await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===LIBRARY_KEY)throw Error('Storage unavailable');return original.call(this,k,v);};});await click(p,'delete-game');assert.deepEqual(await p.evaluate(()=>snapshotState(state)),before);assert.equal(await p.locator('[data-action="resume-game"]').count(),1);await p.close();
});

test('empty Home can restore a JSON backup without starting a throwaway game',async()=>{
  const p=await page();const backup=await p.evaluate(()=>JSON.stringify(state));await p.evaluate(()=>goHome());await click(p,'delete-game');const choosing=p.waitForEvent('filechooser');await click(p,'import-game');const chooser=await choosing;await chooser.setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await p.waitForSelector('#roll-button');assert.equal(await p.evaluate(()=>state.players.length),8);await p.close();
});

test('board overview has 40 unique perimeter spaces and read-only ownership, building and Jail details',async()=>{
  const p=await page();await p.evaluate(()=>{state.players[0].position=10;state.players[0].inJail=true;state.players[1].position=10;state.players[2].bankrupt=true;[1,3].forEach(i=>state.spaces[i].owner=state.players[1].id);state.spaces[1].buildings=1;state.spaces[1].buildingCosts=[50];state.spaces[5].owner=state.players[1].id;state.spaces[5].mortgaged=true;saveState();render();});const before=await p.evaluate(()=>JSON.stringify(state));
  await p.locator('#view-board').click();assert.equal(await p.locator('[data-board-space]').count(),40);assert.equal(await p.evaluate(()=>new Set(state.spaces.map(p=>boardCoordinates(p.index).join(','))).size),40);
  await p.locator('[data-board-space="10"]').click();assert.match(await p.locator('#board-space-details').innerText(),/Player 1 \(in Jail\).*Player 2 \(just visiting\)/);
  await p.locator('[data-board-space="1"]').click();assert.match(await p.locator('#board-space-details').innerText(),/1 house/);assert.equal(await p.locator('#board-space-details input').count(),0);
  await p.locator('[data-board-space="5"]').click();assert.match(await p.locator('#board-space-details').innerText(),/Mortgaged: no rent/);assert.equal(await p.locator('.board-player-key > div').count(),7);assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);
  await p.locator('#close-board').click();assert.equal(await p.locator('#try-jail-doubles').count(),1);await p.close();
});
test('board remains accessible during auctions and after victory without changing pending actions',async()=>{
  const p=await page();await p.evaluate(()=>{G.startAuction(state,1);saveState();render();});await p.locator('#view-board').click();await p.locator('[data-board-space="39"]').click();await p.locator('#close-board').click();assert.equal(await p.locator('[data-action="auction-pass"]').count(),1);
  await p.evaluate(()=>{state.auction=null;state.players=state.players.slice(0,2);state.moneyMode='helper';G.bankrupt(state,state.players[1].id,'bank');saveState();render();});await p.locator('#view-board').click();assert.match(await p.locator('.board-center').innerText(),/wins!/);await p.locator('#close-board').click();assert.equal(await p.locator('.winner-panel').count(),1);await p.close();
});
test('board fits narrow phones with eight players and uploaded tokens, and supports keyboard selection',async()=>{
  const p=await page();await p.setViewportSize({width:320,height:740});await p.locator('#view-board').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await p.locator('.board-key-token img').count(),1);await p.locator('[data-board-space="39"]').focus();await p.keyboard.press('Enter');assert.match(await p.locator('#board-space-details h3').innerText(),/Boardwalk/);assert.equal(await p.locator('[data-board-space="39"]').getAttribute('aria-pressed'),'true');await p.close();
});

test('damaged library entry does not hide good games and can be downloaded or deleted',async()=>{
  const p=await page();await p.evaluate(()=>{archiveCurrent();const games=library();games.broken=null;localStorage.setItem(LIBRARY_KEY,JSON.stringify(games));goHome();});assert.equal(await p.locator('[data-action="resume-game"]').count(),1);assert.match(await p.locator('.saved-games').innerText(),/Unreadable saved game/);
  const downloading=p.waitForEvent('download');await click(p,'export-library');const download=await downloading;assert.equal(JSON.parse(fs.readFileSync(await download.path(),'utf8')).broken,null);await p.locator('[data-action="delete-game"][data-value="broken"]').click();assert.equal(await p.locator('[data-action="resume-game"]').count(),1);await p.close();
});
test('failed New game retains Home controls and pending auction so resume remains usable',async()=>{
  const p=await page();p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());await p.evaluate(()=>{G.startAuction(state,1);saveState();goHome();const original=Storage.prototype.setItem;window.restoreWrites=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw Error('Quota');return original.call(this,k,v);};});await click(p,'new-game');assert.equal(await p.evaluate(()=>homeView),true);assert.equal(await p.locator('[data-action="resume-game"]').count(),1);await p.evaluate(()=>restoreWrites());await click(p,'resume-game');assert.equal(await p.locator('[data-action="auction-pass"]').count(),1);await p.close();
});
test('restoring from board view returns to play and Home hides active-game correction menu',async()=>{
  const p=await page();const backup=await p.evaluate(()=>JSON.stringify(state));await p.locator('#view-board').click();await p.locator('#game-menu-button').click();await p.locator('#import-input').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await p.waitForSelector('#roll-button');assert.equal(await p.evaluate(()=>boardView),false);await p.evaluate(()=>goHome());assert.equal(await p.locator('#game-menu-button').isVisible(),false);await p.close();
});
test('completed game can download its keepsake without re-enabling game actions',async()=>{
 const p=await page();await p.evaluate(()=>{state.moneyMode='helper';state.players=state.players.slice(0,2);G.bankrupt(state,state.players[0].id,'bank');saveState();render();});
 const event=p.waitForEvent('download');await p.locator('[data-action="keepsake"]').click();
 const download=await event;assert.equal(download.suggestedFilename(),'family-game-night.png');
 const stream=await download.createReadStream();const chunks=[];for await(const part of stream)chunks.push(part);
 assert.equal(Buffer.concat(chunks).subarray(1,4).toString(),'PNG');await p.close();
});

test('building menu groups legal deeds and stays open through repeated purchases',async()=>{
 const p=await page();await p.evaluate(()=>{[1,3,6].forEach(i=>state.spaces[i].owner=state.players[0].id);saveState();render();});
 await click(p,'properties');
 await p.evaluate(()=>{window.buildMenuCloses=0;document.querySelector('#companion-dialog').addEventListener('close',()=>window.buildMenuCloses++);});
 const choices=p.locator('#companion-dialog .build-choices');assert.match(await choices.innerText(),/Brown color set · complete/);
 assert.equal(await choices.locator('[data-action="build"]').count(),2);assert.doesNotMatch(await choices.innerText(),/Oriental Avenue/);
 await choices.locator('[data-value="1"]').click();assert.equal(await choices.locator('[data-value="1"]').count(),0);
 await choices.locator('[data-value="3"]').click();assert.equal(await choices.locator('[data-action="build"]').count(),2);
 assert.deepEqual(await p.evaluate(()=>[state.spaces[1].buildings,state.spaces[3].buildings,state.players[0].cash,document.querySelector('#companion-dialog').open,window.buildMenuCloses]),[1,1,2400,true,0]);
 await p.locator('#close-companion').click();await p.waitForFunction(()=>window.buildMenuCloses===1);await p.close();
});

test('trade offer values update as deeds and cash are selected',async()=>{
 const p=await page();await p.evaluate(()=>{state.spaces[1].owner=state.players[0].id;state.spaces[5].owner=state.players[1].id;saveState();render();});
 await p.locator('#open-trade').click();await p.locator('#trade-properties-a input[value="1"]').check();await p.locator('#trade-properties-b input[value="5"]').check();
 const preview=p.locator('.trade-worth-preview');assert.match(await preview.innerText(),/Player 2 offers \$140 more/);
 await p.locator('#trade-cash-a').fill('140');assert.match(await preview.innerText(),/Both offers have equal value/);assert.doesNotMatch(await preview.innerText(),/Net worth:/);
 await p.locator('#complete-trade').click();assert.deepEqual(await p.evaluate(()=>[state.spaces[1].owner===state.players[1].id,state.spaces[5].owner===state.players[0].id,state.players[0].cash]),[true,true,2360]);await p.close();
});
