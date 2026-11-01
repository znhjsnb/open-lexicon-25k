"""
Open-Lexicon 25K Anki Deck Exporter
Exports all 25,006 words into a styled, ready-to-import TSV file for Anki.
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
ANKI_TSV = EXPORT_DIR / "open_lexicon_25k_anki.tsv"

def clean_html(text):
    if not text:
        return ""
    return str(text).replace("\t", " ").replace("\n", "<br>").replace("\r", "")

def export_anki():
    print(f"Exporting Anki TSV to {ANKI_TSV}...")

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

    with open(ANKI_TSV, "w", encoding="utf-8") as out:
        # Header comment for Anki
        out.write("#separator:tab\n")
        out.write("#html:true\n")
        out.write("#tags column:4\n")

        for start_idx, b_path in prod_files:
            with open(b_path, "r", encoding="utf-8") as f:
                words_data = json.load(f)

            for item in words_data:
                w_str = item.get("word", "").strip()
                if not w_str or w_str.lower() in seen:
                    continue
                seen.add(w_str.lower())
                count += 1

                phonetic = item.get("phonetic", "")
                tags = " ".join([t.replace(" ", "_") for t in item.get("exam_tags", [])])

                # Front of Card
                front = f"""<div style="font-size:32px; font-weight:bold; color:#1e293b;">{w_str}</div>"""
                if phonetic:
                    front += f"""<div style="font-size:16px; color:#64748b; margin-top:4px;">/{phonetic}/</div>"""

                # Back of Card (Senses + Deep Lexical Details)
                senses = item.get("senses", [])
                senses_html = '<div style="margin-top:10px; font-family:sans-serif;">'
                for s in senses:
                    pos = s.get("pos", "")
                    m_zh = s.get("meaning_zh", "")
                    m_en = s.get("meaning_en", "")
                    def_en = s.get("english_definition", "")
                    c_en = s.get("collocation_en", "")
                    c_zh = s.get("collocation_zh", "")
                    s_en = s.get("sentence_en", "")
                    s_zh = s.get("sentence_zh", "")

                    senses_html += f"""
                    <div style="background:#f8fafc; border-left:4px solid #3b82f6; padding:8px 12px; margin-bottom:8px; border-radius:4px; font-size:13px; text-align:left;">
                        <span style="font-weight:bold; color:#2563eb;">{pos}</span> 
                        <strong style="color:#0f172a;">{m_zh}</strong> 
                        <span style="color:#64748b; font-style:italic;">({m_en})</span>
                        <div style="color:#475569; margin-top:3px; font-style:italic;">{def_en}</div>
                        <div style="color:#0369a1; margin-top:2px;"><b>搭配:</b> {c_en} <span style="color:#64748b;">{c_zh}</span></div>
                        <div style="color:#334155; margin-top:2px;"><b>例句:</b> {s_en}<br><span style="color:#64748b;">{s_zh}</span></div>
                    </div>
                    """
                senses_html += "</div>"

                # Etymology & Memory
                etym = item.get("etymology_story", {})
                morph = item.get("morphology_enriched", {})
                syn = item.get("synonyms_and_nuances", {})
                mnem = item.get("mnemonic_anchor", {})

                extra_html = '<div style="margin-top:10px; font-size:12px; color:#475569; text-align:left;">'
                if etym.get("zh"):
                    extra_html += f"""<div style="background:#fef3c7; border:1px solid #fde68a; padding:6px 10px; border-radius:4px; margin-bottom:4px;"><b>🏛️ 词源故事:</b> {etym.get('zh')}</div>"""
                if morph.get("zh"):
                    extra_html += f"""<div style="background:#ede9fe; border:1px solid #ddd6fe; padding:6px 10px; border-radius:4px; margin-bottom:4px;"><b>🧩 词根构词:</b> {morph.get('zh')}</div>"""
                if syn.get("zh"):
                    extra_html += f"""<div style="background:#ffe4e6; border:1px solid #fecdd3; padding:6px 10px; border-radius:4px; margin-bottom:4px;"><b>⚖️ 近义辨析:</b> {syn.get('zh')}</div>"""
                if mnem.get("zh"):
                    extra_html += f"""<div style="background:#dcfce7; border:1px solid #bbf7d0; padding:6px 10px; border-radius:4px; margin-bottom:4px;"><b>💡 记忆锚点:</b> {mnem.get('zh')}</div>"""
                extra_html += "</div>"

                back = f"{senses_html}{extra_html}"

                row = f"{clean_html(front)}\t{clean_html(back)}\t{item.get('phonetic', '')}\t{tags}\n"
                out.write(row)

    print(f"✅ Anki export completed! Total words: {count}")
    print(f"   Output: {ANKI_TSV} ({ANKI_TSV.stat().st_size / (1024*1024):.2f} MB)")

if __name__ == "__main__":
    export_anki()
