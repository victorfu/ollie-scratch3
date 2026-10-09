import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Scratch 工作室',description:'本機 Scratch 3 編輯器與手部辨識範例庫'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>;}
