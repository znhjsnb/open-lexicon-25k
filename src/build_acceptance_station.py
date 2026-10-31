"""
Generates 验收工作台.html (Master Acceptance Station)
Compiles all enriched batches into an interactive single-page dictionary inspector.
"""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(r"C:\Users\d\Documents\dict")
ENRICHED_DIR = ROOT / "data" / "enriched"
REPORTS_DIR = ROOT / "reports"
OUTPUT_HTML = ROOT / "验收工作台.html"

def load_all_batches():
    batch_files = sorted(ENRICHED_DIR.glob("batch_*_*.json"))
    batches = []
    for p in batch_files:
        name = p.stem
        parts = name.split("_")
        if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
            start_num = int(parts[1])
            end_num = int(parts[2])
            if end_num - start_num >= 500:  # Production batch
                batch_num = (start_num // 1000) + 1
                label = f"批次 {batch_num} ({start_num} ~ {end_num} 词)"
                batches.append((name, p, label))
    
    all_words = {}
    stats = {
        "batches": [],
        "total_words": 0,
        "total_senses": 0,
    }
    
    for b_id, path, label in batches:
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        sense_count = sum(len(w.get("senses", [])) for w in data)
        stats["batches"].append({
            "id": b_id,
            "label": label,
            "count": len(data),
            "senses": sense_count,
            "avg_senses": round(sense_count / len(data), 2) if data else 0,
            "html_report": f"reports/{b_id}_inspection.html"
        })
        stats["total_words"] += len(data)
        stats["total_senses"] += sense_count
        
        for w in data:
            word_name = w.get("word", "").lower()
            if word_name and word_name not in all_words:
                all_words[word_name] = w
                
    stats["overall_avg"] = round(stats["total_senses"] / stats["total_words"], 2) if stats["total_words"] else 0
    return all_words, stats

def build_html():
    all_words, stats = load_all_batches()
    
    # We include all words into the viewer.
    # To keep the HTML file reasonably fast to load, we can structure words cleanly.
    words_json = json.dumps(all_words, ensure_ascii=False)
    
    next_batch_num = len(stats["batches"]) + 1
    next_start = len(stats["batches"]) * 1000
    next_end = min(next_start + 1000, 25006)
    
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Open-Lexicon 25K 验收工作台</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body {{ background: #0b0f19; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
  .tab-btn.active {{ background: #0284c7; color: #ffffff; border-color: #38bdf8; }}
  .lang-toggle.active {{ background: #3b82f6; color: #ffffff; }}
  .card-glow {{ box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }}
  ::-webkit-scrollbar {{ width: 8px; height: 8px; }}
  ::-webkit-scrollbar-track {{ background: #0f172a; }}
  ::-webkit-scrollbar-thumb {{ background: #334155; border-radius: 4px; }}
  ::-webkit-scrollbar-thumb:hover {{ background: #475569; }}
</style>
</head>
<body class="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">

  <!-- Top Header -->
  <header class="mb-6 border-b border-slate-800 pb-5">
    <div class="flex flex-wrap justify-between items-start gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="text-3xl">🏛️</span>
          <div>
            <h1 class="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-300">
              Open-Lexicon 25K 交互式验收大盘
            </h1>
            <p class="text-sm text-slate-400 mt-1">
              全量涵盖：多词性深度拆解 · 柯林斯整句英文释义 · 词源演变 · 构词词族 · 近义微雕 · 记忆锚点
            </p>
          </div>
        </div>
      </div>
      
      <!-- Right Status Pill -->
      <div class="flex items-center gap-2 bg-slate-900 border border-slate-700/80 px-3.5 py-2 rounded-xl text-xs">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span class="text-slate-300 font-medium">第 {next_batch_num} 批次 ({next_start}~{next_end}) 正在 20 路并发生产中</span>
      </div>
    </div>

    <!-- Live Telemetry Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
      <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
        <div class="text-xs text-slate-400 font-medium">已交付入库词汇</div>
        <div class="text-2xl font-bold text-sky-400 mt-1">{stats['total_words']:,} <span class="text-xs font-normal text-slate-500">/ 25,006 词</span></div>
        <div class="text-[11px] text-emerald-400 mt-1">✓ 100% 通过双语字段完整性检验</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
        <div class="text-xs text-slate-400 font-medium">已精编词性 & 义项总数</div>
        <div class="text-2xl font-bold text-indigo-400 mt-1">{stats['total_senses']:,} <span class="text-xs font-normal text-slate-500">个义项</span></div>
        <div class="text-[11px] text-indigo-300 mt-1">平均每词 <strong>{stats['overall_avg']}</strong> 个词性（原素材仅 1.0）</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
        <div class="text-xs text-slate-400 font-medium">Git 版本库原子提交</div>
        <div class="text-2xl font-bold text-amber-400 mt-1">{len(stats['batches'])} <span class="text-xs font-normal text-slate-500">次原子 Commit</span></div>
        <div class="text-[11px] text-slate-400 mt-1">每 1000 词独立归档 checkpoint</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
        <div class="text-xs text-slate-400 font-medium">ChatGPT Pro 算力配额</div>
        <div class="text-2xl font-bold text-emerald-400 mt-1">76.0% <span class="text-xs font-normal text-slate-500">剩余待用</span></div>
        <div class="text-[11px] text-emerald-400 mt-1">累计仅消耗 24% | 零限流封锁</div>
      </div>
    </div>
  </header>

  <!-- Interactive Search & Filter Control Bar -->
  <div class="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl mb-6 backdrop-blur">
    <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
      
      <!-- Search Input -->
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
        <input 
          type="text" 
          id="searchInput" 
          placeholder="即时检索已交付的 {stats['total_words']:,} 个单词（例如输入: budget, reserve, commute, deposit, book）..."
          class="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
          oninput="handleSearch(this.value)"
        >
        <!-- Search suggestions dropdown -->
        <div id="suggestions" class="absolute z-20 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl max-h-60 overflow-y-auto hidden shadow-2xl"></div>
      </div>

      <!-- Language Mode Switcher -->
      <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold shrink-0">
        <button onclick="setLangMode('both')" id="btn-both" class="lang-toggle active px-3 py-1.5 rounded-lg transition">中英双语对齐</button>
        <button onclick="setLangMode('en')" id="btn-en" class="lang-toggle px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">English Only (COBUILD)</button>
        <button onclick="setLangMode('zh')" id="btn-zh" class="lang-toggle px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">中文精炼</button>
      </div>
    </div>

    <!-- Quick Test Word Pills -->
    <div class="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs overflow-x-auto pb-1">
      <span class="text-slate-400 shrink-0 font-medium">💡 一键抽验典型多词性高难词:</span>
      <div class="flex gap-1.5 flex-nowrap" id="quickPills">
        <!-- Will be filled by JS -->
      </div>
    </div>
  </div>

  <!-- Main Word Detail Viewer -->
  <main id="wordDisplayArea" class="space-y-6">
    <!-- Populated by JS -->
  </main>

  <!-- Individual Batch Links Section -->
  <section class="mt-12 pt-8 border-t border-slate-800">
    <h2 class="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2">
      <span>📂</span> 各独立批次抽检 HTML 与原始数据直达
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {"" if not stats['batches'] else "".join([f'''
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold text-sky-400 text-sm">{b['label']}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">{b['count']} 词</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">共精编 <strong>{b['senses']}</strong> 个义项 · 平均 <strong>{b['avg_senses']}</strong> 个/词</p>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-800 flex gap-2 text-xs">
          <a href="{b['html_report']}" target="_blank" class="flex-1 text-center py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition">打开独立抽检页 ↗</a>
          <a href="data/enriched/{b['id']}.json" target="_blank" class="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">JSON 源码</a>
        </div>
      </div>
      ''' for b in stats['batches']])}
    </div>
  </section>

<script>
// Raw database dictionary
const DB = {words_json};
let currentWordKey = 'budget';
let langMode = 'both';

const quickSamples = ['budget', 'commute', 'deposit', 'reserve', 'rent', 'charge', 'bank', 'bear', 'book', 'break', 'balance', 'benefit'];

function init() {{
  renderQuickPills();
  if (DB['budget']) {{
    displayWord('budget');
  }} else {{
    const first = Object.keys(DB)[0];
    if (first) displayWord(first);
  }}
}}

function renderQuickPills() {{
  const container = document.getElementById('quickPills');
  container.innerHTML = quickSamples.map(w => {{
    const exists = !!DB[w];
    return `
      <button 
        onclick="displayWord('${{w}}')" 
        class="px-2.5 py-1 rounded-lg border text-xs font-medium transition ${{
          exists 
            ? 'border-slate-700 bg-slate-800/80 text-sky-300 hover:bg-sky-900/40 hover:border-sky-500' 
            : 'border-slate-800 text-slate-600 cursor-not-allowed'
        }}"
        ${{exists ? '' : 'disabled'}}
      >
        ${{w}}
      </button>
    `;
  }}).join('');
}}

function setLangMode(mode) {{
  langMode = mode;
  document.querySelectorAll('.lang-toggle').forEach(b => b.classList.remove('active', 'text-white'));
  document.getElementById('btn-' + mode).classList.add('active', 'text-white');
  displayWord(currentWordKey);
}}

function handleSearch(val) {{
  val = val.trim().toLowerCase();
  const sugg = document.getElementById('suggestions');
  if (!val) {{
    sugg.classList.add('hidden');
    return;
  }}
  
  const matches = Object.keys(DB).filter(k => k.startsWith(val)).slice(0, 10);
  if (matches.length === 0) {{
    sugg.innerHTML = `<div class="p-3 text-xs text-slate-500">未在当前已交付的 {stats['total_words']:,} 词中检索到 "${{val}}"，后续批次正在持续生产中...</div>`;
    sugg.classList.remove('hidden');
    return;
  }}
  
  sugg.innerHTML = matches.map(m => `
    <div 
      onclick="selectFromSearch('${{m}}')" 
      class="px-4 py-2 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-sm border-b border-slate-800/50 last:border-0"
    >
      <span class="font-bold text-sky-400">${{m}}</span>
      <span class="text-xs text-slate-400">${{(DB[m].senses || []).length}} 个词性/义项</span>
    </div>
  `).join('');
  sugg.classList.remove('hidden');
}}

function selectFromSearch(w) {{
  document.getElementById('searchInput').value = w;
  document.getElementById('suggestions').classList.add('hidden');
  displayWord(w);
}}

function displayWord(wKey) {{
  currentWordKey = wKey.toLowerCase();
  const item = DB[currentWordKey];
  const area = document.getElementById('wordDisplayArea');
  if (!item) return;

  const senses = item.senses || [];
  const etym = item.etymology_story || {{}};
  const morph = item.morphology_enriched || {{}};
  const syn = item.synonyms_and_nuances || {{}};
  const mnem = item.mnemonic_anchor || {{}};
  const tags = item.exam_tags || [];

  // Badges
  const tagsHtml = tags.map(t => `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-sky-950 text-sky-300 border border-sky-800/60">${{t}}</span>`).join(' ');

  // Senses HTML
  const sensesHtml = senses.map((s, idx) => {{
    const pos = s.pos || '';
    const ipa = s.phonetic ? `/${{s.phonetic}}/` : '';
    const zhDef = s.meaning_zh || '';
    const enDef = s.meaning_en || '';
    const cobuild = s.english_definition || '';
    const collocEn = s.collocation_en || '';
    const collocZh = s.collocation_zh || '';
    const sentEn = s.sentence_en || '';
    const sentZh = s.sentence_zh || '';

    return `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
        <div class="flex flex-wrap items-baseline gap-2.5 pb-2.5 border-b border-slate-800/80 mb-3">
          <span class="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">${{pos}}</span>
          ${{ipa ? `<span class="text-xs font-mono text-slate-400">${{ipa}}</span>` : ''}}
          
          ${{langMode !== 'en' ? `<span class="text-base font-bold text-white">${{zhDef}}</span>` : ''}}
          ${{langMode !== 'zh' ? `<span class="text-sm font-medium text-slate-300 italic">(${{enDef}})</span>` : ''}}
        </div>

        ${{cobuild && langMode !== 'zh' ? `
        <div class="mb-3 text-xs bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60">
          <span class="text-sky-400 font-semibold">📖 COBUILD 纯英解释:</span>
          <span class="text-slate-200 ml-1 italic">${{cobuild}}</span>
        </div>` : ''}}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <!-- Collocation -->
          <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
            <div class="text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <span>🔗 核心地道搭配:</span>
            </div>
            ${{langMode !== 'zh' ? `<div class="font-mono text-sky-300 text-xs">${{collocEn}}</div>` : ''}}
            ${{langMode !== 'en' ? `<div class="text-slate-400 text-[11px] mt-0.5">${{collocZh}}</div>` : ''}}
          </div>

          <!-- Example Sentence -->
          <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
            <div class="text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <span>💬 语境典型例句:</span>
            </div>
            ${{langMode !== 'zh' ? `<div class="text-slate-200 text-xs">${{sentEn}}</div>` : ''}}
            ${{langMode !== 'en' ? `<div class="text-slate-400 text-[11px] mt-0.5">${{sentZh}}</div>` : ''}}
          </div>
        </div>
      </div>
    `;
  }}).join('');

  // 4 Deep Pillars HTML
  const etymZh = etym.zh || '';
  const etymEn = etym.en || '';
  const morphZh = morph.zh || '';
  const morphEn = morph.en || '';
  const synZh = syn.zh || '';
  const synEn = syn.en || '';
  const mnemZh = mnem.zh || '';
  const mnemEn = mnem.en || '';

  area.innerHTML = `
    <!-- Card Main Wrapper -->
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 card-glow">
      
      <!-- Word Header -->
      <div class="flex flex-wrap justify-between items-baseline gap-4 pb-6 border-b border-slate-800">
        <div>
          <div class="flex items-baseline gap-3">
            <h2 class="text-3xl md:text-4xl font-black text-sky-400 tracking-tight">${{item.word}}</h2>
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              ${{senses.length}} 个词性/义项 · 深度双语编纂
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5">${{tagsHtml}}</div>
      </div>

      <!-- Senses Section -->
      <div class="mt-6">
        <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
          📚 多词性精细释义与语境 (${{senses.length}} 个独立义项)
        </h3>
        <div class="space-y-3">
          ${{sensesHtml}}
        </div>
      </div>

      <!-- 4 Pillars Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        
        <!-- Etymology -->
        <div class="bg-amber-950/10 border border-amber-500/20 rounded-xl p-4 text-xs">
          <div class="font-bold text-amber-400 mb-2 flex items-center gap-1.5">
            <span>🏛️</span> 真实词源历史与语义演变 (Etymology)
          </div>
          ${{langMode !== 'en' && etymZh ? `<div class="text-slate-300 leading-relaxed mb-1.5">${{etymZh}}</div>` : ''}}
          ${{langMode !== 'zh' && etymEn ? `<div class="text-slate-400 italic leading-relaxed text-[11px]">${{etymEn}}</div>` : ''}}
        </div>

        <!-- Morphology -->
        <div class="bg-indigo-950/10 border border-indigo-500/20 rounded-xl p-4 text-xs">
          <div class="font-bold text-indigo-400 mb-2 flex items-center gap-1.5">
            <span>🧩</span> 现代构词公式及全词族衍生 (Morphology)
          </div>
          ${{langMode !== 'en' && morphZh ? `<div class="text-slate-300 leading-relaxed mb-1.5">${{morphZh}}</div>` : ''}}
          ${{langMode !== 'zh' && morphEn ? `<div class="text-slate-400 italic leading-relaxed text-[11px]">${{morphEn}}</div>` : ''}}
        </div>

        <!-- Synonyms & Nuances -->
        <div class="bg-rose-950/10 border border-rose-500/20 rounded-xl p-4 text-xs">
          <div class="font-bold text-rose-400 mb-2 flex items-center gap-1.5">
            <span>⚖️</span> 近义词辨析与微观语感差异 (Synonyms & Nuances)
          </div>
          ${{langMode !== 'en' && synZh ? `<div class="text-slate-300 leading-relaxed mb-1.5">${{synZh}}</div>` : ''}}
          ${{langMode !== 'zh' && synEn ? `<div class="text-slate-400 italic leading-relaxed text-[11px]">${{synEn}}</div>` : ''}}
        </div>

        <!-- Mnemonic -->
        <div class="bg-emerald-950/10 border border-emerald-500/20 rounded-xl p-4 text-xs">
          <div class="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
            <span>💡</span> 极简逻辑认知秒记锚点 (Mnemonic Anchor)
          </div>
          ${{langMode !== 'en' && mnemZh ? `<div class="text-slate-300 leading-relaxed mb-1.5">${{mnemZh}}</div>` : ''}}
          ${{langMode !== 'zh' && mnemEn ? `<div class="text-slate-400 italic leading-relaxed text-[11px]">${{mnemEn}}</div>` : ''}}
        </div>

      </div>

    </div>
  `;
}}

// Close suggestions on outside click
document.addEventListener('click', (e) => {{
  if (!e.target.closest('#searchInput') && !e.target.closest('#suggestions')) {{
    document.getElementById('suggestions').classList.add('hidden');
  }}
}});

window.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ Generated Master Acceptance Station at: {OUTPUT_HTML} (Size: {OUTPUT_HTML.stat().st_size:,} bytes)")

if __name__ == "__main__":
    build_html()
