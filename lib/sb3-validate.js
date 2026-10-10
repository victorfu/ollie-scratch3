// Shared by the Next server (example catalog, tests) and the Scratch iframe bundle.
// Keep to syntax Webpack 4 can parse (no ?. or ??): this file is not transpiled there.
import yauzl from 'yauzl';
import CRC32 from 'crc-32';
const core = new Set(['motion','looks','sound','event','control','sensing','operator','data','procedures','argument','math','text','colour','note']);
export function validateSB3(bytes, maxBytes) {
  if (bytes.length > maxBytes) return Promise.reject(new Error('SB3 格式：檔案超過大小限制'));
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, {lazyEntries: true, validateEntrySizes: true}, (error, zip) => {
      if (error || !zip) return reject(new Error('SB3 格式：不是有效 ZIP'));
      let total = 0, count = 0, project;
      let projectCount = 0, failed = false;
      const names = new Set();
      const fail = e => { if (failed) return; failed = true; zip.close(); reject(new Error(`SB3 格式：${e instanceof Error ? e.message : String(e)}`)); };
      zip.on('error', fail);
      zip.on('entry', entry => {
        if (++count > 10000 || (total += entry.uncompressedSize) > 200 * 1024 * 1024) return fail('解壓後超過 200 MB 或 10000 個檔案');
        if (names.has(entry.fileName) || entry.generalPurposeBitFlag & 1) return fail('重複或加密的 ZIP 項目');
        names.add(entry.fileName);
        // Same candidate rule as scratch-parser/lib/unzip.js. Never accept ambiguity.
        const isProject = /^([^/]*\/)?project\.json$/.test(entry.fileName);
        if (isProject && ++projectCount > 1) return fail('ZIP 包含多份 project.json，無法確定要載入的作品');
        if (isProject && entry.uncompressedSize > 10 * 1024 * 1024) return fail('project.json 超過 10 MB');
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return fail(err || '無法解壓');
          const chunks = []; let actual = 0, crc = 0;
          stream.on('error', fail);
          stream.on('data', c => {
            actual += c.length;
            if (actual > entry.uncompressedSize || (isProject && actual > 10 * 1024 * 1024)) { stream.destroy(); fail('解壓大小超出宣告值'); return; }
            crc = CRC32.buf(c, crc);
            if (isProject) chunks.push(c);
          });
          stream.on('end', () => {
            try {
              if ((crc >>> 0) !== entry.crc32) throw new Error('ZIP 資源 CRC 不正確');
              if (isProject) project = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              zip.readEntry();
            } catch(e) { fail(e); }
          });
        });
      });
      zip.on('end', () => {
        if (failed) return;
        try {
          if (projectCount !== 1) throw new Error('缺少有效 project.json');
          if (!project || !Array.isArray(project.targets) || !project.targets.length || project.targets.filter(t => t.isStage === true).length !== 1) throw new Error('缺少有效 project.json／舞台');
          const ext = project.extensions === undefined || project.extensions === null ? [] : project.extensions;
          if (!Array.isArray(ext) || ext.some(e => typeof e !== 'string')) throw new Error('extensions 結構不正確');
          const needed = new Set(ext);
          for (const t of project.targets) {
            if (!t.blocks || typeof t.blocks !== 'object' || Array.isArray(t.blocks) || !Array.isArray(t.costumes) || !Array.isArray(t.sounds)) throw new Error('角色結構不正確');
            for (const b of Object.values(t.blocks)) { if (b && typeof b.opcode === 'string') { const prefix = b.opcode.split('_')[0]; if (!core.has(prefix)) needed.add(prefix); } }
            for (const a of [...t.costumes, ...t.sounds]) {
              const name = a.md5ext || `${a.assetId}.${a.dataFormat}`;
              if (typeof name !== 'string' || /[\/\\]/.test(name)) throw new Error('作品資源檔名不正確');
              // VM tries the root asset first, then the first match in one subfolder.
              if (!names.has(name) && ![...names].some(n => {const pieces = n.split('/'); return pieces.length === 2 && pieces[1] === name;})) throw new Error(`缺少作品資源 ${name}`);
            }
          }
          // The competition allows Music, Pen and the official Handpose2Scratch.
          const unsupported = [...needed].filter(e => !['music','pen','handpose2scratch'].includes(e));
          if (unsupported.length) return reject(new Error(`extension 相容性：不支援 ${unsupported.join('、')}`));
          resolve({extensions: [...needed]});
        } catch(e) { fail(e); }
      });
      zip.readEntry();
    });
  });
}
