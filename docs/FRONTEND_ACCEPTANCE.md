# 纯静态客户端交付与验收

日期：2026-11-01。本轮侧栏与阅读区重构已落盘，模块及隔离交互检查 **37/37 通过**；真实浏览器验收受权限阻断，尚未完成视觉验收。

## 本轮可用结果

- 侧栏默认 340px，拖拽范围 240–640px，鼠标与触控使用 Pointer Events 和指针捕获。双击或 Enter 重置；左右键微调 10px，Shift 加速至 40px，Home/End 跳至上下界。`open_lexicon_sidebar_width` 保存偏好，读取损坏数据或存储不可用时仍能操作。移动端及沉浸模式隐藏分隔条。
- 考试筛选单行横向滚动（30px）；A–Z 与二级前缀单行横向滚动（28px）；收藏收为图标胶囊；词行固定 52px，15px 单词、词性徽标、12.5px 单行中文摘要。可见行数随屏幕高度变化，尚无浏览器实测行数。
- Worker 从完整 25,006 词索引生成 296 个二级前缀，通过 ready 消息交给界面。点击字母展开真实前缀，点击前缀按 startsWith 严格过滤，叠加考试/词性/收藏与输入搜索；换字母或清空搜索时清除旧前缀。保留每批 50 词的连续追加、滚动位置、键盘跨批次和旧响应隔离。
- 实测 av 组有 33 词，最大二级前缀组有 967 词。二级前缀显著缩小范围，不能保证任何词都两次点击直达；大组仍可继续输入搜索或滚动，未实现三级索引。
- 右侧粘性顶栏增加双语/纯英分段按钮，使用 `open_lexicon_lang_mode` 保存 JSON 字符串偏好。切换更新 aria-pressed、body.lang-en-only 和 8ms 触觉反馈。纯英隐藏中文释义、译文、中文构词与词源说明，放大加粗英文定义，速览与朗读按钮显示英文标签。源数据仅有中文构词/词源说明，纯英下明确提示可在双语模式阅读，不虚构英文译文。
- 词头 32px，音标与英美朗读紧邻；义项速览芯片可滚动并聚焦目标义项。每个 sense-card 内按顺序展示词性/释义、英文定义、原有例句及朗读、中文译文与高频搭配。要素一/二采用紧凑共用标题行，避免重新拆散定义与例句；构词与词源分别保留要素三/四。共 4 个 dimension，零 details/summary，双语模式全部默认展开。
- 阅读区使用容器查询：实际可用宽度至少 640px 时，例句/搭配及构词/词源双列，否则单列，适应侧栏拖拽。保留深色主题、沉浸、常驻词头与英美发音、离线缓存、收藏、复制与抽认交互。

## 实际检查与证据

```powershell
node --test --test-isolation=none tests/frontend.test.mjs tests/frontend.interactions.test.mjs
node --check app/static/app.js
node --check app/static/worker.js
node --check app/static/sw.js
node --check tests/frontend.browser.cjs
git diff --check
```

模块/交互结果：37 pass / 0 fail / 0 skipped。保留原 31 项断言并补强义项内聚检查，新增 6 项覆盖拖拽/取消/指针丢失/边界/持久化、键盘与坏存储、语言模式恢复/切换/触觉、速览焦点与转义、前缀筛选竞态，以及全部前缀目录与分页/组合筛选。原语音、弹簧抽屉、翻牌、离线准备等回归通过。

`tests/frontend.test.mjs` 运行实际发布模块及本地 HTTP 测试服务，真实静态索引/分片全量核对 **25,006 词、58,574 义项、27 分片**，源数据未改。IndexedDB / Cache Storage 使用内存模型，不声称验证了浏览器内部实现。交互测试运行真实控制器和隔离 DOM/时钟替身，不等同于视觉、原生焦点、物理触控或真实触觉验收。

模块机器报告在 `.tmp/frontend-module-results.json`。其中时延来自 Node 模块，不代表浏览器启动或交互时延。

默认命令 `node --test tests/frontend.test.mjs tests/frontend.interactions.test.mjs` 本轮实际返回 `spawn EPERM`（禁止启动测试子进程）；仅以单进程选项运行通过，未弱化或跳过任何断言。

## 在线入口与离线外壳

实际入口：[http://127.0.0.1:8765/](http://127.0.0.1:8765/)。本轮已从该端口读取 HTML、app.js、styles.css、worker.js、sw.js，均 HTTP 200，并逐字节核对与磁盘相同。页面需刷新才加载新资源；HTTP 验证不等于视觉验收。

需要启动时，在仓库根目录运行：

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory app/static
```

Service Worker 外壳升为 v4，源数据 DATA_VERSION 不变，用户收藏与打卡偏好不变。无付费 API、CDN、构建依赖或后端 API 请求。运行时仍需发布完整 app/static/，包括被 Git 忽略的 data/；本轮未公开部署。

离线能力保持：首次通过 HTTP(S) 联网取得页面和索引，查询按字母缓存词条；主动“准备离线词库”支持下载全部 27 分片、中途暂停及恢复。索引约 6.39 MiB，分片合计约 44.92 MiB。完整准备成功后才保证全部词条已缓存；设备朗读另依赖系统语音包。发布新数据修改 DATA_VERSION，页面外壳更新修改 SHELL_CACHE。

## 浏览器阻断与复测入口

本轮实际尝试：

- 使用现有 Playwright 和 Chrome 执行 `node tests/frontend.browser.cjs`，浏览器进程启动被 `spawn EPERM` 阻断。
- 浏览器连接宿主返回 unavailable。
- Computer Use 访问已存在的词典 Chrome 窗口，被自动审批拒绝；工具只返回 `Computer Use was not approved to use Google Chrome`，未说明更具体原因。

没有绕过权限或扩大沙箱。浏览器截图、真实触控、布局断点、可见词行数、首屏容纳两个义项及实际声音仍未验收，不能宣称通过。

浏览器脚本已维护为本轮布局：新增密度/宽度拖拽及恢复、296 前缀目录中的 av 实际跳转/考试组合、纯英显隐及刷新恢复、义项内聚、速览聚焦、首屏两义项、容器双列/移动单列、分隔条隐藏等检查；保留离线、竞态、筛选、主题、抽认、子目录部署等原有场景。语法检查通过，真实运行尚被阻断。

在允许启动浏览器的环境中运行 `node tests/frontend.browser.cjs`。可用 PLAYWRIGHT_MODULE 指定现有 Playwright，BROWSER_EXECUTABLE 指定浏览器，LEXICON_URL 指定既有服务。脚本自带隔离静态服务，报告和截图写入 `.tmp/browser-results/`。当前 results.json 记录启动失败，旧截图不是本轮新界面的证据。

Git：当前会话 .git 只读，改动保存在工作区，未提交或推送。
