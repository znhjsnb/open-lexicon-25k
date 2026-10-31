"""
Open-Lexicon 25K: Multi-worker Enrichment Producer
Dispatches batches to Codex CLI via local stdin pipeline,
validates quality gates, merges enriched fields, and generates bilingual inspection cards.
"""

import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Paths
ROOT = Path(r"C:\Users\d\Documents\dict")
SOURCE_PATH = Path(r"D:\liangmian-next\content.json")
ENRICHED_DIR = ROOT / "data" / "enriched"
REPORTS_DIR = ROOT / "reports"

ENRICHED_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Locate Codex CLI binaries
LAUNCHER = shutil.which("codex.cmd")
if not LAUNCHER:
    raise RuntimeError("Codex CLI (codex.cmd) not found on PATH")

NODE_EXE = Path(LAUNCHER).parent / "node.exe"
CODEX_SCRIPT = Path(LAUNCHER).parent / "node_modules" / "@openai" / "codex" / "bin" / "codex.js"

if not NODE_EXE.exists() or not CODEX_SCRIPT.exists():
    raise RuntimeError(f"Codex runtime components missing: node={NODE_EXE.exists()}, script={CODEX_SCRIPT.exists()}")


def load_source_words():
    """Load the full 25,006 words from liangmian-next source."""
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_prompt_for_packet(packet):
    """Build a structured prompt for a packet of words with full multi-POS and bilingual EN/ZH support."""
    words_input = []
    for item in packet:
        words_input.append({
            "word": item.get("word"),
            "existing_pos": item.get("pos"),
            "existing_meaning": item.get("meaning"),
            "raw_morphology": item.get("morphology", {}).get("text") if isinstance(item.get("morphology"), dict) else item.get("morphology"),
            "raw_etymology": item.get("etymology", {}).get("text") if isinstance(item.get("etymology"), dict) else item.get("etymology"),
        })

    prompt = f"""You are a master lexicographer building the global bilingual Open-Lexicon 25K database.
For each word below, provide a comprehensive, multi-part-of-speech (Multi-POS) and FULLY BILINGUAL (English + Chinese) lexical profile.

CRITICAL REQUIREMENTS:
1. MULTI-POS COMPLETION: Identify ALL commonly used parts of speech for each word (e.g. 'budget' is n., v., adj.; 'commute' is v. & n.; 'deposit' is n. & v.; 'book' is n. & v.; 'record' is n. & v.).
2. FULL BILINGUAL PARALLEL: Every single explanation (etymology, morphology, synonyms, mnemonics, definitions, collocations) must provide high-quality English alongside Chinese.

For each word, return a JSON object with:
1. `senses`: Array of objects for all active common POS:
   - `pos`: e.g. "n. 名词", "v. 动词", "adj. 形容词"
   - `phonetic`: Exact IPA for this specific POS (note stress/sound changes)
   - `meaning_zh`: Concise core Chinese definition
   - `meaning_en`: Concise core English definition
   - `english_definition`: COBUILD-style simple natural English sentence defining this sense
   - `collocation_en`: 1-2 authentic English high-frequency collocations
   - `collocation_zh`: Chinese translation of the collocations
   - `sentence_en`: Natural example sentence
   - `sentence_zh`: Accurate Chinese translation of the sentence
2. `etymology_story`: An object with both "zh" and "en":
   - "zh": 1-2 sentences in Chinese explaining authentic historical origin & semantic evolution
   - "en": 1-2 sentences in natural English explaining the historical origin & semantic evolution
3. `morphology`: An object with both "zh" and "en":
   - "zh": 现代形态构词公式及全词族衍生
   - "en": Modern morphological breakdown (root + affixes) and complete word family derivatives
4. `synonyms_and_nuances`: An object with both "zh" and "en":
   - "zh": 2-3 个近义词及一句话微观差异辨析
   - "en": 2-3 key synonyms with a concise distinction of subtle semantic nuances
5. `mnemonic_anchor`: An object with both "zh" and "en":
   - "zh": 极简逻辑认知秒记锚点
   - "en": Concise cognitive memory hook connecting the root logic to the modern meanings
6. `exam_tags`: Array of applicable tags from:
   ["中考", "高考", "CET4", "CET6", "考研", "TEM4", "TEM8", "IELTS", "TOEFL", "GRE", "SAT"] and exact CEFR level (e.g. "CEFR-A2", "CEFR-B1", "CEFR-B2").

INPUT WORDS:
{json.dumps(words_input, ensure_ascii=False, indent=2)}

OUTPUT FORMAT:
Do not perform web searches or shell commands. Do not output any conversational preambles or postscripts.
Return strictly a valid JSON array of objects in the exact same order:
[
  {{
    "word": "<word>",
    "senses": [
      {{
        "pos": "<pos>",
        "phonetic": "<ipa>",
        "meaning_zh": "<chinese definition>",
        "meaning_en": "<english definition>",
        "english_definition": "<cobuild sentence>",
        "collocation_en": "<english collocations>",
        "collocation_zh": "<chinese collocations>",
        "sentence_en": "<example sentence>",
        "sentence_zh": "<sentence translation>"
      }}
    ],
    "etymology_story": {{
      "zh": "<etymology story in Chinese>",
      "en": "<etymology story in English>"
    }},
    "morphology": {{
      "zh": "<morphology in Chinese>",
      "en": "<morphology in English>"
    }},
    "synonyms_and_nuances": {{
      "zh": "<nuances in Chinese>",
      "en": "<nuances in English>"
    }},
    "mnemonic_anchor": {{
      "zh": "<mnemonic in Chinese>",
      "en": "<mnemonic in English>"
    }},
    "exam_tags": ["<tag1>", "<tag2>", ...]
  }}
]
No markdown fences, no conversational prose, only pure raw JSON array.
"""
    return prompt


def call_codex_exec(prompt, timeout=180):
    """Execute codex exec via stdin and capture response."""
    command = [
        str(NODE_EXE),
        str(CODEX_SCRIPT),
        "exec",
        "--skip-git-repo-check",
        "-C",
        str(ROOT),
        "-m",
        "gpt-6.1-sol",
        "-c",
        "approval_policy=never",
        "-s",
        "danger-full-access",
        "--json",
        "--color",
        "never",
        "-",
    ]

    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.Popen(
        command,
        cwd=str(ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )

    stdout, stderr = proc.communicate(prompt.encode("utf-8"), timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"Codex exec failed (code {proc.returncode}): {stderr.decode('utf-8', errors='ignore')}")

    # Parse stdout event stream to find the agent_message containing the JSON array
    agent_texts = []
    for line in stdout.decode("utf-8", errors="ignore").splitlines():
        try:
            event = json.loads(line)
            if event.get("type") == "item.completed":
                item = event.get("item", {})
                if item.get("type") == "agent_message":
                    t = item.get("text", "")
                    if t:
                        agent_texts.append(t)
        except Exception:
            continue

    if not agent_texts:
        raise RuntimeError("No agent_message found in Codex exec output")

    # Look for valid JSON array in agent texts (from last to first)
    for text in reversed(agent_texts):
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                continue

    # Fallback: join all texts and search
    full_text = "\n".join(agent_texts)
    start = full_text.find("[")
    end = full_text.rfind("]")
    if start != -1 and end != -1 and end > start:
        return json.loads(full_text[start : end + 1])

    raise RuntimeError("Could not parse JSON array from Codex agent messages")


def process_packet(packet, packet_id):
    """Process a single packet of words with error handling and retry."""
    prompt = build_prompt_for_packet(packet)
    for attempt in range(2):
        try:
            results = call_codex_exec(prompt, timeout=180)
            if isinstance(results, list) and len(results) == len(packet):
                res_map = {r.get("word").lower(): r for r in results if isinstance(r, dict) and r.get("word")}
                enriched_packet = []
                for original in packet:
                    w = original.get("word", "").lower()
                    enrichment = res_map.get(w, {})
                    merged = {
                        **original,
                        "senses": enrichment.get("senses", []),
                        "etymology_story": enrichment.get("etymology_story", {}),
                        "morphology_enriched": enrichment.get("morphology", {}),
                        "synonyms_and_nuances": enrichment.get("synonyms_and_nuances", {}),
                        "exam_tags": enrichment.get("exam_tags", []),
                        "mnemonic_anchor": enrichment.get("mnemonic_anchor", {}),
                    }
                    enriched_packet.append(merged)
                print(f"[Packet {packet_id}] OK - Enriched {len(enriched_packet)} bilingual words")
                return enriched_packet
            else:
                print(f"[Packet {packet_id}] Warning: length mismatch (got {len(results) if isinstance(results, list) else 'non-list'}, expected {len(packet)}). Retrying...")
        except Exception as e:
            print(f"[Packet {packet_id}] Error (attempt {attempt+1}): {e}")
    raise RuntimeError(f"Packet {packet_id} failed after 2 attempts")


def run_batch(start_idx=0, count=6, max_workers=2, packet_size=3):
    """Run a batch of words with multi-worker concurrency."""
    all_words = load_source_words()
    batch_words = all_words[start_idx : start_idx + count]
    print(f"=== Starting Bilingual Batch: words {start_idx} to {start_idx + count} (Total: {len(batch_words)}) ===")

    # Split into packets
    packets = []
    for i in range(0, len(batch_words), packet_size):
        packets.append((i // packet_size, batch_words[i : i + packet_size]))

    enriched_all = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_packet, pkt, pid): pid for pid, pkt in packets}
        for future in as_completed(futures):
            pid = futures[future]
            try:
                res = future.result()
                enriched_all.extend(res)
            except Exception as e:
                print(f"FATAL in packet {pid}: {e}")

    # Re-sort by original index
    word_order = {w.get("word").lower(): i for i, w in enumerate(batch_words)}
    enriched_all.sort(key=lambda x: word_order.get(x.get("word", "").lower(), 999999))

    # Save to enriched JSON
    batch_name = f"batch_{start_idx:05d}_{start_idx+count:05d}"
    out_file = ENRICHED_DIR / f"{batch_name}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(enriched_all, f, ensure_ascii=False, indent=2)

    print(f"=== Batch Saved: {out_file} ({len(enriched_all)} items) ===")

    # Generate HTML inspection gallery
    generate_inspection_card(batch_name, enriched_all)
    return out_file, len(enriched_all)


def generate_inspection_card(batch_name, items):
    """Generate a clean visual HTML inspection card displaying multi-POS bilingual senses."""
    html_file = REPORTS_DIR / f"{batch_name}_inspection.html"
    sample_items = items[:12]

    cards_html = ""
    for item in sample_items:
        tags_badges = "".join([f'<span class="badge tag">{t}</span>' for t in item.get("exam_tags", [])])

        etym = item.get("etymology_story", {})
        etym_zh = etym.get("zh", "") if isinstance(etym, dict) else str(etym)
        etym_en = etym.get("en", "") if isinstance(etym, dict) else ""

        morph = item.get("morphology_enriched", {})
        morph_zh = morph.get("zh", "") if isinstance(morph, dict) else str(morph)
        morph_en = morph.get("en", "") if isinstance(morph, dict) else ""

        syn = item.get("synonyms_and_nuances", {})
        syn_zh = syn.get("zh", "") if isinstance(syn, dict) else str(syn)
        syn_en = syn.get("en", "") if isinstance(syn, dict) else ""

        mnem = item.get("mnemonic_anchor", {})
        mnem_zh = mnem.get("zh", "") if isinstance(mnem, dict) else str(mnem)
        mnem_en = mnem.get("en", "") if isinstance(mnem, dict) else ""

        # Render each sense
        senses = item.get("senses", [])
        senses_html = ""
        for s in senses:
            senses_html += f"""
            <div class="sense-block">
                <div class="sense-header">
                    <span class="sense-pos">{s.get('pos', '')}</span>
                    <span class="sense-phonetic">/{s.get('phonetic', '')}/</span>
                    <span class="sense-meaning-zh">{s.get('meaning_zh', s.get('meaning', ''))}</span>
                    <span class="sense-meaning-en">({s.get('meaning_en', '')})</span>
                </div>
                <div class="en-def"><strong>English:</strong> {s.get('english_definition', '')}</div>
                <div class="colloc"><strong>搭配：</strong> <code class="text-pink-300">{s.get('collocation_en', s.get('collocation', ''))}</code> <span class="trans">{s.get('collocation_zh', '')}</span></div>
                <div class="sentence"><strong>例句：</strong> {s.get('sentence_en', s.get('sentence', ''))}<br><span class="trans">{s.get('sentence_zh', s.get('translation', ''))}</span></div>
            </div>
            """

        cards_html += f"""
        <div class="card">
            <div class="card-header">
                <div>
                    <span class="word">{item.get('word')}</span>
                    <span class="pos-badge">{len(senses)} 个词性 · 全双语对照</span>
                </div>
                <div class="tags">{tags_badges}</div>
            </div>
            
            <!-- Multi-Senses Container -->
            <div class="senses-container">
                {senses_html}
            </div>

            <!-- Bilingual Etymology -->
            <div class="etym">
                <strong class="text-amber-400">🏛️ 来源历史 (Etymology):</strong>
                <div class="mt-1 text-slate-200">{etym_zh}</div>
                <div class="mt-1 text-amber-200/90 text-xs italic font-serif">{etym_en}</div>
            </div>

            <!-- Bilingual Morphology -->
            <div class="morph">
                <strong class="text-indigo-400">🧩 构词衍生 (Morphology):</strong>
                <div class="mt-1 text-slate-200">{morph_zh}</div>
                <div class="mt-1 text-indigo-200/90 text-xs italic">{morph_en}</div>
            </div>

            <!-- Bilingual Synonyms -->
            <div class="synonym">
                <strong class="text-rose-400">⚖️ 近义微雕 (Nuances):</strong>
                <div class="mt-1 text-slate-200">{syn_zh}</div>
                <div class="mt-1 text-rose-200/90 text-xs italic">{syn_en}</div>
            </div>

            <!-- Bilingual Mnemonic -->
            <div class="mnemonic">
                <strong class="text-emerald-400">💡 秒记锚点 (Memory Hook):</strong>
                <div class="mt-1 text-slate-200">{mnem_zh}</div>
                <div class="mt-1 text-emerald-200/90 text-xs italic">{mnem_en}</div>
            </div>
        </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Open-Lexicon 25K - 全双语对照抽检卡 ({batch_name})</title>
<style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
    h1 {{ color: #38bdf8; font-size: 24px; border-bottom: 1px solid #334155; padding-bottom: 12px; }}
    .meta {{ color: #94a3b8; font-size: 14px; margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 20px; }}
    .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }}
    .card-header {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; border-bottom: 1px dashed #334155; padding-bottom: 10px; }}
    .word {{ font-size: 24px; font-weight: bold; color: #38bdf8; margin-right: 10px; }}
    .pos-badge {{ background: #0284c7; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-left: 4px; }}
    .tag {{ background: #0284c7; color: #fff; }}
    .senses-container {{ margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px; }}
    .sense-block {{ background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; }}
    .sense-header {{ display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }}
    .sense-pos {{ color: #fbbf24; font-weight: bold; font-size: 13px; }}
    .sense-phonetic {{ color: #94a3b8; font-family: monospace; font-size: 12px; }}
    .sense-meaning-zh {{ color: #f1f5f9; font-weight: 600; font-size: 14px; }}
    .sense-meaning-en {{ color: #94a3b8; font-style: italic; font-size: 13px; }}
    .en-def {{ font-size: 13px; color: #38bdf8; margin-bottom: 6px; font-style: italic; }}
    .colloc, .sentence {{ font-size: 12px; color: #cbd5e1; margin-bottom: 4px; line-height: 1.4; }}
    .trans {{ color: #94a3b8; font-size: 11px; }}
    .etym {{ font-size: 12px; background: rgba(245, 158, 11, 0.08); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; line-height: 1.5; border: 1px solid rgba(245, 158, 11, 0.2); }}
    .morph {{ font-size: 12px; background: rgba(99, 102, 241, 0.08); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; line-height: 1.5; border: 1px solid rgba(99, 102, 241, 0.2); }}
    .synonym {{ font-size: 12px; background: rgba(244, 63, 94, 0.08); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; line-height: 1.5; border: 1px solid rgba(244, 63, 94, 0.2); }}
    .mnemonic {{ font-size: 12px; background: rgba(52, 211, 153, 0.08); padding: 10px 12px; border-radius: 8px; line-height: 1.5; border: 1px solid rgba(52, 211, 153, 0.2); }}
    code {{ background: #1e293b; padding: 2px 6px; border-radius: 4px; color: #f472b6; }}
</style>
</head>
<body>
    <h1>🚀 Open-Lexicon 25K 全双语对照抽检画廊</h1>
    <div class="meta">批次：<strong>{batch_name}</strong> | 规模：<strong>{len(items)} 词</strong> | 规格：<strong>多词性覆盖 + 全维度中英双语对齐</strong></div>
    <div class="grid">
        {cards_html}
    </div>
</body>
</html>
"""
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[Gallery] Generated inspection card: {html_file}")


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    run_batch(start_idx=0, count=count, max_workers=workers, packet_size=3)
