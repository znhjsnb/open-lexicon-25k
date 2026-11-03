# 纯静态客户端交付与验收

日期：2026-11-03。已完成六维全要素与词形/词族工作台重构，模块及隔离交互测试 **61/61 通过**，真实 Chrome（`156.0.8078.80`）端到端验收测试 **`tests/frontend.browser.cjs` 20/20 全部通过**（`0 consoleErrors, 0 pageErrors`）。27 分片与 SQLite / raw_json 全量核对：**25,006 词、58,574 义项、0 不一致**。

## 完整六维与词形/词族

- 数据导出器 `src/export_web_shards.py` 已补全 `forms`、`family`、双语构词/词源/近义辨析/助记，以及义项音标和英文简义；tags 为干净的字符串数组，JSON 解析错误直接报错。4 个早期测试批次已移除，保留 26 个正式批次；本轮沿用已再生成的索引与 27 分片。
- 词头标签之后、义项速览之前新增平铺的词形变化和派生词族栏。两者是源数据中的中文教学说明，English 模式隐藏，由英文构词正文承担英文词族阅读。
- 每个义项保留序号、词性、中文简义、完整英文定义、带朗读按钮的例句卡及搭配；新增按义项区分的音标与英文简义。义项导航仍为双语 `01 中文简义` / 英文 `Sense 01`，正文保留完整定义。
- `#detail` 总计 **6 个 `.dimension`**：释义与定义、例句与搭配、现代公式化构词、词源故事、近义词辨析、记忆锚点与助记。后四项采用阅读区宽度响应的 2×2 卡片布局，窄屏单列；没有 `<details>` 或 `hidden` 属性。
- 构词只提取源文本中的 `+` 与 `→` / `->` 公式，不新增拆词。中文公式含汉字且存在英文公式时，双语显示中文公式，English 显示英文公式；纯英文公式共用。中文构词仍可按词族提示分段。
- 四项深层内容都显示真实双语正文。双语模式中的英文段落使用次要文字色；English 模式提升为正文色并移除顶部间距。只有英文源字段缺失时才显示原有英文来源提示。

## 音标与纯英文模式

- 音标为空时返回空文本；已有 `/` 的字符串保持原样，其余添加一对斜杠。复合音标不再被多包一层。
- 复合音标通过 `label-zh` / `label-en` 切换，转换 UK/US、强弱读、重读、单复数和替代读法等中文标签；先处理完整标签，避免“美式英语”被局部替换。未知中文说明回退为原始 IPA token 列表。
- 自动检查全部 **58,574 条义项音标**，其中 **3,689 条含中文注释**；原格式和转换后的英文格式均无重复斜杠，英文转换结果无汉字，全部复合音标保留非空读音。
- 两处语言按钮继续同步、独立持久化；切换不重建词条或移动阅读位置，排版重置保留语言设置。

## 复制与排版

- Markdown 包含词头、音标、标签、可选词形/词族、每个义项的全部释义/音标/例句/搭配，以及四项深层内容的中英文正文。
- Anki 维持严格单行两列 TSV；正反面字段 HTML 转义，字段中的 tab/CR/LF 转为空格。背面新增义项音标/英文简义及词形、词族、近义辨析、记忆锚点摘要，同时保留定义和例句并包含搭配。测试覆盖 HTML 特殊字符和跨行输入。
- 新增音标、英文简义、词形/词族正文及英文深层正文均使用 `--font-scale` 和 `--reading-line-height`；卡片间距/内边距沿用 `--reading-padding-scale`。阅读区宽度至少 640px 时深层卡片与词形栏双列。
- aA 保留 85% / 95% / 100% / 115% / 130% 五档字号、四种系统字族、三种密度、white/sepia/grey/night 四纸色、持久化、默认重置及弹簧/减少动效行为。阅读设置与侧栏/全站主题/语言独立，新增卡片使用现有配色变量和高对比轮廓。
- 分页、501 页/末页 6 词、四种排序、深链不填搜索、双向补载及竞态隔离、240–640px 侧栏调节、收藏、抽认、实体发音药丸和沉浸阅读的现有测试继续通过。

## 实际验证

```powershell
node --test --test-isolation=none tests/frontend.test.mjs tests/frontend.interactions.test.mjs
node --check app/static/app.js
node --check app/static/worker.js
node --check app/static/sw.js
node --check tests/frontend.browser.cjs
git diff --check
```

**61 pass / 0 fail / 0 skipped**；保留原有 57 项，新增音标全库与边界、缺省深层正文/公式变体、旧版 IndexedDB 隔离，以及 SQLite/raw_json 全库一致性检查。上述四项 JavaScript 语法检查和 diff 空白检查均通过。

- 全库测试核对每个词的十个词形/双语深层文本字段及每个义项的音标和英文简义非空；索引与所有分片逐词对齐。
- 独立从只读 SQLite 按 id 读取词条、按 sense_index 读取义项；forms/family 从 raw_json 提取，全部导出字段与实际分片逐词逐义项比较，**0 不一致**。测试需要本地 `data/exports/open_lexicon_25k.db` 和支持 `node:sqlite` 的 Node（本轮 v24.19.0）。
- 缓存测试注入旧版 `25k-2026-11-01:a`，确认新版离线时拒绝读取旧分片，联网后下载完整数据至新键，刷新模块可从新键离线读取；旧记录不被误覆盖。
- 模块报告：`.tmp/frontend-module-results.json`；HTTP 证据：`.tmp/frontend-resource-check.json`。隔离 DOM/IndexedDB 替身不代表真实浏览器内部行为或实际设备声音验收。

## 在线入口、缓存与剩余验收

入口：[http://127.0.0.1:8765/#available](http://127.0.0.1:8765/#available)。本轮读取 index.html、app.js、styles.css、data.js、sw.js，**5 项均 HTTP 200 且与磁盘逐字节一致**。

- 数据版本为 **`25k-2026-11-03`**，外壳缓存 **`open-lexicon-shell-v4.5`**；旧数据键被隔离，旧外壳由现有激活机制清理。离线下载提示更新为约 **88 MiB**（实际分片共 92,051,272 字节，约 87.79 MiB）。首次联网准备后可下载/暂停/恢复全部 27 分片。
- 发布仍须包含被 Git 忽略的 `app/static/data/`，源 SQLite 也不进 Git；本轮没有付费 API 或外部 CDN 运行依赖。
- `tests/frontend.browser.cjs` 已扩充六维、词形/词族、逐义项音标/英文简义、纯英学习正文无汉字、复合音标标签、字号缩放与纸色检查，并在宿主真实 Chrome（`156.0.8078.80`）下运行 **`node tests/frontend.browser.cjs` 20/20 全部通过**（`0 consoleErrors, 0 pageErrors`），截图与实测耗时落盘于 `.tmp/browser-results/`（含 `desktop.png`、`six-dimensions-pinned.png`、`english-mode.png`、`dark.png`、`mobile.png`、`results.json`）。
