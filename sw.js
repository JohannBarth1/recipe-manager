const CACHE = 'erecipe-v1';
const ASSETS = [
  './recipe_book_manager.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js',
];

// Install: cache all core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  // Don't intercept Google API calls or Dropbox API calls — always go to network
  const url = e.request.url;
  if (url.includes('googleapis.com') ||
      url.includes('dropboxapi.com') ||
      url.includes('dropbox.com') ||
      url.includes('accounts.google.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
