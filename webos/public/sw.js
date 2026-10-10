/* ArtCraft WebOS service worker: app-shell cache-first, everything else
   network-first. Version bump invalidates the previous shell. */
const VERSION = 'webos-v2.5.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!/\.(js|css|svg|png|webp|woff2?|json|webmanifest)$/.test(url.pathname) && url.pathname !== '/') return;

  const isShell = url.pathname === '/' || url.pathname.endsWith('index.html');
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return isShell && cached ? cached : fetchPromise;
    })
  );
});
