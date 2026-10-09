import 'server-only';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open, realpath, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {sizeLimit, validateSB3} from './sb3';
export type Example = {id: string; title: string; size: number; error?: string};
export type Catalog = {status: 'ready'|'unconfigured'|'missing'|'denied'|'empty'|'error'; message: string; examples: Example[]; warnings?: string[]};
export const inside = (root: string, file: string) => { const relative = path.relative(root, file); return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); };
const idFor = (relative: string) => createHash('sha256').update(relative).digest('hex');
async function scan() {
  // Unset uses the versioned library; an explicit empty value disables it.
  const configured = process.env.SCRATCH_EXAMPLES_DIR ?? path.join(process.cwd(), 'examples/web');
  if (!configured) return {catalog: {status: 'unconfigured', message: '尚未設定範例資料夾，請設定 SCRATCH_EXAMPLES_DIR。', examples: []} as Catalog, files: new Map<string,string>(), root: ''};
  const files = new Map<string,string>();
  let root = '';
  try {
    if (!path.isAbsolute(configured)) throw new Error('範例資料夾必須是絕對路徑');
    // External overrides are runtime-only; bundled files are included explicitly in next.config.ts.
    root = await realpath(/* turbopackIgnore: true */ configured);
    const examples: Example[] = [];
    const warnings: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name);
        // Never follow directory symlinks; file symlinks must resolve inside root.
        if (e.isDirectory() && process.env.SCRATCH_EXAMPLES_RECURSIVE === 'true') {
          try {
            const resolved = await realpath(p);
            if (inside(root, resolved)) await walk(resolved);
          } catch { warnings.push(`略過無法讀取的子資料夾：${path.relative(root, p)}`); }
          continue;
        }
        if (!e.name.toLowerCase().endsWith('.sb3')) continue;
        try {
          const resolved = await realpath(p);
          if (!inside(root, resolved)) continue;
          const s = await stat(resolved); if (!s.isFile()) continue;
          const rel = path.relative(root, p), id = idFor(rel);
          files.set(id, p);
          examples.push({id, title: rel.replace(/\.sb3$/i, ''), size: s.size, ...(s.size > sizeLimit() ? {error: '讀取檔案：超過大小限制'} : {})});
        } catch { examples.push({id: idFor(path.relative(root,p)), title: e.name, size: 0, error: '讀取檔案：無法讀取此範例'}); }
      }
    };
    await walk(root);
    examples.sort((a,b) => a.title.localeCompare(b.title,'zh-Hant', {numeric:true}));
    return {catalog: {status: examples.length ? 'ready' : 'empty', message: examples.length ? `${examples.length} 個本機範例` : '這個資料夾沒有 SB3 範例。', examples, warnings} as Catalog, files, root};
  } catch (e: any) {
    const status = e.code === 'ENOENT' ? 'missing' : ['EACCES','EPERM'].includes(e.code) ? 'denied' : 'error';
    const messages = {missing:'找不到範例資料夾。',denied:'沒有讀取範例資料夾的權限。',error:'無法讀取範例資料夾，請檢查伺服器設定。'};
    return {catalog: {status, message: messages[status], examples: []} as Catalog, files, root};
  }
}
export async function getCatalog() { return (await scan()).catalog; }
export async function readExample(id: string, validate = true) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('讀取檔案：無效範例 ID');
  const {files, root} = await scan(); const p = files.get(id);
  if (!p) throw new Error('讀取檔案：範例不存在或已移除');
  const resolved = await realpath(p);
  if (!inside(root, resolved)) throw new Error('讀取檔案：檔案不在允許目錄內');
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await handle.stat();
    if (!s.isFile() || s.size > sizeLimit()) throw new Error('讀取檔案：檔案類型或大小不允許');
    // Recheck after opening; bytes come from the pinned descriptor, never a later path lookup.
    if (await realpath(p) !== resolved || !inside(await realpath(/* turbopackIgnore: true */ root), resolved)) throw new Error('讀取檔案：路徑已變更');
    const bytes = Buffer.alloc(s.size); let offset = 0;
    while (offset < bytes.length) { const {bytesRead} = await handle.read(bytes, offset, bytes.length-offset, offset); if (!bytesRead) throw new Error('讀取檔案：檔案已變更'); offset += bytesRead; }
    if (validate) await validateSB3(bytes);
    return bytes;
  } finally { await handle.close(); }
}
