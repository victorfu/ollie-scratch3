import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateSB3} from '../lib/server/sb3';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
// Thresholds come from the script that writes them, so tuning them never needs test edits.
const {ZONES_BY_LANDMARK,zoneBox,readBoxDims,readyNote,applyZones}=load('./scripts/handpose-lessons.cjs'),WRIST=ZONES_BY_LANDMARK['1'];
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
   // Every Handpose lesson (7–28) tracks the wrist, landmark 1.
   assert.equal(ai.blocks.b03127.fields.landmark[0],'1');assert.equal(ai.blocks.b03131.fields.landmark[0],'1');
   assert.equal(ai.blocks.ollie_hand_valid.opcode,'handpose2scratch_isHandDetected');
   assert.equal(ai.visible,false);
   // Hysteresis: zones update the sticky 手勢; only the shrunken 預備區 resets it.
   const op2=(id:string)=>ai.blocks[id].inputs.OPERAND2[1][1];
   assert.deepEqual([op2('ollie_ready_abs_lt'),op2('b03134'),op2('b03137'),op2('b03140'),op2('b03143')],[WRIST.readyX,WRIST.readyY,WRIST.left,WRIST.right,WRIST.raise].map(String));
   for(const id of ['b03135','b03138','b03141','b03144','b03160'])assert.equal(ai.blocks[id].fields.VARIABLE[1],'ollie_v_gesture');
   assert.equal(ai.blocks.ollie_hand_apply.inputs.VALUE[1][2],'ollie_v_gesture');
   assert.equal(op2('ollie_hand_hide_gt'),String(WRIST.hideAfter));
   // A lost hand never releases the gesture (no re-trigger when it reappears in the same zone).
   assert.ok(!Object.keys(ai.blocks).some(id=>id.includes('forget')));
   const zone=project.targets.find((t:any)=>t.name==='預備區');
   const box=zoneBox(WRIST,zone.costumes[0],await readBoxDims(zip,project));assert.equal(zone.blocks.ollie_zone_size.inputs.SIZE[1][1],String(box.size));assert.equal(zone.y,box.y);assert.equal(zone.visible,true);
   // The forever loop must not reset 動作 to 預備 every frame (one dropped frame would unlock).
   assert.equal(ai.blocks.b03123.inputs.SUBSTACK[1],'ollie_hand_valid_guard');
   // ↓ resets 手勢 before 動作=手勢; ←→↑ override 動作 only while held.
   assert.equal(ai.blocks.ollie_hand_valid_guard.next,'b03157');assert.equal(ai.blocks.b03157.next,'ollie_hand_apply');assert.equal(ai.blocks.ollie_hand_apply.next,'b03145');
   // Loop yields once per frame (wait 0 requests a redraw) so the VM doesn't spin and starve inference; quick 0.15s confirm.
   assert.equal(ai.blocks.b03153.next,'ollie_frame_wait');assert.equal(ai.blocks.ollie_frame_wait.inputs.DURATION[1][1],'0');
   assert.equal(ai.blocks.b03173.inputs.DURATION[1][1],String(WRIST.confirm));
  }
  const lesson=Number(/^第(\d+)課/.exec(record.file)?.[1]);
  if(lesson>=7&&lesson<=8){
   const zip=await JSZip.loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
   for(const b of Object.values<any>(project.targets.find((t:any)=>t.name==='AI偵測').blocks))if(b.opcode==='handpose2scratch_menu_landmark')assert.equal(b.fields.landmark[0],'1',record.file);
  }
  if(lesson>=9&&lesson<=27){
   // Step lessons: thresholds moved inward from the frame edges; from lesson 10 預備 also limits x (預備區 sprite from 11).
   const zip=await JSZip.loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
   const ai=project.targets.find((t:any)=>t.name==='AI偵測'),zone=project.targets.find((t:any)=>t.name==='預備區');
   for(const b of Object.values<any>(ai.blocks))if(b.opcode==='handpose2scratch_menu_landmark')assert.equal(b.fields.landmark[0],'1',record.file);
   const rules=Object.values(ai.blocks).filter((b:any)=>['operator_lt','operator_gt'].includes(b.opcode)&&b.inputs.OPERAND1[1]?.[0]===12)
    .map((b:any)=>`${b.inputs.OPERAND1[1][1]}${b.opcode==='operator_lt'?'<':'>'}${b.inputs.OPERAND2[1][1]}`).sort();
   const [l,r,y0,y1]=[`手X<${WRIST.left}`,`手X>${WRIST.right}`,`手Y<${WRIST.readyY}`,`手Y>${WRIST.raise}`];
   const expected=lesson===9?[y0,y1]:lesson===10?[l,y0,y1]:[l,r,y0,y1];
   assert.deepEqual(rules,expected.sort(),record.file);
   assert.equal(Boolean(zone),lesson>=11,record.file);
   assert.equal(Boolean(ai.blocks.ollie_ready_and),lesson>=10,record.file);
   if(lesson>=10){assert.equal(ai.blocks.ollie_ready_abs.fields.OPERATOR[0],'abs');assert.equal(ai.blocks.ollie_ready_abs_lt.inputs.OPERAND2[1][1],String(WRIST.readyX));}
   if(zone){const box=zoneBox(WRIST,zone.costumes[0],await readBoxDims(zip,project));assert.equal(zone.blocks.ollie_zone_size.inputs.SIZE[1][1],String(box.size));assert.equal(Object.values<any>(zone.blocks).find((b:any)=>b.opcode==="motion_gotoxy").inputs.Y[1][1],String(box.y));}
   // Lesson 10 has no 預備區 sprite, so a comment on the 預備 rule explains the range.
   if(lesson===10)assert.equal(ai.comments.ollie_ready_note.text,readyNote(WRIST));
   // From lesson 15 an action must hold for the confirm time before 動作成立.
   const waits=Object.values<any>(ai.blocks).filter((b:any)=>b.opcode==='control_wait').map((b:any)=>b.inputs.DURATION[1][1]);
   assert.deepEqual(waits,lesson>=15?[String(WRIST.confirm)]:[],record.file);
  }
 }
});

// Values are read from the script, so check the design rules they must satisfy, not the numbers themselves.
test('hand-zone thresholds keep dead zones, stay on stage, avoid the cover badge, and every lesson matches the script',async()=>{
 for(const [landmark,z] of Object.entries<any>(ZONES_BY_LANDMARK)){
  assert.ok(z.left<-z.readyX-20&&z.right>z.readyX+20,`landmark ${landmark}: left/right must clear the 預備區 by > 20`);
  assert.ok(z.raise-z.readyY>=60,`landmark ${landmark}: 預備 and 舉高 need a dead zone ≥ 60`);
  assert.ok(z.right<240&&z.left>-240&&z.raise<180&&z.readyY>-180,`landmark ${landmark}: zones must be reachable on stage`);
 }
 for(const file of (await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort()){
  const zip=await JSZip.loadAsync(await readFile('examples/web/'+file)),project=JSON.parse(await zip.file('project.json').async('string'));
  const dims=await readBoxDims(zip,project);
  assert.equal(applyZones(project,dims),0,`${file} is out of sync with scripts/handpose-lessons.cjs; run npm run examples:handpose`);
  const zone=project.targets.find((t:any)=>t.name==='預備區');if(!zone)continue;
  // The drawn box must match the 預備 rule (within rounding) and use whole numbers students can read.
  const zones=ZONES_BY_LANDMARK[Object.values<any>(project.targets.find((t:any)=>t.name==='AI偵測').blocks).find((b:any)=>b.opcode==='handpose2scratch_menu_landmark').fields.landmark[0]];
  const costume=zone.costumes[zone.currentCostume],scale=zone.size/100,[width,height]=dims;
  const left=zone.x-costume.rotationCenterX*scale,right=zone.x+(width-costume.rotationCenterX)*scale,top=zone.y+costume.rotationCenterY*scale,bottom=top-height*scale;
  assert.ok(Math.abs(left+zones.readyX)<1&&Math.abs(right-zones.readyX)<1&&Math.abs(top-zones.readyY)<1,`${file}: 預備區 box [${left},${right}]x${top} does not match the 預備 rule`);
  assert.ok(Number.isInteger(zone.x)&&Number.isInteger(zone.y)&&Number.isInteger(zone.size*10),`${file}: 預備區 position should be whole numbers and size at most one decimal`);
  for(const backdrop of project.targets.find((t:any)=>t.isStage).costumes){
   // Badge top in stage units: its group offset plus the rect's own y, minus half the stroke; keep a 3-unit gap.
   const svg=await zip.file(backdrop.md5ext).async('string'),badge=/<g transform="translate\([\d.]+,([\d.]+)\)"><rect[^>]*?\by="([\d.-]+)"[^>]*?stroke-width="([\d.]+)"(?:(?!<\/g>)[\s\S])*BY-NC/.exec(svg);
   if(/BY-NC/.test(svg))assert.ok(badge,`${file}: cannot locate the license badge on ${backdrop.name}`);
   if(badge){const badgeTop=backdrop.rotationCenterY-(Number(badge[1])+Number(badge[2])-Number(badge[3])/2);assert.ok(bottom>=badgeTop+3,`${file}: 預備區 bottom ${bottom} is within 3 of the license badge (${badgeTop}) on ${backdrop.name}`);}
  }
 }
});
