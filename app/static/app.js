import { normalizeTags } from './data.js';
import { getWord, cacheStatus, prepareOffline } from './db.js';

const $ = id => document.getElementById(id);
const searchInput = $('search');
const list = $('word-list');
const content = $('content');
const detail = $('detail');
const pinnedWord = $('toolbar-pinned-word');
const studyDialog = $('study');
const metrics = window.lexiconMetrics = { startup: {}, searches: [], details: [] };
const state = { ready: false, query: '', letter: '', prefix: '', prefixes: {}, tag: '', pos: '', savedOnly: false, offset: 0, total: 0, results: [], appending: false, pendingNavigation: '', selected: null, selectedKey: '', requestId: 0, selectionId: 0, studyId: 0, study: [], cardIndex: 0, flipped: false, studyDone: false };
let worker;
let toastTimer;
let speechButton;
let speechGeneration = 0;
let searchStarted = 0;
let studyTrigger;
let preparingOffline = false;
let pauseOffline = false;
let offlineShellReady = Promise.resolve(false);

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('设备存储不可用，本次操作仅在当前页面保留'); return false; }
}
const storedBookmarks = readStorage('open_lexicon_bookmarks', []);
const bookmarks = new Set(Array.isArray(storedBookmarks) ? storedBookmarks.filter(word => typeof word === 'string').map(word => word.toLowerCase()) : []);
const storedProgress = readStorage('open_lexicon_progress', {});
const progress = storedProgress && typeof storedProgress === 'object' && !Array.isArray(storedProgress) ? storedProgress : {};
function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dayNumber(day = localDay()) { return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000); }
function todayWords() { const words = progress[localDay()]; return Array.isArray(words) ? words.filter(word => typeof word === 'string') : []; }
function pushMetric(key, value) { metrics[key].push(value); if (metrics[key].length > 100) metrics[key].shift(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function phonetic(value) { return value ? `/${String(value).replace(/^\/+|\/+$/g, '')}/` : ''; }
function posName(value) { return String(value || '').split(/\s/)[0]; }
function posClass(value) {
  const pos = posName(value);
  return ({ 'n.': 'noun', 'v.': 'verb', 'vt.': 'verb', 'vi.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb' })[pos] || 'other';
}
const speaker = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 5 10H2v4h3l6 5V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>';
function audioButton(text, label, light = false, lang = 'en-US') {
  const englishLabel = ({ 英音: 'UK', 美音: 'US', 听例句: 'Listen' })[label];
  const caption = englishLabel ? `<span class="label-zh">${escapeHtml(label)}</span><span class="label-en" lang="en">${englishLabel}</span>` : `<span>${escapeHtml(label)}</span>`;
  return `<button class="audio-pill${light ? ' light' : ''}" data-speak="${escapeHtml(text)}" data-lang="${lang}" aria-label="${escapeHtml(label)}">${speaker}${caption}<span class="wave" aria-hidden="true"><span></span><span></span><span></span></span></button>`;
}
function highlighted(text, word) {
  // Literal matching, never interpolate a headword into an unescaped RegExp.
  const source = String(text ?? '');
  const index = source.toLowerCase().indexOf(String(word).toLowerCase());
  if (index < 0 || !word) return escapeHtml(source);
  return `${escapeHtml(source.slice(0, index))}<mark>${escapeHtml(source.slice(index, index + word.length))}</mark>${escapeHtml(source.slice(index + word.length))}`;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

function haptic() {
  try { navigator.vibrate?.([8]); } catch { /* Unsupported or disallowed: visual feedback remains. */ }
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Direct manipulation changes layout without a width animation or delayed tracking.
const resizer = $('resizer');
const sidebarWidthKey = 'open_lexicon_sidebar_width';
let sidebarWidth = 340;
let resizeGrab;
function setSidebarWidth(value, persist = false) {
  sidebarWidth = Math.round(Math.max(240, Math.min(640, Number.isFinite(value) ? value : 340)));
  document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
  resizer.setAttribute('aria-valuenow', sidebarWidth);
  resizer.setAttribute('aria-valuetext', `${sidebarWidth} 像素`);
  if (persist) writeStorage(sidebarWidthKey, sidebarWidth);
}
resizer.setAttribute('aria-valuemin', '240');
resizer.setAttribute('aria-valuemax', '640');
const storedSidebarWidth = readStorage(sidebarWidthKey, 340);
setSidebarWidth(typeof storedSidebarWidth === 'number' ? storedSidebarWidth : 340);
resizer.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  resizeGrab = { id: event.pointerId, x: event.clientX, width: sidebarWidth };
  resizer.setPointerCapture(event.pointerId);
  resizer.focus({ preventScroll: true });
  document.body.classList.add('resizing');
});
resizer.addEventListener('pointermove', event => {
  if (resizeGrab?.id !== event.pointerId) return;
  setSidebarWidth(resizeGrab.width + event.clientX - resizeGrab.x);
});
function finishResize(event) {
  if (resizeGrab?.id !== event.pointerId) return;
  resizeGrab = undefined;
  document.body.classList.remove('resizing');
  if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
  writeStorage(sidebarWidthKey, sidebarWidth);
  updateScrollEdge();
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) resizer.addEventListener(name, finishResize);
resizer.addEventListener('dblclick', () => { setSidebarWidth(340, true); updateScrollEdge(); });
resizer.addEventListener('keydown', event => {
  const step = event.shiftKey ? 40 : 10;
  const next = { ArrowLeft: sidebarWidth - step, ArrowRight: sidebarWidth + step, Home: 240, End: 640, Enter: 340 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  setSidebarWidth(next, true);
  updateScrollEdge();
});

function setLangMode(mode, persist = false) {
  const english = mode === 'en';
  document.body.classList.toggle('lang-en-only', english);
  $('lang-bilingual').setAttribute('aria-pressed', String(!english));
  $('lang-en').setAttribute('aria-pressed', String(english));
  if (persist) { writeStorage('open_lexicon_lang_mode', english ? 'en' : 'bilingual'); haptic(); updateScrollEdge(); }
}
setLangMode(readStorage('open_lexicon_lang_mode', 'bilingual'));
$('lang-bilingual').onclick = () => setLangMode('bilingual', true);
$('lang-en').onclick = () => setLangMode('en', true);
// Integrate a damped spring from its live position AND velocity. Retargeting never
// restarts a scripted transition. Substeps keep the physics stable on slow frames.
function createSpring(paint, { damping = 1, response = .3 } = {}) {
  let value = 0, target = 0, velocity = 0, frame = 0, last = 0, complete;
  function stop() { cancelAnimationFrame(frame); frame = 0; complete = undefined; }
  function tick(now) {
    let remaining = Math.min((now - last) / 1000, .04);
    last = now;
    const omega = 2 * Math.PI / response;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 240);
      velocity += (-omega * omega * (value - target) - 2 * damping * omega * velocity) * dt;
      value += velocity * dt;
      remaining -= dt;
    }
    if (Math.abs(value - target) < .1 && Math.abs(velocity) < .5) {
      value = target; velocity = 0; frame = 0; paint(value);
      const done = complete; complete = undefined; done?.();
    } else { paint(value); frame = requestAnimationFrame(tick); }
  }
  return {
    get value() { return value; },
    get velocity() { return velocity; },
    stop,
    jump(next) { stop(); value = target = next; velocity = 0; paint(value); },
    to(next, options = {}) {
      target = next;
      damping = options.damping ?? damping;
      velocity = options.velocity ?? velocity;
      complete = options.complete;
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    },
  };
}

let scrollFrame = 0;
function updateScrollEdge() {
  scrollFrame = 0;
  const scrolled = content.scrollTop > 2 && content.getClientRects().length > 0;
  content.classList.toggle('is-scrolled', scrolled);
  const header = detail.querySelector('.word-header');
  const toolbar = document.querySelector('.content-toolbar');
  const show = Boolean(state.selected && scrolled && header && header.getBoundingClientRect().bottom <= toolbar.getBoundingClientRect().bottom);
  if (show && pinnedWord.hidden) {
    pinnedWord.hidden = false;
    pinnedWord.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.matches ? 120 : 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  } else if (!show) pinnedWord.hidden = true;
  $('breadcrumb').hidden = show;
}
content.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollEdge);
}, { passive: true });
window.addEventListener('resize', updateScrollEdge);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme').setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题');
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#1c1c1e' : '#f5f5f7';
}
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
setTheme(readStorage('open_lexicon_theme', systemTheme.matches ? 'dark' : 'light') === 'dark' ? 'dark' : 'light');
systemTheme.addEventListener('change', event => {
  if (!readStorage('open_lexicon_theme', null)) {
    chosenTheme = event.matches ? 'dark' : 'light';
    setTheme(chosenTheme);
  }
});
let themeTransition;
let chosenTheme = document.documentElement.dataset.theme;
$('theme').onclick = () => {
  const next = chosenTheme = chosenTheme === 'dark' ? 'light' : 'dark';
  themeTransition?.skipTransition();
  if (document.startViewTransition && !reducedMotion.matches) {
    themeTransition = document.startViewTransition(() => setTheme(next));
  } else setTheme(next);
  writeStorage('open_lexicon_theme', next);
};

const tags = ['', 'CET4', 'CET6', '考研', 'IELTS', 'TOEFL', 'GRE', '高考', 'TEM4', 'TEM8', 'SAT'];
$('filters').innerHTML = tags.map(tag => `<button class="filter-pill" data-tag="${tag}" aria-pressed="${!tag}">${tag || '全部'}</button>`).join('');
$('filters').onclick = event => {
  const button = event.target.closest('[data-tag]');
  if (!button) return;
  state.tag = button.dataset.tag;
  $('filters').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item === button));
  requestSearch(true);
};
function setLetter(letter) {
  state.letter = letter;
  state.prefix = '';
  $('alphabet-bar').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.letter === letter)));
  renderPrefixes();
  $('sub-prefix-bar').scrollLeft = 0;
}
function renderPrefixes() {
  const bar = $('sub-prefix-bar');
  const wasHidden = bar.hidden;
  bar.hidden = !state.letter;
  bar.innerHTML = state.letter ? ['', ...(state.prefixes[state.letter] || [])].map(prefix => `<button class="prefix-button" data-prefix="${escapeHtml(prefix)}" aria-pressed="${state.prefix === prefix}">${escapeHtml(prefix || '全部')}</button>`).join('') : '';
  if (wasHidden && !bar.hidden) {
    bar.scrollLeft = 0;
    bar.animate([{ opacity: 0, transform: reducedMotion.matches ? 'none' : 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: reducedMotion.matches ? 120 : 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }
}
$('sub-prefix-bar').onclick = event => {
  const button = event.target.closest('[data-prefix]');
  if (!button || !state.letter) return;
  state.prefix = button.dataset.prefix;
  $('sub-prefix-bar').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  searchInput.value = '';
  requestSearch(true);
};
$('alphabet-bar').innerHTML = ['', ...'abcdefghijklmnopqrstuvwxyz'].map(letter => `<button class="alphabet-button" data-letter="${letter}" aria-label="${letter ? `${letter.toUpperCase()} 开头的词` : '全部字母'}" aria-pressed="${!letter}">${letter.toUpperCase() || '全部'}</button>`).join('');
$('alphabet-bar').onclick = event => {
  const button = event.target.closest('[data-letter]');
  if (!button) return;
  setLetter(button.dataset.letter);
  searchInput.value = '';
  requestSearch(true);
};
$('pos-filter').onchange = () => { state.pos = $('pos-filter').value; requestSearch(true); };
function updateBookmarks() {
  $('bookmark-count').textContent = bookmarks.size;
  const saved = bookmarks.has(state.selectedKey.toLowerCase());
  $('save').setAttribute('aria-pressed', String(saved));
  $('save').setAttribute('aria-label', saved ? '取消收藏单词' : '收藏单词');
}
updateBookmarks();
$('bookmarks').onclick = () => {
  state.savedOnly = !state.savedOnly;
  $('bookmarks').setAttribute('aria-pressed', String(state.savedOnly));
  requestSearch(true);
};
$('save').onclick = () => {
  if (!state.selected) return;
  haptic();
  const key = state.selected.word.toLowerCase();
  if (bookmarks.has(key)) bookmarks.delete(key); else bookmarks.add(key);
  writeStorage('open_lexicon_bookmarks', [...bookmarks]);
  updateBookmarks();
  if (state.savedOnly) requestSearch(true);
};

function updateConnection() {
  const text = !navigator.onLine ? '离线 · 可读已缓存词条' : !cacheStatus.persistent ? '缓存不可用 · 当前页可读' : state.ready ? '词库已就绪' : '正在载入词库';
  $('connection').innerHTML = `<i></i>${text}`;
}
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
const offlineButton = $('offline-download');
offlineButton.onclick = async () => {
  if (preparingOffline) {
    pauseOffline = true;
    offlineButton.textContent = '当前分片完成后暂停…';
    return;
  }
  if (!state.ready) { toast('词库正在准备，请稍候'); return; }
  preparingOffline = true;
  pauseOffline = false;
  offlineButton.textContent = '正在准备…点击暂停';
  try {
    if (!metrics.startup.indexPersistent || !(await offlineShellReady)) throw new Error('离线页面未就绪，请联网刷新后重试');
    const complete = await prepareOffline((count, total) => {
      offlineButton.textContent = `${count}/${total} · 点击暂停`;
    }, () => pauseOffline);
    offlineButton.textContent = complete ? '离线词库已备齐 ✓' : '继续准备离线词库';
    toast(complete ? '全部 25,006 词已保存，可离线查阅' : '已暂停，下载过的词条仍可离线查阅');
  } catch (error) {
    offlineButton.textContent = '继续准备离线词库';
    toast(navigator.onLine ? error.message : '下载已暂停，联网后可继续准备');
  } finally { preparingOffline = false; updateConnection(); }
};
function indexError(message) {
  state.ready = false;
  state.results = [];
  state.total = 0;
  state.appending = false;
  state.pendingNavigation = '';
  $('list-status').textContent = '词库未能载入';
  $('connection').innerHTML = '<i></i>词库未就绪';
  list.removeAttribute('aria-activedescendant');
  list.setAttribute('aria-busy', 'false');
  content.setAttribute('aria-busy', 'false');
  $('result-count').textContent = '词库未能载入';
  list.innerHTML = `<div class="empty-results"><strong>暂时无法搜索</strong>${escapeHtml(message)}<br><button id="retry-index" class="text-button">重新载入词库</button></div>`;
  $('retry-index').onclick = startWorker;
}
function startWorker() {
  worker?.terminate();
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        state.ready = true;
        state.prefixes = data.prefixes || {};
        renderPrefixes();
        metrics.startup.indexReady = performance.now();
        metrics.startup.workerInit = data.elapsed;
        metrics.startup.indexFromCache = data.fromCache;
        metrics.startup.indexPersistent = data.persistent;
        metrics.startup.total = data.total;
        updateConnection();
        requestSearch(true);
      } else if (data.type === 'results' && data.requestId === state.requestId) {
        const listHadFocus = document.activeElement === list;
        const append = state.appending;
        const previousLength = state.results.length;
        const navigateFrom = state.pendingNavigation;
        state.results = append ? [...state.results, ...data.results] : data.results;
        state.appending = false;
        state.pendingNavigation = '';
        state.offset = data.offset;
        state.total = data.total;
        renderList(data, append);
        if (listHadFocus) list.focus({ preventScroll: true });
        pushMetric('searches', { query: state.query, letter: state.letter, prefix: state.prefix, tag: state.tag, offset: data.offset, appended: append, total: data.total, worker: data.elapsed, endToEnd: performance.now() - searchStarted });
        if (append) {
          if (navigateFrom && navigateFrom === state.selectedKey && state.results[previousLength]) selectWord(state.results[previousLength].w, false);
          else markSelected(false);
        } else if (!state.selected || !state.selectedKey || !data.results.some(entry => entry.w === state.selectedKey)) {
          const first = data.results[0];
          if (first) selectWord(first.w, false); else clearDetail();
        } else { markSelected(); content.setAttribute('aria-busy', 'false'); }
        requestAnimationFrame(maybeLoadMore);
      } else if (data.type === 'study' && data.requestId === state.studyId && studyDialog.open) {
        state.study = data.results;
        state.cardIndex = 0;
        state.studyDone = false;
        renderCard();
      } else if (data.type === 'error') indexError(data.message);
    };
    worker.onerror = () => indexError('请检查静态文件是否齐全，然后重试。');
    worker.postMessage({ type: 'init' });
    $('result-count').textContent = '正在准备词库…';
    list.setAttribute('aria-busy', 'true');
  } catch { indexError('当前浏览器无法启动检索，请使用支持 Web Worker 的现代浏览器。'); }
}
function requestSearch(reset = false) {
  state.requestId++;
  if (reset) {
    state.selectionId++; // A new query invalidates detail loading; appending does not.
    state.query = searchInput.value.trim();
    state.offset = 0;
    state.pendingNavigation = '';
    list.scrollTop = 0;
  }
  state.appending = !reset;
  $('clear').hidden = !searchInput.value;
  $('search-key').hidden = Boolean(searchInput.value);
  list.setAttribute('aria-busy', 'true');
  if (state.ready && reset) $('result-count').textContent = '正在检索…';
  $('list-status').textContent = reset ? '正在检索…' : `已载入 ${state.results.length.toLocaleString()} / ${state.total.toLocaleString()} 词 · 正在加载…`;
  searchStarted = performance.now();
  if (!state.ready) return;
  worker.postMessage({ type: 'search', requestId: state.requestId, query: state.query, letter: state.letter, prefix: state.prefix, tag: state.tag, pos: state.pos, offset: state.offset, bookmarks: state.savedOnly ? [...bookmarks] : null });
}
let composing = false;
searchInput.addEventListener('compositionstart', () => { composing = true; });
searchInput.addEventListener('compositionend', () => { composing = false; requestSearch(true); });
searchInput.addEventListener('input', () => { if (!composing) requestSearch(true); });
function clearSearch() { searchInput.value = ''; setLetter(''); requestSearch(true); searchInput.focus(); }
$('clear').onclick = clearSearch;
function renderList(data, append = false) {
  list.setAttribute('aria-busy', 'false');
  $('result-count').textContent = `${data.total.toLocaleString()} 个词${data.fuzzy ? ' · 相近拼写' : ''}`;
  $('search-time').textContent = `${data.elapsed.toFixed(1)} ms`;
  $('search-time').title = 'Web Worker 内部检索耗时';
  $('list-status').textContent = `已载入 ${state.results.length.toLocaleString()} / ${data.total.toLocaleString()} 词${state.results.length < data.total ? '（向下滚动加载更多）' : ' · 已全部载入'}`;
  const rows = data.results.map((entry, index) => `<button id="result-${entry.id}" class="word-row" role="option" aria-selected="false" aria-posinset="${data.offset + index + 1}" aria-setsize="${data.total}" data-word="${escapeHtml(entry.w)}" tabindex="-1"><span class="word-row-top"><strong lang="en">${escapeHtml(entry.w)}</strong><span class="row-pos">${escapeHtml([...new Set(entry.s.map(s => posName(s.p)))].join(' / '))}</span><span class="row-chevron" aria-hidden="true">›</span></span><span class="row-meaning">${escapeHtml(entry.s.map(s => s.m).join('；'))}</span></button>`).join('');
  if (append) list.insertAdjacentHTML('beforeend', rows);
  else {
    list.innerHTML = rows || '<div class="empty-results"><strong>没有找到匹配的词</strong>试试更短的英文或中文释义，<br>也可以切换字母、考试范围或关闭收藏筛选。</div>';
    list.scrollTop = 0;
  }
}
function markSelected(scroll = true) {
  let selected;
  list.querySelectorAll('[data-word]').forEach(row => {
    const active = row.dataset.word === state.selectedKey;
    row.setAttribute('aria-selected', String(active));
    if (active) selected = row;
  });
  if (selected) {
    list.setAttribute('aria-activedescendant', selected.id);
    if (scroll) selected.scrollIntoView({ block: 'nearest' });
  } else list.removeAttribute('aria-activedescendant');
}
list.onclick = event => {
  const button = event.target.closest('[data-word]');
  if (button) selectWord(button.dataset.word, true);
};
function loadMore(navigateFrom = '') {
  if (!state.ready || list.getAttribute('aria-busy') === 'true' || state.results.length >= state.total) return;
  state.pendingNavigation = navigateFrom;
  state.offset = state.results.length;
  requestSearch();
}
function maybeLoadMore() {
  if (list.clientHeight > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 300) loadMore();
}
list.addEventListener('scroll', maybeLoadMore, { passive: true });
function navigate(direction) {
  if (!state.results.length || list.getAttribute('aria-busy') === 'true') return;
  const current = state.results.findIndex(entry => entry.w === state.selectedKey);
  const next = current < 0 ? 0 : current + direction;
  if (next < 0) return;
  if (next >= state.results.length) { loadMore(state.selectedKey); return; }
  selectWord(state.results[next].w, false);
}
function clearDetail() {
  state.selected = null;
  state.selectedKey = '';
  pinnedWord.hidden = true;
  $('breadcrumb').hidden = false;
  stopSpeech();
  content.setAttribute('aria-busy', 'false');
  detail.innerHTML = '<div class="welcome"><span class="welcome-glyph">Aa</span><h2>下一个好词，等你发现。</h2><p>调整搜索或筛选条件，继续探索。</p></div>';
  $('save').disabled = $('copy').disabled = $('copy-anki').disabled = true;
  updateBookmarks();
  $('breadcrumb').textContent = '词典 / 探索词汇';
  list.removeAttribute('aria-activedescendant');
}
async function selectWord(word, openMobile = false) {
  const token = ++state.selectionId;
  const started = performance.now();
  state.selectedKey = word;
  state.selected = null;
  state.pendingNavigation = '';
  pinnedWord.hidden = true;
  $('breadcrumb').hidden = false;
  content.scrollTop = 0;
  stopSpeech();
  markSelected();
  updateBookmarks();
  $('save').disabled = $('copy').disabled = $('copy-anki').disabled = true;
  content.setAttribute('aria-busy', 'true');
  $('breadcrumb').textContent = `词典 / ${word}`;
  if (openMobile) { document.body.classList.add('reading'); content.focus({ preventScroll: true }); }
  // Avoid a flickering loading card on memory hits, while never leaving the old word visible.
  detail.innerHTML = `<header class="word-header"><h1 class="word-heading" lang="en">${escapeHtml(word)}</h1><p class="small-label">正在打开词条…</p></header>`;
  content.scrollTop = 0;
  updateScrollEdge();
  try {
    const result = await getWord(word);
    if (token !== state.selectionId) return;
    state.selected = result.entry;
    renderDetail(result.entry);
    content.scrollTop = 0;
    updateScrollEdge();
    $('save').disabled = $('copy').disabled = $('copy-anki').disabled = false;
    content.setAttribute('aria-busy', 'false');
    updateConnection();
    const url = new URL(location.href);
    url.hash = encodeURIComponent(word);
    history.replaceState(null, '', url);
    requestAnimationFrame(() => {
      if (token !== state.selectionId) return;
      const elapsed = performance.now() - started;
      pushMetric('details', { word, source: result.source, load: result.elapsed, endToEnd: elapsed });
      metrics.startup.firstEntry ??= performance.now();
    });
  } catch (error) {
    if (token !== state.selectionId) return;
    content.setAttribute('aria-busy', 'false');
    detail.innerHTML = `<div class="welcome"><span class="welcome-glyph">Aa</span><h2>${escapeHtml(word)}</h2><p>${navigator.onLine ? escapeHtml(error.message) : '这个字母的词条尚未缓存，请联网后再试。'}</p><button id="retry-word" class="primary-button">重新打开</button></div>`;
    $('retry-word').onclick = () => selectWord(word, openMobile);
  }
}
function renderDetail(entry) {
  const tags = normalizeTags(entry.tags);
  // Emphasize existing source formulas; never invent a morphological split.
  const formula = String(entry.morphology_zh || '').match(/[A-Za-z][A-Za-z -]*(?:\s*\+\s*[-A-Za-z]+)+\s*→\s*[^；。\n]+/)?.[0];
  const label = (zh, en) => `<span class="label-zh">${zh}</span><span class="label-en" lang="en">${en}</span>`;
  const dimensionHeading = (number, title, en) => `<div class="dimension-heading"><span class="dimension-number">${label(`要素${number}`, ({ 一: '01', 二: '02', 三: '03', 四: '04' })[number])}</span><h2>${label(title, en)}</h2></div>`;
  pinnedWord.innerHTML = `<span class="toolbar-word-badge"><strong lang="en">${escapeHtml(entry.word)}</strong><span class="pinned-phonetic">${escapeHtml(phonetic(entry.phonetic))}</span></span><span class="pinned-audio">${audioButton(entry.word, '英音', false, 'en-GB')}${audioButton(entry.word, '美音', true)}</span>`;
  pinnedWord.hidden = true;
  detail.innerHTML = `<header class="word-header"><div class="word-headline"><h1 class="word-heading" lang="en">${escapeHtml(entry.word)}</h1><div class="pronunciations"><span class="phonetic">${escapeHtml(phonetic(entry.phonetic))}</span>${audioButton(entry.word, '英音', false, 'en-GB')}${audioButton(entry.word, '美音', true)}</div></div><div class="tag-line">${tags.map(tag => `<span class="exam-tag ${tag.startsWith('CEFR') ? 'cefr-tag' : ''}">${escapeHtml(tag)}</span>`).join('')}</div>
    <nav class="sense-quick-chips" aria-label="义项速览">${entry.senses.map((sense, index) => `<button class="sense-chip" data-sense="${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span> ${label(escapeHtml(sense.meaning_zh), escapeHtml(sense.english_definition || posName(sense.pos)))}</button>`).join('')}</nav></header>
    <section class="sense-learning" aria-label="释义、例句与搭配"><div class="learning-headings"><div class="dimension core-definitions">${dimensionHeading('一', '释义与定义', 'Meaning & definition')}</div><div class="dimension real-scenarios">${dimensionHeading('二', '例句与搭配', 'Examples & collocations')}</div></div>
    ${entry.senses.map((sense, index) => {
      const collocations = String(sense.collocation_en || '').split(/\s*[;；]\s*/).filter(Boolean);
      const translations = String(sense.collocation_zh || '').split(/\s*[;；]\s*/);
      const pos = posName(sense.pos);
      return `<section id="sense-${index + 1}" class="sense-card" tabindex="-1" aria-label="Sense ${index + 1}"><div class="sense-heading"><span class="sense-number">${String(index + 1).padStart(2, '0')}</span><span class="pos-tag ${posClass(sense.pos)}">${escapeHtml(pos)}<span class="zh-content">${escapeHtml(String(sense.pos || '').slice(pos.length))}</span></span><h3 class="zh-content">${escapeHtml(sense.meaning_zh)}</h3></div><p class="definition" lang="en">${escapeHtml(sense.english_definition)}</p>
      <div class="context-grid">${sense.sentence_en ? `<div class="example-card"><div class="example-heading"><span>${label('场景例句', 'Example')}</span>${audioButton(sense.sentence_en, '听例句')}</div><p class="example-en" lang="en">${highlighted(sense.sentence_en, entry.word)}</p><p class="example-zh zh-content">${escapeHtml(sense.sentence_zh)}</p></div>` : ''}${collocations.length ? `<div class="collocations"><h4>${label('高频搭配', 'Collocations')}</h4>${collocations.map((phrase, i) => `<div class="collocation"><p class="example-en" lang="en">${highlighted(phrase, entry.word)}</p><p class="example-zh zh-content">${escapeHtml(translations[i] || '')}</p></div>`).join('')}</div>` : ''}</div></section>`;
    }).join('')}</section>
    <div class="deep-grid"><section class="dimension deep-card morphology" aria-label="要素三：现代公式化构词">${dimensionHeading('三', '现代公式化构词', 'Word formation')}${formula ? `<p class="formula${/[\u3400-\u9fff]/.test(formula) ? ' zh-content' : ''}">${escapeHtml(formula)}</p>` : ''}${String(entry.morphology_zh || '暂无构词说明').split(/(?=常用词族[：:]|派生词族?[：:]|复合词[：:])/u).map(text => `<p class="deep-copy zh-content">${escapeHtml(text)}</p>`).join('')}<p class="label-en source-note" lang="en">Word formation notes are available in bilingual mode.</p></section>
    <section class="dimension deep-card etymology" aria-label="要素四：词源故事与高效记忆">${dimensionHeading('四', '词源故事', 'Word origin')}<p class="deep-copy zh-content">${escapeHtml(entry.etymology_zh || '暂无词源说明')}</p><p class="label-en source-note" lang="en">Origin notes are available in bilingual mode.</p></section></div>`;
}

function stopSpeech() {
  speechGeneration++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speechButton?.classList.remove('playing');
  speechButton?.removeAttribute('aria-busy');
  speechButton = null;
}
function speak(button) {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持朗读，请使用 Chrome、Edge 或 Safari'); return; }
  const wasPlaying = speechButton === button;
  stopSpeech();
  if (wasPlaying) return;
  const generation = speechGeneration;
  const utterance = new SpeechSynthesisUtterance(button.dataset.speak);
  utterance.lang = button.dataset.lang || 'en-US';
  const voices = speechSynthesis.getVoices();
  if (!navigator.onLine && !voices.some(voice => voice.localService && voice.lang.startsWith('en'))) {
    toast('离线朗读需要设备已安装英语语音包'); return;
  }
  utterance.voice = voices.find(voice => voice.lang === utterance.lang && voice.localService) || voices.find(voice => voice.localService && voice.lang.startsWith('en')) || (navigator.onLine ? voices.find(voice => voice.lang === utterance.lang) : null) || null;
  utterance.rate = .9;
  speechButton = button;
  button.classList.add('playing');
  button.setAttribute('aria-busy', 'true');
  haptic();
  const finish = () => {
    if (generation !== speechGeneration) return;
    button.classList.remove('playing');
    button.removeAttribute('aria-busy');
    speechButton = null;
  };
  utterance.onend = finish;
  utterance.onerror = event => { finish(); if (!['canceled', 'interrupted'].includes(event.error)) toast('暂时无法朗读，请检查设备的英语语音包'); };
  speechSynthesis.speak(utterance);
}
detail.onclick = event => {
  const button = event.target.closest('[data-speak]');
  if (button) { speak(button); return; }
  const chip = event.target.closest('[data-sense]');
  if (chip) {
    const sense = $(`sense-${chip.dataset.sense}`);
    sense?.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    sense?.focus({ preventScroll: true });
  }
};
pinnedWord.onclick = detail.onclick;
window.addEventListener('pagehide', stopSpeech);
$('copy').onclick = async () => {
  const entry = state.selected;
  if (!entry) return;
  const text = `# ${entry.word} ${phonetic(entry.phonetic)}\n\n${normalizeTags(entry.tags).join(' · ')}\n\n${entry.senses.map(s => `## ${s.pos} ${s.meaning_zh}\n\n${s.english_definition}\n\n${s.sentence_en}\n${s.sentence_zh}\n\n${s.collocation_en}\n${s.collocation_zh}`).join('\n\n')}\n\n## 现代构词\n${entry.morphology_zh}\n\n## 词源\n${entry.etymology_zh}`;
  try { await navigator.clipboard.writeText(text); toast('已复制词条 Markdown'); }
  catch { toast('复制未成功，请允许浏览器访问剪贴板'); }
};
$('copy-anki').onclick = async () => {
  const entry = state.selected;
  if (!entry) return;
  const front = escapeHtml(`${entry.word} ${phonetic(entry.phonetic)}`);
  const back = entry.senses.map(sense => `${escapeHtml(sense.pos)} ${escapeHtml(sense.meaning_zh)}<br>${escapeHtml(sense.english_definition)}<br>${escapeHtml(sense.sentence_en)}<br>${escapeHtml(sense.sentence_zh)}`).join('<br><br>');
  try { await navigator.clipboard.writeText(`${front.replace(/[\t\r\n]/g, ' ')}\t${back.replace(/[\t\r\n]/g, ' ')}`); toast('已复制 Anki TSV，可导入为正反面'); }
  catch { toast('复制未成功，请允许浏览器访问剪贴板'); }
};
const focusAnimations = new Map();
function setImmersive(enabled) {
  if (document.body.classList.contains('immersive') === enabled) return;
  const moving = [detail, document.querySelector('.toolbar-actions')];
  const previous = moving.map(element => element.getBoundingClientRect());
  focusAnimations.forEach(animation => animation.cancel());
  focusAnimations.clear();
  document.body.classList.toggle('immersive', enabled);
  $('focus').setAttribute('aria-pressed', String(enabled));
  $('focus').lastElementChild.textContent = enabled ? '退出沉浸' : '沉浸阅读';
  $('focus').setAttribute('aria-label', enabled ? '退出沉浸阅读' : '沉浸阅读');
  $('focus').title = enabled ? '退出沉浸阅读' : '沉浸阅读';
  moving.forEach((element, index) => {
    const next = element.getBoundingClientRect();
    if (!next.width || !previous[index].width) return;
    const from = reducedMotion.matches ? { opacity: .65 } : { opacity: .75, transform: `translate(${previous[index].left - next.left}px, ${previous[index].top - next.top}px)` };
    const animation = element.animate([from, { opacity: 1, transform: 'none' }], { duration: reducedMotion.matches ? 120 : 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    focusAnimations.set(element, animation);
    animation.onfinish = () => { if (focusAnimations.get(element) === animation) focusAnimations.delete(element); };
  });
  updateScrollEdge();
}
$('focus').onclick = () => setImmersive(!document.body.classList.contains('immersive'));
$('back').onclick = () => { document.body.classList.remove('reading'); setImmersive(false); updateScrollEdge(); searchInput.focus(); };

function updateStudyStats() {
  $('studied').textContent = new Set(todayWords()).size;
  let streak = 0;
  let day = dayNumber();
  if (!todayWords().length) day--;
  for (let i = 0; i < 3660; i++, day--) {
    const words = progress[new Date(day * 86400000).toISOString().slice(0, 10)];
    if (!Array.isArray(words) || !words.length) break;
    streak++;
  }
  $('streak').textContent = streak;
}
const cardSpring = createSpring(value => {
  $('flashcard').querySelector('.flip-inner').style.transform = `rotateY(${value}deg)`;
}, { damping: .8, response: .4 });
function setFlipped(flipped, immediate = false) {
  state.flipped = flipped;
  $('flashcard').classList.toggle('flipped', flipped);
  $('flashcard').setAttribute('aria-pressed', String(flipped));
  $('flashcard').setAttribute('aria-label', flipped ? '返回词面' : '翻开释义');
  $('flashcard').querySelector('.card-front').setAttribute('aria-hidden', String(flipped));
  $('flashcard').querySelector('.card-back').setAttribute('aria-hidden', String(!flipped));
  $('study-known').disabled = !flipped || state.studyDone;
  if (reducedMotion.matches || immediate) cardSpring.jump(flipped ? 180 : 0);
  else cardSpring.to(flipped ? 180 : 0);
}
function renderCard() {
  updateStudyStats();
  setFlipped(false, true);
  const card = state.study[state.cardIndex];
  $('flashcard').disabled = !card || state.studyDone;
  $('study-again').disabled = !card;
  $('study-open').disabled = !card;
  if (!card) {
    $('card-word').textContent = '暂无词条';
    $('card-phonetic').textContent = '';
    $('study-progress').textContent = '切换考试范围后再试';
    return;
  }
  $('card-word').textContent = state.studyDone ? '今日完成 ✓' : card.w;
  $('card-phonetic').textContent = state.studyDone ? '明天见，继续保持。' : phonetic(card.p);
  $('card-meaning').textContent = card.s.map(sense => `${posName(sense.p)} ${sense.m}`).join('；');
  $('study-progress').textContent = state.studyDone ? '本组练习已完成，可以再复习一轮' : `${state.cardIndex + 1} / ${state.study.length} 词 · ${state.tag || '全部词汇'}`;
  if (state.studyDone) $('study-again').textContent = '再复习一轮';
  else $('study-again').textContent = '再看一次';
}
let sheetExtent = 500;
let sheetClosing = false;
let sheetFade;
let afterSheetClose;
const workspace = document.querySelector('.workspace');
const sheetSpring = createSpring(value => {
  const presence = Math.max(0, Math.min(1, 1 - value / sheetExtent));
  studyDialog.style.transform = reducedMotion.matches ? 'none' : `translate3d(${value}px, 0, 0) scale(${.985 + presence * .015})`;
  studyDialog.style.opacity = reducedMotion.matches ? '1' : String(.75 + presence * .25);
  studyDialog.classList.toggle('is-present', presence > .02 && !sheetClosing);
  workspace.style.transform = reducedMotion.matches ? '' : `translateY(${presence * 2}px) scale(${1 - presence * .005})`;
}, { damping: .8, response: .3 });
function settleSheet(open, velocity) {
  sheetClosing = !open;
  const currentOpacity = Number(getComputedStyle(studyDialog).opacity);
  sheetFade?.cancel();
  studyDialog.style.willChange = 'transform, opacity';
  const complete = () => {
    studyDialog.style.willChange = '';
    if (!open && sheetClosing) {
      studyDialog.close();
    }
  };
  if (reducedMotion.matches) {
    sheetSpring.stop();
    studyDialog.style.transform = 'none';
    workspace.style.transform = '';
    studyDialog.classList.toggle('is-present', open);
    sheetFade = studyDialog.animate([{ opacity: currentOpacity }, { opacity: open ? 1 : 0 }], { duration: 120, easing: 'ease-out' });
    sheetFade.onfinish = () => { sheetSpring.jump(open ? 0 : sheetExtent); complete(); };
  } else {
    if (!open) studyDialog.classList.remove('is-present');
    sheetSpring.to(open ? 0 : sheetExtent, { damping: .8, velocity, complete });
  }
}
function closeStudy(afterClose) {
  if (!studyDialog.open) { afterClose?.(); return; }
  if (typeof afterClose === 'function') afterSheetClose = afterClose;
  settleSheet(false);
}
function openStudy(daily) {
  if (!state.ready) { toast('词库正在准备，请稍候'); return; }
  const wasOpen = studyDialog.open;
  if (!wasOpen) studyTrigger = document.activeElement;
  state.studyId++;
  state.study = [];
  state.studyDone = false;
  $('study-title').textContent = daily ? '今天，认识一个新词' : '让词汇成为你的表达';
  $('study-kind').textContent = daily ? '每日一词' : `备考抽认 · ${state.tag || '全部词汇'}`;
  if (!wasOpen) {
    studyDialog.showModal();
    sheetExtent = studyDialog.getBoundingClientRect().width + 24;
    sheetSpring.jump(sheetExtent);
    if (reducedMotion.matches) studyDialog.style.opacity = '0';
  }
  afterSheetClose = undefined;
  settleSheet(true);
  renderCard();
  worker.postMessage({ type: 'study', requestId: state.studyId, day: dayNumber(), tag: daily ? '' : state.tag, daily });
}
$('daily').onclick = () => openStudy(true);
$('practice').onclick = () => openStudy(false);
$('close-study').onclick = () => closeStudy();
studyDialog.addEventListener('cancel', event => { event.preventDefault(); closeStudy(); });
// A backdrop click must start AND end outside the sheet (dragging out is not a click).
let backdropDown = false;
function outsideSheet(event) {
  const rect = studyDialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
studyDialog.addEventListener('pointerdown', event => { backdropDown = event.target === studyDialog && outsideSheet(event); });
studyDialog.addEventListener('click', event => { if (backdropDown && event.target === studyDialog && outsideSheet(event)) closeStudy(); backdropDown = false; });
studyDialog.addEventListener('close', () => {
  state.studyId++; sheetSpring.stop(); sheetFade?.cancel(); cardSpring.stop();
  workspace.style.transform = ''; studyDialog.style.willChange = '';
  sheetClosing = false;
  if (studyTrigger?.isConnected) studyTrigger.focus({ preventScroll: true });
  const next = afterSheetClose; afterSheetClose = undefined; next?.();
});

// The dedicated grabber leaves vertical reading and text selection untouched.
const sheetHandle = $('sheet-handle');
let grab;
let suppressHandleClick = false;
function rubberband(distance) { return distance * sheetExtent * .55 / (sheetExtent + .55 * Math.abs(distance)); }
sheetHandle.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  const velocity = sheetSpring.velocity;
  sheetSpring.stop(); sheetFade?.cancel();
  grab = { id: event.pointerId, x: event.clientX, y: event.clientY, start: sheetSpring.value, velocity, samples: [{ x: event.clientX, time: event.timeStamp }], dragging: false };
  sheetHandle.setPointerCapture(event.pointerId);
});
sheetHandle.addEventListener('pointermove', event => {
  if (!grab || grab.id !== event.pointerId) return;
  const dx = event.clientX - grab.x;
  if (!grab.dragging && Math.abs(dx) < 10) return;
  if (!grab.dragging && Math.abs(event.clientY - grab.y) > Math.abs(dx)) { finishGrab(event, true); return; }
  grab.dragging = true;
  if (!reducedMotion.matches) {
    const next = grab.start + dx;
    sheetSpring.jump(next < 0 ? rubberband(next) : next > sheetExtent ? sheetExtent + rubberband(next - sheetExtent) : next);
  }
  grab.samples.push({ x: event.clientX, time: event.timeStamp });
  grab.samples = grab.samples.filter(sample => event.timeStamp - sample.time < 100);
});
function finishGrab(event, canceled = false) {
  if (!grab || grab.id !== event.pointerId) return;
  const current = grab; grab = undefined;
  if (sheetHandle.hasPointerCapture(event.pointerId)) sheetHandle.releasePointerCapture(event.pointerId);
  if (!current.dragging) { settleSheet(!sheetClosing, current.velocity); return; }
  suppressHandleClick = true;
  setTimeout(() => { suppressHandleClick = false; }, 0);
  const first = current.samples[0];
  const velocity = (event.clientX - first.x) / Math.max(1, event.timeStamp - first.time) * 1000;
  const projected = sheetSpring.value + (velocity / 1000) * .998 / (1 - .998);
  const close = !canceled && (reducedMotion.matches ? event.clientX - current.x > 70 : Math.abs(velocity) > 150 ? velocity > 0 : projected > sheetExtent * .45);
  settleSheet(!close, canceled ? 0 : velocity);
}
sheetHandle.addEventListener('pointerup', event => finishGrab(event));
sheetHandle.addEventListener('pointercancel', event => finishGrab(event, true));
sheetHandle.addEventListener('lostpointercapture', event => finishGrab(event, true));
sheetHandle.onclick = () => { if (!suppressHandleClick) closeStudy(); };
reducedMotion.addEventListener('change', () => {
  themeTransition?.skipTransition();
  focusAnimations.forEach(animation => animation.cancel()); focusAnimations.clear();
  cardSpring.jump(state.flipped ? 180 : 0);
  if (studyDialog.open) settleSheet(!sheetClosing);
});
$('flashcard').onclick = () => { setFlipped(!state.flipped); haptic(); };
$('study-known').onclick = () => {
  if (!state.flipped || state.studyDone) return;
  const card = state.study[state.cardIndex];
  if (!card) return;
  haptic();
  progress[localDay()] = [...new Set([...todayWords(), card.w])];
  const dates = Object.keys(progress).sort();
  dates.slice(0, Math.max(0, dates.length - 365)).forEach(day => delete progress[day]);
  writeStorage('open_lexicon_progress', progress);
  if (state.cardIndex + 1 === state.study.length) state.studyDone = true;
  else state.cardIndex++;
  renderCard();
};
$('study-again').onclick = () => {
  if (state.studyDone) { state.studyDone = false; state.cardIndex = 0; }
  else if (state.study.length > 1) state.study.push(...state.study.splice(state.cardIndex, 1));
  renderCard();
};
$('study-open').onclick = () => {
  const card = state.study[state.cardIndex];
  if (!card) return;
  closeStudy(() => {
    searchInput.value = card.w;
    setLetter('');
    state.savedOnly = false;
    state.tag = '';
    state.pos = '';
    $('pos-filter').value = '';
    $('bookmarks').setAttribute('aria-pressed', 'false');
    $('filters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(!button.dataset.tag)));
    requestSearch(true);
    document.body.classList.add('reading');
    content.focus({ preventScroll: true });
  });
};

window.addEventListener('keydown', event => {
  if (event.isComposing || composing || event.altKey || (event.ctrlKey && event.key !== 'k') || (event.metaKey && event.key !== 'k')) return;
  if (studyDialog.open) return; // Native focus trap; cancel event animates Escape.
  const editable = event.target instanceof Element && event.target.matches('input, textarea, [contenteditable="true"]');
  if ((event.key === '/' && !editable) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault();
    setImmersive(false);
    document.body.classList.remove('reading');
    searchInput.focus();
    searchInput.select();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (document.body.classList.contains('immersive')) setImmersive(false);
    else clearSearch();
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && (!editable || event.target === searchInput)) {
    event.preventDefault();
    navigate(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter' && (event.target === searchInput || event.target === list) && state.selectedKey) {
    document.body.classList.add('reading');
    content.focus();
  }
});

// Restore shareable words without an API request; malformed fragments are harmless.
try { searchInput.value = decodeURIComponent(location.hash.slice(1)).slice(0, 120); } catch { searchInput.value = ''; }
window.addEventListener('hashchange', () => {
  try { searchInput.value = decodeURIComponent(location.hash.slice(1)).slice(0, 120); setLetter(''); requestSearch(true); } catch { /* ignore malformed URL */ }
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  offlineShellReady = navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './' }).then(async () => {
    metrics.startup.serviceWorkerRegistered = performance.now();
    const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 10000))]);
    metrics.startup.offlineShell = ready;
    return ready;
  }).catch(() => { metrics.startup.offlineShell = false; return false; });
}
startWorker();
