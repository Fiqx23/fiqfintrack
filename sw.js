const CACHE_VERSION = 'v2.4';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
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
