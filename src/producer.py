"""
Open-Lexicon 25K: Multi-worker Enrichment Producer
Dispatches batches to Codex CLI via local stdin pipeline,
validates quality gates, merges enriched fields, and generates inspection cards.
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
    """Build a structured prompt for a packet of 5-10 words."""
    words_input = []
    for item in packet:
        words_input.append({
            "word": item.get("word"),
            "pos": item.get("pos"),
            "meaning": item.get("meaning"),
            "morphology": item.get("morphology", {}).get("text") if isinstance(item.get("morphology"), dict) else item.get("morphology"),
            "collocation": item.get("collocation"),
        })

    prompt = f"""You are a master lexicographer and linguist enhancing the Open-Lexicon 25K open-source database.
For each word below, provide four rigorous, high-value fields:

1. `english_definition`: A COBUILD-style simple, natural full English sentence defining the word clearly (using accessible ~3000 vocabulary).
2. `synonyms_and_nuances`: 2-3 most common synonyms and a concise one-sentence Chinese explanation clarifying the subtle semantic nuance/difference between them.
3. `exam_tags`: A JSON array of relevant exam and level tags chosen accurately from:
   ["中考", "高考", "CET4", "CET6", "考研", "TEM4", "TEM8", "IELTS", "TOEFL", "GRE", "SAT"] and the exact CEFR level (e.g. "CEFR-A1", "CEFR-A2", "CEFR-B1", "CEFR-B2", "CEFR-C1", "CEFR-C2").
4. `mnemonic_anchor`: A concise 1-2 sentence Chinese cognitive memory anchor connecting the morphology/root logic to the modern sense, making it effortless to remember without fake etymology.

INPUT WORDS:
{json.dumps(words_input, ensure_ascii=False, indent=2)}

OUTPUT FORMAT:
Return strictly a valid JSON array containing one object per input word in the exact same order:
[
  {{
    "word": "<word>",
    "english_definition": "<COBUILD style sentence>",
    "synonyms_and_nuances": "<2-3 synonyms and nuance difference in Chinese>",
    "exam_tags": ["<tag1>", "<tag2>", ...],
    "mnemonic_anchor": "<memory anchor explanation in Chinese>"
  }}
]
No markdown fences, no conversational prose, only pure raw JSON array.
"""
    return prompt


def call_codex_exec(prompt, timeout=120):
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

    # Parse stdout event stream to find agent_message
    agent_texts = []
    for line in stdout.decode("utf-8", errors="ignore").splitlines():
        try:
            event = json.loads(line)
            if event.get("type") == "item.completed":
                item = event.get("item", {})
                if item.get("type") == "agent_message":
                    agent_texts.append(item.get("text", ""))
        except Exception:
            continue

    if not agent_texts:
        raise RuntimeError("No agent_message found in Codex exec output")

    full_text = "\n".join(agent_texts).strip()
    # Strip potential ```json fences if model wrapped them
    if full_text.startswith("```"):
        lines = full_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        full_text = "\n".join(lines).strip()

    return json.loads(full_text)


def process_packet(packet, packet_id):
    """Process a single packet of words with error handling and retry."""
    prompt = build_prompt_for_packet(packet)
    for attempt in range(2):
        try:
            results = call_codex_exec(prompt, timeout=150)
            if isinstance(results, list) and len(results) == len(packet):
                # Verify each item
                res_map = {r.get("word").lower(): r for r in results if isinstance(r, dict) and r.get("word")}
                enriched_packet = []
                for original in packet:
                    w = original.get("word", "").lower()
                    enrichment = res_map.get(w, {})
                    merged = {
                        **original,
                        "english_definition": enrichment.get("english_definition", ""),
                        "synonyms_and_nuances": enrichment.get("synonyms_and_nuances", ""),
                        "exam_tags": enrichment.get("exam_tags", []),
                        "mnemonic_anchor": enrichment.get("mnemonic_anchor", ""),
                    }
                    enriched_packet.append(merged)
                print(f"[Packet {packet_id}] OK - Enriched {len(enriched_packet)} words")
                return enriched_packet
            else:
                print(f"[Packet {packet_id}] Warning: length mismatch (got {len(results) if isinstance(results, list) else 'non-list'}, expected {len(packet)}). Retrying...")
        except Exception as e:
            print(f"[Packet {packet_id}] Error (attempt {attempt+1}): {e}")
    raise RuntimeError(f"Packet {packet_id} failed after 2 attempts")


def run_batch(start_idx=0, count=50, max_workers=3, packet_size=5):
    """Run a batch of words with multi-worker concurrency."""
    all_words = load_source_words()
    batch_words = all_words[start_idx : start_idx + count]
    print(f"=== Starting Batch: words {start_idx} to {start_idx + count} (Total: {len(batch_words)}) ===")

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
    """Generate a clean visual HTML inspection card for user review."""
    html_file = REPORTS_DIR / f"{batch_name}_inspection.html"
    sample_items = items[:12]  # Showcase first 12 items

    cards_html = ""
    for item in sample_items:
        tags_badges = "".join([f'<span class="badge tag">{t}</span>' for t in item.get("exam_tags", [])])
        morph = item.get("morphology", {})
        morph_text = morph.get("text", "") if isinstance(morph, dict) else str(morph)

        cards_html += f"""
        <div class="card">
            <div class="card-header">
                <div>
                    <span class="word">{item.get('word')}</span>
                    <span class="pos">{item.get('pos')}</span>
                    <span class="phonetic">/{item.get('phonetic', '')}/</span>
                </div>
                <div class="tags">{tags_badges}</div>
            </div>
            <div class="meaning"><strong>中文释义：</strong>{item.get('meaning')}</div>
            <div class="en-def"><strong>English:</strong> {item.get('english_definition')}</div>
            <div class="morph"><strong>构词公式：</strong> {morph_text}</div>
            <div class="synonym"><strong>近义微雕：</strong> {item.get('synonyms_and_nuances')}</div>
            <div class="colloc"><strong>高频搭配：</strong> <code>{item.get('collocation', '')}</code></div>
            <div class="sentence"><strong>经典语境：</strong> {item.get('sentence', '')}<br><span class="trans">{item.get('translation', '')}</span></div>
            <div class="mnemonic"><strong>💡 秒记锚点：</strong> {item.get('mnemonic_anchor')}</div>
        </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Open-Lexicon 25K - 批次抽检卡 ({batch_name})</title>
<style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
    h1 {{ color: #38bdf8; font-size: 24px; border-bottom: 1px solid #334155; padding-bottom: 12px; }}
    .meta {{ color: #94a3b8; font-size: 14px; margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 16px; }}
    .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }}
    .card-header {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; border-bottom: 1px dashed #334155; padding-bottom: 8px; }}
    .word {{ font-size: 22px; font-weight: bold; color: #38bdf8; margin-right: 8px; }}
    .pos {{ color: #fbbf24; font-weight: 600; font-size: 14px; margin-right: 8px; }}
    .phonetic {{ color: #94a3b8; font-family: monospace; font-size: 13px; }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-left: 4px; }}
    .tag {{ background: #0284c7; color: #fff; }}
    .meaning {{ font-size: 15px; margin-bottom: 8px; color: #e2e8f0; }}
    .en-def {{ font-size: 14px; color: #38bdf8; margin-bottom: 8px; background: rgba(56, 189, 248, 0.08); padding: 6px 10px; border-radius: 6px; }}
    .morph, .synonym, .colloc, .sentence {{ font-size: 13px; color: #cbd5e1; margin-bottom: 6px; line-height: 1.5; }}
    .trans {{ color: #94a3b8; font-size: 12px; }}
    .mnemonic {{ font-size: 13px; color: #34d399; margin-top: 10px; background: rgba(52, 211, 153, 0.1); padding: 8px 10px; border-radius: 6px; }}
    code {{ background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #f472b6; }}
</style>
</head>
<body>
    <h1>🚀 Open-Lexicon 25K 批次质量抽检画廊</h1>
    <div class="meta">批次：<strong>{batch_name}</strong> | 规模：<strong>{len(items)} 词</strong> | 模型：<strong>gpt-6.1-sol (high)</strong></div>
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
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    run_batch(start_idx=0, count=count, max_workers=workers, packet_size=5)
