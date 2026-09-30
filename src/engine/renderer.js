// 把布局结果绘制到 2D Canvas（横排 / 竖排）。
import { isFullWidthPunct, isIdeograph } from './chars.js';

export class CanvasRenderer {
  constructor(ctx, host) {
    this.ctx = ctx;
    this.host = host; // 提供 setFont
  }

  render(doc, opts) {
    const {
      fontString,
      color = '#1f2328',
      highlightLine = -1,
      showBoxes = false,
      padding = { x: 0, y: 0 },
      letterSpacing = 0,
    } = opts;
    this.letterSpacing = letterSpacing;

    const ctx = this.ctx;
    this.host.setFont(fontString);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const lh = doc.lineThickness;
    const em = doc.em;
    const vertical = doc.mode !== 'horizontal';

    doc.lines.forEach((line) => {
      if (line.index === highlightLine) {
        ctx.fillStyle = 'rgba(9, 105, 218, 0.10)';
        this._lineRect(line, lh, padding, doc);
        ctx.fillStyle = color;
      }
      if (showBoxes) this._outline(line, lh, padding, doc);

      line.atoms.forEach((atom, i) => {
        const pos = line.positions[i];
        if (vertical) {
          this._drawVertical(atom, line, pos, i, em, lh, padding);
        } else {
          this._drawHorizontal(atom, line, pos, i, em, lh, padding);
        }
      });
    });
  }

  _lineRect(line, lh, padding, doc) {
    const ctx = this.ctx;
    if (doc.mode === 'horizontal') {
      ctx.fillRect(padding.x, padding.y + line.cross, doc.size.main, lh);
    } else if (doc.mode === 'vertical-rl') {
      ctx.fillRect(padding.x + line.cross, padding.y, lh, doc.size.main);
    } else {
      ctx.fillRect(padding.x + line.cross, padding.y, lh, doc.size.main);
    }
  }

  _outline(line, lh, padding, doc) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 122, 11, 0.55)';
    ctx.lineWidth = 1;
    if (doc.mode === 'horizontal') {
      ctx.strokeRect(padding.x + 0.5, padding.y + line.cross + 0.5, doc.size.main - 1, lh - 1);
    } else {
      ctx.strokeRect(padding.x + line.cross + 0.5, padding.y + 0.5, lh - 1, doc.size.main - 1);
    }
    ctx.restore();
  }

  _drawHorizontal(atom, line, pos, i, em, lh, padding) {
    const ctx = this.ctx;
    const x = padding.x + pos;
    const y = padding.y + line.cross + lh / 2;
    if (atom.type === 'space' || atom.type === 'ideoSpace') return;
    if (this.letterSpacing && atom.text.length > 1) {
      this._fillTracked(atom.text, x, y, this.letterSpacing);
    } else {
      ctx.fillText(atom.text, x, y);
    }
  }

  // 显式逐字符绘制以实现字距（不依赖 ctx.letterSpacing）
  _fillTracked(text, x, y, tracking) {
    const ctx = this.ctx;
    let cx = x;
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + tracking;
    }
  }

  _drawVertical(atom, line, pos, i, em, lh, padding) {
    const ctx = this.ctx;
    const y = padding.y + pos + em / 2;
    const x = padding.x + line.cross + lh / 2;

    if (atom.type === 'space' || atom.type === 'ideoSpace') return;

    const upright =
      isIdeograph(atom.ch) ||
      isFullWidthPunct(atom.ch) ||
      atom.ch.codePointAt(0) >= 0x2e80;

    if (upright || atom.text.length === 1) {
      // CJK、全角标点、数字：直立
      ctx.save();
      // 竖排标点位置微调（逗号/句号/括号类的传统位置）
      let dx = 0;
      let dy = 0;
      if ('、，'.includes(atom.ch)) { dx = em * 0.18; dy = em * 0.18; }
      else if ('。'.includes(atom.ch)) { dx = em * 0.18; dy = em * 0.18; }
      ctx.fillText(atom.text, x + dx, y + dy);
      ctx.restore();
    } else {
      // 西文单词：整词顺时针旋转 90°
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(atom.text, 0, 0);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }
}

// 命中测试：根据像素坐标找到对应行
export function hitTestLine(doc, x, y, padding) {
  const pad = padding || { x: 0, y: 0 };
  if (doc.mode === 'horizontal') {
    for (const line of doc.lines) {
      const top = pad.y + line.cross;
      if (y >= top && y <= top + line.lineThickness) return line.index;
    }
  } else {
    for (const line of doc.lines) {
      const left = pad.x + line.cross;
      if (x >= left && x <= left + line.lineThickness) return line.index;
    }
  }
  return -1;
}
