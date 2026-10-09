import {test,expect} from '@playwright/test';

test('web lesson 28 never recenters on lost hand, clears actions, reacquires and supports keyboard',async({page,request})=>{
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
 const feed=async(x:number,y:number)=>f.evaluate(({x,y})=>{const landmarks=Array.from({length:21},()=>[320,240,0]);landmarks[0]=[480,400,-10];landmarks[9]=[x,y,20];(window as any).packet=[{landmarks}];},{x,y});
 await ed.locator('img[class*=green-flag_green-flag]').click();await expect(page.locator('footer')).toContainText('單手辨識中');
 await expect.poll(async()=> (await read()).visible).toBe(false);
 await feed(80,200);await expect.poll(async()=> (await read()).x).toBe(180);await expect.poll(async()=> (await read()).action).toBe('向右');expect(await read()).toMatchObject({x:180,y:30,visible:true,detected:true});
 await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).visible).toBe(false);
 await page.waitForTimeout(350);expect(await read()).toMatchObject({x:180,y:30,visible:false,detected:false,action:'預備',lock:0,handX:'',handY:''});
 await expect(page.locator('footer')).toContainText('未偵測到手');
 await feed(400,240);await expect.poll(async()=> (await read()).x).toBe(-60);expect(await read()).toMatchObject({x:-60,y:0,visible:true,detected:true,action:'預備'});
 await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).visible).toBe(false);
 // Keyboard fallback remains outside the validity guard.
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('向右');await expect.poll(async()=> (await read()).lock).toBe(1);
 await page.keyboard.up('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
 expect(await read()).toMatchObject({x:-60,y:0,visible:false,detected:false});
 // Drive the actual complete lesson into its first round using a camera pose.
 await feed(320,80);
 await expect.poll(()=>f.evaluate(()=>{const v=(window as any).vm.runtime.getTargetForStage();return v.getCostumes()[v.currentCostume].name;})).toBe('舞台');
 await f.evaluate(()=>(window as any).packet=[]);
 await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02931.value)),{timeout:30000}).toBe(1);
 const questions:string[]=await f.evaluate(()=>(window as any).vm.runtime.getTargetForStage().variables.l02940.value);
 const poses:Record<string,[number,number]>={'向左':[560,240],'向右':[80,240],'舉高':[320,80]};
 for(let i=0;i<questions.length;i++){
  await f.evaluate(()=>(window as any).packet=[]);await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
  expect(poses[questions[i]]).toBeTruthy();await feed(...poses[questions[i]]);
  await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02932.value))).toBe(i+2);
 }
 await expect.poll(()=>f.evaluate(()=>Number((window as any).vm.runtime.getTargetForStage().variables.v02934.value))).toBeGreaterThan(0);
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
