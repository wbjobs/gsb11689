// DOM 降级渲染：把布局结果用绝对定位的行/span 输出。
// 适用于 Canvas 不可用（SSR/极简浏览器）或用户主动选择 DOM 渲染时。

const ALIGN_FLEX = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
  justify: 'flex-start',
};

export class DomRenderer {
  constructor(container) {
    this.container = container;
    container.style.position = 'relative';
    container.style.overflow = 'auto';
  }

  render(doc, opts) {
    const {
      fontString,
      color = '#1f2328',
      highlightLine = -1,
      padding = { x: 0, y: 0 },
      letterSpacing = 0,
    } = opts;

    const root = this.container;
    root.innerHTML = '';
    root.style.font = fontString;
    root.style.color = color;

    const vertical = doc.mode !== 'horizontal';
    root.style.writingMode =
      doc.mode === 'vertical-rl' ? 'vertical-rl' :
      doc.mode === 'vertical-lr' ? 'vertical-lr' : 'horizontal-tb';

    const lh = doc.lineThickness;

    doc.lines.forEach((line) => {
      const row = document.createElement('div');
      row.dataset.lineIndex = String(line.index);
      row.style.position = 'absolute';
      row.style.display = 'flex';
      row.style.alignItems = vertical ? 'flex-start' : 'center';
      row.style.justifyContent = ALIGN_FLEX[doc.align] || 'flex-start';
      row.style.whiteSpace = 'pre';
      row.style.lineHeight = String(lh);
      row.style.height = `${lh}px`;
      row.style.boxSizing = 'border-box';

      if (vertical) {
        row.style.top = `${padding.y}px`;
        row.style.left = `${padding.x + line.cross}px`;
        row.style.width = `${lh}px`;
        row.style.height = `${doc.size.main}px`;
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';
      } else {
        row.style.top = `${padding.y + line.cross}px`;
        row.style.left = `${padding.x}px`;
        row.style.width = `${doc.size.main}px`;
      }

      if (line.index === highlightLine) {
        row.style.background = 'rgba(9, 105, 218, 0.10)';
      }

      line.atoms.forEach((atom, i) => {
        const span = document.createElement('span');
        const gap = line.gaps[i] || 0;
        if (vertical) {
          span.style.marginTop = `${gap}px`;
        } else {
          span.style.marginLeft = `${gap}px`;
        }
        if (letterSpacing && atom.type !== 'space') {
          span.style.letterSpacing = `${letterSpacing}px`;
        }
        if (atom.type === 'space') {
          span.textContent = '\u00a0';
          // justify 时空格被拉伸：用宽度承载额外间距
          if (line.stretched) span.style.whiteSpace = 'pre';
        } else if (atom.type === 'ideoSpace') {
          span.style.width = span.style.minWidth = `${doc.em}px`;
        } else {
          span.textContent = atom.text;
        }
        if (atom.split) span.style.color = '#cf222e';
        row.appendChild(span);
      });

      root.appendChild(row);
    });

    // 容器实际尺寸
    root.style.minWidth = vertical ? `${doc.size.cross}px` : '';
    root.style.minHeight = vertical ? '' : `${doc.size.cross}px`;
    return root;
  }
}
