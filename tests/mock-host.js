// 可预测的模拟测量宿主，用于脱离浏览器验证排版算法
export function createMockHost(fontSize = 16) {
  return {
    measureWidth(text) {
      let w = 0;
      for (const ch of text) {
        const c = ch.codePointAt(0);
        if (ch === '\u3000') w += fontSize;
        else if (c >= 0x2e80) w += fontSize;
        else if (ch === ' ') w += fontSize * 0.5;
        else w += fontSize * 0.5;
      }
      return w;
    },
  };
}
