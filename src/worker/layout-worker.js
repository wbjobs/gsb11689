// Web Worker：离屏 Canvas 测量 + 断行排版。
// 消息：
//   { type: 'init' }                          初始化测量宿主
//   { type: 'registerFont', family, buffer }  注册自定义字体（buffer 会被 transfer）
//   { type: 'layout', id, text, options }     排版
import { createCanvasHost, buildFontString } from '../lib/canvas-host.js';
import { tokenize } from '../engine/tokenize.js';
import { layoutDocument, createMeasurer } from '../engine/layout.js';

let host = null;
const measurers = new Map(); // fontString -> measurer
const fonts = new Set();

function ensureHost() {
  if (!host) host = createCanvasHost();
}

async function registerFont(family, buffer) {
  if (fonts.has(family)) return true;
  // OffscreenCanvas Worker 内没有 document.fonts；直接 new FontFace 并 load
  const fontFace = new FontFace(family, buffer.slice(0));
  await fontFace.load();
  if (typeof self !== 'undefined' && self.fonts) {
    self.fonts.add(fontFace);
  }
  fonts.add(family);
  measurers.clear();
  return true;
}

function getMeasurer(fontString) {
  let m = measurers.get(fontString);
  if (!m) {
    m = createMeasurer(host, fontString);
    measurers.set(fontString, m);
  }
  return m;
}

// 简单 FNV-1a 签名，用于“相同输入跳过重排”的快速判断
function signature(text, options) {
  const s = JSON.stringify({
    t: text,
    m: options.mode, a: options.align, fs: options.fontSize, lh: options.lineHeight,
    ls: options.letterSpacing, w: options.measureLength, ti: options.textIndent,
    ff: options.fontFamily, fw: options.fontWeight, fst: options.fontStyle,
    k: options.kinsoku, hp: options.hangingPunct, cjk: options.cjkLatinSpacing,
    cc: options.containerCross,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    ensureHost();
    if (msg.type === 'init') {
      self.postMessage({ type: 'ready' });
      return;
    }
    if (msg.type === 'registerFont') {
      await registerFont(msg.family, msg.buffer);
      self.postMessage({ type: 'font-registered', family: msg.family });
      return;
    }
    if (msg.type === 'layout') {
      const { id, text, options } = msg;
      const fontString = buildFontString(options);
      const measurer = getMeasurer(fontString);
      const t0 = (self.performance || Date).now();
      const paragraphs = tokenize(text);
      const doc = layoutDocument(paragraphs, { ...options, measurer });
      const ms = ((self.performance || Date).now() - t0).toFixed(2);
      // 精简回传（atom 中只保留渲染/信息所需字段）
      const lines = doc.lines.map((line) => ({
        index: line.index,
        paraIndex: line.paraIndex,
        cross: line.cross,
        lineThickness: line.lineThickness,
        used: line.used,
        avail: line.avail,
        freeSpace: line.freeSpace,
        indent: line.indent,
        startOffset: line.startOffset,
        hanging: line.hanging,
        stretched: line.stretched,
        stretchAmount: line.stretchAmount,
        justifySpaces: line.justifySpaces,
        overlongSplit: line.overlongSplit,
        breakReason: line.breakReason,
        first: line.first,
        last: line.last,
        text: line.text,
        positions: line.positions,
        atoms: line.atoms.map((a) => ({
          type: a.type,
          ch: a.ch,
          text: a.text,
          split: !!a.split,
        })),
        gaps: line.gaps,
      }));
      self.postMessage({
        type: 'layout-result',
        id,
        ms: Number(ms),
        signature: signature(text, options),
        result: {
          lines,
          paragraphs: doc.paragraphs,
          size: doc.size,
          lineThickness: doc.lineThickness,
          em: doc.em,
          mode: doc.mode,
          align: doc.align,
        },
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg && msg.id,
      error: String(err && err.stack || err),
    });
  }
};
