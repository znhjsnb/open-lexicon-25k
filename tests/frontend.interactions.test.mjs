// Runs the real app controller with isolated DOM/clock doubles. This does not
// claim browser rendering, native focus trapping, or device haptics coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../app/static/app.js', import.meta.url), 'utf8');

function fixture(reduce = false, stored = [], hash = '') {
  let now = 0, serial = 0;
  const frames = new Map(), timers = new Map(), animations = new Set(), elements = new Map();
  const vibrations = [], storage = new Map(stored), workers = [];
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
      this.buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map((match, i) => {
        const button = new Element(`${this.id}-button-${i}`);
        for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
          button.setAttribute(attr[1], attr[2]);
          if (attr[1].startsWith('data-')) button.dataset[attr[1].slice(5)] = attr[2];
        }
        return button;
      });
    }
    get innerHTML() { return this.html || ''; }
    appendRows(html) {
      for (const match of html.matchAll(/<button id="(result-[^"]+)"[^>]*data-word="([^"]+)"/g)) {
        const row = new Element(match[1]); row.dataset.word = match[2]; row.offsetTop = this.rows.length * 52; this.rows.push(row);
      }
    }
    insertAdjacentHTML(position, html) {
      if (position === 'afterbegin') {
        this.html = html + this.html;
        const previous = this.rows; this.rows = []; this.appendRows(html); this.rows.push(...previous);
        this.rows.forEach((row, index) => { row.offsetTop = index * 52; });
        this.scrollHeight = this.rows.length * 52;
      } else { assert.equal(position, 'beforeend'); this.html += html; this.appendRows(html); }
    }
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
    querySelectorAll(selector) { return selector === '[data-word]' ? this.rows : selector === 'button' ? (this.buttons || []) : []; }
    closest(selector) { return selector === 'button[data-value]' && this.getAttribute('data-value') !== null ? this : null; }
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
    location: { hash, href: `https://lexicon.test/${hash}` }, history: { replaceState() {} },
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

test('entry renderer keeps short sense navigation and every complete definition and learning unit flat', async () => {
  const f = fixture();
  const definition = i => `You use a before a singular countable noun when referring to something that has not been mentioned before, as in a book or a question about sense ${i}.`;
  const entry = { word: 'test', phonetic: '/test/', tags: ['CET4'], forms: '复数 tests', family: '词族 testing', morphology_zh: 'test + -ing → 测试中；常用词族：testing', morphology_en: 'test + -ing -> testing; word formation', etymology_zh: '词源故事', etymology_en: 'Origin story', synonyms_zh: '近义辨析', synonyms_en: 'Synonym nuances', mnemonic_zh: '记忆口诀', mnemonic_en: 'Memory anchor', senses: [1, 2].map(i => ({
    pos: 'art. 冠词', phonetic: i === 1 ? '英 /test/；美 /tɛst/' : '/test/', meaning_zh: `释义${i}`, meaning_en: `short meaning ${i}`, english_definition: definition(i), sentence_en: `test sentence ${i}`, sentence_zh: `例句${i}`,
    collocation_en: `test A${i}; test B${i}`, collocation_zh: `场景A${i}；场景B${i}`,
  })) };
  f.ui.renderDetail(entry);
  const html = f.element('detail').innerHTML;
  for (const text of ['释义1', '释义2', definition(1), definition(2), '例句1', '例句2', '场景A1', '场景B2', 'test + -ing → 测试中；', '常用词族：testing']) assert.ok(html.includes(text), text);
  for (const key of ['forms', 'family', 'morphology_en', 'etymology_zh', 'etymology_en', 'synonyms_zh', 'synonyms_en', 'mnemonic_zh', 'mnemonic_en']) assert.ok(html.includes(entry[key].replaceAll('>', '&gt;')), key);
  assert.match(html, /class="lexical-meta-grid zh-content" aria-label="词形与词族"/);
  assert.ok(html.indexOf('class="tag-line"') < html.indexOf('class="lexical-meta-grid'));
  assert.ok(html.indexOf('class="lexical-meta-grid') < html.indexOf('class="sense-quick-chips"'));
  assert.match(html, /<p class="formula zh-content">test \+ -ing → 测试中<\/p><p class="formula en-content" lang="en">test \+ -ing -&gt; testing<\/p>/);
  assert.match(html, /<span class="sense-phonetic"><span class="label-zh">英 \/test\/；美 \/tɛst\/<\/span><span class="label-en" lang="en">UK \/test\/; US \/tɛst\/<\/span><\/span>/);
  assert.match(html, /<span class="sense-phonetic" lang="en">\/test\/<\/span>/);
  assert.doesNotMatch(html, /\/\/|source-note/);
  assert.doesNotMatch(html, /<details|<summary|aria-expanded|\shidden[\s=>]/);
  assert.equal((html.match(/class="dimension /g) || []).length, 6);
  for (const number of ['一', '二', '三', '四', '五', '六']) assert.ok(html.includes(`要素${number}`));
  assert.equal((html.match(/class="deep-copy en-content" lang="en"/g) || []).length, 4);
  const cards = html.split(/<section id="sense-\d+"/).slice(1);
  assert.equal(cards.length, 2);
  cards.forEach((card, i) => {
    for (const text of [`释义${i + 1}`, definition(i + 1), `例句${i + 1}`, `场景A${i + 1}`, `场景B${i + 1}`, '听例句']) assert.ok(card.includes(text), text);
    assert.match(card, /class="example-zh zh-content"/);
    assert.equal(card.match(/<p class="definition" lang="en">([^<]*)<\/p>/)[1], definition(i + 1));
    assert.equal(card.match(/<p class="sense-meaning-en" lang="en">([^<]*)<\/p>/)[1], `short meaning ${i + 1}`);
  });
  assert.equal((html.match(/data-sense="/g) || []).length, 2);
  const navigation = html.match(/<nav class="sense-quick-chips"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const chips = [...navigation.matchAll(/<button class="sense-chip" data-sense="(\d+)">([\s\S]*?)<\/button>/g)];
  assert.equal(chips.length, 2);
  for (const [i, chip] of chips.entries()) {
    const number = String(i + 1).padStart(2, '0');
    assert.equal(chip[1], String(i + 1));
    assert.ok(chip[2].includes(`<span class="sense-chip-number">${number}</span> 释义${i + 1}`));
    assert.equal(chip[2].match(/<span class="label-en" lang="en">([^<]*)<\/span>/)[1], `Sense ${number}`);
    assert.ok(!chip[2].includes(definition(i + 1)));
  }
  f.element('lang-en').onclick();
  assert.equal(f.document.body.classList.contains('lang-en-only'), true);
  assert.equal(f.element('detail').innerHTML, html);
  f.element('lang-bilingual').onclick();
  assert.equal(f.document.body.classList.contains('lang-en-only'), false);
  assert.equal(f.element('detail').innerHTML, html);
  const copied = [];
  f.context.navigator.clipboard = { writeText: async text => copied.push(text) };
  f.ui.state.selected = entry;
  await f.element('copy').onclick();
  assert.match(copied[0], /^# test \/test\/\n\nCET4/);
  for (const key of ['forms', 'family', 'morphology_zh', 'morphology_en', 'etymology_zh', 'etymology_en', 'synonyms_zh', 'synonyms_en', 'mnemonic_zh', 'mnemonic_en']) assert.ok(copied[0].includes(entry[key]), key);
  for (const sense of entry.senses) for (const value of Object.values(sense)) assert.ok(copied[0].includes(value), value);
  for (const title of ['现代构词', '词源', '近义辨析', '记忆锚点']) assert.ok(copied[0].includes(`## ${title}\n`));
  // Tabs/newlines and HTML metacharacters must remain safe in either TSV column.
  entry.word = 'test\t<&\n"'; entry.forms += '\t<&\r\n'; entry.senses[0].meaning_en += ' <script> & "quoted"';
  await f.element('copy-anki').onclick();
  const columns = copied[1].split('\t');
  assert.equal(columns.length, 2);
  assert.doesNotMatch(copied[1], /[\r\n]/);
  assert.match(columns[0], /&lt;&amp; &quot;/);
  assert.match(columns[1], /&lt;script&gt; &amp; &quot;quoted&quot;/);
  assert.doesNotMatch(columns[1], /<script>/);
  for (const sense of entry.senses) for (const key of ['phonetic', 'meaning_zh', 'english_definition', 'sentence_en', 'sentence_zh', 'collocation_en', 'collocation_zh']) assert.ok(columns[1].includes(sense[key]), key);
  for (const key of ['family', 'synonyms_zh', 'mnemonic_zh']) assert.ok(columns[1].includes(entry[key]), key);
  assert.ok(columns[1].includes('词形变化: 复数 tests &lt;&amp;  '));
});

test('pronunciation labels translate longest matches first and unknown Chinese annotations retain only IPA', async () => {
  const f = fixture();
  for (const [input, expected] of [
    ['', ''], ['test', '/test/'], ['/ˈrekɔːd/', '/ˈrekɔːd/'],
    ['英式英语 /a/；美式英语 /b/', 'UK /a/; US /b/'],
    ['英式 /a/，英音 /b/，英 /c/', 'UK /a/, UK /b/, UK /c/'],
    ['美式常见变体 /a/；美式变体 /b/；美式 /c/；美音 /d/；美 /e/', 'US /a/; US /b/; US /c/; US /d/; US /e/'],
    ['英美 /a/；强读 /b/；通常弱读 /c/；弱读 /d/；重读 /e/', 'UK/US /a/; strong /b/; weak /c/; weak /d/; stressed /e/'],
    ['复数 /a/；单数 /b/；亦作 /c/；亦读 /d/；也作 /e/；或 /f/；亦 /g/', 'pl. /a/; sg. /b/; or /c/; or /d/; or /e/; or /f/; or /g/'],
    ['英美 /a/；其他读法 /b/', '/a/; /b/'], ['暂无读音', ''],
  ]) assert.equal(f.context.englishPhonetic(input), expected, input);
  for (const input of ['', null, undefined]) assert.equal(f.context.phonetic(input), '');
  assert.equal(f.context.phonetic('英 /a/；美 /b/'), '英 /a/；美 /b/');
  let compounds = 0;
  for (const letter of [...'abcdefghijklmnopqrstuvwxyz', 'other']) {
    const shard = JSON.parse(await fs.readFile(new URL(`../app/static/data/shards/${letter}.json`, import.meta.url), 'utf8'));
    for (const entry of Object.values(shard)) for (const sense of entry.senses) {
      assert.doesNotMatch(f.context.phonetic(sense.phonetic), /\/\//, entry.word);
      const english = f.context.englishPhonetic(sense.phonetic);
      assert.doesNotMatch(english, /[\u3400-\u9fff]|\/\//, entry.word);
      if (/[\u3400-\u9fff]/.test(sense.phonetic)) { compounds++; assert.ok(english.length > 0, entry.word); }
    }
  }
  assert.equal(compounds, 3689);
});

test('deep notes preserve English fallbacks, optional lexical strips and source-only formula variants', () => {
  const f = fixture();
  const base = { word: '<test>', tags: [], senses: [] };
  f.ui.renderDetail(base);
  let html = f.element('detail').innerHTML;
  assert.doesNotMatch(html, /class="lexical-meta-grid|class="formula/);
  for (const text of ['暂无构词说明', '暂无词源说明', '暂无近义辨析', '暂无助记说明', 'Word formation notes', 'Origin notes', 'Synonym notes', 'Mnemonic notes']) assert.ok(html.includes(text));
  assert.match(html, /&lt;test&gt;/);
  for (const [fields, expected] of [
    [{ morphology_zh: 'test + -ing → testing' }, '<p class="formula">test + -ing → testing</p>'],
    [{ morphology_en: 'test + -ing -> testing' }, '<p class="formula">test + -ing -&gt; testing</p>'],
    [{ morphology_zh: 'test + -ing → 测试' }, '<p class="formula zh-content">test + -ing → 测试</p>'],
  ]) {
    f.ui.renderDetail({ ...base, ...fields, forms: '<forms>', family: '<family>' });
    html = f.element('detail').innerHTML;
    assert.ok(html.includes(expected));
    assert.match(html, /&lt;forms&gt;/); assert.match(html, /&lt;family&gt;/);
  }
});

test('sidebar pointer resizing clamps, ignores other pointers, persists once and cleans up cancellation', () => {
  const f = fixture(); const handle = f.element('resizer');
  assert.equal(handle.getAttribute('aria-valuenow'), '340');
  const pointer = (name, x, id = 7) => handle.dispatch(name, { clientX: x, pointerId: id, button: 0, isPrimary: true });
  pointer('pointermove', 500); // Hover is harmless.
  pointer('pointerdown', 340);
  assert.ok(f.document.body.classList.contains('resizing'));
  pointer('pointermove', 550, 8);
  assert.equal(handle.getAttribute('aria-valuenow'), '340');
  pointer('pointermove', 1400);
  assert.equal(handle.getAttribute('aria-valuenow'), '640');
  assert.equal(f.storage.has('open_lexicon_sidebar_width'), false);
  pointer('pointermove', 0);
  assert.equal(handle.getAttribute('aria-valuenow'), '240');
  pointer('pointermove', 420); pointer('pointercancel', 420);
  assert.equal(f.storage.get('open_lexicon_sidebar_width'), '420');
  assert.equal(handle.hasPointerCapture(7), false);
  assert.equal(f.document.body.classList.contains('resizing'), false);
  pointer('pointermove', 500);
  assert.equal(handle.getAttribute('aria-valuenow'), '420');
  handle.dispatch('dblclick');
  assert.equal(f.document.documentElement.style['--sidebar-width'], '340px');
  assert.equal(f.storage.get('open_lexicon_sidebar_width'), '340');
  pointer('pointerdown', 340); pointer('pointermove', 380); pointer('lostpointercapture', 380);
  assert.equal(f.storage.get('open_lexicon_sidebar_width'), '380');
  assert.equal(f.document.body.classList.contains('resizing'), false);
});

test('sidebar keyboard controls and restored preferences remain bounded with corrupt or denied storage', () => {
  const f = fixture(false, [['open_lexicon_sidebar_width', '500']]);
  const handle = f.element('resizer');
  assert.equal(handle.getAttribute('aria-valuenow'), '500');
  assert.equal(handle.dispatch('keydown', { key: 'ArrowLeft' }).defaultPrevented, true);
  assert.equal(handle.getAttribute('aria-valuenow'), '490');
  handle.dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  assert.equal(handle.getAttribute('aria-valuenow'), '530');
  for (const [key, expected] of [['Home', '240'], ['End', '640'], ['Enter', '340']]) {
    handle.dispatch('keydown', { key }); assert.equal(handle.getAttribute('aria-valuenow'), expected);
  }
  for (const [stored, expected] of [['9999', '640'], ['0', '240'], ['"oops"', '340'], ['{}', '340'], ['broken', '340']]) {
    assert.equal(fixture(false, [['open_lexicon_sidebar_width', stored]]).element('resizer').getAttribute('aria-valuenow'), expected);
  }
  f.context.localStorage.setItem = () => { throw new Error('quota'); };
  assert.doesNotThrow(() => handle.dispatch('keydown', { key: 'ArrowRight' }));
  assert.equal(handle.getAttribute('aria-valuenow'), '350');
});

test('language buttons restore, persist, expose selection and vibrate without replacing the current entry', () => {
  function assertLanguage(f, mode) {
    assert.equal(f.document.body.classList.contains('lang-en-only'), mode === 'en');
    const buttons = f.element('typography-langs').querySelectorAll('button');
    assert.deepEqual(buttons.map(button => button.dataset.value), ['bilingual', 'en']);
    for (const value of ['bilingual', 'en']) {
      assert.equal(f.element(`lang-${value}`).getAttribute('aria-pressed'), String(value === mode));
      assert.equal(buttons.find(button => button.dataset.value === value).getAttribute('aria-pressed'), String(value === mode));
    }
  }
  const f = fixture();
  assertLanguage(f, 'bilingual');
  assert.equal(f.storage.has('open_lexicon_lang_mode'), false);
  assert.deepEqual(f.vibrations, []);
  assert.match(f.element('typography-langs').innerHTML, />中英双语<\/button>.*>English<\/button>/);
  f.element('detail').innerHTML = '<p>Current entry</p>';
  f.element('content').scrollTop = 250;
  f.element('lang-en').onclick();
  assertLanguage(f, 'en');
  assert.equal(f.storage.get('open_lexicon_lang_mode'), '"en"');
  assert.equal(f.element('content').classList.contains('is-scrolled'), true);
  assert.deepEqual(f.vibrations, [[8]]);

  typographyOption(f, 'typography-langs', 'bilingual');
  assertLanguage(f, 'bilingual');
  assert.equal(f.storage.get('open_lexicon_lang_mode'), '"bilingual"');
  assertLanguage(fixture(false, [...f.storage]), 'bilingual');
  // Delegation accepts a nested element and rejects empty space, non-elements and unknown values.
  const group = f.element('typography-langs');
  const nested = f.element('language-label');
  nested.closest = selector => { assert.equal(selector, 'button[data-value]'); return group.querySelectorAll('button')[1]; };
  f.element('content').classList.remove('is-scrolled');
  group.onclick({ target: nested });
  assertLanguage(f, 'en');
  assert.equal(f.storage.get('open_lexicon_lang_mode'), '"en"');
  assert.equal(f.element('content').classList.contains('is-scrolled'), true);
  assert.equal(f.element('detail').innerHTML, '<p>Current entry</p>');
  assert.equal(f.element('content').scrollTop, 250);
  assert.deepEqual(f.vibrations, [[8], [8], [8]]);
  assert.equal(f.storage.has('open_lexicon_typography'), false);
  const unknown = f.element('invalid-language'); unknown.setAttribute('data-value', '__proto__'); unknown.dataset.value = '__proto__';
  for (const target of [group, null, {}, unknown]) assert.doesNotThrow(() => group.onclick({ target }));
  assertLanguage(f, 'en');
  assert.equal(f.storage.get('open_lexicon_lang_mode'), '"en"');
  assert.deepEqual(f.vibrations, [[8], [8], [8]]);

  const restored = fixture(false, [...f.storage]);
  assertLanguage(restored, 'en');
  assert.deepEqual(restored.vibrations, []);
  restored.element('lang-bilingual').onclick();
  assertLanguage(restored, 'bilingual');
  assert.equal(restored.storage.get('open_lexicon_lang_mode'), '"bilingual"');
  for (const stored of ['"invalid"', 'null', '[]', '{}', 'broken']) assertLanguage(fixture(false, [['open_lexicon_lang_mode', stored]]), 'bilingual');
  restored.context.localStorage.setItem = () => { throw new Error('quota'); };
  restored.context.navigator.vibrate = () => { throw new Error('unsupported'); };
  assert.doesNotThrow(() => typographyOption(restored, 'typography-langs', 'en'));
  assertLanguage(restored, 'en');
  assert.match(restored.element('toast').textContent, /当前页面/);
  assert.doesNotThrow(() => restored.element('lang-bilingual').onclick());
  assertLanguage(restored, 'bilingual');
});

test('sense quick chips move focus to their own learning unit and renderer escapes source text', () => {
  const f = fixture();
  f.ui.renderDetail({ word: '<test>', tags: [], senses: [{ pos: 'n.', meaning_zh: '<script>', english_definition: 'A & B', sentence_en: 'a <test>', sentence_zh: '译文' }] });
  assert.doesNotMatch(f.element('detail').innerHTML, /<script>/);
  assert.match(f.element('detail').innerHTML, /&lt;script&gt;/);
  assert.match(f.element('detail').innerHTML, /<p class="definition" lang="en">A &amp; B<\/p>/);
  const chip = f.element('sense-chip'); chip.dataset.sense = '1';
  f.element('detail').onclick({ target: { closest: selector => selector === '[data-sense]' ? chip : null } });
  assert.equal(f.document.activeElement, f.element('sense-1'));
  assert.equal(f.element('sense-1').scrollCalls, 1);
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

test('two-letter jumps reset pagination, retain other filters and discard stale replies; changing letters clears the prefix', () => {
  const f = fixture(); const { worker, batch } = searchSession(f);
  worker.reply({ type: 'ready', total: 125, elapsed: 1, prefixes: { a: ['ab', 'ac', 'av'], b: ['ba', 'bo'] } });
  const alphabet = f.element('alphabet-bar');
  const clickLetter = letter => alphabet.onclick({ target: { closest: () => alphabet.buttons.find(button => button.dataset.letter === letter) } });
  clickLetter('a');
  assert.equal(f.element('sub-prefix-bar').hidden, false);
  assert.deepEqual(f.element('sub-prefix-bar').buttons.map(button => button.dataset.prefix), ['', 'ab', 'ac', 'av']);
  assert.equal(alphabet.buttons.find(button => button.dataset.letter === 'a').getAttribute('aria-pressed'), 'true');
  const stale = batch(50);
  f.ui.state.tag = 'CET4'; f.ui.state.pos = 'adj.'; f.ui.state.savedOnly = true;
  f.element('search').value = 'old'; f.element('word-list').scrollTop = 600;
  const prefixBar = f.element('sub-prefix-bar');
  const clickPrefix = prefix => prefixBar.onclick({ target: { closest: () => prefixBar.buttons.find(button => button.dataset.prefix === prefix) } });
  clickPrefix('av');
  const message = worker.messages.at(-1);
  assert.equal(message.prefix, 'av'); assert.equal(message.letter, 'a');
  assert.equal(message.query, ''); assert.equal(message.offset, 0);
  assert.equal(message.tag, 'CET4'); assert.equal(message.pos, 'adj.');
  assert.deepEqual([...message.bookmarks], []);
  assert.equal(f.element('word-list').scrollTop, 0);
  assert.equal(prefixBar.buttons.find(button => button.dataset.prefix === 'av').getAttribute('aria-pressed'), 'true');
  worker.reply(stale); assert.equal(f.element('word-list').rows.length, 50);
  clickPrefix(''); assert.equal(worker.messages.at(-1).prefix, ''); assert.equal(worker.messages.at(-1).letter, 'a');
  clickPrefix('av'); clickLetter('b');
  assert.equal(worker.messages.at(-1).prefix, '');
  assert.deepEqual(prefixBar.buttons.map(button => button.dataset.prefix), ['', 'ba', 'bo']);
  clickLetter(''); assert.equal(prefixBar.hidden, true);
});

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

test('initial fragments and hash changes locate words without filtering or filling the search box', async () => {
  const f = fixture(false, [], '#AVAILABLE');
  assert.equal(f.element('search').value, '');
  const { worker, batch } = searchSession(f, 25006);
  assert.equal(worker.messages.at(-1).query, '');
  assert.equal(worker.messages.at(-1).anchor, 'AVAILABLE');
  assert.equal(worker.messages.at(-1).sort, 'alpha');
  f.context.location.hash = '#available'; f.context.window.dispatch('hashchange');
  const linked = batch(1500); linked.results[22].w = 'available';
  worker.reply(linked); await Promise.resolve();
  assert.equal(f.element('search').value, '');
  assert.equal(f.ui.state.selectedKey, 'available');
  assert.equal(f.ui.state.total, 25006);
  assert.equal(f.element('word-list').rows.length, 50);
  assert.equal(f.element('word-list').rows[22].getAttribute('aria-selected'), 'true');
  assert.equal(f.element('word-list').rows[22].scrollCalls, 1);
  assert.equal(f.element('page-input').value, '31');
  f.element('search').value = 'typed query';
  f.context.location.hash = '#borrow'; f.context.window.dispatch('hashchange');
  assert.equal(f.element('search').value, 'typed query');
  assert.equal(worker.messages.at(-1).query, 'typed query');
  assert.equal(worker.messages.at(-1).anchor, 'borrow');
  const before = worker.messages.length;
  f.context.location.hash = '#%E0%A4%A'; f.context.window.dispatch('hashchange');
  assert.equal(worker.messages.length, before);
});

test('page input supports Enter and go, clamps bounds, rejects stale replies and uses absolute offsets when appending', () => {
  const f = fixture(); const { worker, batch } = searchSession(f, 25006);
  assert.equal(f.element('page-input').max, '501');
  assert.equal(f.element('page-prev').disabled, true);
  f.element('page-input').value = '25';
  assert.equal(f.element('page-input').dispatch('keydown', { key: 'Enter' }).defaultPrevented, true);
  assert.equal(worker.messages.at(-1).offset, 1200);
  const stale = batch(1200);
  f.element('page-input').value = '100'; f.element('page-go').onclick();
  assert.equal(worker.messages.at(-1).offset, 4950);
  worker.reply(stale); assert.equal(f.ui.state.startOffset, 0);
  worker.reply(batch(4950));
  assert.equal(f.ui.state.startOffset, 4950);
  assert.equal(f.element('page-input').value, '100');
  f.ui.loadMore(); assert.equal(worker.messages.at(-1).offset, 5000);
  worker.reply(batch(5000));
  assert.equal(f.element('word-list').rows.length, 100);
  assert.equal(f.ui.state.startOffset, 4950);
  f.element('page-input').value = '9999'; f.element('page-go').onclick();
  assert.equal(worker.messages.at(-1).offset, 25000);
  worker.reply(batch(25000));
  assert.equal(f.element('page-input').value, '501');
  assert.equal(f.element('word-list').rows.length, 6);
  assert.equal(f.element('page-next').disabled, true);
  assert.match(f.element('list-status').textContent, /已到末页/);
  const count = worker.messages.length; f.ui.loadMore(); assert.equal(worker.messages.length, count);
  f.element('page-prev').onclick(); assert.equal(worker.messages.at(-1).offset, 24950);
  worker.reply(batch(24950));
  f.element('page-next').onclick(); assert.equal(worker.messages.at(-1).offset, 25000);
  worker.reply(batch(25000));
  for (const input of ['', 'invalid', 'Infinity']) {
    const count = worker.messages.length;
    f.element('page-input').value = input; f.element('page-go').onclick();
    assert.equal(worker.messages.length, count); assert.equal(f.element('page-input').value, '501');
  }
  f.element('page-input').value = '-5'; f.element('page-go').onclick();
  assert.equal(worker.messages.at(-1).offset, 0);
});

test('visible pages follow scrolling in both directions and filters recalculate totals including empty results', () => {
  const f = fixture(); const { worker, batch } = searchSession(f, 125);
  f.ui.loadMore(); worker.reply(batch(50));
  const list = f.element('word-list'); list.clientHeight = 400; list.scrollHeight = 5200;
  list.scrollTop = 52 * 50; list.dispatch('scroll');
  assert.equal(f.element('page-input').value, '2');
  list.scrollTop = 0; list.dispatch('scroll'); assert.equal(f.element('page-input').value, '1');
  f.element('page-input').value = '3'; f.element('page-go').onclick(); worker.reply(batch(100));
  assert.equal(f.element('page-input').value, '3');
  f.element('search').value = 'word'; f.element('search').dispatch('input');
  assert.equal(worker.messages.at(-1).offset, 0);
  const filtered = batch(0, 1); filtered.total = 1; worker.reply(filtered);
  assert.equal(f.element('page-input').value, '1'); assert.equal(f.element('page-input').max, '1');
  assert.equal(f.element('page-prev').disabled, true); assert.equal(f.element('page-next').disabled, true);
  f.element('search').value = 'zzzz'; f.element('search').dispatch('input');
  const empty = batch(0, 0); empty.total = 0; worker.reply(empty);
  assert.equal(f.element('page-total').textContent, '/ 0 页');
  assert.equal(f.element('page-go').disabled, true);
  f.element('clear').onclick(); assert.equal(worker.messages.at(-1).query, '');
  worker.reply(batch(0));
  assert.equal(f.element('page-total').textContent, '/ 3 页');
});

test('sort changes compose with filters and reset pagination without rewriting the query', () => {
  const f = fixture(); const { worker, batch } = searchSession(f);
  f.ui.state.tag = 'CET4'; f.ui.state.pos = 'n.'; f.ui.state.savedOnly = true;
  f.element('search').value = 'ab';
  f.ui.loadMore(); const stale = batch(50);
  for (const sort of ['rank', 'senses', 'alpha-desc', 'alpha']) {
    f.element('sort-order').value = sort; f.element('sort-order').onchange();
    const message = worker.messages.at(-1);
    assert.equal(message.sort, sort); assert.equal(message.offset, 0);
    assert.equal(message.query, 'ab'); assert.equal(message.tag, 'CET4'); assert.equal(message.pos, 'n.');
    assert.deepEqual([...message.bookmarks], []);
  }
  worker.reply(stale); assert.equal(f.element('word-list').rows.length, 50);
});

test('scrolling up from a deep page prepends context without moving existing rows or invalidating detail; keyboard selects the adjacent word', async () => {
  const f = fixture(); const { worker, batch } = searchSession(f, 25006);
  f.element('page-input').value = '100'; f.element('page-go').onclick(); worker.reply(batch(4950));
  await Promise.resolve();
  const list = f.element('word-list'); list.scrollHeight = 2600; list.clientHeight = 400;
  const first = list.rows[0], selection = f.ui.state.selectionId;
  list.dispatch('wheel', { deltaY: -100 });
  assert.equal(worker.messages.at(-1).offset, 4900);
  const count = worker.messages.length; list.dispatch('wheel', { deltaY: -100 }); assert.equal(worker.messages.length, count);
  worker.reply(batch(4900));
  assert.equal(f.ui.state.selectionId, selection);
  assert.equal(list.rows[50], first); assert.equal(list.scrollTop, 2600);
  assert.equal(f.element('page-input').value, '100');
  f.ui.loadMore(); assert.equal(worker.messages.at(-1).offset, 5000); worker.reply(batch(5000));
  await f.ui.selectWord('word4900'); f.ui.navigate(-1);
  assert.equal(worker.messages.at(-1).offset, 4850);
  worker.reply(batch(4850)); await Promise.resolve();
  assert.equal(f.ui.state.selectedKey, 'word4899');
  assert.equal(list.rows.length, 200);
});

const typographyKey = 'open_lexicon_typography';
test('shipped typography entry has readable Chinese labels and one accessible native dialog', async () => {
  const html = await fs.readFile(new URL('../app/static/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="typography-btn"[^>]*aria-label="阅读排版"[^>]*aria-controls="typography-panel"/);
  assert.match(html, /<span>排版<\/span>/);
  assert.match(html, /<dialog id="typography-panel" class="typography-popover" aria-labelledby="typography-title">/);
  assert.match(html, /id="lang-bilingual" class="lang-pill" aria-pressed="true" title="中英双语对照">中英双语<\/button>/);
  assert.match(html, /id="lang-en" class="lang-pill" aria-pressed="false" title="纯英文沉浸阅读">English<\/button>/);
  const firstFieldset = html.slice(html.indexOf('<dialog id="typography-panel"')).match(/<fieldset>([\s\S]*?)<\/fieldset>/)[1];
  assert.match(firstFieldset, /^<legend>语言显示模式<\/legend><div id="typography-langs" class="typography-segments" role="group" aria-label="语言显示模式"><\/div>$/);
  for (const id of ['typography-btn', 'typography-panel', 'typography-title', 'typography-close', 'typography-handle', 'typography-reset', 'typography-langs']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
});

function typographyOption(f, id, value) {
  const button = f.element(id).querySelectorAll('button').find(button => button.dataset.value === value);
  assert.ok(button, `${id}: ${value}`);
  f.element(id).onclick({ target: button });
  return button;
}
function typographySnapshot(f) {
  const root = f.element('html');
  return { scale: Number(root.style['--font-scale']), font: root.dataset.readingFont, density: root.dataset.readingDensity, paper: root.dataset.readingPaper };
}

test('typography defaults initialize all controls without storage writes or haptics', () => {
  const f = fixture();
  assert.deepEqual(typographySnapshot(f), { scale: 1, font: 'sans', density: 'normal', paper: 'white' });
  assert.equal(f.element('html').style['--reading-line-height'], '1.65');
  assert.equal(f.element('html').style['--reading-padding-scale'], '1');
  assert.equal(f.element('typography-scale').textContent, '100% · 标准');
  assert.equal(f.storage.has(typographyKey), false); assert.deepEqual(f.vibrations, []);
  for (const id of ['typography-fonts', 'typography-densities', 'typography-papers']) {
    assert.equal(f.element(id).querySelectorAll('button').filter(b => b.getAttribute('aria-pressed') === 'true').length, 1);
  }
});

test('A− and A+ visit all five exact scales, announce labels and stop at both boundaries', () => {
  const f = fixture(); const down = f.element('typography-decrease'), up = f.element('typography-increase');
  down.onclick(); assert.equal(typographySnapshot(f).scale, .95);
  down.onclick(); assert.equal(typographySnapshot(f).scale, .85); assert.equal(down.disabled, true);
  down.onclick(); assert.equal(f.vibrations.length, 2);
  for (const scale of [.95, 1, 1.15, 1.3]) { up.onclick(); assert.equal(typographySnapshot(f).scale, scale); }
  assert.equal(up.disabled, true); assert.equal(down.disabled, false);
  assert.equal(f.element('typography-scale').textContent, '130% · 特大护眼');
  up.onclick(); assert.equal(f.vibrations.length, 6);
  assert.deepEqual(f.vibrations, Array.from({ length: 6 }, () => [8]));
  assert.equal(JSON.parse(f.storage.get(typographyKey)).scale, 1.3);
});

test('all font families select accessibly and persist independently of scale', () => {
  const f = fixture(); f.element('typography-increase').onclick();
  for (const font of ['serif', 'mono', 'legible', 'sans']) {
    const selected = typographyOption(f, 'typography-fonts', font);
    assert.equal(typographySnapshot(f).font, font); assert.equal(typographySnapshot(f).scale, 1.15);
    assert.equal(selected.getAttribute('aria-pressed'), 'true');
    assert.equal(JSON.parse(f.storage.get(typographyKey)).font, font);
    assert.equal(f.element('typography-fonts').querySelectorAll('button').filter(b => b.getAttribute('aria-pressed') === 'true').length, 1);
  }
  const count = f.vibrations.length; typographyOption(f, 'typography-fonts', 'sans'); assert.equal(f.vibrations.length, count);
});

test('density controls drive exact leading and padding, with one 8ms feedback per change', () => {
  const f = fixture();
  for (const [density, leading, padding] of [['compact', '1.45', '0.8'], ['spacious', '1.85', '1.25'], ['normal', '1.65', '1']]) {
    typographyOption(f, 'typography-densities', density);
    assert.equal(f.element('html').style['--reading-line-height'], leading);
    assert.equal(f.element('html').style['--reading-padding-scale'], padding);
  }
  assert.deepEqual(f.vibrations, [[8], [8], [8]]);
});

test('all paper palettes retain the independent shell theme and language preference', () => {
  const f = fixture(); f.element('theme').onclick(); f.element('lang-en').onclick();
  for (const paper of ['sepia', 'grey', 'night', 'white']) {
    const selected = typographyOption(f, 'typography-papers', paper);
    assert.equal(f.element('html').dataset.readingPaper, paper);
    assert.equal(selected.getAttribute('aria-pressed'), 'true');
    assert.equal(f.element('html').dataset.theme, 'dark');
    assert.equal(f.document.body.classList.contains('lang-en-only'), true);
    assert.equal(JSON.parse(f.storage.get(typographyKey)).paper, paper);
  }
});

test('a fresh page session restores every setting and reset persists all defaults without touching other preferences', () => {
  const first = fixture();
  first.element('typography-increase').onclick(); typographyOption(first, 'typography-fonts', 'serif');
  typographyOption(first, 'typography-densities', 'spacious'); typographyOption(first, 'typography-papers', 'sepia');
  first.element('lang-en').onclick(); first.element('theme').onclick();
  const f = fixture(false, [...first.storage]);
  assert.deepEqual(typographySnapshot(f), { scale: 1.15, font: 'serif', density: 'spacious', paper: 'sepia' });
  assert.deepEqual(f.vibrations, []);
  f.element('typography-reset').onclick();
  assert.equal(f.document.body.classList.contains('lang-en-only'), true);
  assert.equal(f.element('lang-en').getAttribute('aria-pressed'), 'true');
  for (const button of f.element('typography-langs').querySelectorAll('button')) {
    assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.value === 'en'));
  }
  assert.deepEqual(JSON.parse(f.storage.get(typographyKey)), { scale: 1, font: 'sans', density: 'normal', paper: 'white' });
  assert.deepEqual(typographySnapshot(fixture(false, [...f.storage])), typographySnapshot(f));
  assert.equal(f.storage.get('open_lexicon_lang_mode'), '"en"'); assert.equal(f.storage.get('open_lexicon_theme'), '"dark"');
});

test('malformed or hostile typography storage falls back per field and cannot inject CSS', () => {
  for (const stored of ['{broken', 'null', '[]', '42', '"serif"', '{"scale":999,"font":"__proto__","density":"constructor","paper":"toString"}']) {
    const f = fixture(false, [[typographyKey, stored]]);
    assert.deepEqual(typographySnapshot(f), { scale: 1, font: 'sans', density: 'normal', paper: 'white' });
  }
  const f = fixture(false, [[typographyKey, JSON.stringify({ scale: .95, font: 'serif', density: 'broken', paper: 'url(bad)' })]]);
  assert.deepEqual(typographySnapshot(f), { scale: .95, font: 'serif', density: 'normal', paper: 'white' });
});

test('blocked storage and vibration retain live typography controls and show the existing storage notice', () => {
  const f = fixture();
  f.context.localStorage.setItem = () => { throw new Error('denied'); };
  f.context.navigator.vibrate = () => { throw new Error('unsupported'); };
  assert.doesNotThrow(() => typographyOption(f, 'typography-papers', 'night'));
  assert.equal(typographySnapshot(f).paper, 'night');
  assert.match(f.element('toast').textContent, /当前页面/);
  f.context.navigator.vibrate = undefined;
  assert.doesNotThrow(() => f.element('typography-increase').onclick());
});

test('typography popover springs open, reverses dismissal from its live position and restores trigger focus', () => {
  const f = fixture(); const panel = f.element('typography-panel'), trigger = f.element('typography-btn');
  trigger.onclick(); f.advance(1200);
  assert.equal(panel.open, true); assert.equal(panel.style.opacity, '1');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  f.element('typography-close').onclick(); f.advance(64);
  const position = panel.style.transform; assert.equal(panel.open, true);
  trigger.onclick(); assert.equal(panel.style.transform, position);
  f.advance(1200); assert.equal(panel.style.opacity, '1');
  f.element('typography-close').onclick(); f.advance(1200);
  assert.equal(panel.open, false); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(f.document.activeElement, trigger);
});

test('typography Esc and double-click handle dismiss, while clicks inside or drags outside do not', () => {
  const f = fixture(); const panel = f.element('typography-panel'), trigger = f.element('typography-btn');
  trigger.onclick(); f.advance(1200);
  panel.dispatch('pointerdown', { clientX: 900, clientY: 50 });
  panel.dispatch('click', { clientX: 10, clientY: 50 }); f.advance(1200); assert.equal(panel.open, true);
  panel.dispatch('pointerdown', { clientX: 900, clientY: 50 });
  panel.dispatch('click', { clientX: 900, clientY: 50 }); f.advance(1200); assert.equal(panel.open, true);
  const canceled = panel.dispatch('cancel'); assert.equal(canceled.defaultPrevented, true);
  f.advance(1200); assert.equal(panel.open, false);
  trigger.onclick(); f.advance(1200); f.element('typography-handle').dispatch('click'); assert.equal(panel.open, true);
  f.element('typography-handle').dispatch('dblclick'); f.advance(1200); assert.equal(panel.open, false);
  trigger.onclick(); f.advance(1200);
  panel.dispatch('pointerdown', { clientX: 10, clientY: 50 });
  panel.dispatch('click', { clientX: 10, clientY: 50 }); f.advance(1200); assert.equal(panel.open, false);
});

test('open typography suppresses dictionary shortcuts and preserves the active result page', () => {
  const f = fixture(); const { worker, batch } = searchSession(f);
  f.element('page-input').value = '25'; f.element('page-go').onclick(); worker.reply(batch(1200));
  const before = JSON.stringify(f.ui.state); const messages = worker.messages.length;
  f.element('typography-btn').onclick(); f.advance(1200);
  for (const key of ['/', 'ArrowDown', 'ArrowUp', 'Escape', 'Enter']) f.context.window.dispatch('keydown', { key });
  typographyOption(f, 'typography-fonts', 'mono'); typographyOption(f, 'typography-papers', 'sepia');
  f.element('typography-increase').onclick(); typographyOption(f, 'typography-densities', 'compact');
  assert.equal(JSON.stringify(f.ui.state), before); assert.equal(worker.messages.length, messages);
  assert.equal(f.element('page-input').value, '25');
});

test('reduced motion typography cross-fades only and a live preference change cancels displacement', () => {
  const f = fixture(true); f.element('typography-btn').onclick();
  assert.equal(f.element('typography-panel').style.transform, 'none');
  assert.ok([...f.animations].every(a => !('transform' in a.keyframes[0])));
  f.advance(160); assert.equal(f.element('typography-panel').style.opacity, '1');
  f.element('typography-close').onclick(); f.advance(160); assert.equal(f.element('typography-panel').open, false);
  const live = fixture(); live.element('typography-btn').onclick(); live.advance(64);
  live.media.matches = true; live.media.dispatch('change');
  assert.equal(live.element('typography-panel').style.transform, 'none');
  live.advance(160); assert.equal(live.element('typography-panel').style.opacity, '1');
});
