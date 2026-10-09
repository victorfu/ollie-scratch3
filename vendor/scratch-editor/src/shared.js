// Pure utilities shared by both isolated React runtimes; no Scratch/React imports.
export function projectFilename(title) {
    const base = (typeof title === 'string' ? title : '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/^\.+/, '').trim();
    return `${base || 'Scratch作品'}.sb3`;
}
export function download(bytes, title) {
    const url = URL.createObjectURL(new Blob([bytes], {type: 'application/x.scratch.sb3'}));
    const a = document.createElement('a');
    a.href = url; a.download = projectFilename(title); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function errorMessage(error) {
    if (typeof error === 'string') {
        try { return errorMessage(JSON.parse(error)); } catch { return error.trim() || '未提供錯誤原因'; }
    }
    if (error && typeof error === 'object') {
        if (typeof error.validationError === 'string') {
            const detail = Array.isArray(error.sb3Errors) && error.sb3Errors[0];
            return `作品結構不合法：${error.validationError}${detail ? ` (${detail.dataPath || '/'} ${detail.message || ''})` : ''}`;
        }
        if (typeof error.message === 'string') return error.message || '未提供錯誤原因';
    }
    return '未提供錯誤原因';
}
