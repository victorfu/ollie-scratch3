'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {download,envelope,validMessage,type EditorAPI,type EditorMessage,type EditorResult} from '@/lib/editor-protocol';
type Props={onExamples:()=>void;onImport:()=>void;onDirty:(value:boolean)=>void;onReady:(value:boolean)=>void;onError:(message:string)=>void};
export default forwardRef<EditorAPI,Props>(function ScratchEditorFrame(props,ref) {
 const frame=useRef<HTMLIFrameElement>(null),session=useRef(''),handshake=useRef(''),callbacks=useRef(props);
 callbacks.current=props;
 const pending=useRef(new Map<string,{kind:'prepare'|'load'|'export';resolve:(m:EditorResult)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const connectTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const connectRetry=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
 const listening=useRef(false),blocked=useRef<string|null>(null);
 const [state,setState]=useState('正在準備 Scratch 編輯器…'),[camera,setCamera]=useState('攝影機未開啟'),[backup,setBackup]=useState<{bytes:ArrayBuffer;title:string;sessionId:string}|null>(null);
 const invalidate=()=>{session.current='';blocked.current=null;callbacks.current.onReady(false);for(const p of pending.current.values()){clearTimeout(p.timer);p.reject(Error('編輯器 session 已結束'));}pending.current.clear();};
 function stopConnecting() {
  clearTimeout(connectTimer.current);clearInterval(connectRetry.current);
  connectTimer.current=undefined;connectRetry.current=undefined;
 }
 function connect() {
  // onLoad may run before the parent effect, or before hydration attaches it.
  // The effect starts the same handshake after installing its message listener.
  if(!listening.current)return;
  stopConnecting();invalidate();setCamera('正在確認攝影機狀態…');setState('正在初始化 Scratch 舞台與積木…');
  const requestId=crypto.randomUUID();handshake.current=requestId;
  const probe=()=>frame.current?.contentWindow?.postMessage(envelope('connect','',requestId),location.origin);
  connectRetry.current=setInterval(probe,500);
  connectTimer.current=setTimeout(()=>{
   stopConnecting();handshake.current='';
   setState('Scratch 初始化逾時。請重新整理；若尚未建置，執行 npm run editor:build。');
  },90000);
  probe();
 }
 function request(type:'prepare'|'load'|'export',payload:Record<string,unknown>={},transfer:Transferable[]=[]) {
  return new Promise<EditorResult>((resolve,reject)=>{
   if(!session.current || blocked.current || !frame.current?.contentWindow)return reject(Error('編輯器尚未就緒'));
   const id=crypto.randomUUID();const timer=setTimeout(()=>{
    pending.current.delete(id);
    // A VM load cannot safely be cancelled. Lock this session instead of starting a competing restore/load.
    if(type==='load'){blocked.current=id;callbacks.current.onReady(false);setState('VM 載入逾時，已鎖定操作以避免競態。若稍後仍未恢復，請重新整理。');}
    reject(Error('編輯器操作逾時（120 秒）；請保留頁面等待作業結束'));
   },120000);
   pending.current.set(id,{kind:type,resolve,reject,timer});
   frame.current.contentWindow.postMessage(envelope(type,session.current,id,payload),location.origin,transfer);
  });
 }
 const api:EditorAPI={
  prepare:async(bytes,title)=>{const m=await request('prepare',{bytes,title},[bytes]);if(!m.preparedId)throw Error('驗證回覆缺少作品 ID');return m.preparedId;},
  load:async(preparedId,downloadFirst)=>{await request('load',{preparedId,downloadFirst});},
  discard:preparedId=>{if(session.current)frame.current?.contentWindow?.postMessage(envelope('discard',session.current,crypto.randomUUID(),{preparedId}),location.origin);},
  export:async()=>{const m=await request('export');if(m.bytes)download(m.bytes,m.title);}
 };
 useImperativeHandle(ref,()=>api);
 useEffect(()=>{
  function receive(e:MessageEvent) {
   if(e.origin!==location.origin || e.source!==frame.current?.contentWindow || !validMessage(e.data))return;
   const m=e.data as EditorMessage;
   if(m.type==='ready') {
    if(m.requestId!==handshake.current || !m.sessionId)return;
    if(session.current)return;
    stopConnecting();session.current=m.sessionId;setState('');callbacks.current.onReady(true);callbacks.current.onDirty(Boolean(m.dirty));return;
   }
   if(m.sessionId!==session.current || !session.current)return;
   if(m.type==='open-examples')callbacks.current.onExamples();
   if(m.type==='import-request')callbacks.current.onImport();
   if(m.type==='export-request')api.export().catch(e=>callbacks.current.onError(e.message));
   if(m.type==='dirty')callbacks.current.onDirty(Boolean(m.dirty));
   if(m.type==='camera')setCamera(m.message || '');
   if(m.type==='result'){
    if(m.backup)setBackup({bytes:m.backup,title:m.title||'復原備份',sessionId:m.sessionId});
    if(blocked.current===m.requestId){blocked.current=null;setState('');callbacks.current.onReady(true);if(m.ok)setBackup(null);else callbacks.current.onError(m.error||'編輯器操作失敗');}
    const p=pending.current.get(m.requestId);if(!p)return;
    clearTimeout(p.timer);pending.current.delete(m.requestId);
    if(m.ok){if(p.kind==='load')setBackup(null);p.resolve(m);}else p.reject(Error(m.error||'編輯器操作失敗'));
   }
  }
  window.addEventListener('message',receive);
  listening.current=true;connect();
  return ()=>{
   listening.current=false;window.removeEventListener('message',receive);stopConnecting();
   handshake.current='';
   // Strict Mode / Fast Refresh may replay effects without removing the iframe.
   // Its own pagehide handler owns VM/camera disposal when the document exits.
   invalidate();
  };
 // The listener reads current callbacks from a ref; exactly one listener per mount.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <section className="editor-shell">
  <div className="editor-viewport">
  <iframe ref={frame} src="/scratch-editor/index.html" title="Scratch 3 編輯器" allow="camera; microphone; autoplay" onLoad={connect}/>
  </div>
  {state&&<div className="editor-status" role="status">{state}</div>}
  <footer><span className="status-dot"/>{camera}<span className="footer-right">作品留在本機 · Scratch 3 工作室</span></footer>
  {backup&&<div className="recovery" role="alert">{backup.sessionId===session.current?'復原未完成。':'先前作品的復原備份。'}<button onClick={()=>download(backup.bytes,backup.title+'-復原備份')}>下載可用備份</button></div>}
 </section>;
});
