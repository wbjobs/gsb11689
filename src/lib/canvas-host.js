// Canvas 文本测量宿主；Worker 中使用 OffscreenCanvas，主线程使用普通 canvas。
export function createCanvasHost(canvasLike) {
  let canvas = canvasLike;
  if (!canvas) {
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(320, 80);
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 80;
    } else {
      throw new Error('No canvas implementation available');
    }
  }
  const ctx = canvas.getContext('2d');
  let currentFont = '';
  return {
    canvas,
    ctx,
    setFont(fontString) {
      if (fontString !== currentFont) {
        ctx.font = fontString;
        currentFont = fontString;
      }
    },
    measureWidth(text, fontString) {
      this.setFont(fontString);
      return ctx.measureText(text).width;
    },
  };
}

export function buildFontString({ fontFamily, fontSize, fontWeight, fontStyle }) {
  return `${fontStyle || 'normal'} ${fontWeight || 'normal'} ${fontSize}px ${
    fontFamily || 'sans-serif'
  }`;
}
