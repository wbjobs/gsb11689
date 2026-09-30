# Canvas 中文排版引擎实验场

基于 **Canvas 2D + FontFace API + Web Worker + IndexedDB** 的浏览器排版引擎演示，
覆盖按宽度自动断行、对齐、缩进、标点避头尾（Kinsoku）、中英文混排自动间距、竖排，
并实时展示排版结果与逐行信息。

## 运行

```bash
# 任意静态服务器即可（页面使用 ES Module 与 module Worker，需 http(s) 协议）
npm run serve          # = python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/index.html
```

Node 验收测试（不依赖浏览器，1:1 跑同一套排版算法）：

```bash
npm test               # 25 条规则测试
node tests/perf-test.mjs   # 1 万 / 10 万字符性能测试
node tests/dom-test.mjs    # DOM 降级渲染冒烟
```

## 目录结构

```
src/
  engine/
    chars.js          Unicode 分类、行头/行末禁则、悬挂、CJK-Latin 间距判定
    tokenize.js       分词：西文单词/数字整体（3.14、1,000、don't）、破折号/省略号合并不断
    layout.js         贪心断行 + 避头尾（悬挂/押込/追出）+ 对齐 + 缩进 + 字距 + 竖排列定位
    renderer.js       Canvas 渲染（横排、竖排、西文词旋转、命中测试）
    dom-renderer.js   DOM 降级渲染（writing-mode + 绝对定位行）
  lib/
    canvas-host.js    测量宿主（Worker 用 OffscreenCanvas）
    layout-client.js  Worker 客户端；Worker 不可用时自动回退到主线程排版
    font-manager.js   FontFace 加载 + document.fonts.ready 重排通知
    idb.js            IndexedDB 封装（字体 ArrayBuffer 持久化）
  worker/
    layout-worker.js  离屏测量 + 断行，结构化行数据回传
  ui/
    index 页面、控件、行信息表、示例文案、10 万字符压测入口
tests/                Node 规则测试、性能测试、DOM 垫片测试
```

## 排版规则

- **断行**：贪心填充；超宽时优先换行。半角空格作为词间“胶水”，行首压缩、行末不占位。
- **标点避头尾（Kinsoku）**
  - 行头禁止：`）。，、！？；：】》」』…—` 等闭标点 → 押し込み（挤进行末，允许略超宽）；
    `、。，．` 优先**悬挂**到行末框外。
  - 行末禁止：`（【《「『〈〔` 等开标点 → 追い出し（连同连续开标点一起移到下一行）。
  - 破折号 `——`、省略号 `……` 内部不断行。
  - 可在界面上整体关闭以对照效果。
- **中英文混排**：西文单词与数字（含小数 `3.14`、千分位 `1,000,000`、撇号 `don't`、
  连字符 `well-known`）整体测量、不断行；CJK ↔ 拉丁/数字相邻自动加 `0.25em` 间隙，
  标点紧邻处不加；超长单词按字符拆行（拆字处红色标记）。
- **对齐**：左 / 居中 / 右 / 两端；两端对齐优先拉伸半角空格，无空格时在断点均分
  （段落最后一行不拉伸）。
- **缩进**：首行缩进按 em 计（默认 2em），支持段间距。
- **字距**：逐 atom 增加前进量并参与断行；Canvas 渲染逐字符绘制以保证兼容。
- **竖排**：`vertical-rl`（列从右向左）/ `vertical-lr`；全角字符按 1em 前进、全角标点
  直立，西文单词整词顺时针旋转 90°；DOM 降级使用 CSS `writing-mode`。

## 字体加载后重排

1. `FontFace(family, ArrayBuffer)` 加载，成功后 `document.fonts.add`；
2. 字体 buffer 存入 **IndexedDB**（`font:<family>`），二次打开直接命中缓存；
3. 同一份 buffer 被 transfer 到 **Web Worker** 重新 `new FontFace`，保证测量与绘制一致；
4. `document.fonts` 的 `ready` / `loadingdone` 事件触发自动重排。

## 性能与降级

- 测量结果在 Worker 内按文本缓存；10 万字符（约 2,200 行）排版 ≈ 40ms（模拟测量宿主）。
- Canvas 侧对超过 200 行的文档做**虚拟滚动**，只绘制视口附近的行。
- Worker 构造失败（旧浏览器 / CSP）时，`LayoutClient` 自动回退到主线程离屏 Canvas 排版；
  Canvas 不可用时可一键切换到 **DOM 排版**。

## 验收对照

| 验收项 | 实现位置 | Node 测试 |
| --- | --- | --- |
| 断行正确 | `engine/layout.js` 贪心断行 | 断行不超出容器宽度、纯超长单词拆字 |
| 对齐和缩进正确 | 对齐段 / `textIndent` | 左中右偏移、justify 拉伸、首行缩进 |
| 标点避头尾正确 | 悬挂 / 押込 / 追出 | 行头行末禁则、悬挂、押込、追出、开关对照 |
| 中英文混排正确 | `tokenize.js` + 0.25em 间距 | 单词数字整体、间距位置、关闭间距 |
| 竖排正确 | 主轴抽象 + 竖排渲染 | vertical-rl/lr 列序、全角 1em、竖排避头尾 |
| 字体加载后重排正确 | `font-manager.js` + Worker 注册 | 浏览器演示页“加载并重排”按钮 |

> 注：容器沙箱若禁止绑定端口/浏览器系统调用，请在本机浏览器打开演示页；
> 排版算法本身全部可在 Node 中通过 `npm test` 验证。
