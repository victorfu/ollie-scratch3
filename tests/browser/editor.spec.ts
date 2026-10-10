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
 expect(after.targets.length).toBe(4);expect(after.targets).not.toEqual(before.targets);expect(after.blocks).not.toEqual(before.blocks);
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

test('official Handpose2Scratch: loading a Handpose lesson opens the camera with its notice, keeps it across stop and switch, English blocks only',async({page})=>{
 // Offline: the official extension downloads its model from TF Hub on load.
 await page.route(/tfhub.dev|storage.googleapis.com|kaggle.com/,route=>route.abort());
 const notices:string[]=[];page.on('dialog',d=>{notices.push(d.message());d.dismiss();});
 await ready(page);const f=await inspectFrame(page);
 expect(await editor(page).getByRole('button',{name:'開啟相機'}).count()).toBe(0);
 await choose(page,'第08課');await loaded(page,'第08課');
 // Like the official editor, the extension opens the camera as soon as the project loads, then shows its notice.
 await expect.poll(()=>f.evaluate(()=>Boolean((window as any).testVM.runtime.ioDevices.video.provider.video?.srcObject))).toBe(true);
 await expect.poll(()=>notices.join()).toContain('Setup takes a while');
 const labels:string=await f.evaluate(()=>[...document.querySelectorAll('.blocklyFlyout .blocklyText')].map(t=>(t.textContent||'').replace(/\u00a0/g,' ')).join('|'));
 expect(labels).toContain('x of');expect(labels).toContain('set ratio to');expect(labels).not.toContain('偵測到手');
 await f.evaluate(()=>{(window as any).officialTracks=(window as any).testVM.runtime.ioDevices.video.provider.video.srcObject.getTracks();});
 await editor(page).locator('img[class*=stop-all_stop-all]').click();await page.waitForTimeout(300);
 await choose(page,'第01課');const dialog=page.getByRole('dialog',{name:'保留目前的修改嗎？'});if(await dialog.isVisible())await page.getByRole('button',{name:'直接載入',exact:true}).click();await loaded(page,'第01課');
 expect(await f.evaluate(()=>(window as any).officialTracks.every((t:MediaStreamTrack)=>t.readyState==='live'))).toBe(true);
 expect(notices).toHaveLength(1);
});

test('a Handpose lesson still loads and runs when camera permission is denied',async({browser})=>{
 const context=await browser.newContext({permissions:[]});const page=await context.newPage();
 await context.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'))});});
 await page.route(/tfhub.dev|storage.googleapis.com|kaggle.com/,route=>route.abort());page.on('dialog',d=>d.dismiss());
 await ready(page);const f=await inspectFrame(page);await choose(page,'第08課');await loaded(page,'第08課');
 await editor(page).locator('img[class*=green-flag_green-flag]').first().click();
 // No hand data: the official getX/getY report empty, which rounds to 0.
 await expect.poll(()=>f.evaluate(()=>{const v:any=Object.values((window as any).testVM.runtime.getTargetForStage().variables).find((v:any)=>v.name==='手X');return v&&v.value;})).toBe(0);
 await context.close();
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

test('every example block resolves to a VM opcode and every costume/sound asset really loads',async({page,request})=>{
 test.setTimeout(300000);
 // Keep the official extension from downloading and running the model while 28 lessons load one by one.
 await page.route(/tfhub.dev|storage.googleapis.com|kaggle.com/,route=>route.abort());
 const logs:string[]=[];page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text());});
 await ready(page);const f=await inspectFrame(page);const catalog=await (await request.get('/api/examples')).json();
 for(const example of catalog.examples){
  await gallery(page);await page.getByRole('button',{name:new RegExp(example.title)}).click();
  // Switching sprites below marks the project changed, so the next load may ask first; load it directly.
  const direct=page.getByRole('button',{name:'直接載入',exact:true});
  await Promise.race([direct.waitFor({timeout:3000}).then(()=>direct.click()).catch(()=>{}),expect(page.locator('dialog')).toHaveCount(0,{timeout:3000}).catch(()=>{})]);
  await loaded(page,example.title);
  const problems=await f.evaluate(()=>{const vm=(window as any).testVM,rt=vm.runtime,out:string[]=[];
   for(const t of rt.targets.filter((t:any)=>t.isOriginal)){
    for(const [id,b] of Object.entries<any>(t.blocks._blocks)){
     if(b.shadow||['data_variable','data_listcontents'].includes(b.opcode))continue;
     if(!rt._primitives[b.opcode]&&!rt._hats[b.opcode])out.push(`${t.getName()} ${id} unknown opcode ${b.opcode}`);
    }
    for(const c of t.sprite.costumes){
     const size=rt.renderer._allSkins[c.skinId]?.size;
     if(!c.asset||c.asset.assetId!==c.assetId||!c.asset.data.length||!size||!(size[0]>0&&size[1]>0))out.push(`${t.getName()} costume ${c.name} did not load`);
    }
    for(const s of t.sprite.sounds)if(!s.asset||s.asset.assetId!==s.assetId||!t.sprite.soundBank.soundPlayers[s.soundId])out.push(`${t.getName()} sound ${s.name} did not load`);
   }
   return out;});
  expect(problems,example.title).toEqual([]);
  // No two scripts of any sprite may overlap in the workspace (students read these as reference answers).
  const names:string[]=await f.evaluate(()=>(window as any).testVM.runtime.targets.filter((t:any)=>t.isOriginal).map((t:any)=>t.getName()));
  for(const name of names){
   await f.evaluate(name=>{const vm=(window as any).testVM;vm.setEditingTarget(vm.runtime.targets.find((t:any)=>t.getName()===name).id);},name);
   await expect.poll(()=>f.evaluate(name=>(window as any).testVM.editingTarget.getName(),name)).toBe(name);await page.waitForTimeout(300);
   const overlaps=await f.evaluate(()=>{const bs=(window as any).Blockly.getMainWorkspace().getTopBlocks(false).map((b:any)=>{const xy=b.getRelativeToSurfaceXY(),hw=b.getHeightWidth();return {id:b.id,l:xy.x,t:xy.y,r:xy.x+hw.width,b:xy.y+hw.height};});
    return bs.flatMap((A:any,i:number)=>bs.slice(i+1).filter((B:any)=>!(A.r<=B.l||B.r<=A.l||A.b<=B.t||B.b<=A.t)).map((B:any)=>`${A.id}~${B.id}`));});
   expect(overlaps,`${example.title} / ${name}`).toEqual([]);
  }
 }
 // Costume fonts must decode (they are base64-inlined by scratch-render-fonts, not url-loader assets).
 expect(await f.evaluate(()=>Promise.all(['Sans Serif','Serif','Handwriting','Marker','Curly','Pixel','Scratch'].map(n=>document.fonts.load(`16px "${n}"`).then(r=>r.length>0))))).toEqual(Array(7).fill(true));
 // Blockly logs this harmlessly whenever an extension re-registers its blocks on load.
 expect(logs.filter(l=>/asset|costume|sound|opcode|block|font|OTS/i.test(l)&&!/^Block definition #\d+ in JSON array overwrites prior definition/.test(l))).toEqual([]);
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

