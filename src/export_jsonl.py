"""
Open-Lexicon 25K JSONL (NDJSON) Exporter
Exports all 25,006 words into a single high-efficiency line-delimited JSON file
suitable for LLM embeddings, RAG, and vector search pipelines.
"""

import glob
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENRICHED_DIR = ROOT / "data" / "enriched"
EXPORT_DIR = ROOT / "data" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
JSONL_PATH = EXPORT_DIR / "open_lexicon_25k.jsonl"

def export_jsonl():
    print(f"Exporting JSONL to {JSONL_PATH}...")
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

    count = 0
    seen = set()

    with open(JSONL_PATH, "w", encoding="utf-8") as out:
        for start_idx, b_path in prod_files:
            with open(b_path, "r", encoding="utf-8") as f:
                words_data = json.load(f)

            for item in words_data:
                w_str = item.get("word", "").strip()
                if not w_str or w_str.lower() in seen:
                    continue
                seen.add(w_str.lower())
                count += 1
                out.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"✅ JSONL export completed! Total words: {count}")
    print(f"   Output: {JSONL_PATH} ({JSONL_PATH.stat().st_size / (1024*1024):.2f} MB)")

if __name__ == "__main__":
    export_jsonl()
