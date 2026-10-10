const fs=require('fs'),path=require('path'),cp=require('child_process');
const {ensureGuiSource}=require('./source.cjs');
async function main() {
const root=__dirname, gen=path.join(root,'.generated');
const {archive,source}=await ensureGuiSource(root);
fs.rmSync(gen,{recursive:true,force:true}); fs.mkdirSync(gen,{recursive:true});
cp.execFileSync('tar',['-xzf',archive,'-C',gen,'--strip-components=1',...['src','static','LICENSE','TRADEMARK'].map(p=>`${source.archiveRoot}/${p}`)]);
fs.cpSync(path.join(root,'node_modules/scratch-vm/src'),path.join(gen,'vm'),{recursive:true});
function edit(file,from,to) {const p=path.join(gen,file),s=fs.readFileSync(p,'utf8'); if(!s.includes(from)) throw Error(`Patch mismatch: ${file}`); fs.writeFileSync(p,s.replace(from,to));}
edit('vm/extension-support/extension-manager.js',"music: () => require('../extensions/scratch3_music'),","music: () => require('../extensions/scratch3_music'),\n    handpose2scratch: () => require('../extensions/scratch3_handpose2scratch'),");
// Install the official Handpose2Scratch extension exactly as its install.sh does: the original file,
// unmodified (it bundles ml5 0.12.2 through require('ml5')), registered as a built-in extension.
const hp=path.join(gen,'vm/extensions/scratch3_handpose2scratch'); fs.mkdirSync(hp,{recursive:true});
fs.copyFileSync(path.join(root,'upstream/handpose2scratch.js'),path.join(hp,'index.js'));
// Add exactly one gallery trigger in Scratch's actual toolbar.
edit('src/components/menu-bar/menu-bar.jsx','const aboutButton = this.buildAboutMenu(this.props.onClickAbout);',`const aboutButton = <React.Fragment>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-examples'))}>範例</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-export'))}>下載作品</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-import'))}>匯入 SB3</button>
</React.Fragment>;`);
// Route the original file menu through the same safe import/export flow.
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.props.onStartSelectingFileUpload}',"onClick={() => { this.props.onRequestCloseFile(); window.dispatchEvent(new Event('ollie-import')); }}");
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.getSaveToComputerHandler(downloadProjectCallback)}',"onClick={() => { this.props.onRequestCloseFile(); window.dispatchEvent(new Event('ollie-export')); }}");
// Do not offer a second destructive new-project path that bypasses backup.
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.handleClickNew}',"onClick={() => window.dispatchEvent(new Event('ollie-import'))}");
// Gallery offers what the competition allows: Music and Pen (upstream entries) plus Handpose2Scratch.
edit('src/lib/libraries/extensions/index.jsx','export default [','const extensions = [');
fs.appendFileSync(path.join(gen,'src/lib/libraries/extensions/index.jsx'),`\nexport default [...extensions.filter(e => ['music','pen'].includes(e.extensionId)), {name:'Handpose2Scratch',extensionId:'handpose2scratch',collaborator:'champierre',iconURL:videoSensingIconURL,insetIconURL:videoSensingInsetIconURL,description:'HandPose2Scratch Blocks.',featured:true,internetConnectionRequired:true}];\n`);
fs.copyFileSync(path.join(root,'node_modules/scratch-vm/package.json'),path.join(gen,'package.json'));
fs.mkdirSync(path.join(gen,'src/generated'),{recursive:true});
fs.writeFileSync(path.join(gen,'src/generated/microbit-hex-url.cjs'),"module.exports = ''; // Microbit is not offered by this editor.\n");

// Remove New from File menu: all local replacement uses the validated import/gallery transaction.
{const p=path.join(gen,'src/components/menu-bar/menu-bar.jsx');let s=fs.readFileSync(p,'utf8');s=s.replace(/<MenuSection>\s*<MenuItem\s+isRtl=\{this.props.isRtl\}\s+onClick=\{\(\) => window.dispatchEvent\(new Event\('ollie-import'\)\)\}\s*>\s*\{newProjectMessage\}\s*<\/MenuItem>\s*<\/MenuSection>/, '');fs.writeFileSync(p,s);}

}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
