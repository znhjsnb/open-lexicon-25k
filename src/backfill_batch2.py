"""
High-concurrency Backfill script for batch_01000_02000 (completes the 25 missing words to reach 1000/1000).
Uses ThreadPoolExecutor(max_workers=5) to enrich all 5 packets in parallel.
"""

import json
import os
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)

ROOT = Path(r"C:\Users\d\Documents\dict")
sys.path.append(str(ROOT / "src"))

from mass_producer import (
    load_source_words,
    process_packet,
    generate_inspection_card,
    commit_batch,
    ENRICHED_DIR,
    REPORTS_DIR,
)

def main():
    print("🚀 Starting Batch 2 Parallel Backfill (25 words)...")
    source_words = load_source_words()
    batch2_target = source_words[1000:2000]

    batch2_file = ENRICHED_DIR / "batch_01000_02000.json"
    with open(batch2_file, "r", encoding="utf-8") as f:
        existing_words = json.load(f)

    existing_set = {w["word"].lower() for w in existing_words}
    missing_items = [w for w in batch2_target if w["word"].lower() not in existing_set]

    print(f"Total existing in Batch 2: {len(existing_words)}")
    print(f"Total missing to backfill: {len(missing_items)}")

    if not missing_items:
        print("Batch 2 is already complete with 1000 words!")
        return

    # Chunk missing items into packets of 5 words
    packet_size = 5
    packets = [missing_items[i : i + packet_size] for i in range(0, len(missing_items), packet_size)]
    print(f"Packets to process in parallel: {len(packets)}")

    backfill_cache_dir = ENRICHED_DIR / ".tmp_backfill_batch2"
    backfill_cache_dir.mkdir(parents=True, exist_ok=True)

    enriched_backfills = []
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_pid = {
            executor.submit(process_packet, pkt, pid, backfill_cache_dir): (pid, pkt)
            for pid, pkt in enumerate(packets)
        }

        for future in as_completed(future_to_pid):
            pid, pkt = future_to_pid[future]
            try:
                res = future.result()
                enriched_backfills.extend(res)
                print(f"✅ Packet {pid + 1}/{len(packets)} complete ({len(res)} words)")
            except Exception as e:
                print(f"❌ Packet {pid + 1} failed: {e}")
                raise

    print(f"All backfill packets finished in {time.time() - t0:.1f}s. Enriched: {len(enriched_backfills)} words.")

    # Combine into map
    all_dict = {w["word"].lower(): w for w in existing_words}
    for w in enriched_backfills:
        all_dict[w["word"].lower()] = w

    # Re-order according to source_words[1000:2000]
    final_batch2 = []
    for item in batch2_target:
        key = item["word"].lower()
        if key in all_dict:
            final_batch2.append(all_dict[key])
        else:
            raise RuntimeError(f"Still missing word: {item['word']}")

    assert len(final_batch2) == 1000, f"Expected 1000 words, got {len(final_batch2)}"
    print(f"Verified: Final Batch 2 has exactly {len(final_batch2)} words in correct order.")

    # Save final enriched batch
    with open(batch2_file, "w", encoding="utf-8") as f:
        json.dump(final_batch2, f, ensure_ascii=False, indent=2)
    print(f"Updated {batch2_file} successfully.")

    # Clean up temp cache
    shutil.rmtree(backfill_cache_dir, ignore_errors=True)

    # Regenerate inspection HTML
    generate_inspection_card("batch_01000_02000", final_batch2)
    print("Updated inspection HTML successfully.")

    # Commit
    commit_batch("batch_01000_02000", 1000)
    print("🎉 Batch 2 backfill 100% complete and committed to Git!")

if __name__ == "__main__":
    main()
