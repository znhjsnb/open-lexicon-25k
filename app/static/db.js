import { DATA_VERSION, shardFor } from './data.js';

const memory = new Map();
const inflight = new Map();
let database;
export const cacheStatus = { persistent: true };

function openDatabase() {
  if (!database) database = new Promise(resolve => {
    if (!globalThis.indexedDB) { cacheStatus.persistent = false; resolve(null); return; }
    let request;
    let unavailable = false;
    try { request = indexedDB.open('open-lexicon', 1); }
    catch { cacheStatus.persistent = false; resolve(null); return; }
    request.onupgradeneeded = () => request.result.createObjectStore('shards');
    request.onsuccess = () => {
      const db = request.result;
      if (unavailable) { db.close(); return; }
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
    request.onerror = request.onblocked = () => { unavailable = true; cacheStatus.persistent = false; resolve(null); };
  });
  return database;
}

async function readShard(key) {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction('shards').objectStore('shards').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch { cacheStatus.persistent = false; resolve(null); }
  });
}

async function writeShard(key, shard) {
  const db = await openDatabase();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('shards', 'readwrite');
      transaction.objectStore('shards').put(shard, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => { cacheStatus.persistent = false; resolve(); };
    } catch { cacheStatus.persistent = false; resolve(); }
  });
}

function remember(letter, shard) {
  memory.delete(letter);
  memory.set(letter, shard);
  if (memory.size > 3) memory.delete(memory.keys().next().value);
}

async function loadShard(letter) {
  const key = `${DATA_VERSION}:${letter}`;
  const cached = await readShard(key);
  if (cached) { remember(letter, cached); return { shard: cached, source: 'indexeddb' }; }
  let response;
  try { response = await fetch(new URL(`./data/shards/${letter}.json`, import.meta.url)); }
  catch { throw new Error('词条暂时无法下载，请检查连接后重试'); }
  if (!response.ok) throw new Error(`词条暂未下载（${response.status}）`);
  const shard = await response.json().catch(() => { throw new Error('词条分片格式不正确，请联网后重试'); });
  if (!shard || typeof shard !== 'object' || Array.isArray(shard) || !Object.values(shard).every(entry => typeof entry.word === 'string' && Array.isArray(entry.senses))) throw new Error('词条分片格式不正确');
  remember(letter, shard);
  // One atomic record persists every word in the shard.
  await writeShard(key, shard);
  return { shard, source: 'network' };
}

async function ensureShard(letter) {
  if (!inflight.has(letter)) inflight.set(letter, loadShard(letter).finally(() => inflight.delete(letter)));
  return inflight.get(letter);
}

export async function prepareOffline(onProgress, shouldPause = () => false) {
  const letters = [...'abcdefghijklmnopqrstuvwxyz', 'other'];
  for (let index = 0; index < letters.length; index++) {
    if (shouldPause()) return false;
    await ensureShard(letters[index]);
    if (!cacheStatus.persistent) throw new Error('设备存储不可用或空间不足，无法保存完整离线词库');
    onProgress(index + 1, letters.length);
  }
  return true;
}

export async function getWord(word) {
  const started = performance.now();
  const letter = shardFor(word);
  let result;
  if (memory.has(letter)) {
    const shard = memory.get(letter);
    remember(letter, shard);
    result = { shard, source: 'memory' };
  } else {
    result = await ensureShard(letter);
  }
  const key = String(word).toLowerCase();
  const entry = Object.hasOwn(result.shard, key) ? result.shard[key] : null;
  if (!entry) throw new Error('这个词的详细内容暂未收录');
  return { entry, source: result.source, elapsed: performance.now() - started };
}
