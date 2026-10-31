# Open-Lexicon 25K (全景开源高精英语词库)

> **项目定位**：全网首套真正兼顾“现代公式化构词、柯林斯纯英释义、双场景地道例句、近义辨析微雕、全网考纲标签”的 25,000 词全量级开源词汇金矿。  
> **服务人群**：开发者（规范 JSON/SQLite）、英语学习者（Anki/Obsidian/MDX 词典）、AI 研究者（HuggingFace 语义消歧）。  
> **底层模型**：OpenAI 旗舰主力模型 `gpt-6.1-sol`（锁定 `high` 高推理模式）。

---

## 一、 数据集架构与维度标准

每个单词条目包含以下六维完整字段：

1. **基础音形义**：`word`（单词）、`pos`（词性）、`phonetic`（国际音标）、`meaning`（中文核心释义）、`aliases`（近义释义别名）；
2. **纯英释义**：`english_definition`（柯林斯风格整句纯英文解释，通俗清晰）；
3. **形态构词**：`morphology`（现代构词公式：`词根 + 词缀 → 含义`，绝无假学术争端）；
4. **语境应用**：`collocation`（双场景高频地道搭配短语）、`sentence` & `translation`（经典真实例句与精准翻译）；
5. **近义微雕**：`synonyms_and_nuances`（2~3 个核心近义词对比，一句话点透微观语义差别）；
6. **考纲与记忆**：`exam_tags`（涵盖中高考、CET4/6、考研、专四专八、雅思、托福、GRE、CEFR 欧标）与 `mnemonic_anchor`（极简助记与词义演化线索）。

---

## 二、 目录结构

```
dict/
├── data/
│   ├── raw/             # 原始数据索引
│   ├── enriched/        # Codex 高精批次加工成果 (.json)
│   └── dist/            # 多格式最终导出包 (JSON, SQLite, Anki, Obsidian)
├── reports/             # 批次质量门禁报告与 30 秒可视化抽检卡
├── src/                 # 多路并发流水线调度脚本
├── .gitignore
└── README.md
```
