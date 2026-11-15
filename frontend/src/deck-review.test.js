import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pageBundle } from './test-bundle.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
test('review navigation visits crowded slides, filters safely, and preserves checklist fields',async()=>{
 const dom=new JSDOM('<div id="deck-review-controls"></div><div class="wdr-grid"><div class="wdr-slide">A</div><div class="wdr-slide is-crowded">B</div><div class="wdr-slide">C</div><div class="wdr-slide is-crowded">D</div></div><form><input name="review_fingerprint" value="server-review"><button type="submit">Build</button></form>',{url:'https://example.test/review',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.HTMLElement.prototype.scrollIntoView=()=>{};
 const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text);
 try{w.eval(pageBundle('deck-review'));await settle();const slides=[...d.querySelectorAll('.wdr-slide')];
 button('Next crowded slide').click();await settle();assert.equal(d.activeElement,slides[1]);
 slides[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await settle();assert.equal(d.activeElement,slides[2]);
 d.querySelector('#deck-review-controls input').click();await settle();assert.deepEqual(slides.filter(s=>!s.hidden).map(s=>s.textContent),['B','D']);
 button('Next crowded slide').click();await settle();assert.equal(d.activeElement,slides[3]);
 button('Next crowded slide').click();await settle();assert.equal(d.activeElement,slides[1]);
 assert.equal(d.querySelector('[name=review_fingerprint]').value,'server-review');
 assert.equal(d.querySelector('form button').disabled,false);
 }finally{w.close();}
});
test('empty crowded filter has a clear state and no invalid navigation',async()=>{
 const dom=new JSDOM('<div id="deck-review-controls"></div><div class="wdr-slide">A</div>',{url:'https://example.test',runScripts:'outside-only'});const w=dom.window,d=w.document;
 try{w.eval(pageBundle('deck-review'));await settle();d.querySelector('input').click();await settle();assert.match(d.querySelector('[role=status]').textContent,/No crowded slides/);assert.equal(d.querySelector('.wdr-slide').hidden,true);}finally{w.close();}
});
