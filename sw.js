/* Cache-first service worker for offline study on iPad.
   Bump CACHE_VERSION on deploys that change app code; content md/json use
   stale-while-revalidate so new modules appear without a version bump. */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `ledgerbook-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'styles/tokens.css',
  'styles/screen.css',
  'styles/print.css',
  'app/main.js',
  'app/render.js',
  'app/print.js',
  'app/progress.js',
  'vendor/marked.min.js',
  'vendor/mermaid.min.js',
  'fonts/newsreader-600.woff2',
  'fonts/newsreader-700.woff2',
  'fonts/public-sans-400.woff2',
  'fonts/public-sans-600.woff2',
  'fonts/public-sans-700.woff2',
  'fonts/plex-mono-400.woff2',
  'fonts/plex-mono-600.woff2',
  'icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  const isContent = url.pathname.includes('/content/');

  if (isContent) {
    /* stale-while-revalidate: instant load, silent refresh */
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
    )
  );
});
