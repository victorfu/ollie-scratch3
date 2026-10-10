import {test,expect,Page,Frame} from '@playwright/test';

// The official Handpose2Scratch extension bundles ml5 and downloads its model from TF Hub when a Handpose
// project loads. Tests stay offline (model hosts blocked) and dismiss its "Setup takes a while" alert; hand
// poses are written straight into the extension's `landmarks`, exactly where its 'predict' handler puts them.
async function setup(page:Page){
 await page.route(/tfhub\.dev|kaggle\.com|storage\.googleapis\.com/,r=>r.abort());
 page.on('dialog',d=>d.dismiss());
 await page.goto('/');await expect(page.locator('.editor-status')).toHaveCount(0,{timeout:90000});
 const f=page.frames().find(f=>f.url().includes('/scratch-editor/index.html'))!;
 await f.evaluate(()=>{const root=(document.getElementById('app') as any)._reactRootContainer._internalRoot.current;const walk=(n:any):any=>n&&(n.memoizedProps?.store||walk(n.child)||walk(n.sibling));(window as any).vm=walk(root).getState().scratchGui.vm;});
 return f;
}
// Find the official extension instance: refreshBlocks() asks every loaded extension for getInfo through
// central dispatch (`provider[method].apply(provider, args)`), so briefly watching Function.prototype.apply
// catches the Handpose2Scratch object (the one holding landmarks, ratio and detectHand).
const attachExtension=(f:Frame)=>f.evaluate(async()=>{const w=window as any,apply=Function.prototype.apply;
 Function.prototype.apply=function(this:any,thisArg:any,args:any){
  if(thisArg&&'landmarks' in thisArg&&'ratio' in thisArg&&'detectHand' in thisArg)w.handExt=thisArg;
  return apply.call(this,thisArg,args);
 } as any;
 try{await w.vm.extensionManager.refreshBlocks();}finally{Function.prototype.apply=apply;}
 return Boolean(w.handExt);});
// Build the wrist (1), middle finger base (10) and tip (13) in video pixels from a stage-space pose.
// A real hand never repeats exact coordinates, so each pose nudges the tip by a hair.
let seq=0;
type Kind='fist'|'half'|'up'|'left'|'right'|'diag';
const pose=(f:Frame,kind:Kind,wx=0,wy=-40,L=50)=>f.evaluate(({kind,wx,wy,L,n})=>{
 const dir:any={up:[0,1],left:[-1,0],right:[1,0],diag:[0.7,0.7],fist:[0,1],half:[0,1]},d=dir[kind],k=kind==='fist'?0.9:kind==='half'?1.45:1.9;
 const video=(X:number,Y:number)=>[(240-X)/0.75,(180-Y)/0.75,0];
 const landmarks=Array.from({length:21},()=>video(wx,wy));
 landmarks[9]=video(wx+d[0]*L,wy+d[1]*L);landmarks[12]=video(wx+d[0]*L*k+n*1e-3,wy+d[1]*L*k);
 (window as any).handExt.landmarks=landmarks;
},{kind,wx,wy,L,n:++seq});

test('web lesson 28 reads hand gestures with official blocks only: fist readies, finger direction acts, stale frames never re-trigger',async({page,request})=>{
 const catalog=await (await request.get('/api/examples')).json();expect(catalog.examples).toHaveLength(28);
 const f=await setup(page),ed=page.frameLocator('iframe');
 await ed.getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:/第28課/}).click();await expect(page.locator('.gallery')).toHaveCount(0);
 expect(await attachExtension(f)).toBe(true);
 const read=()=>f.evaluate(()=>{const w=window as any,vm=w.vm,t=vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測'),v=vm.runtime.getTargetForStage().variables;return {x:t.x,y:t.y,visible:t.visible,action:v.v02926.value,lock:Number(v.v02927.value)};});
 const stageVar=(id:string)=>f.evaluate(id=>(window as any).vm.runtime.getTargetForStage().variables[id].value,id);
 const trace=()=>f.evaluate(()=>{const w=window as any;w.actionTrace=[];clearInterval(w.actionTimer);w.actionTimer=setInterval(()=>{const v=w.vm.runtime.getTargetForStage().variables.v02926.value;if(w.actionTrace[w.actionTrace.length-1]!==v)w.actionTrace.push(v);},5);});
 const traced=()=>f.evaluate(()=>{const w=window as any;clearInterval(w.actionTimer);return w.actionTrace as string[];});
 await ed.locator('img[class*=green-flag_green-flag]').click();
 // Before any hand: nothing is judged, the dot stays visible like the official extension, the position box is hidden.
 expect(await read()).toMatchObject({action:'預備',lock:0,visible:true});
 expect(await f.evaluate(()=>(window as any).vm.runtime.targets.find((t:any)=>t.getName()==='預備區').visible)).toBe(false);
 // Fist = 預備; fingers right = 向右 (the dot follows the wrist).
 await pose(f,'fist',100,-60);await expect.poll(async()=> (await read()).x).toBe(100);expect(await read()).toMatchObject({y:-60,action:'預備',lock:0});
 await pose(f,'right',100,-60);await expect.poll(async()=> (await read()).lock).toBe(1);expect((await read()).action).toBe('向右');
 // Diagonal fingers and a half-closed hand are dead zones; when the hand leaves, the official extension keeps the
 // last landmarks and those stale frames are never re-judged, so the held gesture is reported exactly once.
 await trace();
 await pose(f,'diag',100,-60);await page.waitForTimeout(250);await pose(f,'half',100,-60);await page.waitForTimeout(250);await pose(f,'right',100,-60);await page.waitForTimeout(200);
 await page.waitForTimeout(1000);
 expect(await read()).toMatchObject({x:100,y:-60,visible:true,action:'向右',lock:1});
 expect(await traced()).toEqual(['向右']);
 // ↓ releases the gesture left over from the lost hand, and the stale frame cannot bring 向右 back.
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowDown');await expect.poll(async()=> (await read()).lock).toBe(0);
 await page.keyboard.up('ArrowDown');await page.waitForTimeout(400);expect(await read()).toMatchObject({action:'預備',lock:0});
 // Distance does not matter: a small, far-away hand pointing left still reads as 向左; rotating to up without a fist
 // changes 動作 but stays locked (one move per fist).
 await pose(f,'left',-120,60,20);await expect.poll(async()=> (await read()).lock).toBe(1);expect((await read()).action).toBe('向左');
 await pose(f,'up',-120,60,20);await expect.poll(async()=> (await read()).action).toBe('舉高');await page.waitForTimeout(300);expect((await read()).lock).toBe(1);
 await pose(f,'fist',-120,60,20);await expect.poll(async()=> (await read()).lock).toBe(0);
 // Keyboard still works: held keys override 動作, release returns to the hand's gesture.
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('向右');await expect.poll(async()=> (await read()).lock).toBe(1);
 await page.keyboard.up('ArrowRight');await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
 // Restart and walk the opening tutorial: each prompt waits for the real gesture, and moves are echoed by the dancer.
 await ed.locator('img[class*=green-flag_green-flag]').click();
 const hostSays=()=>f.evaluate(()=>(window as any).vm.runtime.targets.find((t:any)=>t.getName()==='主持人').getCustomState('Scratch.looks')?.text||'');
 const tutorial:[string,'up'|'fist'|'left'|'right',string|null][]=[['手指朝上','up','舉高'],['握拳，就是','fist',null],['手指朝左','left','向左'],['握拳，回到預備','fist',null],['手指朝右','right','向右'],['握拳，回到預備','fist',null]];
 for(const [prompt,gesture,echo] of tutorial){
  await expect.poll(hostSays,{timeout:10000}).toContain(prompt);await pose(f,gesture);
  if(echo)await expect.poll(()=>stageVar('v02930')).toBe(echo);
 }
 await expect.poll(hostSays,{timeout:10000}).toContain('準備好了');
 // Space skips the tutorial straight to the start prompt (restart, then skip during the first step).
 await ed.locator('img[class*=green-flag_green-flag]').click();await expect.poll(hostSays,{timeout:10000}).toContain('按空白鍵可跳過');
 await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.press('Space');
 await expect.poll(hostSays,{timeout:3000}).toContain('準備好了');
 // Play the real lesson: open hand, fingers up starts it; each answer is fist then the gesture.
 await pose(f,'up');
 await expect.poll(()=>f.evaluate(()=>{const v=(window as any).vm.runtime.getTargetForStage();return v.getCostumes()[v.currentCostume].name;})).toBe('舞台');
 await pose(f,'fist');
 await expect.poll(async()=>Number(await stageVar('v02931')),{timeout:30000}).toBe(1);
 const questions:string[]=await stageVar('l02940');
 const gestures:Record<string,'left'|'right'|'up'>={'向左':'left','向右':'right','舉高':'up'};
 for(let i=0;i<questions.length;i++){
  await pose(f,'fist');await expect.poll(async()=> (await read()).action).toBe('預備');await expect.poll(async()=> (await read()).lock).toBe(0);
  expect(gestures[questions[i]]).toBeTruthy();await pose(f,gestures[questions[i]]);
  await expect.poll(async()=>Number(await stageVar('v02932'))).toBe(i+2);
 }
 await expect.poll(async()=>Number(await stageVar('v02934'))).toBeGreaterThan(0);
 await ed.locator('img[class*=stop-all_stop-all]').click();
 await f.evaluate(()=>{const vm=(window as any).vm;vm.setEditingTarget(vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測').id);});
 const firstStack=f.locator('.blocklyWorkspace > .blocklyBlockCanvas > [data-id="b03119"]');
 const secondStack=f.locator('.blocklyWorkspace > .blocklyBlockCanvas > [data-id="b03161"]');
 await expect(firstStack).toBeAttached();await expect(secondStack).toBeAttached();
 const firstBounds=await firstStack.boundingBox(),secondBounds=await secondStack.boundingBox();
 expect(firstBounds).not.toBeNull();expect(secondBounds).not.toBeNull();
 expect(firstBounds!.y+firstBounds!.height+20).toBeLessThan(secondBounds!.y);
 // No two scripts in the host (start + tutorial custom block + skip key + handlers) may overlap.
 await f.evaluate(()=>{const vm=(window as any).vm;vm.setEditingTarget(vm.runtime.targets.find((t:any)=>t.getName()==='主持人').id);});
 await expect(f.locator('.blocklyWorkspace > .blocklyBlockCanvas > [data-id="tut_def"]')).toBeAttached();
 const boxes=await f.evaluate(()=>[...document.querySelectorAll('.blocklyWorkspace > .blocklyBlockCanvas > g[data-id]')].map(g=>{const r=(g as SVGGElement).getBoundingClientRect();return {id:g.getAttribute('data-id'),l:r.left,r:r.right,t:r.top,b:r.bottom};}));
 expect(boxes.length).toBeGreaterThanOrEqual(12);
 for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const A=boxes[a],C=boxes[b];expect(A.r<=C.l||C.r<=A.l||A.b<=C.t||C.b<=A.t,`${A.id} overlaps ${C.id}`).toBe(true);}
 // The corrected project is actually serialized into exports, not a hidden VM workaround.
 const download=page.waitForEvent('download');await ed.getByRole('button',{name:'下載作品',exact:true}).click();const artifact=await download;
 await page.locator('input[type=file]').setInputFiles({name:'fixed-roundtrip.sb3',mimeType:'application/octet-stream',buffer:await (await import('node:fs/promises')).readFile((await artifact.path())!)});
 await expect(ed.getByRole('textbox',{name:'在這輸入專案名稱'})).toHaveValue('fixed-roundtrip');
 const opcodes:string[]=await f.evaluate(()=>(window as any).vm.runtime.targets.flatMap((t:any)=>Object.values(t.blocks._blocks).map((b:any)=>b.opcode)));
 expect(opcodes).toContain('handpose2scratch_getX');expect(opcodes).not.toContain('handpose2scratch_isHandDetected');
 expect(await f.evaluate(()=>(window as any).vm.runtime.targets.find((t:any)=>t.getName()==='AI偵測').blocks._blocks.g_if_hand.opcode)).toBe('control_if');
});

test('step lessons 9, 11 and 15 judge the same gestures: fist readies, finger direction acts, stale frames stay put',async({page})=>{
 const f=await setup(page),ed=page.frameLocator('iframe');
 const variable=(name:string)=>f.evaluate(name=>{const v:any=Object.values((window as any).vm.runtime.getTargetForStage().variables).find((v:any)=>v.name===name);return v&&v.value;},name);
 const names:Record<string,string>={up:'舉高',left:'向左',right:'向右'};
 for(const [lesson,moves] of [['第09課',['up']],['第11課',['up','left','right']],['第15課',['up','left','right']]] as const){
  await ed.getByRole('button',{name:'範例',exact:true}).click();await page.getByRole('button',{name:new RegExp(lesson)}).click();
  const direct=page.getByRole('button',{name:'直接載入'});
  await Promise.race([direct.waitFor({timeout:3000}).then(()=>direct.click()).catch(()=>{}),expect(page.locator('.gallery')).toHaveCount(0,{timeout:3000}).catch(()=>{})]);
  await expect(page.locator('.gallery')).toHaveCount(0);
  // The extension loads with the first Handpose lesson and then stays, like in the official editor.
  expect(await attachExtension(f)).toBe(true);
  await ed.locator('img[class*=green-flag_green-flag]').click();
  for(const move of moves){
   await pose(f,'fist');await expect.poll(()=>variable('動作'),{message:`${lesson} fist`}).toBe('預備');
   await pose(f,move);await expect.poll(()=>variable('動作'),{message:`${lesson} ${move}`}).toBe(names[move]);
  }
  if(lesson==='第15課'){
   // One move per fist (lock); when the hand leaves, the last frame stays: ↓ resets and the stale frame cannot undo it.
   await expect.poll(async()=>Number(await variable('鎖'))).toBe(1);
   await ed.locator('[class*="stage_stage_"] canvas').click();await page.keyboard.down('ArrowDown');await expect.poll(()=>variable('動作')).toBe('預備');
   await page.keyboard.up('ArrowDown');await page.waitForTimeout(400);expect(await variable('動作')).toBe('預備');expect(Number(await variable('鎖'))).toBe(0);
  }
  await ed.locator('img[class*=stop-all_stop-all]').click();
 }
});
