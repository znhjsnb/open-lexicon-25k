import json
from pathlib import Path

ROOT = Path(r"C:\Users\d\Documents\dict")
ENRICHED_FILE = ROOT / "data" / "enriched" / "batch_00000_00006.json"
OUT_HTML = ROOT / "reports" / "full_spec_visualization.html"

with open(ENRICHED_FILE, "r", encoding="utf-8") as f:
    words = json.load(f)

json_data_str = json.dumps(words, ensure_ascii=False)

html_template = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Open-Lexicon 25K - 多词性全覆盖 31 维终极大盘</title>
<script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
<style>
  body {{ background: #0b0f19; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
  .tab-btn.active {{ background: #0284c7; color: #ffffff; border-color: #38bdf8; }}
</style>
</head>
<body class="p-6 max-w-7xl mx-auto">
  <header class="mb-8 border-b border-slate-800 pb-5 flex flex-wrap justify-between items-end gap-4">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-sky-400">🚀 Open-Lexicon 25K 多词性全覆盖元数据画廊</h1>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">多词性+全要素彻底打通</span>
      </div>
      <p class="text-sm text-slate-400 mt-1">每个单词全面补齐所有常用词性（含独立音标、柯林斯纯英释义、双场景搭配与例句）+ 完整语源历史 + 构词拆解 + 近义微雕</p>
    </div>
    <div class="text-right text-xs text-slate-400">
      模型：<strong>gpt-6.1-sol (high)</strong> | 特性：<strong>全词性补全</strong>
    </div>
  </header>

  <!-- Word Selector Tabs -->
  <div class="mb-6 flex flex-wrap gap-2" id="tabsContainer"></div>

  <!-- Detail Display Container -->
  <div id="wordView" class="space-y-6"></div>

<script>
const words = {json_data_str};
let activeIndex = 0;

function renderTabs() {{
  const container = document.getElementById('tabsContainer');
  container.innerHTML = words.map((w, idx) => {{
    const senseCount = (w.senses || []).length;
    return `
      <button onclick="selectWord(${{idx}})" class="tab-btn px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 transition ${{idx === activeIndex ? 'active' : ''}}">
        ${{w.word}} <span class="text-xs text-amber-400 font-mono ml-1">(${{senseCount}} 词性)</span>
      </button>
    `;
  }}).join('');
}}

function selectWord(idx) {{
  activeIndex = idx;
  renderTabs();
  renderWordDetail();
}}

function renderWordDetail() {{
  const w = words[activeIndex];
  const container = document.getElementById('wordView');

  const tagsHtml = (w.exam_tags || []).map(t => `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-sky-950 text-sky-300 border border-sky-800">${{t}}</span>`).join(' ');
  const morphText = w.morphology_enriched || (typeof w.morphology === 'object' && w.morphology ? w.morphology.text : w.morphology) || '';

  // Render all senses
  const senses = w.senses || [];
  const sensesHtml = senses.map((s, sIdx) => `
    <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
      <div class="flex items-baseline justify-between border-b border-slate-800/80 pb-2">
        <div class="flex items-baseline gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800/80">${{s.pos || ''}}</span>
          <span class="font-mono text-slate-400 text-xs">${{s.phonetic || ''}}</span>
          <span class="text-slate-100 font-semibold text-sm ml-2">${{s.meaning || ''}}</span>
        </div>
        <span class="text-xs text-slate-500">义项 #${{sIdx + 1}}</span>
      </div>
      <div class="text-xs text-sky-200 italic bg-sky-950/30 p-2.5 rounded border border-sky-900/40">
        <strong class="text-sky-400 not-italic">English:</strong> "${{s.english_definition || ''}}"
      </div>
      <div class="text-xs text-slate-300">
        <strong class="text-slate-400">高频搭配：</strong> <code class="text-pink-300 bg-slate-900 px-1.5 py-0.5 rounded">${{s.collocation || ''}}</code>
      </div>
      <div class="text-xs text-slate-200 border-l-2 border-sky-500 pl-2.5 py-0.5">
        <div class="text-slate-200">${{s.sentence || ''}}</div>
        <div class="text-slate-400 text-xs mt-0.5">${{s.translation || ''}}</div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <!-- Top Identity Card -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
      <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-4">
        <div class="flex items-baseline gap-4">
          <span class="text-4xl font-extrabold text-sky-400 tracking-tight">${{w.word}}</span>
          <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-950 text-blue-300 border border-blue-800">
            涵盖 ${{senses.length}} 个常用全功能词性
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${{tagsHtml}}
        </div>
      </div>

      <!-- Multi-Senses Grid -->
      <div class="mt-4 space-y-3">
        <div class="text-xs font-semibold uppercase tracking-wider text-slate-400">全词性义项深度展开 (Multi-POS Senses)</div>
        <div class="grid grid-cols-1 md:grid-cols-${{Math.min(senses.length, 3)}} gap-3">
          ${{sensesHtml}}
        </div>
      </div>
    </div>

    <!-- 4-Grid Core Knowledge Modules -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

      <!-- 1. 词汇历史来源与演化 -->
      <div class="bg-slate-900/90 border border-amber-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-amber-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>🏛️</span> <span>词汇来源历史与溯源 (Historical Etymology & Provenance)</span>
        </div>
        <div class="text-xs text-slate-200 leading-relaxed bg-amber-950/20 p-3.5 rounded-lg border border-amber-900/40">
          ${{w.etymology_story || '暂无词源故事'}}
        </div>
      </div>

      <!-- 2. 现代公式化构词拆解与全词族 -->
      <div class="bg-slate-900/90 border border-indigo-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-indigo-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>🧩</span> <span>现代形态构词与全词族 (Morphology & Full Family)</span>
        </div>
        <div class="text-xs text-slate-200 leading-relaxed bg-indigo-950/20 p-3.5 rounded-lg border border-indigo-900/40">
          ${{morphText}}
        </div>
      </div>

      <!-- 3. 近义微雕辨析 -->
      <div class="bg-slate-900/90 border border-rose-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-rose-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>⚖️</span> <span>近义微雕辨析 (Nuance Discrimination)</span>
        </div>
        <div class="text-xs text-slate-200 leading-relaxed bg-rose-950/20 p-3.5 rounded-lg border border-rose-900/40">
          ${{w.synonyms_and_nuances || '暂无近义辨析'}}
        </div>
      </div>

      <!-- 4. 认知记忆与极简秒记锚点 -->
      <div class="bg-slate-900/90 border border-emerald-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-emerald-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>💡</span> <span>秒记逻辑锚点 (Cognitive Mnemonic Anchor)</span>
        </div>
        <div class="text-xs text-emerald-200 leading-relaxed bg-emerald-950/20 p-3.5 rounded-lg border border-emerald-900/40">
          ${{w.mnemonic_anchor || '结合构词形态公式强化认知'}}
        </div>
      </div>

    </div>

    <!-- Raw JSON Collapsible (For Developers) -->
    <details class="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400">
      <summary class="cursor-pointer text-slate-400 hover:text-sky-400 font-sans font-semibold">🔍 查看此词底层完整多词性原生 JSON (开发者规范视图)</summary>
      <pre class="mt-3 p-4 bg-slate-900 rounded-lg overflow-x-auto text-slate-300">${{JSON.stringify(w, null, 2)}}</pre>
    </details>
  `;
}}

renderTabs();
renderWordDetail();
</script>
</body>
</html>
"""

with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_template)
print("SUCCESS: written to", OUT_HTML)
