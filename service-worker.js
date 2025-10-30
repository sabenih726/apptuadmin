// service-worker.js
console.log('🔧 Service Worker loading...');

const VERSION = '1.0.1';  // ← Increment version untuk force update
const CACHE_NAME = `attendance-app-v${VERSION}`;
const RUNTIME_CACHE = `attendance-runtime-v${VERSION}`;

// ========================================
// FILES TO PRECACHE
// ========================================
const PRECACHE_URLS = [
  // HTML Pages
  '/',
  '/index.html',
  '/login.html',
  '/employee.html',
  '/admin.html',
  '/admin-employees.html',
  
  // JavaScript Files
  '/js/employee-app.js',
  '/js/admin-app.js',
  '/firebase-config.js',
  
  // PWA Files
  '/manifest.json',
  
  // Icons - HANYA yang benar-benar ada!
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// ========================================
// INSTALL EVENT
// ========================================
self.addEventListener('install', (event) => {
  console.log('✅ [SW] Installing v' + VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 [SW] Caching app shell');
        
        return Promise.allSettled(
          PRECACHE_URLS.map(url => {
            return cache.add(url).catch(error => {
              console.warn(`⚠️ Failed to cache: ${url}`);
              return null;
            });
          })
        );
      })
      .then(() => {
        console.log('✅ [SW] Cache complete');
        return self.skipWaiting();
      })
  );
});

// ========================================
// ACTIVATE EVENT
// ========================================
self.addEventListener('activate', (event) => {
  console.log('🔄 [SW] Activating v' + VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('🗑️ [SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ [SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// ========================================
// FETCH EVENT
// ========================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin (CDN)
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // Same-origin: Cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log('📦 [SW] Cache hit:', url.pathname);
          
          // Update cache in background
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, networkResponse))
                  .catch(() => {});
              }
            })
            .catch(() => {});
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('🌐 [SW] Network fetch:', url.pathname);
        return fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE)
                .then(cache => cache.put(request, responseClone))
                .catch(() => {});
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('[SW] Fetch failed:', error);
            
            if (request.mode === 'navigate') {
              return new Response(
                `<!DOCTYPE html>
                <html lang="id">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Offline</title>
                  <style>
                    body {
                      font-family: system-ui;
                      background: linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%);
                      color: white;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      min-height: 100vh;
                      margin: 0;
                      text-align: center;
                      padding: 20px;
                    }
                    .container { max-width: 500px; }
                    h1 { font-size: 4rem; margin: 0; }
                    h2 { font-size: 2rem; margin: 1rem 0; }
                    p { font-size: 1.2rem; opacity: 0.9; margin-bottom: 2rem; }
                    button {
                      background: white;
                      color: #1e3a8a;
                      border: none;
                      padding: 1rem 2rem;
                      font-size: 1rem;
                      font-weight: bold;
                      border-radius: 0.5rem;
                      cursor: pointer;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>📡</h1>
                    <h2>You're Offline</h2>
                    <p>Please check your internet connection and try again.</p>
                    <button onclick="location.reload()">Try Again</button>
                  </div>
                  <script>
                    window.addEventListener('online', () => location.reload());
                  </script>
                </body>
                </html>`,
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// ========================================
// MESSAGE HANDLER
// ========================================
self.addEventListener('message', (event) => {
  console.log('💬 [SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ [SW] Service Worker v' + VERSION + ' loaded');
