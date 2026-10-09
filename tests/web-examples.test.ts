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
  }
 }
});
