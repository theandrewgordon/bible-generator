/* Math Fact Adventure: deterministic curriculum and focus contract checks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('static/labs/math-fact-rally.html','utf8');
const mathSource=fs.readFileSync('frontend/learning-labs/math/index.html','utf8');
const mathStyles=fs.readFileSync('frontend/learning-labs/math/upgrade.css','utf8');
// Deployment rebuilds static HTML from these Vite source files, not the checked-in generated page.
const approvedArtDir='frontend/learning-labs/math/art/';
const approvedStage=fs.readFileSync(approvedArtDir+'approved-landing-artwork.avif');
const approvedCards=fs.readFileSync(approvedArtDir+'approved-explorer-paintings.avif');
assert(approvedStage.length>10000&&approvedStage.toString('ascii',4,8)==='ftyp','Actual approved watercolor landing image must be packaged');
assert(approvedCards.length>2000&&approvedCards.toString('ascii',4,8)==='ftyp','Actual approved watercolor explorer images must be packaged');
assert(mathSource.includes('class="approved-math-landing"'),'Approved painting stage must wrap functional landing screen');
assert(mathStyles.includes("url('./art/approved-landing-artwork.avif')"),'Landing uses the real approved artwork file');
assert(mathStyles.includes("url('./art/approved-explorer-paintings.avif')"),'Explorer cards use original painted illustrations');
assert(mathSource.includes('id="math-players"') && mathSource.includes('id="math-quick"') && mathSource.includes('id="homePlay"'),'Play selectors, Quick 5 and start button remain wired');
assert(mathSource.includes('href="#math-guide"') && mathSource.includes('id="math-guide"'),'Home Help must reach illustrated guide');

assert(mathSource.includes('class="adventure-field-guide"'),'Illustrated Field Guide must be on landing screen');
assert(mathSource.includes('class="expedition-layout"'),'Practice Expedition must be in the playable screen');
assert(mathStyles.includes('.expedition-layout'),'Source CSS must style expedition panels');
assert(mathStyles.includes('.adventure-field-guide'),'Source CSS must style the landing Field Guide');
assert(mathStyles.includes("art/ambient-math-watercolor.svg"),'The Vite source must load the painted maths background');
assert(mathStyles.includes("art/practice-valley-watercolor.svg"),'The practice panel must load original watercolor landscape');
assert(mathSource.includes('src="./art/field-guide-journal-watercolor.svg"'),'Landing field guide must load its real illustrated asset');
assert(mathSource.includes('class="landing-title"'),'Landing page has the approved Ready for a Math Adventure headline');
assert(mathSource.includes('id="homePlay"') && mathSource.includes('id="homeEdit"') && mathSource.includes('id="homeReport"'),'Landing primary controls remain wired to their original IDs');
assert(mathSource.indexOf('id="homePlay"')<mathSource.indexOf('id="homeOptions"'),'Primary landing buttons must remain visible outside optional settings');

assert(mathSource.includes('<header class="journal-banner"><img src="./art/journal-1.webp"'),'Original masthead art must remain unchanged');
assert(mathSource.includes('id="mathChoices"')&&mathSource.includes('id="typedPractice"')&&mathSource.includes('id="gradeActions"'),'Play controls must be preserved');
assert((mathSource.match(/class="creation-note creation-game"/g)||[]).length===1,'One creation field note appears on each practice page');

assert(mathSource.includes('class="creation-note creation-setup"'),'Setup nature note must live in source');
assert(mathSource.includes('class="creation-note creation-game"'),'Practice nature note must live in source');
assert(mathSource.includes('class="creation-note creation-report"'),'Journal nature note must live in source');
assert(!mathSource.includes('class="nature-gallery"'),'Remove old faux-button nature cards from source');
assert(mathStyles.includes('.creation-note'),'Source CSS must include creation-note artwork styling');
assert(mathSource.includes('journal-1.webp'),'Original watercolor masthead asset must remain');

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
