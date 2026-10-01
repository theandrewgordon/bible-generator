const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('faithsparks/content/lab_games/same-brain.html','utf8');
const handlers={},played=[],blobs=[],pending=[];
const button={setAttribute(){},addEventListener(n,fn){handlers[n]=fn}};
const c={console,state:{answers:[],questionIds:['q'],profile:{plus:true}},document:{getElementById:id=>id==='voice-select'?{value:'marin'}:button},qById:()=>({id:'q',q:'Pick?',a:[['','Tea'],['','Coffee']]}),questionSpeech:q=>q.q,csrf:()=>'',serviceBase:()=>'/test',AbortController,URL:{createObjectURL:b=>b,revokeObjectURL(){}},Audio:class{constructor(url){this.url=url}play(){played.push(this.url);return Promise.resolve()}pause(){}},fetch:()=>new Promise(resolve=>pending.push(resolve)),window:{},alert(){}};
vm.createContext(c);vm.runInContext(html.slice(html.indexOf('var narrationGeneration='),html.indexOf('if(document.getElementById("plus-ten-challenge"))')),c);
(async()=>{
 const first=handlers.click();pending.shift()({ok:true,blob:()=>new Promise(r=>blobs.push(r))});await new Promise(setImmediate);assert.equal(blobs.length,1);
 c.stopNarration();const second=handlers.click();pending.shift()({ok:true,blob:async()=> 'new-audio'});await second;
 blobs.shift()('stale-audio');await first;assert.deepEqual(played,['new-audio']);
 c.stopNarration();assert.equal(c.narrationPlaying,false);
 console.log('PASS: late TTS blob cannot overlap/restart a newer narration; stop cancels playback');
})().catch(e=>{console.error(e);process.exit(1)});
