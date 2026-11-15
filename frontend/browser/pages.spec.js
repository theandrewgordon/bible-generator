import {test,expect} from '@playwright/test';

let errors;
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',error=>errors.push(error.message));});
test.afterEach(()=>{expect(errors).toEqual([]);});

test('real page entries resolve the same shared React module',async({page})=>{
 await page.route('**/__api/worship_preview_slides',route=>route.fulfill({json:{slides:[]}}));
 await page.goto('/games.html');await expect(page.getByLabel('I reviewed the word list.')).toBeVisible();
 const first=await page.evaluate(()=>performance.getEntriesByType('resource').find(item=>item.name.includes('/shared/react-runtime-'))?.name);
 await page.goto('/song.html');await expect(page.getByRole('textbox',{name:'Part name',exact:true}).first()).toBeVisible();
 const second=await page.evaluate(()=>performance.getEntriesByType('resource').find(item=>item.name.includes('/shared/react-runtime-'))?.name);
 expect(first).toContain('/shared/react-runtime-');expect(second).toBe(first);
});

test('filtering cannot include hidden worksheets in bulk deletion',async({page})=>{
 await page.goto('/history.html');await page.getByRole('button',{name:'Show full history',exact:true}).click();await page.getByRole('button',{name:'Show filters',exact:true}).click();
 await page.getByLabel('Select visible',{exact:true}).check();await page.locator('#searchInput').fill('John');
 await expect(page.locator('#resultCount')).toHaveText('1 shown');await page.getByRole('button',{name:'Delete selected',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Delete 1 worksheet?',exact:true})).toBeVisible();
 await page.evaluate(()=>{document.getElementById('bulkDeleteForm').addEventListener('submit',event=>{window.bulkPayload={allowed:!event.defaultPrevented,files:new FormData(event.target).getAll('selected_files')};event.preventDefault();});});
 await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();
 expect(await page.evaluate(()=>window.bulkPayload)).toEqual({allowed:true,files:['file0.pdf']});
});

test('Worship saves preserve edits made while a request is pending',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('faithsparks:worship-quick-tour:v1','1'));
 let release;let requests=0;
 await page.route('**/worship/setlist/save',async route=>{requests++;await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{ok:true,id:'saved',name:'Sunday',date:'2026-01-01',updated_at:'v2',songs:['song1'],notes:{}}});});
 await page.goto('/worship.html');await page.getByRole('button',{name:'Add Grace',exact:true}).click();await page.getByText('Save, share & export',{exact:true}).click();
 await page.locator('.set-note').fill('Original');await page.locator('#save-setlist-btn').click();await page.locator('#save-set-name').fill('Sunday');await page.locator('#save-set-confirm').click();
 await expect.poll(()=>requests).toBe(1);await page.locator('.set-note').fill('New edit');release();
 await expect(page.getByText('Earlier changes saved. Your newer edits are still unsaved.',{exact:true})).toBeVisible();await expect(page.locator('.set-note')).toHaveValue('New edit');
 await expect(page.locator('#save-setlist-btn')).toBeEnabled();expect(requests).toBe(1);
});

test('upload preflight and cached-page recovery retain native choices',async({page})=>{
 await page.goto('/upload.html');await page.locator('#presentation-file').setInputFiles({name:'unsupported.pptx',mimeType:'application/octet-stream',buffer:Buffer.from('test')});
 await expect(page.getByRole('alert')).toContainText('Export this deck as a PDF');
 await page.locator('#presentation-file').setInputFiles({name:'Sunday.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7')});await page.locator('#sermon-notes').fill('Preserve these notes.');
 await page.evaluate(()=>document.querySelector('form').addEventListener('submit',event=>event.preventDefault()));
 await page.getByRole('button',{name:'Import and review',exact:true}).click();await expect(page.locator('#presentation-import-submit')).toBeDisabled();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await expect(page.locator('#presentation-import-submit')).toBeEnabled();await expect(page.locator('#sermon-notes')).toHaveValue('Preserve these notes.');
 await page.goto('/games.html');await page.goBack();await expect(page.locator('#presentation-import-submit')).toBeEnabled();
});

test('clearing lyrics prevents delayed previews from reappearing',async({page})=>{
 let release;let calls=0;
 await page.route('**/__api/worship_preview_slides',async route=>{calls++;await new Promise(resolve=>{if(calls===1)release=resolve;else resolve();});try{await route.fulfill({json:{slides:[{lines:['Old preview']}]}});}catch{}});
 await page.goto('/song.html');await expect.poll(()=>calls).toBeGreaterThan(0);await page.locator('[name=part_lines]').first().fill('');release();
 await expect(page.locator('.wa-part-row').first().locator('.wa-slide-thumb')).toHaveCount(0);await expect(page.locator('[name=part_lines]').first()).toHaveValue('');
});

test('live follow handles reconnects, stale revisions, hidden words, and session end',async({page})=>{
 let count=0;
 await page.route('**/worship/live/state/fixture',route=>{
  count++;
  if(count===1)return route.fulfill({status:503,json:{ok:false}});
  if(count===2)return route.fulfill({json:{ok:true,revision:5,deck_revision:1,current_index:1,blank:false,clear_words:true}});
  if(count===3)return route.fulfill({json:{ok:true,revision:2,deck_revision:1,current_index:0,blank:false,clear_words:false}});
  return route.fulfill({status:410,json:{ok:false}});
 });
 await page.goto('/follow.html');await expect(page.locator('#wf-status')).toHaveText('Reconnecting…');
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.locator('#wf-status')).toHaveText('Following');await expect(page.locator('body')).toHaveClass(/is-hidden-words/);await expect(page.locator('#wf-main')).toContainText('Second lyric');
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect.poll(()=>count).toBeGreaterThanOrEqual(3);await expect(page.locator('body')).toHaveClass(/is-hidden-words/);await expect(page.locator('#wf-main')).toContainText('Second lyric');
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.locator('#wf-status')).toHaveText('Ended');await expect(page.locator('#wf-main')).toContainText('service has ended');
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));expect(count).toBe(4);
});

test('pending follow requests do not overlap on tab resume',async({page})=>{
 let release;let calls=0;let active=0;let maximum=0;
 await page.route('**/worship/live/state/fixture',async route=>{
  calls++;active++;maximum=Math.max(maximum,active);
  if(calls===1)await new Promise(resolve=>{release=resolve;});
  active--;await route.fulfill({json:{ok:true,revision:calls+1,deck_revision:1,current_index:0,blank:false,clear_words:false}});
 });
 await page.goto('/follow.html');await expect.poll(()=>calls).toBe(1);
 await page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('pageshow'));});expect(calls).toBe(1);release();await expect.poll(()=>calls).toBe(2);expect(maximum).toBe(1);
});

test('a canceled pending screen-on request releases its eventual wake lock',async({page})=>{
 await page.addInitScript(()=>{
  window.wakeMock={requests:0,releases:0};
  Object.defineProperty(navigator,'wakeLock',{value:{request:()=>{window.wakeMock.requests++;return new Promise(resolve=>{window.resolveWake=()=>resolve({release:async()=>{window.wakeMock.releases++;},addEventListener:()=>{}});});}}});
 });
 await page.route('**/worship/live/state/fixture',route=>route.fulfill({json:{ok:true,revision:1,deck_revision:1,current_index:0,blank:false,clear_words:false}}));
 await page.goto('/follow.html');await page.getByRole('button',{name:'Keep screen on',exact:true}).click();await expect(page.locator('#wf-awake')).toHaveAttribute('aria-pressed','true');
 await page.locator('#wf-awake').click();await page.evaluate(()=>window.resolveWake());
 await expect.poll(()=>page.evaluate(()=>window.wakeMock.releases)).toBe(1);await expect(page.locator('#wf-awake')).toHaveAttribute('aria-pressed','false');
});
