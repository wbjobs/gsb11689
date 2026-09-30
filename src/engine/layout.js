// 贪心断行 + 避头尾处理 + 对齐/缩进/拉伸。
// 横排与竖排共用同一套沿“主轴”的抽象布局，渲染端负责把主轴映射到 x / y。

import {
  isClosePunct,
  isOpenPunct,
  needsCjkLatinGap,
} from './chars.js';

const EPS = 0.01;

// 带缓存的测量器：所有文本宽度只测一次
export function createMeasurer(host, fontString) {
  const cache = new Map();
  return {
    fontString,
    width(text) {
      let w = cache.get(text);
      if (w === undefined) {
        w = host.measureWidth(text, fontString);
        cache.set(text, w);
      }
      return w;
    },
    clear() {
      cache.clear();
    },
  };
}

function atomAdvance(atom, measurer, em, mode, letterSpacing) {
  let w;
  switch (atom.type) {
    case 'space':
      w = measurer.width(' ') || em * 0.5;
      break;
    case 'ideoSpace':
      w = em;
      break;
    case 'char':
      if (mode !== 'horizontal') {
        w = atom.ch.codePointAt(0) < 0x2e80 ? measurer.width(atom.text) : em;
      } else {
        w = measurer.width(atom.text);
      }
      break;
    default:
      w = measurer.width(atom.text);
  }
  return w + letterSpacing;
}

// 两个已落在同一行的 atom 之间的固定间隙（中英文 1/4em 自动间距）
function gapBetween(prev, next, em, opts) {
  if (!prev || !next) return 0;
  if (prev.type === 'space' || next.type === 'space') return 0;
  if (opts.cjkLatinSpacing !== false && needsCjkLatinGap(prev, next)) {
    return em * 0.25;
  }
  return 0;
}

function splitWord(atom) {
  return Array.from(atom.text).map((ch, i) => ({
    type: 'word',
    ch,
    text: ch,
    split: true,
    splitIndex: i,
    start: atom.start + i,
    end: atom.start + i + 1,
  }));
}

export function layoutDocument(paragraphs, options) {
  const opts = {
    mode: 'horizontal',
    align: 'left',
    fontSize: 16,
    lineHeight: 1.6,
    letterSpacing: 0,
    measureLength: 400,
    textIndent: 0,
    paragraphSpacing: 0,
    padding: { main: 0, cross: 0 },
    containerCross: 0,
    cjkLatinSpacing: true,
    kinsoku: true,
    hangingPunct: true,
    measurer: null,
    ...options,
  };

  const em = opts.fontSize;
  const lh = em * opts.lineHeight;
  const measurer = opts.measurer;
  const avail = Math.max(em * 0.5, opts.measureLength - opts.padding.main * 2);
  const advance = (a) => atomAdvance(a, measurer, em, opts.mode, opts.letterSpacing);

  const lines = [];
  const paraInfo = [];

  let crossPos = opts.padding.cross;

  paragraphs.forEach((para, pIndex) => {
    const startLine = lines.length;
    let line = null;
    const newLine = (isFirst) => ({
      paraIndex: pIndex,
      atoms: [],
      gaps: [],
      used: isFirst ? opts.textIndent * em : 0,
      indent: isFirst ? opts.textIndent * em : 0,
      first: isFirst,
      last: false,
      hanging: false,
      stretched: false,
      stretchAmount: 0,
      justifySpaces: false,
      overlongSplit: false,
      breakReason: null,
    });

    const finalize = (reason) => {
      if (!line || line.atoms.length === 0) return;
      while (line.atoms.length && line.atoms[line.atoms.length - 1].type === 'space') {
        const sp = line.atoms.pop();
        line.gaps.pop();
        line.used -= advance(sp);
        const before = line.atoms[line.atoms.length - 1];
        if (before) line.used -= gapBetween(before, sp, em, opts);
      }
      if (!line.atoms.length) { line = null; return; }
      // 押込标记具有持续性：后续再发生普通换行时原因仍记为 kinsoku-push
      line.breakReason = line.breakReason === 'kinsoku-push' && reason !== 'hanging'
        ? 'kinsoku-push'
        : reason;
      lines.push(line);
      line = null;
    };

    line = newLine(true);
    const queue = para.atoms.slice();

    while (queue.length) {
      const a = queue.shift();

      if (line.atoms.length === 0) {
        if (a.type === 'space') continue;
        if (a.type === 'word' && line.indent + advance(a) > avail && Array.from(a.text).length > 1) {
          line.overlongSplit = true;
          queue.unshift(...splitWord(a));
          continue;
        }
        line.atoms.push(a);
        line.gaps.push(line.indent);
        line.used += line.indent + advance(a);
        continue;
      }

      const prev = line.atoms[line.atoms.length - 1];

      // 空格作为词间“胶水”：放进行末，是否保留到下一行由行首压缩决定
      if (a.type === 'space') {
        const g = gapBetween(prev, a, em, opts);
        line.atoms.push(a);
        line.gaps.push(g);
        line.used += g + advance(a);
        continue;
      }

      const gap = gapBetween(prev, a, em, opts);
      const w = advance(a);
      // 行末若以空格收尾，断点在空格处；空格本身宽度与它两侧的间隙都不占本行
      const trimSpace =
        prev.type === 'space'
          ? advance(prev) +
            gap +
            (line.atoms.length >= 2
              ? gapBetween(line.atoms[line.atoms.length - 2], prev, em, opts)
              : 0)
          : 0;
      const fits = line.used - trimSpace + w <= avail + EPS;

      if (fits) {
        line.atoms.push(a);
        line.gaps.push(gap);
        line.used += gap + w;
        continue;
      }

      // 1) 悬挂：、。，． 挂到行末框外
      if (
        opts.kinsoku !== false &&
        opts.hangingPunct !== false &&
        (a.ch === '\u3001' || a.ch === '\u3002' || a.ch === '\uff0c' || a.ch === '\uff0e')
      ) {
        line.atoms.push(a);
        line.gaps.push(gap);
        line.hanging = true;
        finalize('hanging');
        line = newLine(false);
        continue;
      }

      // 2) 押し込み：闭标点挤进行末（仅限尚未发生押込且本行非空时一次，避免无限累计）
      if (
        opts.kinsoku !== false &&
        isClosePunct(a.ch) &&
        line.breakReason !== 'kinsoku-push'
      ) {
        line.atoms.push(a);
        line.gaps.push(gap);
        line.used += gap + w;
        line.breakReason = 'kinsoku-push';
        continue;
      }

      // 3) 追い出し：行末开标点挪到下一行（先剥掉行末胶水空格）
      if (opts.kinsoku !== false && isOpenPunct(prev.ch)) {
        while (
          line.atoms.length > 1 &&
          line.atoms[line.atoms.length - 1].type === 'space'
        ) {
          const sp = line.atoms.pop();
          line.gaps.pop();
          line.used -= advance(sp);
          queue.unshift(sp);
        }
        const pulled = [];
        while (
          line.atoms.length > 1 &&
          isOpenPunct(line.atoms[line.atoms.length - 1].ch)
        ) {
          const p = line.atoms.pop();
          line.gaps.pop();
          pulled.unshift(p);
          line.used -= advance(p);
          const before = line.atoms[line.atoms.length - 1];
          if (before) line.used -= gapBetween(before, p, em, opts);
        }
        finalize('kinsoku-pull');
        line = newLine(false);
        queue.unshift(...pulled, a);
        continue;
      }

      // 4) 超长单词拆字
      if (a.type === 'word' && w > avail) {
        line.overlongSplit = true;
        queue.unshift(...splitWord(a));
        continue;
      }

      // 5) 普通换行
      finalize('overflow');
      line = newLine(false);
      queue.unshift(a);
    }

    if (line) line.last = true;
    finalize('eol');

    if (para.atoms.length === 0) {
      const empty = newLine(true);
      empty.last = true;
      empty.breakReason = 'empty';
      lines.push(empty);
    }

    const endLine = lines.length;
    paraInfo.push({ index: pIndex, startLine, endLine });
    crossPos += (endLine - startLine) * lh + opts.paragraphSpacing;
  });

  // —— 对齐 ——
  for (const line of lines) {
    const indent = line.indent;
    const contentUsed = line.used - indent;
    const free = avail - contentUsed;
    line.avail = avail;
    line.freeSpace = Math.max(0, free);
    line.stretchAmount = 0;

    let startOffset = indent;
    if (line.atoms.length && free > EPS) {
      if (opts.align === 'center') startOffset += free / 2;
      else if (opts.align === 'right') startOffset += free;
      else if (opts.align === 'justify' && !line.last) {
        const spaceIdx = [];
        const breakIdx = [];
        for (let i = 1; i < line.atoms.length; i++) {
          if (line.atoms[i - 1].type === 'space') spaceIdx.push(i);
          else breakIdx.push(i);
        }
        const positions = spaceIdx.length ? spaceIdx : breakIdx;
        if (positions.length) {
          const add = free / positions.length;
          for (const i of positions) line.gaps[i] += add;
          line.stretched = true;
          line.stretchAmount = free;
          line.justifySpaces = spaceIdx.length > 0;
        }
      }
    }
    line.startOffset = startOffset;

    let main = startOffset;
    line.positions = line.atoms.map((atom, i) => {
      main += line.gaps[i] || 0;
      const off = main;
      main += advance(atom);
      return off;
    });
    line.text = line.atoms
      .map((a) => (a.type === 'space' ? ' ' : a.text))
      .join('');
  }

  // —— 交叉轴定位 ——
  let cross = opts.padding.cross;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.index = i;
    line.lineThickness = lh;
    if (opts.mode === 'vertical-rl') {
      line.cross = opts.containerCross - opts.padding.cross - cross - lh;
    } else {
      line.cross = cross;
    }
    cross += lh;
    const next = lines[i + 1];
    if (next && next.paraIndex !== line.paraIndex && next.first) {
      cross += opts.paragraphSpacing;
    }
  }

  return {
    lines,
    paragraphs: paraInfo,
    size: { main: opts.measureLength, cross },
    lineThickness: lh,
    em,
    mode: opts.mode,
    align: opts.align,
  };
}
