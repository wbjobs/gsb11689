/**
 * layout-worker.js — Web Worker：字体注册 + 文本测量 + 分块排版
 * 使用 OffscreenCanvas 测量，主线程零阻塞。
 */
import { layoutText } from './layout.js';

let measureCtx = null;
const registeredFonts = new Set();

function ensureCtx() {
  if (!measureCtx) {
    const canvas = new OffscreenCanvas(1, 1);
    measureCtx = canvas.getContext('2d');
  }
  return measureCtx;
}

function makeMeasure(fontSize, fontFamily) {
  const ctx = ensureCtx();
  ctx.font = `${fontSize}px ${fontFamily}`;
  return (s) => ctx.measureText(s).width;
}

async function registerFont(family, buffer) {
  if (registeredFonts.has(family)) return;
  const face = new FontFace(family, buffer);
  await face.load();
  self.fonts.add(face);
  registeredFonts.add(family);
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'font') {
    try {
      await registerFont(msg.family, msg.buffer);
      self.postMessage({ type: 'font-ready', family: msg.family });
    } catch (err) {
      self.postMessage({ type: 'font-error', family: msg.family, error: String(err) });
    }
    return;
  }

  if (msg.type === 'layout') {
    const { id, text, options } = msg;
    try {
      if (msg.fontBuffer && msg.fontFamily) await registerFont(msg.fontFamily, msg.fontBuffer);
    } catch (_) { /* 字体失败则用回退字体测量 */ }
    const measure = makeMeasure(options.fontSize, options.fontFamily);
    const t0 = performance.now();

    // 大文本按段落边界分块排版，结果与一次性排版完全一致，同时保持进度回报
    const CHUNK = 20000;
    const allLines = [];
    if (text.length <= CHUNK) {
      allLines.push(...layoutText(text, options, measure).lines);
    } else {
      let start = 0;
      while (start < text.length) {
        let end = Math.min(start + CHUNK, text.length);
        if (end < text.length) {
          const nl = text.indexOf('\n', end);
          end = (nl === -1) ? text.length : nl + 1;
        }
        allLines.push(...layoutText(text.slice(start, end), options, measure).lines);
        start = end;
        self.postMessage({
          type: 'progress', id,
          progress: Math.min(1, start / text.length),
        });
      }
    }
    allLines.forEach((ln, idx) => { ln.index = idx; });
    self.postMessage({
      type: 'result', id,
      lines: allLines,
      elapsed: performance.now() - t0,
      engine: 'worker',
    });
  }
};
