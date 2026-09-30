/**
 * layout.js — 纯排版引擎（无 DOM 依赖，可在 Worker / 主线程复用）
 *
 * 输入文本 + 排版参数 + measure(text)=>width 函数，
 * 输出行数组：每行包含 items、宽度、缩进、断行原因等。
 * 渲染坐标（横排/竖排）由渲染层根据行信息计算。
 */

// 行首禁则（避头）：不能出现在行首的字符
export const KINSOKU_START = new Set([...
  '。、，．；：？！‥…‼⁇⁈⁉）〕］｝〉》」』】〙〛’”»›ゝゞ々〆ヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖ〜～·％‰‵′″℃°'.split(''),
  ...',.;:!?)]}%-–—/'.split(''),
]);
// 行末禁则（避尾）：不能出现在行尾的字符
export const KINSOKU_END = new Set([...
  '（〔［｛〈《「『【〘〚‘“«‹'.split(''),
  ...'([{£¥$＃＠@„'.split(''),
]);

const RE_LATIN = /[A-Za-z0-9]/;
const RE_CJK = /[㐀-䶿一-鿿豈-﫿]/;
const RE_KANA = /[぀-ヿ]/;

export function isCJK(ch) { return RE_CJK.test(ch) || RE_KANA.test(ch); }

/**
 * 分词：newline / space / word（拉丁词，含内部 .'-）/ punct / cjk
 */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      tokens.push({ type: 'newline', text: '\n' });
      i++;
    } else if (ch === ' ' || ch === '\t' || ch === ' ') {
      let j = i;
      while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === ' ')) j++;
      tokens.push({ type: 'space', text: text.slice(i, j) });
      i = j;
    } else if (RE_LATIN.test(ch)) {
      let j = i;
      while (j < n) {
        const c = text[j];
        if (RE_LATIN.test(c)) { j++; continue; }
        // 词内连接符：后面仍跟拉丁字符则并入词内（don't, e-mail, 3.14）
        if ((c === "'" || c === '.' || c === '-' || c === '’') && j + 1 < n && RE_LATIN.test(text[j + 1])) { j++; continue; }
        break;
      }
      tokens.push({ type: 'word', text: text.slice(i, j) });
      i = j;
    } else {
      tokens.push({ type: isCJK(ch) ? 'cjk' : 'punct', text: ch });
      i++;
    }
  }
  return tokens;
}

/**
 * 排版主入口。
 * @param {string} text
 * @param {object} opts
 *   maxInline      行内方向可用长度（横排=宽，竖排=高）px
 *   fontSize       字号 px
 *   lineHeight     行高 px
 *   letterSpacing  字距 px
 *   firstLineIndent 段落首行缩进 px
 *   hanging        是否允许标点悬挂（ぶら下がり）
 * @param {(s:string)=>number} measure 测量文本宽度（不含字距）
 * @returns {{lines: Array, paraCount: number}}
 */
export function layoutText(text, opts, measure) {
  const { maxInline, fontSize, letterSpacing, firstLineIndent, hanging } = opts;
  const hangAllow = hanging ? fontSize : 0;

  const widthCache = new Map();
  const rawWidth = (s) => {
    let w = widthCache.get(s);
    if (w === undefined) { w = measure(s); widthCache.set(s, w); }
    return w;
  };
  const itemWidth = (it) => rawWidth(it.text) + letterSpacing * [...it.text].length;

  // 切段
  const paragraphs = [[]];
  for (const t of tokenize(text)) {
    if (t.type === 'newline') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(t);
  }

  const lines = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const items = paragraphs[pi].slice();
    let cur = [];
    let curW = 0;
    let isFirstLine = true;
    let avail = () => maxInline - (isFirstLine ? firstLineIndent : 0);

    const flush = (reason) => {
      // 去掉行尾空格
      while (cur.length && cur[cur.length - 1].type === 'space') {
        curW -= itemWidth(cur.pop());
      }
      lines.push({
        index: lines.length,
        items: cur,
        text: cur.map((x) => x.text).join(''),
        width: curW,
        indent: isFirstLine ? firstLineIndent : 0,
        avail: avail(),
        reason,
        paraIndex: pi,
        paraLast: reason === 'paragraph',
      });
      cur = [];
      curW = 0;
      isFirstLine = false;
    };

    let i = 0;
    let guard = 0;
    const GUARD_MAX = items.length * 4 + 100;
    while (i < items.length) {
      if (++guard > GUARD_MAX) { // 防御性退出，避免极端输入死循环
        while (i < items.length) { cur.push(items[i]); curW += itemWidth(items[i]); i++; }
        break;
      }
      const it = items[i];

      // 行首空白直接丢弃
      if (it.type === 'space' && cur.length === 0) { i++; continue; }

      const w = itemWidth(it);
      const fits = curW + w <= avail();

      if (fits) { cur.push(it); curW += w; i++; continue; }

      // —— 放不下，需要断行 ——
      if (cur.length === 0) {
        // 单个 item 就超宽：超长单词按字符拆分
        if ([...it.text].length > 1) {
          const chars = [...it.text].map((c) => ({ type: it.type === 'word' ? 'wordchar' : it.type, text: c }));
          items.splice(i, 1, ...chars);
          continue;
        }
        // 单字符都放不下（行宽小于一个字）：强制放置
        cur.push(it); curW += w; i++;
        flush('overflow');
        continue;
      }

      const single = [...it.text].length === 1;

      // 避头：行首禁则字符
      if (single && KINSOKU_START.has(it.text)) {
        if (curW + w <= avail() + hangAllow) {
          // 悬挂：允许标点稍微超出
          cur.push(it); curW += w; i++;
          flush('kinsoku-hang');
          continue;
        }
        // 追出：先把行尾连续的避头字符收起，再多移一个普通字，
        // 保证下一行不会以避头字符开头
        const popped = [];
        while (cur.length) {
          const t = cur[cur.length - 1];
          if ([...t.text].length === 1 && KINSOKU_START.has(t.text)) {
            popped.unshift(cur.pop());
            curW -= itemWidth(t);
          } else break;
        }
        if (cur.length) {
          const t = cur.pop();
          popped.unshift(t);
          curW -= itemWidth(t);
        }
        if (popped.length === 0) {
          // 病态输入（整行都是避头字符）：强制放行，避免死循环
          cur.push(it); curW += w; i++;
          flush('overflow');
          continue;
        }
        items.splice(i, 0, ...popped);
        flush('kinsoku-start');
        continue;
      }

      // 避尾：行末禁则字符（开括号等）——移到下一行
      const lastIt = cur[cur.length - 1];
      if ([...lastIt.text].length === 1 && KINSOKU_END.has(lastIt.text)) {
        const popped = [];
        while (cur.length) {
          const t = cur[cur.length - 1];
          if ([...t.text].length === 1 && KINSOKU_END.has(t.text)) {
            popped.unshift(cur.pop());
            curW -= itemWidth(t);
          } else break;
        }
        if (cur.length === 0) {
          // 整行都是开括号（病态输入）：强制放行，避免死循环
          cur.push(...popped);
          for (const p of popped) curW += itemWidth(p);
          cur.push(it); curW += w; i++;
          flush('overflow');
          continue;
        }
        items.splice(i, 0, ...popped);
        flush('kinsoku-end');
        continue;
      }

      flush('wrap');
    }
    if (cur.length || items.length === 0) flush('paragraph');
    else lines[lines.length - 1].paraLast = true;
  }

  return { lines, paraCount: paragraphs.length };
}
