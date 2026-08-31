const CACHE_NAME = 'studyloop-shell-v6';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/studyloop-logo.png'];
const MIGRATE_LEGACY_CLIENTS = CACHE_NAME === 'studyloop-shell-v6';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // v6 must replace the legacy all-post listener immediately because the
      // matching Firestore rule is now membership-scoped. Later cache versions
      // wait for the in-app "Update now" confirmation instead.
      .then(()=>MIGRATE_LEGACY_CLIENTS?self.skipWaiting():undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('studyloop-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message',(event)=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, event.request.mode === 'navigate' ? { cache: 'no-store' } : undefined)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
