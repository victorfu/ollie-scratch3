import React from 'react';
import ReactDOM from 'react-dom';
import {Provider} from 'react-redux';
import {createStore,combineReducers} from 'redux';
import GUI,{guiReducers,guiInitialState,guiMiddleware,initLocale,localesInitialState} from 'scratch-gui-source/index';
import ConnectedIntlProvider from 'scratch-gui-source/lib/connected-intl-provider.jsx';
import {setProjectUnchanged,setProjectChanged} from 'scratch-gui-source/reducers/project-changed';
import {setProjectTitle} from 'scratch-gui-source/reducers/project-title';
import {activateTab} from 'scratch-gui-source/reducers/editor-tab';
import {validMessage,envelope} from '../../../lib/protocol';
import {validateSB3} from '../../../lib/sb3-validate';
import {download,errorMessage} from './shared';

const store=createStore(combineReducers(guiReducers),{locales:initLocale(localesInitialState,'zh-tw'),scratchGui:guiInitialState},guiMiddleware);
const vm=store.getState().scratchGui.vm;
const sessionId=crypto.randomUUID(),origin=location.origin;
let connected='',ready=false,disposed=false,queue=Promise.resolve(),busy=false,revision=0;
let prepared=null; // At most one validated project, owned by this editor session.
let cameraState={state:'off',message:'攝影機未開啟'};
const seen=new Set();
const send=(type,requestId=crypto.randomUUID(),payload={},transfer=[])=>{if(!disposed)parent.postMessage(envelope(type,sessionId,requestId,payload),origin,transfer);};
const dirty=()=>store.getState().scratchGui.projectChanged;
const title=()=>store.getState().scratchGui.projectTitle;
const overlay=()=>document.getElementById('busy');
const reportCamera=state=>{cameraState=state;send('camera',undefined,state);};
const announceReady=()=>{send('ready',connected,{dirty:dirty()});send('camera',undefined,cameraState);};
const stop=()=>{
 vm.stopAll(); // Handpose owns PROJECT_STOP_ALL; do not also call its stop() directly.
 if(!vm.runtime.handpose){vm.runtime.ioDevices.video.disableVideo();reportCamera({state:'off',message:'攝影機已停止'});}
};
// Validated in the browser: hosted functions cap request bodies (Vercel: 4.5 MB),
// and these bytes never leave this page anyway. Protocol caps messages at 500 MB.
async function validate(bytes) {await validateSB3(Buffer.from(bytes),500*1024*1024);}
async function apply(bytes,name,changed=false) {
 await vm.loadProject(bytes);
 // loadProject already emits targets/workspace updates. Match the upstream GUI's
 // next-task dirty reset, letting queued Blockly import events finish first.
 store.dispatch(activateTab(0));
 await new Promise(resolve=>setTimeout(resolve,0));
 store.dispatch(setProjectTitle(name));
 store.dispatch(changed?setProjectChanged():setProjectUnchanged());
 vm.renderer.draw();
}
async function handle(m) {
 if(disposed)return;
 if(m.handshake!==connected)throw Error('編輯器連線已更新，請重新選擇作品');
 if(m.type==='prepare') {
  prepared=null;
  await validate(m.bytes);
  if(disposed || m.handshake!==connected)return;
  prepared={id:crypto.randomUUID(),bytes:m.bytes,title:m.title};
  send('result',m.requestId,{ok:true,preparedId:prepared.id});return;
 }
 if(m.type==='export') {
  const rev=revision,bytes=await (await vm.saveProjectSb3()).arrayBuffer();
  if(revision===rev)store.dispatch(setProjectUnchanged());
  send('result',m.requestId,{ok:true,bytes,title:title()},[bytes]);return;
 }
 if(m.type!=='load')return;
 let backup,oldTitle=title(),oldDirty=dirty();
 busy=true;overlay().style.display='grid';
 try {
  let bytes=m.bytes,name=m.title;
  if(m.preparedId) {
   if(!prepared || prepared.id!==m.preparedId)throw Error('載入階段：已驗證作品已取消或失效，請重新選擇');
   bytes=prepared.bytes;name=prepared.title;prepared=null;
  } else {
   // Raw load is retained for v1 protocol clients; it must validate before use.
   prepared=null;await validate(bytes);
  }
  if(disposed || m.handshake!==connected)throw Error('編輯器連線已更新，請重新選擇作品');
  try {backup=await (await vm.saveProjectSb3()).arrayBuffer();}
  catch(e){throw Error(`備份階段：${errorMessage(e)}；原作品未替換`);}
  if(disposed || m.handshake!==connected)throw Error('編輯器連線已更新，請重新選擇作品');
  if(m.downloadFirst)download(backup,oldTitle); // Blob copies; backup is never transferred.
  stop();
  try {await apply(bytes,name);}
  catch(e) {
   try {await apply(backup,oldTitle,oldDirty);}
   catch(recovery) {
    const copy=backup.slice(0);
    send('result',m.requestId,{ok:false,error:`VM 載入：${errorMessage(e)}；復原也失敗：${errorMessage(recovery)}。請下載復原備份。`,backup:copy,title:oldTitle},[copy]);return;
   }
   throw Error(`VM 載入：${errorMessage(e)}；已復原原作品`);
  }
  reportCamera({state:'off',message:'攝影機已停止'});
  send('result',m.requestId,{ok:true});
 } catch(e){send('result',m.requestId,{ok:false,error:errorMessage(e)});}
 finally {busy=false;overlay().style.display='none';send('dirty',undefined,{dirty:dirty()});}
}
function message(event) {
 if(event.origin!==origin || event.source!==parent || !validMessage(event.data) || disposed)return;
 const m=event.data;
 if(m.type==='connect') {
  if(connected!==m.requestId)prepared=null;
  connected=m.requestId;if(ready)announceReady();return;
 }
 if(m.sessionId!==sessionId || !ready)return;
 if(seen.has(m.requestId))return;seen.add(m.requestId);
 if(seen.size>1000)seen.delete(seen.values().next().value);
 if(m.type==='discard'){if(prepared && prepared.id===m.preparedId)prepared=null;return;}
 const request={...m,handshake:connected};
 queue=queue.then(()=>handle(request)).catch(e=>send('result',m.requestId,{ok:false,error:errorMessage(e)}));
}
window.addEventListener('message',message);
let lastDirty=false,lastTitle='';
const unsubscribe=store.subscribe(()=>{
 const next=dirty(),name=title();
 if(next!==lastDirty || name!==lastTitle) {
  if(ready && name!==lastTitle && !busy){lastTitle=name;store.dispatch(setProjectChanged());}
  lastDirty=dirty();lastTitle=title();revision++;
  if(ready && !busy)send('dirty',undefined,{dirty:lastDirty});
 }
});
vm.on('PROJECT_CHANGED',()=>{revision++;});
vm.runtime.on('HANDPOSE_STATUS',reportCamera);
async function cameraOn() {
 try {await vm.extensionManager.loadExtensionURL('handpose2scratch');if(!disposed && !busy)await vm.runtime.handpose.start('on');}
 catch(e){reportCamera({state:'error',message:`Handpose：${errorMessage(e)}`});}
}
const listeners={
 'ollie-examples':()=>send('open-examples'),
 'ollie-export':()=>send('export-request'),
 'ollie-import':()=>send('import-request'),
 'ollie-camera-on':cameraOn,
 'ollie-camera-off':stop
};
Object.entries(listeners).forEach(([name,fn])=>window.addEventListener(name,fn));
function dispose() {
 if(disposed)return;
 // runtime.dispose calls stopAll, which releases Handpose tracks and RAF work.
 vm.runtime.dispose();disposed=true;prepared=null;unsubscribe();
 window.removeEventListener('message',message);
 Object.entries(listeners).forEach(([name,fn])=>window.removeEventListener(name,fn));
}
window.addEventListener('pagehide',event=>{if(event.persisted)stop();else dispose();});
window.addEventListener('pageshow',event=>{
 if(event.persisted && !disposed){reportCamera({state:'off',message:'攝影機已停止，按綠旗可重新執行'});if(ready && connected)announceReady();}
});
window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
GUI.setAppElement(document.getElementById('app'));
ReactDOM.render(<Provider store={store}><ConnectedIntlProvider><GUI projectId="0" canEditTitle canSave={false} canCreateNew={false} showComingSoon={false} onClickLogo={()=>{}} onStorageInit={storage=>{
 storage.addWebStore([storage.AssetType.ImageVector,storage.AssetType.ImageBitmap,storage.AssetType.Sound],asset=>`https://assets.scratch.mit.edu/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`);
}} onProjectLoaded={()=>{if(ready)return;setTimeout(()=>{if(disposed || !vm.renderer || !vm.initialized || !vm.runtime.targets.length)return;ready=true;store.dispatch(setProjectUnchanged());lastTitle=title();if(connected)announceReady();},100);}} /></ConnectedIntlProvider></Provider>,document.getElementById('app'));
