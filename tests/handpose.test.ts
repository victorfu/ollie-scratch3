import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const requireModule=createRequire(process.cwd()+'/package.json');const lifecycle=requireModule('./vendor/scratch-editor/src/handpose-lifecycle.js');
test('stop clears stale landmarks and cancels scheduled loop without requesting camera',()=>{
 let stopped=0,disabled=0,requests=0;const events:any[]=[];
 const runtime={handpose:null,emit:(...x:any[])=>events.push(x),on:()=>{},ioDevices:{video:{provider:{video:{srcObject:{getTracks:()=>[{stop:()=>stopped++}]}}},enableVideo:()=>{requests++;},disableVideo:()=>disabled++}}};
 const ext:any={};lifecycle.init.call(ext,runtime);ext.landmarks=[[1,2,3]];ext.active=true;ext.frame=123;const cancelled:number[]=[];const previous=globalThis.cancelAnimationFrame;globalThis.cancelAnimationFrame=id=>cancelled.push(id);try{lifecycle.stop.call(ext);}finally{globalThis.cancelAnimationFrame=previous;}assert.deepEqual(cancelled,[123]);
 assert.equal(requests,0);assert.equal(ext.active,false);assert.equal(ext.epoch,1);assert.deepEqual(ext.landmarks,[]);assert.equal(stopped,1);assert.equal(disabled,1);assert.equal(events[0][1].state,'off');
});
test('stop before the queued start never opens camera',async()=>{
 let requests=0;const runtime={handpose:null,emit:()=>{},on:()=>{},ioDevices:{video:{provider:{},enableVideo:async()=>{requests++;},disableVideo:()=>{}}}};
 const ext:any={stop(){lifecycle.stop.call(this);}};lifecycle.init.call(ext,runtime);
 const pending=lifecycle.start.call(ext,'on');ext.stop();await pending;assert.equal(requests,0);assert.equal(ext.active,false);
});
test('late camera resolution after stop is disabled and cannot start model',async()=>{
 let release:()=>void=()=>{},disabled=0;const gate=new Promise<void>(r=>release=r);
 const runtime={handpose:null,emit:()=>{},on:()=>{},ioDevices:{video:{provider:{},enableVideo:()=>gate,disableVideo:()=>disabled++}}};const ext:any={stop(){lifecycle.stop.call(this);}};lifecycle.init.call(ext,runtime);
 const pending=lifecycle.start.call(ext,'on');await new Promise(resolve=>setImmediate(resolve));ext.stop();release();await pending;assert.equal(ext.active,false);assert.ok(disabled>=2);assert.deepEqual(ext.landmarks,[]);
});
test('green flag starts legacy projects, respects explicit video blocks and ignores cached extension',()=>{
 const listeners:any={},starts:string[]=[];
 const runtime:any={targets:[],on:(event:string,fn:any)=>listeners[event]=fn};
 const ext:any={start:(state:string)=>starts.push(state)};lifecycle.init.call(ext,runtime);
 assert.deepEqual(starts,[]);
 runtime.targets=[{blocks:{_blocks:{read:{opcode:'handpose2scratch_getX'}}}}];listeners.PROJECT_START();assert.deepEqual(starts,['on']);
 runtime.targets[0].blocks._blocks.toggle={opcode:'handpose2scratch_videoToggle'};listeners.PROJECT_START();assert.equal(starts.length,1);
 runtime.targets=[{blocks:{_blocks:{move:{opcode:'motion_movesteps'}}}}];listeners.PROJECT_START();assert.equal(starts.length,1);
});
test('inference advances on animation frames, stays single flight and cannot resurrect after stop',async()=>{
 const g=globalThis as any,old={window:g.window,document:g.document,raf:g.requestAnimationFrame,cancel:g.cancelAnimationFrame};
 const frames=new Map<number,()=>Promise<void>>();let frameId=0,calls=0,resolvePrediction:(hands:any[])=>void=()=>{};
 const model={predict:()=>{calls++;return new Promise<any[]>(r=>resolvePrediction=r);}};
 g.window={ml5:{handpose:async()=>model}};g.document={createElement:()=>({}),head:{appendChild:(script:any)=>script.onload()}};
 g.requestAnimationFrame=(fn:()=>Promise<void>)=>{frames.set(++frameId,fn);return frameId;};g.cancelAnimationFrame=(id:number)=>frames.delete(id);
 const runtime:any={emit:()=>{},on:()=>{},targets:[],ioDevices:{video:{provider:{video:{readyState:2}},enableVideo:async()=>{},disableVideo:()=>{}}}};
 const ext:any={stop(){lifecycle.stop.call(this);}};lifecycle.init.call(ext,runtime);
 try{
  const start=lifecycle.start.call(ext,'on');await new Promise(r=>setImmediate(r));assert.equal(calls,1);
  await lifecycle.start.call(ext,'on');assert.equal(calls,1);
  resolvePrediction([{landmarks:[[100,100,0]]}]);await start;assert.equal(frames.size,1);assert.equal(ext.landmarks.length,1);
  const tick=[...frames.values()][0];frames.clear();const pending=tick();assert.equal(calls,2);
  ext.stop();resolvePrediction([{landmarks:[[200,200,0]]}]);await pending;
  assert.equal(frames.size,0);assert.deepEqual(ext.landmarks,[]);assert.equal(ext.active,false);
 }finally{ext.stop();Object.assign(g,{window:old.window,document:old.document,requestAnimationFrame:old.raf,cancelAnimationFrame:old.cancel});}
});
