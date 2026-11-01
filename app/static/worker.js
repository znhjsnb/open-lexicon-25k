import { normalizeTags, INDEX_CACHE } from './data.js';

let entries = [];
let pending = null;
let loading = false;

// Bounded optimal-string-alignment distance accepts adjacent transpositions.
function distance(a, b, limit, rows) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let [before, previous, row] = rows;
  const unreachable = limit + 1;
  previous.fill(unreachable);
  before.fill(unreachable);
  for (let j = 0; j <= Math.min(b.length, limit); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row.fill(unreachable);
    row[0] = Math.min(i, unreachable);
    let minimum = unreachable;
    // Only the diagonal band can lead to a match within the edit limit.
    for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], before[j - 2] + 1);
      }
      minimum = Math.min(minimum, row[j]);
    }
    if (minimum > limit) return limit + 1;
    [before, previous, row] = [previous, row, before];
  }
  return previous[b.length];
}

function search(message) {
  const started = performance.now();
  const query = String(message.query ?? '').trim().toLowerCase().slice(0, 120);
  const chinese = /[\u3400-\u9fff]/.test(query);
  const limit = query.length >= 6 ? 2 : 1;
  const saved = message.bookmarks ? new Set(message.bookmarks) : null;
  const buckets = [[], [], [], [], [], []];
  const candidates = [];
  for (const entry of entries) {
    if (message.tag && !entry.t.includes(message.tag)) continue;
    if (message.pos && !entry.s.some(sense => sense.p.split(/\s/)[0] === message.pos)) continue;
    if (saved && !saved.has(entry.key)) continue;
    let rank = -1;
    if (!query) rank = 0;
    else if (chinese) { if (entry.zh.includes(query)) rank = 0; }
    else if (entry.key === query) rank = 0;
    else if (entry.key.startsWith(query)) rank = 1;
    else if (entry.key.includes(query)) rank = 2;
    else if (query.length >= 3 && query.length <= 40 && Math.abs(entry.key.length - query.length) <= limit) candidates.push(entry);
    if (rank >= 0) buckets[rank].push(entry);
  }
  const direct = buckets[0].length + buckets[1].length + buckets[2].length;
  if (direct < 50 && !buckets[0].length && !chinese && query.length >= 3) {
    const rows = [new Uint8Array(43), new Uint8Array(43), new Uint8Array(43)];
    for (const entry of candidates) {
      if (Math.abs(entry.key.length - query.length) > limit) continue;
      const edits = distance(query, entry.key, limit, rows);
      if (edits <= limit) buckets[3 + edits].push(entry);
    }
  }
  const matches = buckets.flat();
  const offset = Math.max(0, Math.min(Number(message.offset) || 0, Math.max(0, Math.floor((matches.length - 1) / 50) * 50)));
  const results = matches.slice(offset, offset + 50).map(({ key, zh, ...entry }) => entry);
  postMessage({ type: 'results', requestId: message.requestId, results, total: matches.length, offset,
    fuzzy: direct === 0 && matches.length > 0, elapsed: performance.now() - started });
}

async function initialize() {
  if (loading) return;
  loading = true;
  const started = performance.now();
  let cache;
  const url = new URL('./data/search_index.json', import.meta.url);
  try {
    let response;
    try { cache = await caches.open(INDEX_CACHE); response = await cache.match(url); } catch { /* memory-only fallback */ }
    const fromCache = Boolean(response);
    let persistent = fromCache;
    if (!response) response = await fetch(url);
    if (!response.ok) throw new Error(`索引载入失败（${response.status}）`);
    const copy = response.clone();
    const data = await response.json();
    if (!Array.isArray(data) || !data.length || !data.every(entry => typeof entry.w === 'string' && Array.isArray(entry.s))) throw new Error('词库索引格式不正确');
    entries = data.map(entry => ({ ...entry, t: normalizeTags(entry.t), key: entry.w.toLowerCase(), zh: entry.s.map(s => s.m).join('\n') }));
    if (cache && !fromCache) { try { await cache.put(url, copy); persistent = true; } catch { /* quota must not block search */ } }
    postMessage({ type: 'ready', total: entries.length, elapsed: performance.now() - started, fromCache, persistent });
    if (pending) { search(pending); pending = null; }
  } catch (error) {
    // A damaged cached response must not make every subsequent retry fail.
    try { await cache?.delete(url); } catch { /* unavailable cache */ }
    entries = [];
    const message = error instanceof TypeError ? '词库暂时无法下载，请检查连接后重试' : error instanceof SyntaxError ? '索引文件暂时无法读取，请重新载入' : error.message;
    postMessage({ type: 'error', message: message || '词库载入失败' });
  }
  finally { loading = false; }
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') initialize();
  else if (data.type === 'search') {
    if (entries.length) search(data);
    else pending = data;
  } else if (data.type === 'study' && entries.length) {
    const pool = entries.filter(entry => !data.tag || entry.t.includes(data.tag));
    const day = Math.floor(Number(data.day) || 0);
    const count = Math.min(data.daily ? 1 : 20, pool.length);
    const results = Array.from({ length: count }, (_, i) => {
      const { key, zh, ...entry } = pool[((day * 37 + i * 127) % pool.length + pool.length) % pool.length];
      return entry;
    });
    postMessage({ type: 'study', requestId: data.requestId, results });
  }
};
