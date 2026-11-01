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

条目采用标准化 JSON 结构存储，各字段严格定义（详见 [docs/SCHEMA.md](docs/SCHEMA.md)）：

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

### 2. 启动本地零依赖极速查词服务
```bash
python app/server.py
```
在浏览器中打开 `http://127.0.0.1:8765` 即可使用本地内置的查词工作台。

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
│   └── static/                         # 查词前端界面 (HTML/CSS/JS)
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
│   └── mass_producer.py                # 批次富化流水线调度核心
├── LICENSE                             # CC-BY-SA 4.0 (数据) + MIT (代码) 双许可证
└── README.md                           # 本说明文件
```

---

## 📄 许可证 (License)

本项目采用**双重开源许可证**：
- **词库数据与文档**（`data/`, `docs/`, `reports/`）：遵循 [CC-BY-SA 4.0 许可证](https://creativecommons.org/licenses/by-sa/4.0/)。
- **软件与脚本源码**（`src/`, `app/`）：遵循 [MIT 许可证](LICENSE)。
