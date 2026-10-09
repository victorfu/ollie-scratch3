import {test,expect} from '@playwright/test';
// Playwright disables BFCache by default; test the browser feature itself.
test.use({launchOptions:{ignoreDefaultArgs:['--disable-back-forward-cache']}});
test('production Back restores the same editor and it can still import and export',async({page})=>{
 test.skip(!process.env.TEST_BFCACHE,'Run against production with TEST_BFCACHE=1');
 page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{(window as any).pageShows=[];window.addEventListener('pageshow',e=>(window as any).pageShows.push(e.persisted));});
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 const title=page.frameLocator('iframe').getByRole('textbox',{name:'在這輸入專案名稱'});await title.fill('BFCache 保留的修改');await title.press('Tab');
 await page.goto('/api/examples');await page.goBack({waitUntil:'commit'});
 await expect.poll(()=>page.evaluate(()=>(window as any).pageShows?.includes(true))).toBe(true);
 // Chrome restores the actual child document; CDP's cached Frame wrapper can be stale.
 const value=()=>page.locator('iframe').evaluate((frame:HTMLIFrameElement)=>(frame.contentDocument!.querySelector('input[placeholder="在這輸入專案名稱"]') as HTMLInputElement).value);
 expect(await value()).toBe('BFCache 保留的修改');
 await page.locator('iframe').evaluate((frame:HTMLIFrameElement)=>{Array.from(frame.contentDocument!.querySelectorAll('button')).find(b=>b.textContent==='範例')!.click();});
 await expect(page.getByRole('dialog',{name:'探索你的範例'})).toBeVisible();await page.getByRole('button',{name:/第01課/}).click();
 await expect(page.getByRole('dialog',{name:'保留目前的修改嗎？'})).toBeVisible();await page.getByRole('button',{name:'直接載入',exact:true}).click();await expect(page.locator('.gallery')).toHaveCount(0);
 await expect.poll(value).toMatch(/第01課/);
 const download=page.waitForEvent('download');await page.locator('iframe').evaluate((frame:HTMLIFrameElement)=>{Array.from(frame.contentDocument!.querySelectorAll('button')).find(b=>b.textContent==='下載作品')!.click();});expect((await download).suggestedFilename()).toMatch(/第01課.*\.sb3$/);
});
