/* Math Fact Adventure: deterministic curriculum and focus contract checks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('static/labs/math-fact-rally.html','utf8');
const mathSource=fs.readFileSync('frontend/learning-labs/math/index.html','utf8');
const mathStyles=fs.readFileSync('frontend/learning-labs/math/upgrade.css','utf8');
const matEngine=fs.readFileSync('frontend/learning-labs/math/engine.js','utf8');
// Check the authored Vite sources: Docker replaces generated HTML on every release.
const artRoot='frontend/learning-labs/math/art/';
assert(mathSource.includes('<header class="journal-banner"><img src="./art/journal-1.webp"'),'Original illustrated masthead must remain unchanged');
assert(mathSource.includes('class="approved-math-landing"'),'Functional landing stage must remain');
assert(mathSource.includes('id="math-guide"')&&mathSource.includes('field-guide-watercolor.avif'),'Field guide must be illustrated and visible beneath landing panel');
assert(mathSource.includes('id="math-players"')&&mathSource.includes('id="math-quick"')&&mathSource.includes('id="homePlay"')&&mathSource.includes('id="homeEdit"'),'Learner, quick play and settings controls remain');
assert(mathSource.includes('id="homeOptions"')&&mathSource.includes('id="answerStyle"')&&mathSource.includes('id="exerciseStyle"'),'Answer style and exercise settings remain accessible');
assert.equal((mathSource.match(/data-math-operation=/g)||[]).length,5,'All five operation trails must be available');
for(const operation of ['Addition','Subtraction','Multiplication','Division','Exponents'])
 assert(mathSource.includes('data-math-operation="'+operation+'"'),'Illustrated operation trail: '+operation);
assert(matEngine.includes("document.querySelectorAll('[data-math-operation]')"),'Operation shortcuts must be interactive and open full settings');
for(const id of ['math','mathChoices','typedPractice','mathVoice','mathHintVoice','mathAnswerVoice','gradeActions','hintBtn','reveal','correct','assisted','incorrect','next','restart','undo','scoreboard','adventureProgress'])
 assert(mathSource.includes('id="'+id+'"'),'Practice control must remain: '+id);
assert.equal((mathSource.match(/class="creation-note creation-game"/g)||[]).length,1,'Exactly one field note per question');
for(const id of ['creationNoteArt','creationNoteTitle','creationNoteText','creationNoteVerse'])
 assert(mathSource.includes('id="'+id+'"'),'Field note must update dynamically: '+id);
for(const name of ['pinecone','honeycomb','sunflower','leaf','branching-tree','shell']){
 assert(fs.existsSync(artRoot+name+'-watercolor.avif'),'Original field-note watercolor study must exist: '+name);
 assert(matEngine.includes(name+'-watercolor.avif'),'Field study must be used during actual play: '+name);
}
assert(fs.existsSync(artRoot+'field-guide-watercolor.avif'),'Original painted field-guide asset must be packaged');
assert(mathStyles.includes('linear-gradient(155deg,#cadfc5'),'Background must use a subtle green-to-gold ombre');
assert(mathStyles.includes("body:before{content:"),'Floating math symbols belong on the outer background');
assert(!mathStyles.includes("url('./art/math-instruments-overlay.svg') center/1100px auto repeat"),'Parchment panels must remain free of background math illustrations');
const outerOverlay=fs.readFileSync(artRoot+'math-instruments-overlay.svg','utf8');
assert(outerOverlay.includes('class="outer-math left"')&&outerOverlay.includes('class="outer-math right"'),'Math tools must decorate both outer margins');
assert(outerOverlay.includes('π')&&outerOverlay.includes('7 × 6 = 42'),'Background includes mathematical notation');
assert(mathStyles.includes('./art/math-expedition-watercolor.avif'),'Original painted expedition trail cards must remain');
assert(fs.existsSync(artRoot+'math-expedition-watercolor.avif'),'Original watercolor landscape must exist');
assert(mathStyles.includes('math-instruments-overlay.svg'),'Math instrumentation must remain subtle background artwork');
assert(mathStyles.includes('.math-trail-card')&&mathStyles.includes('.creation-note.creation-game'),'Style expedition cards and field notes as part of the game');
assert(!mathStyles.includes('APPROVED ARTWORK RELEASE'),'Remove prior fragile positioned-painting layout and accumulated overrides');
assert(!mathSource.includes('class="nature-gallery"'),'Remove obsolete faux-button cards');
assert(matEngine.includes("mathFactRally.v2"),'Saved learner history must remain compatible');
const playerPicker=fs.readFileSync('static/js/labs-players.js','utf8');
assert(fs.existsSync(artRoot+'explorer-avatar-bank.webp'),'Original 12-portrait explorer icon sheet must be packaged');
assert(fs.existsSync(artRoot+'feminine-explorer-avatars.webp'),'Four feminine watercolor explorer icons must be included');
assert(matEngine.includes("id:'flower-doe',label:'Fox'"),'Feminine fox retains saved avatar ID while displaying the animal name');
assert(matEngine.includes("id:'flower-badger',label:'Badger'")&&matEngine.includes("id:'flower-lynx',label:'Lynx'"),'Feminine animal portraits use animal-only labels');
assert(matEngine.includes("explorer-avatar-bank.webp")&&matEngine.includes("id:'wolf'")&&matEngine.includes("id:'flower-lynx'")&&matEngine.includes("rows: 3"),'Math student picker must preserve the original twelve icons and add four feminine options');
// Reordering the picker must never change which portrait belongs to a label.
for(const [id,cell] of Object.entries({fox:0,owl:1,bear:2,rabbit:3,raccoon:4,squirrel:5,otter:6,deer:7,hedgehog:8,turtle:9,eagle:10,wolf:11})) {
  assert(matEngine.includes("id:'"+id+"',label:") && new RegExp("id:'"+id+"',label:'[^']+',cellIndex:"+cell+"(?:[,}])").test(matEngine), 'Explorer '+id+' must retain original portrait cell '+cell);
}
assert(matEngine.includes("id:'moose'") && matEngine.includes("id:'snowy-owl'"), 'Both new watercolor explorers must remain selectable');
assert(playerPicker.includes("avatarBank = null"),'Shared player picker must keep avatars optional for other games');
assert(playerPicker.includes("faithsparks.labs.avatars.v1"),'Student icon preferences must persist by profile identifier');
assert(playerPicker.includes("class: 'labs-avatar-option'"),'Explorer icon bank must have accessible buttons');
assert(mathStyles.includes(".labs-player-portrait")&&mathStyles.includes(".labs-avatar-grid"),'Selected portraits must be clipped inside player tiles and picker must be responsive');
assert(fs.readFileSync('frontend/learning-labs/build.mjs','utf8').includes('webp|png|jpg|svg|avif'),'Offline copy must inline painted AVIF artwork');

const code=fs.readFileSync('frontend/learning-labs/math/engine.js','utf8');
require('node:child_process').execFileSync(process.execPath,['--check','frontend/learning-labs/math/engine.js']);
const before=code.slice(code.indexOf('const OPERATIONS='),code.indexOf('const KEY='));
const generators=code.slice(code.indexOf('function calculate('),code.indexOf('function focusedQuestion('));
const focus=code.slice(code.indexOf('function focusedQuestion('),code.indexOf('function buildSequence('));
const runtime=new Function(before+generators+`
  const recordKey=q=>q.operation+':'+q.a+':'+q.b;
  const drawWeighted=list=>list[0];
  `+focus+`
  return {generated,calculate,focusedQuestion,freshFor,normalizeLevel};
`)();
const stages=['Trailhead','Basecamp','Pathfinder','Explorer','Summit'];
const ops=['Addition','Subtraction','Multiplication','Division','Exponents'];
assert.equal(runtime.normalizeLevel('Starter'),'Trailhead');
assert.equal(runtime.normalizeLevel('Builder'),'Basecamp');
assert.equal(runtime.normalizeLevel('Champion'),'Pathfinder');
let checked=0;
for(const stage of [...stages,'Mixed Levels']){
 for(const operation of ops){
  for(let i=0;i<400;i++){
   const q=runtime.generated(operation,stage);
   assert.equal(q.operation,operation);
   assert(stages.includes(q.level));
   assert(Number.isFinite(q.answer));
   assert(Math.abs(q.answer-runtime.calculate(operation,q.a,q.b))<1e-7);
   if(operation==='Division')assert.notEqual(q.b,0);
   checked++;
  }
  const used=new Set();
  for(let i=0;i<20;i++){
   const q=runtime.freshFor({name:'Test',operations:[operation],level:stage,focus:'number',number:7},used);
   assert(q,stage+' '+operation+' should have focused questions');
   assert(q.a===7||q.b===7,stage+' '+operation+' must include focus 7');
   used.add(operation+':'+q.a+':'+q.b);
  }
 }
}
assert(code.includes('mathFactRally.v2'),'Storage key must remain compatible');
assert(html.includes('Math Fact Adventure'),'Retain product name');
assert(code.includes('Patterns worth practicing'),'Retain weakness analysis');
assert(html.includes('/static/labs/learning/math/journal-'),'Retain watercolor illustration');
console.log('Math Fact Adventure:',checked,'verified generated facts and 600 focused selections.');
const reviewRuntime=new Function(before+generators+`
 const settings={answerStyle:'choice'};
 const records={'Addition:3:4:choice':{wrong:1,assisted:0,lastOutcome:'wrong',level:'Trailhead'},'Addition:8:1':{wrong:4,assisted:0,lastOutcome:'wrong',level:'Trailhead'}};
 const getProgress=()=>records;
 const recordKey=q=>q.operation+':'+q.a+':'+q.b+':choice';
 const drawWeighted=list=>list[0];
 `+focus+`
 return {freshFor,records};
`)();
const weak=reviewRuntime.freshFor({name:'Test',operations:['Addition'],level:'Trailhead',focus:'review'},new Set());
assert.equal(weak.a,3);assert.equal(weak.b,4);assert.equal(weak.answer,7);
console.log('Focused review selects the saved missed choice fact without mixing recall history.');
(async()=>{
 const {prepareTask,numberChoices}=await import('../frontend/learning-labs/shared/practice.js');let total=0;
 for(const stage of stages)for(const operation of ops)for(let n=0;n<60;n++){
  const fact=runtime.generated(operation,stage);
  for(const style of ['calculate','missing','story']){
   const q=prepareTask(fact,style);
   if(q.taskKind==='missing-a')assert(Math.abs(runtime.calculate(operation,q.answer,fact.b)-fact.answer)<1e-7);
   else if(q.taskKind==='missing-b')assert(Math.abs(runtime.calculate(operation,fact.a,q.answer)-fact.answer)<1e-7);
   else assert.equal(q.answer,fact.answer);
   const options=numberChoices(q.answer);assert.equal(options.length,3);assert.equal(options.filter(a=>a===q.answer).length,1);total++;
  }
 }
 console.log('Expanded task audit:',total,'calculation, missing-number and story pairs with unique choices passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
