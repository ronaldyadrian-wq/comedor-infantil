/* Service Worker — Comedor Infantil
 * Permite instalar la app y abrirla sin conexión.
 * Estrategia:
 *  - Documento HTML: network-first (para recibir actualizaciones), con respaldo a caché.
 *  - Recursos GET: cache-first con actualización en segundo plano.
 *  - Nunca intercepta POST ni llamadas al backend de Google Apps Script.
 */

const CACHE_VERSION = 'comedor-v1';
const APP_SHELL = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo gestionamos peticiones GET. Los POST (asistencia/anotaciones) van directo a la red.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No cachear las llamadas al backend (catálogo, validación, ping): siempre red.
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('script.googleusercontent.com') !== -1) {
    return;
  }

  // Documento HTML: intentar red primero, caer a caché si no hay internet.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('index.html')))
    );
    return;
  }

  // Otros recursos (fuentes, iconos, librerías): caché primero, luego red.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
