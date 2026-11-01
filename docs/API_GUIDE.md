# Open-Lexicon 25K 开发接入与查询指南 (API & Integration Guide)

本文档提供在不同开发环境中快速加载与查询 Open-Lexicon 25K 的代码片段。

---

## 1. Python + SQLite (零依赖，原生极速接入)

直接利用 Python 3 自带的 `sqlite3` 模块连接本地导出的 `open_lexicon_25k.db`：

```python
import sqlite3
import json

# 1. 连接数据库
conn = sqlite3.connect("data/exports/open_lexicon_25k.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 2. 精确查词（含所有多词性义项）
def lookup_word(word_str):
    cur.execute("SELECT * FROM words WHERE word = ? COLLATE NOCASE", (word_str,))
    word_row = cur.fetchone()
    if not word_row:
        return None

    # 获取关联义项
    cur.execute("SELECT * FROM senses WHERE word_id = ? ORDER BY sense_index ASC", (word_row["id"],))
    senses = cur.fetchall()

    return {
        "word": word_row["word"],
        "phonetic": word_row["phonetic"],
        "exam_tags": json.loads(word_row["exam_tags"] or "[]"),
        "senses": [dict(s) for s in senses],
        "etymology": word_row["etymology_zh"],
        "morphology": word_row["morphology_zh"],
        "synonyms": word_row["synonyms_zh"],
        "mnemonic": word_row["mnemonic_zh"]
    }

# 3. 示例调用
entry = lookup_word("resilience")
if entry:
    print(f"📖 单词: {entry['word']} /{entry['phonetic']}/")
    for s in entry['senses']:
        print(f"  • [{s['pos']}] {s['meaning_zh']}")
        print(f"    COBUILD: {s['english_definition']}")
```

### FTS5 全文搜索（支持查中文释义、例句与搭配）

```python
def full_text_search(keyword, limit=10):
    query = """
    SELECT s.word, s.pos, s.meaning_zh, s.sentence_en, s.sentence_zh
    FROM lexicon_fts fts
    JOIN senses s ON fts.rowid = s.id
    WHERE lexicon_fts MATCH ?
    LIMIT ?
    """
    cur.execute(query, (keyword, limit))
    return [dict(row) for row in cur.fetchall()]

# 搜索例句中包含 "online" 的词汇
results = full_text_search("online", limit=5)
for r in results:
    print(f"{r['word']} ({r['pos']}): {r['sentence_en']}")
```

---

## 2. Python + JSONL (流式处理与 LLM 微调语料)

直接读取 `open_lexicon_25k.jsonl`：

```python
import json

with open("data/exports/open_lexicon_25k.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        item = json.loads(line)
        # 提取高频词或特定考纲
        if "考研" in item.get("exam_tags", []):
            print(item["word"], item["senses"][0]["meaning_zh"])
```

---

## 3. Node.js / TypeScript 接入 (better-sqlite3)

```typescript
import Database from 'better-sqlite3';

const db = new Database('data/exports/open_lexicon_25k.db', { readonly: true });

export function getWord(word: string) {
  const getWordStmt = db.prepare('SELECT * FROM words WHERE word = ? COLLATE NOCASE');
  const getSensesStmt = db.prepare('SELECT * FROM senses WHERE word_id = ? ORDER BY sense_index ASC');

  const wordRow = getWordStmt.get(word) as any;
  if (!wordRow) return null;

  const senses = getSensesStmt.all(wordRow.id);
  return {
    ...wordRow,
    exam_tags: JSON.parse(wordRow.exam_tags || '[]'),
    senses
  };
}
```

---

## 4. 本地 HTTP REST API (已内置于 `app/server.py`)

启动本地轻量查词服务：
```bash
python app/server.py
```
默认监听 `http://127.0.0.1:8765`。

### 核心接口：
- `GET /api/stats`：词库总体规模与分布概览
- `GET /api/words?q=resilience`：模糊或精确查词
- `GET /api/words?tag=考研&pos=v.`：按考纲与词性过滤
- `GET /api/words/random`：随机抽取一条完整条目
