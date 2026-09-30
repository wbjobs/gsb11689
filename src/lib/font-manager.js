// 字体加载：FontFace API + IndexedDB 持久化（ArrayBuffer）。
// 流程：内存命中 -> IDB 缓存 -> 网络 fetch -> 写入 IDB。
import { idbGet, idbSet, idbKeys, idbDelete } from './idb.js';

const key = (family) => `font:${family}`;

export class FontManager {
  constructor() {
    this.loaded = new Map(); // family -> { status, buffer, fontFace }
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(family, status, info = {}) {
    const entry = { status, ...info };
    this.loaded.set(family, entry);
    this.listeners.forEach((fn) => fn(family, entry));
  }

  async cachedFamilies() {
    const keys = await idbKeys();
    return keys.filter((k) => typeof k === 'string' && k.startsWith('font:'))
      .map((k) => k.slice(5));
  }

  // 返回可 transfer 的 ArrayBuffer（供 Worker 注册 FontFace）
  async getBuffer(family) {
    const mem = this.loaded.get(family);
    if (mem?.buffer) return mem.buffer;
    const cached = await idbGet(key(family));
    if (cached instanceof ArrayBuffer) {
      this._emit(family, 'cached', { buffer: cached });
      return cached;
    }
    return null;
  }

  async load(family, url) {
    this._emit(family, 'loading');
    try {
      let buffer = await this.getBuffer(family);
      let fromCache = !!buffer;
      if (!buffer) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = await res.arrayBuffer();
        await idbSet(key(family), buffer);
      }
      // 注册到文档（克隆一份，FontFace 会消耗 buffer）
      const fontFace = new FontFace(family, buffer.slice(0));
      await fontFace.load();
      if (typeof document !== 'undefined' && !document.fonts.has(fontFace)) {
        document.fonts.add(fontFace);
      }
      await document.fonts.load(`16px "${family}"`);
      this._emit(family, 'loaded', { buffer, fontFace, fromCache });
      return { ok: true, fromCache, buffer };
    } catch (err) {
      this._emit(family, 'error', { error: String(err && err.message || err) });
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  async unload(family) {
    const entry = this.loaded.get(family);
    if (entry?.fontFace && typeof document !== 'undefined') {
      document.fonts.delete(entry.fontFace);
    }
    this.loaded.delete(family);
    await idbDelete(key(family));
    this._emit(family, 'removed');
  }
}

// 监听系统/文档字体加载完成（例如 CSS @font-face 或本地字体延迟可用），触发重排
export function onDocumentFontsReady(callback) {
  if (typeof document === 'undefined' || !document.fonts) return () => {};
  let active = true;
  document.fonts.ready.then(() => { if (active) callback('document.fonts.ready'); });
  const handler = () => { if (active) callback('loadingdone'); };
  document.fonts.addEventListener?.('loadingdone', handler);
  return () => {
    active = false;
    document.fonts.removeEventListener?.('loadingdone', handler);
  };
}
