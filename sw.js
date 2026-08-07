// sw.js — Productos de la Costa (versión optimizada sin Babel)
const CACHE_NAME = 'pdc-v2-compiled';
const TILES_CACHE = 'pdc-tiles-v1';
const TILE_HOST = 'tile.openstreetmap.org';

const SHELL_URLS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  // Archivos compilados (NUEVOS)
  './compiled/firebase-init.js',
  './compiled/app-core.js',
  './compiled/auth.js',
  './compiled/dashboard.js',
  './compiled/productos.js',
  './compiled/clientes.js',
  './compiled/pedidos.js',
  './compiled/creditos.js',
  './compiled/ruta.js',
  './compiled/config.js',
  './compiled/app.js',
  './compiled/rutas-repartidores.js',
  './compiled/inventario.js',
  './compiled/reportes.js',
  './compiled/gerencia.js',
  './compiled/permisos.js',
  // Librerías CDN
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-app-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-auth-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-app-check-compat.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.allSettled(SHELL_URLS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== TILES_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.url.includes('firestore.googleapis.com') ||
      request.url.includes('identitytoolkit.googleapis.com') ||
      request.url.includes('securetoken.googleapis.com')) {
    return;
  }

  if (request.url.includes(TILE_HOST)) {
    event.respondWith(
      caches.open(TILES_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      }).catch(() =>
        caches.match(request).then(cached => cached || caches.match('./offline.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
})