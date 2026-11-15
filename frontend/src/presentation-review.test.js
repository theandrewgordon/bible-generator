import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pageBundle } from './test-bundle.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
test('slide moves, visibility, and key-point selections serialize without losing notes or submit intent',async()=>{
 const dom=new JSDOM(`<form id="presentation-review-form"><input name="csrf_token" value="token"><input name="slide_order" id="presentation-slide-order"><textarea name="sermon_notes">Notes</textarea><div id="presentation-review-controls"></div><ul id="presentation-slides">${['a','b','c'].map((id,index)=>`<li class="wpe-slide" data-id="${id}" draggable="true"><img alt="Imported slide ${index+1}"><input name="visible_slides" type="checkbox" value="${id}" checked></li>`).join('')}</ul><input name="enabled_highlights" type="checkbox" value="point1"><input name="highlight_text_point1" value="Grace"><select name="highlight_position"><option value="after">After</option><option value="before">Before</option></select><button type="submit" name="action" value="reanalyze">Refresh</button></form>`,{url:'https://example.test/edit',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,form=d.querySelector('form');let payload;
 try{w.eval(pageBundle('presentation-review'));await settle();
 d.querySelector('[aria-label="Move imported slide 2 earlier"]').click();await settle();assert.equal(d.getElementById('presentation-slide-order').value,'b,a,c');
 d.querySelector('[name=visible_slides][value=a]').click();d.querySelector('[name=enabled_highlights]').click();await settle();
 assert.match(d.querySelector('[role=status]').textContent,/2 slides shown · 1 hidden · 1 key point selected · 3 projected slides/);
 assert.equal(d.querySelector('[data-id=a]').classList.contains('is-hidden'),true);
 form.addEventListener('submit',event=>{payload=new w.FormData(form,event.submitter);event.preventDefault();});d.querySelector('button[value=reanalyze]').click();await settle();
 assert.equal(payload.get('slide_order'),'b,a,c');assert.deepEqual([...payload.getAll('visible_slides')],['b','c']);assert.deepEqual([...payload.getAll('enabled_highlights')],['point1']);assert.equal(payload.get('sermon_notes'),'Notes');assert.equal(payload.get('csrf_token'),'token');assert.equal(payload.get('action'),'reanalyze');
 [...d.querySelectorAll('button')].find(button=>button.textContent==='Reset order changes').click();await settle();assert.equal(d.getElementById('presentation-slide-order').value,'a,b,c');assert.equal(d.querySelector('[name=visible_slides][value=a]').checked,false);
 }finally{w.close();}
});
