const CACHE_VERSION = 'v2.5';
const SHELL_CACHE = `fintrack-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `fintrack-runtime-${CACHE_VERSION}`;

const APP_SHELL = new URL('./index.html', self.registration.scope).href;
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Cache the remote libraries used during initial rendering. Failures here must
// not prevent the app shell from installing; the normal online load can retry.
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(async (cache) => {
        await cache.addAll(PRECACHE_URLS);

        const runtimeCache = await caches.open(RUNTIME_CACHE);
        await Promise.allSettled(EXTERNAL_ASSETS.map(async (url) => {
          const response = await fetch(url, { mode: 'no-cors' });
          if (response && (response.ok || response.type === 'opaque')) {
            await runtimeCache.put(url, response);
          }
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) =>
          key.startsWith('fintrack-') &&
          key !== SHELL_CACHE &&
          key !== RUNTIME_CACHE
        )
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  // Navigation: prefer the latest online page, but fall back to the cached app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          }

          // An older installed PWA may still open the old ./fintrack.html start URL.
          // If that path returns 404, serve the cached index app shell instead.
          return (await caches.match(APP_SHELL)) || response;
        })
        .catch(async () => {
          return (await caches.match(request)) ||
            (await caches.match(APP_SHELL)) ||
            Response.error();
        })
    );
    return;
  }

  // Cache-first for previously loaded assets, including CDN scripts/styles/fonts.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const cacheName = isSameOrigin ? SHELL_CACHE : RUNTIME_CACHE;
          caches.open(cacheName)
            .then((cache) => cache.put(request, response.clone()))
            .catch(() => {});
        }
        return response;
      }).catch(async () => {
        if (isSameOrigin) {
          return (await caches.match(request)) ||
            (await caches.match(APP_SHELL)) ||
            Response.error();
        }
        return Response.error();
      });
    })
  );
});
