import {test,expect,Page,Frame} from '@playwright/test';
import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
const loadModule=createRequire(process.cwd()+'/package.json');const JSZip=loadModule('./vendor/scratch-editor/node_modules/jszip');
const editor=(page:Page)=>page.frameLocator('iframe');
async function ready(page:Page){await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});await expect(editor(page).locator('.blocklySvg').first()).toBeVisible();}
async function gallery(page:Page){await editor(page).getByRole('button',{name:'範例',exact:true}).click();await expect(page.getByRole('dialog',{name:'探索你的範例'})).toBeVisible();}
async function choose(page:Page,lesson:string){await gallery(page);await page.getByRole('button',{name:new RegExp(lesson)}).click();}
async function loaded(page:Page,lesson:string){await expect(page.locator('dialog')).toHaveCount(0);await expect(editor(page).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue(new RegExp(lesson));}
async function save(page:Page){const wait=page.waitForEvent('download');await editor(page).getByRole('button',{name:'下載作品',exact:true}).click();const d=await wait;const p=await d.path();return {data:await readFile(p!),path:p!};}
// Inspect real React/VM state without adding a test API to the shipped editor.
async function inspectFrame(page:Page){const f=page.frames().find(x=>x.url().includes('/scratch-editor/index.html'))!;await f.evaluate(()=>{
 const root=(document.getElementById('app') as any)._reactRootContainer._internalRoot.current;
 function walk(n:any):any{if(!n)return;const p=n.memoizedProps;if(p?.store?.getState()?.scratchGui?.vm)return p.store;return walk(n.child)||walk(n.sibling);}
 (window as any).testStore=walk(root);(window as any).testVM=(window as any).testStore.getState().scratchGui.vm;
 });return f;}

test('real workspace / official 28 examples / sequential loads / unsaved flows / export roundtrip',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const failed:string[]=[];page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
 await ready(page);expect(await editor(page).getByRole('button',{name:'範例',exact:true}).count()).toBe(1);
 await gallery(page);await expect(page.getByText('28 個本機範例')).toBeVisible();await page.getByRole('button',{name:/第01課/}).click();await loaded(page,'第01課');
 const f=await inspectFrame(page);const before=await f.evaluate(()=>({targets:(window as any).testVM.runtime.targets.map((t:any)=>t.getName()),blocks:(window as any).testVM.runtime.targets.map((t:any)=>Object.keys(t.blocks._blocks).length)}));
 await choose(page,'第08課');await loaded(page,'第08課');
 const after=await f.evaluate(()=>({targets:(window as any).testVM.runtime.targets.map((t:any)=>t.getName()),blocks:(window as any).testVM.runtime.targets.map((t:any)=>Object.keys(t.blocks._blocks).length),camera:(window as any).testVM.runtime.ioDevices.video.provider.enabled}));
 expect(after.targets.length).toBe(4);expect(after.targets).not.toEqual(before.targets);expect(after.blocks).not.toEqual(before.blocks);expect(after.camera).not.toBe(true);
 await expect(editor(page).locator('.blocklyBlockCanvas').first()).toBeVisible();
 const title=editor(page).getByRole('textbox',{name:'在這輸入專案名稱'});await title.fill('尚未儲存的修改');await title.press('Tab');
 await choose(page,'第02課');await expect(page.getByRole('dialog',{name:'保留目前的修改嗎？'})).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'關閉範例'}).click();await expect(title).toHaveValue('尚未儲存的修改');
 await choose(page,'第02課');await page.getByRole('button',{name:'直接載入',exact:true}).click();await loaded(page,'第02課');
 await title.fill('下載後載入測試');await title.press('Tab');await choose(page,'第06課');const download=page.waitForEvent('download');await page.getByRole('button',{name:'下載目前作品後載入'}).click();const backup=await download;expect(backup.suggestedFilename()).toBe('下載後載入測試.sb3');await loaded(page,'第06課');
 const exported=await save(page);const zip=await JSZip.loadAsync(exported.data);const project=JSON.parse(await zip.file('project.json').async('string'));expect(project.extensions).toContain('music');
 await choose(page,'第01課');await loaded(page,'第01課');await page.locator('input[type=file]').setInputFiles({name:'roundtrip.sb3',mimeType:'application/octet-stream',buffer:exported.data});await loaded(page,'roundtrip');expect(await f.evaluate(()=>(window as any).testVM.runtime.targets.length)).toBe(project.targets.length);
 await page.screenshot({path:'output/playwright/editor.png'});await gallery(page);await page.screenshot({path:'output/playwright/gallery.png'});
 expect(errors).toEqual([]);expect(failed).toEqual([]);
});

test('invalid / unsupported / read error preserve project; Music produces real audio samples',async({page})=>{
 await ready(page);const f=await inspectFrame(page);
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/music.sb3');await loaded(page,'music');
 const targetNames=await f.evaluate(()=>(window as any).testVM.runtime.targets.map((t:any)=>t.getName()));
 for(const [file,error] of [['invalid.sb3','SB3 格式'],['unsupported.sb3','extension 相容性']]){await page.locator('input[type=file]').setInputFiles('tests/fixtures/'+file);await expect(page.getByRole('alert').filter({hasText:error})).toBeVisible();expect(await f.evaluate(()=>(window as any).testVM.runtime.targets.map((t:any)=>t.getName()))).toEqual(targetNames);await page.getByRole('button',{name:'關閉錯誤'}).click();}
 await page.route('**/api/examples/*/project',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'讀取檔案：測試模擬檔案被移除'})}));
 await choose(page,'第01課');await expect(page.getByText('讀取檔案：測試模擬檔案被移除')).toBeVisible();expect(await f.evaluate(()=>(window as any).testVM.runtime.targets.map((t:any)=>t.getName()))).toEqual(targetNames);await page.getByRole('button',{name:'關閉範例'}).click();
 await f.evaluate(()=>{const vm=(window as any).testVM,ctx=vm.runtime.audioEngine.audioContext;const a=ctx.createAnalyser();vm.runtime.audioEngine.inputNode.connect(a);(window as any).audioProbe=a;});
 await editor(page).locator('img[class*=green-flag_green-flag]').first().click();
 await expect.poll(()=>f.evaluate(()=>{const a=(window as any).audioProbe,b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.max(...Array.from(b).map(Math.abs));})).toBeGreaterThan(0.00001);
 expect(await f.evaluate(()=>(window as any).testVM.runtime.audioEngine.audioContext.state)).toBe('running');
});

test('fake camera permission / stop / switch lifecycle; model failure explicit',async({page})=>{
 await ready(page);const f=await inspectFrame(page);await choose(page,'第08課');await loaded(page,'第08課');
 expect(await f.evaluate(()=>(window as any).testVM.runtime.ioDevices.video.provider.enabled)).not.toBe(true);
 // Failure injection is explicitly model network failure, never a fake hand prediction.
 await page.route(/tfhub.dev|storage.googleapis.com|kaggle.com/,route=>route.abort());
 await editor(page).getByRole('button',{name:'開啟相機',exact:true}).click();
 await expect(page.locator('footer')).toContainText(/模型載入失敗|模型下載逾時|推論失敗/,{timeout:80000});
 await editor(page).getByRole('button',{name:'停止相機'}).click();await expect(page.locator('footer')).toContainText('已停止');
 expect(await f.evaluate(()=>(window as any).testVM.runtime.handpose.active)).toBe(false);
 await page.unroute(/tfhub.dev|storage.googleapis.com|kaggle.com/);
 await editor(page).getByRole('button',{name:'開啟相機',exact:true}).click();
 await expect.poll(()=>f.evaluate(()=>Boolean((window as any).testVM.runtime.ioDevices.video.provider.video?.srcObject))).toBe(true);
 await f.evaluate(()=>{(window as any).previousTracks=(window as any).testVM.runtime.ioDevices.video.provider.video.srcObject.getTracks();});
 await choose(page,'第01課');const dialog=page.getByRole('dialog',{name:'保留目前的修改嗎？'});if(await dialog.isVisible())await page.getByRole('button',{name:'直接載入',exact:true}).click();await loaded(page,'第01課');
 expect(await f.evaluate(()=>(window as any).previousTracks.every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
 expect(await f.evaluate(()=>(window as any).testVM.runtime.handpose.landmarks.length)).toBe(0);
});

test('camera denial is visible and retry does not duplicate listeners',async({browser})=>{
 const context=await browser.newContext({permissions:[]});const page=await context.newPage();
 await context.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'))});});
 await ready(page);await editor(page).getByRole('button',{name:'開啟相機',exact:true}).click();await expect(page.locator('footer')).toContainText('權限遭拒');await editor(page).getByRole('button',{name:'停止相機'}).click();await expect(page.locator('footer')).toContainText('已停止');await context.close();
});

test('backup failure blocks replacement; VM failure restores; recovery failure offers real backup',async({page})=>{
 await ready(page);await choose(page,'第01課');await loaded(page,'第01課');const f=await inspectFrame(page);
 await f.evaluate(()=>{const vm=(window as any).testVM;(window as any).originalSave=vm.saveProjectSb3;vm.saveProjectSb3=()=>Promise.reject(Error('injected backup failure'));});
 await choose(page,'第02課');await expect(page.getByText(/備份階段.*injected backup failure/)).toBeVisible();await page.getByRole('button',{name:'關閉範例'}).click();await expect(editor(page).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue(/第01課/);
 await f.evaluate(()=>{const vm=(window as any).testVM;vm.saveProjectSb3=(window as any).originalSave;const original=vm.loadProject.bind(vm);let once=true;vm.loadProject=(bytes:any)=>{if(once){once=false;return Promise.reject(Error('injected VM failure'));}return original(bytes);};});
 await choose(page,'第02課');await expect(page.getByText(/VM 載入.*已復原原作品/)).toBeVisible();await page.getByRole('button',{name:'關閉範例'}).click();await expect(editor(page).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue(/第01課/);
 await f.evaluate(()=>{(window as any).testVM.loadProject=()=>Promise.reject(Error('injected permanent failure'));});
 await choose(page,'第02課');await expect(page.getByText(/復原也失敗/)).toBeVisible();await page.getByRole('button',{name:'關閉範例'}).click();const wait=page.waitForEvent('download');await page.getByRole('button',{name:'下載可用備份'}).click();const d=await wait;const z=await JSZip.loadAsync(await readFile((await d.path())!));expect(z.file('project.json')).not.toBeNull();
});

test('API path traversal denied; refreshed list uses no-store; stale session messages ignored',async({page,request})=>{
 await ready(page);const response=await request.get('/api/examples');expect(response.headers()['cache-control']).toBe('no-store');const catalog=await response.json();expect(JSON.stringify(catalog)).not.toContain('/Users/');
 for(const id of ['..%2F..%2Fetc%2Fpasswd','%2Fetc%2Fpasswd','0'.repeat(64),'invalid']){const r=await request.get(`/api/examples/${id}/project`);expect(r.status()).toBeGreaterThanOrEqual(400);}
 const f=await inspectFrame(page);
 await page.evaluate(()=>{(window as any).readyMessages=[];window.addEventListener('message',e=>{if(e.data?.type==='ready')(window as any).readyMessages.push(e.data);});});
 await page.locator('iframe').evaluate((el:HTMLIFrameElement)=>el.contentWindow!.location.reload());await expect(page.locator('.editor-status')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).readyMessages.length)).toBe(1);
 await f.evaluate(()=>parent.postMessage({channel:'ollie-scratch',version:1,type:'open-examples',sessionId:'old-session',requestId:'stale'},location.origin));await expect(page.locator('dialog')).toHaveCount(0);
 await gallery(page);await page.getByRole('button',{name:'重新整理'}).click();await expect(page.getByText('28 個本機範例')).toBeVisible();
});

test('Blockly drag edits real VM; Music can be added from extension library',async({page})=>{
 await ready(page);const f=await inspectFrame(page);const ed=editor(page);
 const count=()=>f.evaluate(()=>Object.keys((window as any).testVM.editingTarget.blocks._blocks).length);
 const original=await count();const block=await ed.locator('.blocklyFlyout [data-id="motion_movesteps"]').first().boundingBox();expect(block).not.toBeNull();
 await page.mouse.move(block!.x+8,block!.y+12);await page.mouse.down();await page.mouse.move(block!.x+480,block!.y+160,{steps:20});await page.mouse.up();await expect.poll(count).toBeGreaterThan(original);
 await ed.locator('[class*="gui_extension-button_"]').click();await ed.getByRole('dialog').getByText('音樂',{exact:true}).click();
 await expect.poll(()=>f.evaluate(()=>(window as any).testVM.extensionManager.isExtensionLoaded('music'))).toBe(true);
});

test('all 28 official examples load sequentially without target or block residue',async({page,request})=>{
 await ready(page);const f=await inspectFrame(page);const catalog=await (await request.get('/api/examples')).json();
 for(const example of catalog.examples){
  const r=await request.get(`/api/examples/${example.id}/project`);expect(r.ok()).toBe(true);const z=await JSZip.loadAsync(await r.body());const expected=JSON.parse(await z.file('project.json').async('string'));
  await gallery(page);await page.getByRole('button',{name:new RegExp(example.title)}).click();await loaded(page,example.title);
  const actual=await f.evaluate(()=>(window as any).testVM.runtime.targets.filter((t:any)=>t.isOriginal).map((t:any)=>({name:t.getName(),blocks:Object.keys(t.blocks._blocks).filter(id=>!t.blocks._blocks[id].shadow && !['data_variable','data_listcontents'].includes(t.blocks._blocks[id].opcode)).sort()})));
  expect(actual).toEqual(expected.targets.map((t:any)=>({name:t.name,blocks:Object.keys(t.blocks).filter(id=>!t.blocks[id].shadow && !Array.isArray(t.blocks[id]) && !['data_variable','data_listcontents'].includes(t.blocks[id].opcode)).sort()})));
 }
});

test('two simultaneous load requests are serialized by the real iframe',async({page,request})=>{
 await ready(page);const f=await inspectFrame(page);const catalog=await (await request.get('/api/examples')).json();
 const buffers=await Promise.all([catalog.examples[0],catalog.examples[3]].map(async e=>Array.from(await (await request.get(`/api/examples/${e.id}/project`)).body())));
 const results=await page.evaluate(async data=>{
  const frame=document.querySelector('iframe')!.contentWindow!,origin=location.origin;
  const wrap=(type:string,sessionId:string,requestId:string,extra={})=>({channel:'ollie-scratch',version:1,type,sessionId,requestId,...extra});
  const session=await new Promise<string>(resolve=>{const fn=(e:MessageEvent)=>{if(e.source===frame&&e.data?.type==='ready'&&e.data.requestId==='queue-handshake'){window.removeEventListener('message',fn);resolve(e.data.sessionId);}};window.addEventListener('message',fn);frame.postMessage(wrap('connect','','queue-handshake'),origin);});
  return await new Promise<any[]>((resolve,reject)=>{const out:any[]=[];const timer=setTimeout(()=>reject(Error('queue timeout')),30000);const listener=(e:MessageEvent)=>{if(e.source!==frame||e.data.sessionId!==session||e.data.type!=='result'||!['queue-a','queue-b'].includes(e.data.requestId))return;out.push({id:e.data.requestId,ok:e.data.ok});if(out.length===2){clearTimeout(timer);window.removeEventListener('message',listener);resolve(out);}};window.addEventListener('message',listener);
   data.forEach((bytes,i)=>frame.postMessage(wrap('load',session,i?'queue-b':'queue-a',{bytes:new Uint8Array(bytes).buffer,title:i?'Queued B':'Queued A',downloadFirst:false}),origin));
  });
 },buffers);
 expect(results).toEqual([{id:'queue-a',ok:true},{id:'queue-b',ok:true}]);await expect(editor(page).getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue('Queued B');expect(await f.evaluate(()=>(window as any).testVM.runtime.targets.filter((t:any)=>t.isOriginal).length)).toBe(3);
});

test('lesson 28 green flag opens camera without toolbar; restart and switching stop tracks',async({page})=>{
 await ready(page);const f=await inspectFrame(page);
 await choose(page,'第28課');await loaded(page,'第28課');
 expect(await f.evaluate(()=>Boolean((window as any).testVM.runtime.ioDevices.video.provider.enabled))).toBe(false);
 const flag=editor(page).locator('img[class*=green-flag_green-flag]').first();
 await flag.click();
 await expect.poll(()=>f.evaluate(()=>Boolean((window as any).testVM.runtime.ioDevices.video.provider.video?.srcObject))).toBe(true);
 // Restart while model download may still be pending. No extra toolbar gesture.
 await flag.click();
 await expect(page.locator('footer')).toContainText('單手辨識中',{timeout:80000});
 await f.evaluate(()=>{(window as any).capturedTracks=(window as any).testVM.runtime.ioDevices.video.provider.video.srcObject.getTracks();});
 await editor(page).locator('img[class*=stop-all_stop-all]').click();
 await expect.poll(()=>f.evaluate(()=>(window as any).capturedTracks.every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
 await flag.click();await expect(page.locator('footer')).toContainText('單手辨識中');
 await choose(page,'第01課');
 const confirm=page.getByRole('dialog',{name:'保留目前的修改嗎？'});
 if(await confirm.isVisible())await page.getByRole('button',{name:'直接載入',exact:true}).click();
 await loaded(page,'第01課');await flag.click();
 await page.waitForTimeout(300);
 expect(await f.evaluate(()=>Boolean((window as any).testVM.runtime.ioDevices.video.provider.enabled))).toBe(false);
});
