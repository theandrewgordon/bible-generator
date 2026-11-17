'use strict';
const {chromium}=require('../frontend/learning-labs/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),routes={'/labs/geo-detectives':'static/labs/geo-detectives.html','/labs/math-fact-adventure':'static/labs/math-fact-rally.html','/labs/grammar-grove':'static/labs/grammar-grove.html'};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};
(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,routes[url.pathname]||'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(e?'missing':b)})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.Audio=class extends EventTarget{play(){return Promise.resolve()}pause(){this.dispatchEvent(new Event('pause'))}}});
  const spoken=[];
  page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text())});
  await page.route('**/labs/voice/session',r=>r.fulfill({json:{csrf:'test',version:'v1'}}));
  await page.route('**/labs/voice/tts',r=>{spoken.push(r.request().postDataJSON());return r.fulfill({status:200,headers:{'Content-Type':'audio/mpeg','X-TTS-Cache':'MISS'},body:Buffer.from('test-clip')})});
  await page.goto(base+'/labs/geo-detectives');
  await page.getByText('Practice options',{exact:true}).click();
  await page.getByLabel('Answer with').selectOption('type');
  await page.getByRole('button',{name:'Start with these options'}).click();
  await page.getByRole('button',{name:'Read it to me',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.labs-voice-status')?.textContent.includes('saved'));
  assert.equal(spoken.length,1);assert(spoken[0].text.startsWith('Clue 1.'));assert(!spoken[0].text.includes('Clue 2.'));
  const first=spoken[0].text;
  await page.getByRole('button',{name:'Read it to me',exact:true}).click();
  await page.waitForTimeout(200);assert.equal(spoken.length,1);
  await page.reload();await page.getByRole('button',{name:'Read it to me',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.labs-voice-status')?.textContent.includes('saved'));
  assert.equal(spoken.length,1);
  await page.locator('#geo-answer').fill('intentionally incorrect');
  await page.getByRole('button',{name:'Check answer',exact:true}).click();
  await page.getByText('Not quite.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Read the explanation',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.labs-voice-status')].at(-1)?.textContent.includes('saved'));
  assert.equal(spoken.length,2);assert.notEqual(spoken[1].text,first);
  // Every selected operation must occur in the first four turns, for each learner.
  await page.goto(base+'/labs/math-fact-adventure');
  await page.getByText('Practice options',{exact:true}).click();
  await page.locator('#answerStyle').selectOption('choice');
  await page.locator('#homeEdit').click();
  await page.locator('.op-checkbox').evaluateAll(nodes=>nodes.forEach(n=>n.checked=n.value!=='Exponents'));
  await page.locator('#rounds').selectOption('5');
  await page.locator('#start').click();
  const operations=[];
  for(let i=0;i<4;i++){
   operations.push((await page.locator('#who').textContent()).split(' · ')[1]);
   const choices=await page.locator('#mathChoices button').allTextContents();
   assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);
   await page.locator('#mathChoices button').first().click();
   await page.locator('#next').click();
  }
  assert.equal(new Set(operations).size,4);
  await page.locator('#restart').click();
  await page.getByText('Practice options',{exact:true}).click();
  await page.locator('#answerStyle').selectOption('type');
  await page.locator('#exerciseStyle').selectOption('missing');
  await page.locator('#homePlay').click();
  await page.locator('#typedAnswer').fill('');await page.locator('#checkTyped').click();
  assert.match(await page.locator('#message').textContent(),/Enter a number/);
  await page.locator('#typedAnswer').fill('−3');await page.locator('#checkTyped').click();
  await page.locator('#next:not(.hidden)').waitFor();
  await page.goto(base+'/labs/grammar-grove');
  await page.locator('#response').selectOption('type');
  await page.locator('[data-start="words"]').click();
  await page.locator('#grammar-typed').fill('ADJECTIVE');
  await page.locator('#check').click();
  assert.match(await page.locator('#feedback').textContent(),/Beautiful work/);
  await page.locator('#home').click();
  await page.locator('[data-start="diagram"]').click();
  const fields=page.locator('[data-part-answer]');
  assert.equal(await fields.count(),2);
  await fields.nth(0).fill('Birds');await fields.nth(1).fill('sing');await page.locator('#check').click();
  assert.match(await page.locator('#feedback').textContent(),/Beautiful work/);
  assert.equal(await fields.nth(0).isDisabled(),true);
  for(const width of [1360,390]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/labs/geo-detectives');
   if(await page.getByRole('button',{name:'Choose trail',exact:false}).count())await page.getByRole('button',{name:'Choose trail',exact:false}).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  }
  assert.deepEqual(errors,[]);
  console.log('Geo narration/cache/typed grading, math operation mixing/answer modes, Grammar typed grading, desktop/phone overflow passed.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
