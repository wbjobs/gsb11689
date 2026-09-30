/**
 * dom-fallback.js — 降级方案：当 Worker / OffscreenCanvas / Canvas2D 不可用时，
 * 用 CSS 排版（writing-mode 实现竖排，line-break:strict 处理避头尾），
 * 并用 Range.getClientRects 反推行信息。
 */
export function renderDOMFallback(container, text, opts) {
  const { maxInline, fontSize, lineHeight, letterSpacing, align, firstLineIndent, fontFamily, vertical } = opts;
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'dom-fallback';
  box.style.cssText = [
    `font: ${fontSize}px ${fontFamily}`,
    `line-height: ${lineHeight}px`,
    `letter-spacing: ${letterSpacing}px`,
    `text-align: ${align === 'justify' ? 'justify' : align}`,
    `text-indent: ${firstLineIndent}px`,
    `white-space: pre-wrap`,
    `overflow-wrap: anywhere`,       // 超长单词强制断开
    `line-break: strict`,            // 严格避头尾
    `word-break: normal`,
    `background: #fff`,
    `padding: 20px`,
    vertical ? `writing-mode: vertical-rl` : '',
    vertical ? `height: ${maxInline + 40}px` : `width: ${maxInline + 40}px`,
  ].join(';');

  const frag = document.createDocumentFragment();
  for (const para of text.split(/\r\n|\n/)) {
    const p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = para || ' ';
    frag.appendChild(p);
  }
  box.appendChild(frag);
  container.appendChild(box);

  // 用 Range 反推行信息
  const lines = [];
  const range = document.createRange();
  const boxRect = box.getBoundingClientRect();
  let paraIndex = 0;
  for (const p of box.querySelectorAll('p')) {
    const node = p.firstChild;
    if (!node || !node.textContent) { paraIndex++; continue; }
    const len = node.textContent.length;
    let lineStart = 0;
    let lineKey = null;
    for (let i = 1; i <= len; i++) {
      range.setStart(node, lineStart);
      range.setEnd(node, i);
      const r = range.getBoundingClientRect();
      // 横排按 top 分行，竖排按 right 分列
      const key = vertical ? Math.round(r.right) : Math.round(r.top);
      if (lineKey === null) lineKey = key;
      if (key !== lineKey || i === len) {
        const segEnd = key !== lineKey ? i - 1 : i;
        range.setStart(node, lineStart);
        range.setEnd(node, segEnd);
        const lr = range.getBoundingClientRect();
        lines.push({
          index: lines.length,
          text: node.textContent.slice(lineStart, segEnd),
          width: vertical ? Math.round(lr.height) : Math.round(lr.width),
          reason: segEnd === len ? 'paragraph' : 'wrap',
          paraIndex,
          paraLast: segEnd === len,
        });
        lineStart = segEnd;
        lineKey = key;
      }
    }
    paraIndex++;
  }
  return { lines, boxRect };
}
