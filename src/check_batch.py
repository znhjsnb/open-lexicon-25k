import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

with open(r"C:\Users\d\Documents\dict\data\enriched\batch_00000_00006.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for d in data:
    w = d.get("word")
    senses = d.get("senses", [])
    print(f"\n==================== {w.upper()} ({len(senses)} 个常用词性) ====================")
    for idx, s in enumerate(senses, 1):
        print(f"  [{idx}] 词性: {s.get('pos')} | 音标: {s.get('phonetic')}")
        print(f"      中文: {s.get('meaning')}")
        print(f"      英文: {s.get('english_definition')}")
        print(f"      搭配: {s.get('collocation')}")
        print(f"      例句: {s.get('sentence')}")
        print(f"      翻译: {s.get('translation')}")
    print(f"  🏛️ 来源历史: {d.get('etymology_story')}")
    print(f"  🧩 构词衍生: {d.get('morphology_enriched')}")
    print(f"  ⚖️ 近义微雕: {d.get('synonyms_and_nuances')}")
    print(f"  🏷️ 考试标签: {d.get('exam_tags')}")
    print(f"  💡 秒记锚点: {d.get('mnemonic_anchor')}")
