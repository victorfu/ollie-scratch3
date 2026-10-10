'use client';
import {useEffect,useRef,useState} from 'react';
import ScratchEditorFrame from '@/components/ScratchEditorFrame';
import ExampleGallery from '@/components/ExampleGallery';
import type {EditorAPI} from '@/lib/editor-protocol';
import type {Catalog,Example} from '@/lib/server/example-catalog';
import {LESSON_PARAM,findLesson,lessonParam,withLesson} from '@/lib/lesson-param';
// lesson: the `?lesson=` value for a bundled example, or null for an imported file.
type Candidate = {preparedId:string;title:string;operationId:number;lesson:string|null};
export default function Page() {
 const api=useRef<EditorAPI>(null),input=useRef<HTMLInputElement>(null);
 const operation=useRef<{id:number;controller:AbortController}|null>(null),serial=useRef(0);
 const [gallery,setGallery]=useState(false),[ready,setReady]=useState(false),[dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<Candidate|null>(null);
 const confirm=useRef<HTMLDialogElement>(null),dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const current=(id:number)=>operation.current?.id===id;
 const release=(id:number)=>{if(current(id)){operation.current=null;setBusy(false);}};
 useEffect(()=>{if(pending)confirm.current?.showModal();},[pending]);
 useEffect(()=>{
  const leave=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',leave);
  return()=>{window.removeEventListener('beforeunload',leave);operation.current?.controller.abort();operation.current=null;};
 },[]);
 function cancel() {
  if(pending){api.current?.discard(pending.preparedId);release(pending.operationId);}
  setPending(null);
 }
 async function perform(candidate:Candidate,downloadFirst=false) {
  if(!current(candidate.operationId))return;
  setPending(null);
  try {
   if(!api.current)throw Error('編輯器尚未就緒');
   await api.current.load(candidate.preparedId,downloadFirst);
   if(current(candidate.operationId)){setGallery(false);setError('');window.history.replaceState(null,'',withLesson(location.href,candidate.lesson));}
  } catch(e) {if(current(candidate.operationId))setError(e instanceof Error?e.message:'載入失敗');}
  finally {release(candidate.operationId);}
 }
 async function choose(example?:Example,file?:File) {
  if(operation.current || !ready)return;
  const id=++serial.current,controller=new AbortController();operation.current={id,controller};
  setBusy(true);setError('');
  try {
   let bytes:ArrayBuffer,title:string;
   if(file) {
    if(file.size>50*1024*1024)throw Error('讀取檔案：本機匯入上限 50 MB');
    bytes=await file.arrayBuffer();title=file.name.replace(/\.sb3$/i,'');
   } else {
    const r=await fetch(`/api/examples/${example!.id}/project`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
    if(!r.ok)throw Error((await r.json()).error || '讀取檔案失敗');
    bytes=await r.arrayBuffer();title=example!.title;
   }
   if(!current(id))return;
   if(!api.current)throw Error('編輯器尚未就緒');
   // Ownership moves to the iframe; only an opaque reference remains in this page.
   const preparedId=await api.current.prepare(bytes,title.slice(0,300));
   if(!current(id)){api.current.discard(preparedId);return;}
   const candidate={preparedId,title,operationId:id,lesson:example?lessonParam(example.title):null};
   if(dirtyRef.current)setPending(candidate);else await perform(candidate);
  } catch(e) {if(current(id)){setError(e instanceof Error?e.message:'讀取檔案失敗');release(id);}}
 }
 // Load the lesson named in `?lesson=` once, the first time the editor becomes ready.
 const requested=useRef(false);
 useEffect(()=>{
  if(!ready || requested.current)return;
  requested.current=true;
  const wanted=new URLSearchParams(location.search).get(LESSON_PARAM);
  if(!wanted)return;
  void (async()=>{
   try {
    const r=await fetch('/api/examples',{cache:'no-store'});
    if(!r.ok)throw Error('範例清單讀取失敗');
    const example=findLesson((await r.json() as Catalog).examples,wanted);
    if(!example)return setError(`找不到網址指定的課程：${wanted}`);
    if(example.error)return setError(example.error);
    await choose(example);
   } catch(e) {setError(e instanceof Error?e.message:'範例清單讀取失敗');}
  })();
 // choose reads the latest state through refs; run only when readiness changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready]);
 function readiness(value:boolean) {
  setReady(value);
  if(!value) {
   operation.current?.controller.abort();operation.current=null;
   setPending(null);setBusy(false);setError('');
  }
 }
 return <main>
  <ScratchEditorFrame ref={api} onExamples={()=>{if(!operation.current){setError('');setGallery(true);}}} onImport={()=>{if(!operation.current)input.current?.click();}} onDirty={setDirty} onReady={readiness} onError={setError}/>
  <input ref={input} className="hidden-input" type="file" accept=".sb3" aria-label="匯入 SB3 檔案" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(undefined,file);}}/>
  {error&&!gallery&&<div className="toast" role="alert">{error}<button aria-label="關閉錯誤" onClick={()=>setError('')}>×</button></div>}
  {gallery&&<ExampleGallery ready={ready} busy={busy} error={error} onClose={()=>{if(!busy)setGallery(false);}} onSelect={e=>void choose(e)}/>}
  {pending&&<dialog ref={confirm} className="confirm" aria-labelledby="confirm-title" onCancel={e=>{e.preventDefault();cancel();}}><span className="eyebrow">KEEP YOUR CREATION</span><h2 id="confirm-title">保留目前的修改嗎？</h2><p>目前作品有尚未下載的修改。載入「{pending.title}」前，你可以先下載保存。</p><div className="confirm-actions"><button onClick={cancel}>取消</button><button onClick={()=>void perform(pending)}>直接載入</button><button className="primary" onClick={()=>void perform(pending,true)}>下載目前作品後載入</button></div></dialog>}
  {busy&&!gallery&&!pending&&<div className="toast" role="status">正在驗證、備份與載入作品…</div>}
 </main>;
}
