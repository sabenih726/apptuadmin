// service-worker.js
console.log('🔧 Service Worker loading...');

// ========================================
// CONFIGURATION
// ========================================
const VERSION = '1.0.0';
const CACHE_NAME = `attendance-app-v${VERSION}`;
const RUNTIME_CACHE = `attendance-runtime-v${VERSION}`;

// ========================================
// FILES TO PRECACHE
// ========================================
// service-worker.js
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
  
  // ✅ Icons - PATH YANG BENAR!
  '/assets/icons/favicon-16x16.png',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
 
  // Fallback offline page
  '/offline.html'
];

// ========================================
// EXTERNAL RESOURCES (CDN)
// ========================================
const EXTERNAL_RESOURCES = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap'
];

// ========================================
// INSTALL EVENT
// ========================================
self.addEventListener('install', (event) => {
  console.log('✅ [SW] Installing Service Worker v' + VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 [SW] Caching app shell');
        
        // Cache files one by one to avoid failures
        return Promise.allSettled(
          PRECACHE_URLS.map(url => {
            return cache.add(url).catch(error => {
              console.warn(`⚠️ [SW] Failed to cache: ${url}`, error);
              return null;
            });
          })
        );
      })
      .then(() => {
        console.log('✅ [SW] App shell cached');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ [SW] Install failed:', error);
      })
  );
});

// ========================================
// ACTIVATE EVENT
// ========================================
self.addEventListener('activate', (event) => {
  console.log('🔄 [SW] Activating Service Worker v' + VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Delete old caches
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('🗑️ [SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ [SW] Old caches cleaned');
        return self.clients.claim();
      })
      .then(() => {
        console.log('✅ [SW] Service Worker activated');
      })
  );
});

// ========================================
// FETCH EVENT - SMART CACHING STRATEGY
// ========================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // ========================================
  // STRATEGY 1: External Resources (CDN)
  // ========================================
  if (url.origin !== location.origin) {
    event.respondWith(
      // Network first, fallback to cache
      fetch(request)
        .then(response => {
          // Clone and cache successful responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone))
              .catch(err => console.warn('[SW] Cache put failed:', err));
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
            .then(cached => {
              if (cached) {
                console.log('📦 [SW] Serving from cache:', url.pathname);
                return cached;
              }
              // Return offline response for failed external resources
              return new Response('External resource unavailable', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }
  
  // ========================================
  // STRATEGY 2: API Requests (Firebase)
  // ========================================
  if (url.pathname.includes('firestore.googleapis.com') || 
      url.pathname.includes('firebase')) {
    event.respondWith(
      // Network only for API requests
      fetch(request)
        .catch(error => {
          console.error('[SW] Firebase request failed:', error);
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // ========================================
  // STRATEGY 3: Same-Origin Resources
  // ========================================
  event.respondWith(
    // Cache first, fallback to network
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log('📦 [SW] Cache hit:', url.pathname);
          
          // Update cache in background (stale-while-revalidate)
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, networkResponse))
                  .catch(err => console.warn('[SW] Background update failed:', err));
              }
            })
            .catch(() => {});
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('🌐 [SW] Network fetch:', url.pathname);
        return fetch(request)
          .then(networkResponse => {
            // Cache successful responses
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              
              caches.open(RUNTIME_CACHE)
                .then(cache => cache.put(request, responseClone))
                .catch(err => console.warn('[SW] Runtime cache failed:', err));
            }
            
            return networkResponse;
          })
          .catch(error => {
            console.error('[SW] Fetch failed:', error);
            
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline.html')
                .then(offline => {
                  if (offline) return offline;
                  
                  // Fallback offline response
                  return new Response(
                    '<h1>Offline</h1><p>You are currently offline. Please check your internet connection.</p>',
                    {
                      headers: { 'Content-Type': 'text/html' }
                    }
                  );
                });
            }
            
            // For other requests, return error
            return new Response('Network error', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// ========================================
// BACKGROUND SYNC (Future Feature)
// ========================================
self.addEventListener('sync', (event) => {
  console.log('🔄 [SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendanceData());
  }
});

async function syncAttendanceData() {
  try {
    console.log('🔄 [SW] Syncing attendance data...');
    
    // Get pending attendance from IndexedDB
    // Send to server
    // Clear local queue
    
    console.log('✅ [SW] Attendance sync completed');
  } catch (error) {
    console.error('❌ [SW] Sync failed:', error);
    throw error; // Retry sync later
  }
}

// ========================================
// PUSH NOTIFICATIONS (Future Feature)
// ========================================
self.addEventListener('push', (event) => {
  console.log('🔔 [SW] Push notification received');
  
  const data = event.data ? event.data.json() : {
    title: 'Notification',
    body: 'You have a new notification'
  };
  
  const options = {
    body: data.body || 'New update available',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.id || 1,
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'ApptU Admin', options)
  );
});

// ========================================
// NOTIFICATION CLICK
// ========================================
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 [SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'open') {
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // If app is already open, focus it
          for (const client of clientList) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Otherwise open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// ========================================
// MESSAGE FROM CLIENTS
// ========================================
self.addEventListener('message', (event) => {
  console.log('💬 [SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => Promise.all(cacheNames.map(name => caches.delete(name))))
        .then(() => {
          console.log('✅ [SW] All caches cleared');
          event.ports[0].postMessage({ success: true });
        })
    );
  }
});

// ========================================
// READY
// ========================================
console.log('✅ [SW] Service Worker v' + VERSION + ' loaded successfully');
