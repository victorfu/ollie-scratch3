// Update the integrity manifest for the canonical, versioned library.
// Never rewrites an SB3. Commit this manifest together with changed examples.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'../examples/web');
 const names=(await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isFile()&&e.name.toLowerCase().endsWith('.sb3')).map(e=>e.name).sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
 const files=[];for(const file of names)files.push({file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')});
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({version:1,files},null,2)+'\n');
 console.log(`Indexed ${files.length} bundled SB3 examples.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
