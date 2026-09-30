/**
 * font-store.js — 字体加载（FontFace API）+ IndexedDB 持久缓存
 * 同一字体 URL 只下载一次，之后离线/刷新秒开。
 */
const DB_NAME = 'typography-demo';
const STORE = 'fonts';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function idbPut(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch (_) { /* 缓存失败不影响功能 */ }
}

/**
 * 加载字体：优先 IndexedDB 缓存，否则 fetch 后写入缓存。
 * @returns {{buffer: ArrayBuffer, fromCache: boolean}}
 */
export async function loadFontBuffer(url) {
  const cached = await idbGet(url);
  if (cached) return { buffer: cached, fromCache: true };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await idbPut(url, buffer);
  return { buffer, fromCache: false };
}

/** 用 FontFace API 注册到主线程文档 */
export async function registerFontFace(family, buffer) {
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  return face;
}
