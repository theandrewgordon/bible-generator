import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {createLivePoll} from './live-poll.js';
import {createWakeKeeper} from './follow-wake.js';
import './live-remote.css';
const mount=document.getElementById('live-remote-connection');
if(mount){
 let update=()=>{};let state={status:'connecting',wake:{wanted:false,active:false,pending:false}};
 const publish=patch=>{state={...state,...patch};update(state);};
 const awake=document.getElementById('wr-awake');awake.replaceChildren();
 let transport=null,keeper=null;
 function Feedback(){const[value,setValue]=useState(state);update=setValue;return <>
  {value.status==='reconnecting'&&<button type="button" className="wr-btn" onClick={()=>transport?.refresh()}>Retry connection</button>}
  {value.wake.message&&<p role="status">{value.wake.message}</p>}
  {createPortal(value.wake.active?'Screen stays awake':value.wake.pending&&value.wake.wanted?'Requesting screen…':value.wake.wanted?'Screen-on paused':'Keep screen awake',awake)}
 </>;}
 createRoot(mount).render(<Feedback />);
 document.dispatchEvent(new CustomEvent('worship:remote-connect',{detail:{start(adapter){
  const visible=()=>document.visibilityState!=='hidden';
  keeper='wakeLock'in navigator?createWakeKeeper({request:()=>navigator.wakeLock.request('screen'),visible,publish:wake=>{publish({wake});awake.setAttribute('aria-pressed',String(wake.wanted));}}):null;
  if(!keeper)awake.hidden=true;
  transport=createLivePoll({url:`/worship/live/state/${encodeURIComponent(adapter.sessionId)}`,fetcher:(...args)=>fetch(...args),visible,interval:3000,onData:adapter.onData,onStatus:status=>{publish({status});adapter.onStatus(status);if(status==='ended')keeper?.setWanted(false);}});
  const pause=()=>{transport.pause();keeper?.pause();adapter.pause();};
  const resume=()=>{transport.resume();keeper?.resume();adapter.resume();};
  const change=()=>visible()?resume():pause();
  document.addEventListener('visibilitychange',change);window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);
  const api={refresh:()=>transport.refresh(),stop(){transport.stop();keeper?.stop();},wantAwake:()=>{if(!state.wake.wanted)keeper?.setWanted(true);},toggleAwake:()=>keeper?.setWanted(!state.wake.wanted)};
  adapter.ready(api);transport.resume();
 }}}));
}
