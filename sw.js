// sw.js — Prospectos & Rutas GC
// Estrategia: cache-first para el shell de la app y para tiles de mapa,
// para que la herramienta funcione sin señal una vez usada al menos una vez
// en la zona donde se necesita.

const CACHE_SHELL = 'rutas-gc-shell-v3';
const CACHE_TILES = 'rutas-gc-tiles-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './denue-import.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {
      // Si falla el precache (p.ej. sin señal en la primera instalación),
      // no tronar la instalación; se irá cacheando bajo demanda con fetch.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_SHELL && k !== CACHE_TILES)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isTileRequest(url) {
  return /tile\.openstreetmap\.org|tile\.osm\.org|\{s\}\.tile/.test(url);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  if (isTileRequest(url)) {
    // Tiles: cache-first, y se van guardando conforme el usuario navega el mapa
    // con señal, para poder verlos después sin conexión.
    event.respondWith(
      caches.open(CACHE_TILES).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request)
              .then((response) => {
                cache.put(request, response.clone());
                return response;
              })
              .catch(() => cached)
        )
      )
    );
    return;
  }

  // Shell y librerías: cache-first con actualización en segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_SHELL).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
