import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
test('production editor previews each page and preserves choices through validation and failed downloads', async () => {
  const dom = new JSDOM(`<form id="worksheetForm" action="/generate">
    <input name="csrf_token" value="token"><input name="verse" id="verseInput">
    <input name="custom_text"><input name="agreeTerms" type="checkbox">
    <button id="submitBtn" type="submit">Make a worksheet</button>
    <div id="worksheet-feedback"></div><div id="worksheet-preview"></div></form>`, {url:'https://example.test/generate', runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window, d = w.document, mount = d.getElementById('worksheet-preview');
  let state = {verses:['John 3:16', 'Psalm 23:1'],version:'WEB',level:'beginner',cursive:true,title:'',text:'',prompt:''};
  const update = () => {mount.dataset.state = JSON.stringify(state); mount.dispatchEvent(new w.CustomEvent('worksheet:change'));};
  update();
  let calls=0, payload;
  w.fetch = async (url, options) => {calls++; payload=options.body; return new Response('<html>Sign in</html>', {headers:{'Content-Type':'text/html'}});};
  try {
    w.eval(readFileSync(new URL('../../static/dist/worksheet/worksheet.js', import.meta.url),'utf8')); await settle();
    assert.match(mount.textContent,/John 3:16/);
    assert.equal(mount.querySelectorAll('.preview-writing-lines i').length,5);
    [...mount.querySelectorAll('button')].find(b=>b.textContent==='Next').click(); await settle();
    assert.match(mount.textContent,/Psalm 23:1/);
    d.getElementById('submitBtn').click(); await settle();
    assert.equal(calls,1); assert.equal(payload.get('verse'),'John 3:16, Psalm 23:1');
    assert.equal(payload.get('csrf_token'),'token');
    assert.match(d.querySelector('[role=alert]').textContent,/session may have expired/);
    assert.equal(d.activeElement,d.querySelector('[role=alert]'));
    assert.equal(d.getElementById('submitBtn').disabled,false);
    state={...state,verses:[],text:'Custom prayer'}; update(); await settle();
    d.getElementById('submitBtn').click(); await settle();
    assert.equal(calls,1); assert.match(d.querySelector('[role=alert]').textContent,/Confirm/);
    state={...state,text:''}; update(); await settle();
    d.getElementById('submitBtn').click(); await settle();
    assert.match(d.querySelector('[role=alert]').textContent,/Enter a Bible reference/);
  } finally {w.close();}
});

test('download submission is locked until a pending response finishes', async () => {
  const dom=new JSDOM('<form id="worksheetForm"><input name="verse"><button id="submitBtn" type="submit">Build</button><div id="worksheet-feedback"></div><div id="worksheet-preview"></div></form>',{url:'https://example.test/generate',runScripts:'outside-only'});
  const w=dom.window, d=w.document; let resolve, calls=0;
  d.getElementById('worksheet-preview').dataset.state=JSON.stringify({verses:['John 3:16'],version:'WEB',level:'growing',cursive:false,title:'',text:'',prompt:''});
  w.fetch=()=>{calls++;return new Promise(done=>{resolve=done;});};
  try {
    w.eval(readFileSync(new URL('../../static/dist/worksheet/worksheet.js',import.meta.url),'utf8'));await settle();
    const form=d.querySelector('form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(calls,1);assert.equal(d.getElementById('submitBtn').disabled,true);
    resolve(new Response('',{status:500}));await settle();
    assert.equal(d.getElementById('submitBtn').disabled,false);assert.equal(form.hasAttribute('aria-busy'),false);
  } finally {w.close();}
});
