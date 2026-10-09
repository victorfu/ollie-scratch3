import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
const ed=(p:Page)=>p.frameLocator('iframe');
async function ready(p:Page){await p.goto('/');await expect(p.locator('.editor-status')).toHaveCount(0,{timeout:90000});const f=p.frames().find(x=>x.url().includes('/scratch-editor/index.html'))!;await f.evaluate(()=>{const root=(document.getElementById('app') as any)._reactRootContainer._internalRoot.current;const find=(n:any):any=>n&&(n.memoizedProps?.store||find(n.child)||find(n.sibling));(window as any).reviewStore=find(root);(window as any).reviewVM=(window as any).reviewStore.getState().scratchGui.vm;});return f;}
async function select(p:Page,lesson:string){await ed(p).getByRole('button',{name:'範例',exact:true}).click();await p.getByRole('button',{name:new RegExp(lesson)}).click();}
async function loaded(p:Page,title:string){await expect(p.locator('.gallery')).toHaveCount(0);await expect(ed(p).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue(new RegExp(title));}
async function projectZip(){return JSZip.loadAsync(await readFile('tests/fixtures/minimal.sb3'));}

test('iframe reload during unsaved confirmation releases the operation lock',async({page})=>{
 page.on('dialog',d=>d.accept());await ready(page);const title=ed(page).getByRole('textbox',{name:'在這輸入專案名稱'});
 await title.fill('keep me');await title.press('Tab');await select(page,'第01課');await expect(page.getByRole('dialog',{name:'保留目前的修改嗎？'})).toBeVisible();
 await page.locator('iframe').evaluate((e:HTMLIFrameElement)=>e.contentWindow!.location.reload());
 await expect(page.getByRole('dialog',{name:'保留目前的修改嗎？'})).toHaveCount(0);await expect(page.locator('.editor-status')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/第02課/})).toBeEnabled();await page.getByRole('button',{name:/第02課/}).click();await loaded(page,'第02課');
 await select(page,'第01課');await loaded(page,'第01課');
});

test('a stale file read cannot release or overwrite a newer operation',async({page})=>{
 await ready(page);let firstRelease!:()=>void,secondRelease!:()=>void;const first=new Promise<void>(r=>firstRelease=r),second=new Promise<void>(r=>secondRelease=r);let count=0;
 await page.route('**/api/examples/*/project',async route=>{const n=++count;await(n===1?first:second);await route.continue().catch(()=>{});});
 try{
  await select(page,'第01課');await expect.poll(()=>count).toBe(1);
  await page.locator('iframe').evaluate((e:HTMLIFrameElement)=>e.contentWindow!.location.reload());await expect(page.locator('.editor-status')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/第02課/})).toBeEnabled();await page.getByRole('button',{name:/第02課/}).click();await expect.poll(()=>count).toBe(2);
  firstRelease();await page.waitForTimeout(150);await expect(page.getByRole('button',{name:/第03課/})).toBeDisabled();
  secondRelease();await loaded(page,'第02課');
 }finally{firstRelease();secondRelease();}
});

test('ambiguous ZIP cannot enable pen; a single subfolder SB3 loads; VM schema error stays readable',async({page})=>{
 const f=await ready(page),base=await projectZip(),project=JSON.parse(await base.file('project.json').async('string'));
 const bad=structuredClone(project);bad.extensions=['pen'];bad.targets[1].blocks={p:{opcode:'pen_clear',parent:null,next:null,inputs:{},fields:{},topLevel:true,shadow:false,x:20,y:20}};
 const zip=new JSZip();zip.file('x/project.json',JSON.stringify(bad));for(const [name,e]of Object.entries(base.files) as any)if(!e.dir)zip.file(name,await e.async('nodebuffer'));
 await page.locator('input[type=file]').setInputFiles({name:'ambiguous.sb3',mimeType:'application/octet-stream',buffer:await zip.generateAsync({type:'nodebuffer'})});
 await expect(page.getByRole('alert').filter({hasText:'多份 project.json'})).toBeVisible();expect(await f.evaluate(()=>(window as any).reviewVM.extensionManager.isExtensionLoaded('pen'))).toBe(false);
 const folder=new JSZip();for(const [name,e]of Object.entries(base.files) as any)if(!e.dir)folder.file('folder/'+name,await e.async('nodebuffer'));
 await page.locator('input[type=file]').setInputFiles({name:'folder.sb3',mimeType:'application/octet-stream',buffer:await folder.generateAsync({type:'nodebuffer'})});await loaded(page,'folder');
 delete project.targets[0].name;base.file('project.json',JSON.stringify(project));
 await page.locator('input[type=file]').setInputFiles({name:'schema.sb3',mimeType:'application/octet-stream',buffer:await base.generateAsync({type:'nodebuffer'})});
 const error=page.getByRole('alert').filter({hasText:'VM 載入'});await expect(error).toContainText('作品結構不合法');await expect(error).not.toContainText('undefined');
 await expect(ed(page).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue('folder');
});

test('API rejects untrusted Host even with a matching attacker Origin',async({request,baseURL})=>{
 const catalog=await(await request.get('/api/examples')).json();
 const headers={host:'attacker.invalid:3000',origin:'http://attacker.invalid:3000'};
 for(const url of ['/api/examples',`/api/examples/${catalog.examples[0].id}/project`])expect((await request.get(url,{headers})).status()).toBe(403);
 expect((await request.get('/api/examples',{headers:{origin:new URL(baseURL!).origin}})).ok()).toBe(true);
});

test('File load/save closes its menu and an empty title downloads a visible SB3 filename',async({page})=>{
 await ready(page);const title=ed(page).getByRole('textbox',{name:'在這輸入專案名稱'});await title.fill('');await title.press('Tab');
 await ed(page).getByText('檔案',{exact:true}).click();const wait=page.waitForEvent('download');await ed(page).getByText('下載到你的電腦',{exact:true}).click();expect((await wait).suggestedFilename()).toBe('Scratch作品.sb3');await expect(ed(page).getByText('下載到你的電腦',{exact:true})).toHaveCount(0);
 await ed(page).getByText('檔案',{exact:true}).click();const chooser=page.waitForEvent('filechooser');await ed(page).getByText('從你的電腦挑選',{exact:true}).click();await(await chooser).setFiles('tests/fixtures/minimal.sb3');await loaded(page,'minimal');await expect(ed(page).getByText('從你的電腦挑選',{exact:true})).toHaveCount(0);
});

test('successful replacement clears recovery and camera-error status',async({page})=>{
 const f=await ready(page);await f.evaluate(()=>{const vm=(window as any).reviewVM;(window as any).loadOriginal=vm.loadProject;vm.loadProject=()=>Promise.reject('failure');});
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/minimal.sb3');await expect(page.locator('.recovery')).toBeVisible();
 await f.evaluate(()=>{const vm=(window as any).reviewVM;vm.loadProject=(window as any).loadOriginal;const manager=vm.extensionManager;(window as any).extensionOriginal=manager.loadExtensionURL;manager.loadExtensionURL=()=>Promise.reject(Error('extension setup failure'));});
 await ed(page).getByRole('button',{name:'開啟相機',exact:true}).click();await expect(page.locator('footer')).toContainText('extension setup failure');
 await f.evaluate(()=>(window as any).reviewVM.extensionManager.loadExtensionURL=(window as any).extensionOriginal);
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/minimal.sb3');await loaded(page,'minimal');await expect(page.locator('.recovery')).toHaveCount(0);await expect(page.locator('footer')).toContainText('攝影機已停止');
});

test('gallery load validates in the browser and no false dirty after a slow import',async({page})=>{
 const f=await ready(page),cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
 let uploads=0;page.on('request',r=>{if(r.method()==='POST')uploads++;});
 await select(page,'第28課');await loaded(page,'第28課');await page.waitForTimeout(500);
 expect(uploads).toBe(0);expect(await f.evaluate(()=>(window as any).reviewStore.getState().scratchGui.projectChanged)).toBe(false);
 await select(page,'第01課');await loaded(page,'第01課');expect(uploads).toBe(0);
});

test('camera-on block does not wait for the model before executing the next block',async({page})=>{
 const f=await ready(page);await page.route('**/scratch-editor/ml5.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.ml5={handpose:()=>new Promise(r=>window.releaseModel=r)};'}));
 const zip=await projectZip(),project=JSON.parse(await zip.file('project.json').async('string'));project.extensions=['handpose2scratch'];
 project.targets[1].blocks={hat:{opcode:'event_whenflagclicked',parent:null,next:'camera',inputs:{},fields:{},topLevel:true,shadow:false,x:20,y:20},camera:{opcode:'handpose2scratch_videoToggle',parent:'hat',next:'move',inputs:{VIDEO_STATE:[1,[10,'on']]},fields:{},topLevel:false,shadow:false},move:{opcode:'motion_changexby',parent:'camera',next:null,inputs:{DX:[1,[4,'10']]},fields:{},topLevel:false,shadow:false}};
 zip.file('project.json',JSON.stringify(project));await page.locator('input[type=file]').setInputFiles({name:'camera.sb3',mimeType:'application/octet-stream',buffer:await zip.generateAsync({type:'nodebuffer'})});await loaded(page,'camera');
 await ed(page).locator('img[class*=green-flag_green-flag]').click();await f.waitForFunction(()=>typeof (window as any).releaseModel==='function');
 expect(await f.evaluate(()=>(window as any).reviewVM.runtime.targets[1].x)).toBe(40);await ed(page).getByRole('button',{name:'停止相機',exact:true}).click();
});

test('sync and async model failures retry without duplicate ml5 scripts or uncaught errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let scripts=0;
 await page.route('**/scratch-editor/ml5.min.js',r=>{scripts++;return r.fulfill({contentType:'application/javascript',body:`window.attempts=0;window.ml5={handpose:()=>{const n=++window.attempts;if(n===1)throw Error('sync failure');if(n===2)return Promise.reject(Error('weights failure'));return Promise.resolve({predict:async()=>[]});}};`});});
 await ready(page);const start=ed(page).getByRole('button',{name:'開啟相機',exact:true});
 await start.click();await expect(page.locator('footer')).toContainText('sync failure');
 await start.click();await expect(page.locator('footer')).toContainText('weights failure');
 await start.click();await expect(page.locator('footer')).toContainText('單手辨識中');expect(scripts).toBe(1);expect(errors).toEqual([]);await ed(page).getByRole('button',{name:'停止相機',exact:true}).click();
});
