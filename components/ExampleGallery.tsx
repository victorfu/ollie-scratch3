'use client';
import {useEffect,useRef,useState} from 'react';
import type {Catalog,Example} from '@/lib/server/example-catalog';
type Props={busy:boolean;error:string;ready:boolean;onClose:()=>void;onSelect:(example:Example)=>void};
export default function ExampleGallery({busy,error,ready,onClose,onSelect}:Props) {
 const [catalog,setCatalog]=useState<Catalog|null>(null),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[readError,setReadError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),controller=useRef<AbortController|null>(null);
 async function refresh(){controller.current?.abort();const c=new AbortController();controller.current=c;setLoading(true);setReadError('');try{const r=await fetch('/api/examples',{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('範例清單讀取失敗');setCatalog(await r.json());}catch(e){if(!c.signal.aborted)setReadError(e instanceof Error?e.message:'讀取失敗');}finally{if(!c.signal.aborted)setLoading(false);}}
 useEffect(()=>{dialog.current?.showModal();void refresh();return()=>controller.current?.abort();},[]);
 const shown=catalog?.examples.filter(e=>e.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))||[];
 return <dialog ref={dialog} className="gallery" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} aria-labelledby="gallery-title">
  <header><div><span className="eyebrow">LOCAL PROJECTS</span><h1 id="gallery-title">探索你的範例</h1><p>挑選一個作品，接著創造自己的版本。</p></div><button className="icon-button" aria-label="關閉範例" onClick={onClose} disabled={busy}>×</button></header>
  <div className="gallery-tools"><input autoFocus type="search" aria-label="搜尋範例" placeholder="搜尋作品名稱…" value={search} onChange={e=>setSearch(e.target.value)}/><button onClick={()=>void refresh()} disabled={busy||loading}>重新整理</button></div>
  <div className="gallery-info"><span>{loading?'讀取範例清單中…':catalog?.message}</span><span>SB3 · 本機檔案</span></div>
  {(error||readError)&&<p className="error" role="alert">{error||readError}</p>}
  {catalog?.warnings?.map(w=><p className="notice" role="status" key={w}>{w}</p>)}
  {!ready&&<p className="notice">請等待 Scratch 編輯器就緒。</p>}
  <div className="example-list" aria-busy={busy||loading}>
   {!loading&&!shown.length&&<div className="empty"><span>◇</span><h2>{catalog?.status==='ready'?'沒有符合的作品':catalog?.message||'無法取得清單'}</h2><p>在設定的資料夾新增 .sb3 後，按「重新整理」即可。</p></div>}
   {shown.map((e,i)=><button className="example-card" key={e.id} onClick={()=>onSelect(e)} disabled={busy||!ready||Boolean(e.error)}><span className="project-number">{String(i+1).padStart(2,'0')}</span><span className="project-copy"><strong>{e.title}</strong><small>{e.error||`${(e.size/1024).toFixed(0)} KB · Scratch 專案`}</small></span><span className="project-arrow">↗</span></button>)}
  </div>
  <div className="gallery-bottom">{busy?'正在驗證、備份與載入作品…':'原始範例不會被修改。編輯後可下載為新的 SB3。'}</div>
 </dialog>;
}
