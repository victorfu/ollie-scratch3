import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {validateSB3} from '../lib/server/sb3';
const load=createRequire(process.cwd()+'/package.json'),JSZip=load('./vendor/scratch-editor/node_modules/jszip');
test('missing project and damaged entry CRC are rejected before the VM',async()=>{
 const zip=new JSZip();zip.file('unrelated.txt','test');await assert.rejects(validateSB3(await zip.generateAsync({type:'nodebuffer'})),/project.json/);
 const damaged=Buffer.from(await readFile('tests/fixtures/minimal.sb3'));
 const offset=30+damaged.readUInt16LE(26)+damaged.readUInt16LE(28);damaged[offset]^=1;
 await assert.rejects(validateSB3(damaged),/CRC/);
});
