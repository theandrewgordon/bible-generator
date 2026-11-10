(function(){
'use strict';
const config=JSON.parse(document.getElementById('lq-config').textContent),core=window.LatinQuestCore,$=id=>document.getElementById(id);
const STORE='faithsparks.latinQuest.progress.v1',CACHE='faithsparks-latin-voice-'+config.audioVersion;
let stats={},queue=[],position=0,score=0,completed=0,active=false,resolved=false,helped=false,currentCorrect=false,previousStat=null;
let studyCue=null;
let settings={},generation=0,audio=null,recognition=null,nextTimer=null;
const memory=new Map(),pending=new Map(),Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function notice(text){$('lq-notice').textContent=text;}
try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');for(const [key,value]of Object.entries(saved)){if(value&&Number.isInteger(value.attempts)&&value.attempts>=0&&Number.isInteger(value.correct)&&value.correct>=0&&Number.isInteger(value.streak)&&value.streak>=0&&value.streak<=9)stats[key]=value;}}catch(_){notice('Progress storage is unavailable. You can still practice this session.');}
function save(){try{localStorage.setItem(STORE,JSON.stringify(stats));}catch(_){notice('This browser could not save progress. Keep this page open to retain this session.');}}
function summary(){const practiced=new Set(Object.keys(stats).filter(id=>stats[id].attempts>0).map(id=>id.split(':')[0]));$('lq-progress-summary').textContent=practiced.size+' of 140 cards practiced on this device. Progress is shared by this browser profile.';}
function current(){return queue[position];}
function stopMedia(){generation++;clearTimeout(nextTimer);nextTimer=null;if(audio){audio.pause();audio=null;}if(recognition){const r=recognition;recognition=null;r.abort();}}
async function cachedClip(cue){
 const voice=settings.voice,pronunciation=settings.pronunciation;
 const key=[config.audioVersion,voice,pronunciation,cue].map(encodeURIComponent).join('/');
 if(memory.has(key))return {url:memory.get(key),origin:'device'};
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const requestKey=new Request(location.origin+'/labs/latin-quest/audio-cache/'+key);let cache;
  try{if('caches'in window){cache=await caches.open(CACHE);const hit=await cache.match(requestKey);if(hit){const blob=await hit.blob();if(blob.size&&blob.size<=2000000){const url=URL.createObjectURL(blob);memory.set(key,url);return{url,origin:'device'};}await cache.delete(requestKey);}}}catch(_){}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(config.ttsUrl,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf},body:JSON.stringify({cue,voice,pronunciation}),signal:controller.signal});
   if(!response.ok){throw new Error(response.status===429?'Voice is resting for a little while. You can keep practicing on screen.':'Voice is unavailable right now. You can keep practicing on screen.');}
   if(!response.headers.get('Content-Type')?.startsWith('audio/'))throw new Error('Voice is unavailable.');
   const blob=await response.blob();if(!blob.size||blob.size>2000000)throw new Error('Voice is unavailable.');
   if(cache){try{await cache.put(requestKey,new Response(blob,{headers:{'Content-Type':'audio/mpeg'}}));}catch(_){}}
   const url=URL.createObjectURL(blob);memory.set(key,url);return{url,origin:response.headers.get('X-TTS-Cache')==='HIT'?'shared':'new'};
  }finally{clearTimeout(timeout);}
 })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
async function speak(cue,allowInactive=false){
 stopMedia();const token=generation;$('lq-audio-status').textContent='Preparing OpenAI voice…';
 try{const clip=await cachedClip(cue);if(token!==generation||(!active&&!allowInactive))return false;
  $('lq-audio-status').textContent=clip.origin==='new'?'OpenAI voice · saved for replay':'OpenAI voice · playing saved audio';
  return await new Promise(resolve=>{const a=new Audio(clip.url);audio=a;a.onended=()=>{if(audio===a)audio=null;resolve(token===generation);};a.onerror=()=>{if(audio===a)audio=null;resolve(false);};a.onpause=()=>{if(!a.ended)resolve(false);};a.play().catch(()=>resolve(false));});
 }catch(error){if(token===generation)$('lq-audio-status').textContent=error.message==='The operation was aborted.'?'Voice took too long. Use Hear again to retry.':error.message;return false;}
}
function listen(){
 if(!Recognition||!active)return;
 stopMedia();const token=generation,r=new Recognition();recognition=r;r.lang='en-US';r.interimResults=false;r.continuous=false;r.maxAlternatives=3;
 $('lq-audio-status').textContent='Listening… give your answer, ask about this card, or say hint, repeat, next, or stop.';
 r.onresult=event=>{if(token!==generation||!active)return;recognition=null;const text=event.results[0][0].transcript;$('lq-answer').value=text;const command=core.normalize(text);
  // A valid vocabulary answer takes precedence over a generic voice shortcut.
  if(!resolved&&core.matches(current(),text)){check(text);return;}
  if(['stop','stop quest','stop latin quest','pause','pause quest','cancel','cancel quiz'].includes(command)){finish(true);return;}
  if(['repeat','repeat question','say it again'].includes(command)){repeatQuestion();return;}
  if(['hint','a hint','give me a hint'].includes(command)){hint();return;}
  if(['answer','show answer','reveal','tell me','skip','i do not know','i don t know'].includes(command)){reveal();return;}
  if(['next','next question'].includes(command)&&resolved){advance();return;}
  if(core.isStudyQuestion(text)){$('lq-answer').value='';askFollowup(text);return;}
  if(!resolved)check(text);
 };
 r.onerror=event=>{if(token!==generation)return;recognition=null;$('lq-audio-status').textContent=event.error==='not-allowed'?'Microphone access was not granted. Type your answer to continue.':'I did not catch that. Try the microphone again or type your answer.';};
 r.onend=()=>{if(recognition===r){recognition=null;$('lq-audio-status').textContent='Listening stopped. Try the microphone again or type your answer.';}};
 try{r.start();}catch(_){recognition=null;$('lq-audio-status').textContent='Microphone could not start. Type your answer to continue.';}
}
function questionCue(){return current().id+(settings.details?':details':':plain');}
async function repeatQuestion(){if(!active)return;const qid=current().id;const played=await speak(questionCue());if(played&&active&&current().id===qid&&settings.handsfree&&!resolved)listen();}
function paint(){
 stopMedia();resolved=false;helped=false;currentCorrect=false;const q=current();previousStat=stats[q.id]?{...stats[q.id]}:null;
 $('lq-round').textContent='Question '+(position+1)+' of '+queue.length;$('lq-bar').max=queue.length;$('lq-bar').value=position;
 $('lq-question').textContent=q.prompt;$('lq-meta').textContent=settings.details?q.details:'';$('lq-answer').value='';$('lq-answer').disabled=false;$('lq-check').disabled=false;
 $('lq-feedback').textContent='';$('lq-followup-details').open=false;$('lq-followup-question').value='';$('lq-followup-status').textContent='';$('lq-followup-result').textContent='';$('lq-followup-choices').replaceChildren();$('lq-after').hidden=true;for(const name of ['hint','reveal','skip'])$('lq-'+name).disabled=false;
 repeatQuestion();
}
function begin(review=false){
 stopMedia();settings={mode:$('lq-mode').value,voice:$('lq-voice').value,pronunciation:$('lq-pronunciation').value,details:$('lq-details').checked,handsfree:$('lq-auto').checked&&!!Recognition};
 queue=core.buildQueue(config.questions,settings.mode,Number($('lq-size').value),stats,review);
 if(!queue.length){notice('No missed cards in this practice mode yet. Start a quest or choose another mode.');return;}
 position=0;score=0;completed=0;active=true;notice('');$('lq-setup').hidden=true;$('lq-result').hidden=true;$('lq-session').hidden=false;$('lq-study').hidden=true;paint();
}
async function hint(){if(!active||resolved)return;helped=true;$('lq-feedback').textContent=current().hint;const played=await speak(current().id+':hint');if(played&&settings.handsfree&&!resolved)listen();}
async function resolve(correct){
 if(!active||resolved)return;stopMedia();resolved=true;currentCorrect=correct;completed++;if(correct&&!helped)score++;stats=core.record(stats,current(),correct,helped);save();summary();
 $('lq-answer').disabled=true;$('lq-check').disabled=true;for(const name of ['hint','reveal','skip'])$('lq-'+name).disabled=true;
 $('lq-feedback').textContent=correct?(helped?'You got it with a little help. We will revisit this card.':'Correct! One valid answer is enough.'):'Good try. Let us learn this card together.';
 $('lq-card-answer').textContent=current().answer;$('lq-after').hidden=false;$('lq-override').hidden=correct;$('lq-next').textContent=position+1===queue.length?'Finish quest →':'Next question →';$('lq-bar').value=completed;
 const token=generation;await speak(correct?'correct':current().id+':answer');
 // A new question or manual action invalidates this continuation.
 if(active&&resolved&&settings.handsfree&&generation===token+1)nextTimer=setTimeout(advance,3000);
}
function check(text){if(!String(text).trim()){ $('lq-feedback').textContent='Give one answer, or choose Show answer to study this card.';return;}resolve(core.matches(current(),text));}
function reveal(){if(!active||resolved)return;helped=true;resolve(false);}
function advance(){if(!active||!resolved)return;stopMedia();position++;if(position>=queue.length){finish(false);return;}paint();}
function override(){if(!active||!resolved||currentCorrect)return;stopMedia();if(previousStat)stats[current().id]=previousStat;else delete stats[current().id];stats=core.record(stats,current(),true,helped);save();if(!helped)score++;currentCorrect=true;$('lq-feedback').textContent='Marked correct together. Thanks for checking the meaning.';$('lq-override').hidden=true;summary();}
function finish(paused){
 if(!active)return;stopMedia();active=false;$('lq-session').hidden=true;$('lq-result').hidden=false;$('lq-result-title').textContent=paused?'A good place to pause.':'Quest complete.';$('lq-score').textContent=score+' / '+completed;$('lq-result-copy').textContent='Correct without hints or reveals. Completed questions are saved on this device. Missed and hinted cards will return for review.';summary();$('lq-study').hidden=false;speakResult(paused);
}
async function speakResult(paused){
 let token=generation;
 for(const cue of [paused?'paused':'complete','score-'+score,'count-'+completed]){
  const played=await speak(cue,true);token++;
  if(!played||generation!==token)break;
 }
}
function studySettings(){settings={voice:$('lq-voice').value,pronunciation:$('lq-pronunciation').value};}
async function speakStudy(){if(!studyCue)return;studySettings();$('lq-study-status').textContent='Preparing the spoken card answer…';const played=await speak(studyCue,true);$('lq-study-status').textContent=played?'AI-generated OpenAI voice · saved for replay':$('lq-audio-status').textContent;}
function showStudy(entry){studyCue=entry.cue;$('lq-study-result').textContent=entry.word+' — '+entry.fact+': '+entry.answer;$('lq-study-choices').replaceChildren();$('lq-study-repeat').hidden=false;speakStudy();}
function askStudy(text){
 stopMedia();studyCue=null;$('lq-study-status').textContent='';$('lq-study-repeat').hidden=true;$('lq-study-choices').replaceChildren();
 const found=core.lookupStudy(config.study,text);
 if(found.length===1){showStudy(found[0]);return;}
 if(found.length>1){$('lq-study-result').textContent='Which card did you mean?';for(const entry of found){const button=document.createElement('button');button.type='button';button.textContent=entry.word;button.addEventListener('click',()=>showStudy(entry));$('lq-study-choices').appendChild(button);}return;}
 $('lq-study-result').textContent='I could not find that word and fact in this card set. Try its Latin spelling and ask for meaning, gender, declension, conjugation, forms, or principal parts.';
}
async function showFollowup(entry){
 if(!active)return;const qid=current().id;if(!resolved)helped=true;
 $('lq-followup-result').textContent=entry.word+' — '+entry.fact+': '+entry.answer;
 $('lq-followup-status').textContent=resolved?'Card fact from the approved set.':'This question now counts as practice with help.';
 $('lq-followup-choices').replaceChildren();const played=await speak(entry.cue);
 if(played&&active&&current().id===qid&&settings.handsfree&&!resolved)repeatQuestion();
}
async function askFollowup(text){
 if(!active)return;stopMedia();const qid=current().id;$('lq-followup-details').open=true;$('lq-followup-question').value=text;$('lq-followup-result').textContent='';$('lq-followup-status').textContent='';$('lq-followup-choices').replaceChildren();
 const found=core.lookupStudy(config.study,text,current().card);
 if(found.length===1){showFollowup(found[0]);return;}
 if(found.length>1){$('lq-followup-result').textContent='Which card did you mean?';for(const entry of found){const b=document.createElement('button');b.type='button';b.textContent=entry.word;b.addEventListener('click',()=>showFollowup(entry));$('lq-followup-choices').appendChild(b);}return;}
 $('lq-followup-result').textContent='That fact is not available for this card. Try meaning, gender, declension, conjugation, or principal parts. Your answer has not been graded.';
 const played=await speak('study-unknown');if(played&&active&&current().id===qid&&settings.handsfree&&!resolved)listen();
}
function listenStudy(duringQuiz=false){
 if(!Recognition||(duringQuiz?!active:active))return;stopMedia();const token=generation,r=new Recognition();recognition=r;r.lang='en-US';r.interimResults=false;r.continuous=false;r.maxAlternatives=3;
 const status=duringQuiz?$('lq-followup-status'):$('lq-study-status');if(duringQuiz)$('lq-followup-details').open=true;status.textContent='Listening for your question…';
 r.onresult=event=>{if(token!==generation)return;recognition=null;const transcripts=Array.from(event.results[0]).map(x=>x.transcript);const text=transcripts.find(t=>core.lookupStudy(config.study,t,duringQuiz?current().card:null).length)||transcripts[0];
  if(duringQuiz){askFollowup(text);}else{$('lq-study-question').value=text;askStudy(text);}};
 r.onerror=event=>{if(token!==generation)return;recognition=null;status.textContent=event.error==='not-allowed'?'Microphone access was not granted. Type your question instead.':'I did not catch that. Try again, or type the Latin spelling.';};
 r.onend=()=>{if(recognition===r){recognition=null;status.textContent='Listening stopped. Try again, or type your question.';}};
 try{r.start();}catch(_){recognition=null;status.textContent='Voice input could not start. Type your question instead.';}
}
$('lq-followup-summary').addEventListener('click',()=>{if(active)stopMedia();});
$('lq-followup-form').addEventListener('submit',e=>{e.preventDefault();askFollowup($('lq-followup-question').value);});$('lq-followup-mic').addEventListener('click',()=>listenStudy(true));$('lq-followup-back').addEventListener('click',repeatQuestion);
$('lq-study-form').addEventListener('submit',e=>{e.preventDefault();if(!active)askStudy($('lq-study-question').value);});$('lq-study-mic').addEventListener('click',()=>listenStudy(false));$('lq-study-repeat').addEventListener('click',speakStudy);
$('lq-start').addEventListener('click',()=>begin());$('lq-review').addEventListener('click',()=>begin(true));$('lq-stop').addEventListener('click',()=>finish(true));$('lq-form').addEventListener('submit',e=>{e.preventDefault();if(active&&!resolved)check($('lq-answer').value);});$('lq-mic').addEventListener('click',listen);$('lq-repeat').addEventListener('click',repeatQuestion);$('lq-hint').addEventListener('click',hint);$('lq-reveal').addEventListener('click',reveal);$('lq-skip').addEventListener('click',reveal);$('lq-next').addEventListener('click',advance);$('lq-override').addEventListener('click',override);
$('lq-again').addEventListener('click',()=>{$('lq-result').hidden=true;$('lq-setup').hidden=false;$('lq-study').hidden=false;});
$('lq-clear').addEventListener('click',()=>{if(active){notice('Pause your quest before resetting progress.');return;}if(!confirm('Reset Latin Quest progress for this browser profile?'))return;stats={};save();summary();notice('Latin progress reset on this device.');});
$('lq-clear-audio').addEventListener('click',async()=>{stopMedia();for(const url of memory.values())URL.revokeObjectURL(url);memory.clear();try{if('caches'in window){for(const key of await caches.keys())if(key.startsWith('faithsparks-latin-voice-'))await caches.delete(key);}notice('Saved Latin voice clips cleared on this device. Shared audio remains available for replay.');}catch(_){notice('This browser could not clear its saved audio.');}});
window.addEventListener('pagehide',()=>{stopMedia();for(const url of memory.values())URL.revokeObjectURL(url);memory.clear();});
if(!Recognition){$('lq-followup-mic').disabled=true;$('lq-study-mic').disabled=true;$('lq-study-status').textContent='This browser does not offer voice recognition. Type a study question above.';$('lq-mic').disabled=true;$('lq-auto').disabled=true;$('lq-auto').closest('label').title='Voice answers require a browser with speech recognition. Use typed answers here.';}
summary();
})();
