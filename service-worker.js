// service-worker.js
const CACHE_NAME = "attendance-app-v1";
const FILES_TO_CACHE = [
  "/",
  "/employee.html",
  "/admin.html",
  "/styles/employee.css",
  "/styles/admin.css",
  "/js/employee-app.js",
  "/js/admin-app.js",
  "/firebase-config.js",
  "/manifest.json"
];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", ev => {
  ev.respondWith(
    caches.match(ev.request).then(resp => resp || fetch(ev.request))
  );
});
