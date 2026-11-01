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
  await page.waitForFunction(() => document.querySelector('#content').getAttribute('aria-busy') === 'false');
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const network = [];
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', request => network.push(request.url()));

  await runCase('cold startup, real data, no API calls or external CDN', async () => {
    await page.goto(base);
    await page.waitForLoadState('networkidle');
    await ready(page, 'available');
    const metrics = await page.evaluate(() => window.lexiconMetrics);
    assert.equal(metrics.startup.total, 25006);
    assert.equal(metrics.startup.indexFromCache, false);
    assert.equal(await page.locator('.word-row').count(), 50);
    assert.ok(!network.some(url => url.includes('/api/')));
    assert.ok(network.every(url => url.startsWith(base)));
    report.coldStartup = metrics.startup;
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
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
    await page.locator('[data-speak="available"]').first().click();
    assert.equal(await page.locator('.audio-pill.playing').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__utterances), ['available']);
    await page.locator('[data-speak="available"]').first().click();
    assert.equal(await page.locator('.audio-pill.playing').count(), 0);
  });
  await runCase('desktop dark theme and mobile navigation without horizontal overflow', async () => {
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: path.join(output, 'dark.png') });
    await page.locator('#theme').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    await page.locator('.word-row').first().click();
    assert.equal(await page.locator('#content').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    await page.locator('#back').click();
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
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
