/**
 * renderer.js — Canvas 渲染：横排 / 竖排、对齐、两端对齐、字距、行高亮
 */
const PAD = 20;

export function computeCanvasSize(lines, opts) {
  const { maxInline, lineHeight, vertical } = opts;
  if (vertical) {
    return {
      width: Math.max(1, lines.length) * lineHeight + PAD * 2,
      height: maxInline + PAD * 2,
    };
  }
  return {
    width: maxInline + PAD * 2,
    height: Math.max(1, lines.length) * lineHeight + PAD * 2,
  };
}

function alignOffset(line, align) {
  const slack = line.avail - line.width;
  if (align === 'center') return Math.max(0, slack / 2);
  if (align === 'right') return Math.max(0, slack);
  return 0;
}

function justifyGap(line, align) {
  if (align !== 'justify' || line.paraLast || line.items.length < 2) return 0;
  const slack = line.avail - line.width;
  return slack > 0 ? slack / (line.items.length - 1) : 0;
}

export function render(canvas, lines, opts, highlightIndex = -1) {
  const { fontSize, lineHeight, letterSpacing, fontFamily, align, vertical } = opts;
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = computeCanvasSize(lines, opts);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#1a1a1a';

  const lineRects = [];

  lines.forEach((line, li) => {
    const gap = justifyGap(line, align);
    const offset = alignOffset(line, align) + line.indent;

    if (vertical) {
      // 竖排：列从右往左，行内方向自上而下
      const colX = width - PAD - lineHeight / 2 - li * lineHeight;
      if (li === highlightIndex) {
        ctx.fillStyle = 'rgba(66,133,244,.18)';
        ctx.fillRect(colX - lineHeight / 2, PAD - 4, lineHeight, height - PAD * 2 + 8);
        ctx.fillStyle = '#1a1a1a';
      }
      let y = PAD + offset;
      for (const it of line.items) {
        if (it.type === 'word' || it.type === 'wordchar') {
          // 竖排中的拉丁词：整体顺时针旋转 90°
          const w = ctx.measureText(it.text).width + letterSpacing * [...it.text].length;
          ctx.save();
          ctx.translate(colX, y);
          ctx.rotate(Math.PI / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          drawSpaced(ctx, it.text, 0, fontSize * 0.12, letterSpacing);
          ctx.restore();
          y += w + gap;
        } else {
          for (const ch of it.text) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, colX, y + fontSize / 2);
            y += fontSize + letterSpacing;
          }
          y += gap;
        }
      }
      lineRects.push({ x: colX - lineHeight / 2, y: PAD, w: lineHeight, h: height - PAD * 2 });
    } else {
      // 横排
      const lineTop = PAD + li * lineHeight;
      const baseline = lineTop + (lineHeight - fontSize) / 2 + fontSize * 0.82;
      if (li === highlightIndex) {
        ctx.fillStyle = 'rgba(66,133,244,.18)';
        ctx.fillRect(PAD - 4, lineTop, width - PAD * 2 + 8, lineHeight);
        ctx.fillStyle = '#1a1a1a';
      }
      let x = PAD + offset;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (const it of line.items) {
        x = drawSpaced(ctx, it.text, x, baseline, letterSpacing);
        x += gap;
      }
      lineRects.push({ x: PAD, y: lineTop, w: width - PAD * 2, h: lineHeight });
    }
  });

  return lineRects;
}

/** 逐字绘制以应用字距；letterSpacing 为 0 时整串绘制（更快） */
function drawSpaced(ctx, text, x, y, letterSpacing) {
  if (!letterSpacing) {
    ctx.fillText(text, x, y);
    return x + ctx.measureText(text).width;
  }
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + letterSpacing;
  }
  return x;
}
