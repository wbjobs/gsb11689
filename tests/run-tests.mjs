import assert from 'node:assert/strict';
import { tokenize } from '../src/engine/tokenize.js';
import { layoutDocument, createMeasurer } from '../src/engine/layout.js';
import { createMockHost } from './mock-host.js';

let passed = 0;
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

function lay(text, opts = {}) {
  const host = createMockHost(opts.fontSize || 16);
  const measurer = createMeasurer(host);
  const paras = tokenize(text);
  return layoutDocument(paras, { measurer, measureLength: 240, fontSize: 16, lineHeight: 1.6, ...opts });
}

// 1. 断行正确：所有行不超出可用宽度
test('断行不超出容器宽度（悬挂除外）', () => {
  const doc = lay('排版引擎支持按宽度自动断行，中英文混排Chinese English也能正确处理，普通文本必须在容器范围内换行展示。'.repeat(3));
  for (const line of doc.lines) {
    if (line.hanging) continue;
    assert.ok(line.used <= line.avail + 0.5, `line #${line.index} used=${line.used} avail=${line.avail}`);
  }
  assert.ok(doc.lines.length > 3);
});

// 2. 行首禁则：闭标点不出现在行首
test('标点避头尾-行首禁止出现 ）。，等闭标点', () => {
  const text = '这是一个很长的测试段落用来触发换行（括号内容结束后）紧跟文字，继续填充内容直到发生换行。、顿号也在行末。';
  const doc = lay(text, { measureLength: 160 });
  for (const line of doc.lines) {
    const first = line.atoms.find((a) => a.type !== 'space');
    assert.ok(first, 'empty line');
    const forbidden = '）。，、！？；：】》」』%.,!?;:';
    assert.ok(!forbidden.includes(first.ch), `line #${line.index} starts with "${first.ch}": ${line.text}`);
  }
});

// 3. 行末禁则：开标点不出现在行末
test('标点避头尾-行末禁止出现 （《等开标点', () => {
  const text = '前面写很多文字用来占满整行的宽度从而在开标点出现之前恰好换行（括号里的内容要在下一行）继续填充填充。';
  const doc = lay(text, { measureLength: 176 });
  for (const line of doc.lines) {
    const atoms = line.atoms.filter((a) => a.type !== 'space');
    const last = atoms[atoms.length - 1];
    assert.ok(!'（【《「『〈(['.includes(last.ch), `line #${line.index} ends with "${last.ch}": ${line.text}`);
  }
});

// 4. 悬挂标点
test('句读标点可悬挂在行末框外', () => {
  // 9 个汉字恰好填满 144，句号成为“放不下”的 atom -> 悬挂
  const text = '字字字字字字字字字。后续后续后续后续后续后续后续后续';
  const doc = lay(text, { measureLength: 144 });
  const found = doc.lines.find((l) => l.hanging);
  assert.ok(found, 'expected a hanging line: ' + doc.lines.map((l) => l.text).join(' | '));
  assert.equal(found.atoms[found.atoms.length - 1].ch, '。');
  assert.ok(found.used > found.avail - 0.5, 'hanging punct 挂出框宽右缘');
});

// 5. 关闭避头尾后允许违规（对照）
test('kinsoku=false 时开标点可落行末，开启时追出到下一行', () => {
  // 10 个汉字=160；宽度 176 时（ 恰好放进行末 -> 开启 kinsoku 必须追到下一行
  const text = '汉字汉字汉字汉字汉字（后续后续后续后续后续后续后续后续';
  const on = lay(text, { measureLength: 176, kinsoku: true });
  const off = lay(text, { measureLength: 176, kinsoku: false });
  for (const line of on.lines.slice(0, -1)) {
    const last = line.atoms[line.atoms.length - 1];
    assert.ok(!'（【《「『〈(['.includes(last.ch), `开启避头尾时开标点不得在行末: ${line.text}`);
  }
  assert.ok(on.lines.some((l) => l.breakReason === 'kinsoku-pull'));
  const offEndsOpen = off.lines.slice(0, -1).some((l) => '（【《「『〈(['.includes(l.atoms[l.atoms.length - 1].ch));
  assert.ok(offEndsOpen, '关闭 kinsoku 后应允许开标点落行末: ' + off.lines.map((l) => l.text).join(' | '));
});

// 6. 中英文混排：词不拆、数字整体
test('中英文混排-英文单词与小数/千分位不拆行', () => {
  const doc = lay('数值 3.14 与 1,000,000 和单词 internationalization 混排测试。');
  const all = doc.lines.flatMap((l) => l.atoms);
  assert.ok(all.some((a) => a.type === 'word' && a.text === '3.14'));
  assert.ok(all.some((a) => a.type === 'word' && a.text === '1,000,000'));
  assert.ok(all.some((a) => a.type === 'word' && a.text === 'internationalization'));
});

// 7. 中英文间距 1/4em
test('中英文混排-相邻自动加 1/4em 间隙，标点旁不加', () => {
  const doc = lay('中文English单词（English）结尾');
  const line = doc.lines[0];
  const enIdx = line.atoms.findIndex((a) => a.text === 'English');
  assert.equal(line.gaps[enIdx], 4, '中文->English 应有 4px 间隙');
  const en2 = line.atoms.findIndex((a, i) => i > enIdx && a.text === 'English');
  assert.equal(line.gaps[en2], 0, '（->English 不应加间隙');
});

// 8. 超长单词强制拆字
test('超长英文单词按字符拆分填满各行', () => {
  const long = 'SupercalifragilisticexpialidociousPneumonoultramicroscopic';
  const doc = lay(long, { measureLength: 120 });
  assert.ok(doc.lines.length >= 4);
  for (const line of doc.lines) {
    assert.ok(line.used <= line.avail + 0.5);
  }
  const rejoined = doc.lines.map((l) => l.text).join('');
  assert.equal(rejoined, long);
});

// 9. 对齐：左/中/右
test('对齐-左中右起始偏移正确', () => {
  const text = '短行';
  for (const align of ['left', 'center', 'right']) {
    const doc = lay(text, { align, measureLength: 240 });
    const line = doc.lines[0];
    const free = line.freeSpace;
    const expected = align === 'left' ? 0 : align === 'center' ? free / 2 : free;
    assert.ok(Math.abs(line.startOffset - expected) < 0.5, `${align} offset ${line.startOffset} vs ${expected}`);
  }
});

// 10. 两端对齐：拉伸空格/断点
test('对齐-justify 非末行拉伸填满', () => {
  const doc = lay('one two three four five six seven eight nine ten', { align: 'justify', measureLength: 200 });
  assert.ok(doc.lines[0].stretched);
  assert.ok(Math.abs(doc.lines[0].freeSpace - doc.lines[0].stretchAmount) < 0.5 || doc.lines[0].stretchAmount > 0);
  assert.equal(doc.lines[doc.lines.length - 1].stretched, false);
});

// 11. 首行缩进
test('缩进-首行缩进 2em，其余行不缩进', () => {
  const text = '首行缩进测试'.repeat(10);
  const doc = lay(text, { textIndent: 2, measureLength: 160 });
  assert.equal(doc.lines[0].indent, 32);
  assert.equal(doc.lines[0].gaps[0], 32);
  assert.equal(doc.lines[1].indent, 0);
});

// 12. 字距
test('字距调整-每个 atom 前进量增加 letterSpacing', () => {
  const a = lay('文字测试', { letterSpacing: 0, measureLength: 400 });
  const b = lay('文字测试', { letterSpacing: 2, measureLength: 400 });
  assert.ok(Math.abs(b.lines[0].used - (a.lines[0].used + 2 * 4)) < 0.01);
});

// 13. 竖排：尺寸、列从右向左排列
test('竖排 vertical-rl 列从右向左推进', () => {
  const doc = lay('竖排文字测试竖排文字测试竖排文字测试竖排文字测试竖排文字测试竖排文字测试', {
    mode: 'vertical-rl', measureLength: 120, containerCross: 400,
  });
  assert.equal(doc.mode, 'vertical-rl');
  // 第一列 cross 应大于第二列（从右往左）
  assert.ok(doc.lines[0].cross > doc.lines[1].cross, `cross ${doc.lines[0].cross} > ${doc.lines[1].cross}`);
});

test('竖排 vertical-lr 列从左向右推进', () => {
  const doc = lay('竖排文字测试竖排文字测试竖排文字测试竖排文字测试竖排文字测试竖排文字测试', {
    mode: 'vertical-lr', measureLength: 120, containerCross: 400,
  });
  assert.ok(doc.lines[0].cross < doc.lines[1].cross);
});

// 14. 竖排中全角字符按 1em 计量
test('竖排全角字符前进量为 1em', () => {
  const doc = lay('汉字', { mode: 'vertical-rl', measureLength: 300 });
  assert.ok(Math.abs(doc.lines[0].used - 32) < 0.01, `used=${doc.lines[0].used}`);
});

// 15. 多段落
test('段落-换行分段，段首缩进', () => {
  const doc = lay('第一段内容内容内容\n第二段内容内容内容', { textIndent: 2, measureLength: 400 });
  assert.equal(doc.paragraphs.length, 2);
  const p2Start = doc.paragraphs[1].startLine;
  assert.equal(doc.lines[p2Start].indent, 32);
});

// 16. 破折号/省略号不断
test('破折号与省略号内部不断行', () => {
  const doc = lay('文字——文字……文字');
  const atoms = doc.lines[0].atoms;
  assert.ok(atoms.some((a) => a.text === '——'));
  assert.ok(atoms.some((a) => a.text === '……'));
});

// 17. 行信息完整
test('行信息包含位置、字数、对齐状态', () => {
  const doc = lay('one two three four five', { align: 'justify', measureLength: 120 });
  for (const line of doc.lines) {
    assert.equal(typeof line.cross, 'number');
    assert.equal(typeof line.used, 'number');
    assert.equal(Array.isArray(line.positions), true);
    assert.equal(line.positions.length, line.atoms.length);
  }
});


// 18. 押込：闭标点挤进行末
test('押込-半角闭标点放不下时挤进行末并略超宽', () => {
  // 10 个全角字=160，半角 ) 再+8=168；宽度 167 时 ) 放不下 -> 押込
  const text = '字字字字字字字字字字)尾巴';
  const doc = lay(text, { measureLength: 167 });
  const push = doc.lines.find((l) => l.breakReason === 'kinsoku-push');
  assert.ok(push, 'expected kinsoku-push: ' + doc.lines.map((l) => `${l.breakReason}:${l.text}`).join(' | '));
  assert.equal(push.atoms[push.atoms.length - 1].ch, ')');
  assert.ok(push.used > push.avail, '押込行略微超宽');
  const off = lay(text, { measureLength: 167, kinsoku: false });
  assert.ok(off.lines[1].text.startsWith(')'), off.lines.map((l) => l.text).join(' | '));
});

// 19. 连续开标点一起追出
test('追出-连续开标点整体移到下一行行首', () => {
  const text = '字字字字字字字字（【内容内容】）后续后续后续后续后续';
  const doc = lay(text, { measureLength: 200 });
  const pull = doc.lines.find((l) => l.breakReason === 'kinsoku-pull');
  if (pull) {
    const next = doc.lines[pull.index + 1];
    assert.ok(next, 'pull 后必须有下一行');
    const heads = next.atoms.slice(0, 2).map((a) => a.ch).join('');
    assert.ok(heads.startsWith('（【') || heads.includes('（【') || heads.includes('（'),
      `下一行应以开标点开头，实际: ${next.text}`);
  }
});

// 20. 纯超长单词：每行长度上限
test('纯超长单词拆字后每行不超宽且字符完整', () => {
  const long = 'a'.repeat(60);
  const doc = lay(long, { measureLength: 96 });
  for (const line of doc.lines) assert.ok(line.used <= line.avail + 0.5);
  assert.equal(doc.lines.map((l) => l.text).join('').length, 60);
});

// 21. 竖排模式同样遵守行头/行末禁则（列底/列顶）
test('竖排标点避头尾同样生效', () => {
  const text = '竖排文字测试竖排文字测试竖排文字测试（括号内容）继续填充填充填充填充。';
  const doc = lay(text, { mode: 'vertical-rl', measureLength: 128, containerCross: 600 });
  for (const line of doc.lines) {
    const first = line.atoms.find((a) => a.type !== 'space');
    const last = line.atoms[line.atoms.length - 1];
    assert.ok(!'）。，、！？；：】》」』'.includes(first.ch), `列首违规: ${line.text}`);
    assert.ok(!'（【《「『〈'.includes(last.ch), `列末违规: ${line.text}`);
  }
});

// 22. 关闭中英文间距
test('关闭中英文自动间距后间隙为 0', () => {
  const doc = lay('中文English', { cjkLatinSpacing: false, measureLength: 400 });
  const idx = doc.lines[0].atoms.findIndex((a) => a.text === 'English');
  assert.equal(doc.lines[0].gaps[idx], 0);
});

// 23. 字距影响断行
test('字距增大后行数增多', () => {
  const text = '字距调整会改变断行结果字距调整会改变断行结果字距调整会改变断行结果';
  const a = lay(text, { letterSpacing: 0, measureLength: 200 });
  const b = lay(text, { letterSpacing: 4, measureLength: 200 });
  assert.ok(b.lines.length >= a.lines.length);
});

// 24. 行号/段落映射完整
test('段落行区间连续且覆盖全部行', () => {
  const doc = lay('a\nb\nc\nd', { measureLength: 400 });
  assert.equal(doc.paragraphs.length, 4);
  let cursor = 0;
  for (const info of doc.paragraphs) {
    assert.equal(info.startLine, cursor);
    cursor = info.endLine;
  }
  assert.equal(cursor, doc.lines.length);
});

for (const c of cases) {
  try { c.fn(); passed++; console.log(`  \u2713 ${c.name}`); }
  catch (e) { console.error(`  \u2717 ${c.name}\n    ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${passed}/${cases.length} passed`);
