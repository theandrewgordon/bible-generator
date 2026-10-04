// Run against the isolated Flask test server, never a production database.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.SAME_BRAIN_TEST_URL||'http://127.0.0.1:8765';
async function play(page,name,failed=false){
 if(await page.locator('#screen-invite').isVisible())await page.locator('#accept-btn').click();
 if(await page.locator('#screen-name').isVisible()){await page.locator('#player-name').fill(name);await page.locator('#name-next').click()}
 for(let i=0;i<5;i++){
  if(!await page.locator('#screen-question').isVisible())break;
  const number=await page.locator('#qnum').textContent();
  await page.locator('#choices button').first().click();
  await page.waitForFunction(([n,failed])=>document.querySelector('#qnum').textContent!==n||document.querySelector('#screen-question').classList.contains('hidden')||(failed&&!document.querySelector('#retry-submit').classList.contains('hidden')),[number,failed]);
 }
}
(async()=>{
 for(const [engine,browserType] of Object.entries({chromium,webkit})){
  const browser=await browserType.launch({headless:true});
  for(const [device,viewport] of Object.entries({phone:{width:390,height:844},tablet:{width:820,height:1180},desktop:{width:1440,height:1000}})){
   if(process.env.SAME_BRAIN_TEST_DEVICE&&device!==process.env.SAME_BRAIN_TEST_DEVICE)continue;
   const errors=[];
   const contexts=await Promise.all([browser.newContext({viewport}),browser.newContext({viewport})]);
   const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
   for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss())}
   await a.goto(base+'/same-brain');await a.locator('#start-btn').click();await a.locator('#player-name').fill('Creator');await a.locator('#name-next').click();
   const first=await a.locator('#question-text').textContent();
   // Rapid clicks only advance one answer, then refresh preserves that progress.
   await a.locator('#choices button').first().click();await a.waitForFunction(()=>document.querySelector('#qnum').textContent.includes('2 OF'));
   await a.reload();await a.waitForFunction(()=>document.querySelector('#qnum').textContent.includes('2 OF'));
   await a.locator('#question-back').click();assert.equal(await a.locator('#question-text').textContent(),first);
   await play(a,'Creator');await a.locator('#screen-share').waitFor({state:'visible'});
   const link=await a.locator('#challenge-link').textContent();const code=new URL(link).searchParams.get('s');assert.equal(code.length,7);
   await b.goto(base+'/same-brain');await b.locator('#join-code').fill(code.toLowerCase());await b.locator('#join-code-btn').click();await b.locator('#screen-invite').waitFor({state:'visible'});
   await play(b,'Friend');await b.locator('#screen-result').waitFor({state:'visible'});assert.equal(await b.locator('#score-text').textContent(),'100%');
   await b.locator('#rematch-btn').click();await b.locator('#screen-question').waitFor({state:'visible'});assert.notEqual(await b.locator('#question-text').textContent(),first);
   assert.equal(new URL(b.url()).search,'');await b.locator('#choices button').first().click();await b.waitForFunction(()=>document.querySelector('#qnum').textContent.includes('2 OF'));await b.reload();await b.waitForFunction(()=>document.querySelector('#qnum').textContent.includes('2 OF'));
   await play(b,'Friend');await b.locator('#screen-share').waitFor({state:'visible'});assert.match(await b.locator('#screen-share .question').textContent(),/Creator/);
   // Fresh independent rooms for a real two-context Together flow.
   await a.locator('#home-button').click();await a.locator('#together-btn').click();await a.locator('#screen-name').waitFor({state:'visible'});
   const room=a.url();assert.ok(room.includes('?t='));await b.goto(room);await b.locator('#screen-invite').waitFor({state:'visible'});
   if(device==='desktop')await a.route('**/same-brain/together/*/answer',route=>route.abort(),{times:1});
   const failureAlert=device==='desktop'?a.waitForEvent('dialog'):null;
   await play(a,'One',device==='desktop');
   if(device==='desktop'){await failureAlert;await a.locator('#retry-submit').click()}
   await a.locator('#screen-waiting').waitFor({state:'visible'});await a.reload();await a.locator('#screen-waiting').waitFor({state:'visible'});
   await play(b,'Two');await Promise.all([a.locator('#screen-result').waitFor({state:'visible'}),b.locator('#screen-result').waitFor({state:'visible'})]);
   assert.equal(await a.locator('#score-text').textContent(),await b.locator('#score-text').textContent());
   if(device==='desktop'){
    await a.locator('#rematch-btn').click();await a.locator('#screen-name').waitFor({state:'visible'});
    await b.waitForFunction(()=>document.querySelector('#rematch-btn').textContent.includes('join'));
    await b.locator('#rematch-btn').click();await b.locator('#screen-name').waitFor({state:'visible'});
    assert.equal(a.url(),b.url());await play(a,'One');await play(b,'Two');
    await a.locator('#screen-result').waitFor({state:'visible'});
    await a.locator('#home-button').click();await a.locator('#ways-disclosure summary').click();await a.locator('#group-open').click();await a.locator('#group-btn').click();await play(a,'Host');await a.locator('#screen-share').waitFor({state:'visible'});
    const group=await a.locator('#challenge-link').textContent();await b.goto(group);await b.locator('#screen-invite').waitFor({state:'visible'});await play(b,'Guest');await b.locator('#screen-result').waitFor({state:'visible'});
    await b.reload();await b.locator('#screen-result').waitFor({state:'visible'});
    const third=await browser.newContext({viewport}),p=await third.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(group);await p.locator('#screen-invite').waitFor({state:'visible'});await play(p,'Guest');await p.locator('#screen-name').waitFor({state:'visible'});assert.match(await p.locator('#name-heading').textContent(),/name is taken/);await play(p,'Third');
    await b.waitForFunction(()=>document.querySelector('#brain-type').textContent.includes('3 players'));await third.close();
   }
   assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
   if(engine==='webkit')await a.screenshot({path:`/tmp/same-brain-${device}.png`,fullPage:true});
   assert.deepEqual(errors,[]);await Promise.all(contexts.map(c=>c.close()));console.log('PASS',engine,device,'challenge/code/rematch, refresh, back, Together sync and layout'+(device==='desktop'?', failed-submit retry, shared Together rematch, Group recovery and live updates':''));
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
