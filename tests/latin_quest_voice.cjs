const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../static/js/latin-quest-core.js');
const source=fs.readFileSync('static/js/latin-quest.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const study=[...Array.from({length:25},(_,i)=>({id:'noun-'+i,word:'testword'+i,aliases:['testword'+i],fact:'gender',answer:'feminine',cue:'study:noun-'+i+':gender'})),{id:'noun-014',word:'terra',aliases:['terra','terrae'],fact:'gender',answer:'feminine',cue:'study:noun-014:gender'}];
function setup(response='recall',initialStats={},customQuestions=null){
 const nodes={},recognizers=[],sent=[],cache=new Map(),storage={'faithsparks.latinQuest.progress.v1':JSON.stringify(initialStats)};
 const node=id=>nodes[id]??={value:'',checked:false,hidden:false,textContent:'',children:[],dataset:{},addEventListener(n,f){this[n]=f;},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},closest(){return {title:''};}};
 node('lq-config').textContent=JSON.stringify({study,questions:customQuestions||Array.from({length:25},(_,i)=>({id:'noun-'+i+':meaning',card:'noun-'+i,mode:'meaning',prompt:'What does terra mean in English?',answers:response==='choice'?['answer'+i]:['earth','land'],answer:response==='choice'?'answer'+i:'earth; land',details:'Noun. first declension. feminine.',hint:'Think of your card.'})),csrf:'test-token',audioVersion:'v1',ttsUrl:'/labs/latin-quest/tts'});
 for(const [id,value]of Object.entries({'lq-response':response,'lq-mode':'meaning','lq-size':'20','lq-voice':'coral','lq-pronunciation':'classical'}))node(id).value=value;
 node('lq-study-question');
 class Recognition{constructor(){recognizers.push(this);}start(){this.started=true;}abort(){this.onend?.();}}
 const caches={open:async()=>({match:async k=>cache.has(k.url)?new Response(cache.get(k.url),{headers:{'Content-Type':'audio/mpeg'}}):null,put:async(k,r)=>cache.set(k.url,await r.arrayBuffer()),delete:async k=>cache.delete(k.url)}),keys:async()=>[],delete:async()=>true};
 const win={LatinQuestCore:core,SpeechRecognition:Recognition,caches,addEventListener(){}};
 const context={window:win,document:{getElementById:node,createElement:()=>node('child-'+Math.random())},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},caches,location:{origin:'https://latin.test'},Request,Response,AbortController,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,confirm:()=>true,Audio:function(){this.pause=()=>this.onpause?.();this.play=async()=>setImmediate(()=>this.onended?.());},fetch:async(u,options)=>{sent.push(JSON.parse(options.body));return new Response('audio',{headers:{'Content-Type':'audio/mpeg','X-TTS-Cache':'MISS'}});}};
 vm.runInNewContext(source,context);return {nodes,recognizers,sent,storage,node};
}
(async()=>{
 const a=setup();a.nodes['lq-study-mic'].click();assert(a.recognizers[0].started);
 a.recognizers[0].onresult({results:[[{transcript:'What gender is terra?'}]]});await tick();await tick();
 assert.match(a.nodes['lq-study-result'].textContent,/terra.*feminine/);
 assert.equal(a.sent[0].cue,'study:noun-014:gender');assert.deepEqual(Object.keys(a.sent[0]).sort(),['cue','pronunciation','voice']);
 a.nodes['lq-study-repeat'].click();await tick();await tick();assert.equal(a.sent.length,1,'repeat must reuse the clip');
 a.nodes['lq-study-question'].value='What gender is porta?';a.nodes['lq-study-form'].submit({preventDefault(){}});await tick();assert.equal(a.sent.length,1);assert.match(a.nodes['lq-study-result'].textContent,/could not find/);
 a.nodes['lq-study-mic'].click();a.recognizers[1].onerror({error:'not-allowed'});assert.match(a.nodes['lq-study-status'].textContent,/Type your question/);
 a.nodes['lq-start'].click();await tick();await tick();assert.equal(a.nodes['lq-round'].textContent,'Question 1 of 20');assert(a.nodes['lq-study'].hidden);
 a.nodes['lq-mic'].click();a.recognizers[2].onresult({results:[[{transcript:'What gender is it?'}]]});await tick();await tick();
 assert.match(a.nodes['lq-followup-result'].textContent,/gender: feminine/);assert.equal(a.nodes['lq-round'].textContent,'Question 1 of 20');assert.equal(a.nodes['lq-answer'].disabled,false);assert.match(a.nodes['lq-followup-status'].textContent,/with help/);
 a.nodes['lq-mic'].click();a.recognizers[3].onresult({results:[[{transcript:'What gender is porta?'}]]});await tick();await tick();
 assert.match(a.nodes['lq-followup-result'].textContent,/not available/);assert.equal(a.nodes['lq-answer'].disabled,false,'unknown question must not be graded as an incorrect answer');
 a.nodes['lq-answer'].value='earth';a.nodes['lq-form'].submit({preventDefault(){}});await tick();await tick();
 assert.match(a.nodes['lq-feedback'].textContent,/little help/);
 a.nodes['lq-stop'].click();await tick();await tick();assert.equal(a.nodes['lq-score'].textContent,'0 / 1');assert.equal(a.nodes['lq-study'].hidden,false);assert.match(a.nodes['lq-result-title'].textContent,/pause/);
 const b=setup('choice');b.nodes['lq-start'].click();await tick();await tick();
 assert.equal(b.nodes['lq-options'].children.length,4);assert.equal(b.nodes['lq-form'].hidden,true);
 const optionSpeaker=b.nodes['lq-options'].children[0].children[1];const beforeHear=b.sent.length;optionSpeaker.click();await tick();await tick();assert.equal(b.sent.length,beforeHear+1);assert.match(b.sent.at(-1).cue,/^option:/);assert.equal(b.nodes['lq-after'].hidden,true,'listening must not choose an answer');optionSpeaker.click();await tick();await tick();assert.equal(b.sent.length,beforeHear+1,'option replay reuses cached audio');
 b.nodes['lq-options'].children[0].children[0].click();await tick();await tick();
 assert(b.nodes['lq-options'].children.every(n=>n.children[0].disabled));assert.equal(b.nodes['lq-after'].hidden,false);
 assert(b.nodes['lq-options'].children.some(n=>n.children[0].dataset.result==='correct'));
 const saved=JSON.parse(b.storage['faithsparks.latinQuest.progress.v1']);assert(Object.keys(saved).every(id=>id.endsWith(':choice')));
 b.nodes['lq-next'].click();await tick();await tick();assert.equal(b.nodes['lq-round'].textContent,'Question 2 of 20');assert(b.nodes['lq-options'].children.every(n=>!n.children[0].disabled));
 b.nodes['lq-stop'].click();await tick();await tick();assert.match(b.nodes['lq-result-copy'].textContent,/tracked separately/);
 b.nodes['lq-again'].click();b.nodes['lq-mode'].value='grammar';b.nodes['lq-mode'].change();assert.equal(b.nodes['lq-response'].disabled,true);assert.equal(b.nodes['lq-response'].value,'recall');
 const c=setup('recall',{'noun-0:meaning':{attempts:2,correct:2,streak:2},'noun-0:meaning:choice':{attempts:1,correct:1,streak:1},'verb-0:reverse':{attempts:3,correct:1,streak:0}});
 c.nodes['lq-reset-deck'].click();assert(JSON.parse(c.storage['faithsparks.latinQuest.progress.v1'])['noun-0:meaning']);c.nodes['lq-reset-cancel'].click();assert.equal(c.nodes['lq-reset-confirm'].hidden,true);c.nodes['lq-reset-deck'].click();c.nodes['lq-reset-accept'].click();let reset=JSON.parse(c.storage['faithsparks.latinQuest.progress.v1']);assert(!reset['noun-0:meaning']);assert(reset['noun-0:meaning:choice']);assert(reset['verb-0:reverse']);assert.equal(c.nodes['lq-undo-reset'].hidden,false);
 c.nodes['lq-undo-reset'].click();assert(JSON.parse(c.storage['faithsparks.latinQuest.progress.v1'])['noun-0:meaning']);
 c.nodes['lq-retest'].click();await tick();await tick();assert.equal(c.nodes['lq-round'].textContent,'Question 1 of 20');
 const calls=c.sent.length;c.nodes['lq-answer'].value='earth';c.nodes['lq-form'].submit({preventDefault(){}});await tick();await tick();assert.equal(c.sent.length,calls,'correct answer feedback is silent');
 c.nodes['lq-stop'].click();await tick();await tick();assert.equal(c.sent.length,calls,'scores and pause messages are silent');
 c.nodes['lq-study-question'].value='What gender is terra?';c.nodes['lq-study-form'].submit({preventDefault(){}});await tick();await tick();
 c.nodes['lq-resume'].click();await tick();assert.equal(c.nodes['lq-session'].hidden,false);assert.equal(c.nodes['lq-round'].textContent,'Question 1 of 20');assert.equal(c.nodes['lq-after'].hidden,false,'resume must retain answered question');c.nodes['lq-next'].click();await tick();await tick();assert.equal(c.nodes['lq-round'].textContent,'Question 2 of 20');c.nodes['lq-stop'].click();
 const previous=JSON.stringify(c.storage);c.nodes['lq-retest-same'].click();await tick();await tick();assert.equal(c.nodes['lq-round'].textContent,'Question 1 of 20');assert.equal(JSON.stringify(c.storage),previous,'retesting must not erase progress');
 const speech=setup();speech.nodes['lq-start'].click();await tick();await tick();speech.nodes['lq-mic'].click();speech.recognizers[0].onresult({results:[[{transcript:'window'},{transcript:'land'}]]});await tick();assert.match(speech.nodes['lq-feedback'].textContent,/Correct/,'a valid recognition alternative should count');
 const d=setup('choice');d.nodes['lq-start'].click();await tick();await tick();d.nodes['lq-reveal'].click();await tick();await tick();assert.equal(d.nodes['lq-options'].children.filter(n=>n.children[0].dataset.result==='correct').length,1,'reveals highlight the correct choice');
 if(process.env.LATIN_QUEST_BANK){
  const bank=JSON.parse(fs.readFileSync(process.env.LATIN_QUEST_BANK,'utf8'));
  for(const mode of ['meaning','reverse','nouns','verbs','grammar','mixed'])for(const response of (['meaning','reverse'].includes(mode)?['recall','choice']:['recall'])){
   const run=setup(response,{},bank);run.nodes['lq-mode'].value=mode;run.nodes['lq-size'].value='140';run.nodes['lq-retest'].click();await tick();await tick();let answered=0;
   while(!run.nodes['lq-session'].hidden&&answered<141){
    const prompt=run.nodes['lq-question'].textContent,q=bank.find(q=>q.prompt===prompt&&(mode==='mixed'?q.mode!=='reverse':q.mode===mode));assert(q,'visible prompt must match an approved card');
    if(response==='choice'){const row=run.nodes['lq-options'].children.find(row=>core.matches(q,row.children[0].value));assert(row);row.children[0].click();row.children[0].click();}
    else{run.nodes['lq-answer'].value=q.answers.at(-1);run.nodes['lq-form'].submit({preventDefault(){}});run.nodes['lq-form'].submit({preventDefault(){}});}
    await tick();await tick();assert.match(run.nodes['lq-feedback'].textContent,/Correct/);answered++;run.nodes['lq-next'].click();await tick();await tick();
   }
   assert(answered>0&&answered<=140);assert.equal(run.nodes['lq-score'].textContent,answered+' / '+answered);assert.equal(Object.values(JSON.parse(run.storage['faithsparks.latinQuest.progress.v1'])).reduce((sum,s)=>sum+s.attempts,0),answered,'double tapping must not double count');assert(!run.sent.some(x=>/^(score-|count-|correct$|complete$|paused$)/.test(x.cue)),'stats and celebrations remain silent');
   console.log('Full approved-deck playthrough:',mode,response,answered,'questions passed');
  }
  for(const q of bank){
   const run=setup('recall',{},[q]);run.nodes['lq-mode'].value=q.mode;run.nodes['lq-start'].click();await tick();await tick();run.nodes['lq-answer'].value=q.answers.at(-1);run.nodes['lq-form'].submit({preventDefault(){}});await tick();assert.match(run.nodes['lq-feedback'].textContent,/Correct/,q.id);run.nodes['lq-next'].click();assert.equal(run.nodes['lq-score'].textContent,'1 / 1',q.id);
   if(['meaning','reverse'].includes(q.mode))for(let n=0;n<10;n++){const choices=core.choicesFor(q,bank);assert.equal(choices.length,4,q.id);assert.equal(choices.filter(a=>core.matches(q,a)).length,1,q.id);}
  }
  console.log('Every approved question variant passed:',bank.length);
 }
 const handlers={},deleted=[];vm.runInNewContext(fs.readFileSync('static/service-worker.js','utf8').replace('__STATIC_VERSION__','test-deploy'),{self:{addEventListener:(n,f)=>handlers[n]=f,clients:{claim(){}},skipWaiting(){}},caches:{keys:async()=>['faithsparks-old','faithsparks-test-deploy','faithsparks-latin-voice-v1','other-app'],delete:async name=>deleted.push(name)}});let activation;handlers.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(deleted,['faithsparks-old'],'deploy cleanup must preserve Latin audio');
 console.log('Resume, reveal highlighting, reset confirmation/cancel/undo, quiet feedback, and deploy-safe audio caching passed.');
 console.log('Latin Quest voice: spoken study lookup, fixed-cue audio, repeat reuse, unknown words, denied mic fallback 20-question start, in-session follow-ups, and assisted scoring passed.');
})().catch(e=>{console.error(e);process.exit(1);});
