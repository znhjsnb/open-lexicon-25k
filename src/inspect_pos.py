import json
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

SOURCE_PATH = r"D:\liangmian-next\content.json"

with open(SOURCE_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

word_map = defaultdict(list)
for item in data:
    w = item.get("word", "").lower()
    word_map[w].append(item)

multi_pos_words = {w: items for w, items in word_map.items() if len(items) > 1}

print(f"Total entries in content.json: {len(data)}")
print(f"Total unique spellings/headwords: {len(word_map)}")
print(f"Words with multiple entries/POS: {len(multi_pos_words)}")

sample_keys = ["record", "budget", "close", "present", "light", "book", "charge", "contract", "lead"]
for sk in sample_keys:
    if sk in multi_pos_words:
        items = multi_pos_words[sk]
        print(f"\n=== Word: '{sk}' ({len(items)} independent entries) ===")
        for idx, it in enumerate(items, 1):
            print(f"  Entry {idx}:")
            print(f"    id: {it.get('id')}")
            print(f"    pos: {it.get('pos')}")
            print(f"    meaning: {it.get('meaning')}")
            print(f"    phonetic: {it.get('phonetic')}")
            print(f"    collocation: {it.get('collocation')}")
            print(f"    sentence: {it.get('sentence')}")
            print(f"    morphology: {it.get('morphology')}")
            print(f"    etymology: {it.get('etymology')}")
