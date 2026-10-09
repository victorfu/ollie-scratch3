import {editorFingerprint} from './editor-fingerprint.mjs';
import {readFileSync,existsSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'vendor/scratch-editor');
const hash=editorFingerprint(root),file=path.join(root,'public/scratch-editor/build-id');
if(process.argv.includes('--if-needed') && existsSync(file) && readFileSync(file,'utf8')===hash) process.exit(0);
if(!existsSync(path.join(dir,'node_modules/webpack'))) throw Error('請先執行 npm ci --prefix vendor/scratch-editor');
for(const args of [['prepare.cjs'],['node_modules/webpack-cli/bin/cli.js','--config','webpack.config.cjs']]) {
 const r=spawnSync(process.execPath,args,{cwd:dir,stdio:'inherit',env:{...process.env,NODE_OPTIONS:'--openssl-legacy-provider --max-old-space-size=8192'}});if(r.status!==0) process.exit(r.status||1);
 if(args[0]==='prepare.cjs') {rmSync(path.join(root,'public/scratch-editor'),{recursive:true,force:true});mkdirSync(path.join(root,'public/scratch-editor'),{recursive:true});}
}
writeFileSync(file,hash);
