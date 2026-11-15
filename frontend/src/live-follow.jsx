import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {createFollowConnection} from './follow-connection.js';
import {createWakeKeeper} from './follow-wake.js';
import './live-follow.css';
const mount=document.getElementById('live-follow-root');
if(mount){
  const config=JSON.parse(document.getElementById('live-follow-config').textContent);
  const slides=config.slides;
  const statusNode=document.getElementById('wf-status');statusNode.replaceChildren();
  const bar=document.querySelector('.wf-bar');bar.replaceChildren();
  function Follow(){
    const [state,setState]=useState({...config.initial,status:'connecting',ended:false,loop:null});
    const [size,setSize]=useState(()=>{try{return Math.min(1.8,Math.max(.7,Number(localStorage.getItem('fsFollowSize'))||1));}catch{return 1;}});
    const [wake,setWake]=useState({wanted:false,active:false,pending:false,message:''});
    const keeper=useRef(null);
    useEffect(()=>{
      const visible=()=>document.visibilityState!=='hidden';
      const connection=createFollowConnection({sessionId:config.sessionId,initial:{...config.initial,slideCount:slides.length},fetcher:(...args)=>fetch(...args),visible,publish:update=>setState(current=>({...current,...update})),reload:()=>window.location.reload()});
      keeper.current='wakeLock' in navigator?createWakeKeeper({request:()=>navigator.wakeLock.request('screen'),visible,publish:setWake}):null;
      const pause=()=>{connection.pause();keeper.current?.pause();};
      const resume=()=>{connection.resume();keeper.current?.resume();};
      const visibility=()=>{if(visible())resume();else pause();};
      document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);
      connection.resume();
      return()=>{connection.stop();keeper.current?.stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',resume);};
    },[]);
    useEffect(()=>{document.body.style.setProperty('--size',size);try{localStorage.setItem('fsFollowSize',String(size));}catch{}},[size]);
    React.useLayoutEffect(()=>{document.body.classList.toggle('is-hidden-words',state.clearWords);statusNode.classList.toggle('is-offline',state.status!=='following');if(state.ended)keeper.current?.setWanted(false);},[state.clearWords,state.status,state.ended]);
    useEffect(()=>{
      if(state.ended||!state.loop?.seconds||!state.loop.started||!state.loop.indices.length)return;
      const timer=setInterval(()=>{if(document.visibilityState==='hidden')return;const loop=state.loop;const index=loop.indices[Math.floor(Math.max(0,Date.now()/1000+loop.offset-loop.started)/loop.seconds)%loop.indices.length];setState(current=>current.current===index?current:{...current,current:index});},500);
      return()=>clearInterval(timer);
    },[state.loop,state.ended]);
    const slide=slides[state.current]||{},next=slides[state.current+1];
    function content(){
      if(state.ended)return <p className="wf-quiet">The service has ended. Thanks for worshiping with us.</p>;
      if(state.blank)return <p className="wf-quiet">· · ·</p>;
      return <><p className="wf-part">{slide.part_label||''}</p>{slide.kind==='divider'?<><h1 className="wf-title">{slide.title}</h1>{slide.artist&&<p className="wf-meta">{slide.artist}</p>}{slide.credit&&<p className="wf-credit">{slide.credit}</p>}</>:['lyric','highlight'].includes(slide.kind)?<div className="wf-lines">{(slide.lines||[]).join('\n')}</div>:slide.kind==='video'?<><h1 className="wf-title">{slide.title||'Video'}</h1><p className="wf-meta">Playing on the main screen</p></>:<>{slide.image_url&&<img className="wf-image" src={slide.image_url} alt=""/>}{slide.kind!=='presentation'&&<><h1 className="wf-title">{slide.title}</h1>{slide.lines&&<p className="wf-meta">{slide.lines.join('\n')}</p>}</>}</>}</>;
    }
    const status={connecting:'Connecting…',following:'Following',reconnecting:'Reconnecting…',ended:'Ended',reloading:'Updating slides…'}[state.status];
    return <>
      {createPortal(status,statusNode)}
      {createPortal(content(),document.getElementById('wf-main'))}
      {createPortal(!state.ended&&!state.blank&&next&&(next.kind==='lyric'||next.title)?<><b>Up next</b>{next.kind==='lyric'?(next.lines||[]).join('\n'):next.title}</>:null,document.getElementById('wf-next'))}
      {createPortal(<><button type="button" className="wf-btn" id="wf-smaller" aria-label="Smaller text" onClick={()=>setSize(value=>Math.max(.7,Math.round((value-.1)*10)/10))}>A−</button><button type="button" className="wf-btn" id="wf-bigger" aria-label="Larger text" onClick={()=>setSize(value=>Math.min(1.8,Math.round((value+.1)*10)/10))}>A+</button>{'wakeLock' in navigator&&<button type="button" className="wf-btn" id="wf-awake" aria-pressed={wake.wanted} disabled={state.ended} onClick={()=>keeper.current?.setWanted(!wake.wanted)}>{wake.active?'Screen stays on':wake.pending&&wake.wanted?'Requesting screen…':wake.wanted?'Screen-on paused':'Keep screen on'}</button>}{wake.message&&<span className="wf-wake-message" role="status">{wake.message}</span>}</>,bar)}
    </>;
  }
  createRoot(mount).render(<Follow />);
}
