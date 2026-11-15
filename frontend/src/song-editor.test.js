import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pageBundle } from './test-bundle.js';
const settle=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(song){return new JSDOM(`<form><input name="csrf_token" value="token"><div id="parts-list"></div><button type="button" id="add-part-btn">Add Part</button><div id="arrangement-chips"></div><div id="arrangement-order"></div><input type="hidden" name="arrangement" id="arrangement-input"><button type="submit">Save</button></form><script id="song-editor-config" type="application/json">${JSON.stringify({song,previewUrl:'/preview',csrf:'token'})}</script>`,{url:'https://example.test/edit',runScripts:'outside-only'});}
function edit(w,input,value){Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));}
const song={parts:{verse1:['First','Second'],chorus:['Grace']},slide_breaks:{verse1:[1]},arrangement:['verse1','chorus','verse1']};
test('saved slide breaks and repeated arrangement survive renaming and keyboard-friendly reorder',async()=>{
 const dom=setup(song),w=dom.window,d=w.document;w.fetch=async()=>new Response('{"slides":[]}');
 try{w.eval(pageBundle('song-editor'));await settle();
 const lines=d.querySelectorAll('[name=part_lines]');assert.equal(lines[0].value,'First\n\nSecond');
 edit(w,d.querySelector('[name=part_name]'),'verse2');await settle();
 assert.equal(d.getElementById('arrangement-input').value,'verse2,chorus,verse2');
 d.querySelector('[aria-label="Move arrangement item 2 earlier"]').click();await settle();
 let payload;d.querySelector('form').addEventListener('submit',e=>{if(!e.defaultPrevented)payload=new w.FormData(e.target);e.preventDefault();});
 d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(payload.get('arrangement'),'chorus,verse2,verse2');assert.equal(payload.getAll('part_lines')[0],'First\n\nSecond');assert.equal(payload.get('csrf_token'),'token');
 d.querySelector('[aria-label="Remove part 1"]').click();await settle();assert.equal(d.getElementById('arrangement-input').value,'chorus');
 }finally{w.close();}
});
test('clearing lyrics invalidates requests even if the server ignores cancellation',async()=>{
 const dom=setup(song),w=dom.window,d=w.document;const responses=[];
 w.fetch=(url,options)=>{assert.equal(options.headers['X-CSRF-Token'],'token');return new Promise(resolve=>responses.push(resolve));};
 try{w.eval(pageBundle('song-editor'));for(let i=0;i<40&&responses.length<2;i++) await settle(25);assert.equal(responses.length,2);
 edit(w,d.querySelector('[name=part_lines]'),'');await settle();
 responses[0](new Response('{"slides":[{"lines":["OLD LYRICS"]}]}'));await settle();
 assert.doesNotMatch(d.querySelector('.wa-part-row').textContent,/OLD LYRICS/);assert.equal(d.querySelector('[name=part_lines]').value,'');
 }finally{w.close();}
});
test('ambiguous part names cannot silently overwrite lyrics on save',async()=>{
 const dom=setup(song),w=dom.window,d=w.document;w.fetch=async()=>new Response('{"slides":[]}');
 try{w.eval(pageBundle('song-editor'));await settle();edit(w,d.querySelectorAll('[name=part_name]')[1],'Verse 1');await settle();
 const event=new w.Event('submit',{bubbles:true,cancelable:true});d.querySelector('form').dispatchEvent(event);await settle();
 assert.equal(event.defaultPrevented,true);assert.match(d.querySelector('[role=alert]').textContent,/unique name/);
 }finally{w.close();}
});
