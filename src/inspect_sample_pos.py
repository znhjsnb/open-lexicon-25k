import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

SOURCE_PATH = r"D:\liangmian-next\content.json"

with open(SOURCE_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

test_words = ["record", "book", "light", "close", "present", "water", "run", "fast", "bank"]

for item in data:
    w = item.get("word", "").lower()
    if w in test_words:
        print(f"=== {w} ===")
        print("id:", item.get("id"))
        print("pos:", item.get("pos"))
        print("meaning:", item.get("meaning"))
        print("forms:", item.get("forms"))
        print("morphology:", item.get("morphology"))
        print("collocation:", item.get("collocation"))
        print("usage_note:", item.get("usage_note"))
        print("relations:", item.get("relations"))
        print("teaching:", item.get("teaching"))
        print()
