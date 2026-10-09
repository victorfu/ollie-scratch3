import 'server-only';
import {guardRequest} from '@/lib/server/request-guard';
import {readExample} from '@/lib/server/example-catalog';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, {params}: {params: Promise<{id:string}>}) {
  const denied = guardRequest(_req); if (denied) return denied;
  // ZIP validation happens once in the editor's prepare phase before any replacement.
  try { const bytes = await readExample((await params).id, false); return new Response(new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength), {headers:{'Content-Type':'application/x.scratch.sb3','Cache-Control':'no-store','Content-Disposition':'attachment; filename="example.sb3"','X-Content-Type-Options':'nosniff'}}); }
  catch(e) { return Response.json({error: e instanceof Error && !('code' in e) ? e.message : '讀取檔案：無法讀取範例'}, {status:400,headers:{'Cache-Control':'no-store'}}); }
}
