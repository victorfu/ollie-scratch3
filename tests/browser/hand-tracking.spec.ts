import {test,expect} from '@playwright/test';

test('web lesson 28 holds gestures through dropouts and jitter, releases only in the 預備區, and supports keyboard',async({page,request})=>{
 const catalog=await (await request.get('/api/examples')).json();expect(catalog.examples).toHaveLength(28);
 await page.route('**/scratch-editor/ml5.min.js',r=>r.fulfill({contentType:'application/javascript',body:`
 window.packet=[];window.inflight=0;window.maxInflight=0;window.predictions=0;
 window.ml5={handpose:async()=>({predict:async()=>{window.inflight++;window.maxInflight=Math.max(window.maxInflight,window.inflight);window.predictions++;await new Promise(r=>setTimeout(r,5));window.inflight--;return window.packet;}})};
 `}));
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 const ed=page.frameLocator('iframe');await ed.getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:/第28課/}).click();await expect(page.locator('.gallery')).toHaveCount(0);
 const f=page.frames().find(f=>f.url().includes('/scratch-editor/index.html'))!;
 await f.evaluate(()=>{const root=(document.getElementById('app') as any)._reactRootContainer._internalRoot.current;const walk=(n:any):any=>n&&(n.memoizedProps?.store||walk(n.child)||walk(n.sibling));(window as any).vm=walk(root).getState().scratchGui.vm;});
 const read=()=>f.evaluate(()=>{const w=window as any,vm=w.vm,t=vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測'),v=vm.runtime.getTargetForStage().variables;return {x:t.x,y:t.y,visible:t.visible,action:v.v02926.value,lock:Number(v.v02927.value),handX:v.v02924.value,handY:v.v02925.value,detected:vm.runtime.handpose.isHandDetected()};});
 const feed=async(x:number,y:number)=>f.evaluate(({x,y})=>{const landmarks=Array.from({length:21},()=>[320,240,0]);landmarks[0]=[x,y,0];landmarks[9]=[320,240,20];(window as any).packet=[{landmarks}];},{x,y});
 await ed.locator('img[class*=green-flag_green-flag]').click();await expect(page.locator('footer')).toContainText('單手辨識中');
 await expect.poll(async()=> (await read()).visible).toBe(false);
 expect(await f.evaluate(()=>(window as any).vm.runtime.targets.find((t:any)=>t.getName()==='預備區').visible)).toBe(true);
 // Record every 動作 value the VM goes through, so transient unlocks cannot hide between polls.
 const trace=()=>f.evaluate(()=>{const w=window as any;w.actionTrace=[];clearInterval(w.actionTimer);w.actionTimer=setInterval(()=>{const v=w.vm.runtime.getTargetForStage().variables.v02926.value;if(w.actionTrace[w.actionTrace.length-1]!==v)w.actionTrace.push(v);},5);});
 const traced=()=>f.evaluate(()=>(window as any).actionTrace as string[]);
 await feed(80,280);await expect.poll(async()=> (await read()).x).toBe(180);await expect.poll(async()=> (await read()).lock).toBe(1);expect(await read()).toMatchObject({x:180,y:-30,visible:true,detected:true,action:'向右'});
 await trace();
 // Jitter back across the right threshold into the dead zone keeps the held gesture.
 await feed(210,280);await expect.poll(async()=> (await read()).x).toBe(83);
 await feed(190,280);await expect.poll(async()=> (await read()).x).toBe(98);
 // A short detection dropout (< 0.2s) neither hides the dot nor unlocks.
 await f.evaluate(()=>(window as any).packet=[]);await page.waitForTimeout(80);await feed(80,280);await expect.poll(async()=> (await read()).detected).toBe(true);
 await page.waitForTimeout(300);
 expect(await traced()).toEqual(['向右']);expect(await read()).toMatchObject({action:'向右',lock:1,visible:true});
 // A long loss hides the dot but never releases the gesture, so reappearing in the same zone cannot re-trigger.
 await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).visible).toBe(false);
 await expect(page.locator('footer')).toContainText('未偵測到手');await page.waitForTimeout(1500);
 expect(await read()).toMatchObject({x:180,y:-30,visible:false,detected:false,action:'向右',lock:1,handX:'',handY:''});
 await feed(80,280);await expect.poll(async()=> (await read()).visible).toBe(true);await page.waitForTimeout(300);
 expect(await traced()).toEqual(['向右']);expect(await read()).toMatchObject({action:'向右',lock:1});
 await f.evaluate(()=>clearInterval((window as any).actionTimer));
 // ↓ releases a gesture left over from a lost hand; it stays 預備 after the key is released.
 await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).visible).toBe(false);
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowDown');await expect.poll(async()=> (await read()).lock).toBe(0);
 await page.keyboard.up('ArrowDown');await page.waitForTimeout(300);expect(await read()).toMatchObject({action:'預備',lock:0});
 // Only the 預備區 (|x|<60, y<-40; wrist) releases a held gesture; the middle is a dead zone.
 await feed(560,280);await expect.poll(async()=> (await read()).lock).toBe(1);expect((await read()).action).toBe('向左');
 await feed(400,280);await expect.poll(async()=> (await read()).x).toBe(-60);await page.waitForTimeout(300);expect(await read()).toMatchObject({x:-60,y:-30,visible:true,action:'向左',lock:1});
 await feed(320,400);await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);expect(await read()).toMatchObject({x:0,y:-120});
 await feed(400,280);await expect.poll(async()=> (await read()).x).toBe(-60);expect(await read()).toMatchObject({x:-60,y:-30,visible:true,detected:true,action:'預備'});
 await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).visible).toBe(false);
 // Keyboard fallback remains outside the validity guard.
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('向右');await expect.poll(async()=> (await read()).lock).toBe(1);
 await page.keyboard.up('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
 expect(await read()).toMatchObject({x:-60,y:-30,visible:false,detected:false});
 // Drive the actual complete lesson into its first round using a camera pose.
 await feed(320,80);
 await expect.poll(()=>f.evaluate(()=>{const v=(window as any).vm.runtime.getTargetForStage();return v.getCostumes()[v.currentCostume].name;})).toBe('舞台');
 await f.evaluate(()=>(window as any).packet=[]);
 await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02931.value)),{timeout:30000}).toBe(1);
 const questions:string[]=await f.evaluate(()=>(window as any).vm.runtime.getTargetForStage().variables.l02940.value);
 const poses:Record<string,[number,number]>={'向左':[560,280],'向右':[80,280],'舉高':[320,80]};
 for(let i=0;i<questions.length;i++){
  await feed(320,400);await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
  expect(poses[questions[i]]).toBeTruthy();await feed(...poses[questions[i]]);
  await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02932.value))).toBe(i+2);
 }
 await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02934.value))).toBeGreaterThan(0);
 // Raising diagonally briefly crosses the left zone (< the 0.15s confirm): only 舉高 may be confirmed.
 // The crossing's real length is measured; a busy page that stretches it past 110ms just retries.
 let dwell=Infinity;
 for(let attempt=0;attempt<5&&dwell>=110;attempt++){
  await feed(320,400);await expect.poll(async()=> (await read()).lock).toBe(0);
  await f.evaluate(()=>{const w=window as any;w.timed=[];clearInterval(w.timedTimer);w.timedTimer=setInterval(()=>{const v=w.vm.runtime.getTargetForStage().variables.v02926.value;if(w.timed[w.timed.length-1]?.[0]!==v)w.timed.push([v,performance.now()]);},2);});
  await feed(560,250);await page.waitForTimeout(60);await feed(480,80);await expect.poll(async()=> (await read()).action).toBe('舉高');await expect.poll(async()=> (await read()).lock).toBe(1);
  const timed:[string,number][]=await f.evaluate(()=>{const w=window as any;clearInterval(w.timedTimer);return w.timed;});
  expect(timed.map(t=>t[0])).toEqual(['預備','向左','舉高']);dwell=timed[2][1]-timed[1][1];
  if(dwell<110)expect(await f.evaluate(()=>(window as any).vm.runtime.getTargetForStage().variables.v02928.value)).toBe('舉高');
 }
 expect(dwell).toBeLessThan(110);
 expect(await f.evaluate(()=>(window as any).maxInflight)).toBe(1);
 await ed.locator('img[class*=stop-all_stop-all]').click();const calls=await f.evaluate(()=>(window as any).predictions);await page.waitForTimeout(200);expect(await f.evaluate(()=>(window as any).predictions)).toBe(calls);expect((await read()).detected).toBe(false);
 await f.evaluate(()=>{const vm=(window as any).vm;vm.setEditingTarget(vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測').id);});
 const firstStack=f.locator('.blocklyWorkspace > .blocklyBlockCanvas > [data-id="b03119"]');
 const secondStack=f.locator('.blocklyWorkspace > .blocklyBlockCanvas > [data-id="b03161"]');
 await expect(firstStack).toBeAttached();await expect(secondStack).toBeAttached();
 const firstBounds=await firstStack.boundingBox(),secondBounds=await secondStack.boundingBox();
 expect(firstBounds).not.toBeNull();expect(secondBounds).not.toBeNull();
 expect(firstBounds!.y+firstBounds!.height+20).toBeLessThan(secondBounds!.y);
 // The corrected project is actually serialized into exports, not a hidden VM workaround.
 const download=page.waitForEvent('download');await ed.getByRole('button',{name:'下載作品',exact:true}).click();const artifact=await download;
 await page.locator('input[type=file]').setInputFiles({name:'fixed-roundtrip.sb3',mimeType:'application/octet-stream',buffer:await (await import('node:fs/promises')).readFile((await artifact.path())!)});
 await expect(ed.getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue('fixed-roundtrip');
 expect(await f.evaluate(()=>(window as any).vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測').blocks._blocks.ollie_hand_valid.opcode)).toBe('handpose2scratch_isHandDetected');
});
