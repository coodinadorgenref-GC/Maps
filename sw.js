// sw.js — Prospectos & Rutas GC
// Estrategia: cache-first para el shell de la app y para tiles de mapa,
// para que la herramienta funcione sin señal una vez usada al menos una vez
// en la zona donde se necesita.

const CACHE_SHELL = 'rutas-gc-shell-v33';
const CACHE_TILES = 'rutas-gc-tiles-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './nota-venta.js',
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

// Respuesta de reserva cuando no hay caché ni red disponible, para nunca
// resolver el fetch event con `undefined` (eso el navegador lo trata como
// un error de red "misterioso", en vez de un 504 explicable).
function offlineFallbackResponse() {
  return new Response('', { status: 504, statusText: 'Offline y sin caché' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  // favicon.ico no forma parte de los assets del proyecto: no lo
  // interceptamos, se deja pasar directo a la red del navegador.
  if (url.endsWith('/favicon.ico')) return;

  // Datos "en vivo" (lista de cuadros del radar, clima y satélite): siempre directo a la
  // red. Antes caían en cache-first y devolvían la respuesta de la vez
  // anterior, por lo que el radar/pronóstico podían mostrarse desfasados.
  // Sin señal simplemente fallan y la app ya avisa.
  if (/api\.rainviewer\.com|api\.open-meteo\.com|gibs\.earthdata\.nasa\.gov/.test(url)) return;

  // Mapa vectorial (mosaicos, estilos, tipografías) y su librería: directo a la red y a la caché HTTP del
  // navegador. Si pasaran por aquí se guardarían en el shell sin límite y con `cache:'reload'` irían más lentas.
  // Sin señal la app usa el mapa clásico, que sí trae sus mosaicos guardados.
  if (/tiles\.openfreemap\.org|unpkg\.com\/maplibre-gl|realearth\.ssec\.wisc\.edu/.test(url)) return; // RealEarth (satélite y rayos): siempre datos frescos de la red

  if (isTileRequest(url)) {
    // Tiles: cache-first, y se van guardando conforme el usuario navega el mapa
    // con señal, para poder verlos después sin conexión.
    event.respondWith(
      caches.open(CACHE_TILES).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone()).catch(() => {});
              }
              return response;
            })
            .catch(() => cached || offlineFallbackResponse());
        })
      )
    );
    return;
  }

  // Shell y librerías: cache-first con actualización en segundo plano.
  // cache:'reload' obliga a saltarse la caché HTTP del navegador/CDN para
  // esta petición puntual — sin esto, el "fetch de red" de aquí podía
  // recibir una respuesta vieja igual, y la app tardaba mucho más de lo
  // esperado en reflejar cambios nuevos.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request, { cache: 'reload' })
        .then((response) => {
          // Clonamos de inmediato, antes de que nadie más pueda leer el
          // cuerpo de la respuesta — evita el error "Response body is
          // already used" si esta misma respuesta llega a tocarse dos veces.
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || offlineFallbackResponse());
      return cached || network;
    })
  );
});
