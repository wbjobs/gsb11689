import { tokenize } from '../src/engine/tokenize.js';
import { layoutDocument, createMeasurer } from '../src/engine/layout.js';
import { createMockHost } from './mock-host.js';
import { buildLargeText } from '../src/ui/samples.js';

for (const n of [10_000, 100_000]) {
  const text = buildLargeText(n);
  const host = createMockHost(16);
  const measurer = createMeasurer(host);
  const t0 = performance.now();
  const paras = tokenize(text);
  const t1 = performance.now();
  const doc = layoutDocument(paras, {
    measurer, measureLength: 720, fontSize: 16, lineHeight: 1.8,
    textIndent: 2, align: 'justify',
  });
  const t2 = performance.now();

  let overflow = 0;
  for (const line of doc.lines) {
    if (line.hanging) continue;
    if (line.used > line.avail + 0.5 && line.breakReason !== 'kinsoku-push') overflow++;
  }
  const rejoined = doc.lines.map((l) => l.text).join('');
  console.log(
    `${n.toLocaleString()} 字符 / ${paras.length} 段 / ${doc.lines.length.toLocaleString()} 行：` +
    `分词 ${(t1 - t0).toFixed(1)}ms，排版 ${(t2 - t1).toFixed(1)}ms，总 ${(t2 - t0).toFixed(1)}ms` +
    `，违规行 ${overflow}`
  );
  if (overflow > 0) process.exitCode = 1;
}
