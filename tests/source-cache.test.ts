import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const load=createRequire(process.cwd()+'/package.json');
const {ensureGuiSource}=load('./vendor/scratch-editor/source.cjs');
const content=Buffer.from('pinned source archive'),commit='a'.repeat(40);
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'ollie-source-'));await mkdir(path.join(root,'upstream'));
 await writeFile(path.join(root,'upstream/scratch-gui-source.json'),JSON.stringify({commit,url:`https://codeload.github.com/scratchfoundation/scratch-gui/tar.gz/${commit}`,sha256:createHash('sha256').update(content).digest('hex'),archiveRoot:`scratch-gui-${commit}`}));return root;
}
test('verified source downloads once, works offline and replaces a corrupt cache',async()=>{
 const root=await fixture();let calls=0;const download=async()=>{calls++;return new Response(content);};
 try{
  const {archive}=await ensureGuiSource(root,download);assert.deepEqual(await readFile(archive),content);assert.equal(calls,1);
  await ensureGuiSource(root,()=>{throw Error('network must not be used on cache hit');});
  await writeFile(archive,'corrupted');await ensureGuiSource(root,download);assert.equal(calls,2);assert.deepEqual(await readFile(archive),content);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('checksum mismatch and HTTP failures never publish incomplete archives',async()=>{
 const root=await fixture();
 try{
  await assert.rejects(ensureGuiSource(root,async()=>new Response('wrong bytes')),/checksum mismatch/);
  assert.deepEqual(await readdir(path.join(root,'.cache')),[]);
  await assert.rejects(ensureGuiSource(root,async()=>new Response('unavailable',{status:503})),/HTTP 503/);
  assert.deepEqual(await readdir(path.join(root,'.cache')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
