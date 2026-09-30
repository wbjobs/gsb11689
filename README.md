# Canvas 排版引擎 Demo

纯前端文本排版引擎：Canvas 渲染 + Web Worker 排版 + FontFace 字体加载 + IndexedDB 字体缓存，支持 DOM 降级。

## 运行

需要通过 HTTP 访问（ES Module 与 Worker 不支持 file://）：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 功能

- **断行**：贪心断行 + 行首/行末禁则（避头尾）+ 标点悬挂（ぶら下がり）+ 追出处理
- **对齐**：左 / 中 / 右 / 两端对齐；首行缩进（em 可调）
- **中英文混排**：CJK 任意字间断行，拉丁词（含 `don't`、`e-mail`、`3.14` 等词内连接符）保持完整
- **超长单词**：超过行宽时按字符强制断开，不溢出
- **竖排**：从右往左列排，CJK 直立，拉丁词整体旋转 90°
- **字体**：字号 / 行高 / 字距实时可调；FontFace API 加载自定义字体（URL 或本地文件），
  字体二进制缓存进 IndexedDB，二次加载离线可用；字体就绪后自动重排
- **性能**：排版在 Worker 中用 OffscreenCanvas 测量，大文本（~10 万字）按段落分块并回报进度，
  测量结果按字符串缓存
- **降级**：Worker/OffscreenCanvas 不可用 → 主线程 Canvas；Canvas 不可用 → DOM 排版
  （CSS `writing-mode` 竖排、`line-break: strict` 避头尾、`overflow-wrap: anywhere` 断长词，
  行信息用 `Range.getClientRects` 反推）。也可在「引擎」下拉手动强制切换
- **行信息**：每行内容 / 宽度 / 字数 / 断行原因，点击行在 Canvas 上高亮

## 结构

```
index.html          页面与控件
style.css
js/layout.js        纯排版引擎（Worker 与主线程共用，无 DOM 依赖）
js/layout-worker.js Worker：字体注册、测量、分块排版
js/renderer.js      Canvas 渲染（横排/竖排/对齐/字距/高亮）
js/font-store.js    FontFace 注册 + IndexedDB 缓存
js/dom-fallback.js  DOM 降级排版与行检测
js/main.js          调度、UI、引擎选择
tests/layout.test.mjs  引擎单元测试：node tests/layout.test.mjs
```

## 已知取舍

- 竖排中标点未切换为竖排字形（保持直立），拉丁词整体旋转
- 两端对齐在行级 item 间均分空白，未区分 CJK/词间优先级
