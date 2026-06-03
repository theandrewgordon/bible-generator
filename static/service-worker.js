const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `faithsparks-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/',
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

  const privatePrefixes = [
    '/admin',
    '/api',
    '/billing',
    '/buy',
    '/coloring',
    '/create_checkout_session',
    '/delete',
    '/delete_bulk',
    '/download',
    '/downloads',
    '/generate',
    '/history',
    '/illustrate',
    '/lesson-pack/download',
    '/lesson-pack/result',
    '/login',
    '/logout',
    '/oauth',
    '/packs',
    '/plus/success',
    '/prints',
    '/regenerate',
    '/stripe',
    '/thumb',
    '/toggle_favorite',
    '/worship'
  ];
  const publicNavigations = new Set(['/', '/about', '/start-here', '/lesson-pack', '/scripture-attribution', '/browse', '/games', '/plus']);

  if (request.method !== 'GET' || privatePrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  if (request.mode === 'navigate') {
    if (!publicNavigations.has(url.pathname)) {
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
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
