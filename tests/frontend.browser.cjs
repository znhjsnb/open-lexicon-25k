// Real Chrome/Chromium acceptance. Requires Playwright only for development.
// Run: node tests/frontend.browser.cjs
// Optional: PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, LEXICON_URL.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../app/static');
const output = path.resolve(__dirname, '../.tmp/browser-results');
const report = { status: 'running', cases: [], consoleErrors: [], pageErrors: [], timings: [] };
let browser;
let server;
async function runCase(name, action) {
  await action();
  report.cases.push({ name, status: 'passed' });
  console.log(`PASS ${name}`);
}
async function openStaticServer() {
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://test');
      const pathname = decodeURIComponent(url.pathname).replace(/^\/demo\//, '/');
      const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const bytes = await fs.readFile(target);
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
      response.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}; charset=utf-8` }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}/`;
}
async function ready(page, word) {
  await page.waitForFunction(() => window.lexiconMetrics?.details.length > 0);
  if (word) {
    await page.waitForFunction(word => document.querySelector('.word-heading')?.textContent === word && document.querySelector('#content').getAttribute('aria-busy') === 'false' && document.querySelector('#word-list').getAttribute('aria-busy') === 'false', word);
  } else {
    await page.waitForFunction(() => document.querySelector('#content').getAttribute('aria-busy') === 'false' && document.querySelector('#word-list').getAttribute('aria-busy') === 'false');
  }
  if (word) assert.equal(await page.locator('.word-heading').textContent(), word);
}
async function find(page, query, word) {
  const count = await page.evaluate(() => window.lexiconMetrics.searches.length);
  await page.locator('#search').fill(query);
  await page.waitForFunction(count => window.lexiconMetrics.searches.length > count && document.querySelector('#word-list').getAttribute('aria-busy') === 'false', count);
  if (word) await page.waitForFunction(word => document.querySelector('.word-heading')?.textContent === word && document.querySelector('#content').getAttribute('aria-busy') === 'false' && window.lexiconMetrics.details.at(-1)?.word === word, word);
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const ownUrl = await openStaticServer();
  const base = process.env.LEXICON_URL || ownUrl;
  const executable = process.env.BROWSER_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : {}) });
  report.browser = browser.version();
  report.base = base;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const network = [];
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', request => network.push(request.url()));

  await runCase('cold startup, real data, no API calls or external CDN', async () => {
    await page.goto(new URL('#available', base).href);
    await page.waitForLoadState('networkidle');
    await ready(page, 'available');
    const metrics = await page.evaluate(() => window.lexiconMetrics);
    assert.equal(metrics.startup.total, 25006);
    assert.equal(metrics.startup.indexFromCache, false);
    assert.equal(await page.locator('.word-row').count(), 50);
    assert.equal(await page.locator('#search').inputValue(), '');
    assert.match(await page.locator('#result-count').textContent(), /25,006/);
    assert.equal(await page.locator('.word-row[aria-selected="true"]').getAttribute('data-word'), 'available');
    assert.ok(!network.some(url => url.includes('/api/')));
    assert.ok(network.every(url => url.startsWith(base)));
    report.coldStartup = metrics.startup;
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  });
  await runCase('compact sidebar, pointer resizing, bounds, keyboard reset and width persistence', async () => {
    const density = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return { width: rect('.sidebar').width, row: rect('.word-row').height, alphabet: rect('#alphabet-bar').height, exams: rect('#filters').height, visibleRows: Math.floor(rect('#word-list').height / rect('.word-row').height) };
    });
    assert.equal(density.width, 340); assert.equal(density.row, 52);
    assert.equal(density.alphabet, 47); assert.ok(density.exams <= 49);
    assert.ok(density.visibleRows >= 10);
    const bars = await page.locator('#alphabet-bar, #sub-prefix-bar, #filters').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth && getComputedStyle(element).overflowX !== 'auto'));
    assert.equal(bars, true);
    assert.equal(await page.locator('[data-letter="z"]').isVisible(), true);
    const handle = page.locator('#resizer');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + 40); await page.mouse.up();
    assert.equal(await handle.getAttribute('aria-valuenow'), '460');
    await page.reload(); await ready(page);
    assert.equal(await page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().width), 460);
    await handle.focus(); await page.keyboard.press('End');
    assert.equal(await handle.getAttribute('aria-valuenow'), '640');
    await page.keyboard.press('Home'); assert.equal(await handle.getAttribute('aria-valuenow'), '240');
    await handle.dblclick(); assert.equal(await handle.getAttribute('aria-valuenow'), '340');
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.locator('.workspace').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 3);
    assert.equal(await page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().width), 340);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await runCase('two-letter prefix jumps are strict and compose with exams', async () => {
    await page.locator('[data-letter="a"]').click();
    await page.locator('[data-prefix="av"]').waitFor();
    await page.locator('[data-prefix="av"]').click();
    await page.waitForFunction(() => window.lexiconMetrics.searches.at(-1)?.prefix === 'av');
    assert.equal(await page.locator('.word-row').count(), 33);
    assert.ok(await page.locator('.word-row').evaluateAll(rows => rows.every(row => row.dataset.word.toLowerCase().startsWith('av'))));
    await page.locator('[data-tag="CET4"]').click();
    await page.waitForFunction(() => window.lexiconMetrics.searches.at(-1)?.tag === 'CET4');
    assert.ok(await page.locator('.word-row').evaluateAll(rows => rows.every(row => row.dataset.word.toLowerCase().startsWith('av'))));
    await page.locator('[data-tag=""]').click();
    await page.locator('[data-prefix=""]').click();
    await page.waitForFunction(() => window.lexiconMetrics.searches.at(-1)?.prefix === '' && window.lexiconMetrics.searches.at(-1)?.letter === 'a');
    await page.locator('[data-letter=""]').click();
    await page.waitForFunction(() => window.lexiconMetrics.searches.at(-1)?.letter === '');
    assert.equal(await page.locator('#sub-prefix-bar').isVisible(), false);
  });
  await runCase('page jumps, sorting and scrolling share one full dictionary without hash filtering', async () => {
    const check = await context.newPage();
    await check.goto(new URL('#available', base).href); await ready(check, 'available');
    const settled = () => check.waitForFunction(() => document.querySelector('#word-list').getAttribute('aria-busy') === 'false' && document.querySelector('#content').getAttribute('aria-busy') === 'false');
    assert.equal(await check.locator('#search').inputValue(), '');
    for (const [value, offset] of [['25', 1200], ['100', 4950], ['501', 25000]]) {
      await check.locator('#page-input').fill(value);
      if (value === '25') await check.locator('#page-input').press('Enter');
      else await check.locator('#page-go').click();
      await check.waitForFunction(offset => window.lexiconMetrics.searches.at(-1)?.offset === offset, offset);
      await settled();
      assert.equal(await check.locator('#page-input').inputValue(), value);
      assert.equal(await check.locator('.word-row').first().getAttribute('aria-posinset'), String(offset + 1));
    }
    assert.equal(await check.locator('.word-row').count(), 6);
    assert.equal(await check.locator('#page-next').isDisabled(), true);
    await check.locator('#page-prev').click(); await settled();
    assert.equal(await check.locator('#page-input').inputValue(), '500');
    await check.locator('#page-next').click(); await settled();
    assert.equal(await check.locator('#page-input').inputValue(), '501');
    for (const sort of ['rank', 'senses', 'alpha-desc', 'alpha']) {
      await check.locator('#sort-order').selectOption(sort);
      await check.waitForFunction(sort => window.lexiconMetrics.searches.at(-1)?.sort === sort && window.lexiconMetrics.searches.at(-1)?.offset === 0, sort);
      await settled();
      assert.equal(await check.locator('#page-input').inputValue(), '1');
      assert.match(await check.locator('#result-count').textContent(), /25,006/);
      if (sort === 'rank') assert.equal(await check.locator('.word-row').first().getAttribute('data-word'), 'available');
    }
    await check.locator('#word-list').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await check.waitForFunction(() => document.querySelectorAll('.word-row').length === 100);
    await check.locator('.word-row').nth(55).evaluate(element => element.scrollIntoView({ block: 'start' }));
    await check.waitForFunction(() => document.querySelector('#page-input').value === '2');
    await check.locator('#word-list').evaluate(element => { element.scrollTop = 0; });
    await check.waitForFunction(() => document.querySelector('#page-input').value === '1');
    await check.goto(new URL('#available', base).href); await ready(check, 'available');
    assert.equal(await check.locator('#search').inputValue(), '');
    await check.locator('#content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const top = await check.locator('.topbar').boundingBox(), toolbar = await check.locator('.content-toolbar').boundingBox();
    assert.ok(toolbar.y >= top.y + top.height - 1);
    await check.screenshot({ path: path.join(output, 'page-jump-sorting.png') });
    await check.close();
  });
  await runCase('English mode hides Chinese learning copy and restores after reload and word changes', async () => {
    await find(page, 'available', 'available');
    await page.locator('#lang-en').click();
    assert.equal(await page.locator('#lang-en').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.sense-heading h3').first().isVisible(), false);
    assert.equal(await page.locator('.example-zh').first().isVisible(), false);
    assert.equal(await page.locator('.definition').first().isVisible(), true);
    assert.equal(await page.locator('.example-en').first().isVisible(), true);
    assert.equal(await page.locator('.lexical-meta-grid').isVisible(), false);
    assert.equal(await page.locator('.sense-phonetic').first().isVisible(), true);
    assert.equal(await page.locator('.sense-meaning-en').first().isVisible(), true);
    for (const section of ['morphology', 'etymology', 'synonyms', 'mnemonic']) {
      assert.equal(await page.locator(`.${section} .deep-copy.en-content`).isVisible(), true);
      assert.equal(await page.locator(`.${section} .deep-copy.zh-content`).first().isVisible(), false);
    }
    assert.doesNotMatch((await page.locator('#detail .sense-learning, #detail .deep-grid').allInnerTexts()).join('\n'), /[\u3400-\u9fff]/);
    assert.ok(await page.locator('.definition').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16));
    await page.screenshot({ path: path.join(output, 'english-mode.png') });
    await page.reload(); await ready(page, 'available');
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('lang-en-only')), true);
    await find(page, 'borrow', 'borrow');
    assert.equal(await page.locator('.example-zh').first().isVisible(), false);
    await page.locator('#lang-bilingual').click();
    assert.equal(await page.locator('.example-zh').first().isVisible(), true);
    assert.equal(await page.locator('.lexical-meta-grid').isVisible(), true);
    for (const section of ['morphology', 'etymology', 'synonyms', 'mnemonic']) assert.equal(await page.locator(`.${section} .deep-copy.en-content`).isVisible(), true);
    await find(page, 'schedule', 'schedule');
    assert.ok(await page.locator('.sense-phonetic .label-zh').count());
    assert.equal(await page.locator('.sense-phonetic .label-zh').first().isVisible(), true);
    await page.locator('#lang-en').click();
    assert.equal(await page.locator('.sense-phonetic .label-en').first().isVisible(), true);
    assert.doesNotMatch((await page.locator('#detail .sense-learning, #detail .deep-grid').allInnerTexts()).join('\n'), /[\u3400-\u9fff]|\/\//);
    await page.locator('#lang-bilingual').click();
  });
  await runCase('exact, prefix, typo and Chinese searches', async () => {
    await find(page, 'abandon', 'abandon');
    assert.equal(await page.locator('.sense-card').count(), 5);
    assert.equal(await page.locator('details').count(), 0);
    assert.equal(await page.locator('.morphology').count(), 1);
    assert.equal(await page.locator('.etymology').count(), 1);
    await find(page, 'availabel', 'available');
    await find(page, 'April', 'April');
    await find(page, '可获得');
    assert.ok((await page.locator('.word-row').count()) > 0);
    await find(page, 'ab');
    assert.equal(await page.locator('.word-row').count(), 50);
  });
  await runCase('Apple materials, optical type and a real scroll edge with flat content', async () => {
    await find(page, 'available', 'available');
    const styles = await page.evaluate(() => {
      const style = selector => getComputedStyle(document.querySelector(selector));
      return {
        optical: style('html').fontOpticalSizing,
        topbarBlur: style('.topbar').backdropFilter,
        toolbarBlur: style('.content-toolbar').backdropFilter,
        headingTracking: parseFloat(style('.word-heading').letterSpacing),
        headingLeading: parseFloat(style('.word-heading').lineHeight) / parseFloat(style('.word-heading').fontSize),
        toolbarBorder: style('.content-toolbar').borderBottomWidth,
      };
    });
    assert.equal(styles.optical, 'auto');
    assert.equal(styles.topbarBlur, 'blur(20px) saturate(1.8)');
    assert.equal(styles.toolbarBlur, styles.topbarBlur);
    assert.ok(styles.headingTracking < 0 && styles.headingLeading >= 1.05 && styles.headingLeading <= 1.1);
    assert.equal(styles.toolbarBorder, '0px');
    await page.locator('#content').evaluate(element => { element.scrollTop = 180; });
    await page.waitForFunction(() => document.querySelector('#content').classList.contains('is-scrolled'));
    assert.equal(await page.locator('#detail [hidden], #detail details').count(), 0);
    await page.screenshot({ path: path.join(output, 'apple-scroll-edge.png') });
    await page.locator('#content').evaluate(element => { element.scrollTop = 0; });
  });
  await runCase('continuous list appends in place, alphabet jumps are strict and all letters can be restored', async () => {
    await find(page, '');
    const firstWord = await page.locator('.word-row').first().getAttribute('data-word');
    await ready(page, firstWord);
    const before = await page.locator('#word-list').evaluate(element => {
      window.__firstResult = element.firstElementChild;
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    await page.waitForFunction(() => document.querySelectorAll('.word-row').length === 100);
    assert.equal(await page.evaluate(() => window.__firstResult === document.querySelector('.word-row')), true);
    assert.equal(await page.locator('#word-list').evaluate(element => element.scrollTop), before);
    assert.match(await page.locator('#list-status').textContent(), /100 \/ 25,006/);
    assert.equal(await page.locator('.word-heading').textContent(), firstWord);
    assert.equal(await page.locator('#previous, #next').count(), 0);
    for (const letter of ['b', 'z']) {
      await page.locator(`[data-letter="${letter}"]`).click();
      await page.waitForFunction(letter => document.querySelector('#word-list').getAttribute('aria-busy') === 'false' && [...document.querySelectorAll('.word-row')].every(row => row.dataset.word.toLowerCase().startsWith(letter)), letter);
      assert.ok(await page.locator('.word-row').count());
      assert.equal(await page.locator('#word-list').evaluate(element => element.scrollTop), 0);
    }
    await page.locator('[data-letter=""]').click();
    await page.waitForFunction(word => document.querySelector('.word-heading')?.textContent === word && document.querySelector('#content').getAttribute('aria-busy') === 'false', firstWord);
    assert.equal(await page.locator('.word-row').count(), 50);
  });
  await runCase('six expanded dimensions, lexical forms and family, complete senses and a pinned speaking identity', async () => {
    await find(page, 'available', 'available');
    assert.equal(await page.locator('#detail .dimension').count(), 6);
    assert.equal(await page.locator('#detail details, #detail [hidden]').count(), 0);
    for (const selector of ['.synonyms', '.mnemonic', '.sense-meaning-en', '.sense-phonetic', '.lexical-meta-grid']) assert.equal(await page.locator(selector).first().isVisible(), true);
    for (const formula of await page.locator('.formula.en-content').all()) assert.equal(await formula.isVisible(), false);
    const type = await page.evaluate(() => {
      const style = selector => getComputedStyle(document.querySelector(selector));
      return { ink: style('body').color, zh: parseFloat(style('.sense-heading h3').fontSize), en: parseFloat(style('.example-en').fontSize), translation: parseFloat(style('.example-zh').fontSize), columns: style('.context-grid').gridTemplateColumns.split(' ').length };
    });
    assert.equal(type.ink, 'rgb(17, 24, 39)');
    assert.equal(type.zh, 17); assert.ok(type.en >= 14 && type.translation >= 13);
    assert.equal(type.columns, 2);
    for (const card of await page.locator('.sense-card').all()) {
      assert.equal(await card.locator('.definition').count(), 1);
      assert.equal(await card.locator('.example-card [data-speak]').count(), 1);
      assert.ok(await card.locator('.collocation').count());
    }
    assert.ok(await page.locator('#sense-2').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight));
    assert.equal(await page.locator('.deep-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
    await page.locator('[data-sense="2"]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'sense-2');
    await page.locator('#content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator('#toolbar-pinned-word').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.toolbar-word-badge strong').textContent(), 'available');
    assert.equal(await page.locator('#toolbar-pinned-word [data-lang="en-GB"]').count(), 1);
    assert.equal(await page.locator('#toolbar-pinned-word [data-lang="en-US"]').count(), 1);
    await page.screenshot({ path: path.join(output, 'six-dimensions-pinned.png') });
    await find(page, 'borrow', 'borrow');
    assert.equal(await page.locator('#content').evaluate(element => element.scrollTop), 0);
    assert.equal(await page.locator('#toolbar-pinned-word').isVisible(), false);
  });
  await runCase('exam, POS, bookmark filters and keyboard navigation', async () => {
    await page.locator('[data-tag="CET4"]').click();
    await find(page, 'borrow', 'borrow');
    assert.ok((await page.locator('.tag-line').textContent()).includes('CET4'));
    await page.locator('#save').click();
    await page.locator('#bookmarks').click();
    await page.waitForFunction(() => document.querySelector('#word-list').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.word-row').count(), 1);
    await page.locator('#bookmarks').click();
    await page.locator('[data-tag=""]').click();
    await find(page, '');
    await page.locator('#pos-filter').selectOption('n.');
    await page.waitForFunction(() => document.querySelector('#word-list').getAttribute('aria-busy') === 'false');
    assert.ok((await page.locator('.row-pos').first().textContent()).includes('n.'));
    await page.locator('#pos-filter').selectOption('');
    await find(page, 'available', 'available');
    await page.locator('#content').focus();
    await page.keyboard.press('/');
    assert.equal(await page.locator('#search').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#word-list').getAttribute('aria-busy') === 'false');
    await page.keyboard.press('ArrowDown');
    await ready(page);
    assert.equal(await page.locator('[aria-selected="true"]').count(), 1);
  });
  await runCase('rapid input keeps the latest selection', async () => {
    await page.evaluate(() => {
      const input = document.querySelector('#search');
      for (const query of ['available', 'abandon', 'borrow']) { input.value = query; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForFunction(() => document.querySelector('.word-heading')?.textContent === 'borrow' && document.querySelector('#content').getAttribute('aria-busy') === 'false');
  });
  await runCase('a delayed old shard cannot overwrite a more recent selection', async () => {
    let release;
    let arrived;
    const gate = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { arrived = resolve; });
    await page.route('**/data/shards/d.json', async route => { arrived(); await gate; await route.continue(); });
    const response = page.waitForResponse('**/data/shards/d.json');
    await page.locator('#search').fill('dog');
    await requested;
    await find(page, 'available', 'available');
    release();
    await response;
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.word-heading').textContent(), 'available');
    await page.unroute('**/data/shards/d.json');
  });
  await runCase('same-letter lookup needs no second shard request', async () => {
    await find(page, 'available', 'available');
    const before = network.filter(url => url.includes('/data/shards/')).length;
    await find(page, 'abandon', 'abandon');
    assert.equal(network.filter(url => url.includes('/data/shards/')).length, before);
    assert.equal((await page.evaluate(() => window.lexiconMetrics.details.at(-1))).source, 'memory');
  });
  await runCase('immersive mode, daily flashcard, saved check-in and dialog Escape', async () => {
    await page.locator('#focus').click();
    assert.equal(await page.locator('.sidebar').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'immersive.png') });
    await page.keyboard.press('Escape');
    await page.locator('#daily').click();
    await page.waitForFunction(() => document.querySelector('#card-word').textContent !== '暂无词条');
    await page.locator('#flashcard').click();
    assert.equal(await page.locator('#flashcard').getAttribute('aria-pressed'), 'true');
    await page.locator('#study-known').click();
    assert.ok(Number(await page.locator('#studied').textContent()) > 0);
    await page.screenshot({ path: path.join(output, 'drawer.png') });
    await page.keyboard.press('Escape');
    await page.locator('#study').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#study').isVisible(), false);
    assert.ok(await page.evaluate(() => Boolean(localStorage.getItem('open_lexicon_progress'))));
  });
  await runCase('speech API wiring and waveform feedback (audible output requires manual check)', async () => {
    await find(page, 'available', 'available');
    await page.evaluate(() => {
      window.__utterances = [];
      speechSynthesis.cancel = () => {};
      speechSynthesis.speak = utterance => window.__utterances.push(utterance.text);
    });
    await page.locator('.word-header [data-speak="available"]').first().click();
    assert.equal(await page.locator('.audio-pill.playing').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__utterances), ['available']);
    await page.locator('.word-header [data-speak="available"]').first().click();
    assert.equal(await page.locator('.audio-pill.playing').count(), 0);
  });
  await runCase('typography scales real reading text, changes density and restores settings across reload', async () => {
    await ready(page, 'available');
    const selectors = ['.word-heading', '.phonetic', '.sense-heading h3', '.definition', '.example-en', '.example-zh', '.formula', '.sense-phonetic', '.sense-meaning-en', '.lexical-meta-copy', '.deep-copy.en-content'];
    const sizes = () => page.evaluate(selectors => selectors.map(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)), selectors);
    const original = await sizes();
    const rowHeight = await page.locator('.word-row').first().evaluate(element => element.getBoundingClientRect().height);
    await page.locator('#typography-btn').click();
    await page.locator('#typography-increase').click(); await page.locator('#typography-increase').click();
    assert.equal(await page.locator('#typography-increase').isDisabled(), true);
    const enlarged = await sizes();
    original.forEach((size, index) => assert.ok(Math.abs(enlarged[index] - size * 1.3) < .05, selectors[index]));
    await page.locator('#typography-fonts [data-value="serif"]').click();
    assert.match(await page.locator('#detail').evaluate(element => getComputedStyle(element).fontFamily), /Georgia/);
    await page.locator('#typography-densities [data-value="compact"]').click();
    const compact = await page.locator('.example-card').first().evaluate(element => parseFloat(getComputedStyle(element).paddingTop));
    await page.locator('#typography-densities [data-value="spacious"]').click();
    const spacious = await page.locator('.example-card').first().evaluate(element => parseFloat(getComputedStyle(element).paddingTop));
    assert.ok(spacious > compact);
    const leading = await page.locator('.definition').first().evaluate(element => { const css = getComputedStyle(element); return parseFloat(css.lineHeight) / parseFloat(css.fontSize); });
    assert.ok(Math.abs(leading - 1.85) < .01);
    await page.locator('#typography-papers [data-value="sepia"]').click();
    await page.keyboard.press('Escape'); await page.locator('#typography-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'typography-btn');
    await page.reload(); await ready(page, 'available');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('open_lexicon_typography'))), { scale: 1.3, font: 'serif', density: 'spacious', paper: 'sepia' });
    assert.equal(await page.locator('.word-row').first().evaluate(element => element.getBoundingClientRect().height), rowHeight);
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme').click();
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      await page.locator('#typography-btn').click();
      for (const [paper, background, ink] of [['sepia', 'rgb(251, 240, 217)', 'rgb(44, 34, 20)'], ['grey', 'rgb(232, 232, 234)', 'rgb(32, 32, 36)'], ['night', 'rgb(0, 0, 0)', 'rgb(237, 237, 240)']]) {
        await page.locator(`#typography-papers [data-value="${paper}"]`).click();
        const colors = await page.locator('#content').evaluate(element => { const css = getComputedStyle(element); return [css.backgroundColor, css.color]; });
        assert.deepEqual(colors, [background, ink]);
        const readingColors = await page.locator('#detail').evaluate(element => {
          const style = selector => getComputedStyle(element.querySelector(selector));
          return { ink: style('.lexical-meta-copy').color, muted: style('.deep-copy.en-content').color, phonetic: style('.sense-phonetic').color, shortMeaning: style('.sense-meaning-en').color };
        });
        assert.equal(readingColors.ink, ink);
        assert.equal(readingColors.phonetic, readingColors.muted);
        assert.equal(readingColors.shortMeaning, readingColors.muted);
      }
      await page.keyboard.press('Escape'); await page.locator('#typography-panel').waitFor({ state: 'hidden' });
    }
    await page.locator('#typography-btn').click(); await page.locator('#typography-reset').click();
    await page.locator('#typography-handle').dblclick(); await page.locator('#typography-panel').waitFor({ state: 'hidden' });
    assert.deepEqual(await sizes(), original);
  });
  await runCase('desktop dark theme and mobile navigation without horizontal overflow', async () => {
    await page.locator('#theme').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: path.join(output, 'dark.png') });
    await page.locator('#theme').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    assert.equal(await page.locator('#resizer').isVisible(), false);
    await page.locator('.word-row').first().click();
    assert.equal(await page.locator('#content').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('.deep-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
    await page.locator('#typography-btn').click();
    await page.locator('#typography-increase').click(); await page.locator('#typography-increase').click();
    const panel = await page.locator('#typography-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= 390 && panel.y + panel.height <= 844);
    assert.ok(await page.locator('#content').evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.locator('#typography-reset').click();
    await page.mouse.click(5, 100); await page.locator('#typography-panel').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    await page.locator('#back').click();
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await runCase('reduced motion, reduced transparency and increased contrast independently', async () => {
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await page.locator('#daily').click();
      await page.waitForFunction(() => document.querySelector('#flashcard').disabled === false);
      assert.equal(await page.locator('#study').evaluate(element => getComputedStyle(element).transform), 'none');
      await page.locator('#flashcard').click();
      assert.equal(await page.locator('.flip-inner').evaluate(element => getComputedStyle(element).transform), 'none');
      await page.keyboard.press('Escape');
      await page.locator('#study').waitFor({ state: 'hidden' });
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.topbar')).backdropFilter === 'none');
      assert.equal(await page.locator('.topbar').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.content-toolbar')).borderBottomWidth === '1px');
      assert.equal(await page.locator('.content-toolbar').evaluate(element => getComputedStyle(element).backdropFilter), 'none');
      await page.screenshot({ path: path.join(output, 'apple-increased-contrast.png') });
    } finally {
      await cdp.send('Emulation.setEmulatedMedia', { features: [] });
      await cdp.detach();
    }
  });
  await runCase('full offline preparation, reload, uncached-in-memory letter via IndexedDB', async () => {
    await page.locator('#offline-download').click();
    await page.waitForFunction(() => document.querySelector('#offline-download').textContent.includes('已备齐'), null, { timeout: 120000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    report.beforeOffline = await page.evaluate(() => window.lexiconMetrics);
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    await find(page, 'zebra', 'zebra');
    assert.equal((await page.evaluate(() => window.lexiconMetrics.details.at(-1))).source, 'indexeddb');
    assert.equal((await page.evaluate(() => window.lexiconMetrics.startup)).indexFromCache, true);
    await context.setOffline(false);
  });
  await runCase('relative-path deployment under a GitHub Pages style subdirectory', async () => {
    const nested = await context.newPage();
    await nested.goto(new URL('demo/', ownUrl).href);
    await ready(nested);
    await find(nested, 'borrow', 'borrow');
    await nested.close();
  });
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.timings = await page.evaluate(() => window.lexiconMetrics);
  report.status = 'passed';
})().catch(error => {
  report.status = 'failed';
  report.failure = error.stack;
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
