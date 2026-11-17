/* Map selection, envelope help, field lens and actual scoring in the expedition UI. */
const assert = require('node:assert/strict');
const {chromium, webkit} = require('../frontend/learning-labs/node_modules/playwright');
const data = require('../frontend/learning-labs/geo/data.json');
const base = process.env.LABS_BASE_URL || 'http://127.0.0.1:5175';
(async () => {
  const browser = await (process.env.LABS_WEBKIT ? webkit : chromium).launch({headless:true, ...(process.env.LABS_BROWSER_PATH ? {executablePath:process.env.LABS_BROWSER_PATH} : {})});
  try {
    for (const width of [1360, 820, 390]) {
      const context = await browser.newContext({viewport:{width, height:1000}, reducedMotion:'reduce'});
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(60000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('faithsparks.geo.v2')));
      const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.goto(base + '/labs/geo-detectives');
      for (const topic of [...new Set(data.quest.map(q => q.topic))]) {
        const pin = page.getByRole('button', {name:topic, exact:true});
        await pin.click();
        assert.equal(await pin.getAttribute('aria-pressed'), 'true');
        assert.equal((await saved()).topic, topic);
        assert.equal(await page.locator('.mission-location').textContent(), topic);
        assert.notEqual(await page.locator('.mission-picture .landscape').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
        await fits();
      }
      await page.getByRole('button', {name:'Explore everywhere', exact:false}).click();
      await page.screenshot({path:'/tmp/geo-expedition-home-' + width + '.png', fullPage:true});
      await page.getByRole('button', {name:'Land & ice', exact:true}).click();
      await page.getByRole('button', {name:'Start fresh · 5 questions', exact:false}).click();
      assert((await saved()).session.ids.every(id => data.quest.find(q => q.id === id)?.topic === 'Land & ice'));
      assert.equal(await page.locator('.sealed-clue').count(), 2);
      await page.getByRole('button', {name:'Uncover clue 2', exact:true}).click();
      assert.equal((await saved()).clue, 2);
      assert.equal(await page.locator('.opened-clue').count(), 2);
      assert.equal(await page.locator('.sealed-clue').count(), 1);
      await page.getByRole('button', {name:'Inspect landscape', exact:true}).click();
      assert.equal(await page.locator('.landscape-lens').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.landscape-lens').isVisible(), false);
      assert.equal(await page.getByRole('button', {name:'Inspect landscape', exact:true}).evaluate(e => e === document.activeElement), true);
      await page.getByRole('button', {name:'Help me uncover a clue', exact:false}).click();
      assert.equal((await saved()).clue, 3);
      assert.equal(await page.locator('.sealed-clue').count(), 0);
      await page.reload();
      await page.locator('.opened-clue').nth(2).waitFor();
      const s = await saved();
      const q = data.quest.find(q => q.id === s.session.ids[s.index]);
      await page.screenshot({path:'/tmp/geo-expedition-play-' + width + '.png', fullPage:true});
      await page.locator('.answer-choices button').filter({hasText:q.answer}).first().click();
      assert.equal((await saved()).answers[q.id].points, 1);
      assert.match(await page.locator('.guide-speech').textContent(), /brilliant discovery/i);
      assert.equal(await page.locator('.discovery-stamp').isVisible(), true);
      await page.getByRole('button', {name:'Next discovery', exact:false}).click();
      assert.equal(await page.getByRole('button', {name:'Discovery 2', exact:true}).getAttribute('aria-current'), 'step');
      await page.getByRole('button', {name:'Discovery 1', exact:true}).click();
      assert.equal((await saved()).clue, 3);
      await page.getByRole('button', {name:'Undo last answer', exact:false}).click();
      assert.equal((await saved()).answers[q.id], undefined);
      assert.equal((await saved()).clue, 3);
      await fits();
      await page.getByRole('button', {name:'Pause practice', exact:true}).click();
      await page.getByRole('button', {name:'Two teams', exact:false}).click();
      await page.getByRole('button', {name:'Start fresh · 5 questions', exact:false}).click();
      const teamState = await saved();
      const teamQuestion = data.quest.find(q => q.id === teamState.session.ids[0]);
      await page.locator('.answer-choices button').filter({hasText:teamQuestion.answer}).first().click();
      assert.deepEqual((await saved()).scores, [3, 0]);
      await page.getByRole('button', {name:'Next discovery', exact:false}).click();
      assert.equal((await saved()).team, 1);
      await page.getByRole('button', {name:'Pause practice', exact:true}).click();
      await page.getByRole('button', {name:'Compare', exact:false}).click();
      await page.getByRole('button', {name:'Start fresh · 5 questions', exact:false}).click();
      await page.getByRole('button', {name:'We’ve explained it', exact:false}).click();
      await page.getByRole('button', {name:'Good explanation +2', exact:true}).click();
      assert.deepEqual((await saved()).scores, [2, 0]);
      await page.getByRole('button', {name:'Pause practice', exact:true}).click();
      await page.getByRole('button', {name:'Maps & our planet', exact:true}).click();
      await page.getByRole('button', {name:'Start fresh · 5 questions', exact:false}).click();
      const mapTerms = new Set(data.quest.filter(q => q.topic === 'Maps & our planet').map(q => q.answer.toLowerCase()));
      assert((await saved()).session.ids.every(id => data.compare.find(q => q.id === id)?.terms.some(term => mapTerms.has(term.toLowerCase()))));
      await fits();
      assert.deepEqual(errors, []);
      console.log('Interactive map, sealed clues, lens keyboard/focus, saved help, rewards, trail, undo, teams and comparisons passed at', width);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
