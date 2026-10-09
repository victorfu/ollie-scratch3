import {test,expect} from '@playwright/test';

test('iframe finishing before parent hydration still connects after refresh',async({page})=>{
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 let release!:()=>void;const hydration=new Promise<void>(resolve=>release=resolve);
 await page.route('**/_next/static/**',async route=>{
  if(route.request().resourceType()==='script')await hydration;
  await route.continue();
 });
 try{
  await page.reload({waitUntil:'commit'});
  await expect.poll(()=>page.frames().some(f=>f.url().includes('/scratch-editor/index.html'))).toBe(true);
  const scratch=page.frames().find(f=>f.url().includes('/scratch-editor/index.html'))!;
  await scratch.waitForFunction(()=>document.readyState==='complete',{},{timeout:60000});
  await expect(scratch.locator('.blocklySvg').first()).toBeVisible();
  release();
  await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:10000});
  await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'探索你的範例'})).toBeVisible();
 }finally{release();}
});

test('repeated page and iframe refresh reconnects once and loads a real project',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 for(let i=0;i<3;i++){
  await page.reload();await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:30000});
  await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'探索你的範例'})).toHaveCount(1);await page.getByRole('button',{name:'關閉範例'}).click();
 }
 await page.locator('iframe').evaluate((el:HTMLIFrameElement)=>el.contentWindow!.location.reload());
 await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:30000});
 await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();
 await page.getByRole('button',{name:/第01課/}).click();await expect(page.locator('.gallery')).toHaveCount(0);
 await expect(page.frameLocator('iframe').getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue(/第01課/);
 expect(errors).toEqual([]);
});

test('handshake retries lost replies and stops probing after ready',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  (window as any).readyReplies=0;(window as any).allowReady=false;
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin || e.data?.channel!=='ollie-scratch' || e.data.type!=='ready')return;
   (window as any).readyReplies++;
   if(!(window as any).allowReady)e.stopImmediatePropagation();
  },true);
 });
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>(window as any).readyReplies)).toBeGreaterThanOrEqual(2);
 await expect(page.locator('.editor-status')).toBeVisible();
 await page.evaluate(()=>(window as any).allowReady=true);
 await expect(page.locator('.editor-status')).toHaveCount(0);
 const replies=await page.evaluate(()=>(window as any).readyReplies);
 await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>(window as any).readyReplies)).toBe(replies);
 await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'探索你的範例'})).toBeVisible();
});
