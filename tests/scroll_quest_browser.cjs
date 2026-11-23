'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.SCROLL_QUEST_PLAYWRIGHT||'../frontend/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn(process.env.BROWSER_TEST_PYTHON||'python3',[path.join(__dirname,'scroll_quest_server.py')],{cwd:root,env:process.env});
 let logs='';server.stderr.on('data',b=>logs+=b);
 let browser;
 try{
  const base=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Server did not start: '+logs)),20000);
   let output='';server.stdout.on('data',b=>{output+=b;const found=output.match(/SCROLL_QUEST_URL=(http:\/\/127\.0\.0\.1:\d+)/);if(found){clearTimeout(timer);resolve(found[1]);}});
   server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+logs));});
  });
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base+'/labs/scroll-quest');
  if(process.env.SCROLL_QUEST_SCREENSHOT)await page.screenshot({path:process.env.SCROLL_QUEST_SCREENSHOT+'-landing.png',fullPage:true});
  await page.getByRole('link',{name:'Play Scroll Quest',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.SQSave);
  let frame=page.frames().find(f=>f.url().includes('/bundle/index.html'));
  await frame.waitForFunction(()=>window.SQSave);
  if(process.env.SCROLL_QUEST_SCREENSHOT)await page.screenshot({path:process.env.SCROLL_QUEST_SCREENSHOT+'-play.png'});
  const first=await frame.evaluate(()=>{
   localStorage.setItem('scrollquest.order','all');localStorage.setItem('scrollquest.challenge','practice');
   SQSave.write({levels:{'1-1':{done:true,stars:2}},last:'1-1'});
   const scope=document.cookie.match(/faithsparks_labs_owner=([a-f0-9]{64})/)[1];
   return {scope,progress:SQSave.read()};
  });
  assert.equal(first.progress.levels['1-1'].stars,2);
  for(const level of ['1-1-eden','3-2-bush','8-1-pentecost','8-9-tree-of-life']){
   await frame.goto(base+'/labs/scroll-quest/bundle/world-'+level+'.html');
   await frame.waitForFunction(()=>window.SQ&&SQ.state.players.length>0);
   await frame.evaluate(()=>{SQ._startPlay();let n=0;while(SQ.state.phase==='story'&&n++<20)SQ._nextStory();});
   await frame.waitForTimeout(250);
   assert.equal(await frame.evaluate(()=>document.getElementById('sq-error')?.textContent||null),null);
   assert(await frame.evaluate(()=>SQ.state.players[0].shadow.material.map?.isDataTexture));
   console.log('PASS protected WebGL chapter '+level);
  }
  await page.setViewportSize({width:390,height:844});
  assert((await page.locator('iframe').boundingBox()).height>600);
  const oldFrame=frame;
  await context.addCookies([{name:'sq_test_account',value:'second@example.test',url:base}]);
  // A request establishes the new account owner cookie while the old game remains open.
  assert.equal((await context.request.get(base+'/labs/scroll-quest')).status(),200);
  const stale=await oldFrame.evaluate(()=>({progress:SQSave.read(),stored:localStorage.getItem('scrollquest.progress.v1')}));
  assert.equal(stale.stored,null);assert(!stale.progress.levels['1-1']);
  await page.goto(base+'/labs/scroll-quest/play');await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.SQSave);
  frame=page.frames().find(f=>f.url().includes('/bundle/index.html'));await frame.waitForFunction(()=>window.SQSave);
  assert.equal(await frame.evaluate(()=>Object.keys(SQSave.read().levels).length),0);
  await context.addCookies([{name:'sq_test_account',value:'first@example.test',url:base}]);
  await page.goto(base+'/labs/scroll-quest/play');await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.SQSave);
  frame=page.frames().find(f=>f.url().includes('/bundle/index.html'));await frame.waitForFunction(()=>window.SQSave);
  assert.equal(await frame.evaluate(()=>SQSave.read().levels['1-1'].stars),2);
  await context.addCookies([{name:'sq_test_access',value:'free',url:base}]);
  const denied=await context.request.get(base+'/labs/scroll-quest/bundle/models/nature.js');assert.equal(denied.status(),403);
  assert.deepEqual(errors,[]);
  console.log('PASS local saves survive navigation, isolate accounts, and block stale tabs; mobile shell and asset membership gate work');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
