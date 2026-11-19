import {test,expect} from '@playwright/test';
test('shared settings save preferences and theme without horizontal overflow',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/settings.html');await page.getByLabel('Usual setting').selectOption('house-church');await page.getByLabel('Writer level').selectOption('beginner');await page.getByLabel('Use cursive tracing').check();
 await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByRole('status')).toContainText('Preferences saved');
 await page.reload();await expect(page.getByLabel('Writer level')).toHaveValue('beginner');await expect(page.getByLabel('Use cursive tracing')).toBeChecked();
 await page.getByRole('button',{name:'Toggle dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('shared account menus close with Escape on each screen size',async({page},info)=>{
 await page.goto('/account.html');
 if(info.project.name==='phone')await page.getByRole('button',{name:'Toggle menu'}).click();
 const summary=page.locator('.profile-summary:visible');await summary.click();await expect(page.getByRole('link',{name:'Settings & preferences'}).filter({visible:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.profile-drop[open]')).toHaveCount(0);
});
test('explicit passage keeps other saved preferences and sign-in keeps edited choices',async({page},info)=>{
 await page.addInitScript(()=>{localStorage.setItem('lessonPackAge','10+');localStorage.setItem('preferredVersion','web');});
 await page.goto('/gathering.html');await expect(page.locator('[name=age_bracket]')).toHaveValue('10+');await expect(page.locator('[name=lesson_mode]')).toHaveValue('family');
 await page.locator('[name=verse]').fill('John 3:16');
 if(info.project.name==='phone')await page.getByRole('button',{name:'Toggle menu'}).click();
 const signin=page.getByRole('link',{name:'Sign in',exact:true}).filter({visible:true}).first();
 await signin.evaluate(el=>el.addEventListener('click',event=>event.preventDefault()));await signin.click();
 const target=new URL(await signin.getAttribute('href'),'http://localhost');const next=new URL(target.searchParams.get('next'),'http://localhost');expect(next.searchParams.get('verse')).toBe('John 3:16');expect(next.searchParams.get('age')).toBe('10+');expect(next.searchParams.get('mode')).toBe('family');
});
test('learning hub only resumes a known subject and links all four subjects',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('faithsparks.learning.lastSubject','math'));
 await page.goto('/learning.html');await expect(page.getByRole('link',{name:'Return to Math Fact Adventure'})).toHaveAttribute('href','/labs/learningadventure/math');
 for(const subject of ['Grammar','Math','Latin','Geography'])await expect(page.getByRole('link',{name:'Open '+subject,exact:true})).toBeVisible();
});
test('settings and theme remain usable when browser storage is blocked',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('Storage blocked');}});});
 await page.goto('/settings.html');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByRole('status')).toContainText('Browser storage is unavailable');
 await page.getByRole('button',{name:'Toggle dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByRole('button',{name:'Toggle light mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(errors).toEqual([]);
});
