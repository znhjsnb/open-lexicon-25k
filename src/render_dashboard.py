import json
from pathlib import Path

ROOT = Path(r"C:\Users\d\Documents\dict")
ENRICHED_FILE = ROOT / "data" / "enriched" / "batch_00000_00004.json"
OUT_HTML = ROOT / "reports" / "full_spec_visualization.html"

with open(ENRICHED_FILE, "r", encoding="utf-8") as f:
    words = json.load(f)

json_data_str = json.dumps(words, ensure_ascii=False)

html_template = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Open-Lexicon 25K - 全双语对照 (Bilingual Parallel Edition)</title>
<script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
<style>
  body {{ background: #0b0f19; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
  .tab-btn.active {{ background: #0284c7; color: #ffffff; border-color: #38bdf8; }}
  .lang-toggle.active {{ background: #3b82f6; color: #ffffff; }}
</style>
</head>
<body class="p-6 max-w-7xl mx-auto">
  <header class="mb-8 border-b border-slate-800 pb-5 flex flex-wrap justify-between items-end gap-4">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-sky-400">🚀 Open-Lexicon 25K 全维度中英双语对齐大盘</h1>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">Bilingual Parallel Edition</span>
      </div>
      <p class="text-sm text-slate-400 mt-1">每个单词全量涵盖【多词性覆盖 + 柯林斯纯英 + 中英双轨释义 + 中英双语语源历史 + 中英双语构词衍生 + 中英双语近义微雕】</p>
    </div>
    
    <!-- Language Toggle Switcher -->
    <div class="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
      <button onclick="setLangMode('both')" id="btn-both" class="lang-toggle active px-3 py-1.5 rounded transition">中英双语对照</button>
      <button onclick="setLangMode('en')" id="btn-en" class="lang-toggle px-3 py-1.5 rounded text-slate-400 hover:text-white transition">English Only</button>
      <button onclick="setLangMode('zh')" id="btn-zh" class="lang-toggle px-3 py-1.5 rounded text-slate-400 hover:text-white transition">中文精炼</button>
    </div>
  </header>

  <!-- Word Selector Tabs -->
  <div class="mb-6 flex flex-wrap gap-2" id="tabsContainer"></div>

  <!-- Detail Display Container -->
  <div id="wordView" class="space-y-6"></div>

<script>
const words = {json_data_str};
let activeIndex = 0;
let langMode = 'both'; // 'both', 'en', 'zh'

function setLangMode(mode) {{
  langMode = mode;
  document.querySelectorAll('.lang-toggle').forEach(b => b.classList.remove('active', 'text-white'));
  document.getElementById('btn-' + mode).classList.add('active', 'text-white');
  renderWordDetail();
}}

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

  // Bilingual Etymology
  const etym = w.etymology_story || {{}};
  const etymZh = typeof etym === 'object' ? (etym.zh || '') : String(etym);
  const etymEn = typeof etym === 'object' ? (etym.en || '') : '';

  // Bilingual Morphology
  const morph = w.morphology_enriched || w.morphology || {{}};
  const morphZh = typeof morph === 'object' ? (morph.zh || morph.text || '') : String(morph);
  const morphEn = typeof morph === 'object' ? (morph.en || '') : '';

  // Bilingual Synonyms
  const syn = w.synonyms_and_nuances || {{}};
  const synZh = typeof syn === 'object' ? (syn.zh || '') : String(syn);
  const synEn = typeof syn === 'object' ? (syn.en || '') : '';

  // Bilingual Mnemonic
  const mnem = w.mnemonic_anchor || {{}};
  const mnemZh = typeof mnem === 'object' ? (mnem.zh || '') : String(mnem);
  const mnemEn = typeof mnem === 'object' ? (mnem.en || '') : '';

  // Render Senses
  const senses = w.senses || [];
  const sensesHtml = senses.map((s, sIdx) => {{
    const showZh = langMode !== 'en';
    const showEn = langMode !== 'zh';

    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
        <div class="flex items-baseline justify-between border-b border-slate-800/80 pb-2">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800/80">${{s.pos || ''}}</span>
            <span class="font-mono text-slate-400 text-xs">${{s.phonetic || ''}}</span>
            ${{showZh ? `<span class="text-slate-100 font-semibold text-sm ml-2">${{s.meaning_zh || s.meaning || ''}}</span>` : ''}}
            ${{showEn ? `<span class="text-sky-300 font-medium text-xs italic ml-2">(${{s.meaning_en || ''}})</span>` : ''}}
          </div>
          <span class="text-xs text-slate-500">Sense #${{sIdx + 1}}</span>
        </div>

        ${{showEn ? `
        <div class="text-xs text-sky-200 italic bg-sky-950/30 p-2.5 rounded border border-sky-900/40">
          <strong class="text-sky-400 not-italic">COBUILD:</strong> "${{s.english_definition || ''}}"
        </div>
        ` : ''}}

        <div class="text-xs text-slate-300">
          <strong class="text-slate-400">搭配 Collocation:</strong> 
          <code class="text-pink-300 bg-slate-900 px-1.5 py-0.5 rounded">${{s.collocation_en || s.collocation || ''}}</code>
          ${{showZh && s.collocation_zh ? `<span class="text-slate-400 ml-2">（${{s.collocation_zh}}）</span>` : ''}}
        </div>

        <div class="text-xs text-slate-200 border-l-2 border-sky-500 pl-2.5 py-0.5 space-y-1">
          <div class="text-slate-200">${{s.sentence_en || s.sentence || ''}}</div>
          ${{showZh ? `<div class="text-slate-400 text-xs">${{s.sentence_zh || s.translation || ''}}</div>` : ''}}
        </div>
      </div>
    `;
  }}).join('');

  const showZh = langMode !== 'en';
  const showEn = langMode !== 'zh';

  container.innerHTML = `
    <!-- Top Identity Card -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
      <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-4">
        <div class="flex items-baseline gap-4">
          <span class="text-4xl font-extrabold text-sky-400 tracking-tight">${{w.word}}</span>
          <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-950 text-blue-300 border border-blue-800">
            涵盖 ${{senses.length}} 个常用全功能词性 · 全双语对照
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${{tagsHtml}}
        </div>
      </div>

      <!-- Multi-Senses Grid -->
      <div class="mt-4 space-y-3">
        <div class="text-xs font-semibold uppercase tracking-wider text-slate-400">多词性义项全景 (Bilingual Senses)</div>
        <div class="grid grid-cols-1 md:grid-cols-${{Math.min(senses.length, 2)}} gap-4">
          ${{sensesHtml}}
        </div>
      </div>
    </div>

    <!-- 4-Grid Core Knowledge Modules -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

      <!-- 1. 词汇历史来源与演化 (Bilingual Etymology) -->
      <div class="bg-slate-900/90 border border-amber-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-amber-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>🏛️</span> <span>来源历史与演化 (Historical Etymology & Evolution)</span>
        </div>
        <div class="space-y-2">
          ${{showZh && etymZh ? `<div class="text-xs text-slate-200 leading-relaxed bg-amber-950/20 p-3 rounded-lg border border-amber-900/40">${{etymZh}}</div>` : ''}}
          ${{showEn && etymEn ? `<div class="text-xs text-amber-200/90 italic font-serif leading-relaxed bg-amber-950/30 p-3 rounded-lg border border-amber-900/40">${{etymEn}}</div>` : ''}}
        </div>
      </div>

      <!-- 2. 现代公式化构词拆解与全词族 (Bilingual Morphology) -->
      <div class="bg-slate-900/90 border border-indigo-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-indigo-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>🧩</span> <span>形态构词与词族 (Morphology & Word Family)</span>
        </div>
        <div class="space-y-2">
          ${{showZh && morphZh ? `<div class="text-xs text-slate-200 leading-relaxed bg-indigo-950/20 p-3 rounded-lg border border-indigo-900/40">${{morphZh}}</div>` : ''}}
          ${{showEn && morphEn ? `<div class="text-xs text-indigo-200/90 italic leading-relaxed bg-indigo-950/30 p-3 rounded-lg border border-indigo-900/40">${{morphEn}}</div>` : ''}}
        </div>
      </div>

      <!-- 3. 近义微雕辨析 (Bilingual Nuances) -->
      <div class="bg-slate-900/90 border border-rose-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-rose-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>⚖️</span> <span>近义微雕辨析 (Synonym Nuances)</span>
        </div>
        <div class="space-y-2">
          ${{showZh && synZh ? `<div class="text-xs text-slate-200 leading-relaxed bg-rose-950/20 p-3 rounded-lg border border-rose-900/40">${{synZh}}</div>` : ''}}
          ${{showEn && synEn ? `<div class="text-xs text-rose-200/90 italic leading-relaxed bg-rose-950/30 p-3 rounded-lg border border-rose-900/40">${{synEn}}</div>` : ''}}
        </div>
      </div>

      <!-- 4. 认知记忆秒记锚点 (Bilingual Mnemonic) -->
      <div class="bg-slate-900/90 border border-emerald-900/50 rounded-xl p-5 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-emerald-400 font-semibold border-b border-slate-800 pb-2.5">
          <span>💡</span> <span>秒记逻辑锚点 (Cognitive Mnemonic Hook)</span>
        </div>
        <div class="space-y-2">
          ${{showZh && mnemZh ? `<div class="text-xs text-emerald-200 leading-relaxed bg-emerald-950/20 p-3 rounded-lg border border-emerald-900/40">${{mnemZh}}</div>` : ''}}
          ${{showEn && mnemEn ? `<div class="text-xs text-emerald-200/90 italic leading-relaxed bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/40">${{mnemEn}}</div>` : ''}}
        </div>
      </div>

    </div>

    <!-- Raw JSON Collapsible -->
    <details class="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400">
      <summary class="cursor-pointer text-slate-400 hover:text-sky-400 font-sans font-semibold">🔍 查看此词全维度中英双语原生 JSON (开发者规范视图)</summary>
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
