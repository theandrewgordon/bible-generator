/* Optional host integration. The standalone release stays unchanged. */
(function(){
'use strict';
if(window.parent===window)return;
const origin=location.origin,send=message=>parent.postMessage(message,origin);
const owner=()=>document.cookie.match(/(?:^|;\s*)faithsparks_labs_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
let config=null,catalog=null,chapterId='',hooked=false,pausedByPanel=false;
let audio=null,abort=null,serial=0,lastState='',lastPhase='',requested=false,disposed=false;
const normalized=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function stop(){
 serial++;if(abort)abort.abort();abort=null;
 if(audio){audio.pause();URL.revokeObjectURL(audio.src);audio=null;}
 if(window.SQ?.Speech)SQ.Speech.active=false;
 window.speechSynthesis?.cancel();
}
function status(text){send({type:'sq-learning:audio',text});}
async function cueReading(cue,voice='narrator',fallbackText=''){
 stop();const current=serial;
 const text=catalog?.cues?.[cue]?.text||fallbackText;
 if(!text||!config||config.owner!==owner()||config.voiceMode==='off')return;
 const Speech=window.SQ?.Speech;
 const volume=window.SQ?.setting?Math.max(0,Math.min(1,Number(SQ.setting('voiceVolume'))/100)):1;
 if(!volume)return;
 const device=()=>{if(current!==serial||config?.owner!==owner())return;if(Speech?._deviceSay)Speech._deviceSay(text);else{const u=new SpeechSynthesisUtterance(text);u.rate=.9;u.volume=volume;window.speechSynthesis?.speak(u);}};
 if(config.voiceMode==='device'){device();return;}
 abort=new AbortController();status('Preparing AI-generated voice…');
 try{
  const response=await fetch('/labs/scroll-quest/learning/narrate',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf,'X-Labs-Owner':config.owner},body:JSON.stringify({chapter:chapterId,cue,voice}),signal:abort.signal});
  if(!response.ok)throw Error('Narration is unavailable.');
  const blob=await response.blob();if(current!==serial||config?.owner!==owner())return;
  const objectURL=URL.createObjectURL(blob);audio=new window.Audio(objectURL);audio.volume=volume;audio.playbackRate=config.slow?.8:1;
  const finish=()=>{if(current!==serial)return;if(Speech)Speech.active=false;URL.revokeObjectURL(objectURL);audio=null;status('');};
  audio.onended=finish;audio.onerror=finish;
  await audio.play();if(current!==serial){audio?.pause();return;}if(Speech)Speech.active=true;status('AI-generated voice');
 }catch(error){if(error.name==='AbortError'||current!==serial)return;status('Using the device voice.');device();}
}
function findCue(text,exact=false){
 const target=normalized(text);const entries=Object.entries(catalog?.cues||{});
 return entries.filter(([,cue])=>{const value=normalized(cue.text);return value.length>8&&(target===value||(!exact&&target.includes(value)));}).sort((a,b)=>b[1].text.length-a[1].text.length)[0]?.[0];
}
function install(){
 if(!window.SQ?.state?.level||!SQ.Speech)return;
 const S=SQ.state;
 if(!hooked){
  hooked=true;const speech=SQ.Speech;
  speech._deviceSay=speech.say.bind(speech);const deviceStop=speech.stop.bind(speech);
  speech.say=function(text){
   S.lastSpoken=text;const page=S.story?.pages?.[S.story.i]?.text;const cue=page&&normalized(text).includes(normalized(page))?findCue(page,true):findCue(text);
   if(config?.voiceMode==='off'){stop();return;}
   if(cue&&config?.voiceMode==='openai'){cueReading(cue,config.voice||'narrator',text);return;}
   stop();speech._deviceSay(text);
  };
  speech.stop=function(){stop();deviceStop();};
 }
 if(S.level.id!==chapterId&&!requested){
  chapterId=S.level.id;requested=true;
  fetch('/labs/scroll-quest/learning/chapter/'+encodeURIComponent(chapterId)).then(r=>r.ok?r.json():null).then(value=>{catalog=value;}).catch(()=>{}).finally(()=>{requested=false;});
 }
 for(const interaction of S.interactables||[]){
  if(!interaction.talkPerson||interaction._learningVoice)continue;
  interaction._learningVoice=true;const original=interaction.use;
  interaction.use=function(...args){
   const before=S.stats?.msgs?.length||0,result=original.apply(this,args);
   if(config?.npcVoice&&config.voiceMode!=='off'){const notice=(S.stats?.msgs||[]).slice(before).join(' '),text=notice.match(/“([\s\S]*)”/)?.[1]||'',cue=findCue(text,true);if(cue)cueReading(cue,'companion');else if(text){stop();SQ.Speech._deviceSay(text);}}
   return result;
  };
 }
 if(S.phase!==lastPhase){
  if(lastPhase==='story'&&S.phase!=='story'&&!pausedByPanel)stop();
  lastPhase=S.phase;
 }
 const player=S.players?.find(p=>p.joined),tasks={};for(const [id,value]of Object.entries(S.tasks||{}))tasks[id]=value.count||0;
 const pg=S.story?.pages?.[S.story.i];
 const position=player?.pos?[player.pos.x,player.pos.y,player.pos.z].map(v=>Math.round(v)):null;const objective=Array.isArray(S.objective)&&S.objective.every(Number.isFinite)?S.objective.map(v=>Math.round(v)):null;
 const state={chapter:S.level.id,phase:S.phase,role:player?.role?.id||'',tasks,position,objective,story:pg?{text:pg.text||'',ref:pg.ref||'',title:pg.title||''}:null,completed:S.phase==='results'};
 const key=JSON.stringify(state);if(key!==lastState){lastState=key;send({type:'sq-learning:state',state});}
}
function escapeKey(){if(window.SQ?._keys){SQ._keys.down('Escape');SQ._keys.up('Escape');}}
addEventListener('message',event=>{
 if(event.origin!==origin||event.source!==parent||!event.data?.type?.startsWith('sq-learning:'))return;
 const message=event.data;
 if(message.type==='sq-learning:config'){
  config=message.config;
  if(window.SQ&&typeof config.autoRead==='boolean')SQ.setSetting('speak',config.autoRead?'1':'0');
 }else if(message.type==='sq-learning:pause'){
  stop();const phase=window.SQ?.state?.phase;
  if(['play','story'].includes(phase)){pausedByPanel=true;escapeKey();}
 }else if(message.type==='sq-learning:resume'){
  stop();requestAnimationFrame(()=>{if(pausedByPanel&&window.SQ?.state?.phase==='paused')escapeKey();pausedByPanel=false;});window.focus();
 }else if(message.type==='sq-learning:stop'){stop();send({type:'sq-learning:stopped',requestId:message.requestId});}
 else if(message.type==='sq-learning:speak'&&catalog?.cues?.[message.cue])cueReading(message.cue,message.voice||'narrator');
});
send({type:'sq-learning:ready'});
const timer=setInterval(()=>{if(!disposed)install();},350);
addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);stop();});
})();
