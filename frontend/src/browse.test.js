import test from 'node:test';
import assert from 'node:assert/strict';
import { pageBundle } from './test-bundle.js';
import { JSDOM } from 'jsdom';

test('production bundle filters server cards, restores featured order, and resets empty results', async () => {
  const dom = new JSDOM(`<div id="bundle-controls"></div><div id="bundle-grid">
    <article class="bundle-card" data-title="Wisdom" data-count="2" data-search="wisdom verses"></article>
    <article class="bundle-card" data-title="Prayer" data-count="9" data-search="prayer verses" data-free="true"></article>
  </div>`, {url: 'https://example.test/browse?q=prayer&utm_source=test', runScripts: 'outside-only', pretendToBeVisual: true});
  const { window } = dom;
  const settle = () => new Promise(resolve => setTimeout(resolve, 60));
  try {
    window.eval(pageBundle('browse'));
    await settle();
    const cards = () => [...window.document.querySelectorAll('.bundle-card')];
    assert.equal(cards().filter(card => !card.hidden).length, 1);
    assert.equal(cards().find(card => !card.hidden).dataset.title, 'Prayer');
    const select = window.document.getElementById('bundle-sort');
    select.value = 'count'; select.dispatchEvent(new window.Event('change', {bubbles: true}));
    await settle();
    window.document.querySelector('.library-results button').click();
    await settle();
    assert.deepEqual(cards().map(card => card.dataset.title), ['Wisdom', 'Prayer']);
    assert.equal(window.location.search, '?utm_source=test');
    window.history.pushState(null, '', '?q=missing');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(cards().every(card => card.hidden), true);
    assert.match(window.document.querySelector('.bundle-empty').textContent, /No bundles found/);
    window.document.querySelector('.bundle-empty button').click();
    await settle();
    assert.equal(cards().every(card => !card.hidden), true);
    assert.equal(window.document.activeElement.id, 'bundle-search');
  } finally { window.close(); }
});
