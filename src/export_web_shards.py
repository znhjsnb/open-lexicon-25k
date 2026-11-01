"""
Open-Lexicon 25K Web Shards Generator
Generates lightweight search index and alphabetical detail shards for 100% client-side zero-compute web app.
"""

import json
import sqlite3
import string
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "data" / "exports" / "open_lexicon_25k.db"
OUTPUT_DIR = ROOT_DIR / "app" / "static" / "data"
SHARDS_DIR = OUTPUT_DIR / "shards"


def export_shards():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SHARDS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Query all words
    c.execute(
        """
        SELECT id, word, rank_order, phonetic, exam_tags,
               etymology_zh, morphology_zh
        FROM words
        ORDER BY id ASC;
    """
    )
    words = c.fetchall()
    print(f"Total words found: {len(words)}")

    # Query all senses grouped by word_id
    c.execute(
        """
        SELECT word_id, sense_index, pos, meaning_zh, english_definition,
               collocation_en, collocation_zh, sentence_en, sentence_zh
        FROM senses
        ORDER BY word_id ASC, sense_index ASC;
    """
    )
    senses_rows = c.fetchall()
    print(f"Total senses found: {len(senses_rows)}")

    senses_by_word_id = {}
    for row in senses_rows:
        wid = row["word_id"]
        if wid not in senses_by_word_id:
            senses_by_word_id[wid] = []
        senses_by_word_id[wid].append(
            {
                "pos": row["pos"] or "",
                "meaning_zh": row["meaning_zh"] or "",
                "english_definition": row["english_definition"] or "",
                "collocation_en": row["collocation_en"] or "",
                "collocation_zh": row["collocation_zh"] or "",
                "sentence_en": row["sentence_en"] or "",
                "sentence_zh": row["sentence_zh"] or "",
            }
        )

    search_index = []
    shards = {letter: {} for letter in string.ascii_lowercase}
    shards["other"] = {}

    for w in words:
        wid = w["id"]
        word_text = w["word"].strip()
        word_senses = senses_by_word_id.get(wid, [])

        # Parse tags
        tags = []
        if w["exam_tags"]:
            tags = [t.strip() for t in w["exam_tags"].split(",") if t.strip()]

        # 1. Compact search index entry
        # s: list of {p: pos, m: short meaning}
        senses_summary = [
            {"p": s["pos"], "m": s["meaning_zh"]} for s in word_senses
        ]

        search_index.append(
            {
                "id": wid,
                "w": word_text,
                "p": w["phonetic"] or "",
                "t": tags,
                "s": senses_summary,
            }
        )

        # 2. Detailed 6D shard entry
        first_char = word_text[0].lower() if word_text else "other"
        shard_key = first_char if first_char in shards else "other"

        shards[shard_key][word_text.lower()] = {
            "id": wid,
            "word": word_text,
            "phonetic": w["phonetic"] or "",
            "tags": tags,
            "etymology_zh": w["etymology_zh"] or "",
            "morphology_zh": w["morphology_zh"] or "",
            "senses": word_senses,
        }

    # Save search index
    index_file = OUTPUT_DIR / "search_index.json"
    print(f"Writing search index to {index_file}...")
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(search_index, f, ensure_ascii=False, separators=(",", ":"))

    index_size = index_file.stat().st_size / (1024 * 1024)
    print(f"Search index size: {index_size:.2f} MB")

    # Save shards
    total_shard_words = 0
    for letter, shard_data in shards.items():
        if not shard_data:
            continue
        shard_file = SHARDS_DIR / f"{letter}.json"
        with open(shard_file, "w", encoding="utf-8") as f:
            json.dump(shard_data, f, ensure_ascii=False, separators=(",", ":"))
        total_shard_words += len(shard_data)

    print(f"Saved {len(shards)} shards covering {total_shard_words} words.")
    conn.close()


if __name__ == "__main__":
    export_shards()
