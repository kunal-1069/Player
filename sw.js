const CACHE_NAME = 'apple-music-cache-v1';

// We explicitly cache the UI shell
const urlsToCache = [
  '/',
  '/index.html',
  '/auth.html',
  '/css/indexstyle.css',
  '/css/auth-style.css',
  '/css/toast.css',
  '/js/player.js',
  '/js/auth.js',
  '/js/theme.js',
  '/js/toast.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
          console.log('Opened cache');
          return cache.addAll(urlsToCache);
      }).catch(err => console.error("SW cache failed", err))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass API, Audio Streaming, and Upload boundaries
  if (url.pathname.startsWith('/stream') || 
      url.pathname.startsWith('/songs') || 
      url.pathname.startsWith('/auth') || 
      url.pathname.startsWith('/playlists') || 
      url.pathname.startsWith('/uploads')) {
    return; // Fallback entirely to network
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
