import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createLivePoll} from './live-poll.js';
import './live-setup.css';
const mount=document.getElementById('live-setup-connection');
if(mount){
 const config=JSON.parse(document.getElementById('live-setup-config').textContent);
 const label=document.getElementById('screen-state'),session=document.getElementById('session-status'),display=document.getElementById('display-status'),copy=document.getElementById('copy-status');
 const launches=[...document.querySelectorAll('.launch')],copies=[...document.querySelectorAll('[data-copy]')];
 let ended=false,revision=-1,controller;
 function disable(){ended=true;launches.forEach(link=>{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.tabIndex=-1;});copies.forEach(button=>{button.disabled=true;});document.querySelectorAll('.qr').forEach(image=>{image.hidden=true;});copy.textContent='This session has ended. Return to Worship to start another.';}
 function Connection(){
  const[status,setStatus]=useState('connecting');
  useEffect(()=>{
   controller=createLivePoll({url:`/worship/live/state/${encodeURIComponent(config.sessionId)}`,fetcher:(...args)=>fetch(...args),visible:()=>document.visibilityState!=='hidden',interval:2500,onData:data=>{
    const next=Number(data.revision)||0;if(next<revision)return;revision=next;
    window.WorshipDisplayStatus(display,data);label.textContent=data.blank?'BLACK SCREEN':data.clear_words?'WORDS CLEARED':'LIVE';label.dataset.state=data.blank?'black':data.clear_words?'clear':'live';session.textContent=`Slide ${(Number(data.current_index)||0)+1} of ${Number(data.slide_count)||0} · Session connected`;
   },onStatus:value=>{setStatus(value);if(value==='ended'){disable();label.textContent='ENDED';label.dataset.state='ended';session.textContent='Session ended';display.textContent='Audience report unavailable: session ended';display.dataset.status='ended';}else if(value==='reconnecting'){session.textContent='Session reconnecting…';display.textContent='Audience report unavailable while reconnecting';display.dataset.status='offline';}}});
   const pause=()=>controller.pause(),resume=()=>controller.resume(),visibility=()=>document.visibilityState==='hidden'?pause():resume();
   document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);controller.resume();
   return()=>{controller.stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',resume);};
  },[]);
  return status==='reconnecting'?<button type="button" className="button" onClick={()=>controller.refresh()}>Retry connection</button>:null;
 }
 const audience=document.getElementById('open-audience');
 audience.addEventListener('click',event=>{if(ended){event.preventDefault();return;}const popup=window.open(audience.href,`worship-audience-${config.sessionId}`,'popup=yes,width=1280,height=720');if(popup){popup.opener=null;popup.focus();event.preventDefault();}});
 launches.forEach(link=>link.addEventListener('click',event=>{if(ended)event.preventDefault();}));
 copies.forEach(button=>button.addEventListener('click',async()=>{if(ended)return;try{if(!navigator.clipboard){window.prompt('Copy this link',button.dataset.copy);return;}await navigator.clipboard.writeText(button.dataset.copy);if(!ended)copy.textContent='Link copied.';}catch{if(!ended)copy.textContent='Copy was unavailable. Use an Open link or try again.';}}));
 createRoot(mount).render(<Connection />);
}
