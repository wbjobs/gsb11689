import { LayoutClient } from '../lib/layout-client.js';
import { FontManager, onDocumentFontsReady } from '../lib/font-manager.js';
import { CanvasRenderer, hitTestLine } from '../engine/renderer.js';
import { DomRenderer } from '../engine/dom-renderer.js';
import { buildFontString } from '../lib/canvas-host.js';
import { SAMPLES, buildLargeText } from './samples.js';

const $ = (id) => document.getElementById(id);

const state = {
  mode: 'canvas',            // canvas | dom
  doc: null,
  ms: 0,
  backend: '',
  highlight: -1,
  virtualize: true,
  raf: 0,
  customFont: null,         // { family, buffer }
  fontFamilyBase: '"Noto Serif SC", "Songti SC", "SimSun", "Noto Sans CJK SC", serif',
};

const els = {
  canvas: $('canvas'),
  canvasWrap: $('canvasWrap'),
  domStage: $('domStage'),
  tbody: $('lineTable').querySelector('tbody'),
};

const client = new LayoutClient(new URL('../worker/layout-worker.js', import.meta.url));
const fonts = new FontManager();

function readOptions() {
  const mode = $('mode').value;
  const fontSize = Number($('fontSize').value);
  const custom = state.customFont;
  return {
    mode,
    align: $('align').value,
    fontSize,
    lineHeight: Number($('lineHeight').value),
    letterSpacing: Number($('letterSpacing').value),
    measureLength: Number($('measure').value),
    containerCross: mode === 'horizontal'
      ? els.canvasWrap.clientWidth
      : els.canvasWrap.clientHeight,
    textIndent: Number($('textIndent').value),
    paragraphSpacing: Number($('paraSpacing').value) * fontSize,
    fontFamily: custom ? `"${custom.family}", ${state.fontFamilyBase}` : state.fontFamilyBase,
    fontWeight: $('fontWeight').value,
    fontStyle: 'normal',
    kinsoku: $('kinsoku').checked,
    hangingPunct: $('hanging').checked,
    cjkLatinSpacing: $('cjkLatin').checked,
    padding: { main: 16, cross: 16 },
  };
}

function fontStringOf(opts) {
  return buildFontString(opts);
}

// —— Canvas 尺寸与虚拟滚动 ——
function ensureCanvasSize(doc, opts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // 悬挂标点会挂出框缘 em，预留余量避免裁切
  const bleed = opts.fontSize;
  const width = Math.max(opts.measureLength + opts.padding.main * 2 + bleed, 320);
  const height = Math.max(doc.size.cross + opts.padding.cross * 2 + bleed, 200);
  const canvas = els.canvas;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

// 只绘制视口内（横排按 cross/行高；竖排按列 cross）的行
function visibleRange(doc) {
  const wrap = els.canvasWrap;
  const start = doc.mode === 'horizontal' ? wrap.scrollTop : wrap.scrollLeft;
  const view = doc.mode === 'horizontal' ? wrap.clientHeight : wrap.clientWidth;
  const lh = doc.lineThickness;
  let from = 0;
  let to = doc.lines.length;
  if (state.virtualize && doc.lines.length > 200) {
    from = Math.max(0, Math.floor((start - 100) / lh) - 5);
    to = Math.min(doc.lines.length, Math.ceil((start + view + 100) / lh) + 5);
  }
  return { from, to };
}

function renderCanvas(doc, opts) {
  const { ctx } = ensureCanvasSize(doc, opts);
  const fontString = fontStringOf(opts);
  const renderer = new CanvasRenderer(ctx, { setFont: (f) => { ctx.font = f; } });

  const { from, to } = visibleRange(doc);
  const slice = {
    ...doc,
    lines: doc.lines.slice(from, to),
  };
  renderer.render(slice, {
    fontString,
    color: '#1f2328',
    highlightLine: state.highlight,
    showBoxes: $('showBoxes').checked,
    padding: opts.padding,
    letterSpacing: opts.letterSpacing,
  });
  $('stageInfo').textContent =
    `${doc.lines.length} 行 · 画布 ${els.canvas.style.width}×${els.canvas.style.height}` +
    (state.virtualize && doc.lines.length > 200 ? ` · 虚拟绘制 ${from + 1}-${to}` : '');
}

function renderDom(doc, opts) {
  els.canvas.hidden = true;
  els.domStage.hidden = false;
  const renderer = new DomRenderer(els.domStage);
  renderer.render(doc, {
    fontString: fontStringOf(opts),
    highlightLine: state.highlight,
    padding: opts.padding,
    letterSpacing: opts.letterSpacing,
  });
  $('renderMode').textContent = 'DOM 降级';
  $('stageInfo').textContent = `${doc.lines.length} 行`;
}

// —— 行信息表 ——
const REASON_LABEL = {
  overflow: '宽度溢出',
  hanging: '悬挂',
  'kinsoku-push': '押込',
  'kinsoku-pull': '追出',
  eol: '段落结束',
  empty: '空段落',
};

function renderTable(doc) {
  const frag = document.createDocumentFragment();
  const trs = new Array(doc.lines.length);
  doc.lines.forEach((line) => {
    const tr = document.createElement('tr');
    if (line.index === state.highlight) tr.classList.add('active');
    const tags = [];
    if (line.indent > 0) tags.push('<span class="tag tag-indent">缩进</span>');
    if (line.hanging) tags.push('<span class="tag tag-hang">悬挂</span>');
    if (line.breakReason === 'kinsoku-push') tags.push('<span class="tag tag-push">押込</span>');
    if (line.breakReason === 'kinsoku-pull') tags.push('<span class="tag tag-pull">追出</span>');
    if (line.stretched) tags.push('<span class="tag tag-stretch">拉伸</span>');
    if (line.atoms.some((a) => a.split)) tags.push('<span class="tag tag-split">拆字</span>');
    tr.innerHTML =
      `<td>${line.index + 1}</td>` +
      `<td class="text-cell">${tags.join('')}${escapeHtml(line.text || '(空行)')}</td>` +
      `<td>${line.used.toFixed(1)}</td>` +
      `<td>${Math.max(0, line.freeSpace).toFixed(1)}</td>` +
      `<td>${line.stretched ? '+' + line.stretchAmount.toFixed(1) : '—'}</td>` +
      `<td>${REASON_LABEL[line.breakReason] || line.breakReason || ''}</td>` +
      `<td>P${line.paraIndex + 1}${line.first ? '·首' : ''}${line.last ? '·末' : ''}</td>`;
    tr.addEventListener('click', () => {
      state.highlight = line.index;
      scheduleRender(0);
      syncTableSelection(doc);
      scrollLineIntoView(line);
    });
    trs[line.index] = tr;
    frag.appendChild(tr);
  });
  els.tbody.innerHTML = '';
  els.tbody.appendChild(frag);
  $('lineCount').textContent = `（${doc.lines.length} 行，点击任意行高亮）`;
  doc._trs = trs;
}

function syncTableSelection(doc) {
  doc._trs?.forEach((tr, i) => tr.classList.toggle('active', i === state.highlight));
}

function scrollLineIntoView(line) {
  const wrap = els.canvasWrap;
  if (state.mode === 'dom') return;
  if (state.doc.mode === 'horizontal') {
    wrap.scrollTo({ top: line.cross - 40, behavior: 'smooth' });
  } else {
    wrap.scrollTo({ left: line.cross - 40, behavior: 'smooth' });
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// —— 调度（debounce + raf）——
let scheduleTimer = 0;
function scheduleRender(delay = 40) {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(runLayout, delay);
}

async function runLayout() {
  const text = $('text').value;
  $('charCount').textContent = `${[...text].length.toLocaleString()} 字符`;
  const opts = readOptions();
  try {
    const { doc, ms, backend } = await client.layout(text, opts);
    state.doc = doc;
    state.ms = ms;
    state.backend = backend;
    $('layoutTime').textContent =
      `排版耗时 ${ms.toFixed?.(1) || ms} ms · ${backend === 'worker' ? 'Web Worker' : '主线程'}`;
    if (state.highlight >= doc.lines.length) state.highlight = -1;
    if (state.mode === 'dom') {
      renderDom(doc, opts);
    } else {
      els.canvas.hidden = false;
      els.domStage.hidden = true;
      $('renderMode').textContent = 'Canvas';
      renderCanvas(doc, opts);
    }
    renderTable(doc);
  } catch (err) {
    console.error(err);
    $('layoutTime').textContent = `排版失败：${err.message}`;
  }
}

// —— 交互绑定 ——
function bindControls() {
  const controlIds = [
    'mode', 'align', 'fontSize', 'lineHeight', 'letterSpacing',
    'textIndent', 'measure', 'paraSpacing', 'kinsoku', 'hanging',
    'cjkLatin', 'showBoxes', 'fontWeight',
  ];
  for (const id of controlIds) {
    $(id).addEventListener('input', () => {
      syncLabels();
      scheduleRender(id === 'text' ? 120 : 30);
    });
  }
  $('text').addEventListener('input', () => scheduleRender(120));

  $('genLarge').addEventListener('click', () => {
    $('text').value = buildLargeText(100000);
    scheduleRender(0);
  });

  $('useCanvas').addEventListener('click', () => {
    state.mode = 'canvas';
    scheduleRender(0);
  });
  $('useDom').addEventListener('click', () => {
    state.mode = 'dom';
    scheduleRender(0);
  });
  $('virtualize').addEventListener('change', (e) => {
    state.virtualize = e.target.checked;
    scheduleRender(0);
  });

  // 画布点击：命中行 -> 高亮 + 表格联动
  els.canvas.addEventListener('click', (e) => {
    if (!state.doc) return;
    const rect = els.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = hitTestLine(state.doc, x, y, { x: 16, y: 16 });
    if (idx >= 0) {
      state.highlight = idx;
      renderCanvas(state.doc, readOptions());
      syncTableSelection(state.doc);
      const row = els.tbody.children[idx];
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  els.canvasWrap.addEventListener(
    'scroll',
    () => {
      if (state.mode === 'canvas' && state.doc) {
        cancelAnimationFrame(state.raf);
        state.raf = requestAnimationFrame(() => renderCanvas(state.doc, readOptions()));
      }
    },
    { passive: true }
  );

  window.addEventListener('resize', () => scheduleRender(120));
}

function syncLabels() {
  $('fontSizeVal').textContent = $('fontSize').value;
  $('lineHeightVal').textContent = $('lineHeight').value;
  $('letterSpacingVal').textContent = $('letterSpacing').value;
  $('textIndentVal').textContent = $('textIndent').value;
  $('measureVal').textContent = $('measure').value;
  $('paraSpacingVal').textContent = $('paraSpacing').value;
}

// —— 字体加载与“加载后重排” ——
async function bindFontControls() {
  $('loadFont').addEventListener('click', async () => {
    const family = $('fontFamily').value.trim();
    const url = $('fontUrl').value.trim();
    const status = $('fontStatus');
    if (!family || !url) {
      status.textContent = '请同时填写字体族名和字体文件 URL。';
      return;
    }
    status.textContent = '正在加载/读取缓存…';
    const result = await fonts.load(family, url);
    if (!result.ok) {
      status.textContent = `加载失败：${result.error}（排版继续使用回退字体）`;
      return;
    }
    status.textContent =
      `字体“${family}”已${result.fromCache ? '从 IndexedDB 缓存' : '下载并缓存'}加载，正在通知 Worker 并重排…`;
    const buffer = await fonts.getBuffer(family);
    if (buffer) await client.registerFont(family, buffer.slice(0));
    state.customFont = { family, buffer };
    await runLayout();
    status.textContent = `字体“${family}”生效，已完成重排。`;
  });

  $('clearFont').addEventListener('click', async () => {
    const family = $('fontFamily').value.trim();
    await fonts.unload(family);
    if (state.customFont?.family === family) state.customFont = null;
    $('fontStatus').textContent = `已清除“${family}”的缓存与注册。`;
    await runLayout();
  });

  // 文档内任意字体（如 CSS @font-face）就绪后自动重排一次
  onDocumentFontsReady((src) => {
    $('fontStatus').textContent = `检测到字体就绪事件（${src}），自动重排…`;
    scheduleRender(0);
  });
}

// —— 示例 ——
function initSamples() {
  const sel = $('sample');
  SAMPLES.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    $('text').value = SAMPLES[Number(sel.value)].text;
    scheduleRender(0);
  });
  $('text').value = SAMPLES[0].text;
}

async function init() {
  bindControls();
  syncLabels();
  initSamples();
  bindFontControls();

  const { backend } = await client.start();
  $('backend').textContent = backend === 'worker'
    ? 'Web Worker 排版中'
    : 'Worker 不可用 · 主线程排版';
  await runLayout();
}

init();
