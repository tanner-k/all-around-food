// All Around Food — minimal, safe service worker.
// Strategy:
//   - Navigations (HTML): network-first, fall back to cache, then offline shell.
//   - Static same-origin GET assets: cache-first, populate cache on miss.
//   - Everything else (non-GET, cross-origin): pass through to the network.
// A versioned cache name plus an activate cleanup keeps stale assets from lingering.

const CACHE_VERSION = "aaf-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Minimal app shell to pre-cache on install.
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // Never let a failed precache block installation.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; leave POST/PUT/etc. to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // Navigations (page loads): network-first so we never serve stale HTML.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/");
        }),
    );
    return;
  }

  // Static same-origin assets: cache-first, then network (and populate cache).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful, basic (same-origin) responses.
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    }),
  );
});
