import {test,after,before} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,copyFile,symlink,mkdir,rm,readFile,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {getCatalog,readExample,inside} from '../lib/server/example-catalog';import {validateSB3} from '../lib/server/sb3';
let root:string;const original=process.env.SCRATCH_EXAMPLES_DIR;
before(async()=>{root=await mkdtemp(path.join(tmpdir(),'ollie-catalog-'));});
after(async()=>{if(original===undefined)delete process.env.SCRATCH_EXAMPLES_DIR;else process.env.SCRATCH_EXAMPLES_DIR=original;await rm(root,{recursive:true,force:true});});
test('catalog states and boundary / unchanged binary / corrupt isolation',async()=>{
 delete process.env.SCRATCH_EXAMPLES_DIR;assert.equal((await getCatalog()).status,'ready');assert.equal((await getCatalog()).examples.length,28);
 process.env.SCRATCH_EXAMPLES_DIR='';assert.equal((await getCatalog()).status,'unconfigured');
 process.env.SCRATCH_EXAMPLES_DIR=path.join(root,'missing');assert.equal((await getCatalog()).status,'missing');
 const allowed=path.join(root,'examples');await mkdir(allowed);process.env.SCRATCH_EXAMPLES_DIR=allowed;assert.equal((await getCatalog()).status,'empty');
 await chmod(allowed,0);try { assert.equal((await getCatalog()).status,'denied'); } finally { await chmod(allowed,0o700); }
 await copyFile('tests/fixtures/minimal.sb3',path.join(allowed,'02.sb3'));await copyFile('tests/fixtures/invalid.sb3',path.join(allowed,'01.sb3'));
 await copyFile('tests/fixtures/minimal.sb3',path.join(root,'secret.sb3'));await symlink(path.join(root,'secret.sb3'),path.join(allowed,'outside.sb3'));
 await mkdir(path.join(allowed,'sub'));await copyFile('tests/fixtures/minimal.sb3',path.join(allowed,'sub','03.sb3'));
 let c=await getCatalog();assert.equal(c.examples.length,2);assert.deepEqual(c.examples.map(e=>e.title),['01','02']);assert.ok(!JSON.stringify(c).includes(root));
 await assert.rejects(readExample(c.examples[0].id),/SB3 格式/);assert.deepEqual(await readExample(c.examples[1].id),await readFile('tests/fixtures/minimal.sb3'));
 for(const id of ['../secret.sb3','%2e%2e','/etc/passwd','0'.repeat(64)])await assert.rejects(readExample(id));
 assert.equal(inside(allowed,allowed+'-other/x.sb3'),false);
 process.env.SCRATCH_EXAMPLES_RECURSIVE='true';assert.equal((await getCatalog()).examples.length,3);delete process.env.SCRATCH_EXAMPLES_RECURSIVE;
 process.env.SCRATCH_EXAMPLES_MAX_MB='0.00001';await assert.rejects(readExample(c.examples[1].id),/大小/);delete process.env.SCRATCH_EXAMPLES_MAX_MB;
 await rm(path.join(allowed,'02.sb3'));assert.equal((await getCatalog()).examples.length,1);
});
test('ZIP validation rejects missing project / unsupported IDs and accepts real fixture',async()=>{
 assert.deepEqual((await validateSB3(await readFile('tests/fixtures/music.sb3'))).extensions,['music']);
 await assert.rejects(validateSB3(await readFile('tests/fixtures/unsupported.sb3')),/extension 相容性.*videoSensing/);
 await assert.rejects(validateSB3(Buffer.from('bad')),/ZIP/);
});
