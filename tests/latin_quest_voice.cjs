const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../static/js/latin-quest-core.js');
const source=fs.readFileSync('static/js/latin-quest.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const study=[{id:'noun-014',word:'terra',aliases:['terra','terrae'],fact:'gender',answer:'feminine',cue:'study:noun-014:gender'}];
function setup(){
 const nodes={},recognizers=[],sent=[],cache=new Map(),storage={};
 const node=id=>nodes[id]??={value:'',checked:false,hidden:false,textContent:'',children:[],addEventListener(n,f){this[n]=f;},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},closest(){return {title:''};}};
 node('lq-config').textContent=JSON.stringify({study,questions:Array.from({length:25},(_,i)=>({id:'noun-'+i+':meaning',card:'noun-'+i,mode:'meaning',prompt:'What does terra mean in English?',answers:['earth','land'],answer:'earth; land',details:'Noun. first declension. feminine.',hint:'Think of your card.'})),csrf:'test-token',audioVersion:'v1',ttsUrl:'/labs/latin-quest/tts'});
 for(const [id,value]of Object.entries({'lq-mode':'meaning','lq-size':'20','lq-voice':'coral','lq-pronunciation':'classical'}))node(id).value=value;
 class Recognition{constructor(){recognizers.push(this);}start(){this.started=true;}abort(){this.onend?.();}}
 const caches={open:async()=>({match:async k=>cache.has(k.url)?new Response(cache.get(k.url),{headers:{'Content-Type':'audio/mpeg'}}):null,put:async(k,r)=>cache.set(k.url,await r.arrayBuffer()),delete:async k=>cache.delete(k.url)}),keys:async()=>[],delete:async()=>true};
 const win={LatinQuestCore:core,SpeechRecognition:Recognition,caches,addEventListener(){}};
 const context={window:win,document:{getElementById:node,createElement:()=>node('child-'+Math.random())},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},caches,location:{origin:'https://latin.test'},Request,Response,AbortController,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,confirm:()=>true,Audio:function(){this.pause=()=>this.onpause?.();this.play=async()=>setImmediate(()=>this.onended?.());},fetch:async(u,options)=>{sent.push(JSON.parse(options.body));return new Response('audio',{headers:{'Content-Type':'audio/mpeg','X-TTS-Cache':'MISS'}});}};
 vm.runInNewContext(source,context);return {nodes,recognizers,sent,storage};
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
 a.nodes['lq-stop'].click();await tick();await tick();assert.equal(a.nodes['lq-study'].hidden,false);assert.match(a.nodes['lq-result-title'].textContent,/pause/);
 console.log('Latin Quest voice: spoken study lookup, fixed-cue audio, repeat reuse, unknown words, denied mic fallback and 20-question start passed.');
})().catch(e=>{console.error(e);process.exit(1);});
