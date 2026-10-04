const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.argv[2]||'faithsparks/content/lab_games/same-brain.html','utf8');
for(const [,script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
function harness(){
 const storage=new Map();const c={console,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('var QUESTIONS='),html.indexOf('var COSMETIC_META=')),c);
 vm.runInContext(html.slice(html.indexOf('function shuffled('),html.indexOf('function qById(')),c);
 return {c,storage};
}
const {c,storage}=harness();
const plain=x=>JSON.parse(JSON.stringify(x));
assert.ok(c.QUESTIONS.length>=1515);
assert.equal(new Set(c.QUESTIONS.map(q=>q.id)).size,c.QUESTIONS.length);
assert.equal(new Set(c.QUESTIONS.map(q=>q.q.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))).size,c.QUESTIONS.length);
assert.deepEqual(plain(c.QUESTION_BANK_AUDIT),[]);
for(const q of c.QUESTIONS){assert.ok(q.q.trim()&&!q.q.includes('{{'));assert.ok(q.a.length>=2&&q.a.length<=4);assert.ok(q.a.every(a=>a.length===2&&a.every(v=>typeof v==='string'&&v.trim())));}
for(const aud of ['everyone','kids','tween','mixed']){
 c.state.audience=aud;
 const pool=c.audiencePool(c.QUESTIONS,aud);
 if(aud!=='everyone')assert.ok(pool.length>=140);
 for(const count of [5,10]){
  c.state.count=count;
  for(const pack of ['random',...Object.keys(c.PACKS),...c.EXTRA_DECKS.map(d=>d.key)]){
   storage.clear();let last=[];
   for(let game=0;game<45;game++){
    const selected=c.questionSet(pack),ids=selected.map(q=>q.id);
    assert.equal(ids.length,count,`${aud}/${pack}/${count}`);
    assert.equal(new Set(ids).size,count);
    assert.ok(ids.every(id=>!last.includes(id)),`Immediate repeat: ${aud}/${pack}/${game}`);
    assert.ok(selected.every(q=>aud==='everyone'||q.aud?.includes(aud)));
    c.rememberQuestions(ids);last=ids;
   }
  }
 }
 storage.clear();c.state.count=5;const daily=c.questionSet('daily').map(q=>q.id);c.rememberQuestions(daily);
 assert.deepEqual(c.questionSet('daily').map(q=>q.id),daily);
}
// Exhausted pools must keep ALL unseen questions and fill from the oldest seen.
c.state.audience='kids';c.state.count=5;
const original=c.QUESTIONS;c.QUESTIONS=original.filter(q=>q.aud?.includes('kids')).slice(0,12);
storage.clear();c.rememberQuestions(c.QUESTIONS.slice(0,10).map(q=>q.id));
const tail=c.questionSet('random').map(q=>q.id);
assert.ok(tail.includes(c.QUESTIONS[10].id)&&tail.includes(c.QUESTIONS[11].id));
assert.deepEqual(new Set(tail.slice(2)),new Set(c.QUESTIONS.slice(7,10).map(q=>q.id)));
c.QUESTIONS=original;
storage.clear();storage.set('same_brain_recent_questions',JSON.stringify(['legacy']));
assert.deepEqual(plain(c.recentQuestionIds('everyone')),['legacy']);assert.deepEqual(plain(c.recentQuestionIds('kids')),[]);
storage.set('same_brain_recent_questions:everyone','[]');assert.deepEqual(plain(c.recentQuestionIds('everyone')),[]);
storage.set('same_brain_recent_questions:kids','broken');assert.deepEqual(plain(c.recentQuestionIds('kids')),[]);
for(const [aud,limit] of [['everyone',300],['kids',140],['tween',140],['mixed',140]]){storage.clear();c.state.audience=aud;c.rememberQuestions(Array.from({length:400},(_,i)=>String(i)));assert.equal(c.recentQuestionIds(aud).length,limit)}
console.log('PASS: syntax, 1,515 unique questions, schema, audience isolation, 39,600 simulated games, daily stability, least-recent fallback, history migration and limits');
// Run the actual question renderer with a minimal DOM, including rapid taps.
const nodes=new Map();function element(){return {children:[],style:{},classList:{add(){},toggle(){}},setAttribute(){},addEventListener(name,fn){this[name]=fn},appendChild(child){this.children.push(child)}}}
c.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},createElement:element};
c.saveRun=()=>{};c.track=()=>{};c.show=()=>{};c.setTimeout=()=>{};
vm.runInContext(html.slice(html.indexOf('function qById('),html.indexOf('function hydrateCustomQuestions(')),c);
vm.runInContext(html.slice(html.indexOf('function renderQuestion('),html.indexOf('async function finishQuestions(')),c);
c.QUESTIONS.push({id:'custom_test',q:'Test?',a:[['✨','<img src=x onerror=alert(1)>'],['✨','Safe']]});
for(const mode of ['creator','responder','together_player','group_creator','group_responder']){
 storage.clear();nodes.clear();c.state={mode,audience:'kids',questionIds:['custom_test'],answers:[]};c.renderQuestion();
 assert.deepEqual(plain(c.recentQuestionIds('kids')),['custom_test']);
 const buttons=nodes.get('choices').children;assert.ok(buttons[0].innerHTML.includes('&lt;img'));assert.ok(!buttons[0].innerHTML.includes('<img'));
 buttons[0].click();buttons[1].click();assert.equal(c.state.answers.length,1);
}
console.log('PASS: all play modes remember displayed questions; custom labels escaped; rapid double answers blocked');

// User-authored questions must never change anyone's Daily or Fresh bank.
c.QUESTIONS=original;c.state.audience='everyone';c.state.count=5;
const beforeCustom=c.questionSet('daily').map(q=>q.id);
c.QUESTIONS.push({id:'custom_private',q:'Private prompt?',a:[['','One'],['','Two']],tags:['custom']});
assert.deepEqual(c.questionSet('daily').map(q=>q.id),beforeCustom);
assert.ok(!c.audiencePool(c.QUESTIONS,'everyone').some(q=>q.id==='custom_private'));
assert.ok(c.RETIRED_QUESTION_IDS.length>0);
assert.ok(!c.audiencePool(c.QUESTIONS,'everyone').some(q=>q.retired));
console.log('PASS: custom questions cannot contaminate Daily/Fresh; retired IDs excluded from new games');
// Equipment persists locally, but an old selection cannot bypass account ownership.
const avatarBox={textContent:'',innerHTML:''};
c.document={getElementById:()=>avatarBox};c.localChoice=(k,f)=>storage.get(k)||f;
vm.runInContext(html.slice(html.indexOf('function applyAvatar('),html.indexOf('function renderCosmetics(')),c);
storage.set('same_brain_avatar_choice','avatar_owl');c.state.profile={unlocks:['avatar_owl'],plus:false};c.applyAvatar();assert.equal(avatarBox.textContent,'🦉');
c.state.profile={unlocks:[],plus:false};c.applyAvatar();assert.equal(avatarBox.textContent,'🧠');
storage.set('same_brain_avatar_choice','plus_crown');c.state.profile.plus=true;c.applyAvatar();assert.equal(avatarBox.textContent,'👑');
c.state.profile.plus=false;c.applyAvatar();assert.equal(avatarBox.textContent,'🧠');
storage.set('same_brain_avatar_choice','avatar_rainbow');c.applyAvatar();assert.equal(avatarBox.textContent,'🧠');
storage.set('same_brain_avatar_choice','selfie');storage.set('same_brain_selfie_avatar','javascript:alert(1)');c.applyAvatar();assert.equal(avatarBox.textContent,'🧠');
console.log('PASS: saved avatar selection respects earned/Plus ownership; retired rainbow and invalid selfies fall back safely');
// A fresh async rematch must drop the invitation query before saving progress.
let replacedPath;
c.history={replaceState:(_,__,path)=>{replacedPath=path}};c.location={pathname:'/same-brain'};
c.track=()=>{};c.newRunId=()=> 'rematch_test';c.rememberName=()=>{};c.rememberedName=()=> 'Friend';c.renderQuestion=()=>{};
c.state={rematchTarget:'Host',rematchSelfName:'Friend',rematchMode:'async',audience:'everyone',score:60,profile:{}};
vm.runInContext(html.slice(html.indexOf('async function startRematch('),html.indexOf('function renderResult(')),c);
c.startRematch().then(()=>{assert.equal(replacedPath,'/same-brain');assert.equal(c.state.mode,'creator');assert.equal(c.state.rematchTarget,'Host');console.log('PASS: async rematch clears stale invitation URL before saving the new run')}).catch(e=>{console.error(e);process.exitCode=1});
