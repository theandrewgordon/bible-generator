import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function setup({fromUrl = true, blockedStorage = false} = {}) {
  const dom = new JSDOM(`<form id="lesson-pack-form" method="post">
    <input type="hidden" name="csrf_token" value="server-token">
    <div id="gathering-step-nav"></div><div id="gathering-step-heading"></div>
    <div data-builder-step="0">
      <select name="lesson_mode"><option value="house-church">Church</option><option value="family">Family</option></select>
      <label data-session-field><select name="session_minutes"><option value="40">40</option></select></label>
      <span id="lesson-pack-mode-note"></span><input name="verse" value="John 3:16" required>
    </div>
    <div data-builder-step="1">
      <select name="version"><option value="web">WEB</option><option value="kjv" disabled>KJV</option></select>
      <select name="age_bracket"><option value="6-8">Ages 6–8</option><option value="10+">Ages 10+</option></select>
      <span id="lesson-pack-age-note"></span>
      <input name="use_cursive" type="checkbox"><input name="include_coloring" type="checkbox">
    </div>
    <div id="gathering-controls"></div><div data-fallback-actions><button type="submit">Fallback build</button></div>
  </form><script id="gathering-config" type="application/json">${JSON.stringify({fromUrl, signedIn: false, modes: {'house-church': {label: 'House church gathering', description: 'Gather together'}, family: {label: 'Family discipleship week', description: 'Five-day rhythm'}}})}</script>`, {url: 'https://example.test/lesson-pack', runScripts: 'outside-only', pretendToBeVisual: true});
  if (blockedStorage) Object.defineProperty(dom.window, 'localStorage', {get() {throw new Error('Blocked');}});
  return dom;
}
const bundle = () => readFileSync(new URL('../../static/dist/gathering/gathering.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
const click = (doc, label) => {
  const button = [...doc.querySelectorAll('button')].find(button => button.textContent === label);
  assert.ok(button, `Missing button: ${label}`); button.click();
};

test('builder validates, reviews, posts original fields and CSRF, and recovers after back navigation', async () => {
  const dom = setup(); const w = dom.window, d = w.document;
  try {
    w.eval(bundle()); await settle();
    const form = d.querySelector('form'), verse = form.elements.namedItem('verse');
    assert.equal(d.querySelector('[data-builder-step="1"]').hidden, true);
    verse.value = ' '; verse.dispatchEvent(new w.Event('input', {bubbles: true})); await settle();
    click(d, 'Continue to printables'); await settle();
    assert.equal(d.querySelector('[aria-current="step"]').textContent, '1Passage');
    verse.value = 'Psalm 23:1–4'; verse.dispatchEvent(new w.Event('input', {bubbles: true})); await settle();
    const mode = form.elements.namedItem('lesson_mode'); mode.value = 'family'; mode.dispatchEvent(new w.Event('change', {bubbles: true})); await settle();
    assert.equal(d.querySelector('[data-session-field]').hidden, true);
    click(d, 'Continue to printables'); await settle();
    const coloring = form.elements.namedItem('include_coloring'); coloring.click(); await settle();
    click(d, 'Continue to review'); await settle();
    assert.match(d.querySelector('.gathering-review').textContent, /Psalm 23:1–4/);
    assert.match(d.querySelector('.gathering-review').textContent, /Five-day family guide/);
    assert.match(d.querySelector('.gathering-review').textContent, /Included · takes longer/);
    const payload = new w.FormData(form);
    assert.equal(payload.get('csrf_token'), 'server-token');
    assert.equal(payload.get('verse'), 'Psalm 23:1–4');
    assert.equal(payload.get('lesson_mode'), 'family');
    assert.equal(payload.get('include_coloring'), 'on');
    // Cancel navigation after the enhancement observes the native submit.
    let submits = 0;
    form.addEventListener('submit', event => {if (!event.defaultPrevented) submits++; event.preventDefault();});
    click(d, 'Sign in to build'); await settle();
    assert.equal(submits, 1); assert.match(d.querySelector('[role="status"]').textContent, /Saving your choices/);
    assert.equal(d.querySelector('.gathering-actions button[type="submit"]').disabled, true);
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', {persisted: true})); await settle();
    assert.equal(d.querySelector('.gathering-actions button[type="submit"]').disabled, false);
    click(d, 'Back'); await settle();
    assert.equal(coloring.checked, true);
  } finally {w.close();}
});

test('blocked storage works and disabled saved versions cannot override valid defaults', async () => {
  for (const blockedStorage of [true, false]) {
    const dom = setup({fromUrl: false, blockedStorage}); const w = dom.window;
    try {
      if (!blockedStorage) {w.localStorage.setItem('preferredVersion', 'kjv'); w.localStorage.setItem('lessonPackAge', '10+');}
      w.eval(bundle()); await settle();
      assert.equal(w.document.querySelector('[name="version"]').value, 'web');
      assert.equal(w.document.querySelector('[name="age_bracket"]').value, blockedStorage ? '6-8' : '10+');
      assert.ok(w.document.querySelector('[aria-current="step"]'));
    } finally {w.close();}
  }
});

test('explicit URL choices take precedence over saved preferences', async () => {
  const dom = setup(); const w = dom.window;
  try {
    w.localStorage.setItem('lessonPackAge', '10+');
    w.eval(bundle()); await settle();
    assert.equal(w.document.querySelector('[name="age_bracket"]').value, '6-8');
  } finally {w.close();}
});
