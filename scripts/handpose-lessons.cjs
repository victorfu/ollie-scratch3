// Apply the hand-gesture thresholds to every Handpose lesson in examples/web (idempotent).
// Edit GESTURE, run `npm run examples:handpose`, then `npm run examples:index` and commit both.
// Only literal values and the lesson note are rewritten; block structure is in docs/hand-tracking-fix.md.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const JSZip=createRequire(path.resolve(__dirname,'../vendor/scratch-editor/package.json'))('jszip');

// Gestures read the wrist (1), middle finger base (10) and tip (13) with the official x/y blocks.
// 指尖距離 / 指根距離 below `fist` = 握拳 (預備); above `open` = open hand, whose wrist→tip direction
// must beat the other axis by `direction`× to count; `minBase` skips empty or tiny hands;
// `confirm` is how long an action must hold before 動作成立 (lessons 15+).
const GESTURE={fist:1.3,open:1.6,direction:1.5,minBase:10,confirm:0.15};
const LANDMARKS='1,10,13';
module.exports={GESTURE,LANDMARKS};

const MOVES=[['g_set_up','手指朝上＝舉高'],['g_set_left','朝左＝向左'],['g_set_right','朝右＝向右']];
const gestureNote=(z,moves)=>`手勢判斷（只用官方積木）：\n握拳＝預備；手張開時，${moves.join('、')}。\n方向＝手腕(1)→中指尖(13)；握拳看「指尖距離」是否小於「指根距離」(手腕→中指根部(10)) 的 ${z.fist} 倍。\n用的是比例，手離鏡頭遠近都一樣。手離開畫面時官方擴充會保留最後的座標，所以只在「方向X」有變化（有新畫面）時才判斷。`;
module.exports.gestureNote=gestureNote;

const literal=(input,value)=>{const v=String(value);if(input[1][1]===v)return false;input[1][1]=v;return true;};
// Returns the number of values changed (0 for lessons without gesture blocks or already in sync).
function applyGesture(project,z=GESTURE){
 const ai=project.targets.find(t=>t.name==='AI偵測');if(!ai)return 0;
 const B=ai.blocks;let changed=0;
 for(const b of Object.values(B)){
  const parent=b&&B[b.parent];
  if(b&&b.opcode==='control_wait'&&parent&&parent.opcode==='data_setvariableto'&&parent.fields.VARIABLE[0]==='確認動作')changed+=literal(b.inputs.DURATION,z.confirm);
 }
 if(!B.g_if_hand)return changed;
 const used=[...new Set(Object.values(B).filter(b=>b&&b.opcode==='handpose2scratch_menu_landmark').map(b=>b.fields.landmark[0]))].sort((a,b)=>a-b).join(',');
 if(used!==LANDMARKS)throw new Error(`gesture lesson must read landmarks ${LANDMARKS}, found ${used}`);
 changed+=literal(B.g_fist_t.inputs.NUM2,z.fist)+literal(B.g_open_t.inputs.NUM2,z.open)+literal(B.g_has_hand.inputs.OPERAND2,z.minBase)+literal(B.g_up_t.inputs.NUM2,z.direction);
 if(B.g_left_t)changed+=literal(B.g_left_t.inputs.NUM2,-z.direction);
 if(B.g_right_t)changed+=literal(B.g_right_t.inputs.NUM2,z.direction);
 const note=ai.comments&&ai.comments.g_note,text=gestureNote(z,MOVES.filter(([id])=>B[id]).map(([,t])=>t));
 if(note&&note.text!==text){note.text=text;changed++;}
 return changed;
}
module.exports.applyGesture=applyGesture;

if(require.main===module)(async()=>{
 const root=path.resolve(__dirname,'../examples/web');
 for(const file of (await fs.readdir(root)).filter(f=>f.endsWith('.sb3')).sort()){
  const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,file)));
  const project=JSON.parse(await zip.file('project.json').async('string'));
  const changed=applyGesture(project);if(!changed)continue;
  zip.file('project.json',JSON.stringify(project));
  await fs.writeFile(path.join(root,file),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(`${file}: ${changed} value(s) updated`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
