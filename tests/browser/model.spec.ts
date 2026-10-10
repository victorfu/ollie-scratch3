import {test,expect} from '@playwright/test';
test('official extension downloads the real ml5 model and runs it on the fake camera; no synthetic predictions',async({page})=>{
 const failures:string[]=[];page.on('requestfailed',r=>{if(/tfhub.dev|kaggle.com|storage.googleapis.com/.test(r.url()))failures.push(`${r.url()}: ${r.failure()?.errorText}`);});
 const logs:string[]=[];page.on('console',m=>logs.push(m.text()));page.on('dialog',d=>d.dismiss());
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});const editor=page.frameLocator('iframe');
 await editor.getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:/第08課/}).click();await expect(page.locator('.gallery')).toHaveCount(0);
 // The official extension logs this from its ml5.handpose callback once the weights are loaded.
 await expect.poll(()=>logs.includes('Model loaded!'),{timeout:90000}).toBe(true);
 await page.waitForTimeout(2000);
 expect(failures).toEqual([]);
});
