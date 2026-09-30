// 将文本切分为段落 + 原子流（atom）。
// atom 类型：
//   word      西文单词 / 数字串（含内部撇号、连字符、小数点、千分位逗号）
//   char      CJK 字符、全角拉丁、全角标点等
//   punct     半角开/闭标点（（）、[]、, . ! ? 等）
//   space     半角空格（可拉伸 / 可换行点）
//   ideoSpace 全角空格 U+3000（固定 1em，可作为换行点）
//   dash      破折号/省略号（连续重复时不可断行）

import {
  codePoints,
  isIdeograph,
  isAsciiAlpha,
  isDigit,
  isLatin,
  isSpace,
  isIdeographicSpace,
  isNewline,
  isOpenPunct,
  isClosePunct,
  isNoBreakInternal,
} from './chars.js';

const ASCII_PUNCT = new Set(`"'()[]{},.;:!?-`);

function isWordChar(ch, prev) {
  if (isAsciiAlpha(ch) || isDigit(ch)) return true;
  if (ch === "'" || ch === '\u2019') return true;           // don't
  if (ch === '-' || ch === '\u2010' || ch === '\u2011') {   // well-known
    return isAsciiAlpha(prev) || isDigit(prev);
  }
  if (ch === '.' || ch === ',') {                           // 3.14 / 3,000
    return isDigit(prev);
  }
  return false;
}

// 紧跟在数字小数点/逗号之后仍需留在词内
function wordContinues(ch, prev, chars, i) {
  if (isAsciiAlpha(ch) || isDigit(ch)) return true;
  if (ch === "'" || ch === '\u2019') return true;
  if (ch === '-' || ch === '\u2010' || ch === '\u2011') {
    return isAsciiAlpha(prev) || isDigit(prev);
  }
  if ((ch === '.' || ch === ',') && isDigit(prev)) {
    const nxt = chars[i + 1] ?? '';
    return isDigit(nxt);
  }
  return false;
}

export function tokenize(text) {
  const paragraphs = [];
  let atoms = [];
  let wordId = 0;
  const chars = codePoints(text);

  const flush = () => {
    paragraphs.push({ atoms });
    atoms = [];
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const start = i;

    if (ch === '\r') continue;
    if (ch === '\n') {
      flush();
      continue;
    }
    if (isIdeographicSpace(ch)) {
      atoms.push({ type: 'ideoSpace', ch, text: ch, start, end: start + 1 });
      continue;
    }
    if (isSpace(ch)) {
      atoms.push({ type: 'space', ch: ' ', text: ch, start, end: start + 1 });
      continue;
    }

    // 西文单词 / 数字串：贪心吃到不能再延续
    if (isWordChar(ch, chars[i - 1])) {
      let j = i;
      let prev = ch;
      while (j + 1 < chars.length && wordContinues(chars[j + 1], prev, chars, j + 1)) {
        j++;
        prev = chars[j];
      }
      const word = chars.slice(i, j + 1).join('');
      atoms.push({
        type: 'word',
        ch: word[0],
        text: word,
        start,
        end: j + 1,
        wordId: wordId++,
      });
      i = j;
      continue;
    }

    if (isNoBreakInternal(ch)) {
      // 合并连续的同字符（——、……）
      let j = i;
      while (j + 1 < chars.length && chars[j + 1] === ch) j++;
      const run = chars.slice(i, j + 1).join('');
      atoms.push({
        type: 'dash',
        ch,
        text: run,
        start,
        end: j + 1,
        wordId: wordId++, // 内部不可断
      });
      i = j;
      continue;
    }

    if (isOpenPunct(ch) || isClosePunct(ch) || ASCII_PUNCT.has(ch)) {
      atoms.push({
        type: isIdeograph(ch) ? 'char' : 'punct',
        ch,
        text: ch,
        start,
        end: start + 1,
      });
      continue;
    }

    if (isIdeograph(ch) || isLatin(ch)) {
      atoms.push({ type: 'char', ch, text: ch, start, end: start + 1 });
      continue;
    }

    // 其它符号一律按单字处理
    atoms.push({ type: 'char', ch, text: ch, start, end: start + 1 });
  }
  flush();
  return paragraphs;
}
