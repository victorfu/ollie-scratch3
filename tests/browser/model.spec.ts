import {test,expect} from '@playwright/test';
test('real ml5 model downloads and predicts fake video; no synthetic predictions',async({page})=>{
 const failures:string[]=[];page.on('requestfailed',r=>failures.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});const editor=page.frameLocator('iframe');
 await editor.getByRole('button',{name:'開啟相機',exact:true}).click();
 await expect(page.locator('footer')).toContainText('單手辨識中',{timeout:80000});
 await page.waitForTimeout(2000);
 await expect(page.locator('footer')).toContainText('單手辨識中');
 await editor.getByRole('button',{name:'停止相機'}).click();await expect(page.locator('footer')).toContainText('已停止');
 expect(failures).toEqual([]);
});
