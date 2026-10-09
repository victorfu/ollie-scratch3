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
let hand=fs.readFileSync(path.join(root,'upstream/handpose2scratch.js'),'utf8').replace("const ml5 = require('ml5');","const lifecycle = require('./lifecycle'); const {errorMessage} = require('./shared');");
const start=hand.indexOf('    constructor (runtime) {'),end=hand.indexOf('    getInfo () {',start);
hand=hand.slice(0,start)+`    constructor(runtime) { lifecycle.init.call(this,runtime); }
    stop() { return lifecycle.stop.call(this); }
    start(state) { return lifecycle.start.call(this,state); }
    isHandDetected() { return this.active && this.landmarks.length > 0; }
\n`+hand.slice(end);
const vs=hand.indexOf('    videoToggle (args) {'),ve=hand.indexOf('    /**',vs);
hand=hand.slice(0,vs)+`    videoToggle(args) { if(args.VIDEO_STATE === 'off') { this.stop(); return; } this.start(args.VIDEO_STATE).catch(e => this.runtime.emit('HANDPOSE_STATUS', {state:'error', message:errorMessage(e)})); }\n\n`+hand.slice(ve);
hand=hand.replace("blocks: [", "blocks: [{opcode: 'isHandDetected', blockType: BlockType.BOOLEAN, text: '偵測到手？', disableMonitor: true},");
hand=hand.replace("opcode: 'setVideoTransparency',","opcode: 'setVideoTransparency',\n                  blockType: BlockType.COMMAND,");
const translations={getX:'[LANDMARK] 的 x 座標',getY:'[LANDMARK] 的 y 座標',getZ:'[LANDMARK] 的 z 座標',videoToggle:'攝影機 [VIDEO_STATE]',setRatio:'座標倍率設為 [RATIO]',on:'開啟（鏡像）',off:'關閉',video_on_flipped:'開啟（不鏡像）'};
hand=hand.replace("const AvailableLocales = ['en', 'ja', 'ja-Hira'];",`Object.assign(Message, {});\n${Object.entries(translations).map(([k,v])=>`Message.${k}['zh-tw'] = ${JSON.stringify(v)};`).join('\n')}\nMessage.landmarks.forEach((x,i)=>x['zh-tw']=['手腕','拇指根部','拇指第二關節','拇指第一關節','拇指尖','食指第三關節','食指第二關節','食指第一關節','食指尖','中指第三關節','中指第二關節','中指第一關節','中指尖','無名指第三關節','無名指第二關節','無名指第一關節','無名指尖','小指第三關節','小指第二關節','小指第一關節','小指尖'][i]);\nconst AvailableLocales=['en','ja','ja-Hira','zh-tw'];`);
const hp=path.join(gen,'vm/extensions/scratch3_handpose2scratch'); fs.mkdirSync(hp,{recursive:true});fs.writeFileSync(path.join(hp,'index.js'),hand);fs.copyFileSync(path.join(root,'src/handpose-lifecycle.js'),path.join(hp,'lifecycle.js'));fs.copyFileSync(path.join(root,'src/shared.js'),path.join(hp,'shared.js'));
// Add exactly one gallery trigger in Scratch's actual toolbar.
edit('src/components/menu-bar/menu-bar.jsx','const aboutButton = this.buildAboutMenu(this.props.onClickAbout);',`const aboutButton = <React.Fragment>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-examples'))}>範例</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-export'))}>下載作品</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-import'))}>匯入 SB3</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-camera-on'))}>開啟相機</button>
<button className="local-toolbar-button" type="button" onClick={() => window.dispatchEvent(new Event('ollie-camera-off'))}>停止相機</button>
</React.Fragment>;`);
// Route the original file menu through the same safe import/export flow.
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.props.onStartSelectingFileUpload}',"onClick={() => { this.props.onRequestCloseFile(); window.dispatchEvent(new Event('ollie-import')); }}");
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.getSaveToComputerHandler(downloadProjectCallback)}',"onClick={() => { this.props.onRequestCloseFile(); window.dispatchEvent(new Event('ollie-export')); }}");
// Do not offer a second destructive new-project path that bypasses backup.
edit('src/components/menu-bar/menu-bar.jsx','onClick={this.handleClickNew}',"onClick={() => window.dispatchEvent(new Event('ollie-import'))}");
// Gallery exposes only supported extensions; Music entry stays upstream.
edit('src/lib/libraries/extensions/index.jsx','export default [','const extensions = [');
fs.appendFileSync(path.join(gen,'src/lib/libraries/extensions/index.jsx'),`\nexport default [...extensions.filter(e => e.extensionId === 'music'), {name:'Handpose 手部辨識',extensionId:'handpose2scratch',iconURL:videoSensingIconURL,insetIconURL:videoSensingInsetIconURL,description:'單手 21 個關節座標；由你決定何時開啟攝影機。',featured:true}];\n`);
// The original provider swallows getUserMedia errors: propagate to lifecycle UI.
edit('src/lib/video/video-provider.js','this.onError(error);','throw error;');
fs.copyFileSync(path.join(root,'node_modules/scratch-vm/package.json'),path.join(gen,'package.json'));
fs.mkdirSync(path.join(gen,'src/generated'),{recursive:true});
fs.writeFileSync(path.join(gen,'src/generated/microbit-hex-url.cjs'),"module.exports = ''; // Microbit is not offered by this editor.\n");

// Remove New from File menu: all local replacement uses the validated import/gallery transaction.
{const p=path.join(gen,'src/components/menu-bar/menu-bar.jsx');let s=fs.readFileSync(p,'utf8');s=s.replace(/<MenuSection>\s*<MenuItem\s+isRtl=\{this.props.isRtl\}\s+onClick=\{\(\) => window.dispatchEvent\(new Event\('ollie-import'\)\)\}\s*>\s*\{newProjectMessage\}\s*<\/MenuItem>\s*<\/MenuSection>/, '');fs.writeFileSync(p,s);}

}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
