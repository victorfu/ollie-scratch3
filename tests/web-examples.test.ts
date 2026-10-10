import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateSB3} from '../lib/server/sb3';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
// Thresholds come from the script that writes them, so tuning them never needs test edits.
const {GESTURE,LANDMARKS,gestureNote,applyGesture}=load('./scripts/handpose-lessons.cjs');
const project=async(bytes:Buffer)=>JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));

// Every Handpose lesson from 9 on judges the same gestures; returns the AI偵測 blocks after checking them.
function checkGesture(p:any,file:string,action:string){
 const ai=p.targets.find((t:any)=>t.name==='AI偵測'),B=ai.blocks,v=(id:string)=>B[id].fields.VARIABLE[0],op2=(id:string)=>B[id].inputs.OPERAND2;
 // Wrist (1), middle finger base (10) and tip (13): hand shape and direction, not position.
 const marks=[...new Set(Object.values<any>(B).filter((b:any)=>b.opcode==='handpose2scratch_menu_landmark').map((b:any)=>b.fields.landmark[0]))];
 assert.equal(marks.sort((a,b)=>Number(a)-Number(b)).join(','),LANDMARKS,file);
 assert.deepEqual(['g_dx','g_dy','g_tip','g_base'].map(v),['方向X','方向Y','指尖距離','指根距離'],file);
 // No position checks remain.
 assert.ok(!Object.values<any>(B).some((b:any)=>['operator_lt','operator_gt'].includes(b.opcode)&&['手X','手Y'].includes(b.inputs.OPERAND1?.[1]?.[1])),file);
 // 握拳 = 預備; open hand then finger direction, each writing the lesson's action variable.
 assert.equal(B.g_fist.opcode,'operator_lt');assert.equal(B.g_open.opcode,'operator_gt');assert.equal(v('g_set_ready'),action);assert.equal(B.g_set_ready.inputs.VALUE[1][1],'預備');
 // Only a real hand and only new frames are judged: the official extension keeps the last landmarks.
 assert.equal(B.g_if_hand.inputs.CONDITION[1],'g_new_and');assert.deepEqual([B.g_new_eq.inputs.OPERAND1[1][1],B.g_new_eq.inputs.OPERAND2[1][1]],['方向X','上次方向X']);
 assert.equal(B.g_if_hand.next,'g_remember');assert.equal(v('g_remember'),'上次方向X');
 // The red dot follows the wrist and stays visible; the position box is unused and hidden.
 assert.equal(ai.visible,true,file);assert.ok(!Object.values<any>(B).some((b:any)=>b.opcode==='looks_hide'),file);
 const zone=p.targets.find((t:any)=>t.name==='預備區');
 if(zone){assert.equal(zone.visible,false,file);assert.ok(Object.values<any>(zone.blocks).some((b:any)=>b.opcode==='looks_hide'),file);}
 return B;
}

test('all bundled deployment examples match the manifest and load without a private source directory',async()=>{
 const manifest=JSON.parse(await readFile('examples/web/manifest.json','utf8'));
 assert.equal(manifest.files.length,28);
 const files=(await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort();
 assert.deepEqual(files,manifest.files.map((r:any)=>r.file).sort());
 for(const record of manifest.files){
  const bytes=await readFile('examples/web/'+record.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  await validateSB3(bytes);
  const lesson=Number(/^第(\d+)課/.exec(record.file)?.[1]);
  if(lesson===7||lesson===8){
   const p=await project(bytes);
   for(const b of Object.values<any>(p.targets.find((t:any)=>t.name==='AI偵測').blocks))if(b.opcode==='handpose2scratch_menu_landmark')assert.equal(b.fields.landmark[0],'1',record.file);
  }
  if(lesson>=9&&lesson<=27){
   // Step lessons add one gesture at a time: 舉高 (9), 向左 (10), 向右 (11+), writing 動作 directly.
   const p=await project(bytes),B=checkGesture(p,record.file,'動作');
   const moves=[['g_set_up','舉高'],['g_set_left','向左'],['g_set_right','向右']].filter(([id])=>B[id]).map(([id,m])=>B[id].inputs.VALUE[1][1]===m&&m);
   assert.deepEqual(moves,['舉高','向左','向右'].slice(0,lesson===9?1:lesson===10?2:3),record.file);
   assert.equal(Boolean(p.targets.find((t:any)=>t.name==='預備區')),lesson>=11,record.file);
   // The arrow-key fallback is gone: gestures are the only way to act.
   if(lesson>=13)assert.equal(Object.values<any>(B).some((b:any)=>b.opcode==='sensing_keypressed'),false,record.file);
   // From lesson 15 an action must hold for the confirm time before 動作成立.
   const waits=Object.values<any>(B).filter((b:any)=>b.opcode==='control_wait').map((b:any)=>b.inputs.DURATION[1][1]);
   assert.deepEqual(waits,lesson>=15?[String(GESTURE.confirm)]:[],record.file);
   const says=p.targets.flatMap((t:any)=>Object.values<any>(t.blocks)).filter((b:any)=>b.opcode==='looks_say').map((b:any)=>b.inputs.MESSAGE[1][1]);
   assert.ok(!says.includes('把手舉高（或按 ↑ 鍵）開始遊戲！')&&!says.includes('換你了！'),`${record.file}: position-era prompt left`);
  }
  if(lesson===28){
   const p=await project(bytes),B=checkGesture(p,record.file,'動作');
   assert.deepEqual(['g_set_up','g_set_left','g_set_right'].map(id=>B[id].inputs.VALUE[1][1]),['舉高','向左','向右']);
   // Gestures are the only control: the loop ends after remembering the frame, with no arrow-key fallback.
   assert.equal(B.g_remember.next,null);assert.ok(!Object.values<any>(p.targets[0].variables).some((v:any)=>v[0]==='手勢'));
   assert.equal(B.b03173.inputs.DURATION[1][1],String(GESTURE.confirm));
   // Opening tutorial in plain blocks (no custom blocks): each step waits for the real gesture or space (跳過教學).
   const host=p.targets.find((t:any)=>t.name==='主持人').blocks,steps:string[]=[];
   for(let id=host.tut_reset.next;id&&host[id].opcode==='control_if';id=host[id].next){
    const say=host[host[id].inputs.SUBSTACK[1]],wait=host[say.next],or=host[wait.inputs.CONDITION[1]];
    assert.equal(say.opcode,'looks_say');assert.equal(wait.opcode,'control_wait_until');assert.equal(or.opcode,'operator_or');
    steps.push(host[or.inputs.OPERAND1[1]].inputs.OPERAND2[1][1]);
   }
   assert.deepEqual(steps,['舉高','預備','向左','預備','向右','預備']);
   assert.equal(host.tut_skip_hat.fields.KEY_OPTION[0],'space');assert.equal(host.tut_skip_set.fields.VARIABLE[0],'跳過教學');
  }
 }
});

// Values are read from the script, so check the design rules they must satisfy, not the numbers themselves.
test('gesture thresholds keep a fist/open gap and a direction dead zone, and every lesson matches the script',async()=>{
 const z=GESTURE;
 assert.ok(z.fist<z.open-0.2,'握拳 and open hand need a gap so a half-closed hand changes nothing');
 assert.ok(z.direction>=1.2,'direction must clearly beat the other axis, leaving diagonals as a dead zone');
 assert.ok(z.minBase>0&&z.confirm>0&&z.confirm<0.5,'minBase skips empty hands; confirm stays short enough to feel responsive');
 for(const file of (await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort()){
  const p=await project(await readFile('examples/web/'+file));
  assert.equal(applyGesture(p),0,`${file} is out of sync with scripts/handpose-lessons.cjs; run npm run examples:handpose`);
  const note=p.targets.find((t:any)=>t.name==='AI偵測')?.comments?.g_note;
  if(note)assert.ok(note.text.startsWith('手勢判斷')&&note.text.includes(`${z.fist} 倍`),file);
 }
 assert.ok(gestureNote(z,['手指朝上＝舉高']).includes('手指朝上＝舉高'));
});
