/* Scroll Quest learning companion. Gameplay and its verified release are independent. */
(function(){
'use strict';
const $=id=>document.getElementById(id),panel=$('learning'),game=$('sq-game');
const base='/labs/scroll-quest/learning/',origin=location.origin;
let session=null,current=null,state={},selected='1-1',lastVisited='',hintStep=0,activeTab='listen';
let assistAbort=null,assistGeneration=0,audioAbort=null,audio=null,audioSerial=0;
let recorder=null,recordStream=null,recordTimer=null,recordGeneration=0,recordDiscard=false;
let questions=[],quizIndex=0,quizAnswered=false,lastArtifact=null,disposed=false,stopRequest=0;
const stopWaiters=new Map();
const text=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value||'';if(cls)node.className=cls;return node;};
const owner=()=>document.cookie.match(/(?:^|;\s*)faithsparks_labs_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
const initialOwner=owner();
const activeOwner=()=>session&&session.owner===initialOwner&&owner()===session.owner;
const storage=window.FaithSparksLabsStorage?.labsStorage;
function read(key,fallback){try{if(!activeOwner())return fallback;return JSON.parse(storage.getItem(key))||fallback;}catch{return fallback;}}
function write(key,value){try{if(activeOwner())storage.setItem(key,JSON.stringify(value));}catch{}}
let settings={voiceMode:'openai',voice:'narrator',slow:false,autoRead:false,npcVoice:false,language:'en',age:'family'};
let journal={chapters:{}};
const labels={
 en:{listen:'Listen',help:'Help',practice:'Practice',family:'Family',title:'Learning together',listenTitle:'Hear the story',helpTitle:'A little help',practiceTitle:'Remember and discover',familyTitle:'Bring the story home',hint:'Give me a nudge',more:'A clearer clue',last:'Show the current task',explain:'Explain the passage',discuss:'Talk together',print:'Make a printable',recap:'Chapter recap',quiz:'Start practice questions',translate:'Translate study help'},
 es:{listen:'Escuchar',help:'Ayuda',practice:'Practicar',family:'Familia',title:'Aprender juntos',listenTitle:'Escucha la historia',helpTitle:'Un poco de ayuda',practiceTitle:'Recordar y descubrir',familyTitle:'Lleva la historia a casa',hint:'Dame una pista',more:'Una pista más clara',last:'Ver la tarea actual',explain:'Explicar el pasaje',discuss:'Conversar juntos',print:'Crear una hoja',recap:'Resumen del capítulo',quiz:'Practicar preguntas',translate:'Traducir la ayuda'},
 fr:{listen:'Écouter',help:'Aide',practice:'Pratiquer',family:'Famille',title:'Apprendre ensemble',listenTitle:'Écoute le récit',helpTitle:'Un peu d’aide',practiceTitle:'Mémoriser et découvrir',familyTitle:'Prolonger le récit en famille',hint:'Un petit indice',more:'Un indice plus précis',last:'Voir la tâche actuelle',explain:'Expliquer le passage',discuss:'Discuter ensemble',print:'Créer une fiche',recap:'Résumé du chapitre',quiz:'Questions de pratique',translate:'Traduire l’aide'},
 de:{listen:'Zuhören',help:'Hilfe',practice:'Üben',family:'Familie',title:'Gemeinsam lernen',listenTitle:'Höre die Geschichte',helpTitle:'Ein wenig Hilfe',practiceTitle:'Erinnern und entdecken',familyTitle:'Die Geschichte zu Hause',hint:'Ein kleiner Hinweis',more:'Ein deutlicherer Hinweis',last:'Aktuelle Aufgabe zeigen',explain:'Bibelstelle erklären',discuss:'Gemeinsam sprechen',print:'Arbeitsblatt erstellen',recap:'Kapitelrückblick',quiz:'Übungsfragen starten',translate:'Lernhilfe übersetzen'},
 pt:{listen:'Ouvir',help:'Ajuda',practice:'Praticar',family:'Família',title:'Aprender juntos',listenTitle:'Ouça a história',helpTitle:'Uma pequena ajuda',practiceTitle:'Lembrar e descobrir',familyTitle:'Leve a história para casa',hint:'Uma pequena pista',more:'Uma pista mais clara',last:'Mostrar a tarefa atual',explain:'Explicar a passagem',discuss:'Conversar juntos',print:'Criar atividade',recap:'Resumo do capítulo',quiz:'Perguntas de prática',translate:'Traduzir a ajuda'}
};
function localize(){
 const l=labels[settings.language]||labels.en;document.documentElement.lang=settings.language;
 $('learning-title').textContent=l.title;$('open-learning').replaceChildren(document.createTextNode(l.title+' ✦'));$('open-learning').append(text('span',settings.voiceMode==='openai'?'AI-generated voice':settings.voiceMode==='device'?'Device voice':'Reading voice off','voice-badge'));
 for(const name of ['listen','help','practice','family'])$('tab-'+name).textContent=l[name];
 for(const node of document.querySelectorAll('[data-label]'))if(l[node.dataset.label])node.textContent=l[node.dataset.label];
 for(const [id,key]of Object.entries({'explain':'explain','discuss':'discuss','make-printable':'print','make-recap':'recap','start-quiz':'quiz','translate-help':'translate'}))$(id).textContent=l[key];
 $('next-hint').textContent=hintStep===0?l.hint:hintStep===1?l.more:l.last;
}
function status(message,error=false){$('learning-status').textContent=message||'';$('learning-status').classList.toggle('error',error);}
function post(type,extra={}){game.contentWindow?.postMessage({type:'sq-learning:'+type,...extra},origin);}
function syncConfig(){if(session)post('config',{config:{...settings,csrf:session.csrf,owner:session.owner}});}
function persistSettings(){write('scrollquest.learning.settings.v1',settings);syncConfig();localize();}
async function request(path,body,signal){
 if(!activeOwner())throw Error('Your account changed. Reload to continue.');
 const headers={'X-CSRF-Token':session.csrf,'X-Labs-Owner':session.owner};
 const options={credentials:'same-origin',signal,headers};
 if(body!==undefined){options.method='POST';if(body instanceof FormData)options.body=body;else{headers['Content-Type']='application/json';options.body=JSON.stringify(body);}}
 const response=await fetch(base+path,options);
 if(!activeOwner())throw Error('Your account changed. Reload to continue.');
 if(!response.ok){let message='That option is unavailable. Please try again.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
 return response;
}
function chapterStats(){if(!journal.chapters[selected]||typeof journal.chapters[selected]!=='object')journal.chapters[selected]={};const value=journal.chapters[selected];for(const key of ['visits','correct','attempts','memory','hints'])if(!Number.isInteger(value[key])||value[key]<0||value[key]>1000000)value[key]=0;value.completed=value.completed===true;if(!Array.isArray(value.missed))value.missed=[];value.missed=value.missed.filter(n=>Number.isInteger(n)&&n>=0&&n<10);return value;}
function saveJournal(){write('scrollquest.learning.journal.v1',journal);}
function stopVoice(){audioSerial++;audioAbort?.abort();audioAbort=null;if(audio){audio.pause();URL.revokeObjectURL(audio.src);audio=null;}window.speechSynthesis?.cancel();const requestId=++stopRequest;return new Promise(resolve=>{const done=()=>{stopWaiters.delete(requestId);resolve();};stopWaiters.set(requestId,done);setTimeout(done,300);post('stop',{requestId});});}
function deviceSpeak(value){if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){status('Device speech is unavailable in this browser.',true);return;}const utterance=new SpeechSynthesisUtterance(value);utterance.lang=settings.language;utterance.rate=settings.slow?.75:.95;window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);status('Device voice');}
async function listen(value,{cue,artifact,field='body',voice=settings.voice}={}){
 const stopped=stopVoice(),started=audioSerial;await stopped;if(started!==audioSerial)return;if(settings.voiceMode==='off'){status('Choose a reading voice to listen.');return;}
 if(settings.voiceMode==='device'||(!cue&&!artifact)){deviceSpeak(value);return;}
 const serial=audioSerial;audioAbort=new AbortController();status('Preparing AI-generated voice…');
 try{
  const response=await request('narrate',{chapter:selected,...(cue?{cue}:{artifact,field}),voice},audioAbort.signal);
  const blob=await response.blob();if(serial!==audioSerial||!activeOwner())return;
  const url=URL.createObjectURL(blob);audio=new Audio(url);audio.playbackRate=settings.slow?.8:1;
  audio.onended=()=>{if(serial===audioSerial){URL.revokeObjectURL(url);audio=null;status('');}};
  audio.onerror=()=>{if(serial===audioSerial){URL.revokeObjectURL(url);audio=null;status('Audio could not play. Try the device voice.',true);}};
  await audio.play();if(serial!==audioSerial){audio?.pause();return;}status('AI-generated voice');
 }catch(error){if(error.name==='AbortError'||serial!==audioSerial)return;status('Using the device voice.');deviceSpeak(value);}
}
function readButton(value,artifact,field){const button=text('button','Read this aloud');button.onclick=()=>listen(value,{artifact,field,voice:'guide'});return button;}
const actionIds=['next-hint','explain','translate-help','start-quiz','discuss','make-printable','make-recap'];
function busy(value){for(const id of actionIds)$(id).disabled=value;}
async function assist(mode){
 if(!current)return null;
 assistAbort?.abort();assistAbort=new AbortController();const generation=++assistGeneration,chapter=selected;
 status('Preparing study help…');busy(true);
 try{
  const gameState=state.chapter===chapter?{tasks:state.tasks,role:state.role,position:state.position,objective:state.objective}:{};
  const response=await request('assist',{chapter,mode,age:settings.age,language:settings.language,state:gameState},assistAbort.signal);
  const result=await response.json();if(generation!==assistGeneration||chapter!==selected||!activeOwner())return null;
  status(result.notice||'');lastArtifact=result.artifact||null;return result;
 }catch(error){if(error.name!=='AbortError'&&generation===assistGeneration)status(error.message,true);return null;}
 finally{if(generation===assistGeneration)busy(false);}
}
function showResult(target,result,{field='body',onlyHint=false}={}){
 target.replaceChildren();const card=text('div','','card');card.append(text('p',result.ai?'AI study help':'From the game’s reviewed material','kicker'));
 if(!onlyHint)card.append(text('h3',result.title));
 if(result.body){card.append(text('p',result.body));card.append(readButton(result.body,result.artifact,field));}
 if(result.vocabulary?.length){const list=document.createElement('dl');for(const entry of result.vocabulary){list.append(text('dt',entry.word),text('dd',entry.meaning));}card.append(list);}
 for(const [key,label]of [['prompts','Talk together'],['activities','Try together']]){
  if(!result[key]?.length)continue;card.append(text('h3',label));const list=document.createElement('ol');for(const item of result[key])list.append(text('li',item));card.append(list);
 }
 card.append(text('p',current.passage+' · Commentary, not a Bible translation.','quiet'));target.append(card);
}
function renderTasks(){
 const matching=state.chapter===selected;
 $('task-summary').replaceChildren(text('strong',matching&&state.role?'Playing as '+state.role:'Chapter tasks'));
 for(const task of current?.tasks||[]){const count=matching?state.tasks?.[task.id]||0:0;$('task-summary').append(text('p',task.label+' · '+count+' / '+task.total));}
 if(!matching)$('task-summary').append(text('p','Open this chapter in the game for hints based on your current tasks.','quiet'));
}
function buildVerse(){
 const box=$('fill-verse');box.replaceChildren();
 const tokens=current.memoryVerse.text.split(/(\s+)/);let blanks=0;
 const preferred=tokens.map((token,index)=>({token,index})).filter(({token,index})=>token.replace(/[^a-z']/gi,'').length>3&&index%8===0).slice(0,7).map(item=>item.index);
 if(!preferred.length)preferred.push(tokens.findIndex(token=>/[a-z]/i.test(token)));
 tokens.forEach((token,index)=>{
  const word=token.replace(/[^a-z']/gi,'');
  if(preferred.includes(index)){const input=document.createElement('input');input.type='text';input.className='blank';input.dataset.expected=word;input.setAttribute('aria-label','Missing word '+(++blanks));input.autocomplete='off';input.spellcheck=false;box.append(input);}
  else box.append(document.createTextNode(token));
 });
 $('verse-feedback').textContent='';$('recitation').value='';
}
async function loadChapter(id){
 stopVoice();cancelRecording();assistAbort?.abort();assistGeneration++;busy(false);
 selected=id;hintStep=0;questions=[];quizIndex=0;lastArtifact=null;
 for(const target of ['help-result','language-result','family-result','quiz-area'])$(target).replaceChildren();
 $('journal-result').hidden=true;
 try{
  const response=await request('chapter/'+encodeURIComponent(id));const value=await response.json();if(selected!==id)return;
  current=value;$('chapter').value=id;
  $('memory-verse').textContent=value.memoryVerse.text;$('verse-reference').textContent=value.memoryVerse.ref+' · KJV';
  $('reading-cue').replaceChildren();for(const [cue,entry]of Object.entries(value.cues)){const option=text('option',(entry.ref?entry.ref+' · ':entry.title+' · ')+entry.text.slice(0,75));option.value=cue;$('reading-cue').append(option);}
  const firstCue=current.cues[$('reading-cue').value];$('cue-preview').textContent=firstCue.text+(firstCue.ref?' — '+firstCue.ref+' (KJV)':'');
  renderTasks();buildVerse();localize();status('');
 }catch(error){status(error.message,true);}
}
function setTab(name){
 activeTab=name;stopVoice();cancelRecording();
 for(const item of ['listen','help','practice','family']){$('pane-'+item).hidden=item!==name;$('tab-'+item).setAttribute('aria-selected',String(item===name));$('tab-'+item).tabIndex=item===name?0:-1;}
}
function openPanel(){if(!panel.open){panel.showModal();post('pause');$('close-learning').focus();}}
function closePanel(){if(panel.open)panel.close();stopVoice();cancelRecording();post('resume');game.focus();}
$('open-learning').onclick=openPanel;$('close-learning').onclick=closePanel;panel.addEventListener('cancel',()=>{stopVoice();cancelRecording();post('resume');});
for(const button of document.querySelectorAll('[data-tab]')){button.onclick=()=>setTab(button.dataset.tab);button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const tabs=['listen','help','practice','family'];const index=(tabs.indexOf(activeTab)+(event.key==='ArrowRight'?1:3))%4;setTab(tabs[index]);$('tab-'+tabs[index]).focus();});}
$('chapter').onchange=()=>loadChapter($('chapter').value);
$('reading-level').onchange=()=>{settings.age=$('reading-level').value;persistSettings();hintStep=0;localize();};
$('study-language').onchange=()=>{settings.language=$('study-language').value;persistSettings();};
for(const [id,key]of [['voice-mode','voiceMode'],['voice-persona','voice'],['slow-voice','slow'],['auto-read','autoRead'],['npc-voice','npcVoice']])$(id).onchange=()=>{stopVoice();settings[key]=$(id).type==='checkbox'?$(id).checked:$(id).value;persistSettings();};
$('read-verse').onclick=()=>{const cue=Object.entries(current.cues).find(([,entry])=>entry.text===current.memoryVerse.text)?.[0];listen(current.memoryVerse.text,{cue});};
$('reading-cue').onchange=()=>{const entry=current.cues[$('reading-cue').value];$('cue-preview').textContent=entry.text+(entry.ref?' — '+entry.ref+' (KJV)':'');};
$('read-cue').onclick=()=>{const cue=$('reading-cue').value;listen(current.cues[cue].text,{cue});};$('stop-voice').onclick=()=>{stopVoice();status('');};
$('next-hint').onclick=async()=>{
 const result=await assist('hint');if(!result)return;const index=Math.min(2,hintStep++);
 showResult($('help-result'),{...result,body:result.hints[index]||current.startMessage,prompts:[],activities:[],vocabulary:[]},{field:'hints:'+index,onlyHint:true});
 chapterStats().hints++;saveJournal();localize();
};
$('explain').onclick=async()=>{const result=await assist('explain');if(result)showResult($('help-result'),result);};
$('translate-help').onclick=async()=>{const result=await assist('translate');if(result)showResult($('language-result'),result);};
$('show-verse').onclick=()=>{$('verse-feedback').textContent=current.memoryVerse.text+' — '+current.memoryVerse.ref+' (KJV)';};
const normalize=value=>String(value).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9']/g,'');
$('check-blanks').onclick=()=>{
 const inputs=[...$('fill-verse').querySelectorAll('input')];let correct=0;
 for(const input of inputs){const same=normalize(input.value)===normalize(input.dataset.expected);input.setAttribute('aria-invalid',String(!same));if(same)correct++;}
 $('verse-feedback').textContent=correct===inputs.length?'Every missing word is in place. Read the whole verse together.':correct+' of '+inputs.length+' missing words matched. Show the verse for another look.';
 chapterStats().memory++;saveJournal();
};
$('check-recitation').onclick=async()=>{
 if(!$('recitation').value.trim()){status('Type or record the verse first.');return;}
 const checkedChapter=selected;
 try{const response=await request('check',{chapter:checkedChapter,answer:$('recitation').value});const result=await response.json();if(checkedChapter!==selected)return;$('verse-feedback').textContent=result.complete?'All the verse words matched. Read the passage together once more.':result.matched+' of '+result.total+' verse words matched. Words to revisit: '+result.missing.join(', ')+'. '+result.note;chapterStats().memory++;saveJournal();}catch(error){status(error.message,true);}
};
function renderQuiz(){
 const box=$('quiz-area');box.replaceChildren();quizAnswered=false;
 if(quizIndex>=questions.length){box.append(text('p','Practice complete. Talk about one thing you discovered.','notice'));return;}
 const question=questions[quizIndex],card=text('div','','card');card.append(text('p','Question '+(quizIndex+1)+' / '+questions.length,'kicker'),text('h3',question.q),text('p',question.ref||current.passage,'quiet'));
 const options=text('div','','options'),feedback=text('p','','feedback');feedback.id='quiz-feedback';feedback.setAttribute('aria-live','polite');
 const buttons=[];
 question.options.forEach((option,index)=>{const button=text('button',String.fromCharCode(65+index)+'. '+option);button.dataset.answer=String(index);button.onclick=()=>answerQuiz(index,buttons,feedback);buttons.push(button);options.append(button);});
 const voice=text('button','Record an answer');voice.id='record-quiz';voice.onclick=()=>record('quiz');
 const typed=document.createElement('input');typed.type='text';typed.id='quiz-answer';typed.setAttribute('aria-label','Type your answer');typed.placeholder='Or type an answer…';typed.maxLength=500;
 const submit=text('button','Check typed answer');submit.onclick=()=>oralQuiz(typed.value);
 const next=text('button','Next question');next.id='quiz-next';next.hidden=true;next.onclick=()=>{cancelRecording();quizIndex++;renderQuiz();};
 card.append(options,typed,submit,voice,feedback,next);box.append(card);
}
function answerQuiz(index,buttons=[...$('quiz-area').querySelectorAll('[data-answer]')],feedback=$('quiz-feedback')){
 if(quizAnswered||!questions[quizIndex])return;quizAnswered=true;
 const q=questions[quizIndex],correct=index===q.answer,stats=chapterStats();stats.attempts++;if(correct){stats.correct++;stats.missed=stats.missed.filter(source=>source!==q.source);}else if(!stats.missed.includes(q.source))stats.missed.push(q.source);saveJournal();
 for(const [i,button]of buttons.entries()){button.disabled=true;if(i===q.answer)button.classList.add('correct');else if(i===index)button.classList.add('incorrect');}
 feedback.textContent=(correct?'That matches the passage. ':'Let’s look together: '+q.options[q.answer]+'. ')+q.explanation;
 $('quiz-next').hidden=false;
}
function oralQuiz(value){
 const q=questions[quizIndex];if(!q||quizAnswered)return;
 const answer=normalize(value),letter=answer.replace(/^(?:answer|option)/,'');
 const index=q.options.findIndex((option,i)=>normalize(option)===answer||letter===String.fromCharCode(97+i)||letter===String(i+1)||['one','two','three','four'][i]===letter);
 if(index<0){$('quiz-feedback').textContent='Choose the answer you meant, or type one of the options shown.';return;}answerQuiz(index);
}
$('start-quiz').onclick=async()=>{
 const result=await assist('quiz');if(!result)return;const missed=chapterStats().missed;
 questions=(result.questions||[]).slice().sort((a,b)=>Number(missed.includes(b.source))-Number(missed.includes(a.source)));quizIndex=0;renderQuiz();
};
function cancelRecording(){recordGeneration++;recordDiscard=true;clearTimeout(recordTimer);if(recorder&&recorder.state!=='inactive')recorder.stop();recordStream?.getTracks().forEach(track=>track.stop());recordStream=null;recorder=null;for(const id of ['record-verse','record-quiz'])if($(id)){$(id).classList.remove('recording');$(id).textContent=id==='record-verse'?'Record verse':'Record an answer';}}
async function recordingWav(blob){
 const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Context)throw Error('This browser cannot prepare voice input. You can type instead.');
 const context=new Context(1,1,16000),buffer=await context.decodeAudioData(await blob.arrayBuffer());
 if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>42)throw Error('Record an answer of up to 40 seconds.');
 const count=Math.floor(buffer.duration*16000),output=new ArrayBuffer(44+count*2),view=new DataView(output);
 const put=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 put(0,'RIFF');view.setUint32(4,36+count*2,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,count*2,true);
 const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 for(let i=0;i<count;i++){const source=Math.min(buffer.length-1,Math.floor(i*buffer.sampleRate/16000));let sample=0;for(const channel of channels)sample+=channel[source]||0;sample=Math.max(-1,Math.min(1,sample/channels.length));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}
 return new Blob([output],{type:'audio/wav'});
}
async function record(target){
 if(recorder&&recorder.state==='recording'){recorder.stop();return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice input is unavailable in this browser. You can type instead.',true);return;}
 const generation=++recordGeneration,chapter=selected,question=quizIndex;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(generation!==recordGeneration||!panel.open){stream.getTracks().forEach(t=>t.stop());return;}
  recordStream=stream;recordDiscard=false;
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
  const instance=recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{}),chunks=[];let size=0;
  instance.ondataavailable=event=>{if(event.data.size){size+=event.data.size;chunks.push(event.data);}if(size>4_000_000)instance.stop();};
  instance.onstop=async()=>{
   clearTimeout(recordTimer);stream.getTracks().forEach(t=>t.stop());if(recorder===instance)recorder=null;recordStream=null;
   const id=target==='verse'?'record-verse':'record-quiz';if($(id)){$(id).classList.remove('recording');$(id).textContent=target==='verse'?'Record verse':'Record an answer';}
   if(recordDiscard||generation!==recordGeneration||chapter!==selected||(target==='quiz'&&question!==quizIndex))return;
   const type=(instance.mimeType||'audio/webm').split(';')[0],blob=new Blob(chunks,{type});
   if(blob.size<100||blob.size>4_000_000){status('Try a short, clear recording of up to 40 seconds.',true);return;}
   status('Reading your recording…');
   try{const wav=await recordingWav(blob);if(generation!==recordGeneration||chapter!==selected)return;const form=new FormData();form.append('chapter',chapter);form.append('language',target==='verse'?'en':settings.language);form.append('audio',wav,'answer.wav');const response=await request('transcribe',form);const result=await response.json();if(generation!==recordGeneration||chapter!==selected)return;if(target==='verse'){$('recitation').value=result.text;$('check-recitation').click();}else{if($('quiz-answer'))$('quiz-answer').value=result.text;oralQuiz(result.text);}status('Recording read. Check the recognized words together.');}catch(error){status(error.message,true);}
  };
  instance.start(250);recordTimer=setTimeout(()=>{if(instance.state==='recording')instance.stop();},40000);
  const button=$(target==='verse'?'record-verse':'record-quiz');button.classList.add('recording');button.textContent='Stop recording';status('Recording… Press Stop when you finish (40 seconds maximum).');
 }catch(error){recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;status('Microphone access was not available. You can type instead.',true);}
}
$('record-verse').onclick=()=>record('verse');
for(const [id,mode]of [['discuss','discuss'],['make-recap','recap'],['make-printable','printable']])$(id).onclick=async()=>{
 const result=await assist(mode);if(!result)return;showResult($('family-result'),result);
 if(mode==='printable'){const link=text('a','Open printable worksheet','button');link.href=base+'print/'+encodeURIComponent(selected)+(result.artifact?'?artifact='+result.artifact:'');link.target='_blank';link.rel='noopener';$('family-result').append(link);const copywork=text('a','Create matching Faith Sparks copywork','button');copywork.href='/generate?verse='+encodeURIComponent(current.memoryVerse.ref);copywork.target='_blank';copywork.rel='noopener';const coloring=text('a','Explore matching coloring activities','button');coloring.href=copywork.href+'#coloring';coloring.target='_blank';coloring.rel='noopener';const links=text('p','','row');links.append(copywork,coloring);$('family-result').append(links);}
};
$('show-journal').onclick=()=>{
 const box=$('journal-result');box.hidden=false;box.replaceChildren(text('h3','Our practice summary'));
 const entries=Object.entries(journal.chapters);if(!entries.length){box.append(text('p','Your practice summary will appear as you explore.'));return;}
 const list=document.createElement('ul');for(const [id,value]of entries){const title=session.chapters.find(ch=>ch.id===id)?.title||id;list.append(text('li',title+': '+value.visits+' visit(s), '+value.correct+' / '+value.attempts+' practice answers matched, '+value.memory+' memory-verse practice(s)'+(value.completed?' · chapter finished.':'.')));}box.append(list);
 const clear=text('button','Clear this practice summary');clear.onclick=()=>{if(confirm('Clear the learning practice summary in this browser? Your adventure progress and backups will stay.')){journal={chapters:{}};saveJournal();box.replaceChildren(text('p','Practice summary cleared.'));}};box.append(clear);
};
addEventListener('message',event=>{
 if(event.origin!==origin||event.source!==game.contentWindow||!event.data?.type?.startsWith('sq-learning:'))return;
 if(event.data.type==='sq-learning:stopped'){stopWaiters.get(event.data.requestId)?.();return;}
 if(event.data.type==='sq-learning:ready'){lastVisited='';syncConfig();if(panel.open)post('pause');}
 if(event.data.type==='sq-learning:audio'&&!panel.open)status(event.data.text);
 if(event.data.type!=='sq-learning:state')return;
 const value=event.data.state;if(!activeOwner()||!value||typeof value.chapter!=='string'||!session?.chapters.some(ch=>ch.id===value.chapter))return;
 state=value;
 if(value.chapter!==lastVisited){lastVisited=value.chapter;selected=value.chapter;const stats=chapterStats();stats.visits++;stats.lastVisited=new Date().toISOString().slice(0,10);saveJournal();loadChapter(value.chapter);}
 if(value.completed){const stats=journal.chapters[value.chapter];if(stats){stats.completed=true;saveJournal();}}
 if(current&&selected===value.chapter)renderTasks();
});
addEventListener('pagehide',()=>{disposed=true;assistAbort?.abort();stopVoice();cancelRecording();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();cancelRecording();}});
async function init(){
 try{
  const response=await fetch(base+'session',{credentials:'same-origin'});if(!response.ok)throw Error('Learning together is unavailable. The game is still ready to play.');session=await response.json();
  settings={...settings,...read('scrollquest.learning.settings.v1',{})};
  if(!labels[settings.language])settings.language='en';if(!['young','middle','family'].includes(settings.age))settings.age='family';if(!['openai','device','off'].includes(settings.voiceMode))settings.voiceMode='openai';if(!['narrator','guide','companion'].includes(settings.voice))settings.voice='narrator';
  journal=read('scrollquest.learning.journal.v1',{chapters:{}});if(!journal.chapters||typeof journal.chapters!=='object')journal={chapters:{}};
  $('chapter').replaceChildren();for(const ch of session.chapters){const option=text('option',ch.id+' · '+ch.title);option.value=ch.id;$('chapter').append(option);}
  for(const [id,key]of [['voice-mode','voiceMode'],['voice-persona','voice'],['reading-level','age'],['study-language','language']])$(id).value=settings[key];for(const [id,key]of [['slow-voice','slow'],['auto-read','autoRead'],['npc-voice','npcVoice']])$(id).checked=!!settings[key];
  localize();syncConfig();await loadChapter(selected);
 }catch(error){status(error.message,true);}
}
init();
})();
