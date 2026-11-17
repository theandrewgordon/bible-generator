'use strict';
const {chromium}=require('../frontend/learning-labs/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),routes={'/labs/geo-detectives':'static/labs/geo-detectives.html','/labs/math-fact-adventure':'static/labs/math-fact-rally.html','/labs/grammar-grove':'static/labs/grammar-grove.html'};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};

function latinFixture(){
 const template=fs.readFileSync(path.join(root,'templates/labs_latin_quest.html'),'utf8');
 const modes={meaning:'Latin → English',reverse:'English → Latin',nouns:'Noun detective',verbs:'Verb workshop',grammar:'Grammar cards',mixed:'Mixed quest'};
 const questions=[{id:'test-n:meaning',card:'test-n',mode:'meaning',prompt:'What does via mean in English?',answers:['road'],answer:'road',details:'Noun. first declension. feminine.',hint:'Think of a path.',flash_front:'via, viae',flash_back:'road'},{id:'test-v:meaning',card:'test-v',mode:'meaning',prompt:'What does porto mean in English?',answers:['carry'],answer:'carry',details:'Verb. first conjugation.',hint:'Move something with you.',flash_front:'porto',flash_back:'carry'}];
 let body=template.match(/{% block content %}([\s\S]*?){% endblock %}/)[1];
 body=body.replace(/{% for key,label in latin_modes.items\(\) %}[\s\S]*?{% endfor %}/,Object.entries(modes).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join(''));
 body=body.replace(/<script[^>]*id="lq-config"[^>]*>[\s\S]*?<\/script>/,'<script id="lq-config" type="application/json">'+JSON.stringify({cardCount:2,questions,modes,memory:{},study:[],csrf:'test',audioVersion:'fixture',ttsUrl:'/labs/latin-quest/tts'})+'</script>');
 body=body.replace(/{{\s*latin_(?:card_count|vocabulary_count|grammar_count)\s*}}/g,'2');
 const head=template.match(/<style>[\s\S]*?<\/style>/)[0]+[...template.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
 return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+head+'</head><body>'+body+'</body></html>';
}

(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/labs/latin-quest'){res.writeHead(200,{'Content-Type':'text/html'});res.end(latinFixture());return}const file=path.resolve(root,routes[url.pathname]||'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(e?'missing':b)})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copiedGameLink=text}});window.Audio=class extends EventTarget{play(){return Promise.resolve()}pause(){this.dispatchEvent(new Event('pause'))}}});
  const spoken=[];
  page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text())});
  await page.route('**/labs/latin-quest/tts',r=>r.fulfill({status:200,headers:{'Content-Type':'audio/mpeg','X-TTS-Cache':'HIT'},body:Buffer.from('test-clip')}));
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
  await page.locator('#geo-answer').fill('draft coastline');await page.reload();assert.equal(await page.locator('#geo-answer').inputValue(),'draft coastline');await page.getByRole('button',{name:'Read it to me',exact:true}).click();
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
  // Starting fresh must use the chosen learner, reset round points, and retain learning history.
  await page.locator('#restart').click();
  await page.getByText('Practice options',{exact:true}).click();
  await page.locator('#homeEdit').click();
  await page.locator('#playerCount').selectOption('2');
  await page.locator('#start').click();
  await page.locator('#typedAnswer').fill('1000000');await page.locator('#checkTyped').click();
  await page.locator('#restart').click();
  await page.locator('#math-learner').selectOption('Player 2');
  assert.equal(await page.getByRole('button',{name:/Resume .*saved game/}).count(),0);
  await page.locator('#quickFive').click();
  assert.match(await page.locator('#who').textContent(),/Player 2/);
  assert.equal(await page.locator('#turn').textContent(),'Question 1 of 5');
  assert.equal(await page.locator('#scoreboard .score').count(),1);
  assert.equal(await page.locator('#scoreboard strong').textContent(),'0');
  await page.locator('#typedAnswer').fill('42');await page.reload();await page.getByRole('button',{name:/Resume Player 2/}).click();assert.equal(await page.locator('#typedAnswer').inputValue(),'42');
  await page.locator('#typedAnswer').fill('1000000');await page.locator('#checkTyped').click();
  await page.locator('#next').click();
  await page.locator('#restart').click();
  await page.getByRole('button',{name:/Resume Player 2/}).click();
  assert.equal(await page.locator('#turn').textContent(),'Question 2 of 5');
  await page.locator('#restart').click();
  await page.locator('#quickFive').click();
  assert.equal(await page.locator('#turn').textContent(),'Question 1 of 5');
  const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('mathFactRally.v2')).progress);
  assert(Object.keys(history['player 1']||{}).length>0);assert(Object.keys(history['player 2']||{}).length>0);
  await page.goto(base+'/labs/grammar-grove');
  await page.locator('#response').selectOption('type');
  await page.locator('[data-start="words"]').click();
  await page.locator('#grammar-typed').fill('ADJECTIVE');
  await page.locator('#check').click();
  assert.match(await page.locator('#feedback').textContent(),/Beautiful work/);
  await page.locator('#home').click();
  await page.locator('[data-start="diagram"]').click();
  assert.match(await page.locator('#score').textContent(),/0 points/);
  const fields=page.locator('[data-part-answer]');
  assert.equal(await fields.count(),2);
  await fields.nth(0).fill('Birds');await fields.nth(1).fill('sing');await page.locator('#check').click();
  assert.match(await page.locator('#feedback').textContent(),/Beautiful work/);
  assert.equal(await fields.nth(0).isDisabled(),true);
  // Grammar retains unfinished answers and resumes after the last graded question.
  await page.reload();await page.locator('#grammar-resume').click();
  assert.equal(await page.locator('#sentence').textContent(),'Flowers bloom.');
  assert.equal(await page.locator('#score').textContent(),'10 points');
  await page.locator('[data-part-answer]').nth(0).fill('Flowers');await page.locator('[data-part-answer]').nth(1).fill('bloom');await page.locator('#check').click();
  assert.equal(await page.locator('#score').textContent(),'20 points');
  await page.locator('#next').click();await page.locator('[data-part-answer]').nth(0).fill('Leaves');
  await page.reload();await page.locator('#grammar-resume').click();
  assert.equal(await page.locator('[data-part-answer]').nth(0).inputValue(),'Leaves');
  // The actual Latin template exposes the main controls outside collapsed options.
  await page.goto(base+'/labs/latin-quest');
  for(const id of ['lq-mode','lq-word-type','lq-response','lq-reviewed-only'])assert.equal(await page.locator('#'+id).evaluate(n=>!!n.closest('details')),false);
  await page.locator('#lq-quick-five').click();
  const prompt=await page.locator('#lq-question').textContent();await page.locator('#lq-answer').fill(prompt.includes('via')?'road':'carry');await page.locator('#lq-check').click();
  await page.reload();await page.getByRole('button',{name:/Resume Player 1/}).click();
  assert.equal(await page.locator('#lq-round').textContent(),'Question 2 of 2');
  const latinProgress=await page.evaluate(()=>JSON.parse(localStorage.getItem('faithsparks.latinQuest.player.player-1.progress.v1')));
  assert.equal(Object.values(latinProgress).reduce((n,r)=>n+r.attempts,0),1);
  for(const [game,url,title]of [['geo','/labs/geo-detectives','Geo Detectives'],['math','/labs/math-fact-adventure','Math Fact Adventure'],['latin','/labs/latin-quest','Latin Quest'],['grammar','/labs/grammar-grove','Grammar Grove']]){
   await page.goto(base+url);
   assert.equal(await page.locator('.labs-family a[aria-current="page"]').textContent(),title);
   assert.equal(await page.locator('.labs-family a').count(),5);
   await page.getByRole('button',{name:'Copy game link to share'}).click();
   assert.equal(await page.evaluate(()=>window.__copiedGameLink),'https://faithsparksprintables.com'+url);
   assert.match(await page.locator('.labs-copy-status').textContent(),/Learner names/);
  }
  const fallbackContext=await browser.newContext();await fallbackContext.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:undefined}));const fallbackPage=await fallbackContext.newPage();await fallbackPage.goto(base+'/labs/grammar-grove');await fallbackPage.getByRole('button',{name:'Copy game link to share'}).click();assert.equal(await fallbackPage.locator('.labs-share-fallback input').inputValue(),'https://faithsparksprintables.com/labs/grammar-grove');await fallbackContext.close();
  for(const width of [1360,390]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/labs/geo-detectives');
   if(await page.getByRole('button',{name:'Choose trail',exact:false}).count())await page.getByRole('button',{name:'Choose trail',exact:false}).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.goto(base+'/labs/grammar-grove');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.goto(base+'/labs/latin-quest');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  }
  assert.deepEqual(errors,[]);
  console.log('Geo narration/cache/typed grading, math operation mixing/answer modes, Grammar typed grading, desktop/phone overflow passed.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
