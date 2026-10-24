/* Photos remain in this browser's IndexedDB, separate from the small activity JSON. */
(() => {
  'use strict';
  let opening;
  const urls = new Map();
  function db() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('meetpoint-journal-photos', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(new Error('照片存储不可用，请允许浏览器本地存储后重试')); };
    });
    return opening;
  }
  async function transaction(mode, fn) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('photos', mode);
      const request = fn(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(new Error('照片保存失败，请检查浏览器剩余空间'));
    });
  }
  async function prepare(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('支持 JPG、PNG、WebP 格式的照片');
    if (file.size > 8 * 1024 * 1024) throw new Error('每张照片不能超过 8 MB');
    const source = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = source;
      try { await img.decode(); } catch { throw new Error('无法读取这张照片，请选择有效的图片文件'); }
      if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 60_000_000) throw new Error('照片尺寸过大，请先缩小后上传');
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4eddf'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84));
      if (!blob) throw new Error('照片处理失败，请重试');
      return { id: crypto.randomUUID(), name: file.name, blob };
    } finally { URL.revokeObjectURL(source); }
  }
  async function put(photo) { return transaction('readwrite', store => store.put(photo.blob, photo.id)); }
  async function remove(id) {
    await transaction('readwrite', store => store.delete(id));
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = await transaction('readonly', store => store.get(id));
    if (!blob) return null;
    const result = URL.createObjectURL(blob); urls.set(id, result); return result;
  }
  async function hydrate(container = document) {
    for (const img of container.querySelectorAll('img[data-photo]')) {
      try {
        const source = await url(img.dataset.photo);
        if (!img.isConnected) continue;
        if (source) { img.src = source; img.classList.remove('photo-loading'); }
        else { img.alt = '照片文件已被清理'; img.classList.add('photo-missing'); }
      } catch { img.alt = '照片暂时无法读取'; img.classList.add('photo-missing'); }
    }
  }
  window.MeetPointMedia = { prepare, put, remove, url, hydrate };
})();
