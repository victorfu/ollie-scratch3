import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');

// Static references the VM would silently tolerate: a wrong costume name or variable id just misbehaves at runtime.
test('every lesson asset, block link, variable, list, broadcast, costume and sound reference resolves',async()=>{
 const files=(await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort();
 for(const file of files){
  const zip=await JSZip.loadAsync(await readFile('examples/web/'+file)),project=JSON.parse(await zip.file('project.json').async('string'));
  const stage=project.targets.find((t:any)=>t.isStage),problems:string[]=[];
  const ids=(o:any)=>new Map(Object.entries<any>(o||{}).map(([id,v])=>[id,v[0]]));
  const broadcasts=new Map(Object.entries<string>(stage.broadcasts||{})),backdrops=new Set(stage.costumes.map((c:any)=>c.name));
  const sent=new Set<string>(),received=new Set<string>();
  for(const t of project.targets){
   for(const a of [...t.costumes,...t.sounds]){
    const entry=zip.file(a.md5ext);
    if(!entry){problems.push(`${t.name} ${a.name} missing ${a.md5ext}`);continue;}
    if(createHash('md5').update(await entry.async('nodebuffer')).digest('hex')!==a.assetId)problems.push(`${t.name} ${a.name} md5 mismatch`);
   }
   const vars=new Map([...ids(stage.variables),...ids(t.variables)]),lists=new Map([...ids(stage.lists),...ids(t.lists)]);
   const costumes=new Set(t.costumes.map((c:any)=>c.name)),sounds=new Set(t.sounds.map((s:any)=>s.name)),B=t.blocks;
   const ref=(where:string,v:any)=>{
    if(v[0]===12&&vars.get(v[2])!==v[1])problems.push(`${where} variable ${v[1]}`);
    if(v[0]===13&&lists.get(v[2])!==v[1])problems.push(`${where} list ${v[1]}`);
    if(v[0]===11){if(broadcasts.get(v[2])!==v[1])problems.push(`${where} broadcast ${v[1]}`);sent.add(v[1]);}
   };
   for(const [id,b] of Object.entries<any>(B)){
    const where=`${t.name} ${id}`;
    if(Array.isArray(b)){ref(where,b);continue;}
    if(b.next&&B[b.next]?.parent!==id)problems.push(`${where} next link`);
    if(b.parent){const p=B[b.parent];if(!p||![p.next,...Object.values<any>(p.inputs).flatMap(i=>i.slice(1))].includes(id))problems.push(`${where} parent link`);}
    else if(!b.topLevel)problems.push(`${where} orphan`);
    for(const input of Object.values<any>(b.inputs))for(const v of input.slice(1)){
     if(typeof v==='string'&&!B[v])problems.push(`${where} input -> missing ${v}`);
     if(Array.isArray(v))ref(where,v);
    }
    const f=b.fields;
    if(f.VARIABLE&&vars.get(f.VARIABLE[1])!==f.VARIABLE[0])problems.push(`${where} VARIABLE ${f.VARIABLE[0]}`);
    if(f.LIST&&lists.get(f.LIST[1])!==f.LIST[0])problems.push(`${where} LIST ${f.LIST[0]}`);
    if(f.BROADCAST_OPTION){if(broadcasts.get(f.BROADCAST_OPTION[1])!==f.BROADCAST_OPTION[0])problems.push(`${where} receive ${f.BROADCAST_OPTION[0]}`);received.add(f.BROADCAST_OPTION[0]);}
    if(b.opcode==='looks_costume'&&!costumes.has(f.COSTUME[0]))problems.push(`${where} costume ${f.COSTUME[0]}`);
    if(b.opcode==='looks_backdrops'&&!backdrops.has(f.BACKDROP[0]))problems.push(`${where} backdrop ${f.BACKDROP[0]}`);
    if(b.opcode==='sound_sounds_menu'&&!sounds.has(f.SOUND_MENU[0]))problems.push(`${where} sound ${f.SOUND_MENU[0]}`);
    if(b.comment&&t.comments?.[b.comment]?.blockId!==id)problems.push(`${where} comment link`);
   }
  }
  for(const m of sent)if(!received.has(m))problems.push(`broadcast ${m} has no receiver`);
  for(const m of received)if(!sent.has(m))problems.push(`broadcast ${m} is never sent`);
  assert.deepEqual(problems,[],file);
 }
});

// The competition only allows official Scratch blocks plus the official Music, Pen and Handpose2Scratch
// extensions: no blocks of our own, neither added extension blocks nor custom blocks (My Blocks).
const OFFICIAL_HANDPOSE=new Set(['getX','getY','getZ','videoToggle','setVideoTransparency','setRatio','menu_landmark','menu_videoMenu','menu_ratioMenu']);
const CORE=new Set(['motion','looks','sound','event','control','sensing','operator','data','note','music','pen','handpose2scratch']);
test('lessons use only official Scratch blocks plus Music, Pen and Handpose2Scratch, and no custom blocks',async()=>{
 for(const file of (await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort()){
  const project=JSON.parse(await (await JSZip.loadAsync(await readFile('examples/web/'+file))).file('project.json').async('string'));
  assert.ok((project.extensions||[]).every((e:string)=>['handpose2scratch','music','pen'].includes(e)),`${file}: ${project.extensions}`);
  for(const t of project.targets)for(const b of Object.values<any>(t.blocks)){
   if(Array.isArray(b))continue;
   const prefix=b.opcode.split('_')[0];
   assert.ok(CORE.has(prefix),`${file}: ${t.name} uses ${b.opcode} (custom blocks and other extensions are not allowed)`);
   if(prefix==='handpose2scratch')assert.ok(OFFICIAL_HANDPOSE.has(b.opcode.slice('handpose2scratch_'.length)),`${file}: ${t.name} uses non-official ${b.opcode}`);
  }
 }
});

// The host stands top-left and its speech bubbles cover that corner: no visible monitor may sit there.
test('no variable or list monitor sits under the host speech bubble',async()=>{
 for(const file of (await readdir('examples/web')).filter(f=>f.endsWith('.sb3')).sort()){
  const project=JSON.parse(await (await JSZip.loadAsync(await readFile('examples/web/'+file))).file('project.json').async('string'));
  for(const m of project.monitors.filter((m:any)=>m.visible))
   assert.ok(!(m.x<200&&m.y<120),`${file}: ${m.params.VARIABLE||m.params.LIST} at (${m.x},${m.y}) is hidden by the host's speech bubble`);
 }
});
