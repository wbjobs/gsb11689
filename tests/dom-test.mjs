// 极简 DOM 垫片，仅实现 DomRenderer 用到的接口
import assert from 'node:assert/strict';
import { tokenize } from '../src/engine/tokenize.js';
import { layoutDocument, createMeasurer } from '../src/engine/layout.js';
import { createMockHost } from './mock-host.js';

class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this._innerHTML = '';
  }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  set innerHTML(v) { this._innerHTML = v; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  addEventListener() {}
}
globalThis.document = {
  createElement: (t) => new El(t),
};

const { DomRenderer } = await import('../src/engine/dom-renderer.js');

const paras = tokenize('第一段中英文English混排，测试DOM降级。\n第二段数字3.14整体。');
const measurer = createMeasurer(createMockHost(16));
const doc = layoutDocument(paras, { measurer, measureLength: 200, fontSize: 16, lineHeight: 1.6, textIndent: 2, align: 'justify' });

const container = new El('div');
const renderer = new DomRenderer(container);
renderer.render(doc, { fontString: '16px serif', padding: { x: 16, y: 16 } });

assert.equal(container.children.length, doc.lines.length, '每行一个 div');
let textSum = '';
for (const row of container.children) {
  assert.ok(row.style.position === 'absolute');
  const spans = row.children;
  assert.ok(spans.length > 0);
  textSum += spans.map((s) => (s.textContent === '\u00a0' ? ' ' : s.textContent)).join('');
}
assert.ok(textSum.includes('English'));
assert.ok(textSum.includes('3.14'));
assert.ok(container.style.font.includes('serif'));
console.log(`DOM 降级渲染 ${doc.lines.length} 行，重建文本 ${textSum.length} 字符：OK`);

// 竖排容器样式
const vdoc = layoutDocument(tokenize('竖排測試豎排測試豎排測試'), {
  measurer, measureLength: 64, fontSize: 16, mode: 'vertical-rl', containerCross: 400,
});
const c2 = new El('div');
new DomRenderer(c2).render(vdoc, { fontString: '16px serif', padding: { x: 0, y: 0 } });
assert.equal(c2.style.writingMode, 'vertical-rl');
assert.ok(c2.children[0].style.flexDirection === 'column');
console.log('竖排 DOM writing-mode=vertical-rl：OK');
