/* Voyage Chief — service worker (offline cache)
 * ts0gs · Marvin C. Endozo
 *
 * Boot speed notes:
 * - App HTML/JS use stale-while-revalidate so a warm cache paints immediately
 *   while a fresh copy downloads in the background.
 * - Install precaches a small critical shell first (waitUntil), then fills the
 *   rest of the asset list without blocking activation.
 */
const CACHE = 'noon-report-v259';
const CRITICAL = [
  './voyage_manager.html',
  './ship_time.js',
  './theme.js',
  './license-config.js',
  './license.js',
  './sw.js',
  './manifest.webmanifest',
  './fonts/fonts.css',
  './fonts/Inter-400-latin.woff2',
  './fonts/Oswald-700-latin.woff2',
  './icons/icon-192.png'
];
const PRECACHE = [
  './voyage_manager.html',
  './eorb.js',
  './ship_time.js',
  './theme.js',
  './license-config.js',
  './license.js',
  './save-file.js',
  './camera-capture.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/logoBG.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/IBMPlexMono-400-latin.woff2',
  './fonts/IBMPlexMono-500-latin.woff2',
  './fonts/IBMPlexMono-600-latin.woff2',
  './fonts/Inter-400-latin.woff2',
  './fonts/Inter-500-latin.woff2',
  './fonts/Inter-600-latin.woff2',
  './fonts/Oswald-500-latin.woff2',
  './fonts/Oswald-600-latin.woff2',
  './fonts/Oswald-700-latin.woff2',
  './fonts/fonts.css'
];

async function notifyClients(message){
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => {
    try{ client.postMessage(message); }catch(_){}
  });
}

async function cacheUrls(cache, urls, { notify = true } = {}){
  const total = urls.length;
  let done = 0;
  if (notify) await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'start', done: 0, total, pct: 0 });
  await Promise.all(urls.map(async (url) => {
    try {
      await cache.add(url);
    } catch (_) {
      /* optional assets must not block install */
    }
    done += 1;
    if (notify) {
      const pct = Math.round((done / total) * 100);
      await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'file', url, done, total, pct });
    }
  }));
  if (notify) await notifyClients({ type: 'INSTALL_PROGRESS', phase: 'done', done: total, total, pct: 100 });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cacheUrls(cache, CRITICAL, { notify: true });
      /* Remainder fills in after the critical shell is ready. */
      const rest = PRECACHE.filter((u) => !CRITICAL.includes(u));
      cacheUrls(cache, rest, { notify: false }).catch(() => {});
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

function matchCached(request){
  const url = new URL(request.url);
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    if (url.search) return caches.match(url.origin + url.pathname);
    return undefined;
  });
}

function putInCache(request, response){
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* Never cache sync API — always hit the network (or fail offline). */
  if (url.pathname.includes('/api/')) return;

  const dest = request.destination;
  const isAppCode = request.mode === 'navigate' || dest === 'document' || dest === 'script'
    || /\/(voyage_manager\.html|ship_time\.js|eorb\.js|theme\.js|license(?:-config)?\.js|sw\.js)$/.test(url.pathname);

  /* Stale-while-revalidate for app HTML/JS: paint from cache immediately when
     present, refresh in the background so the next visit is current. */
  if (isAppCode) {
    event.respondWith((async () => {
      const cached = await matchCached(request);
      const networkPromise = fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(() => undefined);
      if (cached) {
        networkPromise.catch(() => {});
        return cached;
      }
      const network = await networkPromise;
      return network || new Response('Offline', { status: 503, statusText: 'Offline' });
    })());
    return;
  }

  event.respondWith(
    matchCached(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          putInCache(request, response);
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
