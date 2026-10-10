// Apply the hand-zone thresholds to every Handpose lesson in examples/web (idempotent).
// Edit ZONES / ZONES_BY_LANDMARK (the 預備區 box and lesson 10's note follow), run `npm run examples:handpose`, then `npm run examples:index` and commit both.
// Only literal values are rewritten; block structure (docs/hand-tracking-fix.md) is untouched.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const JSZip=createRequire(path.resolve(__dirname,'../vendor/scratch-editor/package.json'))('jszip');

// Stage coordinates of landmark 10 (middle finger base). 預備 is |手X| < readyX and 手Y < readyY.
const ZONES={left:-90,right:90,raise:50,readyX:60,readyY:-20,hideAfter:0.2};
// The wrist (landmark 1) sits about 50 stage units below the middle finger base. readyY keeps its
// 預備區 box (-115..-35) clear of the cover's license badge, whose stroke reaches y=-119.
const ZONES_BY_LANDMARK={'10':ZONES,'1':{...ZONES,raise:40,readyY:-35}};
// The 預備區 box is derived from the 預備 rule: its sides sit at ±readyX and its top edge at readyY.
// `dims` is the costume's [width,height]; the rotation center may sit anywhere inside it.
// Size is rounded to 0.1% and position to whole numbers (each derived from the rounded size), so every
// edge stays within 0.5 + width·0.0005 (< 1) of the rule.
function zoneBox(zones,costume,[width]){
 const size=Math.round(2*zones.readyX/width*1000)/10,scale=size/100;
 return {size,x:Math.round(costume.rotationCenterX*scale-zones.readyX),y:Math.round(zones.readyY-costume.rotationCenterY*scale)};
}
// [width,height] of the 預備區 costume SVG, or null when the lesson has no 預備區.
async function readBoxDims(zip,project){
 const zone=project.targets.find(t=>t.name==='預備區');if(!zone)return null;
 const svg=await zip.file(zone.costumes[zone.currentCostume].md5ext).async('string');
 const view=/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg)||/width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
 if(!view)throw new Error('預備區 costume has no viewBox or width/height');
 return [Number(view[1]),Number(view[2])];
}
const readyNote=z=>`預備：手要放在下方中間（|手X| < ${z.readyX} 且 手Y < ${z.readyY}）。\n第 11 課會加上「預備區」方框標出這個範圍。`;
// Pick thresholds from the landmark the lesson actually reads, so they can't drift apart.
function zonesFor(project){
 const ai=project.targets.find(t=>t.name==='AI偵測');if(!ai)return null;
 const used=[...new Set(Object.values(ai.blocks).filter(b=>b&&b.opcode==='handpose2scratch_menu_landmark').map(b=>b.fields.landmark[0]))];
 if(used.length>1)throw new Error(`AI偵測 mixes landmarks ${used.join(', ')}`);
 if(!used.length)return null;
 const zones=ZONES_BY_LANDMARK[used[0]];if(!zones)throw new Error(`no thresholds for landmark ${used[0]}`);
 return zones;
}
module.exports={ZONES,ZONES_BY_LANDMARK,zonesFor,zoneBox,readBoxDims,readyNote};

const literal=(input,value)=>{const v=String(value);if(input[1][1]===v)return false;input[1][1]=v;return true;};
function applyZones(project,dims,zones=zonesFor(project)){
 const ai=project.targets.find(t=>t.name==='AI偵測');if(!ai||!zones)return 0;
 let changed=0;
 for(const [id,b] of Object.entries(ai.blocks)){
  if(!b||Array.isArray(b))continue;
  const o1=b.inputs.OPERAND1&&b.inputs.OPERAND1[1],o2=b.inputs.OPERAND2;
  if(id==='ollie_ready_abs_lt'){changed+=literal(o2,zones.readyX);continue;}
  if(id==='ollie_hand_hide_gt'){changed+=literal(o2,zones.hideAfter);continue;}
  if(!['operator_lt','operator_gt'].includes(b.opcode)||!Array.isArray(o1)||o1[0]!==12||!['手X','手Y'].includes(o1[1]))continue;
  const key=`${o1[1]}${b.opcode==='operator_lt'?'<':'>'}`;
  const value={'手X<':zones.left,'手X>':zones.right,'手Y>':zones.raise,'手Y<':zones.readyY}[key];
  if(value===undefined)throw new Error(`unexpected hand comparison ${id} ${key}`);
  changed+=literal(o2,value);
 }
 const note=ai.comments&&ai.comments.ollie_ready_note;
 if(note&&note.text!==readyNote(zones)){note.text=readyNote(zones);changed++;}
 const zone=project.targets.find(t=>t.name==='預備區');
 if(zone){
  if(!dims)throw new Error('lessons with a 預備區 need dims: applyZones(project, await readBoxDims(zip, project))');
  const blocks=Object.values(zone.blocks),goto=blocks.find(b=>b.opcode==='motion_gotoxy'),size=blocks.find(b=>b.opcode==='looks_setsizeto');
  if(!goto||!size)throw new Error('預備區 must have go to x:y and set size blocks');
  const box=zoneBox(zones,zone.costumes[zone.currentCostume],dims);
  changed+=literal(goto.inputs.X,box.x)+literal(goto.inputs.Y,box.y)+literal(size.inputs.SIZE,box.size);
  if(zone.x!==box.x||zone.y!==box.y||zone.size!==box.size){Object.assign(zone,box);changed++;}
 }
 return changed;
}
module.exports.applyZones=applyZones;

if(require.main===module)(async()=>{
 const root=path.resolve(__dirname,'../examples/web');
 for(const file of (await fs.readdir(root)).filter(f=>f.endsWith('.sb3')).sort()){
  const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,file)));
  const project=JSON.parse(await zip.file('project.json').async('string'));
  const changed=applyZones(project,await readBoxDims(zip,project));if(!changed)continue;
  zip.file('project.json',JSON.stringify(project));
  await fs.writeFile(path.join(root,file),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(`${file}: ${changed} value(s) updated`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
