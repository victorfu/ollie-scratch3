import {test,expect} from '@playwright/test';
test('all local examples keep native geometry across window sizes',async({page,request})=>{
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 const frame=page.frameLocator('iframe');const catalog=await (await request.get('/api/examples')).json();expect(catalog.examples.length).toBe(28);
 for(const example of catalog.examples){
  await page.setViewportSize({width:1440,height:900});
  await frame.getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:new RegExp(example.title)}).click();await expect(page.locator('.gallery')).toHaveCount(0);
  for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[1024,640],[900,640],[1280,600]]){
   await page.setViewportSize({width,height});
   await expect.poll(()=>frame.locator('body').evaluate(()=>innerWidth)).toBe(Math.max(width,1024));
   const stage=frame.locator('[class*="stage_stage_"] canvas');
   await expect.poll(()=>stage.evaluate(el=>el.getBoundingClientRect().width)).toBe(Math.max(width,1024)>=1096?480:408);
   const geometry=await stage.evaluate(el=>{const r=el.getBoundingClientRect();return {right:r.right,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};});
   expect(geometry.width/geometry.height).toBe(4/3);expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);expect(geometry.viewportHeight).toBeGreaterThanOrEqual(640);
   const outer=await page.locator('.editor-viewport').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflow}));
   expect(outer.overflow).toBe('auto');expect(outer.scrollWidth).toBeGreaterThanOrEqual(1024);expect(outer.scrollHeight).toBeGreaterThanOrEqual(640);
  }
 }
});
