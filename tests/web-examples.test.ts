import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateSB3} from '../lib/server/sb3';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
test('all bundled deployment examples match the manifest and load without a private source directory',async()=>{
 const manifest=JSON.parse(await readFile('examples/web/manifest.json','utf8'));
 assert.equal(manifest.files.length,28);
 const files=(await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort();
 assert.deepEqual(files,manifest.files.map((r:any)=>r.file).sort());
 for(const record of manifest.files){
  const bytes=await readFile('examples/web/'+record.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  await validateSB3(bytes);
  if(record.file==='第28課_完成作品.sb3'){
   const zip=await JSZip.loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
   const ai=project.targets.find((t:any)=>t.name==='AI偵測');
   assert.equal(ai.blocks.b03127.fields.landmark[0],'10');assert.equal(ai.blocks.b03131.fields.landmark[0],'10');
   assert.equal(ai.blocks.ollie_hand_valid.opcode,'handpose2scratch_isHandDetected');
   assert.equal(ai.visible,false);
   // Hysteresis: zones update the sticky 手勢; only the shrunken 預備區 resets it.
   const op2=(id:string)=>ai.blocks[id].inputs.OPERAND2[1][1];
   assert.deepEqual([op2('ollie_ready_abs_lt'),op2('b03134'),op2('b03137'),op2('b03140'),op2('b03143')],['60','-20','-90','90','50']);
   for(const id of ['b03135','b03138','b03141','b03144','b03160'])assert.equal(ai.blocks[id].fields.VARIABLE[1],'ollie_v_gesture');
   assert.equal(ai.blocks.ollie_hand_apply.inputs.VALUE[1][2],'ollie_v_gesture');
   assert.equal(op2('ollie_hand_hide_gt'),'0.2');
   // A lost hand never releases the gesture (no re-trigger when it reappears in the same zone).
   assert.ok(!Object.keys(ai.blocks).some(id=>id.includes('forget')));
   const zone=project.targets.find((t:any)=>t.name==='預備區');
   assert.equal(zone.blocks.ollie_zone_size.inputs.SIZE[1][1],'50');assert.equal(zone.y,-60);
   // The forever loop must not reset 動作 to 預備 every frame (one dropped frame would unlock).
   assert.equal(ai.blocks.b03123.inputs.SUBSTACK[1],'ollie_hand_valid_guard');
   // ↓ resets 手勢 before 動作=手勢; ←→↑ override 動作 only while held.
   assert.equal(ai.blocks.ollie_hand_valid_guard.next,'b03157');assert.equal(ai.blocks.b03157.next,'ollie_hand_apply');assert.equal(ai.blocks.ollie_hand_apply.next,'b03145');
  }
  const lesson=Number(/^第(\d+)課/.exec(record.file)?.[1]);
  if(lesson>=9&&lesson<=27){
   // Step lessons: thresholds moved inward from the frame edges; from lesson 10 預備 also limits x (預備區 sprite from 11).
   const zip=await JSZip.loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
   const ai=project.targets.find((t:any)=>t.name==='AI偵測'),zone=project.targets.find((t:any)=>t.name==='預備區');
   const rules=Object.values(ai.blocks).filter((b:any)=>['operator_lt','operator_gt'].includes(b.opcode)&&b.inputs.OPERAND1[1]?.[0]===12)
    .map((b:any)=>`${b.inputs.OPERAND1[1][1]}${b.opcode==='operator_lt'?'<':'>'}${b.inputs.OPERAND2[1][1]}`).sort();
   const expected=lesson===9?['手Y<-20','手Y>50']:lesson===10?['手X<-90','手Y<-20','手Y>50']:['手X<-90','手X>90','手Y<-20','手Y>50'];
   assert.deepEqual(rules,expected.sort(),record.file);
   assert.equal(Boolean(zone),lesson>=11,record.file);
   assert.equal(Boolean(ai.blocks.ollie_ready_and),lesson>=10,record.file);
   if(lesson>=10){assert.equal(ai.blocks.ollie_ready_abs.fields.OPERATOR[0],'abs');assert.equal(ai.blocks.ollie_ready_abs_lt.inputs.OPERAND2[1][1],'60');}
   if(zone){assert.equal(zone.blocks.ollie_zone_size.inputs.SIZE[1][1],'50');assert.equal(Object.values<any>(zone.blocks).find((b:any)=>b.opcode==="motion_gotoxy").inputs.Y[1][1],'-60');}
   // Lesson 10 has no 預備區 sprite, so a comment on the 預備 rule explains the range.
   if(lesson===10)assert.match(ai.comments.ollie_ready_note.text,/\|手X\| < 60/);
  }
 }
});
