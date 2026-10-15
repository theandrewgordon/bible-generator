// Faith Sparks service worker.
// - Never caches pages (HTML), so nobody sees stale or someone else's content.
// - Caches a short list of static files (site CSS/JS, icons, avatar sheet),
//   capped, under a name tied to the deploy so old copies clear automatically.
// - Shows a small offline page when a page can't load at all.
const CACHE_VERSION = '__STATIC_VERSION__';
const CACHE_NAME = `faithsparks-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';
const MAX_ENTRIES = 60;
const PRECACHE_URLS = [
  OFFLINE_URL,
  `/static/theme.css?v=${CACHE_VERSION}`,
  `/static/darkmode.js?v=${CACHE_VERSION}`,
  '/static/faith_sparks_logo_192.png'
];
const CACHEABLE_EXT = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2)$/i;
const SKIP_PREFIXES = ['/static/tutorials/', '/static/CopyworkStock/', '/static/worship/', '/static/uploads/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('faithsparks-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i += 1) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    // Pages always come from the network; only a total failure shows the offline page.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const cacheable = url.pathname.startsWith('/static/')
    && CACHEABLE_EXT.test(url.pathname)
    && !SKIP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response && response.status === 200) {
          cache.put(request, response.clone()).then(() => trim(cache));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
