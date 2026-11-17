/* OpenAI narration only. Durable shared clips plus bounded on-device Cache Storage. */
const CACHE='faithsparks-learning-voice-v1', pending=new Map(), memory=new Map();
let session=null, audio=null, generation=0;
export function stopVoice(){generation++;if(audio){audio.pause();audio.onended=null;audio.onerror=null;audio=null}}
async function credentials(){
 if(!session)session=fetch('/labs/voice/session',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Voice is unavailable.');return r.json()}).catch(e=>{session=null;throw e});
 return session;
}
function normalized(text){return String(text||'').replace(/\s+/g,' ').trim()}
async function clip(text,game){
 const raw=normalized(text);if(!raw||raw.length>1800)throw Error('This passage is too long to read at once.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 const key='/labs/voice/cache/v1/'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(memory.has(key)){const blob=memory.get(key);memory.delete(key);memory.set(key,blob);return {blob,saved:true}}
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  let cache;try{cache=await caches.open(CACHE);const hit=await cache.match(key);if(hit){const blob=await hit.blob();if(blob.size)return {blob,saved:true}}}catch{}
  const config=await credentials(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
  let response;
  try{response=await fetch('/labs/voice/tts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf},body:JSON.stringify({game,text:raw}),signal:controller.signal})}finally{clearTimeout(timer)}
  if(response.status===403)session=null;
  if(!response.ok)throw Error(response.status===429?'Voice is resting. Try again shortly; you can keep playing.':response.status===409?'This voice clip is being prepared. Try again shortly.':'Voice is unavailable right now. You can keep playing.');
  if(!response.headers.get('Content-Type')?.startsWith('audio/'))throw Error('Voice is unavailable.');
  const blob=await response.blob();if(!blob.size||blob.size>2000000)throw Error('Voice is unavailable.');
  memory.set(key,blob);if(memory.size>40)memory.delete(memory.keys().next().value);
  try{if(cache){await cache.put(key,new Response(blob,{headers:{'Content-Type':'audio/mpeg'}}));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-150)))await cache.delete(old)}}catch{}
  return {blob,saved:response.headers.get('X-TTS-Cache')==='HIT'};
 })();pending.set(key,job);try{return await job}finally{pending.delete(key)}
}
export async function readVoice(text,game,onStatus=()=>{}){
 stopVoice();const token=generation;onStatus('Preparing OpenAI voice…');
 let url=null;
 try{
  const result=await clip(text,game);if(token!==generation)return;
  url=URL.createObjectURL(result.blob);audio=new Audio(url);
  audio.onended=()=>{URL.revokeObjectURL(url);if(token===generation){audio=null;onStatus('OpenAI voice · saved for replay')}};
  audio.onerror=()=>{URL.revokeObjectURL(url);if(token===generation){audio=null;onStatus('Audio could not play. Tap Read it to me to retry.')}};
  await audio.play();if(token===generation)onStatus(result.saved?'OpenAI voice · playing saved audio':'OpenAI voice · saved for replay');
  // Every started clip releases its temporary URL even when interrupted.
  const player=audio;player.addEventListener('pause',()=>URL.revokeObjectURL(url),{once:true});
 }catch(e){if(url)URL.revokeObjectURL(url);if(token===generation)onStatus(e.name==='AbortError'?'Voice took too long. Tap to try again.':e.message)}
}
export function attachVoice(button,game,text){
 if(!button)return;
 const status=document.createElement('span');status.className='labs-voice-status';status.setAttribute('role','status');button.after(status);
 button.addEventListener('click',()=>readVoice(typeof text==='function'?text():text,game,value=>status.textContent=value));
}
window.addEventListener('pagehide',stopVoice);
