import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {initial,reducer,restore,shuffled,reviewIds,selectPracticeIds} from '../geo/logic.js';
import {matchesTerm} from '../geo/answers.js';
test('expanded original cases and comparisons remain valid and illustrated',()=>{const d=JSON.parse(fs.readFileSync(new URL('../geo/data.json',import.meta.url)));assert.equal(d.quest.length,125);assert.equal(d.compare.length,55);assert.equal(new Set([...d.quest,...d.compare].map(q=>q.id)).size,180);for(const q of d.quest){assert.equal(q.clues.length,3);assert.equal(q.choices.length,3);assert(q.choices.includes(q.answer))}for(const q of d.compare){assert.equal(q.terms.length,2);assert.notEqual(q.arts[0],q.arts[1]);assert(q.explanation)}});
test('one award per case; team alternation; exact undo restores learner progress',()=>{let s=reducer({...initial,playMode:'teams'},{type:'start',ids:['g1','g2']});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});assert.deepEqual(s.scores,[3,0]);assert.equal(reducer(s,{type:'award',id:'g1',points:3}),s);s=reducer(s,{type:'next',length:2});assert.equal(s.team,1);s=reducer(s,{type:'clue'});s=reducer(s,{type:'award',id:'g2',points:2,correct:true});assert.deepEqual(s.scores,[3,2]);assert.equal(s.progress['player-2'].g2.assisted,1);s=reducer(s,{type:'next',length:2});assert.equal(s.screen,'summary');s=reducer(s,{type:'undo'});assert.deepEqual(s.scores,[3,0]);assert.equal(s.screen,'play');assert.equal(s.team,1);assert.equal(s.index,1);assert(!s.answers.g2);assert(!s.progress['player-2']);s=reducer(s,{type:'undo'});assert.deepEqual(s.scores,[0,0]);assert.equal(s.index,0)});
test('wrong answers and reveals record zero; history stays bounded',()=>{let s=initial;for(let i=0;i<100;i++)s=reducer(s,{type:'award',id:'g'+i,points:0,correct:false});assert.equal(s.rounds,100);assert.deepEqual(s.scores,[0,0]);assert.equal(s.history.length,20);assert(JSON.stringify(s).length<600000)});
test('changing options or learner starts a fresh session while retaining learning history',()=>{let s=reducer(initial,{type:'award',id:'g1',points:0,correct:false});s=reducer(s,{type:'filter',key:'mode',value:'compare'});assert.deepEqual(s.scores,[0,0]);assert(s.progress['player-1'].g1);assert.equal(s.index,0);assert.equal(s.session,null);const ids=['g1','g2','g3'];assert.deepEqual(new Set(shuffled(ids,()=>0)),new Set(ids));assert.deepEqual(ids,['g1','g2','g3'])});
test('review is per learner and removes independently recalled cases',()=>{let s=reducer(initial,{type:'start',ids:['g1']});s=reducer(s,{type:'award',id:'g1',points:0,correct:false});assert.deepEqual(reviewIds(s),['g1']);assert.deepEqual(reviewIds(s,'player-2'),[]);s=reducer(s,{type:'start',ids:reviewIds(s),review:true});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});assert.deepEqual(reviewIds(s),[]);assert.equal(s.progress['player-1'].g1.wrong,1);assert.equal(s.progress['player-1'].g1.right,1)});
test('solo stays on the selected learner and pauses/resumes without losing scores',()=>{let s=reducer(initial,{type:'start',ids:['g1','g2']});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});s=reducer(s,{type:'next',length:2});assert.equal(s.team,0);s=reducer(s,{type:'home'});s=restore(JSON.stringify(s));assert.equal(s.index,1);s=reducer(s,{type:'resume'});assert.equal(s.screen,'play');assert.deepEqual(s.scores,[3,0])});
test('restore rejects corrupt saved data and migrates the previous expedition format',()=>{assert.equal(restore('not json'),initial);assert.equal(restore('{}'),initial);assert.equal(restore(JSON.stringify({...initial,scores:[-2,3]})),initial);const old={mode:'quest',index:0,scores:[3,2],names:['A','B'],team:0};assert.equal(restore(JSON.stringify(old)).screen,'home');assert.deepEqual(restore(JSON.stringify(old)).scores,[3,2]);});
test('reviewed choices do not oppose overlapping geographic names',()=>{const d=JSON.parse(fs.readFileSync(new URL('../geo/data.json',import.meta.url)));const policy=JSON.parse(fs.readFileSync(new URL('../geo/content-policy.json',import.meta.url)));for(const q of d.quest){assert.equal(q.reviewed,'2026-11-16');assert.equal(q.provenance,'FaithSparks original wording');assert(q.topic);for(const family of policy.overlapping_families)if(family.includes(q.answer))assert.equal(q.choices.filter(c=>family.includes(c)).length,1,q.id+' offers overlapping answers');}for(const id of ['g4','g5'])assert(d.quest.find(q=>q.id===id).clues.some(c=>/not universal|no universal|no worldwide|no exact.*rule/.test(c)));assert(/no universal|no worldwide|no exact.*rule/.test(d.compare.find(q=>q.id==='c1').explanation));});
test('every illustration class exists and every prompt is distinct',()=>{const d=JSON.parse(fs.readFileSync(new URL('../geo/data.json',import.meta.url)));const styles=['art.css'];const app=fs.readFileSync(new URL('../geo/main.jsx',import.meta.url),'utf8');if(app.includes("import './art-replacements.css';"))styles.push('art-replacements.css');const css=styles.map(name=>fs.readFileSync(new URL('../geo/'+name,import.meta.url),'utf8')).join('\n');const classes=new Set([...css.matchAll(/\.([a-z0-9-]+)\s*\{/g)].map(match=>match[1]));for(const art of [...d.quest.map(q=>q.art),...d.compare.flatMap(q=>q.arts)])assert(classes.has(art),art);assert.equal(new Set(d.quest.map(q=>q.clues.join('|'))).size,d.quest.length)});
test('clue help survives question navigation, shuffle and reload',()=>{let s=reducer(initial,{type:'start',ids:['g4','g5']});s=reducer(s,{type:'clue'});s=reducer(s,{type:'clue'});assert.equal(s.clue,3);s=reducer(s,{type:'jump',index:1});assert.equal(s.clue,1);s=reducer(s,{type:'jump',index:0});assert.equal(s.clue,3);s=reducer(s,{type:'mix-remaining',ids:['g4','g5']});assert.equal(s.clue,3);s=restore(JSON.stringify(s));assert.equal(s.clue,3);s=reducer(s,{type:'award',id:'g4',correct:true,points:4-s.clue});assert.equal(s.answers.g4.points,1);assert.equal(s.answers.g4.outcome,'assisted')});

test('selecting an active option does not discard a paused expedition',()=>{let s=reducer(initial,{type:'start',ids:['g1','g2']});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});s=reducer(s,{type:'home'});for(const key of ['mode','topic','level','playMode','learner'])assert.equal(reducer(s,{type:'filter',key,value:s[key]}),s)});
test('reviewing an earlier team answer cannot steal the pending turn',()=>{let s=reducer({...initial,playMode:'teams'},{type:'start',ids:['g1','g2','g3','g4']});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});s=reducer(s,{type:'next',length:4});s=reducer(s,{type:'award',id:'g2',points:3,correct:true});s=reducer(s,{type:'next',length:4});assert.equal(s.team,0);s=reducer(s,{type:'jump',index:1});assert.equal(s.team,1);s=reducer(s,{type:'jump',index:2});assert.equal(s.team,0);s=reducer(s,{type:'award',id:'g3',points:3,correct:true});assert.deepEqual(s.scores,[6,3]);assert.equal(s.answers.g3.learner,'player-1')});
test('manual team ownership is remembered when revisiting an unanswered question',()=>{let s=reducer({...initial,playMode:'teams'},{type:'start',ids:['g1','g2','g3']});s=reducer(s,{type:'award',id:'g1',points:3,correct:true});s=reducer(s,{type:'next',length:3});s=reducer(s,{type:'team',team:0});s=reducer(s,{type:'jump',index:0});s=reducer(s,{type:'jump',index:1});assert.equal(s.team,0)});
test('skipping is distinct from a wrong answer and can be retried without losing clue help',()=>{let s=reducer(initial,{type:'start',ids:['g1','g2']});s=reducer(s,{type:'clue'});s=reducer(s,{type:'skip',id:'g1',points:0,correct:false});assert.equal(s.answers.g1.outcome,'skipped');assert.equal(s.progress['player-1'].g1.wrong,0);assert.equal(s.progress['player-1'].g1.skipped,1);assert.deepEqual(reviewIds(s),['g1']);s=reducer(s,{type:'retry-skipped',id:'g1'});assert(!s.answers.g1);assert(!s.progress['player-1'].g1);assert.equal(s.rounds,0);assert.equal(s.clue,2);s=reducer(s,{type:'award',id:'g1',points:2,correct:true});assert.equal(s.answers.g1.outcome,'assisted');assert.deepEqual(s.scores,[2,0])});
test('retrying a skipped known question restores its previous learning record exactly',()=>{const record={right:4,wrong:1,assisted:2,lastOutcome:'right'};let s={...initial,progress:{'player-1':{g1:record}}};s=reducer(s,{type:'start',ids:['g1']});s=reducer(s,{type:'skip',id:'g1',points:0,correct:false});s=reducer(s,{type:'retry-skipped',id:'g1'});assert.deepEqual(s.progress['player-1'].g1,record)});
test('reload retains five bounded undo snapshots and restores scores and progress exactly',()=>{let s=reducer(initial,{type:'start',ids:Array.from({length:7},(_,i)=>'g'+(i+1))});for(let i=1;i<=6;i++){s=reducer(s,{type:'award',id:'g'+i,points:3,correct:true});if(i<6)s=reducer(s,{type:'next',length:7})}s=restore(JSON.stringify(s));assert.equal(s.history.length,5);s=reducer(s,{type:'undo'});assert.deepEqual(s.scores,[15,0]);assert(!s.answers.g6);assert(!s.progress['player-1'].g6)});
test('new sessions spread across themes and use unseen cases before practiced cases',()=>{const cases=Array.from({length:18},(_,i)=>({id:'g'+i,topic:'theme'+(i%6)}));const first=selectPracticeIds(cases,{},5,()=>.5);assert.equal(first.length,5);assert.equal(new Set(first.map(id=>cases.find(q=>q.id===id).topic)).size,5);const progress=Object.fromEntries(first.map(id=>[id,{right:1}]));const next=selectPracticeIds(cases,progress,5,()=>.5);assert(!next.some(id=>first.includes(id)));assert.equal(new Set(selectPracticeIds(cases,{},0)).size,18)});

test('new field examples add a concrete scenario rather than repeat a clue',()=>{const d=JSON.parse(fs.readFileSync(new URL('../geo/data.json',import.meta.url)));for(const q of d.quest)assert(!q.clues.includes(q.example),q.id);assert.equal(d.quest.find(q=>q.id==='g92').answer,'lock');for(const q of d.compare)for(const [i,term] of q.terms.entries())if(term==='Moraine')assert.equal(q.arts[i],'art-diagram-moraine')});

test('four players rotate and score individually through pause and reload',()=>{
 let state=reducer(initial,{type:'filter',key:'playerCount',value:4});
 state=reducer(state,{type:'filter',key:'playMode',value:'players'});
 state=reducer(state,{type:'start',ids:['g1','g2','g3','g4','g5']});
 for(const [index,id] of state.session.ids.slice(0,4).entries()){
  assert.equal(state.team,index);
  state=reducer(state,{type:'award',id,points:index+1,correct:true});
  assert.equal(state.answers[id].learner,`player-${index+1}`);
  state=reducer(state,{type:'next',length:5});
 }
 state=restore(JSON.stringify(reducer(state,{type:'home'})));
 state=reducer(state,{type:'resume'});
 assert.equal(state.team,0);
 assert.deepEqual(state.scores,[1,2,3,4]);
 assert.equal(state.progress['player-4'].g4.right,1);
});

test('reset scores preserves the current question, answers and learning history, and can be undone',()=>{
 let state=reducer({...initial,playMode:'teams'},{type:'start',ids:['g1','g2']});
 state=reducer(state,{type:'award',id:'g1',points:3,correct:true});
 state=reducer(state,{type:'next',length:2});
 const reset=restore(JSON.stringify(reducer(state,{type:'reset-scores'})));
 assert.deepEqual(reset.scores,[0,0]);
 for(const key of ['index','team','session','answers','progress','rounds']){
  assert.deepEqual(reset[key],state[key]);
 }
 assert.deepEqual(reducer(reset,{type:'undo'}).scores,[3,0]);
 assert.deepEqual(reducer(reset,{type:'award',id:'g2',points:2,correct:true}).scores,[0,2]);
});

test('place trails have stable unique IDs and resume without changing vocabulary settings',async()=>{
 const {placeBranches,placeQuestions}=await import('../geo/places.js');
 const data=JSON.parse(fs.readFileSync(new URL('../geo/data.json',import.meta.url)));
 const ids=[...data.quest,...data.compare,...placeQuestions].map(card=>card.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.equal(placeQuestions.filter(card=>card.id.startsWith('g')).length,90);
 for(const branch of ['north-america','south-america','asia','africa','australia','antarctica']){
  assert.equal(placeBranches[branch].trails.length,2);
  assert.equal(placeQuestions.filter(card=>card.branch===branch&&card.id.startsWith('g')).length,5);
 }
 for(const card of placeQuestions){
  assert.equal(new Set(card.choices).size,3);
  assert.ok(card.choices.includes(card.answer));
  assert.equal(card.clues.length,3);
 }
 let state=reducer({...initial,mode:'compare',topic:'Land & ice'},{type:'branch',branch:'europe'});
 state=reducer(state,{type:'filter',key:'place',value:'France'});
 const france=placeQuestions.filter(card=>card.branch==='europe'&&card.place==='France');
 state=reducer(state,{type:'start',ids:france.map(card=>card.id)});
 state=restore(JSON.stringify(reducer(state,{type:'home'})));
 assert.equal(state.place,'France');
 assert.deepEqual(state.session.ids,france.map(card=>card.id));
 state=reducer(state,{type:'branch',branch:'vocabulary'});
 assert.equal(state.place,'all');
 assert.equal(state.mode,'compare');
 assert.equal(state.topic,'Land & ice');
 assert.equal(state.session,null);
});

test('capital trails cover 195 national jurisdictions, all 50 states, and one Antarctica question',async()=>{
 const {capitalQuestions,capitalTrailName}=await import('../geo/capitals.js');
 const totals={'north-america':23,'south-america':12,europe:44,asia:48,africa:54,australia:14,usa:50,antarctica:1};
 const outlines=new Set();
 for(const [branch,total] of Object.entries(totals)){
  const cards=capitalQuestions.filter(card=>card.branch===branch);
  assert.equal(cards.length,total);
  for(const card of cards){
   assert.equal(card.place,capitalTrailName(branch));
   const {outline,marker}=card.capitalMap;
   assert.match(outline,/^[MLZ0-9.,]+$/);
   assert(!outlines.has(outline));
   outlines.add(outline);
   if(branch==='antarctica'){
    assert.equal(marker,null);
    assert(matchesTerm('no',card));
   }else{
    assert.equal(marker.length,2);
    assert(marker[0]>=60&&marker[0]<=540&&marker[1]>=40&&marker[1]<=340);
   }
  }
 }
});
