import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './deck-review.css';
const mount = document.getElementById('deck-review-controls');
const slides = [...document.querySelectorAll('.wdr-slide')];
if (mount && slides.length) {
  const flagged = slides.map((slide,index)=>slide.classList.contains('is-crowded')?index:null).filter(index=>index!==null);
  function Review() {
    const [active,setActive] = useState(0);
    const [onlyFlagged,setOnlyFlagged] = useState(false);
    const visible = onlyFlagged ? flagged : slides.map((_,index)=>index);
    const current = visible.includes(active) ? active : visible[0];
    const position = visible.indexOf(current);
    const initialized = useRef(false);
    const focusRequested = useRef(false);
    function go(index) {if(index===undefined)return;focusRequested.current=true;setActive(index);if(index===current){slides[index].focus();slides[index].scrollIntoView({block:'center'});}}
    useEffect(()=>{
      slides.forEach((slide,index)=>{slide.hidden=onlyFlagged&&!flagged.includes(index);slide.classList.toggle('is-current',index===current);if(index===current)slide.setAttribute('aria-current','true');else slide.removeAttribute('aria-current');});
      if(initialized.current&&focusRequested.current&&current!==undefined){slides[current].focus();slides[current].scrollIntoView({block:'center'});}
      initialized.current=true;focusRequested.current=false;
    },[current,onlyFlagged]);
    useEffect(()=>{
      const click=event=>{const slide=event.target.closest('.wdr-slide');if(slide)setActive(slides.indexOf(slide));};
      const key=event=>{
        if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
        if(!event.target.closest('#deck-review-controls,.wdr-slide'))return;
        const target=event.key==='ArrowRight'?visible[position+1]:event.key==='ArrowLeft'?visible[position-1]:event.key==='Home'?visible[0]:event.key==='End'?visible.at(-1):undefined;
        if(target!==undefined){event.preventDefault();go(target);}
      };
      document.addEventListener('click',click);document.addEventListener('keydown',key);
      return()=>{document.removeEventListener('click',click);document.removeEventListener('keydown',key);};
    },[current,onlyFlagged]);
    return <><div className="deck-review-nav" aria-label="Slide navigation">
      <button type="button" className="button ghost" disabled={position<=0} onClick={()=>go(visible[position-1])}>Previous slide</button>
      <span role="status" aria-live="polite">{current===undefined?'No crowded slides':`Slide ${current+1} of ${slides.length}`} · {flagged.length} crowded</span>
      <button type="button" className="button ghost" disabled={position>=visible.length-1} onClick={()=>go(visible[position+1])}>Next slide</button>
      <button type="button" className="button ghost" disabled={!flagged.length} onClick={()=>go(flagged.find(index=>index>current)??flagged[0])}>Next crowded slide</button>
      <label><input type="checkbox" checked={onlyFlagged} onChange={event=>{setOnlyFlagged(event.target.checked);if(event.target.checked&&!flagged.includes(active))setActive(flagged[0]??0);}} />Crowded slides only</label>
    </div><p className="small muted">Use Left/Right arrows, Home, or End while focused on a slide or these controls. Crowded slides are flagged for text density; the checklist above still applies.</p></>;
  }
  slides.forEach((slide,index)=>{slide.tabIndex=0;slide.setAttribute('aria-label',`Slide ${index+1}${flagged.includes(index)?', crowded':''}`);});
  createRoot(mount).render(<Review />);
}
