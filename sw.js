// sw.js — DistribuPanel Service Worker
// Cachea el "app shell" (HTML + librerías CDN) para que la app cargue sin internet.
// Los DATOS (productos, clientes, etc.) los maneja Firestore con enablePersistence()
// en el propio HTML — este SW no toca esos datos.

const CACHE_NAME = 'distribupanel-shell-v22'; // ⬆️ v22: offline.html e íconos reales agregados (antes referenciados pero ausentes); maskable regenerado a 512x512 con zona segura; offline.html usa la marca/paleta real
// Cache aparte para tiles de mapa offline: a propósito NO se borra cuando
// sube la versión del shell (ver 'activate' más abajo) — si viviera en
// CACHE_NAME, cada actualización de la app borraría el mapa descargado.
const TILES_CACHE = 'distribupanel-tiles-v1';
const TILE_HOST = 'tile.openstreetmap.org';

// Ajusta la ruta de tu HTML principal si tu index no se llama exactamente así.
const SHELL_URLS = [
  './',
  './index.html',
  './firebase-init.js',
  './offline.html',
  './app-core.js',
  './auth.js',
  './dashboard.js',
  './productos.js',
  './clientes.js',
  './pedidos.js',
  './creditos.js',
  './ruta.js',
  './config.js',
  './app.js',
  './rutas-repartidores.js',
  './inventario.js',
  './reportes.js',
  './gerencia.js',
  './permisos.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-app-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-auth-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.13.0/firebase-app-check-compat.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// --- Instalación: precachea el shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla si UNA sola url falla; usamos allSettled para ser tolerantes
      return Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// --- Activación: limpia caches viejos (nunca el de tiles de mapa) ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== TILES_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch: network-first para navegación (HTML), cache-first para el resto ---
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // La Cache API solo soporta requests GET; deja pasar cualquier otro método sin tocar
  if (request.method !== 'GET') return;

  // No interceptar llamadas a Firestore/Auth (dejar que Firebase maneje su propio offline)
  if (
    request.url.includes('firestore.googleapis.com') ||
    request.url.includes('identitytoolkit.googleapis.com') ||
    request.url.includes('securetoken.googleapis.com')
  ) {
    return; // deja pasar sin interceptar
  }

  // Tiles de mapa (OpenStreetMap): cache-first puro, sin red si ya están
  // descargadas — esto es lo que hace que el mapa funcione sin conexión
  // dentro de la zona que se haya descargado desde la pestaña Mapa.
  if (request.url.includes(TILE_HOST)) {
    event.respondWith(
      caches.open(TILES_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Navegación (cargar la página principal)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // Assets estáticos (JS de CDN, etc.): cache-first, con actualización en segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
