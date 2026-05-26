const CACHE = 'erecipe-v2';

const ASSETS = [
  '/recipe-manager/recipe_book_manager.html',
  '/recipe-manager/manifest.json',
  '/recipe-manager/icon-192.png',
  '/recipe-manager/icon-512.png'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', event => {

  const url = event.request.url;

  // Never cache API/auth requests
  if (
    url.includes('googleapis.com') ||
    url.includes('dropboxapi.com') ||
    url.includes('dropbox.com') ||
    url.includes('accounts.google.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
