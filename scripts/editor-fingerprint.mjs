import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
function tree(root,relative) {
 return readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry=>{
  const child=path.join(relative,entry.name);return entry.isDirectory()?tree(root,child):[child];
 });
}
export function editorFingerprint(root) {
 const vendor='vendor/scratch-editor';
 const files=[`${vendor}/source.cjs`,`${vendor}/package.json`,`${vendor}/package-lock.json`,`${vendor}/prepare.cjs`,`${vendor}/webpack.config.cjs`,
  ...tree(root,`${vendor}/src`),...tree(root,`${vendor}/upstream`),'lib/protocol.js','scripts/build-editor.mjs','scripts/editor-fingerprint.mjs','.nvmrc'].sort();
 const hash=createHash('sha256');
 for(const file of files){const bytes=readFileSync(path.join(root,file));hash.update(`${file}\0${bytes.length}\0`);hash.update(bytes);}
 hash.update(process.version);
 return hash.digest('hex');
}
