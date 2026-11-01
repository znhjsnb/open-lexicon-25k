# Open-Lexicon 25K 数据规范与架构字典 (Data Schema Specification)

本文档定义 Open-Lexicon 25K 的核心条目规范（JSON Schema）与 SQLite 生产表结构。

---

## 1. 核心 JSON 条目规范 (Headword Schema)

每个词条对象包含以下六大核心维度：

```typescript
interface LexiconEntry {
  // 1. 词头与标准国际音标
  word: string;                      // 词头 (全小写或标准规范大小写)
  phonetic: string;                  // 标准 IPA 国际音标 (如 "/əˈveɪ.lə.bəl/")

  // 2. 多词性多义项阵列 (Multi-POS Sense Array)
  senses: LexiconSense[];

  // 3. 词源流变故事 (中英双语)
  etymology_story: {
    zh: string;                      // 历史词源演化脉络 (中文生动叙述)
    en: string;                      // 英文词源背景
  };

  // 4. 现代构词形态公式 (形态解构)
  morphology_enriched: {
    zh: string;                      // 实用构词公式 (前缀+词根+后缀) 及派生词族
    en: string;                      // 英文形态关系
  };

  // 5. 微观同义辨析 (精确语义边界)
  synonyms_and_nuances: {
    zh: string;                      // 2-3 个近义词微雕辨析，点透语境差别
    en: string;                      // 英文语义侧重点对照
  };

  // 6. 权威考试与考纲标签 (多维度映射)
  exam_tags: string[];               // 如 ["中考", "高考", "CET4", "CET6", "考研", "TEM4", "IELTS", "TOEFL", "GRE", "CEFR-B2"]

  // 7. 记忆锚点与认知助记
  mnemonic_anchor: {
    zh: string;                      // 实用记忆法 / 认知钩子
    en: string;                      // 英文记忆线索
  };
}
```

### 义项对象结构 (`LexiconSense`)

每个独立义项代表该词在特定词性与语境下的完整表达：

```typescript
interface LexiconSense {
  pos: string;                       // 词性带中文说明 (如 "adj. 形容词", "vt. 及物动词")
  phonetic: string;                  // 该特定义项或词性下的音标
  meaning_zh: string;                // 精确中文释义 (以分号分隔核心义)
  meaning_en: string;                // 简明英文核心对应
  english_definition: string;        // 柯林斯风格整句纯英文释义 (全句解释法)
  collocation_en: string;            // 高频地道搭配短语 (英文)
  collocation_zh: string;            // 搭配短语精准中文翻译
  sentence_en: string;               // 经典场景例句 (真实例句，拒绝机械拼接)
  sentence_zh: string;               // 例句完整中文信雅达译文
}
```

---

## 2. 字段样例 (Sample JSON Entry)

以核心高频多义词 `available` 为例：

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
    },
    {
      "pos": "adj. 形容词",
      "phonetic": "/əˈveɪ.lə.bəl/",
      "meaning_zh": "有空的；未被占用的",
      "meaning_en": "not busy and free to talk or do something",
      "english_definition": "If someone is available, they are not busy and are free to talk to you.",
      "collocation_en": "be available for an interview; available to speak",
      "collocation_zh": "可接受面试；有空交谈",
      "sentence_en": "The director was not available for comment yesterday.",
      "sentence_zh": "该负责人昨天未能抽空置评。"
    }
  ],
  "etymology_story": {
    "zh": "available 出自晚期中古英语，由 avail（效用、价值）与 -able（能够）复合而成，早期含有“能够派上用场、有益的”含义，17世纪逐步固化为现代“可获得、可支配”的通用概念。",
    "en": "Available appeared in late Middle English from avail and -able, originally meaning 'effective' or 'beneficial'."
  },
  "morphology_enriched": {
    "zh": "现代构词公式：avail (v. 有用) + -able (adj. 后缀) → available；派生：availability (n. 可用性), un- + available → unavailable (adj. 不可用的)。",
    "en": "Modern morphology: avail + -able -> available -> availability / unavailable."
  },
  "synonyms_and_nuances": {
    "zh": "available 侧重处于随时可获取或使用的客观状态；accessible 侧重通道通畅、易于接近或容易理解；obtainable 侧重通过付出努力或金钱能够买到或达成。",
    "en": "Available stresses readiness for use; accessible emphasizes ease of access; obtainable suggests achievement through effort."
  },
  "exam_tags": ["中考", "高考", "CET4", "CET6", "考研", "IELTS", "TOEFL", "CEFR-A2"],
  "mnemonic_anchor": {
    "zh": "avail（有用）+ able（能够）→ 能够派上用场的 → 随手可得的、有空的。",
    "en": "avail (use) + able (can) -> ready to be put to use -> available."
  }
}
```

---

## 3. SQLite 3 表结构定义

导出工具 `src/export_sqlite.py` 将 JSON 编译为两张正规化主表并附带 FTS5 全文索引：

### `words` 表 (词头主表)
- `id` (INTEGER PRIMARY KEY)
- `word` (TEXT UNIQUE)
- `rank_order` (INTEGER)
- `phonetic` (TEXT)
- `exam_tags` (TEXT, JSON array string)
- `etymology_zh` (TEXT)
- `etymology_en` (TEXT)
- `morphology_zh` (TEXT)
- `morphology_en` (TEXT)
- `synonyms_zh` (TEXT)
- `synonyms_en` (TEXT)
- `mnemonic_zh` (TEXT)
- `mnemonic_en` (TEXT)
- `raw_json` (TEXT)

### `senses` 表 (义项从表)
- `id` (INTEGER PRIMARY KEY)
- `word_id` (INTEGER, 外键关联 words.id)
- `word` (TEXT)
- `sense_index` (INTEGER)
- `pos` (TEXT)
- `phonetic` (TEXT)
- `meaning_zh` (TEXT)
- `meaning_en` (TEXT)
- `english_definition` (TEXT)
- `collocation_en` (TEXT)
- `collocation_zh` (TEXT)
- `sentence_en` (TEXT)
- `sentence_zh` (TEXT)

### `lexicon_fts` 虚拟表 (FTS5 全文检索)
使用 SQLite FTS5 对 `word`, `pos`, `meaning_zh`, `meaning_en`, `english_definition`, `collocation_en`, `sentence_en` 进行倒排索引，毫秒级响应中文或英文整句检索。
