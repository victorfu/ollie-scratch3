// Use a plain dark stage, the official Scratch Cat, and simple line-drawn dancer poses.
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const path=require('node:path');
const {createRequire}=require('node:module');
const JSZip=createRequire(path.resolve(__dirname,'../vendor/scratch-editor/package.json'))('jszip');
const FILE='第29課_簡化版.sb3';
module.exports={FILE};
const CAT=path.resolve(__dirname,'../vendor/scratch-editor/.generated/src/lib/default-project/bcf454acf82e4504149f7ffe07081dbc.svg');
// Stick-figure arms from the shoulders (85,78); every pose shares the same body and legs.
const POSES={預備:[[62,128],[108,128]],向左:[[22,70],[108,128]],向右:[[62,128],[148,70]],舉高:[[35,12],[135,12]]};
function stickFigure([left,right]){
 const line=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1} L${x2} ${y2}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="210" viewBox="0 0 170 210"><g fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${line(85,62,85,135)}${line(85,135,62,198)}${line(85,135,108,198)}${line(85,78,...left)}${line(85,78,...right)}<circle cx="85" cy="40" r="20"/></g></svg>`;
}
function svgCostume(name,data,rotationCenterX,rotationCenterY){
 const assetId=crypto.createHash('md5').update(data).digest('hex');
 return {costume:{name,bitmapResolution:1,dataFormat:'svg',assetId,md5ext:`${assetId}.svg`,rotationCenterX,rotationCenterY},data};
}
async function build(){
 const root=path.resolve(__dirname,'../examples/web');
 const source=await JSZip.loadAsync(await fs.readFile(path.join(root,'第28課_完成作品.sb3')));
 const p=JSON.parse(await source.file('project.json').async('string'));
 p.targets=p.targets.filter(t=>['Stage','主持人','舞者','AI偵測'].includes(t.name));
 for(const t of p.targets){t.blocks={};t.comments={};t.variables={};t.lists={};t.broadcasts={};t.sounds=[];t.currentCostume=0;}
 const [stage,host,dancer,ai]=p.targets;
 stage.broadcasts={show:'表演',response:'動作回應',new:'產生節奏',demo:'示範'};
 stage.lists={moves:['動作表',['向左','向右','舉高']],sequence:['節奏',[]]};
 const names=['手X','手Y','動作','題目','分數','連續答對','關卡','小關','第幾個','答錯'];
 for(const name of names)stage.variables[name]=[name,name==='動作'?'預備':0];
 const art=[svgCostume('Scratch 小貓',await fs.readFile(CAT).catch(()=>{throw new Error('Scratch Cat not found; run npm run setup first.');}),48,50)];
 host.costumes=[art[0].costume];host.size=130;
 art.push(svgCostume('暗色',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#1b1b2f"/></svg>'),240,180));
 stage.costumes=[art[1].costume];
 for(const [name,arms] of Object.entries(POSES))art.push(svgCostume(name,Buffer.from(stickFigure(arms)),85,110));
 dancer.costumes=art.slice(2).map(a=>a.costume);
 p.extensions=['handpose2scratch','music'];
 p.monitors=['動作','分數','關卡','連續答對'].map((name,i)=>({id:name,mode:'default',opcode:'data_variable',params:{VARIABLE:name},spriteName:null,value:stage.variables[name][1],width:0,height:0,x:10,y:235+i*28,visible:true,sliderMin:0,sliderMax:100,isDiscrete:true}));
 p.monitors.push({...p.monitors[2],id:'小關',params:{VARIABLE:'小關'},x:140});
 p.monitors.find(m=>m.id==='動作').visible=false;
 let B,serial=0;
 const lit=v=>[1,[typeof v==='number'?4:10,String(v)]];
 const variable=name=>[3,[12,name,name],[10,'']];
 function block(opcode,inputs={},fields={},shadow=false){const id=`simple_${++serial}`;B[id]={opcode,next:null,parent:null,inputs,fields,shadow,topLevel:false};for(const input of Object.values(inputs))for(const child of input.slice(1))if(typeof child==='string')B[child].parent=id;return id;}
 const ref=id=>[2,id];
 const expr=(op,a,b)=>ref(block(`operator_${op}`,{OPERAND1:a,OPERAND2:b}));
 function chain(...ids){for(let i=1;i<ids.length;i++){B[ids[i-1]].next=ids[i];B[ids[i]].parent=ids[i-1];}return ids[0];}
 function script(hat,body,x=30,y=30){B[hat].topLevel=true;B[hat].x=x;B[hat].y=y;chain(hat,body);}
 const set=(name,value)=>block('data_setvariableto',{VALUE:value},{VARIABLE:[name,name]});
 const say=(message,secs)=>block(secs===undefined?'looks_say':'looks_sayforsecs',{MESSAGE:typeof message==='string'?lit(message):message,...(secs===undefined?{}:{SECS:lit(secs)})});
 const wait=condition=>block('control_wait_until',{CONDITION:condition});
 const branch=(condition,body,otherwise)=>block(otherwise?'control_if_else':'control_if',{CONDITION:condition,SUBSTACK:ref(body),...(otherwise?{SUBSTACK2:ref(otherwise)}:{})});
 const eq=(name,value)=>expr('equals',variable(name),lit(value));
 B=ai.blocks;
 const coord=axis=>{const menu=block('handpose2scratch_menu_landmark',{}, {landmark:['1',null]},true);return ref(block(`handpose2scratch_get${axis}`,{LANDMARK:[1,menu]}));};
 const abs=value=>ref(block('operator_mathop',{NUM:value},{OPERATOR:['abs',null]}));
 const moved=expr('or',
  expr('gt',abs(ref(block('operator_subtract',{NUM1:variable('手X'),NUM2:ref(block('motion_xposition'))}))),lit(2)),
  expr('gt',abs(ref(block('operator_subtract',{NUM1:variable('手Y'),NUM2:ref(block('motion_yposition'))}))),lit(2)));
 const loop=chain(set('手X',coord('X')),set('手Y',coord('Y')),set('動作',lit('預備')),
  branch(expr('lt',variable('手X'),lit(-100)),set('動作',lit('向左'))),
  branch(expr('gt',variable('手X'),lit(100)),set('動作',lit('向右'))),
  branch(expr('gt',variable('手Y'),lit(80)),set('動作',lit('舉高'))),
  block('control_wait',{DURATION:lit(0)}));
 script(block('event_whenflagclicked'),chain(set('動作',lit('預備')),block('handpose2scratch_setVideoTransparency',{TRANSPARENCY:lit(40)}),block('control_forever',{SUBSTACK:ref(loop)})));
 script(block('event_whenflagclicked'),block('control_forever',{SUBSTACK:ref(chain(
  branch(moved,block('motion_gotoxy',{X:variable('手X'),Y:variable('手Y')})),
  block('control_wait',{DURATION:lit(0.05)})))}),850,30);
 const broadcast=(name,id,wait=true)=>block(wait?'event_broadcastandwait':'event_broadcast',{BROADCAST_INPUT:[1,[11,name,id]]});
 const receive=(name,id)=>block('event_whenbroadcastreceived',{}, {BROADCAST_OPTION:[name,id]});
 const pause=secs=>block('control_wait',{DURATION:lit(secs)});
 const change=(name,n)=>block('data_changevariableby',{VALUE:lit(n)},{VARIABLE:[name,name]});
 const length=()=>ref(block('data_lengthoflist',{}, {LIST:['節奏','sequence']}));
 const item=()=>ref(block('data_itemoflist',{INDEX:variable('第幾個')},{LIST:['節奏','sequence']}));
 const append=()=>block('data_addtolist',{ITEM:ref(block('data_itemoflist',{INDEX:ref(block('operator_random',{FROM:lit(1),TO:lit(3)}))},{LIST:['動作表','moves']}))},{LIST:['節奏','sequence']});
 B=dancer.blocks;
 const costume=name=>{const menu=block('looks_costume',{}, {COSTUME:['預備',null]},true);return block('looks_switchcostumeto',{COSTUME:name?[3,[12,name,name],menu]:[1,menu]});};
 const playNote=(number,beats)=>block('music_playNoteForBeats',{NOTE:[1,block('note',{}, {NOTE:[String(number),null]},true)],BEATS:lit(beats)});
 // Pick one note before it yields, so a newer answer cannot fall through to another note.
 const playMove=beats=>branch(eq('題目','向左'),playNote(60,beats),
  branch(eq('題目','向右'),playNote(64,beats),branch(eq('題目','舉高'),playNote(67,beats))));
 const instrument=block('music_menu_INSTRUMENT',{}, {INSTRUMENT:['1',null]},true);
 script(block('event_whenflagclicked'),chain(block('music_setInstrument',{INSTRUMENT:[1,instrument]}),block('music_setTempo',{TEMPO:lit(60)})),850,30);
 script(receive('表演','show'),chain(costume('題目'),playMove(0.5),pause(0.1),costume(),pause(0.3)));
 script(receive('動作回應','response'),chain(costume('題目'),playMove(0.12),costume()),30,900);
 B=host.blocks;
 const answer=chain(say('先把手移回中間偏下，回到「預備」。'),wait(eq('動作','預備')),say('換你了！做下一個動作。'),
  wait(ref(block('operator_not',{OPERAND:eq('動作','預備')}))),set('題目',variable('動作')),broadcast('動作回應','response',false),
  branch(expr('equals',variable('題目'),item()),change('第幾個',1),set('答錯',lit(1))));
 const correct=chain(change('分數',10),change('連續答對',1),
  branch(expr('gt',variable('連續答對'),lit(1)),chain(change('分數',5),say('連續答對！另外加 5 分。',1.5))),
  say('完成一輪！得到 10 分。',1.5),
  branch(eq('關卡',1),
   branch(eq('小關',3),chain(set('關卡',lit(2)),set('小關',lit(1)),say('第二關：節奏接龍！從 2 個接到 4 個。',3),broadcast('產生節奏','new')),
    chain(change('小關',1),say('小關過關！再記一組新的動作。',2),broadcast('產生節奏','new'))),
   branch(expr('equals',length(),lit(4)),set('關卡',lit('完成')),chain(change('小關',1),append(),say('再加一個動作！',1.5)))));
 const round=chain(set('答錯',lit(0)),broadcast('示範','demo'),set('第幾個',lit(1)),
  block('control_repeat_until',{CONDITION:expr('or',eq('答錯',1),expr('gt',variable('第幾個'),length())),SUBSTACK:ref(answer)}),
  branch(eq('答錯',1),chain(set('連續答對',lit(0)),say('沒關係！分數保留，同一輪再試一次。',2)),correct));
 const total=ref(block('operator_join',{STRING1:lit('兩關都過了！總分：'),STRING2:variable('分數')}));
 script(block('event_whenflagclicked'),chain(set('分數',lit(0)),set('連續答對',lit(0)),set('關卡',lit(1)),set('小關',lit(1)),
  say('手移到左、右、上方；每個動作前先回中間偏下。',4),say('第一關共 3 小關：每次記住 3 個動作！',3),broadcast('產生節奏','new'),
  block('control_repeat_until',{CONDITION:eq('關卡','完成'),SUBSTACK:ref(round)}),say(total,5),block('control_stop',{}, {STOP_OPTION:['all',null]})));
 script(receive('產生節奏','new'),chain(block('data_deletealloflist',{}, {LIST:['節奏','sequence']}),branch(eq('關卡',1),block('control_repeat',{TIMES:lit(3),SUBSTACK:ref(append())}),block('control_repeat',{TIMES:lit(2),SUBSTACK:ref(append())}))),850,30);
 script(receive('示範','demo'),chain(say('看舞者示範，記住動作順序！',2),set('第幾個',lit(1)),
  block('control_repeat',{TIMES:length(),SUBSTACK:ref(chain(set('題目',item()),broadcast('表演','show'),change('第幾個',1)))})),850,650);
 const zip=new JSZip();zip.file('project.json',JSON.stringify(p));
 for(const t of p.targets)for(const c of t.costumes)zip.file(c.md5ext,art.find(a=>a.costume.md5ext===c.md5ext)?.data??await source.file(c.md5ext).async('nodebuffer'));
 await fs.writeFile(path.join(root,FILE),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 console.log(`Created ${FILE}: ${serial} blocks, ${names.length} variables`);
}
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
