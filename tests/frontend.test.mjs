// Native Node checks exercise the shipped modules against the real static dataset.
// These are NOT a substitute for tests/frontend.browser.cjs in a real browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
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
      assert.equal(typeof entry.morphology_zh, 'string');
      assert.equal(typeof entry.etymology_zh, 'string');
      words++;
      senses += entry.senses.length;
    }
  }
  assert.equal(words, 25006);
  assert.equal(senses, 58574);
  report.integrity = { shards: 27, words, senses, shardBytes: bytes };
});

test('representative search sample records actual module timings without browser claims', () => {
  const cases = ['available', 'ab', 'borrow', 'availabel', 'abnadon', '放弃', '工作', 'recommendation', 'zzzzzzzzzz'];
  const times = [];
  for (let round = 0; round < 5; round++) for (const query of cases) times.push(search(query).elapsed);
  times.sort((a, b) => a - b);
  report.searchSample = { count: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * .95)], maximum: times.at(-1) };
  assert.ok(times.every(Number.isFinite));
});
