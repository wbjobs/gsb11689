// 排版客户端：优先 Worker；Worker 不可用时同步在主线程跑（第二层兜底）。
import { tokenize } from '../engine/tokenize.js';
import { layoutDocument, createMeasurer } from '../engine/layout.js';
import { createCanvasHost, buildFontString } from './canvas-host.js';

export class LayoutClient {
  constructor(workerUrl) {
    this.worker = null;
    this.workerUrl = workerUrl;
    this.seq = 0;
    this.pending = new Map();
    this.host = null;
    this.measurers = new Map();
    this.lastSignature = null;
    this.lastResult = null;
    this.degraded = false;
  }

  async start() {
    if (typeof Worker === 'undefined' || !this.workerUrl) {
      this.degraded = true;
      return { backend: 'main-thread' };
    }
    try {
      this.worker = new Worker(this.workerUrl, { type: 'module' });
      this.worker.onmessage = (ev) => this._onMessage(ev.data);
      this.worker.onerror = (e) => this._failAll(String(e.message || e));
      await new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
        this.worker.postMessage({ type: 'init' });
        setTimeout(() => reject(new Error('worker init timeout')), 4000);
      });
      return { backend: 'worker' };
    } catch {
      this.worker = null;
      this.degraded = true;
      return { backend: 'main-thread' };
    }
  }

  _onMessage(msg) {
    if (msg.type === 'ready') {
      this._readyResolve?.();
      return;
    }
    if (msg.type === 'font-registered') return;
    if (msg.type === 'layout-result') {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        p.resolve({ doc: msg.result, ms: msg.ms, signature: msg.signature, backend: 'worker' });
      }
      return;
    }
    if (msg.type === 'error') {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        p.reject(new Error(msg.error));
      }
    }
  }

  _failAll(reason) {
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
  }

  async registerFont(family, buffer) {
    if (this.worker) {
      this.worker.postMessage(
        { type: 'registerFont', family, buffer: buffer.slice(0) },
        [buffer.slice(0)]
      );
      // 给 Worker 一点时间完成 load
      await new Promise((r) => {
        const onMsg = (ev) => {
          if (ev.data.type === 'font-registered' && ev.data.family === family) {
            this.worker.removeEventListener('message', onMsg);
            r();
          }
        };
        this.worker.addEventListener('message', onMsg);
        setTimeout(r, 1500);
      });
    }
  }

  layout(text, options) {
    if (this.worker) return this._layoutWorker(text, options);
    return Promise.resolve(this._layoutLocal(text, options));
  }

  _layoutWorker(text, options) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'layout', id, text, options });
    });
  }

  _layoutLocal(text, options) {
    if (!this.host) this.host = createCanvasHost();
    const fontString = buildFontString(options);
    let measurer = this.measurers.get(fontString);
    if (!measurer) {
      measurer = createMeasurer(this.host, fontString);
      this.measurers.set(fontString, measurer);
    }
    const t0 = performance.now();
    const paragraphs = tokenize(text);
    const doc = layoutDocument(paragraphs, { ...options, measurer });
    return { doc, ms: performance.now() - t0, signature: null, backend: 'main-thread' };
  }
}
