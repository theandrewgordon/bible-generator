(function(){
'use strict';
const config=JSON.parse(document.getElementById('lq-config').textContent),core=window.LatinQuestCore,$=id=>document.getElementById(id);
const PLAYERS='faithsparks.latinQuest.players.v1';
let players=[{id:'player-1',name:'Player 1'},{id:'player-2',name:'Player 2'},{id:'player-3',name:'Player 3'}],player='player-1';
try{const saved=JSON.parse(localStorage.getItem(PLAYERS)||'null');if(saved&&Array.isArray(saved.players)){const valid=saved.players.filter(p=>p&&/^player-[a-z0-9-]+$/.test(p.id)&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=24).slice(0,12);if(valid.length){players=valid;player=players.some(p=>p.id===saved.current)?saved.current:players[0].id;}}}catch(_){}
let STORE='faithsparks.latinQuest.player.'+player+'.progress.v1';
const CACHE='faithsparks-latin-voice-'+config.audioVersion;
let stats={},queue=[],position=0,score=0,completed=0,active=false,resolved=false,helped=false,currentCorrect=false,previousStat=null;
let studyCue=null,resetBackup=null,choiceButtons=[],selectedChoice=null,requestedReset=null,assisted=0;
let settings={},generation=0,audio=null,recognition=null,nextTimer=null;
const memory=new Map(),pending=new Map(),Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function notice(text){$('lq-notice').textContent=text;}
function loadStats(){stats={};try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');for(const [key,value]of Object.entries(saved)){if(value&&Number.isInteger(value.attempts)&&value.attempts>=0&&Number.isInteger(value.correct)&&value.correct>=0&&Number.isInteger(value.streak)&&value.streak>=0&&value.streak<=9)stats[key]=value;}}catch(_){notice('Progress storage is unavailable. You can still practice this session.');}}
loadStats();
function save(){try{localStorage.setItem(STORE,JSON.stringify(stats));}catch(_){notice('This browser could not save progress. Keep this page open to retain this session.');}}
function summary(){const practiced=new Set(Object.keys(stats).filter(id=>stats[id].attempts>0).map(id=>id.split(':')[0]));$('lq-progress-summary').textContent=practiced.size+' of 140 cards practiced for '+players.find(p=>p.id===player).name+' on this device.';}
function current(){return queue[position];}
let WEEK='faithsparks.latinQuest.player.'+player+'.week.v1';
const deckCards=Array.from(new Map(config.questions.map(q=>[q.card,q])).values());
let weekly=new Set(),weekEnabled=false;
try{const saved=JSON.parse(localStorage.getItem(WEEK)||'{}');weekly=new Set((Array.isArray(saved.cards)?saved.cards:[]).filter(id=>deckCards.some(q=>q.card===id)));weekEnabled=saved.enabled===true;}catch(_){}
$('lq-week-use').checked=weekEnabled;
function saveWeek(){try{localStorage.setItem(WEEK,JSON.stringify({enabled:$('lq-week-use').checked,cards:[...weekly]}));}catch(_){notice('Weekly deck could not be saved on this browser.');}weekCount();}
function weekCount(){$('lq-week-count').textContent=weekly.size+' cards selected. Changes save automatically on this browser.';}
function paintWeek(){const list=$('lq-week-cards'),search=core.normalize($('lq-week-search').value);list.replaceChildren();for(const q of deckCards){const labelText=q.mode==='grammar'?q.prompt:(config.questions.find(x=>x.card===q.card&&x.mode==='meaning')?.prompt||q.prompt)+' — '+(config.questions.find(x=>x.card===q.card&&x.mode==='meaning')?.answer||'');if(search&&!core.normalize(labelText).includes(search))continue;const label=document.createElement('label');label.className='lq-check';const box=document.createElement('input');box.type='checkbox';box.checked=weekly.has(q.card);box.addEventListener('change',()=>{if(box.checked)weekly.add(q.card);else weekly.delete(q.card);saveWeek();});label.appendChild(box);const text=document.createElement('span');text.textContent=labelText;label.appendChild(text);list.appendChild(label);}weekCount();}
function practicePool(){let pool=config.questions;if($('lq-week-use').checked)pool=pool.filter(q=>weekly.has(q.card));const focus=$('lq-focus').value;if(settings.mode==='nouns'&&['nominative','genitive','gender','declension'].includes(focus))pool=pool.filter(q=>q.id.endsWith('nouns-'+focus));if(settings.mode==='verbs'&&focus==='principal')pool=pool.filter(q=>q.id.includes(':verbs-part'));return pool;}
function showMemory(){const memory=config.memory?.[current().card];if(!memory)return;if(!resolved)helped=true;$('lq-memory-text').textContent='Memory aid, not an answer: '+memory.text;$('lq-memory-text').hidden=false;$('lq-memory-source').href=memory.source;$('lq-memory-source').hidden=false;$('lq-memory-hear').hidden=false;}
$('lq-week-search').addEventListener('input',paintWeek);$('lq-week-use').addEventListener('change',saveWeek);$('lq-week-all').addEventListener('click',()=>{weekly=new Set(deckCards.map(q=>q.card));saveWeek();paintWeek();});$('lq-week-none').addEventListener('click',()=>{weekly.clear();saveWeek();paintWeek();});$('lq-memory-open').addEventListener('click',showMemory);$('lq-memory-hear').addEventListener('click',()=>{if(active)speak('memory:'+current().card);});paintWeek();

function progressQuestion(){return settings.response==='choice'?{...current(),id:current().id+':choice'}:current();}
function sessionStats(){if(settings.response!=='choice')return stats;return Object.fromEntries(Object.entries(stats).filter(([id])=>id.endsWith(':choice')).map(([id,value])=>[id.slice(0,-7),value]));}
function syncResponse(){const mode=$('lq-mode').value;$('lq-focus').disabled=!['nouns','verbs'].includes(mode);for(const option of $('lq-focus').options||[])option.disabled=option.value!=='all'&&(mode==='verbs'?option.value!=='principal':option.value==='principal');if((mode==='verbs'&&$('lq-focus').value!=='principal')||(mode==='nouns'&&$('lq-focus').value==='principal'))$('lq-focus').value='all';const supported=['meaning','reverse'].includes($('lq-mode').value);$('lq-response').disabled=!supported;if(!supported)$('lq-response').value='recall';const choice=supported&&$('lq-response').value==='choice';$('lq-auto').disabled=choice||!Recognition;if(choice)$('lq-auto').checked=false;$('lq-response-note').textContent=supported?'Multiple choice or speak/type — your choice.':'This practice uses speak or type. Multiple choice is available for Latin ↔ English.';}
function paintChoices(){
 const options=$('lq-options');options.replaceChildren();choiceButtons=[];selectedChoice=null;const values=settings.response==='choice'?core.choicesFor(current(),config.questions):[];
 $('lq-multiple').hidden=!values.length;$('lq-form').hidden=!!values.length;$('lq-choice-repeat').hidden=!values.length;
 for(const value of values){
  const row=document.createElement('div');row.className='lq-option-row';
  const button=document.createElement('button');button.type='button';button.className='lq-option';button.textContent=value;
  button.value=value;button.addEventListener('click',()=>{if(!active||resolved)return;selectedChoice=button;check(value);});
  row.appendChild(button);choiceButtons.push(button);
  const card=config.questions.find(q=>q.mode===current().mode&&q.answers[0]===value);
  if(card){const hear=document.createElement('button');hear.type='button';hear.className='lq-option-hear';hear.textContent='🔊';hear.ariaLabel='Hear '+value;hear.title='Listen without choosing this answer';hear.addEventListener('click',()=>{if(active)speak('option:'+card.id);});row.appendChild(hear);}
  options.appendChild(row);
 }
}
function stopMedia(){generation++;clearTimeout(nextTimer);nextTimer=null;if(audio){audio.pause();audio=null;}if(recognition){const r=recognition;recognition=null;r.abort();}}
async function cachedClip(cue){
 const voice=settings.voice,pronunciation=settings.pronunciation;
 const option=cue.startsWith('option:')?config.questions.find(q=>q.id===cue.slice(7)):null;
 const cacheCue=option?'option:'+option.mode+':'+option.answers[0]:cue;
 const key=[config.audioVersion,voice,pronunciation,cacheCue].map(encodeURIComponent).join('/');
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
  return await new Promise(resolve=>{const a=new Audio(clip.url);audio=a;a.onended=()=>{if(audio===a)audio=null;resolve(token===generation);};a.onerror=()=>{if(audio===a)audio=null;$('lq-audio-status').textContent='Audio could not play. Tap Hear again or keep practicing on screen.';resolve(false);};a.onpause=()=>{if(!a.ended)resolve(false);};a.play().catch(()=>{if(token===generation)$('lq-audio-status').textContent='Tap Hear again to allow audio playback, or keep practicing on screen.';resolve(false);});});
 }catch(error){if(token===generation)$('lq-audio-status').textContent=error.message==='The operation was aborted.'?'Voice took too long. Use Hear again to retry.':error.message;return false;}
}
function listen(){
 if(!Recognition||!active)return;
 stopMedia();const token=generation,r=new Recognition();recognition=r;r.lang='en-US';r.interimResults=false;r.continuous=false;r.maxAlternatives=3;
 $('lq-audio-status').textContent='Listening… give your answer, ask about this card, or say hint, repeat, next, or stop.';
 r.onresult=event=>{if(token!==generation||!active)return;recognition=null;const alternatives=Array.from(event.results[0]).map(result=>result.transcript);const text=(!resolved&&alternatives.find(value=>core.matches(current(),value)))||alternatives[0];$('lq-answer').value=text;const command=core.normalize(text);
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
 stopMedia();resolved=false;helped=false;currentCorrect=false;const q=current();previousStat=stats[progressQuestion().id]?{...stats[progressQuestion().id]}:null;
 $('lq-round').textContent='Question '+(position+1)+' of '+queue.length;$('lq-bar').max=queue.length;$('lq-bar').value=position;
 $('lq-question').textContent=q.prompt;$('lq-meta').textContent=settings.details?q.details:'';$('lq-answer').value='';$('lq-answer').disabled=false;$('lq-check').disabled=false;
 $('lq-feedback').textContent='';$('lq-followup-details').open=false;$('lq-followup-question').value='';$('lq-followup-status').textContent='';$('lq-followup-result').textContent='';$('lq-followup-choices').replaceChildren();$('lq-after').hidden=true;for(const name of ['hint','reveal','skip'])$('lq-'+name).disabled=false;
 $('lq-memory').hidden=!config.memory?.[q.card];for(const id of ['lq-memory-text','lq-memory-source','lq-memory-hear'])$(id).hidden=true;
 paintChoices();$('lq-question').focus?.({preventScroll:true});$('lq-session').scrollIntoView?.({block:'start'});repeatQuestion();
}
function begin(kind='practice'){
 stopMedia();settings={response:['meaning','reverse'].includes($('lq-mode').value)&&$('lq-response').value==='choice'?'choice':'recall',mode:$('lq-mode').value,voice:$('lq-voice').value,pronunciation:$('lq-pronunciation').value,details:$('lq-details').checked,handsfree:$('lq-auto').checked&&!!Recognition};
 if(settings.response==='choice')settings.handsfree=false;
 const nextQueue=kind==='same'?core.shuffled(queue):core.buildQueue(practicePool(),settings.mode,Number($('lq-size').value),kind==='retest'?{}:sessionStats(),kind==='review');
 if(!nextQueue.length){notice('No cards match this practice. Check your weekly selection and focus, or use Retest all cards if there are no misses.');return;}
 queue=nextQueue;resetBackup=null;requestedReset=null;$('lq-reset-confirm').hidden=true;$('lq-undo-reset').hidden=true;position=0;score=0;assisted=0;completed=0;active=true;$('lq-player').disabled=true;$('lq-player-add').disabled=true;$('lq-player-rename').disabled=true;notice('');$('lq-setup').hidden=true;$('lq-result').hidden=true;$('lq-session').hidden=false;$('lq-study').hidden=true;paint();
}
async function hint(){if(!active||resolved)return;helped=true;$('lq-feedback').textContent=current().hint;const played=await speak(current().id+':hint');if(played&&settings.handsfree&&!resolved)listen();}
async function resolve(correct){
 if(!active||resolved)return;stopMedia();for(const button of choiceButtons){button.disabled=true;if(core.matches(current(),button.value)){button.dataset.result='correct';button.textContent=button.value+' ✓';}else if(button===selectedChoice){button.dataset.result='incorrect';button.textContent=button.value+' — try this again later';}}resolved=true;currentCorrect=correct;completed++;if(correct&&!helped)score++;if(correct&&helped)assisted++;stats=core.record(stats,progressQuestion(),correct,helped);save();summary();
 $('lq-answer').disabled=true;$('lq-check').disabled=true;for(const name of ['hint','reveal','skip'])$('lq-'+name).disabled=true;
 $('lq-feedback').textContent=correct?(helped?'You got it with a little help. We will revisit this card.':'Correct! One valid answer is enough.'):'Good try. Let us learn this card together.';
 $('lq-card-answer').textContent=current().answer;$('lq-after').hidden=false;$('lq-override').hidden=correct||settings.response==='choice';$('lq-next').textContent=position+1===queue.length?'Finish quest →':'Next question →';$('lq-bar').value=completed;
 const token=generation;if(!correct)await speak(current().id+':answer');
 // A new question or manual action invalidates this continuation.
 if(active&&resolved&&settings.handsfree&&generation===(correct?token:token+1))nextTimer=setTimeout(advance,3000);
}
function check(text){if(!String(text).trim()){ $('lq-feedback').textContent='Give one answer, or choose Show answer to study this card.';return;}resolve(core.matches(current(),text));}
function reveal(){if(!active||resolved)return;helped=true;resolve(false);}
function advance(){if(!active||!resolved)return;stopMedia();position++;if(position>=queue.length){finish(false);return;}paint();}
function override(){if(!active||!resolved||currentCorrect)return;stopMedia();if(previousStat)stats[progressQuestion().id]=previousStat;else delete stats[progressQuestion().id];stats=core.record(stats,progressQuestion(),true,helped);save();if(!helped)score++;else assisted++;currentCorrect=true;$('lq-feedback').textContent='Marked correct together. Thanks for checking the meaning.';$('lq-override').hidden=true;summary();}
function finish(paused){
 if(!active)return;stopMedia();active=false;$('lq-player').disabled=false;$('lq-player-add').disabled=false;$('lq-player-rename').disabled=false;$('lq-session').hidden=true;$('lq-result').hidden=false;$('lq-result-title').textContent=paused?'A good place to pause.':'Quest complete.';$('lq-score').textContent=score+' / '+completed;$('lq-result-copy').textContent=(settings.response==='choice'?'Multiple-choice results. Choice practice is tracked separately from speak/type recall. ':'')+'Correct without hints or reveals. Completed questions are saved on this device. Missed and hinted cards will return for review.';$('lq-result-breakdown').textContent=score+' on your own · '+assisted+' with help · '+(completed-score-assisted)+' to practice again';$('lq-resume').hidden=!paused;summary();$('lq-study').hidden=false;$('lq-result-title').focus?.({preventScroll:true});$('lq-result').scrollIntoView?.({block:'start'});
}
function studySettings(){settings={...settings,voice:$('lq-voice').value,pronunciation:$('lq-pronunciation').value};}
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
$('lq-response').addEventListener('change',syncResponse);$('lq-mode').addEventListener('change',syncResponse);$('lq-choice-repeat').addEventListener('click',repeatQuestion);
$('lq-followup-summary').addEventListener('click',()=>{if(active)stopMedia();});
$('lq-followup-form').addEventListener('submit',e=>{e.preventDefault();askFollowup($('lq-followup-question').value);});$('lq-followup-mic').addEventListener('click',()=>listenStudy(true));$('lq-followup-back').addEventListener('click',repeatQuestion);
$('lq-study-form').addEventListener('submit',e=>{e.preventDefault();if(!active)askStudy($('lq-study-question').value);});$('lq-study-mic').addEventListener('click',()=>listenStudy(false));$('lq-study-repeat').addEventListener('click',speakStudy);
$('lq-start').addEventListener('click',()=>begin());$('lq-review').addEventListener('click',()=>begin('review'));$('lq-retest').addEventListener('click',()=>begin('retest'));$('lq-retest-same').addEventListener('click',()=>begin('same'));$('lq-stop').addEventListener('click',()=>finish(true));$('lq-form').addEventListener('submit',e=>{e.preventDefault();if(active&&!resolved)check($('lq-answer').value);});$('lq-mic').addEventListener('click',listen);$('lq-repeat').addEventListener('click',repeatQuestion);$('lq-hint').addEventListener('click',hint);$('lq-reveal').addEventListener('click',reveal);$('lq-skip').addEventListener('click',reveal);$('lq-next').addEventListener('click',advance);$('lq-override').addEventListener('click',override);
$('lq-again').addEventListener('click',()=>{$('lq-result').hidden=true;$('lq-setup').hidden=false;$('lq-study').hidden=false;$('lq-setup').scrollIntoView?.({block:'start'});});
$('lq-resume').addEventListener('click',()=>{if(active||!queue.length)return;stopMedia();active=true;$('lq-player').disabled=true;$('lq-player-add').disabled=true;$('lq-player-rename').disabled=true;$('lq-result').hidden=true;$('lq-setup').hidden=true;$('lq-study').hidden=true;$('lq-session').hidden=false;$('lq-session').scrollIntoView?.({block:'start'});if(!resolved)repeatQuestion();});
function resetDeck(all=false){
 if(active){notice('Pause your quest before resetting progress.');return;}
 const mode=$('lq-mode').value,response=$('lq-response').value==='choice'?'choice':'recall';
 const label=all?'all Latin progress for '+players.find(p=>p.id===player).name:config.modes?.[mode]||$('lq-mode').selectedOptions?.[0]?.textContent||mode;
 requestedReset={all,mode,response,label};
 $('lq-reset-message').textContent=all?'Reset all Latin progress for '+players.find(p=>p.id===player).name+'? Other players and saved audio stay available.':'Reset '+label+' progress for '+(response==='choice'?'multiple choice':'speak/type')+' for '+players.find(p=>p.id===player).name+'? Other practice progress, other players, and saved audio stay available.';
 $('lq-reset-confirm').hidden=false;$('lq-reset-accept').focus?.({preventScroll:true});$('lq-reset-confirm').scrollIntoView?.({block:'nearest'});
}
$('lq-reset-deck').addEventListener('click',()=>resetDeck());$('lq-clear').addEventListener('click',()=>resetDeck(true));
$('lq-reset-cancel').addEventListener('click',()=>{requestedReset=null;$('lq-reset-confirm').hidden=true;notice('Reset cancelled. Your progress is unchanged.');});
$('lq-reset-accept').addEventListener('click',()=>{if(!requestedReset||active)return;const {all,mode,response,label}=requestedReset;stopMedia();resetBackup={...stats};stats=all?{}:core.resetProgress(stats,config.questions,mode,response);requestedReset=null;$('lq-reset-confirm').hidden=true;save();summary();$('lq-undo-reset').hidden=false;notice('Progress reset for '+label+'. You can undo this reset until you start another quest, leave, or reset again.');});
$('lq-undo-reset').addEventListener('click',()=>{if(!resetBackup)return;stats={...stats,...resetBackup};resetBackup=null;save();summary();$('lq-undo-reset').hidden=true;notice('Reset undone. Previous progress restored.');});
$('lq-clear-audio').addEventListener('click',async()=>{stopMedia();for(const url of memory.values())URL.revokeObjectURL(url);memory.clear();try{if('caches'in window){for(const key of await caches.keys())if(key.startsWith('faithsparks-latin-voice-'))await caches.delete(key);}notice('Saved Latin voice clips cleared on this device. Shared audio remains available for replay.');}catch(_){notice('This browser could not clear its saved audio.');}});
window.addEventListener('pagehide',()=>{stopMedia();for(const url of memory.values())URL.revokeObjectURL(url);memory.clear();});
if(!Recognition){$('lq-followup-mic').disabled=true;$('lq-study-mic').disabled=true;$('lq-study-status').textContent='This browser does not offer voice recognition. Type a study question above.';$('lq-mic').disabled=true;$('lq-auto').disabled=true;$('lq-auto').closest('label').title='Voice answers require a browser with speech recognition. Use typed answers here.';}
function savePlayers(){try{localStorage.setItem(PLAYERS,JSON.stringify({players,current:player}));}catch(_){notice('Player settings could not be saved on this browser.');}}
function paintPlayers(){const select=$('lq-player');select.replaceChildren();for(const p of players){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;select.appendChild(option);}select.value=player;$('lq-player-name').value=players.find(p=>p.id===player).name;}
function switchPlayer(id){if(active||!players.some(p=>p.id===id))return;stopMedia();player=id;STORE='faithsparks.latinQuest.player.'+player+'.progress.v1';WEEK='faithsparks.latinQuest.player.'+player+'.week.v1';loadStats();weekly=new Set();$('lq-week-use').checked=false;try{const w=JSON.parse(localStorage.getItem(WEEK)||'{}');weekly=new Set((Array.isArray(w.cards)?w.cards:[]).filter(id=>deckCards.some(q=>q.card===id)));$('lq-week-use').checked=w.enabled===true;}catch(_){}queue=[];position=0;score=0;assisted=0;completed=0;resetBackup=null;requestedReset=null;studyCue=null;$('lq-reset-confirm').hidden=true;$('lq-undo-reset').hidden=true;$('lq-result').hidden=true;$('lq-session').hidden=true;$('lq-setup').hidden=false;$('lq-study').hidden=false;$('lq-study-result').textContent='';$('lq-study-repeat').hidden=true;$('lq-week-search').value='';paintWeek();paintPlayers();savePlayers();summary();notice('Ready for '+players.find(p=>p.id===player).name+'.');}
$('lq-player').addEventListener('change',()=>switchPlayer($('lq-player').value));
$('lq-player-add').addEventListener('click',()=>{if(active)return;if(players.length>=12){notice('This browser already has 12 players. Rename an existing player to use it.');return;}const name=$('lq-player-name').value.trim().slice(0,24);if(!name||players.some(p=>p.name.toLowerCase()===name.toLowerCase())){notice('Enter a different player name or nickname first.');return;}const id='player-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);players.push({id,name});switchPlayer(id);});
$('lq-player-rename').addEventListener('click',()=>{if(active)return;const name=$('lq-player-name').value.trim().slice(0,24);if(!name||players.some(p=>p.id!==player&&p.name.toLowerCase()===name.toLowerCase())){notice('Choose a different player name or nickname.');return;}players.find(p=>p.id===player).name=name;savePlayers();paintPlayers();summary();notice('Player name saved.');});
paintPlayers();savePlayers();syncResponse();summary();
})();
