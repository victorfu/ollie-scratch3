import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,mkdir,chmod,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateSB3} from '../lib/server/sb3';
import {getCatalog} from '../lib/server/example-catalog';
import {allowedHost,guardRequest} from '../lib/server/request-guard';
import {projectFilename,errorMessage} from '../vendor/scratch-editor/src/shared';
import {editorFingerprint} from '../scripts/editor-fingerprint.mjs';
import {validMessage,envelope} from '../lib/protocol';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
const parser=load('./vendor/scratch-editor/node_modules/scratch-parser');
const parse=(bytes:Buffer)=>new Promise<any>((resolve,reject)=>parser(bytes,false,(e:any,result:any)=>e?reject(e):resolve(result[0])));

test('validator and VM parser agree on one project, reject both ambiguity orders',async()=>{
 const base=await JSZip.loadAsync(await readFile('tests/fixtures/minimal.sb3'));
 const normal=JSON.parse(await base.file('project.json').async('string')),other=structuredClone(normal);other.extensions=['videoSensing'];
 for(const nestedFirst of [true,false]){
  const zip=new JSZip();if(nestedFirst)zip.file('x/project.json',JSON.stringify(other));
  for(const [name,entry]of Object.entries(base.files) as any)if(!entry.dir)zip.file(name,await entry.async('nodebuffer'));
  if(!nestedFirst)zip.file('x/project.json',JSON.stringify(other));
  await assert.rejects(validateSB3(await zip.generateAsync({type:'nodebuffer'})),/多份 project.json/);
 }
 const folder=new JSZip();for(const [name,entry]of Object.entries(base.files) as any)if(!entry.dir)folder.file('folder/'+name,await entry.async('nodebuffer'));
 const bytes=await folder.generateAsync({type:'nodebuffer'});assert.deepEqual(await validateSB3(bytes),{extensions:[]});assert.equal((await parse(bytes)).targets.length,normal.targets.length);
 folder.file('folder/project.json',JSON.stringify(other));await assert.rejects(validateSB3(await folder.generateAsync({type:'nodebuffer'})),/不支援 videoSensing/);
});
test('Host guard rejects rebinding hosts before origin checks and permits explicit deployments',()=>{
 for(const host of ['localhost','localhost:3000','127.0.0.1:3103','[::1]:3000'])assert.equal(allowedHost(host),true);
 for(const host of [null,'attacker.test:3000','localhost.attacker.test','localhost@attacker.test','localhost/','localhost,attacker','127.0.0.1:bad'])assert.equal(allowedHost(host),false);
 assert.equal(guardRequest(new Request('http://localhost/api/examples',{headers:{host:'attacker.test',origin:'http://attacker.test'}}))?.status,403);
 assert.equal(guardRequest(new Request("http://localhost/api/examples",{headers:{host:"localhost"}}),true)?.status,403);
 assert.equal(guardRequest(new Request('http://localhost/api/examples',{headers:{host:'localhost',origin:'http://attacker.test'}}))?.status,403);
 const prev=process.env.SCRATCH_ALLOWED_HOSTS;process.env.SCRATCH_ALLOWED_HOSTS='workshop.example';
 try{assert.ok(allowedHost('workshop.example:443'));assert.ok(!allowedHost('bad.workshop.example'));}finally{if(prev===undefined)delete process.env.SCRATCH_ALLOWED_HOSTS;else process.env.SCRATCH_ALLOWED_HOSTS=prev;}
});
test('Host guard trusts Vercel system hostnames only on Vercel',()=>{
 const keys=['VERCEL','VERCEL_URL','VERCEL_BRANCH_URL','VERCEL_PROJECT_PRODUCTION_URL'],prev=keys.map(k=>process.env[k]);
 Object.assign(process.env,{VERCEL_URL:'ollie-abc123.vercel.app',VERCEL_BRANCH_URL:'ollie-git-main.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'ollie.vercel.app'});
 try{
  delete process.env.VERCEL;assert.ok(!allowedHost('ollie.vercel.app'));
  process.env.VERCEL='1';for(const h of ['ollie-abc123.vercel.app','ollie-git-main.vercel.app','ollie.vercel.app:443'])assert.ok(allowedHost(h));
  assert.ok(!allowedHost('other.vercel.app'));
 }finally{keys.forEach((k,i)=>prev[i]===undefined?delete process.env[k]:process.env[k]=prev[i]);}
});
test('unreadable recursive subfolder produces a warning without dropping valid siblings',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ollie-recursive-')),prev=process.env.SCRATCH_EXAMPLES_DIR,recurse=process.env.SCRATCH_EXAMPLES_RECURSIVE;
 try{
  await writeFile(path.join(root,'valid.sb3'),await readFile('tests/fixtures/minimal.sb3'));await mkdir(path.join(root,'closed'));await chmod(path.join(root,'closed'),0);
  process.env.SCRATCH_EXAMPLES_DIR=root;process.env.SCRATCH_EXAMPLES_RECURSIVE='true';
  const catalog=await getCatalog();assert.equal(catalog.status,'ready');assert.equal(catalog.examples.length,1);assert.equal(catalog.warnings?.length,1);assert.ok(!JSON.stringify(catalog).includes(root));
 }finally{await chmod(path.join(root,'closed'),0o700);await rm(root,{recursive:true,force:true});if(prev===undefined)delete process.env.SCRATCH_EXAMPLES_DIR;else process.env.SCRATCH_EXAMPLES_DIR=prev;if(recurse===undefined)delete process.env.SCRATCH_EXAMPLES_RECURSIVE;else process.env.SCRATCH_EXAMPLES_RECURSIVE=recurse;}
});
test('shared names never produce a hidden or empty filename; errors accept VM strings',()=>{
 for(const title of ['',undefined,'  ','.','..',' . '])assert.equal(projectFilename(title),'Scratch作品.sb3');
 assert.equal(projectFilename('a/b:c'),'a_b_c.sb3');
 assert.equal(errorMessage('plain failure'),'plain failure');assert.equal(errorMessage(new Error('failure')),'failure');
 assert.match(errorMessage(JSON.stringify({validationError:'invalid project',sb3Errors:[{dataPath:'.targets[0]',message:'missing name'}]})),/作品結構不合法.*targets\[0\].*missing name/);
 assert.equal(errorMessage(undefined),'未提供錯誤原因');
});
test('fingerprint invalidates when the original upstream extension changes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ollie-fingerprint-'));
 try{
  for(const file of ['vendor/scratch-editor/source.cjs','vendor/scratch-editor/package.json','vendor/scratch-editor/package-lock.json','vendor/scratch-editor/prepare.cjs','vendor/scratch-editor/webpack.config.cjs','vendor/scratch-editor/src/editor.jsx','vendor/scratch-editor/upstream/handpose2scratch.js','lib/protocol.js','lib/sb3-validate.js','scripts/build-editor.mjs','scripts/editor-fingerprint.mjs','.nvmrc']){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),'original');}
  const before=editorFingerprint(root);await writeFile(path.join(root,'vendor/scratch-editor/upstream/handpose2scratch.js'),'updated upstream');assert.notEqual(editorFingerprint(root),before);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('prepared-load references are validated and obsolete commands are rejected',()=>{
 assert.ok(validMessage(envelope('prepare','s','r',{bytes:new ArrayBuffer(2),title:'test'})));
 assert.ok(validMessage(envelope('load','s','r',{preparedId:'valid',downloadFirst:false})));
 assert.ok(!validMessage(envelope('load','s','r',{preparedId:'',downloadFirst:false})));
 assert.ok(!validMessage(envelope('load','s','r',{preparedId:'x',bytes:new ArrayBuffer(2),title:'ambiguous',downloadFirst:false})));
 for(const type of ['dispose','camera-on','camera-off'])assert.ok(!validMessage(envelope(type,'s','r')));
});
