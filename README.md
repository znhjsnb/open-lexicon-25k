# Open-Lexicon 25K (全景开源高精英语认知词库)

<div align="center">

[![Headwords](https://img.shields.io/badge/Headwords-25%2C006-blue.svg?style=flat-square)](https://github.com)
[![Senses](https://img.shields.io/badge/Senses-58%2C574-success.svg?style=flat-square)](https://github.com)
[![Coverage](https://img.shields.io/badge/CEFR-A1~C2-orange.svg?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-CC--BY--SA--4.0%20%7C%20MIT-purple.svg?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57.svg?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)

**面向 AI 时代与英语深度学习者的顶级开源中英双语认知底盘**

“全球首个全面具备【多词性对齐 (Multi-POS)】、【柯林斯整句英文释义】、【现代公式构词】与【全考纲映射】的 25,000 词全开源高精英语词库。”

[快速上手](#-快速上手-quick-start) • [数据规范](#-六维词条架构-schema) • [多端产物](#-多端分发产物) • [开发接入](#-开发接入指南) • [交接指南](docs/PROJECT_HANDOFF.md)

</div>

---

## 💡 为什么选择 Open-Lexicon 25K？

传统开源词库（如 ECDICT、WordNet）在单语或学术研究领域贡献卓越，但对于现代 AI 应用（如 RAG、语义消歧）与人类深度学习者而言，长期存在三大痛点：
1. **多词性合并**：词性与释义未做正规化拆分，导致同一个词在及物、不及物或形容词语境下含义混淆；
2. **缺乏全句柯林斯英文解释**：仅有孤立的中文机械直译，缺乏语境定义；
3. **构词法脱节**：要么完全缺失构词逻辑，要么堆砌晦涩的中古印欧语假学术争端。

### 核心特性对比表

| 评估维度 | 传统开源词库 (如 ECDICT) | 传统英文词网 (如 WordNet) | **Open-Lexicon 25K (本项目)** |
| :--- | :--- | :--- | :--- |
| **词条规模** | 基础词头覆盖宽泛 | 学术覆盖广泛 | **25,006 核心高频词头，BNC/COCA 全覆盖** |
| **多词性义项** | 义项部分合并，易混淆 | 树状概念，学术偏重 | **58,574 独立细分义项，1:1 精准对齐** |
| **英文释义** | 单词式简译或纯词典引述 | 纯英学术长句 | **柯林斯全句英文解释 (COBUILD Style)** |
| **中英双语对齐**| 仅中文翻译 | 纯英文 | **释义、搭配、例句 100% 汉英双语对齐** |
| **形态构词** | 缺失或无规则 | 仅有上位/下位关系 | **现代公式化构词：前缀 + 词根 + 后缀** |
| **语境与近义** | 偶有搭配短语 | 仅同义词集合 (Synset) | **地道高频搭配 + 2~3 个近义词微观辨析** |
| **学习生态** | 需用户自制卡片 | 无学习卡包 | **内置 114MB Anki 牌组 + SQLite FTS5 引擎** |

---

## 📊 核心资产全景与数据统计

- **覆盖词头数**：**25,006 词**（0 截断、0 丢失）
- **多词性义项数**：**58,574 条**（平均每词 **2.34** 个独立义项）
- **批次数据**：26 个标准 JSON 批次（位于 `data/enriched/`，总计约 218 MB）
- **精选样本**：`data/sample_1000.json`（前 1,000 核心词，供免下载全量快速测试）

---

## 📐 六维词条架构 (Schema)

条目采用标准化 JSON 结构存储。客户端将学习内容按以下六维平铺展开，核心字段对应如下（字段类型详见 [docs/SCHEMA.md](docs/SCHEMA.md)）：

| 维度 | 学习内容 | 源 JSON 字段 |
| :--- | :--- | :--- |
| **01** | 释义与定义：词性、逐义项音标、中英文简义与完整英文定义 | `senses[].pos / phonetic / meaning_zh / meaning_en / english_definition` |
| **02** | 例句与搭配：真实语境及中英对照 | `senses[].sentence_en / sentence_zh / collocation_en / collocation_zh` |
| **03** | 现代公式化构词 | `morphology_enriched.zh / en` |
| **04** | 词源故事 | `etymology_story.zh / en` |
| **05** | 近义词辨析 | `synonyms_and_nuances.zh / en` |
| **06** | 记忆锚点与助记 | `mnemonic_anchor.zh / en` |

词头 `word`、音标 `phonetic` 与考纲标签 `exam_tags` 位于词条顶部；`forms`（词形变化）和 `family`（派生词族）是中文教学说明字符串，显示在标签与义项导航之间，不额外计为维度。下面是简化示例：

```json
{
  "word": "available",
  "phonetic": "/əˈveɪ.lə.bəl/",
  "forms": "比较级：more available；最高级：most available。",
  "family": "availability（可用性）；unavailable（不可用的）。",
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
    "zh": "现代构词公式：avail + -able → available；派生：available + -ity → availability...",
    "en": "Modern morphological connections: avail + -able -> available..."
  },
  "synonyms_and_nuances": {
    "zh": "available 指某物处于随时可以获得或使用的主客观状态；accessible 侧重通道通畅、易于接近...",
    "en": "Available indicates readiness for use..."
  },
  "exam_tags": ["中考", "高考", "CET4", "CET6", "考研", "IELTS", "TOEFL", "CEFR-A2"],
  "mnemonic_anchor": {
    "zh": "avail（有用）+ able（能够）→ 能够派上用场的 → 可获得的、有空的。",
    "en": "avail + able -> able to be used -> available."
  }
}
```

静态分片保留 `forms` / `family` 与全部义项字段，将 `exam_tags` 写为 `tags`，四组深层双语对象分别展开为 `morphology_zh/en`、`etymology_zh/en`、`synonyms_zh/en`、`mnemonic_zh/en`。

---

## 📖 纯静态词典客户端 (`app/static/`)

- **浏览器内检索与离线词库**：Web Worker 加载轻量搜索索引；详情按首字母从 27 个分片（`a`–`z` 与 `other`）读取，并缓存到 IndexedDB。点击“准备离线词库”可下载全部分片（约 88 MiB），支持暂停与恢复；Service Worker 缓存页面外壳，首次联网准备完成后可离线刷新与查词。
- **快速定位与浏览**：A–Z 字母导航与二级前缀定位；支持英文词头、中文释义检索、考纲、词性和收藏筛选。当前提供 10 个考纲筛选项（CET4、CET6、考研、IELTS、TOEFL、GRE、高考、TEM4、TEM8、SAT），以及 A–Z、考纲核心、多义词丰富度、Z–A 四种排序。每页 50 词，全库共 501 页，末页 6 词，支持页码跳转及上下滚动补载。
- **六维平铺阅读**：逐义项展示释义、音标、完整英文定义、双语例句与搭配；构词、词源、近义辨析和助记在宽屏采用 2×2 卡片，窄屏单列。词形与词族默认可见；切换“中英双语 / English”时保留阅读位置，English 使用真实英文正文，隐藏中文词形/词族说明。
- **`aA 排版`与沉浸阅读**：五档字号（85% / 95% / 100% / 115% / 130%）、四种字族、三档行距与密度，以及纸白 / 暖黄 / 素灰 / 深黑四种纸色；设置持久保存，可恢复默认。另有全站深浅主题、沉浸阅读和 240–640px 可调侧栏。
- **听读与学习工具**：英音 / 美音及例句发音药丸按钮、收藏、完整词条 Markdown / Anki TSV 复制、每日一词和备考抽认；抽认卡支持 3D 翻转，学习进度保存在当前设备。朗读使用设备语音，离线朗读需预先安装英语语音包。
- **键盘与动效**：`/` 聚焦搜索、`↑` / `↓` 切词、`Enter` 开始阅读；支持减少动效偏好。

---

## 📦 多端分发产物

编译工具链支持将 26 批次 JSON 一键导出为以下成果（位于 `data/exports/`）：

1. **SQLite 生产库 (`open_lexicon_25k.db`)**：
   - 包含 `words` 与 `senses` 完整正规化表；
   - 内置 **SQLite FTS5 虚拟全文索引**，支持毫秒级全文与模糊语义检索。
2. **Anki 高颜值卡片包 (`open_lexicon_25k_anki.tsv`)**：
   - 114MB 制式 TSV 文件，自带现代 CSS 美化卡片样式，导入 Anki 即可背诵。
3. **JSONL 语料库 (`open_lexicon_25k.jsonl`)**：
   - 180MB 单行 JSON 语料，适配 LLM 微调、向量检索与 RAG 知识库构建。

> **注**：因为大型二进制及压缩文件已被 `.gitignore` 保护，正式编译文件可通过 **GitHub Releases** 或运行构建脚本生成。

---

## 🚀 快速上手 (Quick Start)

### 1. 重新构建所有衍生数据库与发布包
```bash
# 一键编译 SQLite + Anki TSV + JSONL 并打包为 Releases ZIP 包
python src/export_databases.py --all
```

### 2. 启动纯静态词典客户端

先准备静态数据：若 `app/static/data/search_index.json` 或 `app/static/data/shards/*.json` 尚未生成，在已有 SQLite 导出的基础上运行：

```bash
python src/export_web_shards.py
```

然后从项目根目录启动：

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory app/static
```
在浏览器中打开 `http://127.0.0.1:8765`。检索在 Web Worker 中运行，详细词条按字母下载并保存在 IndexedDB，无需启动数据库 API。

### 3. 部署到 GitHub Pages / Cloudflare Pages

将 **`app/static/` 整个目录作为静态站点内容发布**，保留以下相对目录结构，也可部署在站点子目录：

```text
app/static/
├── index.html、styles.css、app.js、worker.js、db.js、data.js、sw.js
└── data/
    ├── search_index.json
    └── shards/          # 27 个 JSON：a.json–z.json、other.json
```

`app/static/data/` 是被 `.gitignore` 忽略的派生产物，**只推送源码不会带上搜索索引和 27 个分片**。通过 Pages 发布时，须在构建/上传发布产物前生成或补齐这些文件，再发布完整目录；仅上传 HTML/CSS/JS 无法提供全库查询。线上使用 HTTPS，以支持 Service Worker 离线缓存。

页面左下角“准备离线词库”用于缓存全部分片。旧 `app/server.py` 仍供其他 API 使用方调用。实现边界、测试命令与浏览器验收结果见 [前端验收记录](docs/FRONTEND_ACCEPTANCE.md)。

---

## 💻 开发接入指南

### Python 原生 SQLite 查询（零外部 pip 依赖）
```python
import sqlite3

conn = sqlite3.connect("data/exports/open_lexicon_25k.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 精准查询
cur.execute("SELECT * FROM words WHERE word = ?", ("resilience",))
word = cur.fetchone()

# 全文索引检索释义包含“坚韧”的所有词条
cur.execute("SELECT word, pos, meaning_zh FROM lexicon_fts WHERE meaning_zh MATCH '坚韧'")
results = cur.fetchall()
for r in results:
    print(r["word"], r["pos"], r["meaning_zh"])
```

更多查询模式（Node.js / Python JSONL / REST API）请参考 [docs/API_GUIDE.md](docs/API_GUIDE.md)。

---

## 🗂 目录结构

```
dict/
├── app/                                # 本地极速查词服务 (Python 3 零外部依赖)
│   ├── server.py                       # 支持 FTS5 全文搜索、多字段过滤的 HTTP 服务
│   └── static/                         # 纯静态词典客户端 (HTML/CSS/JS、Worker、离线缓存)
│       └── data/                       # 【派生产物，Git 忽略】发布时必须携带
│           ├── search_index.json       # Web Worker 轻量检索索引
│           └── shards/                 # 27 个按字母划分的完整词条 JSON
├── data/
│   ├── enriched/                       # 【核心源码】26 个批次 JSON (总计 218 MB)
│   ├── sample_1000.json                # 【快速测试】精选 1,000 核心词样本
│   └── exports/                        # 【派生産物】编译生成的 SQLite / Anki / JSONL
├── docs/                               # 详细工程规范与文档
│   ├── PROJECT_HANDOFF.md              # 项目交接与开源发布全景指南
│   ├── SCHEMA.md                       # 六维词条字段字典与类型规范
│   └── API_GUIDE.md                    # Python / Node.js 接入开发指南
├── reports/                            # 26 个批次自动化门禁报告与生产审计日志
├── src/                                # 数据重建与流水线工具集
│   ├── export_databases.py             # 统一导出调度器 (SQLite, Anki, JSONL, ZIP)
│   ├── export_sqlite.py                # SQLite + FTS5 编译脚本
│   ├── export_anki.py                  # Anki 牌组导出脚本
│   ├── export_jsonl.py                 # JSONL 语料导出脚本
│   ├── export_web_shards.py            # 从 SQLite 生成静态搜索索引与 27 分片
│   └── mass_producer.py                # 批次富化流水线调度核心
├── LICENSE                             # CC-BY-SA 4.0 (数据) + MIT (代码) 双许可证
└── README.md                           # 本说明文件
```

---

## 📄 许可证 (License)

本项目采用**双重开源许可证**：
- **词库数据与文档**（`data/`, `docs/`, `reports/`）：遵循 [CC-BY-SA 4.0 许可证](https://creativecommons.org/licenses/by-sa/4.0/)。
- **软件与脚本源码**（`src/`, `app/`）：遵循 [MIT 许可证](LICENSE)。
