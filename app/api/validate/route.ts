import 'server-only';
import {guardRequest} from '@/lib/server/request-guard';
import {sizeLimit, validateSB3} from '@/lib/server/sb3';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const denied = guardRequest(req, true); if (denied) return denied;
  const reader = req.body?.getReader(); if (!reader) return new Response('Missing body',{status:400});
  try {
    let size = 0; const parts: Uint8Array[] = [];
    while (true) { const {done,value} = await reader.read(); if(done) break; size += value.length; if(size > sizeLimit()) { await reader.cancel(); throw new Error('SB3 格式：超過大小限制'); } parts.push(value); }
    return Response.json(await validateSB3(Buffer.concat(parts)), {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return Response.json({error: e instanceof Error ? e.message : 'SB3 格式：驗證失敗'}, {status:400}); }
}
