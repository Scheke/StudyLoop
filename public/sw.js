const CACHE_NAME = 'studyloop-shell-v3';
const APP_SHELL = ['/', '/index.html', '/studyloop-logo.png', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html'))));
});
