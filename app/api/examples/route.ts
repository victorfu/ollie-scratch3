import 'server-only';
import {guardRequest} from '@/lib/server/request-guard';
import {getCatalog} from '@/lib/server/example-catalog';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { const denied = guardRequest(req); if (denied) return denied; return Response.json(await getCatalog(), {headers:{'Cache-Control':'no-store'}}); }
