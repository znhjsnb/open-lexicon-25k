// Native Node checks exercise the shipped modules against the real static dataset.
// These are NOT a substitute for tests/frontend.browser.cjs in a real browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { normalizeTags, shardFor, DATA_VERSION } from '../app/static/data.js';

const root = new URL('../app/static/', import.meta.url);
const index = JSON.parse(await readFile(new URL('data/search_index.json', root), 'utf8'));
const messages = [];
const cache = new Map();
const nativeFetch = globalThis.fetch;
let fetchCount = 0;
let failNetwork = false;
let failWrites = false;
let base;
let server;
let db;
let prefixes;
const report = { environment: `Node ${process.version}; ${process.arch}; module checks, not browser`, cpu: cpus()[0]?.model, scale: index.length, queries: [] };

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://test').pathname;
      if (!/^\/data\/(search_index\.json|shards\/(?:[a-z]|other)\.json)$/.test(pathname)) {
        response.writeHead(404).end(); return;
      }
      const bytes = await readFile(new URL(`.${pathname}`, root));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  globalThis.fetch = async input => {
    fetchCount++;
    if (failNetwork) throw new TypeError('Offline test');
    const url = new URL(input);
    const relative = fileURLToPath(url).replace(fileURLToPath(root), '').replaceAll('\\', '/');
    return nativeFetch(new URL(relative, base));
  };
  globalThis.caches = { open: async () => ({
    match: async url => cache.get(String(url))?.clone(),
    put: async (url, value) => { cache.set(String(url), value.clone()); },
    delete: async url => cache.delete(String(url))
  }) };
  globalThis.self = globalThis;
  globalThis.postMessage = message => messages.push(message);
  await import('../app/static/worker.js');
});

after(async () => {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await mkdir(new URL('../.tmp/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.tmp/frontend-module-results.json', import.meta.url), JSON.stringify(report, null, 2));
});

async function waitForMessage(type) {
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const position = messages.findIndex(message => message.type === type);
    if (position >= 0) return messages.splice(position, 1)[0];
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${type}`);
}
let requestId = 1;
function search(query, options = {}) {
  const id = requestId++;
  self.onmessage({ data: { type: 'search', requestId: id, query, ...options } });
  const result = messages.pop();
  assert.equal(result?.type, 'results');
  assert.equal(result.requestId, id);
  assert.ok(result.results.length <= 50);
  report.queries.push({ query, ...options, total: result.total, elapsed: result.elapsed });
  return result;
}

test('normalizes malformed export tags without changing the source; handles other shard', () => {
  assert.deepEqual(normalizeTags(['["CET4"', '"GRE"]', '"CET4"']), ['CET4', 'GRE']);
  assert.deepEqual(normalizeTags('[]'), []);
  assert.deepEqual(normalizeTags(null), []);
  assert.equal(shardFor('Available'), 'a');
  assert.equal(shardFor('éclair'), 'other');
  assert.equal(shardFor('123'), 'other');
});

test('loads all 25,006 entries asynchronously and runs only the latest queued search', async () => {
  self.onmessage({ data: { type: 'init' } });
  self.onmessage({ data: { type: 'search', query: 'available', requestId: 100 } });
  self.onmessage({ data: { type: 'search', query: 'borrow', requestId: 101 } });
  const ready = await waitForMessage('ready');
  assert.equal(ready.total, 25006);
  assert.equal(ready.fromCache, false);
  prefixes = ready.prefixes;
  report.initialization = ready.elapsed;
  const result = await waitForMessage('results');
  assert.equal(result.requestId, 101);
  assert.equal(result.results[0].w, 'borrow');
  assert.equal(fetchCount, 1);
});

test('exact, prefix, contains and Chinese meaning search are ranked and capped at 50', () => {
  assert.equal(search('AVAILABLE').results[0].w, 'available');
  assert.equal(search(' abandon ').results[0].w, 'abandon');
  const prefix = search('ab');
  assert.ok(prefix.results[0].w.startsWith('ab'));
  assert.equal(prefix.results.length, 50);
  const chinese = search('可获得');
  assert.ok(chinese.total > 0);
  const expected = index.filter(entry => entry.s.some(sense => sense.m.includes('可获得')));
  assert.equal(chinese.total, expected.length);
  assert.deepEqual(chinese.results.map(entry => entry.id), expected.slice(0, 50).map(entry => entry.id));
});

test('fuzzy search tolerates deletion and adjacent transposition, with exact matches first', () => {
  assert.equal(search('availabel').results[0].w, 'available');
  assert.equal(search('avaiable').results[0].w, 'available');
  assert.equal(search('abnadon').results[0].w, 'abandon');
  assert.equal(search('zzzzzzzzzzzzzzzz').total, 0);
});

test('exam, POS and real bookmark sets compose correctly, including an empty saved set', () => {
  const result = search('', { tag: 'CET4' });
  assert.equal(result.total, index.filter(entry => normalizeTags(entry.t).includes('CET4')).length);
  assert.ok(result.results.every(entry => entry.t.includes('CET4')));
  const nouns = search('', { tag: 'GRE', pos: 'n.' });
  assert.ok(nouns.results.every(entry => entry.t.includes('GRE') && entry.s.some(sense => sense.p.split(/\s/)[0] === 'n.')));
  const saved = search('', { bookmarks: ['available', 'borrow'] });
  assert.deepEqual(saved.results.map(entry => entry.w), ['available', 'borrow']);
  assert.equal(search('', { bookmarks: [] }).total, 0);
});

test('all 501 pages are reachable, bounded, and cannot run beyond the last page', () => {
  const second = search('', { offset: 50 });
  assert.equal(second.offset, 50);
  assert.equal(second.results[0].id, index[50].id);
  const last = search('', { offset: 999999 });
  assert.equal(last.offset, 25000);
  assert.equal(last.results.length, 6);
  assert.equal(search('', { offset: -1 }).offset, 0);
});

test('all browse sorts use the real index, deterministic ties and page before slicing; default stays rank compatible', () => {
  const alphabet = new Intl.Collator('en', { sensitivity: 'base' });
  const byAlpha = (a, b) => alphabet.compare(a.w.toLowerCase(), b.w.toLowerCase()) || a.id - b.id;
  const comparators = {
    alpha: byAlpha,
    'alpha-desc': (a, b) => -byAlpha(a, b),
    rank: (a, b) => a.id - b.id,
    senses: (a, b) => b.s.length - a.s.length || byAlpha(a, b),
  };
  assert.deepEqual(search('').results.map(entry => entry.id), index.slice(0, 50).map(entry => entry.id));
  for (const [sort, compare] of Object.entries(comparators)) {
    const expected = [...index].sort(compare);
    for (const offset of [0, 50, 1200, 4950, 25000]) {
      const result = search('', { sort, offset });
      assert.equal(result.total, index.length);
      assert.deepEqual(result.results.map(entry => entry.id), expected.slice(offset, offset + 50).map(entry => entry.id), `${sort} page ${offset / 50 + 1}`);
    }
    assert.equal(search('available', { sort }).results[0].w, 'available');
    assert.equal(search('availabel', { sort }).results[0].w, 'available');
    const filtered = index.filter(entry => entry.w.toLowerCase().startsWith('b') && normalizeTags(entry.t).includes('CET4') && entry.s.some(sense => sense.p.split(/\s/)[0] === 'n.')).sort(compare);
    const result = search('', { sort, letter: 'b', tag: 'CET4', pos: 'n.' });
    assert.equal(result.total, filtered.length);
    assert.deepEqual(result.results.map(entry => entry.id), filtered.slice(0, 50).map(entry => entry.id));
  }
});

test('deep-link anchors locate a full unfiltered page in every sort and respect active filters', () => {
  for (const sort of ['alpha', 'rank', 'senses', 'alpha-desc']) {
    const result = search('', { sort, anchor: 'AVAILABLE' });
    assert.equal(result.total, 25006);
    assert.ok(result.results.some(entry => entry.w === 'available'));
    assert.equal(result.offset % 50, 0);
    assert.ok(result.results.length > 1);
    const missing = search('', { sort, anchor: 'not-in-this-dictionary' });
    assert.equal(missing.offset, 0); assert.equal(missing.total, 25006);
    const filtered = search('', { sort, letter: 'b', anchor: 'available' });
    assert.ok(filtered.results.every(entry => entry.w.toLowerCase().startsWith('b')));
    assert.equal(filtered.offset, 0);
    assert.equal(search('', { sort, bookmarks: [] }).total, 0);
  }
  assert.equal(search('', { sort: 'alpha', offset: 76 }).offset, 50);
});

test('alphabet prefix filtering reaches every letter and composes with search, exams, POS and bookmarks', () => {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const result = search('', { letter });
    const expected = index.filter(entry => entry.w.toLowerCase().startsWith(letter));
    assert.equal(result.total, expected.length);
    assert.deepEqual(result.results.map(entry => entry.id), expected.slice(0, 50).map(entry => entry.id));
    if (expected.length > 50) assert.equal(search('', { letter, offset: 50 }).results[0].id, expected[50].id);
  }
  const combined = search('bo', { letter: 'b', tag: 'CET4', pos: 'v.', bookmarks: ['borrow', 'abandon'] });
  assert.deepEqual(combined.results.map(entry => entry.w), ['borrow']);
  assert.equal(search('available', { letter: 'z' }).total, 0);
});

test('complete two-letter catalogue is derived from all words and every prefix strictly filters and paginates', () => {
  const expected = new Map();
  for (const entry of index) {
    const key = entry.w.toLowerCase();
    if (!/^[a-z]{2}/.test(key)) continue;
    const prefix = key.slice(0, 2);
    if (!expected.has(prefix)) expected.set(prefix, []);
    expected.get(prefix).push(entry);
  }
  assert.deepEqual(Object.values(prefixes).flat().sort(), [...expected.keys()].sort());
  for (const [letter, values] of Object.entries(prefixes)) {
    assert.deepEqual(values, [...values].sort());
    for (const prefix of values) {
      assert.ok(prefix.startsWith(letter));
      const result = search('', { letter, prefix });
      const matches = expected.get(prefix);
      assert.equal(result.total, matches.length, prefix);
      assert.deepEqual(result.results.map(entry => entry.id), matches.slice(0, 50).map(entry => entry.id));
      if (matches.length > 50) assert.equal(search('', { letter, prefix, offset: 50 }).results[0].id, matches[50].id);
    }
  }
  const combined = search('available', { letter: 'a', prefix: 'av', tag: 'CET4', pos: 'adj.', bookmarks: ['available', 'abandon'] });
  assert.deepEqual(combined.results.map(entry => entry.w), ['available']);
  assert.equal(search('available', { letter: 'a', prefix: 'ab' }).total, 0);
  assert.equal(search('', { letter: 'b', prefix: 'av' }).total, 0);
  assert.equal(search('', { letter: 'a', prefix: 'av', bookmarks: [] }).total, 0);
  report.prefixCatalogue = { count: expected.size, avWords: expected.get('av').length, largestGroup: Math.max(...[...expected.values()].map(entries => entries.length)) };
});

test('daily study is deterministic, filtered and capped, with valid empty decks', () => {
  function deck(tag = '', daily = false) {
    self.onmessage({ data: { type: 'study', tag, daily, day: 20758, requestId: 2 } });
    return messages.pop().results;
  }
  const cards = deck('IELTS');
  assert.equal(cards.length, 20);
  assert.deepEqual(cards, deck('IELTS'));
  assert.ok(cards.every(card => card.t.includes('IELTS')));
  assert.equal(new Set(cards.map(card => card.id)).size, 20);
  assert.equal(deck('', true).length, 1);
  assert.equal(deck('no such exam').length, 0);
});

test('cached index works with the network unavailable', async () => {
  const before = fetchCount;
  failNetwork = true;
  self.onmessage({ data: { type: 'init' } });
  const ready = await waitForMessage('ready');
  assert.equal(ready.fromCache, true);
  assert.deepEqual(ready.prefixes, prefixes);
  assert.equal(fetchCount, before);
  assert.equal(search('borrow').results[0].w, 'borrow');
  failNetwork = false;
});

test('a damaged cached index is discarded so retry can fetch a fresh copy', async () => {
  cache.set(String(new URL('data/search_index.json', root)), new Response('{broken'));
  self.onmessage({ data: { type: 'init' } });
  await waitForMessage('error');
  assert.equal(cache.size, 0);
  self.onmessage({ data: { type: 'init' } });
  assert.equal((await waitForMessage('ready')).total, 25006);
});

// Transaction model for unit-level persistence/error checks. Real browser IDB is
// separately covered in frontend.browser.cjs; this deliberately makes no claim to
// validate browser IndexedDB internals.
const persisted = new Map();
function mockIndexedDB() {
  return { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction() {
          const tx = { objectStore: () => ({
            get(key) {
              const read = {};
              setImmediate(() => { read.result = structuredClone(persisted.get(key)); read.onsuccess?.(); });
              return read;
            },
            put(value, key) {
              setImmediate(() => {
                if (failWrites) tx.onabort?.();
                else { persisted.set(key, structuredClone(value)); tx.oncomplete?.(); }
              });
            }
          }) };
          return tx;
        }
      };
      request.onsuccess();
    });
    return request;
  } };
}

test('concurrent lookups coalesce into one request and persist every word in the letter', async () => {
  globalThis.indexedDB = mockIndexedDB();
  db = await import('../app/static/db.js?unit=1');
  const before = fetchCount;
  const results = await Promise.all([db.getWord('available'), db.getWord('abandon')]);
  assert.equal(fetchCount - before, 1);
  assert.equal(results[0].entry.word, 'available');
  assert.equal(results[1].entry.word, 'abandon');
  assert.equal(results[0].source, 'network');
  const shard = persisted.get(`${DATA_VERSION}:a`);
  const source = JSON.parse(await readFile(new URL('data/shards/a.json', root), 'utf8'));
  assert.equal(Object.keys(shard).length, Object.keys(source).length);
  assert.equal((await db.getWord('abandon')).source, 'memory');
  assert.equal((await db.getWord('April')).entry.word, 'April');
  assert.equal((await db.getWord('APRIL')).entry.word, 'April');
  assert.equal(fetchCount - before, 1);
});

test('a new module session reads the stored shard without any network request', async () => {
  const fresh = await import('../app/static/db.js?unit=2');
  failNetwork = true;
  const before = fetchCount;
  const result = await fresh.getWord('available');
  assert.equal(result.source, 'indexeddb');
  assert.equal(result.entry.senses.length, 4);
  assert.equal(fetchCount, before);
  failNetwork = false;
});

test('the 2026-11-03 data upgrade ignores stale IndexedDB keys and persists the complete replacement', async () => {
  assert.equal(DATA_VERSION, '25k-2026-11-03');
  globalThis.indexedDB = mockIndexedDB();
  const key = `${DATA_VERSION}:a`;
  const current = persisted.get(key);
  const staleKey = '25k-2026-11-01:a';
  const stale = { available: { word: 'available', senses: [], morphology_zh: 'stale' } };
  persisted.delete(key);
  persisted.set(staleKey, stale);
  try {
    const upgraded = await import('../app/static/db.js?unit=upgrade');
    const before = fetchCount;
    failNetwork = true;
    await assert.rejects(upgraded.getWord('available'), /连接/);
    failNetwork = false;
    const result = await upgraded.getWord('available');
    assert.equal(result.source, 'network');
    assert.equal(fetchCount - before, 2);
    for (const field of ['forms', 'family', 'synonyms_en', 'mnemonic_en']) assert.ok(result.entry[field]);
    assert.ok(result.entry.senses[0].meaning_en);
    assert.deepEqual(persisted.get(staleKey), stale);
    assert.deepEqual(persisted.get(key).available, result.entry);
    const reloaded = await import('../app/static/db.js?unit=upgrade-reload');
    failNetwork = true;
    assert.equal((await reloaded.getWord('available')).source, 'indexeddb');
  } finally {
    failNetwork = false;
    persisted.delete(staleKey);
    persisted.set(key, current);
  }
});

test('failed shard requests are retryable; uncached offline words give an error', async () => {
  failNetwork = true;
  await assert.rejects(db.getWord('borrow'), /连接/);
  failNetwork = false;
  assert.equal((await db.getWord('borrow')).entry.word, 'borrow');
  await assert.rejects(db.getWord('a-word-not-in-this-shard'), /暂未收录/);
});

test('quota failure and a missing IDB API degrade to working memory caches', async () => {
  failWrites = true;
  const result = await db.getWord('cat');
  assert.equal(result.entry.word, 'cat');
  assert.equal(db.cacheStatus.persistent, false);
  failWrites = false;
  globalThis.indexedDB = undefined;
  const memoryOnly = await import('../app/static/db.js?unit=3');
  assert.equal((await memoryOnly.getWord('dog')).entry.word, 'dog');
  assert.equal(memoryOnly.cacheStatus.persistent, false);
  failNetwork = true;
  assert.equal((await memoryOnly.getWord('dog')).source, 'memory');
  failNetwork = false;
  globalThis.indexedDB = { open() { throw new DOMException('Storage is disabled', 'SecurityError'); } };
  const denied = await import('../app/static/db.js?unit=denied');
  assert.equal((await denied.getWord('cat')).entry.word, 'cat');
  assert.equal(denied.cacheStatus.persistent, false);
});

test('full offline preparation can pause and resume and persists all 27 shards', async () => {
  globalThis.indexedDB = mockIndexedDB();
  const offline = await import('../app/static/db.js?unit=4');
  let completed = 0;
  const before = fetchCount;
  assert.equal(await offline.prepareOffline(() => {}, () => true), false);
  assert.equal(fetchCount, before);
  assert.equal(await offline.prepareOffline(count => { completed = count; }), true);
  assert.equal(completed, 27);
  assert.equal(persisted.size, 27);
  assert.equal([...persisted.values()].reduce((total, shard) => total + Object.keys(shard).length, 0), 25006);
  const resumed = await import('../app/static/db.js?unit=5');
  failNetwork = true;
  const result = await resumed.getWord('zebra');
  assert.equal(result.entry.word, 'zebra');
  assert.equal(result.source, 'indexeddb');
  failNetwork = false;
});

test('all 25,006 index entries align with all 58,574 source senses across 27 shards', async () => {
  const expected = new Map(index.map(entry => [entry.w.toLowerCase(), entry]));
  assert.equal(expected.size, 25006);
  let words = 0;
  let senses = 0;
  let bytes = 0;
  for (const letter of [...'abcdefghijklmnopqrstuvwxyz', 'other']) {
    const raw = await readFile(new URL(`data/shards/${letter}.json`, root));
    bytes += raw.byteLength;
    const shard = JSON.parse(raw);
    for (const [word, entry] of Object.entries(shard)) {
      assert.equal(shardFor(word), letter);
      assert.equal(entry.word.toLowerCase(), word);
      assert.equal(entry.id, expected.get(word)?.id);
      assert.deepEqual(entry.senses.map(sense => ({ p: sense.pos, m: sense.meaning_zh })), expected.get(word).s);
      assert.deepEqual(normalizeTags(entry.tags), normalizeTags(expected.get(word).t));
      assert.ok(Array.isArray(entry.tags) && entry.tags.every(tag => typeof tag === 'string'));
      for (const field of ['forms', 'family', 'morphology_zh', 'morphology_en', 'etymology_zh', 'etymology_en', 'synonyms_zh', 'synonyms_en', 'mnemonic_zh', 'mnemonic_en']) {
        assert.ok(typeof entry[field] === 'string' && entry[field].length > 0, `${word}.${field}`);
      }
      for (const sense of entry.senses) for (const field of ['phonetic', 'meaning_en']) {
        assert.ok(typeof sense[field] === 'string' && sense[field].length > 0, `${word}.senses.${field}`);
      }
      words++;
      senses += entry.senses.length;
    }
  }
  assert.equal(words, 25006);
  assert.equal(senses, 58574);
  report.integrity = { shards: 27, words, senses, shardBytes: bytes };
});

test('web exporter output matches SQLite and raw_json for every word and sense', async () => {
  const sqlite = new DatabaseSync(fileURLToPath(new URL('../data/exports/open_lexicon_25k.db', import.meta.url)), { readOnly: true });
  try {
    const wordRow = sqlite.prepare('SELECT * FROM words WHERE id = ?');
    const sourceSenses = new Map();
    for (const row of sqlite.prepare('SELECT word_id, pos, phonetic, meaning_zh, meaning_en, english_definition, collocation_en, collocation_zh, sentence_en, sentence_zh FROM senses ORDER BY word_id, sense_index').iterate()) {
      const { word_id, ...sense } = row;
      if (!sourceSenses.has(word_id)) sourceSenses.set(word_id, []);
      sourceSenses.get(word_id).push(Object.fromEntries(Object.entries(sense).map(([key, value]) => [key, value || ''])));
    }
    let count = 0;
    for (const letter of [...'abcdefghijklmnopqrstuvwxyz', 'other']) {
      const shard = JSON.parse(await readFile(new URL(`data/shards/${letter}.json`, root), 'utf8'));
      for (const entry of Object.values(shard)) {
        const row = wordRow.get(entry.id);
        assert.ok(row, entry.word);
        const raw = JSON.parse(row.raw_json);
        const expected = { id: row.id, word: row.word.trim(), phonetic: row.phonetic || '', tags: normalizeTags(row.exam_tags), forms: String(raw.forms || '').trim(), family: String(raw.family || '').trim() };
        for (const key of ['etymology_zh', 'etymology_en', 'morphology_zh', 'morphology_en', 'synonyms_zh', 'synonyms_en', 'mnemonic_zh', 'mnemonic_en']) expected[key] = row[key] || '';
        expected.senses = sourceSenses.get(row.id) || [];
        assert.deepEqual(entry, expected, entry.word);
        count++;
      }
    }
    assert.equal(count, sqlite.prepare('SELECT COUNT(*) AS n FROM words').get().n);
    assert.equal(count, 25006);
    report.exportParity = { words: count, senses: [...sourceSenses.values()].reduce((n, senses) => n + senses.length, 0), mismatches: 0 };
  } finally { sqlite.close(); }
});

test('representative search sample records actual module timings without browser claims', () => {
  const cases = ['available', 'ab', 'borrow', 'availabel', 'abnadon', '放弃', '工作', 'recommendation', 'zzzzzzzzzz'];
  const times = [];
  for (let round = 0; round < 5; round++) for (const query of cases) times.push(search(query).elapsed);
  times.sort((a, b) => a - b);
  report.searchSample = { count: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * .95)], maximum: times.at(-1) };
  assert.ok(times.every(Number.isFinite));
});
