import { layoutText } from './layout.js';
import { render } from './renderer.js';
import { loadFontBuffer, registerFontFace } from './font-store.js';
import { renderDOMFallback } from './dom-fallback.js';

const $ = (id) => document.getElementById(id);
const els = {
  text: $('text'), width: $('width'), widthVal: $('width-val'),
  fontSize: $('fontSize'), fontSizeVal: $('fontSize-val'),
  lineHeight: $('lineHeight'), lineHeightVal: $('lineHeight-val'),
  letterSpacing: $('letterSpacing'), letterSpacingVal: $('letterSpacing-val'),
  align: $('align'), indent: $('indent'), indentVal: $('indent-val'),
  writingMode: $('writingMode'), hanging: $('hanging'),
  engine: $('engine'), status: $('status'), progress: $('progress'),
  canvas: $('canvas'), canvasWrap: $('canvas-wrap'), domWrap: $('dom-wrap'),
  lineInfo: $('line-info'), lineCount: $('line-count'), layoutTime: $('layout-time'),
  fontUrl: $('fontUrl'), fontFile: $('fontFile'), loadFontBtn: $('loadFont'),
  fontStatus: $('font-status'), preset: $('preset'),
};

const CUSTOM_FAMILY = 'CustomFont';
let customFontBuffer = null;
let worker = null;
let layoutSeq = 0;
let currentLines = [];
let highlightIndex = -1;
let renderPending = false;

// ---------- 引擎能力检测 ----------
const hasWorker = typeof Worker !== 'undefined';
const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
const hasCanvas2D = (() => {
  try { return !!document.createElement('canvas').getContext('2d'); } catch (_) { return false; }
})();

function engineMode() {
  const forced = els.engine.value;
  if (forced === 'dom') return 'dom';
  if (forced === 'main') return hasCanvas2D ? 'main' : 'dom';
  if (hasWorker && hasOffscreen) return 'worker';
  if (hasCanvas2D) return 'main';
  return 'dom';
}

function getOpts() {
  const fontSize = +els.fontSize.value;
  return {
    maxInline: +els.width.value,
    fontSize,
    lineHeight: Math.round(fontSize * +els.lineHeight.value),
    letterSpacing: +els.letterSpacing.value,
    firstLineIndent: Math.round(fontSize * +els.indent.value),
    align: els.align.value,
    vertical: els.writingMode.value === 'vertical',
    hanging: els.hanging.checked,
    fontFamily: customFontBuffer ? `'${CUSTOM_FAMILY}',` : '' +
      `'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif`,
  };
}

// ---------- Worker 管理 ----------
function getWorker() {
  if (!worker) {
    worker = new Worker('./js/layout-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress' && msg.id === layoutSeq) {
        els.progress.value = msg.progress;
      } else if (msg.type === 'result' && msg.id === layoutSeq) {
        els.progress.value = 1;
        applyLines(msg.lines, msg.elapsed, 'Worker + OffscreenCanvas');
      }
    };
    worker.onerror = () => {
      setStatus('Worker 出错，回退主线程排版', 'warn');
      worker = null;
      runLayout();
    };
  }
  return worker;
}

// ---------- 排版调度 ----------
let layoutTimer = 0;
function scheduleLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(runLayout, 120);
}

function runLayout() {
  const mode = engineMode();
  const text = els.text.value;
  const opts = getOpts();
  highlightIndex = -1;

  if (mode === 'dom') {
    els.canvasWrap.style.display = 'none';
    els.domWrap.style.display = '';
    const t0 = performance.now();
    const { lines } = renderDOMFallback(els.domWrap, text, opts);
    applyLines(lines, performance.now() - t0, 'DOM 降级（CSS 排版 + Range 行检测）');
    return;
  }

  els.canvasWrap.style.display = '';
  els.domWrap.style.display = 'none';

  if (mode === 'worker') {
    layoutSeq++;
    els.progress.value = 0;
    getWorker().postMessage({
      type: 'layout', id: layoutSeq, text, options: opts,
      fontFamily: customFontBuffer ? CUSTOM_FAMILY : null,
      fontBuffer: customFontBuffer ? customFontBuffer.slice(0) : null,
    });
    setStatus('排版中…', '');
    return;
  }

  // 主线程 Canvas 排版（无 Worker/OffscreenCanvas 时）
  const ctx = els.canvas.getContext('2d');
  ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;
  const measure = (s) => ctx.measureText(s).width;
  const t0 = performance.now();
  const { lines } = layoutText(text, opts, measure);
  applyLines(lines, performance.now() - t0, '主线程 Canvas');
}

function applyLines(lines, elapsed, engineLabel) {
  currentLines = lines;
  requestRender();
  buildLineInfo(lines);
  els.lineCount.textContent = `${lines.length} 行`;
  els.layoutTime.textContent = `${elapsed.toFixed(1)} ms`;
  setStatus(`引擎：${engineLabel}`, 'ok');
}

function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    render(els.canvas, currentLines, getOpts(), highlightIndex);
  });
}

// ---------- 行信息面板 ----------
const REASON_LABEL = {
  wrap: '自然换行', paragraph: '段落结束', 'kinsoku-start': '避头（行首禁则）',
  'kinsoku-end': '避尾（行末禁则）', 'kinsoku-hang': '标点悬挂', overflow: '强制断词',
};
function buildLineInfo(lines) {
  const MAX_ROWS = 500;
  const rows = [];
  const n = Math.min(lines.length, MAX_ROWS);
  for (let i = 0; i < n; i++) {
    const ln = lines[i];
    const txt = ln.text.length > 24 ? ln.text.slice(0, 24) + '…' : ln.text;
    rows.push(`<tr data-i="${i}"><td>${i + 1}</td><td class="mono">${escapeHtml(txt) || '(空行)'}</td>` +
      `<td>${ln.width.toFixed(1)}</td><td>${[...ln.text].length}</td>` +
      `<td>${REASON_LABEL[ln.reason] || ln.reason}</td></tr>`);
  }
  if (lines.length > MAX_ROWS) {
    rows.push(`<tr><td colspan="5">… 其余 ${lines.length - MAX_ROWS} 行省略（性能考虑）</td></tr>`);
  }
  els.lineInfo.innerHTML = rows.join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

els.lineInfo.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]');
  if (!tr) return;
  highlightIndex = +tr.dataset.i;
  els.lineInfo.querySelectorAll('tr.hl').forEach((r) => r.classList.remove('hl'));
  tr.classList.add('hl');
  requestRender();
});

// ---------- 字体加载（FontFace + IndexedDB） ----------
async function loadFont(source) {
  els.fontStatus.textContent = '加载中…';
  try {
    let buffer, fromCache = false, label;
    if (source.file) {
      buffer = await source.file.arrayBuffer();
      label = source.file.name;
    } else {
      ({ buffer, fromCache } = await loadFontBuffer(source.url));
      label = source.url;
    }
    await registerFontFace(CUSTOM_FAMILY, buffer);
    customFontBuffer = buffer;
    // 同步给 Worker（Worker 内独立字体注册）
    if (hasWorker && hasOffscreen) {
      getWorker().postMessage({ type: 'font', family: CUSTOM_FAMILY, buffer: buffer.slice(0) });
    }
    els.fontStatus.textContent =
      `已加载 ${label.slice(0, 60)}（${(buffer.byteLength / 1024).toFixed(0)} KB${fromCache ? '，来自 IndexedDB 缓存' : ''}），正在重排…`;
    runLayout(); // 字体就绪后重排
  } catch (err) {
    els.fontStatus.textContent = `字体加载失败：${err.message || err}`;
  }
}

els.loadFontBtn.addEventListener('click', () => {
  const url = els.fontUrl.value.trim();
  if (url) loadFont({ url });
});
els.fontFile.addEventListener('change', () => {
  if (els.fontFile.files[0]) loadFont({ file: els.fontFile.files[0] });
});

// ---------- 控件绑定 ----------
function bindRange(el, out, fmt = (v) => v) {
  const update = () => { out.textContent = fmt(el.value); };
  el.addEventListener('input', () => { update(); scheduleLayout(); });
  update();
}
bindRange(els.width, els.widthVal, (v) => `${v}px`);
bindRange(els.fontSize, els.fontSizeVal, (v) => `${v}px`);
bindRange(els.lineHeight, els.lineHeightVal, (v) => `${v}×`);
bindRange(els.letterSpacing, els.letterSpacingVal, (v) => `${v}px`);
bindRange(els.indent, els.indentVal, (v) => `${v}em`);
for (const el of [els.align, els.writingMode, els.hanging, els.engine]) {
  el.addEventListener('change', scheduleLayout);
}
els.text.addEventListener('input', scheduleLayout);

function setStatus(msg, cls) {
  els.status.textContent = msg;
  els.status.className = cls;
}

// ---------- 示例文本 ----------
const SAMPLES = {
  mixed: '中English混排是排版引擎的试金石。When CJK meets Latin, 断行规则需要同时照顾两种文字体系：' +
    '中文可以在任意字间断开，but English words must stay intact. 标点符号（比如逗号、句号）不能出现在行首，' +
    '「开括号不能留在行尾」。The quick brown fox jumps over the lazy dog. 春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。',
  punct: '标点避头尾测试：句号。逗号，问号？叹号！冒号：分号；都不能出现在行首。' +
    '开括号「『（《【不能留在行尾，闭括号」』）》】不能出现在行首。' +
    '他说：「这是一段『嵌套引用』的测试（包含括号），用来验证避头尾规则是否生效。」结束。',
  longword: '超长单词测试：supercalifragilisticexpialidocious 和 ' +
    'pneumonoultramicroscopicsilicovolcanoconiosispneumonoultramicroscopicsilicovolcanoconiosis ' +
    '以及无空格长串 https://example.com/very/long/path/that/keeps/going/and/going/and/going ' +
    '都必须在行宽不足时强制按字符断开，不能溢出。',
  vertical: '竖排测试。春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。\n' +
    'English words in vertical mode 会被旋转九十度排列，CJK 字符保持直立。请切换到「竖排」模式查看效果。',
  big: null, // 动态生成
};
function bigText() {
  const para = SAMPLES.mixed + '\n';
  return para.repeat(400); // 约 10 万字符
}
els.preset.addEventListener('change', () => {
  const key = els.preset.value;
  if (!key) return;
  els.text.value = key === 'big' ? bigText() : SAMPLES[key];
  if (key === 'vertical') els.writingMode.value = 'vertical';
  runLayout();
});

// ---------- 启动 ----------
els.text.value = SAMPLES.mixed;
setStatus(
  hasWorker && hasOffscreen ? '引擎：Worker + OffscreenCanvas' :
  hasCanvas2D ? '引擎：主线程 Canvas（当前环境无 Worker/OffscreenCanvas）' :
  '引擎：DOM 降级（当前环境无 Canvas）', 'ok');
runLayout();
