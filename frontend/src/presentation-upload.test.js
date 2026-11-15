import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pageBundle } from './test-bundle.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
test('native upload validates, blocks duplicates, and recovers on cached Back navigation',async()=>{
 const dom=new JSDOM('<form id="presentation-import-form" method="post"><input id="presentation-file" type="file" name="presentation"><input name="title" value="Sunday"><textarea name="sermon_notes">Keep these notes</textarea><input name="csrf_token" value="token"><button id="presentation-import-submit">Import and review</button><div id="presentation-import-feedback"></div></form><script id="presentation-import-config" type="application/json">{"pdf":true,"pptx":true,"maxBytes":26214400}</script>',{url:'https://example.test/import',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,form=d.querySelector('form'),input=d.querySelector('[type=file]');let selected;
 Object.defineProperty(input,'files',{get:()=>selected?[selected]:[]});let submits=0;
 try{w.eval(pageBundle('presentation-upload'));await settle();
 form.addEventListener('submit',event=>{if(!event.defaultPrevented)submits++;event.preventDefault();});
 selected=new w.File(['bad'],'wrong.txt');input.dispatchEvent(new w.Event('change'));await settle();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(submits,0);assert.match(d.querySelector('[role=alert]').textContent,/\.pptx or \.pdf/);
 selected=new w.File(['%PDF'],'sermon.pdf');input.dispatchEvent(new w.Event('change'));await settle();
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.equal(submits,1);assert.equal(d.getElementById('presentation-import-submit').disabled,true);assert.match(d.querySelector('[role=status]').textContent,/Uploading/);
 w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await settle();
 assert.equal(d.getElementById('presentation-import-submit').disabled,false);assert.equal(form.hasAttribute('aria-busy'),false);
 assert.equal(form.elements.namedItem('sermon_notes').value,'Keep these notes');assert.equal(form.elements.namedItem('csrf_token').value,'token');
 }finally{w.close();}
});
