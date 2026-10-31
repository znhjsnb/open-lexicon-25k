"""
Open-Lexicon 25K SQLite Exporter
Compiles all enriched batches (25,006 words) into a production-grade SQLite database
with indexed tables and FTS5 full-text search.
"""

import glob
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(r"C:\Users\d\Documents\dict")
ENRICHED_DIR = ROOT / "data" / "enriched"
EXPORT_DIR = ROOT / "data" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = EXPORT_DIR / "open_lexicon_25k.db"

def init_db(conn):
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT UNIQUE NOT NULL,
        rank_order INTEGER,
        phonetic TEXT,
        exam_tags TEXT,
        etymology_zh TEXT,
        etymology_en TEXT,
        morphology_zh TEXT,
        morphology_en TEXT,
        synonyms_zh TEXT,
        synonyms_en TEXT,
        mnemonic_zh TEXT,
        mnemonic_en TEXT,
        raw_json TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS senses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        word TEXT NOT NULL,
        sense_index INTEGER NOT NULL,
        pos TEXT,
        phonetic TEXT,
        meaning_zh TEXT,
        meaning_en TEXT,
        english_definition TEXT,
        collocation_en TEXT,
        collocation_zh TEXT,
        sentence_en TEXT,
        sentence_zh TEXT,
        FOREIGN KEY (word_id) REFERENCES words(id)
    );
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_words_rank ON words(rank_order);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_senses_word ON senses(word);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_senses_pos ON senses(pos);")

    # FTS5 virtual table for fast full-text lookup
    try:
        cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS lexicon_fts USING fts5(
            word,
            pos,
            meaning_zh,
            meaning_en,
            english_definition,
            collocation_en,
            sentence_en,
            content='senses',
            content_rowid='id'
        );
        """)
    except Exception as e:
        print(f"Notice: FTS5 not enabled or error: {e}")

    conn.commit()


def export_all():
    start_time = time.time()
    print(f"Building SQLite database at {DB_PATH}...")
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    init_db(conn)
    cur = conn.cursor()

    batch_files = sorted(ENRICHED_DIR.glob("batch_*_*.json"))
    prod_files = []
    for f in batch_files:
        name = f.stem
        parts = name.split("_")
        if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
            diff = int(parts[2]) - int(parts[1])
            if diff >= 500 or parts[1] == "25000":
                prod_files.append((int(parts[1]), f))

    prod_files.sort(key=lambda x: x[0])
    print(f"Found {len(prod_files)} production batch files.")

    total_words = 0
    total_senses = 0
    seen_words = set()

    for start_idx, b_path in prod_files:
        with open(b_path, "r", encoding="utf-8") as f:
            words_data = json.load(f)

        words_to_insert = []
        senses_to_insert = []

        for item in words_data:
            w_str = item.get("word", "").strip()
            if not w_str or w_str.lower() in seen_words:
                continue
            seen_words.add(w_str.lower())
            total_words += 1
            w_id = total_words

            etym = item.get("etymology_story", {})
            morph = item.get("morphology_enriched", {})
            syn = item.get("synonyms_and_nuances", {})
            mnem = item.get("mnemonic_anchor", {})
            tags = json.dumps(item.get("exam_tags", []), ensure_ascii=False)
            raw = json.dumps(item, ensure_ascii=False)

            words_to_insert.append((
                w_id,
                w_str,
                w_id,
                item.get("phonetic", ""),
                tags,
                etym.get("zh", ""),
                etym.get("en", ""),
                morph.get("zh", ""),
                morph.get("en", ""),
                syn.get("zh", ""),
                syn.get("en", ""),
                mnem.get("zh", ""),
                mnem.get("en", ""),
                raw
            ))

            for s_idx, s in enumerate(item.get("senses", [])):
                total_senses += 1
                senses_to_insert.append((
                    w_id,
                    w_str,
                    s_idx + 1,
                    s.get("pos", ""),
                    s.get("phonetic", ""),
                    s.get("meaning_zh", ""),
                    s.get("meaning_en", ""),
                    s.get("english_definition", ""),
                    s.get("collocation_en", ""),
                    s.get("collocation_zh", ""),
                    s.get("sentence_en", ""),
                    s.get("sentence_zh", ""),
                ))

        cur.executemany("""
        INSERT INTO words (
            id, word, rank_order, phonetic, exam_tags,
            etymology_zh, etymology_en, morphology_zh, morphology_en,
            synonyms_zh, synonyms_en, mnemonic_zh, mnemonic_en, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, words_to_insert)

        cur.executemany("""
        INSERT INTO senses (
            word_id, word, sense_index, pos, phonetic,
            meaning_zh, meaning_en, english_definition,
            collocation_en, collocation_zh, sentence_en, sentence_zh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, senses_to_insert)

        conn.commit()
        print(f"  Processed {b_path.name}: +{len(words_to_insert)} words, cumulative: {total_words} words, {total_senses} senses")

    # Populate FTS
    print("Building full-text search index...")
    try:
        cur.execute("""
        INSERT INTO lexicon_fts(rowid, word, pos, meaning_zh, meaning_en, english_definition, collocation_en, sentence_en)
        SELECT id, word, pos, meaning_zh, meaning_en, english_definition, collocation_en, sentence_en FROM senses;
        """)
        conn.commit()
    except Exception as e:
        print(f"FTS indexing note: {e}")

    conn.close()
    elapsed = time.time() - start_time
    db_size_mb = DB_PATH.stat().st_size / (1024 * 1024)
    print(f"✅ SQLite Export Finished in {elapsed:.1f}s!")
    print(f"   Database: {DB_PATH}")
    print(f"   File Size: {db_size_mb:.2f} MB")
    print(f"   Total Words: {total_words}")
    print(f"   Total Senses: {total_senses}")

if __name__ == "__main__":
    export_all()
