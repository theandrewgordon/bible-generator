'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync('frontend/learning-labs/math/engine.js','utf8');
const cycle=code.slice(code.indexOf('function operationCycle('),code.indexOf('function buildSequence('));
const build=code.slice(code.indexOf('function buildSequence('),code.indexOf('function score('));
for(const order of [a=>a.slice(),a=>a.slice().reverse()]){
 for(const turns of [1,4,5,10,20]){
  const sequence=new Function('shuffle',cycle+'return operationCycle;')(order)(['Addition','Subtraction','Multiplication','Division'],turns);
  for(let i=0;i<turns;i+=4){const batch=sequence.slice(i,i+4);assert.equal(new Set(batch).size,batch.length)}
  for(let i=1;i<sequence.length;i++)assert.notEqual(sequence[i],sequence[i-1]);
 }
}
for(const focus of ['all','review','number']){
 const run=new Function('shuffle','players','get','freshFor','recordKey','settings','window',
  'let sequence=[];'+cycle+build+'buildSequence();return sequence;');
 const asked=[];
 const players=[{name:'A',operations:['Addition','Subtraction','Multiplication','Division'],focus},{name:'B',operations:['Division','Multiplication'],focus}];
 const out=run(a=>a.slice(),players,()=>({value:'10'}),(p,used)=>{assert.equal(p.operations.length,1);const q={operation:p.operations[0],a:asked.length,b:2,answer:0};asked.push(p);return q},q=>q.operation+q.a,{}, {LabsUI:{prepareTask:q=>q}});
 assert.equal(out.length,20);
 for(let learner=0;learner<2;learner++){const own=out.filter((_,i)=>i%2===learner),width=players[learner].operations.length;for(let i=0;i<own.length;i+=width)assert.equal(new Set(own.slice(i,i+width).map(q=>q.operation)).size,own.slice(i,i+width).length)}
}
console.log('Per-learner operation cycles passed for all, number and review focus.');
