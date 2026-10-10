import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const library=path.join(root,'examples/web');
const manifest=JSON.parse(await readFile(path.join(library,'manifest.json'),'utf8'));
const actual=(await readdir(library)).filter(f=>f.endsWith('.sb3')).sort();
const indexed=manifest.files.map(x=>x.file).sort();
if(JSON.stringify(actual)!==JSON.stringify(indexed))throw Error('Example manifest is out of date; run npm run examples:index');
for(const item of manifest.files){
 const bytes=await readFile(path.join(library,item.file));
 if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Example checksum mismatch: ${item.file}; run npm run examples:index`);
}
for(const route of ['api/examples','api/examples/[id]/project']){
 const trace=path.join(root,'.next/server/app',route,'route.js.nft.json');
 const files=new Set(JSON.parse(await readFile(trace,'utf8')).files.map(file=>path.resolve(path.dirname(trace),file)));
 for(const name of [...actual,'manifest.json'])if(!files.has(path.join(library,name)))throw Error(`Missing deployment trace: ${route} -> ${name}`);
}
const html=await readFile(path.join(root,'public/scratch-editor/index.html'),'utf8');
const scripts=[...html.matchAll(/src="(\/scratch-editor\/[^"?]+\.js)"/g)];
if(!scripts.length)throw Error('Scratch editor entry script is missing');
for(const [,url]of scripts)await access(path.join(root,'public',url));
for(const name of ['extension-worker.js'])await access(path.join(root,'public/scratch-editor',name));
console.log(`Deployment assets verified: ${actual.length} SB3 examples in both API traces; Scratch editor assets present.`);
