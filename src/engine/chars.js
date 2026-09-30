// Unicode 字符分类与标点避头尾（Kinsoku）规则
// 参考：JIS X 4051 行头禁则 / 行末禁则 / 分离禁则，并覆盖中文常用标点。

export function codePoints(text) {
  return Array.from(text);
}

// ---- 大类 ---------------------------------------------------------------

export function isIdeograph(ch) {
  const c = ch.codePointAt(0);
  return (
    (c >= 0x4e00 && c <= 0x9fff) ||   // CJK 统一表意
    (c >= 0x3400 && c <= 0x4dbf) ||   // 扩展 A
    (c >= 0x20000 && c <= 0x2a6df) || // 扩展 B
    (c >= 0xf900 && c <= 0xfaff) ||   // 兼容表意
    (c >= 0x3040 && c <= 0x30ff) ||   // 平/片假名
    (c >= 0xff00 && c <= 0xffef) ||   // 全角拉丁（ff01–ff5e 区间，标点除外在后面细分）
    c === 0x3005 || c === 0x3006 || c === 0x303f || c === 0x3040
  );
}

export function isAsciiAlpha(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

export function isDigit(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x30 && c <= 0x39) || (c >= 0xff10 && c <= 0xff19); // 半角/全角数字
}

export function isLatin(ch) {
  const c = ch.codePointAt(0);
  return (
    isAsciiAlpha(ch) ||
    isDigit(ch) ||
    (c >= 0x00c0 && c <= 0x024f) || // 拉丁扩展
    c === 0x0027 || c === 0x2019    // 撇号（don't / it's 词内不断）
  );
}

export function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\u00a0';
}

export function isNewline(ch) {
  return ch === '\n' || ch === '\r';
}

export function isIdeographicSpace(ch) {
  return ch === '\u3000';
}

// ---- 标点 ---------------------------------------------------------------

// 行头禁止（closing：）。）》」』】〕…— 等
const LINE_HEAD_FORBIDDEN = new Set(
  '、。，．！？；：）】〕》」』〉》｠%‰°′″℃々—…' +
  '.,!?;:)%'
);

// 行末禁止（opening：（【《「『〈〔 等
const LINE_END_FORBIDDEN = new Set(
  '（【《「『〈〔〖〘〚' +
  '(['
);

// 可悬挂在行末框外的标点（、。，．）
const HANGING = new Set('、。，．');

// 破折号 / 省略号：重复出现时内部不允许断行（——、……）
const NO_BREAK_INTERNAL = new Set('—…‥');

export function isClosePunct(ch) {
  return LINE_HEAD_FORBIDDEN.has(ch);
}

export function isOpenPunct(ch) {
  return LINE_END_FORBIDDEN.has(ch);
}

export function isPunct(ch) {
  return isClosePunct(ch) || isOpenPunct(ch);
}

export function canHang(ch) {
  return HANGING.has(ch);
}

export function isNoBreakInternal(ch) {
  return NO_BREAK_INTERNAL.has(ch);
}

// 全角标点（竖排时直立排版）
export function isFullWidthPunct(ch) {
  const c = ch.codePointAt(0);
  return (
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0xff00 && c <= 0xff0f) ||
    (c >= 0xff1a && c <= 0xff20) ||
    (c >= 0xff3b && c <= 0xff40) ||
    (c >= 0xff5b && c <= 0xff65)
  );
}

// 判断两个原子之间是否允许断行
export function breakAllowedBetween(prev, next) {
  if (!prev || !next) return true;
  if (prev.type === 'newline' || next.type === 'newline') return true;
  if (prev.type === 'space' || next.type === 'space') return true;
  // 行头禁则：闭标点不能出现在行首
  if (isClosePunct(next.ch)) {
    return false;
  }
  // 行末禁则：开标点不能出现在行末
  if (isOpenPunct(prev.ch)) return false;
  // 破折号/省略号内部不断
  if (isNoBreakInternal(prev.ch) && prev.ch === next.ch) return false;
  // 同一西文单词 / 数字串内部不断（分词器把单词整体切成 word atom）
  if (prev.wordId !== undefined && prev.wordId === next.wordId) return false;
  return true;
}

// CJK 与拉丁/数字之间是否加 1/4em 自动间距
export function needsCjkLatinGap(prev, next) {
  if (!prev || !next) return false;
  const a = prev.ch, b = next.ch;
  const cjkA = isIdeograph(a);
  const cjkB = isIdeograph(b);
  const latA = isLatin(a) || isDigit(a);
  const latB = isLatin(b) || isDigit(b);
  // 标点紧邻时不加（（中文）或 中文，）
  if (isPunct(a) || isPunct(b) || a === ' ' || b === ' ') return false;
  return (cjkA && latB) || (latA && cjkB);
}
