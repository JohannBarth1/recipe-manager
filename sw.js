const CACHE = 'erecipe-v2';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('googleapis.com') ||
      url.includes('dropboxapi.com') ||
      url.includes('dropbox.com/oauth') ||
      url.includes('accounts.google.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
      .catch(() => caches.match('./index.html'))
  );
});

// ── Timer scheduling ─────────────────────────────────────────────
const scheduledTimers = new Map();

self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_TIMER') {
    const { id, label, delay } = e.data;

    // Clear any existing scheduled timer with this id (e.g. after reset)
    if (scheduledTimers.has(id)) {
      clearTimeout(scheduledTimers.get(id));
    }

    const handle = setTimeout(() => {
      self.registration.showNotification('⏱ Timer done!', {
        body:               label + ' is up.',
        icon:               'icon-192.png',
        requireInteraction: true,
        tag:                'timer-' + id
      });
      scheduledTimers.delete(id);
    }, delay);

    scheduledTimers.set(id, handle);
  }

  if (e.data?.type === 'CANCEL_TIMER') {
    const { id } = e.data;
    if (scheduledTimers.has(id)) {
      clearTimeout(scheduledTimers.get(id));
      scheduledTimers.delete(id);
    }
  }
});
