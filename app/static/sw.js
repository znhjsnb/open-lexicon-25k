// Refresh the shell for the independent typography controls and reading styles.
const SHELL_CACHE = 'open-lexicon-shell-v4.3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './worker.js', './db.js', './data.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('open-lexicon-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Shards belong solely to IndexedDB, avoiding duplicate storage.
  if (url.pathname.includes('/data/')) return;
  const known = SHELL.some(path => new URL(path, self.registration.scope).pathname === url.pathname);
  if (!known && event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match(new URL('./index.html', self.registration.scope)) : null) || Response.error()));
});
