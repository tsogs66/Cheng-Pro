/* Voyage Chief — service worker (offline cache)
 * ts0gs · Marvin C. Endozo
 */
const CACHE = 'noon-report-v169';
const PRECACHE = [
  './voyage_manager.html',
  './eorb.js',
  './ship_time.js',
  './theme.js',
  './license-config.js',
  './license.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/logoBG.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/IBMPlexMono-400-latin-ext.woff2',
  './fonts/IBMPlexMono-400-latin.woff2',
  './fonts/IBMPlexMono-500-latin-ext.woff2',
  './fonts/IBMPlexMono-500-latin.woff2',
  './fonts/IBMPlexMono-600-latin-ext.woff2',
  './fonts/IBMPlexMono-600-latin.woff2',
  './fonts/Inter-400-latin-ext.woff2',
  './fonts/Inter-400-latin.woff2',
  './fonts/Inter-500-latin-ext.woff2',
  './fonts/Inter-500-latin.woff2',
  './fonts/Inter-600-latin-ext.woff2',
  './fonts/Inter-600-latin.woff2',
  './fonts/Oswald-500-latin-ext.woff2',
  './fonts/Oswald-500-latin.woff2',
  './fonts/Oswald-600-latin-ext.woff2',
  './fonts/Oswald-600-latin.woff2',
  './fonts/Oswald-700-latin-ext.woff2',
  './fonts/Oswald-700-latin.woff2',
  './fonts/fonts.css'
];

async function notifyClients(message){
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => {
    try{ client.postMessage(message); }catch(_){}
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const total = PRECACHE.length;
      let done = 0;
      await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'start', done: 0, total, pct: 0 });
      for (const url of PRECACHE) {
        try {
          await cache.add(url);
        } catch (_) {
          /* optional assets (icons) should not block install */
        }
        done += 1;
        const pct = Math.round((done / total) * 100);
        await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'file', url, done, total, pct });
      }
      await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'done', done: total, total, pct: 100 });
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* Never cache sync API — always hit the network (or fail offline). */
  if (url.pathname.includes('/api/')) return;

  const dest = request.destination;
  const isAppCode = request.mode === 'navigate' || dest === 'document' || dest === 'script'
    || /\/(voyage_manager\.html|ship_time\.js|eorb\.js|sw\.js)$/.test(url.pathname);
  const matchCached = () => caches.match(request).then((hit) => {
    if (hit) return hit;
    /* Versioned script URLs (?v=) still hit the precache path. */
    if (url.search) return caches.match(url.origin + url.pathname);
    return undefined;
  });

  /* HTML/JS network-first when online so a new page never pairs with a stale ship_time.js.
     Cache-first for the rest (icons, manifest) and for offline. */
  if (isAppCode) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => matchCached())
    );
    return;
  }

  event.respondWith(
    matchCached().then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'GET_CACHE_NAME' && event.source) {
    try{ event.source.postMessage({ type: 'CACHE_NAME', cache: CACHE, precache: PRECACHE }); }catch(_){}
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'noon-report-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'SYNC_REQUESTED' }));
      })
    );
  }
});
