import { layoutText, tokenize } from '../js/layout.js';

// fontSize=10：CJK/全角=10px，半角=5px；maxInline=100 → 每行 10 个汉字
const measure = (s) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2E7F ? 10 : 5), 0);
const base = { maxInline: 100, fontSize: 10, lineHeight: 16, letterSpacing: 0, firstLineIndent: 0, hanging: true };
let fails = 0;
const check = (name, cond) => { console.log(cond ? 'PASS' : 'FAIL', name); if (!cond) fails++; };

// 1. 基本断行
{
  const { lines } = layoutText('一'.repeat(35), base, measure);
  check('基本断行 35字→4行', lines.length === 4);
  check('每行宽度<=100', lines.every(l => l.width <= 100));
  check('内容无损', lines.map(l=>l.text).join('') === '一'.repeat(35));
}

// 2. 避头（关闭悬挂）：句号不能出现在行首
{
  const text = '一'.repeat(10) + '。' + '二'.repeat(20);
  const { lines } = layoutText(text, { ...base, hanging: false }, measure);
  check('避头：行首无句号', lines.every(l => !l.text.startsWith('。')));
  check('避头触发 kinsoku-start', lines.some(l => l.reason === 'kinsoku-start'));
  check('避头内容无损', lines.map(l=>l.text).join('') === text);
}

// 3. 悬挂：句号允许超出半 em
{
  const text = '一'.repeat(10) + '。' + '二'.repeat(5);
  const { lines } = layoutText(text, base, measure);
  check('悬挂：句号挤在行尾', lines[0].text.endsWith('。') && lines[0].reason === 'kinsoku-hang');
}

// 4. 避尾：开括号不能留在行尾
{
  const text = '一'.repeat(9) + '「' + '二'.repeat(20) + '」';
  const { lines } = layoutText(text, base, measure);
  check('避尾：行尾无开括号', lines.every(l => !l.text.endsWith('「')));
  check('避尾触发 kinsoku-end', lines.some(l => l.reason === 'kinsoku-end'));
  check('避尾内容无损', lines.map(l=>l.text).join('') === text);
}

// 5. 英文单词不拆分
{
  const text = 'hello world foo bar';
  const { lines } = layoutText(text, { ...base, maxInline: 40 }, measure);
  check('单词未被拆开', lines.map(l => l.text).join(' ') === 'hello world foo bar');
  check('无行首空格', lines.every(l => !l.text.startsWith(' ')));
}

// 6. 超长单词强制断开
{
  const text = 'a'.repeat(30); // 150px > 40px 行宽
  const { lines } = layoutText(text, { ...base, maxInline: 40 }, measure);
  check('超长单词断成 4 行', lines.length === 4);
  check('超长单词内容无损', lines.map(l=>l.text).join('') === text);
  check('断词行宽度=40', lines[0].width === 40);
}

// 7. 首行缩进
{
  const { lines } = layoutText('一'.repeat(25), { ...base, firstLineIndent: 20 }, measure);
  check('首行缩进：首行 8 字', lines[0].width === 80 && lines[0].indent === 20);
  check('首行缩进：次行满宽 10 字', lines[1].width === 100);
}

// 8. 段落与空行
{
  const { lines } = layoutText('一\n\n二', base, measure);
  check('段落数=3行（含空行）', lines.length === 3 && lines[1].text === '');
  check('段落结束标记', lines[0].paraLast && lines[2].paraLast);
}

// 9. 混排
{
  const text = '中文English混排test测试';
  const { lines } = layoutText(text, { ...base, maxInline: 55 }, measure);
  check('混排内容无损', lines.map(l=>l.text).join('') === text);
  check('混排 English 词完整', !lines.some(l => /^(nglish|est$)/.test(l.text)));
}

// 10. 大量文本性能
{
  const big = ('中English混排。'.repeat(50) + '\n').repeat(2000);
  const t0 = Date.now();
  const { lines } = layoutText(big, base, measure);
  const ms = Date.now() - t0;
  console.log(`  大量文本: ${big.length} 字符, ${lines.length} 行, ${ms}ms`);
  check('性能 < 3000ms', ms < 3000);
}

// 11. 字距计入宽度
{
  const { lines } = layoutText('一'.repeat(12), { ...base, letterSpacing: 5 }, measure);
  check('字距计入：每行 6 字', lines[0].text.length === 6);
}

// 12. 分词
{
  const t = tokenize("don't e-mail 3.14 中文");
  check("don't 是完整词", t.some(x => x.text === "don't"));
  check('e-mail 是完整词', t.some(x => x.text === 'e-mail'));
  check('3.14 是完整词', t.some(x => x.text === '3.14'));
}

// 13. 连续标点避头（多个闭括号/句号堆叠）
{
  const text = '一'.repeat(9) + '。」' + '二'.repeat(10);
  const { lines } = layoutText(text, { ...base, hanging: false }, measure);
  check('连续标点行首无闭符号', lines.every(l => !/^[。』」）]/.test(l.text)));
  check('连续标点内容无损', lines.map(l=>l.text).join('') === text);
}

process.exit(fails ? 1 : 0);
