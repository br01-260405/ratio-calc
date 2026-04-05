const CACHE_NAME = 'ratio-app-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-While-Revalidate: serve from cache immediately, update in background
self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests for app assets
  const url = new URL(event.request.url);
  const isAsset = ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/'))) ||
                  url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (event.request.method !== 'GET' || !isAsset) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    )
  );
});
