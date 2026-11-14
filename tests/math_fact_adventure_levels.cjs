/* Math Fact Adventure: deterministic curriculum and focus contract checks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('static/labs/math-fact-rally.html','utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(code,'Game JavaScript exists');
new Function(code);
const before=code.slice(code.indexOf('const OPERATIONS='),code.indexOf('const KEY='));
const generators=code.slice(code.indexOf('function calculate('),code.indexOf('function bankLevel('));
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
assert(html.includes('mathFactRally.v2'),'Storage key must remain compatible');
assert(html.includes('Math Fact Adventure'),'Retain product name');
assert(html.includes('Patterns worth practicing'),'Retain weakness analysis');
assert(html.includes('data:image/webp;base64'),'Retain watercolor illustration');
console.log('Math Fact Adventure:',checked,'verified generated facts and 600 focused selections.');
