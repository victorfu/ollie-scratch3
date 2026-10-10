// Apply the hand-zone thresholds to every Handpose lesson in examples/web (idempotent).
// Edit ZONES, run `npm run examples:handpose`, then `npm run examples:index` and commit both.
// Only literal values are rewritten; block structure (docs/hand-tracking-fix.md) is untouched.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const JSZip=createRequire(path.resolve(__dirname,'../vendor/scratch-editor/package.json'))('jszip');

// Stage coordinates of landmark 10 (middle finger base). 預備區 box: size% of the 240x160 costume.
const ZONES={left:-90,right:90,raise:50,readyX:60,readyY:-20,boxY:-60,boxSize:50,hideAfter:0.2};
module.exports={ZONES};

const literal=(input,value)=>{const v=String(value);if(input[1][1]===v)return false;input[1][1]=v;return true;};
function applyZones(project){
 const ai=project.targets.find(t=>t.name==='AI偵測');if(!ai)return 0;
 let changed=0;
 for(const [id,b] of Object.entries(ai.blocks)){
  if(!b||Array.isArray(b))continue;
  const o1=b.inputs.OPERAND1&&b.inputs.OPERAND1[1],o2=b.inputs.OPERAND2;
  if(id==='ollie_ready_abs_lt'){changed+=literal(o2,ZONES.readyX);continue;}
  if(id==='ollie_hand_hide_gt'){changed+=literal(o2,ZONES.hideAfter);continue;}
  if(!['operator_lt','operator_gt'].includes(b.opcode)||!Array.isArray(o1)||o1[0]!==12||!['手X','手Y'].includes(o1[1]))continue;
  const key=`${o1[1]}${b.opcode==='operator_lt'?'<':'>'}`;
  const value={'手X<':ZONES.left,'手X>':ZONES.right,'手Y>':ZONES.raise,'手Y<':ZONES.readyY}[key];
  if(value===undefined)throw new Error(`unexpected hand comparison ${id} ${key}`);
  changed+=literal(o2,value);
 }
 const zone=project.targets.find(t=>t.name==='預備區');
 if(zone){
  const blocks=Object.values(zone.blocks),goto=blocks.find(b=>b.opcode==='motion_gotoxy'),size=blocks.find(b=>b.opcode==='looks_setsizeto');
  if(!goto||!size)throw new Error('預備區 must have go to x:y and set size blocks');
  changed+=literal(goto.inputs.Y,ZONES.boxY)+literal(size.inputs.SIZE,ZONES.boxSize);
  if(zone.y!==ZONES.boxY||zone.size!==ZONES.boxSize){zone.y=ZONES.boxY;zone.size=ZONES.boxSize;changed++;}
 }
 return changed;
}
module.exports.applyZones=applyZones;

if(require.main===module)(async()=>{
 const root=path.resolve(__dirname,'../examples/web');
 for(const file of (await fs.readdir(root)).filter(f=>f.endsWith('.sb3')).sort()){
  const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,file)));
  const project=JSON.parse(await zip.file('project.json').async('string'));
  const changed=applyZones(project);if(!changed)continue;
  zip.file('project.json',JSON.stringify(project));
  await fs.writeFile(path.join(root,file),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(`${file}: ${changed} value(s) updated`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
