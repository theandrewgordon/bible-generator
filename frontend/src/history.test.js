import test from 'node:test';
import assert from 'node:assert/strict';
import { pageBundle } from './test-bundle.js';
import { JSDOM } from 'jsdom';
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
test('filtered-out worksheets never enter the reviewed bulk-delete payload',async()=>{
 const dom=new JSDOM(`<form id="bulkDeleteForm"><input name="csrf_token" value="token"><div id="history-selection"></div><ul id="cards">
 <li class="card"><span class="title" data-title="John 3:16"></span><input class="row-check" type="checkbox" name="selected_files" value="john.pdf"></li>
 <li class="card"><span class="title" data-title="Psalm 23"></span><input class="row-check" type="checkbox" name="selected_files" value="psalm.pdf"></li>
 </ul><button type="submit" formaction="/delete/one" id="single">Single delete</button></form>`,{url:'https://example.test/history',runScripts:'outside-only'});
 const w=dom.window,d=w.document,form=d.querySelector('form');const checks=[...d.querySelectorAll('.row-check')];
 const click=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text).click();
 let payload,allowed=0;
 try{
  w.eval(pageBundle('history'));await settle();
  form.addEventListener('submit',event=>{if(!event.defaultPrevented){allowed++;payload=new w.FormData(form);}event.preventDefault();});
  d.querySelector('#history-selection input').click();await settle();
  click('Delete selected');await settle();
  assert.match(d.querySelector('.history-delete-review').textContent,/Delete 2 worksheets/);
  checks[1].closest('.card').hidden=true;d.dispatchEvent(new w.Event('history:filtered'));await settle();
  assert.equal(checks[1].checked,false);assert.equal(d.querySelector('.history-delete-review'),null);
  click('Delete selected');await settle();
  assert.match(d.querySelector('.history-delete-review').textContent,/Delete 1 worksheet/);
  assert.doesNotMatch(d.querySelector('.history-delete-review').textContent,/Psalm/);
  click('Confirm deletion');await settle();
  assert.equal(allowed,1);assert.deepEqual([...payload.getAll('selected_files')],['john.pdf']);assert.equal(payload.get('csrf_token'),'token');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(allowed,1);
  d.getElementById('single').click();assert.equal(allowed,2);
 }finally{w.close();}
});
test('selection changed without an input event cannot bypass the reviewed list',async()=>{
 const dom=new JSDOM('<form id="bulkDeleteForm"><div id="history-selection"></div><div class="card"><input class="row-check" name="selected_files" value="one" type="checkbox"></div><div class="card"><input class="row-check" name="selected_files" value="two" type="checkbox"></div></form>',{url:'https://example.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 try{
  w.eval(pageBundle('history'));await settle();
  const rows=d.querySelectorAll('.row-check');rows[0].click();await settle();
  [...d.querySelectorAll('button')].find(b=>b.textContent==='Delete selected').click();await settle();
  rows[1].checked=true;let allowed=false;d.querySelector('form').addEventListener('submit',e=>{allowed=!e.defaultPrevented;e.preventDefault();});
  [...d.querySelectorAll('button')].find(b=>b.textContent==='Confirm deletion').click();await settle();
  assert.equal(allowed,false);
 }finally{w.close();}
});
