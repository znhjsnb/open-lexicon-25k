// Runs the real app controller with isolated DOM/clock doubles. This does not
// claim browser rendering, native focus trapping, or device haptics coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../app/static/app.js', import.meta.url), 'utf8');

function fixture(reduce = false) {
  let now = 0, serial = 0;
  const frames = new Map(), timers = new Map(), animations = new Set(), elements = new Map();
  const vibrations = [], storage = new Map(), workers = [];
  let document;
  const later = (fn, delay = 0) => { const id = ++serial; timers.set(id, { fn, due: now + delay }); return id; };
  class Element {
    constructor(id) {
      this.id = id; this.attributes = new Map(); this.events = new Map(); this.children = new Map();
      this.style = { setProperty(name, value) { this[name] = value; } };
      const classes = new Set();
      this.classList = {
        contains: name => classes.has(name),
        toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
        add: name => classes.add(name), remove: name => classes.delete(name),
      };
      this.dataset = {}; this.value = ''; this.scrollTop = 0; this.isConnected = true;
      this.rows = []; this.hidden = false;
    }
    set innerHTML(html) {
      this.html = html;
      this.rows = [];
      this.appendRows(html);
    }
    get innerHTML() { return this.html || ''; }
    appendRows(html) {
      for (const match of html.matchAll(/<button id="(result-[^"]+)"[^>]*data-word="([^"]+)"/g)) {
        const row = new Element(match[1]); row.dataset.word = match[2]; this.rows.push(row);
      }
    }
    insertAdjacentHTML(position, html) { assert.equal(position, 'beforeend'); this.html += html; this.appendRows(html); }
    scrollIntoView() { this.scrollCalls = (this.scrollCalls || 0) + 1; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
    dispatch(name, data = {}) {
      const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...data };
      this.events.get(name)?.forEach(fn => fn(event)); return event;
    }
    querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element(selector)); return this.children.get(selector); }
    querySelectorAll(selector) { return selector === '[data-word]' ? this.rows : []; }
    get lastElementChild() { return this.querySelector('last'); }
    getBoundingClientRect() { return this.rect || { left: 800, top: 12, right: 1280, bottom: 900, width: 480, height: 888 }; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; later(() => this.dispatch('close')); }
    setPointerCapture(id) { this.pointerId = id; }
    hasPointerCapture(id) { return this.pointerId === id; }
    releasePointerCapture() { this.pointerId = undefined; }
    animate(keyframes, options) {
      const animation = { element: this, keyframes, options, start: now, cancel() { animations.delete(this); } };
      animations.add(animation); return animation;
    }
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  document = { getElementById: element, querySelector: element, body: element('body'), documentElement: element('html'), activeElement: element('daily') };
  const media = new Element('media'); media.matches = reduce;
  const systemTheme = new Element('systemTheme'); systemTheme.matches = false;
  const window = new Element('window');
  window.matchMedia = query => query.includes('reduced-motion') ? media : systemTheme;
  window.speechSynthesis = {};
  const speech = { cancel() {}, getVoices: () => [{ lang: 'en-US', localService: true }], speak() {} };
  const context = vm.createContext({
    window, document, Element, URL, console,
    performance: { now: () => now },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    navigator: { onLine: true, vibrate: pattern => vibrations.push([...pattern]) },
    location: { hash: '', href: 'https://lexicon.test/' }, history: { replaceState() {} },
    normalizeTags: tags => tags || [], cacheStatus: { persistent: true },
    getWord: async word => ({ entry: { word, phonetic: 'test', tags: [], senses: [] }, source: 'memory', elapsed: 0 }),
    Worker: class {
      constructor() { this.messages = []; workers.push(this); }
      postMessage(data) { this.messages.push(data); }
      terminate() {}
      reply(data) { this.onmessage({ data }); }
    },
    speechSynthesis: speech, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    setTimeout: later, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: target => {
      const animation = [...animations].find(item => item.element === target);
      const opacity = animation
        ? Number(animation.keyframes[0].opacity) + (Number(animation.keyframes[1].opacity) - Number(animation.keyframes[0].opacity)) * Math.min(1, (now - animation.start) / animation.options.duration)
        : (target.style.opacity ?? '1');
      return { opacity };
    },
  });
  // Only import loading and boot are replaced; handlers/physics are unmodified.
  const executable = source.replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.url', "'https://lexicon.test/app.js'").replace(/\r?\nstartWorker\(\);\s*$/, '');
  vm.runInContext(`${executable}\nworker = { postMessage() {}, terminate() {} }; state.ready = true;
    globalThis.ui = { createSpring, sheetSpring, cardSpring, openStudy, closeStudy, setFlipped, renderDetail, state, reducedMotion, settleSheet, startWorker, requestSearch, loadMore, navigate, selectWord, updateScrollEdge };`, context);
  function advance(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
      now += 16;
      const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      for (const animation of [...animations]) {
        if (now - animation.start >= animation.options.duration) { animations.delete(animation); animation.onfinish?.(); }
      }
      for (const [id, timer] of [...timers]) { if (timer.due <= now) { timers.delete(id); timer.fn(); } }
    }
  }
  function pointer(name, x, time, extra = {}) {
    element('sheet-handle').dispatch(name, { clientX: x, clientY: 30, timeStamp: time, pointerId: 1, button: 0, isPrimary: true, ...extra });
  }
  return { ui: context.ui, context, element, advance, pointer, media, vibrations, document, storage, animations, workers };
}

test('spring retargeting preserves presentation and velocity; critical damping settles without overshoot', () => {
  const f = fixture(); const values = [];
  const spring = f.ui.createSpring(value => values.push(value));
  spring.to(100); f.advance(64);
  const value = spring.value, velocity = spring.velocity;
  assert.ok(value > 0 && value < 100);
  spring.to(0);
  assert.equal(spring.value, value); assert.equal(spring.velocity, velocity);
  f.advance(1200); assert.equal(spring.value, 0);
  values.length = 0; spring.to(100); f.advance(1200);
  assert.equal(spring.value, 100); assert.ok(values.every(value => value <= 100));
});

test('drawer exits right, stays modal while closing, reverses without jumping, then restores focus', () => {
  const f = fixture(); const dialog = f.element('study');
  f.ui.openStudy(true); f.advance(1200);
  assert.equal(f.ui.sheetSpring.value, 0); assert.equal(dialog.open, true);
  f.ui.closeStudy(); f.advance(64);
  const value = f.ui.sheetSpring.value, velocity = f.ui.sheetSpring.velocity;
  assert.ok(value > 0); assert.equal(dialog.open, true);
  f.ui.openStudy(true);
  assert.equal(f.ui.sheetSpring.value, value); assert.equal(f.ui.sheetSpring.velocity, velocity);
  f.advance(1200); assert.equal(f.ui.sheetSpring.value, 0); assert.equal(dialog.open, true);
  f.ui.closeStudy(); f.advance(1200);
  assert.equal(dialog.open, false); assert.equal(f.document.activeElement, f.element('daily'));
  assert.equal(f.element('.workspace').style.transform, '');
});

test('grabber tracks 1:1, resists the left boundary, and hands rightward flick velocity to dismissal', () => {
  const f = fixture(); f.ui.openStudy(false); f.advance(1200);
  f.pointer('pointerdown', 1000, 0); f.pointer('pointermove', 1040, 20);
  assert.equal(f.ui.sheetSpring.value, 40);
  f.pointer('pointermove', 980, 40);
  assert.ok(f.ui.sheetSpring.value < 0 && f.ui.sheetSpring.value > -20);
  f.pointer('pointercancel', 980, 50); f.advance(1200);
  assert.equal(f.element('study').open, true); assert.equal(f.ui.sheetSpring.value, 0);
  f.pointer('pointerdown', 1000, 100); f.pointer('pointermove', 1100, 140); f.pointer('pointerup', 1150, 160);
  assert.ok(f.ui.sheetSpring.velocity > 0); f.advance(1200);
  assert.equal(f.element('study').open, false);
});

test('leftward release reopens a mostly dismissed drawer; vertical or canceled gestures do not dismiss', () => {
  const f = fixture(); f.ui.openStudy(false); f.advance(1200);
  f.pointer('pointerdown', 800, 0); f.pointer('pointermove', 1200, 1000);
  f.pointer('pointermove', 1250, 1020); f.pointer('pointermove', 1200, 1040); f.pointer('pointerup', 1150, 1060);
  assert.ok(f.ui.sheetSpring.velocity < 0); f.advance(1200); assert.equal(f.element('study').open, true);
  f.pointer('pointerdown', 1000, 2000); f.pointer('pointermove', 1020, 2050, { clientY: 100 });
  f.advance(1200); assert.equal(f.element('study').open, true);
});

test('Escape uses the same dismissal path; post-close actions run after trigger focus restoration', () => {
  const f = fixture(); f.ui.openStudy(false); f.advance(1200);
  const event = f.element('study').dispatch('cancel');
  assert.equal(event.defaultPrevented, true); assert.equal(f.element('study').open, true);
  f.advance(1200); assert.equal(f.element('study').open, false);
  f.ui.openStudy(false); f.advance(1200);
  let completed = false;
  f.ui.closeStudy(() => { completed = true; f.element('content').focus(); });
  assert.equal(completed, false); f.advance(1200);
  assert.equal(completed, true); assert.equal(f.document.activeElement, f.element('content'));
});

test('reduced motion cross-fades the drawer and updates accessible card faces without spring frames', () => {
  const f = fixture(true); f.ui.openStudy(true);
  assert.equal(f.element('study').style.transform, 'none');
  assert.ok([...f.animations].every(item => item.options.duration === 120 && !('transform' in item.keyframes[0])));
  f.advance(160); f.ui.setFlipped(true);
  assert.equal(f.ui.cardSpring.value, 180);
  assert.equal(f.element('flashcard').querySelector('.card-front').getAttribute('aria-hidden'), 'true');
  assert.equal(f.element('flashcard').querySelector('.card-back').getAttribute('aria-hidden'), 'false');
  f.ui.closeStudy(); assert.equal(f.element('study').open, true); f.advance(160);
  assert.equal(f.element('study').open, false);
});

test('a live reduced-motion preference change cancels displacement immediately', () => {
  const f = fixture(); f.ui.openStudy(false); f.advance(64);
  assert.notEqual(f.element('.workspace').style.transform, '');
  f.media.matches = true; f.media.dispatch('change');
  assert.equal(f.element('study').style.transform, 'none');
  assert.equal(f.element('.workspace').style.transform, '');
  f.advance(160); assert.equal(f.ui.sheetSpring.value, 0);
});

test('speech, bookmark, flip and check-in issue only 8ms haptics; unsupported vibration is harmless', () => {
  const f = fixture();
  f.ui.state.selected = { word: 'available' }; f.ui.state.selectedKey = 'available';
  f.element('save').onclick();
  f.ui.state.study = [{ w: 'available', s: [{ p: 'adj.', m: '可用的' }] }];
  f.element('flashcard').onclick(); f.element('study-known').onclick();
  const audio = f.element('audio'); audio.dataset = { speak: 'available', lang: 'en-US' };
  f.element('detail').onclick({ target: { closest: () => audio } });
  assert.deepEqual(f.vibrations, [[8], [8], [8], [8]]);
  f.context.navigator.vibrate = () => { throw new Error('unsupported'); };
  assert.doesNotThrow(() => f.element('save').onclick());
});

test('entry renderer keeps every sense, definition, sentence, scenario, formula and origin flat', () => {
  const f = fixture();
  f.ui.renderDetail({ word: 'test', phonetic: 'test', tags: ['CET4'], morphology_zh: 'test + -ing → testing', etymology_zh: '词源故事', senses: [1, 2].map(i => ({
    pos: 'n.', meaning_zh: `释义${i}`, english_definition: `Definition ${i}`, sentence_en: `test sentence ${i}`, sentence_zh: `例句${i}`,
    collocation_en: `test A${i}; test B${i}`, collocation_zh: `场景A${i}；场景B${i}`,
  })) });
  const html = f.element('detail').innerHTML;
  for (const text of ['释义1', '释义2', 'Definition 1', 'Definition 2', '例句1', '例句2', '场景A1', '场景B2', 'test + -ing → testing', '词源故事']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<details|<summary|aria-expanded|\shidden[\s=>]/);
  assert.equal((html.match(/class="dimension /g) || []).length, 4);
  for (const number of ['一', '二', '三', '四']) assert.ok(html.includes(`要素${number}`));
});

function searchSession(f, total = 125) {
  f.ui.startWorker();
  const worker = f.workers.at(-1);
  worker.reply({ type: 'ready', total, elapsed: 1 });
  const batch = (offset, count = Math.min(50, total - offset)) => ({
    type: 'results', requestId: worker.messages.at(-1).requestId, offset, total, elapsed: 1,
    results: Array.from({ length: count }, (_, i) => ({ id: offset + i, w: `word${offset + i}`, s: [{ p: 'n.', m: `释义${offset + i}` }] })),
  });
  worker.reply(batch(0));
  return { worker, batch };
}

test('infinite scrolling appends once, preserves rows, scroll position and an in-flight detail, and stops at the end', async () => {
  const f = fixture();
  let release;
  f.context.getWord = () => new Promise(resolve => { release = resolve; });
  const { worker, batch } = searchSession(f);
  const list = f.element('word-list');
  const firstRow = list.rows[0], selectionId = f.ui.state.selectionId;
  list.clientHeight = 400; list.scrollHeight = 4000; list.scrollTop = 3350;
  list.dispatch('scroll'); list.dispatch('scroll');
  assert.equal(worker.messages.filter(message => message.type === 'search').length, 2);
  assert.equal(worker.messages.at(-1).offset, 50);
  worker.reply(batch(50));
  assert.equal(f.ui.state.selectionId, selectionId);
  assert.equal(list.rows.length, 100); assert.equal(list.rows[0], firstRow);
  assert.equal(list.scrollTop, 3350); assert.equal(firstRow.scrollCalls, 1);
  assert.match(f.element('list-status').textContent, /100 \/ 125/);
  release({ entry: { word: 'word0', tags: [], senses: [] }, source: 'memory', elapsed: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.ui.state.selected.word, 'word0');
  f.ui.loadMore(); worker.reply(batch(100));
  const messages = worker.messages.length;
  f.ui.loadMore(); list.dispatch('scroll');
  assert.equal(worker.messages.length, messages);
  assert.equal(list.rows.length, 125);
  assert.match(f.element('list-status').textContent, /已全部载入/);
});

test('a new alphabet filter rejects an old append response and resets the continuous list', () => {
  const f = fixture(); const { worker, batch } = searchSession(f);
  f.ui.loadMore(); const stale = batch(50);
  f.element('search').value = 'old query';
  f.element('word-list').scrollTop = 800;
  f.element('alphabet-bar').onclick({ target: { closest: () => ({ dataset: { letter: 'b' } }) } });
  assert.equal(worker.messages.at(-1).letter, 'b');
  assert.equal(worker.messages.at(-1).query, '');
  assert.equal(worker.messages.at(-1).offset, 0);
  assert.equal(f.element('word-list').scrollTop, 0);
  worker.reply(stale);
  assert.equal(f.element('word-list').rows.length, 50);
  const fresh = batch(0, 1); fresh.results[0].w = 'borrow'; fresh.total = 1;
  worker.reply(fresh);
  assert.equal(f.element('word-list').rows.length, 1);
  assert.equal(f.element('word-list').rows[0].dataset.word, 'borrow');
  assert.equal(f.ui.state.appending, false);
});

test('keyboard navigation continues into a new batch and can return to previously loaded words', async () => {
  const f = fixture(); const { worker, batch } = searchSession(f);
  await f.ui.selectWord('word49');
  f.ui.navigate(1);
  assert.equal(worker.messages.at(-1).offset, 50);
  worker.reply(batch(50));
  await Promise.resolve();
  assert.equal(f.ui.state.selectedKey, 'word50');
  f.ui.navigate(-1); await Promise.resolve();
  assert.equal(f.ui.state.selectedKey, 'word49');
  assert.equal(f.element('word-list').rows.length, 100);
});

test('switching words resets reading before and after loading and ignores an older detail', async () => {
  const f = fixture(); const pending = new Map();
  f.context.getWord = word => new Promise(resolve => pending.set(word, resolve));
  f.element('content').scrollTop = 900;
  const old = f.ui.selectWord('old');
  assert.equal(f.element('content').scrollTop, 0);
  const latest = f.ui.selectWord('latest');
  f.element('content').scrollTop = 300;
  pending.get('latest')({ entry: { word: 'latest', phonetic: 'latest', tags: [], senses: [] }, source: 'memory' });
  await latest;
  assert.equal(f.element('content').scrollTop, 0);
  pending.get('old')({ entry: { word: 'old', tags: [], senses: [] } });
  await old;
  assert.equal(f.ui.state.selected.word, 'latest');
  assert.match(f.element('toolbar-pinned-word').innerHTML, /latest/);
  assert.doesNotMatch(f.element('toolbar-pinned-word').innerHTML, />old</);
});

test('the pinned identity appears past the word header, offers both accents and hides on return to top', async () => {
  const f = fixture(); await f.ui.selectWord('available');
  const badge = f.element('toolbar-pinned-word');
  f.element('detail').querySelector('.word-header').rect = { bottom: 80 };
  f.element('.content-toolbar').rect = { bottom: 140 };
  f.element('content').scrollTop = 400;
  f.ui.updateScrollEdge();
  assert.equal(badge.hidden, false);
  assert.equal(f.element('breadcrumb').hidden, true);
  assert.match(badge.innerHTML, /data-speak="available" data-lang="en-GB"/);
  assert.match(badge.innerHTML, /data-speak="available" data-lang="en-US"/);
  let spoken;
  f.context.speechSynthesis.speak = utterance => { spoken = utterance; };
  const audio = f.element('pinned-audio'); audio.dataset = { speak: 'available', lang: 'en-GB' };
  badge.onclick({ target: { closest: () => audio } });
  assert.equal(spoken.text, 'available'); assert.equal(spoken.lang, 'en-GB');
  f.element('content').scrollTop = 0; f.ui.updateScrollEdge();
  assert.equal(badge.hidden, true); assert.equal(f.element('breadcrumb').hidden, false);
});
