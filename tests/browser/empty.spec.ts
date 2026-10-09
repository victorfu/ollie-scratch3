import {test,expect} from '@playwright/test';
test('unconfigured server displays a useful empty gallery',async({page})=>{
 test.skip(!process.env.TEST_EMPTY_URL,'Set TEST_EMPTY_URL to a server started with SCRATCH_EXAMPLES_DIR empty.');
 await page.goto(process.env.TEST_EMPTY_URL!);await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 await page.frameLocator('iframe').getByRole('button',{name:'範例',exact:true}).click();
 await expect(page.getByRole('heading',{name:/尚未設定範例資料夾/})).toBeVisible();
 await expect(page.locator('.example-card')).toHaveCount(0);await page.screenshot({path:'output/playwright/empty.png'});
});
