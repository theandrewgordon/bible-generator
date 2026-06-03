const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `faithsparks-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/static/theme.css',
  '/static/darkmode.js',
  '/static/favicon.ico',
  '/static/faith_sparks_logo_192.png',
  '/static/faith_sparks_logo_512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('faithsparks-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  if (request.mode === 'navigate') {
    return;
  }

  const cacheableExact = new Set([
    '/favicon.ico',
    '/manifest.webmanifest'
  ]);
  const cacheableStaticAsset = url.pathname.startsWith('/static/');

  if (!cacheableStaticAsset && !cacheableExact.has(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
