// 内置演示文案：覆盖混排、标点、长词、数字等边界
export const SAMPLES = [
  {
    name: '中英文混排 + 标点避头尾',
    text: `排版引擎（Canvas 版）支持中文与 English 的混排：拉丁字母、数字 3.14 与千分位 1,000,000 会作为整体测量，中文与英文之间自动保留四分之一个 em 的间隙，而标点旁边不加间隙。

“引语结束后”紧跟标点时，行头禁止出现）。、」』等闭合符号，行末也不允许留下（【《「『这类开启符号；必要时通过“押し込み”或“追い出し”调整，句读、。，可以悬挂在行末框外。

破折号——与省略号……在连续出现时内部不允许断行。It also handles long English words gracefully.`,
  },
  {
    name: '超长单词强制拆字',
    text: `Supercalifragilisticexpialidocious! The longest English word candidates include pneumonoultramicroscopicsilicovolcanoconiosis and the characteristic of being floccinaucinihilipilification. 当容器足够窄时，超长单词必须按字符拆分，避免溢出框线。`,
  },
  {
    name: '竖排古文风格',
    text: `春眠不覺曉，處處聞啼鳥。
夜來風雨聲，花落知多少。

Vertical typography 亦支持拉丁词旋转九零度排佈，全角標點保持直立。`,
  },
  {
    name: '多段落 + 缩进/对齐',
    text: `第一段用來觀察首行縮進的效果。中文排版通常在每段開始時縮進兩個字符寬度，段與段之間可以保留額外的間距。

第二段驗證兩端對齊：非末行應均勻拉伸空格或斷點，使右邊緣整齊；而最後一段的最後一行保持自然長度，不做拉伸。Mixed English words inside a justified line are measured as whole units.

第三段，數字 2026-09-30、版本 v2.4.1 與序號（1）都不應被隨意斷開。`,
  },
  {
    name: '密集标点压力',
    text: `「你好！」他说：「这（真的）可以吗？」——当然！……（括号【嵌套】测试），「『重引』也行」。价格打八折（80%），温度 36.5℃，角度 90°，误差 ±0.2mm。`,
  },
];

export function buildLargeText(chars = 100000) {
  const pool = [
    '排版引擎需要在大量文本下依然保持流畅，',
    'worker 线程负责测量与断行，主线程只做绘制，',
    'Canvas rendering stays responsive while layout runs off the main thread. ',
    '测量结果与字体数据都会进入 IndexedDB 缓存，二次打开可以秒开。',
    '标点避头尾、自动间距与字距调整在长文里同样生效。\n',
  ];
  let out = '';
  let i = 0;
  while (out.length < chars) {
    out += pool[i % pool.length];
    i++;
  }
  return out.slice(0, chars);
}
