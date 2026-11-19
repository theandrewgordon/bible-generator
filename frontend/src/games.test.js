import test from 'node:test';
import assert from 'node:assert/strict';
import { pageBundle } from './test-bundle.js';
import { JSDOM } from 'jsdom';
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
function setup(){
 return new JSDOM(`<form><input name="csrf_token" value="csrf"><select id="gameType"><option value="word-search">Word Search</option><option value="crossword">Crossword</option><option value="match">Match</option></select>
 <textarea id="references">John 3:16</textarea><select id="version"><option value="web">WEB</option><option value="kjv">KJV</option></select><select id="difficulty"><option value="standard">Standard</option><option value="hard">Hard</option></select>
 <input id="title"><input id="theme"><p id="gameTypeHelp"></p><p id="matchItemsSummary"></p><p id="matchItemsLabel"></p><p id="topicHelp"></p><div id="matchCreateFields"></div>
 <div id="suggestedTopicList"></div><button type="button" id="shuffleTopics">Shuffle</button>
 <div id="game-ready"></div><div id="wordCreateFields"><div id="game-word-controls"></div><textarea id="gameWords" name="gameWords">Faith\nGrace</textarea></div><button type="submit" id="createGameBtn">Create game</button>
 </form><script type="application/json" id="matchTopicsData">[]</script><script type="application/json" id="storyTopicsData">[{"label":"Hope","refs":"Psalm 23","words":["Hope"]}]</script>`,{url:'https://example.test/games/create',runScripts:'outside-only'});
}
const load=w=>w.eval(pageBundle('games'));
const click=(d,text)=>[...d.querySelectorAll('button')].find(b=>b.textContent===text).click();
test('review is explicit and revoked after edits, topic changes, and word removals',async()=>{
 const dom=setup(),w=dom.window,d=w.document;
 try{
  load(w);await settle();assert.equal(d.getElementById('createGameBtn').disabled,true);
  d.getElementById('confirmWords').click();await settle();assert.equal(d.getElementById('createGameBtn').disabled,false);
  const version=d.getElementById('version');version.value='kjv';version.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();
  assert.equal(d.getElementById('confirmWords').checked,false);assert.equal(d.getElementById('createGameBtn').disabled,true);
  d.getElementById('confirmWords').click();await settle();click(d,'Hope');await settle();assert.equal(d.getElementById('confirmWords').checked,false);
  assert.equal(d.getElementById('references').value,'Psalm 23');
  d.getElementById('confirmWords').click();await settle();d.querySelector('[aria-label="Remove Hope"]').click();await settle();assert.equal(d.getElementById('createGameBtn').disabled,true);
 }finally{w.close();}
});
test('late suggestions cannot overwrite edited words, and untrusted words render as text',async()=>{
 const dom=setup(),w=dom.window,d=w.document;let resolve,payload;
 w.fetch=(url,options)=>{payload=JSON.parse(options.body);assert.equal(options.headers['X-CSRF-Token'],'csrf');return new Promise(done=>{resolve=done;});};
 try{
  load(w);await settle();click(d,'Build word list');await settle();assert.equal(payload.refs,'John 3:16');
  const area=d.getElementById('gameWords');area.value='<img src=x onerror=alert(1)>';area.dispatchEvent(new w.Event('input',{bubbles:true}));await settle();
  resolve(new Response(JSON.stringify({words:['OLD']}),{headers:{'Content-Type':'application/json'}}));await settle();
  assert.equal(area.value,'<img src=x onerror=alert(1)>');assert.equal(d.querySelector('#game-word-controls img'),null);
  assert.match(d.querySelector('.word-chip-list').textContent,/<img/);
  assert.equal(d.getElementById('confirmWords').checked,false);
 }finally{w.close();}
});
test('successful suggestions still require review; direct submit cannot bypass it',async()=>{
 const dom=setup(),w=dom.window,d=w.document;
 w.fetch=async()=>new Response(JSON.stringify({words:['Mercy','Peace']}),{headers:{'Content-Type':'application/json'}});
 try{
  load(w);await settle();click(d,'Build word list');await settle();
  assert.equal(d.getElementById('gameWords').value,'Mercy\nPeace');assert.equal(d.getElementById('confirmWords').checked,false);
  const event=new w.Event('submit',{cancelable:true,bubbles:true});d.querySelector('form').dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  d.getElementById('confirmWords').click();await settle();
  const accepted=new w.Event('submit',{cancelable:true,bubbles:true});d.querySelector('form').dispatchEvent(accepted);assert.equal(accepted.defaultPrevented,true);await settle();assert.match(d.getElementById('game-ready').textContent,/No game was returned/);
 }finally{w.close();}
});
test('matching-game download errors stay visible and retry exposes shared ready controls',async()=>{
 const dom=setup(),w=dom.window,d=w.document;let release,calls=0;
 d.getElementById('gameType').value='match';w.HTMLAnchorElement.prototype.click=()=>{};
 w.URL.createObjectURL=()=> 'blob:test-game';w.URL.revokeObjectURL=()=>{};
 w.fetch=()=>{calls++;return new Promise(resolve=>release=resolve);};
 try{
  load(w);await settle();const submit=()=>d.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
  submit();submit();await settle();assert.equal(calls,1);assert.equal(d.getElementById('createGameBtn').disabled,true);
  release(new Response('Sign in again',{status:403,headers:{'Content-Type':'text/plain'}}));await settle();assert.match(d.getElementById('game-ready').textContent,/Sign in again/);assert.equal(d.getElementById('createGameBtn').disabled,false);
  submit();release(new Response('%PDF-test',{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="game.pdf"'}}));await settle();
  assert.match(d.getElementById('game-ready').textContent,/Your file is ready/);assert.equal(d.querySelector('a[download]').download,'game.pdf');assert.equal(d.querySelector('a[href="/prints"]'),null);
 }finally{w.close();}
});
