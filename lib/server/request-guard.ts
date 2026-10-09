import 'server-only';

// Exact hostnames only. Do not trust forwarded headers or infer trust from Origin.
export function allowedHost(authority: string | null): boolean {
  if (!authority || /[\s,@/\\?#]/.test(authority)) return false;
  try {
    const parsed = new URL(`http://${authority}`);
    const allowed = new Set(['localhost', '127.0.0.1', '[::1]',
      ...(process.env.SCRATCH_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)]);
    return allowed.has(parsed.hostname.toLowerCase());
  } catch { return false; }
}
export function guardRequest(req: Request, requireOrigin = false): Response | undefined {
  const host = req.headers.get('host');
  const denied = () => new Response('Forbidden', {status: 403, headers: {'Cache-Control': 'no-store'}});
  if (!allowedHost(host)) return denied();
  const origin = req.headers.get('origin');
  if (!origin) return requireOrigin ? denied() : undefined;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin ||
        parsed.host.toLowerCase() !== host!.toLowerCase()) return denied();
  } catch { return denied(); }
}
