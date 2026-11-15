import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './presentation-review.css';
const mount=document.getElementById('presentation-review-controls');
if(mount){
  const list=document.getElementById('presentation-slides');
  const form=document.getElementById('presentation-review-form');
  const cards=[...list.querySelectorAll('.wpe-slide')];
  const inputs=()=>[...form.querySelectorAll('[name="enabled_highlights"]')];
  const shown=()=>cards.filter(card=>card.querySelector('[name="visible_slides"]').checked).length;
  const chosen=()=>inputs().filter(input=>input.checked&&form.elements.namedItem(`highlight_text_${input.value}`)?.value.trim()).length;
  const original=cards.map(card=>card.dataset.id);
  const byId=id=>cards.find(card=>card.dataset.id===id);
  cards.forEach(card=>{card.querySelector('img').draggable=false;card.querySelector('[name="visible_slides"]').setAttribute('aria-label',`Show ${card.querySelector('img').alt.toLowerCase()}`);const slot=document.createElement('div');slot.className='presentation-slide-controls';card.appendChild(slot);});
  function Review(){
    const [order,setOrder]=useState(original);
    const [visible,setVisible]=useState(shown);
    const [highlights,setHighlights]=useState(chosen);
    const [position,setPosition]=useState(form.elements.namedItem('highlight_position')?.value||'after');
    const [notice,setNotice]=useState('');
    const latest=useRef(order);latest.current=order;
    const drag=useRef(null);
    useEffect(()=>{
      const change=()=>{cards.forEach(card=>card.classList.toggle('is-hidden',!card.querySelector('[name="visible_slides"]').checked));setVisible(shown());setHighlights(chosen());setPosition(form.elements.namedItem('highlight_position')?.value||'after');};
      const sync=()=>{document.getElementById('presentation-slide-order').value=latest.current.join(',');};
      const start=event=>{const card=event.target.closest('.wpe-slide');if(card){drag.current=card.dataset.id;event.dataTransfer?.setData('text/plain',card.dataset.id);}};
      const over=event=>{if(event.target.closest('.wpe-slide'))event.preventDefault();};
      const drop=event=>{const card=event.target.closest('.wpe-slide');if(!card||!drag.current)return;event.preventDefault();move(drag.current,latest.current.indexOf(card.dataset.id));drag.current=null;};
      const end=()=>{drag.current=null;};
      form.addEventListener('input',change);form.addEventListener('change',change);form.addEventListener('submit',sync);
      list.addEventListener('dragstart',start);list.addEventListener('dragover',over);list.addEventListener('drop',drop);list.addEventListener('dragend',end);
      return()=>{form.removeEventListener('input',change);form.removeEventListener('change',change);form.removeEventListener('submit',sync);list.removeEventListener('dragstart',start);list.removeEventListener('dragover',over);list.removeEventListener('drop',drop);list.removeEventListener('dragend',end);};
    },[]);
    useEffect(()=>{
      const focused=document.activeElement;
      order.forEach((id,index)=>{const card=byId(id);list.appendChild(card);card.setAttribute('aria-posinset',index+1);card.setAttribute('aria-setsize',order.length);});
      document.getElementById('presentation-slide-order').value=order.join(',');
      if(list.contains(focused))focused.focus({preventScroll:true});
    },[order]);
    function move(id,to){
      const from=latest.current.indexOf(id);if(from<0||to<0||to>=latest.current.length||from===to)return;
      const next=[...latest.current];next.splice(to,0,next.splice(from,1)[0]);setOrder(next);setNotice(`Slide moved to position ${to+1} of ${next.length}.`);
    }
    return <>
      <div className="presentation-review-summary"><p role="status" aria-live="polite">{visible} {visible===1?'slide':'slides'} shown · {cards.length-visible} hidden · {highlights} key {highlights===1?'point':'points'} selected · {visible+highlights} projected {visible+highlights===1?'slide':'slides'}</p><button type="button" className="wpe-secondary" onClick={()=>{setOrder(original);setNotice('Order changes reset. Visibility choices were kept.');}}>Reset order changes</button></div>
      <p className="wpe-meta">Selected key points appear {position==='before'?'before':'after'} the imported slides. Only checked, nonempty key points are projected.</p>
      <p className="small muted" role="status" aria-live="polite">{notice}</p>
      {order.map((id,index)=>createPortal(<><span className="small muted">Position {index+1} of {order.length}</span><div><button type="button" className="wpe-secondary" disabled={index===0} aria-label={`Move ${byId(id).querySelector('img').alt.toLowerCase()} earlier`} onClick={()=>move(id,index-1)}>Move earlier</button><button type="button" className="wpe-secondary" disabled={index===order.length-1} aria-label={`Move ${byId(id).querySelector('img').alt.toLowerCase()} later`} onClick={()=>move(id,index+1)}>Move later</button></div></>,byId(id).querySelector('.presentation-slide-controls'),id))}
    </>;
  }
  createRoot(mount).render(<Review />);
}
