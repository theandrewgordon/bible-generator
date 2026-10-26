// Exercise the actual template script with deterministic browser/audio mocks.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const template=fs.readFileSync('templates/labs_reading_quest.html','utf8');
const tasks=JSON.parse(fs.readFileSync('faithsparks/content/reading_quest.json','utf8'));
const cues={'Welcome to Reading Quest. Press play!':'welcome','Great work! You earned a star!':'success'};
tasks.forEach((t,i)=>{cues[t.say]=`${i}-say`;cues[t.help]=`${i}-help`});
const source=template.match(/<script>([\s\S]*?)<\/script>/)[1].replace('{{ reading_tasks|tojson }}',JSON.stringify(tasks)).replace('{{ reading_audio_cues|tojson }}',JSON.stringify(cues)).replace('{{ reading_csrf|tojson }}','"token"').replace("{{ url_for('public.reading_quest_tts')|tojson }}",'"/labs/reading-quest/tts"');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(fetch){const nodes={},played=[],spoken=[],revoked=[],events={};
 function element(){return {children:[],style:{},addEventListener(n,f){this[n]=f},replaceChildren(){this.children=[]},appendChild(b){this.children.push(b)}}}
 const context={document:{getElementById(id){return nodes[id]??=element()},createElement:element},window:{addEventListener(n,f){events[n]=f},speechSynthesis:true},speechSynthesis:{cancel(){},speak(u){spoken.push(u.text)}},SpeechSynthesisUtterance:function(t){this.text=t},Audio:function(url){this.pause=()=>{};this.play=async()=>{played.push(url)}},URL:{createObjectURL(){return 'blob:'+Math.random()},revokeObjectURL(u){revoked.push(u)}},AbortController,setTimeout,clearTimeout,fetch};
 vm.runInNewContext(source,context);return {nodes,played,spoken,revoked,events};}
const ok=()=>({ok:true,headers:{get:()=> 'audio/mpeg'},blob:async()=>({size:10})});
(async()=>{
 let calls=[];const a=setup(async(u,o)=>{calls.push(JSON.parse(o.body));assert.equal(o.cache,'no-store');return ok()});
 a.nodes['rq-hear'].click();await tick();a.nodes['rq-hear'].click();await tick();
 assert.equal(calls.length,1);assert.equal(a.played.length,2);assert.deepEqual(calls,[{cue:'welcome'}]);
 a.events.pagehide();assert.equal(a.revoked.length,1);
 let resolve;const b=setup(()=>new Promise(r=>resolve=r));
 b.nodes['rq-hear'].click();b.nodes['rq-hear'].click();resolve(ok());await tick();assert.equal(b.played.length,1);
 const c=setup(async()=>({ok:false}));c.nodes['rq-next'].click();await tick();assert.deepEqual(c.spoken,[tasks[0].say]);c.nodes['rq-hear'].click();await tick();assert.equal(c.spoken.length,2);
 const d=setup(async()=>{throw Error('network')});d.nodes['rq-hear'].click();await tick();assert.equal(d.spoken.length,1);
 console.log('Reading Quest audio: cache, deduplication, stale requests, and fallback passed');
})().catch(e=>{console.error(e);process.exit(1)});
