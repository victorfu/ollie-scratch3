const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {createReadStream} = require('node:fs');

async function checksum(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}
async function ensureGuiSource(root = __dirname, fetchSource = globalThis.fetch) {
    const source = JSON.parse(await fs.readFile(path.join(root, 'upstream/scratch-gui-source.json'), 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(source.commit) || !/^[a-f0-9]{64}$/.test(source.sha256) ||
        source.url !== `https://codeload.github.com/scratchfoundation/scratch-gui/tar.gz/${source.commit}` ||
        source.archiveRoot !== `scratch-gui-${source.commit}`) throw Error('Invalid pinned Scratch GUI source manifest');
    const cache = path.join(root, '.cache');
    const archive = path.join(cache, `scratch-gui-${source.commit}.tar.gz`);
    try { if (await checksum(archive) === source.sha256) return {archive, source}; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.mkdir(cache, {recursive: true});
    const temporary = `${archive}.${process.pid}.${randomUUID()}.part`;
    let file;
    try {
        console.log(`Downloading pinned Scratch GUI ${source.commit}…`);
        const response = await fetchSource(source.url, {signal: AbortSignal.timeout(120000)});
        if (!response.ok || !response.body) throw Error(`Scratch GUI download failed: HTTP ${response.status}`);
        file = await fs.open(temporary, 'wx');
        let size = 0;
        const hash = createHash('sha256');
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 128 * 1024 * 1024) throw Error('Scratch GUI archive exceeds 128 MB');
            hash.update(chunk);
            await file.writeFile(chunk);
        }
        await file.close(); file = null;
        if (hash.digest('hex') !== source.sha256) throw Error('Scratch GUI source checksum mismatch; cache was not replaced');
        await fs.rename(temporary, archive);
        return {archive, source};
    } finally {
        if (file) await file.close();
        await fs.rm(temporary, {force: true});
    }
}
module.exports = {ensureGuiSource, checksum};
if (require.main === module) ensureGuiSource().then(({archive}) => console.log(`Verified: ${archive}`)).catch(e => {
    console.error(`${e.message}\nCheck your network, then rerun npm run editor:fetch.`);
    process.exitCode = 1;
});
