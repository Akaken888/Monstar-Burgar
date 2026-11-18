/**
 * sw.js — Service Worker
 * Monstar Burgers Order Manager
 * Strategi: Cache First untuk shell app.
 */

const CACHE_NAME = 'mb-v2';
const SHELL_FILES = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/auth.js',
  './js/menu.js',
  './js/orders.js',
  './js/payments.js',
  './js/queue.js',
  './js/reports.js',
  './js/utils.js',
  './js/ui.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Install: cache semua shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES).catch((err) => {
        console.warn('[SW] Gagal cache beberapa file:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Cache First, fallback network
self.addEventListener('fetch', (event) => {
  // Hanya handle GET request
  if (event.request.method !== 'GET') return;

  // Jangan cache-intercept request ke luar origin
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Jangan cache response error
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback: kembalikan index.html jika ada
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
