import {test,expect,Page} from '@playwright/test';

async function open(page:Page,url:string){
 // Handpose lessons load the official extension, which downloads its model and shows an alert.
 await page.route(/tfhub.dev|kaggle.com|storage.googleapis.com/,r=>r.abort());page.on('dialog',d=>d.dismiss());
 await page.goto(url);await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
}
const title=(page:Page)=>page.frameLocator('iframe').getByRole('textbox',{name:'在這輸入專案名稱'});

test('?lesson= opens that lesson, choosing another updates it, an imported file clears it',async({page})=>{
 await open(page,'/?lesson=5');
 await expect(title(page)).toHaveValue(/^第05課/);await expect(page).toHaveURL(/\?lesson=5$/);
 // Picking a lesson from the gallery rewrites the parameter without adding a history entry.
 const entries=await page.evaluate(()=>history.length);
 await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:/第28課/}).click();
 await expect(title(page)).toHaveValue(/^第28課/);await expect(page).toHaveURL(/\?lesson=28$/);
 expect(await page.evaluate(()=>history.length)).toBe(entries);
 // A file of the student's own is not a lesson: the parameter goes away.
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/minimal.sb3');
 await expect(title(page)).toHaveValue('minimal');await expect(page).not.toHaveURL(/lesson=/);
 // Reloading with the parameter brings the lesson back.
 await page.goto('/?lesson=28');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 await expect(title(page)).toHaveValue(/^第28課/);
});

test('an unknown ?lesson= says so and keeps the empty editor',async({page})=>{
 await open(page,'/?lesson=99');
 await expect(page.getByRole('alert').filter({hasText:'找不到網址指定的課程：99'})).toBeVisible();
 await expect(page).toHaveURL(/\?lesson=99$/);
});
