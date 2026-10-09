export const VERSION = 1;
const events = new Set(['connect','ready','open-examples','import-request','export-request','prepare','discard','load','export','result','dirty','camera']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 150;
const validProject = m => m.bytes instanceof ArrayBuffer && m.bytes.byteLength <= 500 * 1024 * 1024 && typeof m.title === 'string' && m.title.length <= 300;
export function validMessage(m) {
    if (!m || m.channel !== 'ollie-scratch' || m.version !== VERSION || !events.has(m.type) ||
        typeof m.sessionId !== 'string' || m.sessionId.length > 150 || !validId(m.requestId)) return false;
    if (m.type === 'prepare') return validProject(m);
    if (m.type === 'discard') return validId(m.preparedId);
    if (m.type === 'load') return typeof m.downloadFirst === 'boolean' &&
        (m.preparedId !== undefined ? validId(m.preparedId) && m.bytes === undefined : validProject(m));
    if (m.type === 'result') return typeof m.ok === 'boolean' &&
        (m.title === undefined || typeof m.title === 'string') && (m.error === undefined || typeof m.error === 'string') &&
        (m.preparedId === undefined || validId(m.preparedId)) &&
        (m.bytes === undefined || m.bytes instanceof ArrayBuffer) && (m.backup === undefined || m.backup instanceof ArrayBuffer);
    if (m.type === 'ready' || m.type === 'dirty') return typeof m.dirty === 'boolean';
    if (m.type === 'camera') return ['off','loading','on','error'].includes(m.state) && typeof m.message === 'string';
    return true;
}
export const envelope = (type,sessionId,requestId,payload={}) => ({channel:'ollie-scratch',version:VERSION,type,sessionId,requestId,...payload});
