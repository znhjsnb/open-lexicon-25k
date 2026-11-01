# Open-Lexicon 25K 项目交接与开源发布全景指南 (Project Handoff & Launch Blueprint)

> **文档定位**：本项目完整交接报告（Handoff）、公库（GitHub）最终呈现架构规范，以及从内部检验向顶级开源项目转化的执行路线图。

---

## 目录
1. [项目里程碑与成果总览 (Milestones & Assets)](#一项目里程碑与成果总览)
2. [数据底层规范与资产全景 (Data Schema & Architecture)](#二数据底层规范与资产全景)
3. [现有内部界面复盘与公开版前端重构蓝图 (Frontend Redesign Blueprint)](#三现有内部界面复盘与公开版前端重构蓝图)
4. [GitHub 公库最终呈现形式 (GitHub Presentation Strategy)](#四github-公库最终呈现形式)
5. [大文件分发与跨平台发布矩阵 (Releases & Hugging Face)](#五大文件分发与跨平台发布矩阵)
6. [Codex / GitHub 插件推送能力解析与操作指令 (Git & Codex Execution)](#六codex--github-插件推送能力解析与操作指令)

---

## 一、 项目里程碑与成果总览

本项目旨在彻底解决开源英文词库“释义机械、缺乏多词性（Multi-POS）对齐、缺乏现代构词公式、缺乏地道柯林斯双语例句”的长期痛点，打造面向 AI 时代与英语深度学习者的**开源标杆级词库**。

### 1. 核心生产数据统计
| 指标项 | 统计值 | 质量标准 |
| :--- | :--- | :--- |
| **覆盖词头数 (Headwords)** | **25,006 词** | BNC/COCA 25K 核心高频词全覆盖，0 缺失、0 截断 |
| **有效多词性义项 (Senses)** | **58,574 条** | 平均每词 **2.34** 个独立义项；高频多义词（如 *run, take, available*）全词性深挖 |
| **中英双语对齐率** | **100.00%** | 英文解释、中文释义、地道搭配、例句及翻译均实现 1:1 双语对齐 |
| **批次产出物** | **26 个 JSON 文件** | 分批存储于 `data/enriched/`，单个文件最大 14.7 MB，完全契合 Git 规范 |
| **质量门禁报告** | **26 份 HTML 报告** | 全量批次均通过自动化校验脚本，产出可视化审查卡 |
| **本地 Git 状态** | **31 Commits (Clean)** | 全部批次已原子化提交，工作区 clean，历史清晰完整 |

---

## 二、 数据底层规范与资产全景

### 1. 目录架构
```
dict/
├── app/                                # 本地极速查词服务 (Python 3 零依赖标准库)
│   ├── server.py                       # 支持 FTS5 全文搜索、多字段过滤的 HTTP 服务
│   └── static/index.html               # 轻量级内部验收前端
├── data/
│   ├── enriched/                       # 【核心资产】26 个批次 JSON (总计 218 MB)
│   │   ├── batch_00000_01000.json
│   │   ├── ...
│   │   └── batch_25000_25006.json
│   └── exports/                        # 【分发资产】多端导出成品 (已被 .gitignore 保护)
│       ├── open_lexicon_25k.db         # SQLite 3 生产库 (291 MB, 含 FTS5 虚拟全文索引)
│       ├── open_lexicon_25k_anki.tsv   # Anki 高颜值卡片包 (114 MB, 自带 CSS 样式)
│       └── open_lexicon_25k.jsonl      # LLM 训练 / RAG 检索微调语料 (180 MB)
├── reports/                            # 26 个批次的单体验收可视化报告
├── src/                                # 自动化引擎与导出工具链
│   ├── export_databases.py             # 25秒内从 JSON 重新构建 SQLite / Anki / JSONL
│   ├── run_production_pipeline.py      # 多线程生产流水线调度器
│   └── verify_and_patch.py             # 自动化格式校验与门禁审计脚本
├── .gitignore                          # 过滤 >100MB 二进制及缓存，防 GitHub 拒推
└── README.md                           # 项目首页说明
```

### 2. 六维词条数据规范 (JSON Schema)
每个词条条目结构严格统一，字段如下：
```json
{
  "word": "available",
  "phonetic": "/əˈveɪ.lə.bəl/",
  "senses": [
    {
      "pos": "adj. 形容词",
      "phonetic": "/əˈveɪ.lə.bəl/",
      "meaning_zh": "可获得的；可购买的；可供使用的",
      "meaning_en": "able to be obtained, bought, or used",
      "english_definition": "If something is available, you can obtain it, buy it, or use it.",
      "collocation_en": "readily available; available online",
      "collocation_zh": "容易获得的；可在网络获取的",
      "sentence_en": "The report is available online in several languages.",
      "sentence_zh": "这份报告有多种语言版本，可在网络获取。"
    }
  ],
  "etymology_story": {
    "zh": "available 出自晚期中古英语，由 avail 与 -able 构成，早期含有“有效用、有帮助”的意思...",
    "en": "Available appeared in late Middle English from avail and -able..."
  },
  "morphology_enriched": {
    "zh": "现代构词关系：avail + -able → available；available + -ity → availability...",
    "en": "Modern morphological connections: avail + -able -> available..."
  },
  "synonyms_and_nuances": {
    "zh": "available 指某物处于随时可以获得或使用的主客观状态...",
    "en": "Available indicates readiness for use..."
  },
  "exam_tags": ["高考", "CET4", "电研", "TEM4", "IELTS", "TOEFL", "CEFR-A2"],
  "mnemonic_anchor": {
    "zh": "avail（有用、有利）+ able（能够）→ 能够派上用场的 → 可获得的、有空的。",
    "en": "avail + able -> able to be used -> available."
  }
}
```

---

## 三、 现有内部界面复盘与公开版前端重构蓝图

### 1. 现有界面（`app/static/index.html`）的定位与局限复盘
- **当时的设计定位**：这是一个**面向内部开发者的快速校验控制台（Inspector Console）**，首要目标是验证 Python 3 标准库后端在 0.5ms 内检索 58,574 条 SQLite 数据的响应能力，并确保每项数据字段完整。
- **暴露的视觉与体验问题**：
  1. **暗色背景与高反差色块**：浓厚的深蓝黑色背景与青绿色/荧光标签带有强烈的“后端数据库面板”气息，缺乏阅读词典所需的呼吸感与纸质/高阶数字词典质感；
  2. **信息层级压迫感过重**：卡片边缘过硬、宽度过长，例句与 COBUILD 解释挤在单一长条矩形内，用户扫视时容易视觉疲劳；
  3. **布局缺乏消费级词典的典雅感**：未能借鉴国际一流词典（如剑桥在线词典 Cambridge Dictionary、韦氏词典 Merriam-Webster、macOS 内置词典）的经典字阶排版与轻质卡片。

### 2. 公开版词典 Web 前端重构蓝图 (Consumer-Grade Redesign)

若要作为开源项目的旗舰 Web 在线演示站点（Live Demo），建议采用如下现代技术方案重新打造：

```mermaid
flowchart LR
    A["用户浏览器 / 移动端"] --> B["现代现代化前端 (Next.js / Vite + Tailwind)"]
    B --> C{"数据检索层"}
    C -->|纯前端静态检索| D["Pagefind / DuckDB-Wasm (0服务器成本)"]
    C -->|轻量服务端接口| E["Cloudflare Workers / Vercel Edge + SQLite"]
```

#### 设计标准（视觉与交互规格）：
1. **排版质感 (Editorial Typography)**：
   - 单词标题采用高级衬线字体（如 *Merriweather / Newsreader / Source Serif 4*），正文采用清晰的无衬线体（*Inter / Geist*）。
   - 释义、柯林斯说明、例句分设清晰的视觉字阶（8pt 间距倍率，柔和色彩，杜绝刺眼边框）。
2. **轻量与双主题支持 (Clean Light / Dark Mode)**：
   - 默认采用类似 Notion / Linear 的现代极简浅色主题（柔和米白 `#F9FAFB` 背景，深石墨色 `#111827` 正文）。
   - 暗黑模式采用深石板灰（#0F172A）搭配低饱和度重点色。
3. **交互功能增强**：
   - **交互式词族树 (Interactive Word Family Tree)**：将构词形态以类似脑图的极简图形展示。
   - **音标与真人口播**：集成 Web Audio API 播放音波动画。
   - **移动端适配**：完美的单手折叠抽屉导航与底栏查词。

---

## 四、 GitHub 公库最终呈现形式

一个能在 GitHub 上斩获数千 Star 的开源数据/词典项目，绝不能仅仅是“扔一堆代码”，而必须拥有顶级项目的主页包装（The Storefront）。

### 1. 仓库主分支（`main`）标准架构
```
.
├── .github/
│   └── workflows/              # 自动测试与自动生成 Release 附件的 CI 流水线
├── app/                        # 重构后的现代在线查词 Demo 代码 (可部署至 Vercel/GitHub Pages)
├── data/
│   ├── enriched/               # 26 个全量标准 JSON 批次数据 (版本化代码库的核心)
│   └── sample_1000.json        # 供开发者无需下载全量即可 3 秒快速测试的精选样本
├── docs/                       # 详细文档
│   ├── SCHEMA.md               # 完备的数据字典与字段类型定义
│   ├── API_GUIDE.md            # Python / Node.js / SQLite 嵌入查询指南
│   └── BENCHMARK.md            # 与 ECDICT、WordNet 的横向多维度对比
├── src/                        # 数据重建、校验与转换工具集
├── .gitignore
├── LICENSE                     # 建议采用 CC-BY-SA 4.0 (数据) + MIT (代码)
└── README.md                   # 顶级双语开源门面
```

### 2. `README.md` 黄金排版规范
你的公开主页必须包含以下模块：
1. **Header 徽章区**：
   `![Headwords](https://img.shields.io/badge/Headwords-25%2C006-blue)` `![Senses](https://img.shields.io/badge/Senses-58%2C574-green)` `![Coverage](https://img.shields.io/badge/CEFR-A1~C2-orange)` `![License](https://img.shields.io/badge/License-CC--BY--SA--4.0-purple)`
2. **项目一句话价值**：
   > “全球首个全面具备【多词性对齐 (Multi-POS)】、【柯林斯整句英文释义】、【现代公式构词】与【全考纲映射】的 25,000 词全开源高精英语认知底座。”
3. **动态演示图 / 概念图**：
   放一张重构后的典雅浅色卡片预览图（或者 GIF 录屏），展示查词时的丝滑度与维度深度。
4. **横向对比表（为什么选择 Open-Lexicon 25K？）**：
   | 维度对比 | 传统开源词库 (如 ECDICT) | 传统英文词网 (如 WordNet) | **Open-Lexicon 25K (本项目)** |
   | :--- | :--- | :--- | :--- |
   | **多词性细分** | 部分合并，语境易混 | 纯学术树状，缺乏考试指向 | **58,574 独立细分义项，考纲精确映射** |
   | **释义表达** | 单词式简译 (如: 可获得的) | 纯英学术长句 | **柯林斯全句英文解释 + 精准中文双语对齐** |
   | **词源构词** | 缺失或杂乱古语争端 | 仅有上下位词连接 | **现代实用构词公式 + 故事化演变脉络** |
   | **学习配套** | 需用户自制卡片 | 无 | **内置 114MB Anki 牌组 + SQLite FTS5 引擎** |
5. **开箱即用代码片段 (Quick Start)**：
   提供用 Python 连接 SQLite 查询的 3 行极简代码，降低开发者使用门槛。

---

## 五、 大文件分发与跨平台发布矩阵

因为 `open_lexicon_25k.db` (291MB)、`open_lexicon_25k_anki.tsv` (114MB) 和 `open_lexicon_25k.jsonl` (180MB) 超过了 GitHub 单文件 100MB 的限制，因此**绝不能直接 `git add` 提交到仓库历史中**，应采取以下三轨分发策略：

### 1. 轨道一：GitHub Releases (v1.0.0 正式版发布)
- GitHub Releases 支持单个二进制文件最大上传 **2 GB**。
- 将下列成品打包后附加在 Release 页面：
  - `open_lexicon_25k_sqlite.zip` (压缩后约 95 MB)
  - `open_lexicon_25k_anki.zip` (压缩后约 35 MB)
  - `open_lexicon_25k_jsonl.zip` (压缩后约 45 MB)
- 学习者点进 Release 即可一键下载，免去任何安装环境的麻烦。

### 2. 轨道二：Hugging Face Datasets (AI / NLP 社区)
- 在 Hugging Face 注册 Dataset `username/open-lexicon-25k`。
- 直接上传 `open_lexicon_25k.jsonl`。
- **好处**：Hugging Face 会自动解析并生成**免费的网页端数据查看器（Dataset Viewer）**，全球 AI 开发者可以直接用 Python `datasets` 库一行代码加载：
  ```python
  from datasets import load_dataset
  dataset = load_dataset("username/open-lexicon-25k")
  ```

### 3. 轨道三：国内网盘备用链接 (百度网盘 / 夸克 / 阿里云盘)
- 为国内无法流畅访问 GitHub Releases 的学习者提供单文件打包下载。

---

## 六、 Codex / GitHub 插件推送能力解析与操作指令

### 1. 针对问题“codex我绑定了github插件他能不能直接创建，推送？”的解答

> **核心结论**：**Codex 绑定的 GitHub 插件（如 ChatGPT 网页端的 GitHub 插件/App）无法直接推送这台电脑本地的文件**。

#### 原因解析：
1. **运行环境隔离**：Codex GitHub 插件运行在 OpenAI 的云端服务器中，只能操作已经存在于远端 GitHub 上的代码库；它无法穿透到你当前这台电脑的 Windows 磁盘中读取 `C:\Users\d\Documents\dict` 目录下的 200MB+ 文件。
2. **安全与权限边界**：云端插件没有你本地电脑的操作系统文件读取权限，也不能作为 Git 客户端向外发送当前电脑的未跟踪数据。

---

### 2. 那么，最快、最优雅的创建与推送方案是什么？

目前本地 Git 仓库已处在**最完美的 Clean 状态**（所有 26 个批次已经提交为清晰的 Git 历史）。你只需要**10 秒钟建一个空库**，然后本地自动推送：

#### 第一步：在 GitHub 网页上新建仓库 (10秒)
1. 访问 [https://github.com/new](https://github.com/new)
2. **Repository name**：填写 `open-lexicon`（或者你喜欢的名字，如 `open-lexicon-25k`）
3. **Visibility**：先选择 **Private**（私库，等格式和文档完全满意后再在设置里切换为 Public）
4. **【极度关键】**：**不要勾选** `Add a README file`、**不要勾选** `.gitignore`、**不要勾选** License（因为本地已全部为你配置好，勾选会导致分支历史冲突）。
5. 点击绿色的 **Create repository** 按钮。

#### 第二步：推送本地仓库
创建完成后，复制页面上的仓库链接，在终端执行以下三条命令（将链接替换为你的实际地址）：

```powershell
cd C:\Users\d\Documents\dict

# 1. 关联远端私库
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 2. 确保主分支名为 main
git branch -M main

# 3. 推送全量数据到 GitHub
git push -u origin main
```

*(说明：由于 Windows 系统已配置 Windows Credential Manager，推送时会自动调用凭据或弹出一次浏览器授权，完成后 30 秒内即可全部推上 GitHub)*

---

### 3. 本地与未来维护清单
- **重新导出所有格式**：`python src/export_databases.py`
- **后台启动工作台服务**：双击桌面 `启动Open-Lexicon词典工作台.bat`
- **直接查看工作台**：双击桌面 `Open-Lexicon 词典工作台.url` 或访问 `http://127.0.0.1:8765`
